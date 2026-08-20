"""Pydantic schemas for API request/response validation."""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Any
from datetime import date, datetime


# ── Goal schemas ──
class GoalCreate(BaseModel):
    title: str
    description: str = ""
    level: str = "daily"  # big | long | mid | daily
    parent_id: Optional[int] = None
    deadline: Optional[datetime] = None

class GoalResponse(BaseModel):
    id: int
    user_id: str
    title: str
    description: str = ""
    level: str
    parent_id: Optional[int] = None
    progress: float = 0.0
    deadline: Optional[datetime] = None
    status: str = "active"
    children: Optional[List[Any]] = None
    model_config = {"from_attributes": True}

class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    progress: Optional[float] = None
    status: Optional[str] = None


# ── Task schemas ──
class TaskCreate(BaseModel):
    title: str
    description: str = ""
    task_type: str = "flexible"
    priority: str = "normal"
    estimated_minutes: int = 60
    time_hint: Optional[str] = None
    deadline: Optional[datetime] = None
    goal_id: Optional[int] = None

class TaskResponse(BaseModel):
    id: int
    title: str
    task_type: str
    priority: str
    estimated_minutes: int
    time_hint: Optional[str] = None
    deadline: Optional[datetime] = None
    status: str = "pending"
    goal_id: Optional[int] = None
    model_config = {"from_attributes": True}

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None


# ── Schedule schemas ──
class ScheduleRequest(BaseModel):
    schedule_date: date
    fixed_task_ids: List[int] = []
    flexible_task_ids: List[int] = []

class SlotData(BaseModel):
    task_id: int
    label: str
    start_time: str
    end_time: str
    color: str
    is_locked: bool

class ScheduleResponse(BaseModel):
    date: date
    slots: List[SlotData]
    deferred_task_ids: List[int]
    message: str
    tips: Optional[List[str]] = None


# ── Voice schemas ──
class VoiceParseRequest(BaseModel):
    text: str

class VoiceParseResponse(BaseModel):
    tasks: List[TaskCreate]


# ── Settings schemas ──
class SettingsUpdate(BaseModel):
    protection_rules: Optional[dict] = None
    schedule_policy: Optional[str] = None
    interaction_mode: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    reminder_minutes: Optional[int] = None

class SettingsResponse(BaseModel):
    user_id: str
    protection_rules: dict
    schedule_policy: str
    interaction_mode: str
    reminder_enabled: int
    reminder_minutes: int
    model_config = {"from_attributes": True}


# ── Adjustment schemas ──
class AdjustRequest(BaseModel):
    schedule_date: date
    emergent_task: TaskCreate
    strategy: str = "auto"

class AdjustResponse(BaseModel):
    slots: List[SlotData]
    message: str
    options: Optional[List[List[SlotData]]] = None
