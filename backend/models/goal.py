"""Goal model — four-level goal hierarchy."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from backend.models import Base
import enum


class GoalLevel(str, enum.Enum):
    BIG = "big"         # 大目标: "考上研究生"
    LONG = "long"       # 长期: "这学期GPA 3.8"
    MID = "mid"         # 中期: "5月完成开题报告"
    DAILY = "daily"     # 每日: "精读2篇文献"


class GoalStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), default="default", index=True)
    title = Column(String(500), nullable=False)
    description = Column(String(2000), default="")
    level = Column(SAEnum(GoalLevel), nullable=False, default=GoalLevel.DAILY)
    parent_id = Column(Integer, ForeignKey("goals.id"), nullable=True)
    progress = Column(Float, default=0.0)  # 0.0 ~ 100.0
    deadline = Column(DateTime, nullable=True)
    status = Column(SAEnum(GoalStatus), default=GoalStatus.ACTIVE)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    children = relationship("Goal", backref="parent", remote_side=[id], lazy="selectin")
    tasks = relationship("Task", back_populates="goal", lazy="selectin")
