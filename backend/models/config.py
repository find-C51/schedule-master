"""UserConfig model — per-user preferences and protection rules."""

from sqlalchemy import Column, Integer, String, JSON
from backend.models import Base


class UserConfig(Base):
    __tablename__ = "user_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), default="default", unique=True, index=True)
    protection_rules = Column(JSON, default=lambda: {
        "breakfast": {"start": "07:00", "end": "08:00"},
        "lunch": {"start": "12:00", "end": "13:00"},
        "nap": {"start": "12:30", "end": "13:30"},
        "dinner": {"start": "18:00", "end": "19:00"},
        "sleep": {"start": "23:00", "end": "07:00"},
    })
    schedule_policy = Column(String(30), default="efficiency_first")
    interaction_mode = Column(String(20), default="table")
    reminder_enabled = Column(Integer, default=1)
    reminder_minutes = Column(Integer, default=15)
