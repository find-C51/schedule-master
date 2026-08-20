"""Assistant API — the conversational companion layer."""

from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.models import get_session
from backend.models.task import Task
from backend.models.goal import Goal
from backend.models.schedule import TimeSlot
from backend.engine.assistant_brain import respond, daily_brief

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _slots_for(db: Session, d: date, user_id: str) -> List[dict]:
    slots = db.query(TimeSlot).filter(
        TimeSlot.schedule_date == d,
        TimeSlot.user_id == user_id,
    ).order_by(TimeSlot.start_time).all()
    return [{
        "start_time": s.start_time.strftime("%H:%M"),
        "end_time": s.end_time.strftime("%H:%M"),
        "label": s.label,
        "is_locked": s.is_locked,
    } for s in slots]


class ChatRequest(BaseModel):
    text: str
    mode: str = "warm"


class ChatResponse(BaseModel):
    reply: str
    tasks: List[dict] = []
    suggestions: List[str] = []
    action: str = "none"


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, user_id: str = "default", db: Session = Depends(get_db)):
    """Have a warm, context-aware conversation with the assistant."""
    today = date.today()
    tomorrow = today + timedelta(days=1)
    after_tomorrow = today + timedelta(days=2)

    context = {
        "now_hour": datetime.now().hour,
        "today_slots": _slots_for(db, today, user_id),
        "tomorrow_slots": _slots_for(db, tomorrow, user_id),
        "after_tomorrow_slots": _slots_for(db, after_tomorrow, user_id),
        "task_count": db.query(Task).filter(Task.user_id == user_id).count(),
        "goal_count": db.query(Goal).filter(Goal.user_id == user_id).count(),
        "day_label": "明天",
    }

    result = respond(req.text, context, mode=req.mode)
    return ChatResponse(
        reply=result.reply,
        tasks=result.tasks,
        suggestions=result.suggestions,
        action=result.action,
    )


class BriefResponse(BaseModel):
    headline: str
    body: str
    tips: List[str]
    mood: str


@router.get("/brief", response_model=BriefResponse)
def brief(user_id: str = "default", db: Session = Depends(get_db)):
    """Return a caring daily briefing for today's schedule."""
    today = date.today()
    slots = _slots_for(db, today, user_id)
    result = daily_brief(slots, "今天", datetime.now().hour)
    return BriefResponse(**result)
