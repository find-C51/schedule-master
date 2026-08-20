"""TimeSlot model — the output of the scheduling engine."""

from sqlalchemy import Column, Integer, String, Date, Time, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from backend.models import Base


class TimeSlot(Base):
    __tablename__ = "time_slots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), default="default", index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    schedule_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    label = Column(String(200), default="")
    color = Column(String(20), default="#3B82F6")  # blue default
    is_locked = Column(Boolean, default=False)

    task = relationship("Task", back_populates="time_slots")
