"""Schedule API — generate daily schedule from tasks."""

from datetime import date, time as dtime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.models import get_session
from backend.models.task import Task, TaskType, TaskPriority, TaskStatus
from backend.models.schedule import TimeSlot
from backend.models.config import UserConfig
from backend.engine.scheduler import TaskItem, schedule_day
from backend.engine.time_utils import parse_time_str
from backend.schemas import (
    ScheduleRequest, ScheduleResponse, SlotData,
    AdjustRequest, AdjustResponse, TaskCreate, TaskResponse, TaskUpdate,
)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _task_to_item(task: Task) -> TaskItem:
    return TaskItem(
        id=task.id,
        title=task.title,
        task_type=task.task_type.value if hasattr(task.task_type, 'value') else task.task_type,
        priority=task.priority.value if hasattr(task.priority, 'value') else task.priority,
        estimated_minutes=task.estimated_minutes,
        time_hint=task.time_hint,
        deadline=task.deadline,
    )


# ── Task CRUD ──

@router.get("/tasks", response_model=List[dict])
def list_tasks(user_id: str = "default", task_type: str = None, db: Session = Depends(get_db)):
    """List tasks, optionally filtered by type."""
    q = db.query(Task).filter(Task.user_id == user_id)
    if task_type:
        q = q.filter(Task.task_type == TaskType(task_type))
    tasks = q.order_by(Task.created_at.desc()).all()
    return [
        {
            "id": t.id, "title": t.title, "task_type": t.task_type.value,
            "priority": t.priority.value, "estimated_minutes": t.estimated_minutes,
            "time_hint": t.time_hint, "deadline": str(t.deadline) if t.deadline else None,
            "status": t.status.value, "goal_id": t.goal_id,
        }
        for t in tasks
    ]


@router.post("/tasks", response_model=dict)
def create_task_endpoint(data: TaskCreate, user_id: str = "default", db: Session = Depends(get_db)):
    """Create a new task."""
    task = Task(
        user_id=user_id,
        title=data.title,
        description=data.description,
        task_type=TaskType(data.task_type),
        priority=TaskPriority(data.priority),
        estimated_minutes=data.estimated_minutes,
        time_hint=data.time_hint,
        deadline=data.deadline,
        goal_id=data.goal_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return {
        "id": task.id, "title": task.title, "task_type": task.task_type.value,
        "priority": task.priority.value, "estimated_minutes": task.estimated_minutes,
        "time_hint": task.time_hint, "status": task.status.value, "goal_id": task.goal_id,
    }


@router.put("/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    """Update task status or fields."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if data.status is not None:
        task.status = TaskStatus(data.status)
    if data.title is not None:
        task.title = data.title
    db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Delete a task and its associated time slots."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    # Remove associated time slots first
    db.query(TimeSlot).filter(TimeSlot.task_id == task_id).delete()
    db.delete(task)
    db.commit()
    return {"ok": True, "deleted_id": task_id}


# ── Schedule generation ──

@router.post("", response_model=ScheduleResponse)
def generate_schedule(req: ScheduleRequest, user_id: str = "default", db: Session = Depends(get_db)):
    """Generate a daily schedule from task lists."""
    config = db.query(UserConfig).filter(UserConfig.user_id == user_id).first()
    protections = config.protection_rules if config else {}
    policy = config.schedule_policy if config else "efficiency_first"

    fixed = [_task_to_item(t) for t in db.query(Task).filter(
        Task.id.in_(req.fixed_task_ids), Task.user_id == user_id).all()]
    flexible = [_task_to_item(t) for t in db.query(Task).filter(
        Task.id.in_(req.flexible_task_ids), Task.user_id == user_id).all()]

    result = schedule_day(
        schedule_date=req.schedule_date,
        fixed_tasks=fixed, flexible_tasks=flexible,
        protection_rules=protections or {}, schedule_policy=policy)

    # Save to DB
    db.query(TimeSlot).filter(
        TimeSlot.schedule_date == req.schedule_date,
        TimeSlot.user_id == user_id).delete()
    for slot in result.slots:
        ts = TimeSlot(
            user_id=user_id, task_id=slot.task_id,
            schedule_date=req.schedule_date, start_time=parse_time_str(slot.start_time),
            end_time=parse_time_str(slot.end_time), label=slot.label,
            color=slot.color, is_locked=slot.is_locked)
        db.add(ts)
    db.commit()

    return ScheduleResponse(
        date=req.schedule_date,
        slots=[SlotData(**{k: v for k, v in s.__dict__.items() if k != 'task_id' or True}) for s in result.slots],
        deferred_task_ids=[t.id for t in result.deferred],
        message=result.message,
        tips=result.tips)


@router.get("/{schedule_date}")
def get_schedule(schedule_date: date, user_id: str = "default", db: Session = Depends(get_db)):
    """Get a previously generated schedule."""
    slots = db.query(TimeSlot).filter(
        TimeSlot.schedule_date == schedule_date,
        TimeSlot.user_id == user_id).order_by(TimeSlot.start_time).all()
    return {
        "date": str(schedule_date),
        "slots": [{
            "task_id": s.task_id, "label": s.label,
            "start_time": str(s.start_time), "end_time": str(s.end_time),
            "color": s.color, "is_locked": s.is_locked,
        } for s in slots],
    }


@router.post("/adjust", response_model=AdjustResponse)
def adjust_schedule(req: AdjustRequest, user_id: str = "default", db: Session = Depends(get_db)):
    """Handle emergent task — adjust today's schedule."""
    existing_slots = db.query(TimeSlot).filter(
        TimeSlot.schedule_date == req.schedule_date,
        TimeSlot.user_id == user_id).all()

    emergent = TaskItem(
        id=-1, title=req.emergent_task.title,
        task_type=req.emergent_task.task_type,
        priority=req.emergent_task.priority,
        estimated_minutes=req.emergent_task.estimated_minutes,
        time_hint=req.emergent_task.time_hint)

    task_ids = [s.task_id for s in existing_slots if s.task_id]
    all_tasks = db.query(Task).filter(Task.id.in_(task_ids)).all()
    fixed = [_task_to_item(t) for t in all_tasks if t.task_type.value == "fixed"]
    flexible = [_task_to_item(t) for t in all_tasks if t.task_type.value in ("flexible", "protected")]

    config = db.query(UserConfig).filter(UserConfig.user_id == user_id).first()
    protections = config.protection_rules if config else {}

    result = schedule_day(
        schedule_date=req.schedule_date, fixed_tasks=fixed,
        flexible_tasks=flexible, protection_rules=protections,
        emergent_tasks=[emergent])

    db.query(TimeSlot).filter(
        TimeSlot.schedule_date == req.schedule_date,
        TimeSlot.user_id == user_id).delete()
    for slot in result.slots:
        ts = TimeSlot(
            user_id=user_id, task_id=slot.task_id,
            schedule_date=req.schedule_date, start_time=parse_time_str(slot.start_time),
            end_time=parse_time_str(slot.end_time), label=slot.label,
            color=slot.color, is_locked=slot.is_locked)
        db.add(ts)
    db.commit()

    return AdjustResponse(
        slots=[SlotData(**{k: v for k, v in s.__dict__.items()}) for s in result.slots],
        message=result.message)
