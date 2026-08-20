"""Task model — the atomic unit scheduled into time slots."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from backend.models import Base
import enum


class TaskType(str, enum.Enum):
    FIXED = "fixed"       # 🔒 固定课程/会议
    FLEXIBLE = "flexible" # 📝 灵活待排
    PROTECTED = "protected"  # 🛡 保护时间
    EMERGENT = "emergent" # ⚠ 突发


class TaskPriority(str, enum.Enum):
    URGENT = "urgent"
    NORMAL = "normal"
    LOW = "low"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    DEFERRED = "deferred"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), default="default", index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(String(2000), default="")
    task_type = Column(SAEnum(TaskType), nullable=False, default=TaskType.FLEXIBLE)
    priority = Column(SAEnum(TaskPriority), default=TaskPriority.NORMAL)
    estimated_minutes = Column(Integer, default=60)
    deadline = Column(DateTime, nullable=True)
    time_hint = Column(String(50), nullable=True)  # "15:00" or "morning" parsed from NL
    status = Column(SAEnum(TaskStatus), default=TaskStatus.PENDING)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    goal = relationship("Goal", back_populates="tasks")
    time_slots = relationship("TimeSlot", back_populates="task", lazy="selectin")
