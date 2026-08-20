"""Goals API — CRUD for four-level goal hierarchy."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.models import get_session
from backend.models.goal import Goal, GoalLevel, GoalStatus
from backend.schemas import GoalCreate, GoalResponse, GoalUpdate
from backend.engine.goal_decomposer import decompose_goal
from backend.llm.base import get_llm_provider

router = APIRouter(prefix="/api/goals", tags=["goals"])


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=List[GoalResponse])
def list_goals(user_id: str = "default", db: Session = Depends(get_db)):
    """Get all top-level goals (recursive via children)."""
    goals = db.query(Goal).filter(
        Goal.user_id == user_id,
        Goal.parent_id == None,  # noqa: E711
        Goal.level == GoalLevel.BIG,
    ).all()
    return goals


@router.post("", response_model=GoalResponse)
def create_goal(data: GoalCreate, user_id: str = "default", db: Session = Depends(get_db)):
    goal = Goal(
        user_id=user_id,
        title=data.title,
        description=data.description,
        level=GoalLevel(data.level),
        parent_id=data.parent_id,
        deadline=data.deadline,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
def update_goal(goal_id: int, data: GoalUpdate, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    if data.title is not None:
        goal.title = data.title
    if data.description is not None:
        goal.description = data.description
    if data.progress is not None:
        goal.progress = data.progress
    if data.status is not None:
        goal.status = GoalStatus(data.status)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()
    return {"ok": True}


from pydantic import BaseModel

class DecomposeRequest(BaseModel):
    title: str


@router.post("/decompose")
def decompose_goal_endpoint(req: DecomposeRequest, user_id: str = "default", db: Session = Depends(get_db)):
    """Decompose a goal title into a 4-level tree and save to DB."""
    llm = get_llm_provider()
    tree = decompose_goal(req.title, llm)
    if not tree:
        raise HTTPException(400, "无法拆解此目标，请提供更多信息")

    def save_node(node, parent_id):
        goal = Goal(
            user_id=user_id, title=node.title,
            level=GoalLevel(node.level), parent_id=parent_id)
        db.add(goal)
        db.flush()
        for child in node.children:
            save_node(child, goal.id)
        return goal

    root = save_node(tree, None)
    db.commit()
    return {"ok": True, "root_id": root.id, "goal": tree.title}
