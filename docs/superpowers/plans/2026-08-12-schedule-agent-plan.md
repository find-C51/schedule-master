# 日程智排 Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA-installable AI daily schedule agent with goal decomposition, voice input, smart scheduling, and four interaction modes.

**Architecture:** FastAPI backend with SQLite serves a React PWA frontend. Core scheduling engine is pure Python (no LLM dependency). LLM providers are pluggable for goal decomposition and intent parsing. Voice input uses browser Web Speech API.

**Tech Stack:** Python 3.11+ / FastAPI / SQLAlchemy / SQLite / React 18 / TypeScript / Vite / Tailwind CSS / PWA

---

## File Map

| File | Responsibility |
|------|---------------|
| `backend/main.py` | FastAPI app entry, CORS, router mounting |
| `backend/config.py` | Settings from env vars |
| `backend/models/__init__.py` | SQLAlchemy Base, engine, session |
| `backend/models/goal.py` | Goal ORM (4-level tree) |
| `backend/models/task.py` | Task ORM (fixed/flexible/protected/emergent) |
| `backend/models/schedule.py` | TimeSlot ORM |
| `backend/models/config.py` | UserConfig ORM |
| `backend/engine/scheduler.py` | Core scheduling algorithm |
| `backend/engine/goal_decomposer.py` | Goal tree decomposition |
| `backend/engine/intent_parser.py` | NL text → structured tasks |
| `backend/engine/conflict_resolver.py` | Real-time schedule adjustment |
| `backend/llm/base.py` | Abstract LLM provider interface |
| `backend/llm/rule_based.py` | Offline rule-based fallback |
| `backend/routers/goals.py` | /api/goals CRUD |
| `backend/routers/schedule.py` | /api/schedule generate + adjust |
| `backend/routers/voice.py` | /api/voice/parse |
| `backend/routers/settings.py` | /api/settings CRUD |
| `backend/services/voice_service.py` | Voice text processing |
| `frontend/` | Vite React PWA (details in tasks) |

---

## Phase 1: Project Skeleton + Data Models + Schedule Engine

### Task 1: Create project structure and backend config

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/config.py`

- [ ] **Step 1: Write requirements.txt**

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
pydantic-settings==2.5.2
python-multipart==0.0.12
```

- [ ] **Step 2: Write config.py**

```python
"""Application configuration from environment variables."""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Config:
    """App config, loaded from env vars with sensible defaults."""

    # Database
    database_url: str = os.getenv(
        "SCHEDULE_DB", "sqlite:///data/schedule.db"
    )

    # LLM
    llm_provider: str = os.getenv("SCHEDULE_LLM", "none")  # none | claude | openai
    anthropic_api_key: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")

    # Server
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"

    # GitHub templates (phase 2+, placeholder)
    github_template_repo: Optional[str] = os.getenv("GITHUB_TEMPLATE_REPO")

    # Protection defaults (used when user hasn't configured)
    default_protections: dict = field(default_factory=lambda: {
        "breakfast": {"start": "07:00", "end": "08:00"},
        "lunch": {"start": "12:00", "end": "13:00"},
        "nap": {"start": "12:30", "end": "13:30"},
        "dinner": {"start": "18:00", "end": "19:00"},
        "sleep": {"start": "23:00", "end": "07:00"},
    })

    # Schedule window
    day_start: str = "07:00"
    day_end: str = "23:00"
    slot_granularity: int = 30  # minutes per slot


config = Config()
```

- [ ] **Step 3: Install dependencies**

```bash
cd /c/Users/29169/schedule-agent && pip install -r backend/requirements.txt
```

---

### Task 2: Database models — Goal, Task, TimeSlot, UserConfig

**Files:**
- Create: `backend/models/__init__.py`
- Create: `backend/models/goal.py`
- Create: `backend/models/task.py`
- Create: `backend/models/schedule.py`
- Create: `backend/models/config.py`

- [ ] **Step 1: Write models/__init__.py**

```python
"""SQLAlchemy models and session factory."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

_engine = None
_SessionLocal = None


def get_engine(database_url: str = "sqlite:///data/schedule.db"):
    global _engine
    if _engine is None:
        _engine = create_engine(database_url, echo=False, connect_args={"check_same_thread": False})
    return _engine


def get_session(database_url: str = "sqlite:///data/schedule.db"):
    global _SessionLocal
    if _SessionLocal is None:
        engine = get_engine(database_url)
        _SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    return _SessionLocal()


def init_db(database_url: str = "sqlite:///data/schedule.db"):
    """Create all tables. Call once at startup."""
    from backend.models.goal import Goal       # noqa: F401
    from backend.models.task import Task       # noqa: F401
    from backend.models.schedule import TimeSlot  # noqa: F401
    from backend.models.config import UserConfig   # noqa: F401

    engine = get_engine(database_url)
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 2: Write models/goal.py**

```python
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
```

- [ ] **Step 3: Write models/task.py**

```python
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
```

- [ ] **Step 4: Write models/schedule.py**

```python
"""TimeSlot model — the output of the scheduling engine."""

from datetime import date, time
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
```

- [ ] **Step 5: Write models/config.py**

```python
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
```

- [ ] **Step 6: Verify models import correctly**

```bash
cd /c/Users/29169/schedule-agent && python -c "
import sys; sys.path.insert(0, '.')
from backend.models import init_db
init_db('sqlite:///data/schedule.db')
print('Tables created successfully')
import os; os.remove('data/schedule.db') if os.path.exists('data/schedule.db') else None
print('Cleanup done')
"
```

---

### Task 3: Core scheduling engine

**Files:**
- Create: `backend/engine/__init__.py` (empty)
- Create: `backend/engine/scheduler.py`
- Create: `backend/engine/time_utils.py`

- [ ] **Step 1: Write time_utils.py**

```python
"""Time utilities for the scheduling engine."""

from datetime import time, datetime, timedelta
from typing import List, Tuple


def parse_time_str(t: str) -> time:
    """'07:30' or '15:00' → time object."""
    parts = t.strip().split(":")
    return time(int(parts[0]), int(parts[1]))


def time_to_minutes(t: time) -> int:
    """Convert time to minutes since midnight."""
    return t.hour * 60 + t.minute


def minutes_to_time(m: int) -> time:
    """Convert minutes since midnight to time. Wraps at 24h."""
    m = m % (24 * 60)
    return time(m // 60, m % 60)


def merge_adjacent_slots(slots: List[Tuple[time, time]]) -> List[Tuple[time, time]]:
    """Merge overlapping or adjacent time ranges."""
    if not slots:
        return []
    sorted_slots = sorted(slots, key=lambda s: time_to_minutes(s[0]))
    merged = [sorted_slots[0]]
    for start, end in sorted_slots[1:]:
        last_start, last_end = merged[-1]
        if time_to_minutes(start) <= time_to_minutes(last_end):
            merged[-1] = (last_start, max(last_end, end, key=lambda t: time_to_minutes(t)))
        else:
            merged.append((start, end))
    return merged


def find_free_slots(
    occupied: List[Tuple[time, time]],
    day_start: time,
    day_end: time,
) -> List[Tuple[time, time]]:
    """Given occupied slots, return all free gaps within day range."""
    merged = merge_adjacent_slots(occupied)
    free = []
    cursor = day_start
    for occ_start, occ_end in merged:
        if time_to_minutes(occ_start) > time_to_minutes(cursor):
            free.append((cursor, occ_start))
        if time_to_minutes(occ_end) > time_to_minutes(cursor):
            cursor = occ_end
    if time_to_minutes(cursor) < time_to_minutes(day_end):
        free.append((cursor, day_end))
    return free


def slot_duration_minutes(slot: Tuple[time, time]) -> int:
    """Duration of a time slot in minutes."""
    return time_to_minutes(slot[1]) - time_to_minutes(slot[0])


def fits_in(slot: Tuple[time, time], duration_minutes: int) -> bool:
    """Check if a task of given duration fits in this slot."""
    return slot_duration_minutes(slot) >= duration_minutes
```

- [ ] **Step 2: Write scheduler.py**

```python
"""Core scheduling engine — turns tasks into a daily timetable."""

from datetime import date, time, datetime, timezone
from typing import List, Tuple, Optional
from dataclasses import dataclass
from backend.config import config
from backend.engine.time_utils import (
    parse_time_str, time_to_minutes, minutes_to_time,
    find_free_slots, fits_in, slot_duration_minutes,
)


@dataclass
class TaskItem:
    """Lightweight task representation for the scheduler (doesn't need DB)."""
    id: int
    title: str
    task_type: str        # fixed | flexible | protected | emergent
    priority: str         # urgent | normal | low
    estimated_minutes: int
    time_hint: Optional[str] = None   # "09:00" or None for flexible
    deadline: Optional[datetime] = None


@dataclass
class SlotOutput:
    """Output slot from the scheduler."""
    task_id: int
    label: str
    start_time: str       # "HH:MM"
    end_time: str         # "HH:MM"
    color: str
    is_locked: bool


@dataclass
class ScheduleResult:
    """Complete schedule result."""
    date: date
    slots: List[SlotOutput]
    deferred: List[TaskItem]   # tasks that didn't fit
    message: str


def _priority_score(priority: str) -> int:
    """Higher score → schedule first."""
    return {"urgent": 100, "normal": 50, "low": 0}.get(priority, 50)


def _color_for_type(task_type: str) -> str:
    return {
        "fixed": "#EF4444",      # red
        "protected": "#10B981",  # green
        "flexible": "#3B82F6",   # blue
        "emergent": "#F59E0B",   # amber
    }.get(task_type, "#6B7280")


def schedule_day(
    schedule_date: date,
    fixed_tasks: List[TaskItem],
    flexible_tasks: List[TaskItem],
    protection_rules: dict,
    emergent_tasks: Optional[List[TaskItem]] = None,
    day_start: time = None,
    day_end: time = None,
    schedule_policy: str = "efficiency_first",
) -> ScheduleResult:
    """
    Build a daily schedule.

    Args:
        schedule_date: The date to schedule for
        fixed_tasks: 🔒 Fixed-time tasks (courses, meetings) - must have time_hint
        flexible_tasks: 📝 Flexible tasks to fill gaps
        protection_rules: {"breakfast": {"start":"07:00","end":"08:00"}, ...}
        emergent_tasks: ⚠ New emergent tasks to integrate
        day_start: Earliest schedulable time (default 07:00)
        day_end: Latest schedulable time (default 23:00)
        schedule_policy: hard_time_first | deadline_first | efficiency_first

    Returns:
        ScheduleResult with slots, deferred tasks, and a message
    """
    if day_start is None:
        day_start = parse_time_str(config.day_start)
    if day_end is None:
        day_end = parse_time_str(config.day_end)

    all_slots: List[SlotOutput] = []
    occupied: List[Tuple[time, time]] = []

    # ── Step 1: Place 🔒 fixed tasks ──
    for task in fixed_tasks:
        if not task.time_hint:
            continue
        try:
            start = parse_time_str(task.time_hint)
            end = minutes_to_time(time_to_minutes(start) + task.estimated_minutes)
        except (ValueError, AttributeError):
            continue
        all_slots.append(SlotOutput(
            task_id=task.id, label=task.title,
            start_time=f"{start.hour:02d}:{start.minute:02d}",
            end_time=f"{end.hour:02d}:{end.minute:02d}",
            color=_color_for_type(task.task_type), is_locked=True,
        ))
        occupied.append((start, end))

    # ── Step 2: Apply 🛡 protection rules ──
    for rule in protection_rules.values():
        try:
            ps = parse_time_str(rule["start"])
            pe = parse_time_str(rule["end"])
            # Handle overnight (sleep 23:00-07:00)
            if time_to_minutes(pe) <= time_to_minutes(ps):
                # Split into two periods
                occupied.append((ps, time(23, 59)))
                occupied.append((time(0, 0), pe))
            else:
                occupied.append((ps, pe))
        except (KeyError, ValueError):
            continue

    # Add explicit protected tasks from DB
    for task in flexible_tasks:
        if task.task_type == "protected" and task.time_hint:
            try:
                ps = parse_time_str(task.time_hint)
                pe = minutes_to_time(time_to_minutes(ps) + task.estimated_minutes)
                all_slots.append(SlotOutput(
                    task_id=task.id, label=task.title,
                    start_time=f"{ps.hour:02d}:{ps.minute:02d}",
                    end_time=f"{pe.hour:02d}:{pe.minute:02d}",
                    color=_color_for_type("protected"), is_locked=True,
                ))
                occupied.append((ps, pe))
            except (ValueError, AttributeError):
                continue

    # ── Step 3: Find free slots ──
    free_slots = find_free_slots(occupied, day_start, day_end)

    # ── Step 4: Sort flexible tasks by priority ──
    if schedule_policy == "hard_time_first":
        # Tasks with time_hint go first
        flex_with_time = [t for t in flexible_tasks if t.task_type == "flexible" and t.time_hint]
        flex_no_time = [t for t in flexible_tasks if t.task_type == "flexible" and not t.time_hint]
        sorted_flex = flex_with_time + flex_no_time
    elif schedule_policy == "deadline_first":
        sorted_flex = sorted(
            [t for t in flexible_tasks if t.task_type == "flexible"],
            key=lambda t: (t.deadline or datetime(2099, 1, 1, tzinfo=timezone.utc), -_priority_score(t.priority))
        )
    else:  # efficiency_first
        sorted_flex = sorted(
            [t for t in flexible_tasks if t.task_type == "flexible"],
            key=lambda t: (-_priority_score(t.priority), t.estimated_minutes)
        )

    # ── Step 5: Greedy bin-packing ──
    deferred: List[TaskItem] = []
    free_slot_index = 0

    for task in sorted_flex:
        placed = False
        # Try time hint first
        if task.time_hint:
            try:
                hint_start = parse_time_str(task.time_hint)
                hint_end = minutes_to_time(time_to_minutes(hint_start) + task.estimated_minutes)
                # Check if hint slot is free
                for fs in free_slots:
                    if (time_to_minutes(hint_start) >= time_to_minutes(fs[0])
                            and time_to_minutes(hint_end) <= time_to_minutes(fs[1])):
                        all_slots.append(SlotOutput(
                            task_id=task.id, label=task.title,
                            start_time=f"{hint_start.hour:02d}:{hint_start.minute:02d}",
                            end_time=f"{hint_end.hour:02d}:{hint_end.minute:02d}",
                            color=_color_for_type("flexible"), is_locked=False,
                        ))
                        occupied.append((hint_start, hint_end))
                        free_slots = find_free_slots(occupied, day_start, day_end)
                        placed = True
                        break
            except (ValueError, AttributeError):
                pass

        if not placed:
            # Find first free slot that fits
            for i, fs in enumerate(free_slots):
                if fits_in(fs, task.estimated_minutes):
                    start = fs[0]
                    end = minutes_to_time(time_to_minutes(start) + task.estimated_minutes)
                    all_slots.append(SlotOutput(
                        task_id=task.id, label=task.title,
                        start_time=f"{start.hour:02d}:{start.minute:02d}",
                        end_time=f"{end.hour:02d}:{end.minute:02d}",
                        color=_color_for_type("flexible"), is_locked=False,
                    ))
                    occupied.append((start, end))
                    free_slots = find_free_slots(occupied, day_start, day_end)
                    placed = True
                    break

        if not placed:
            deferred.append(task)

    # ── Step 6: Integrate ⚠ emergent tasks ──
    if emergent_tasks:
        sorted_emergent = sorted(emergent_tasks, key=lambda t: -_priority_score(t.priority))
        for task in sorted_emergent:
            placed = False
            if task.time_hint:
                try:
                    estart = parse_time_str(task.time_hint)
                    eend = minutes_to_time(time_to_minutes(estart) + task.estimated_minutes)
                    all_slots.append(SlotOutput(
                        task_id=task.id, label=f"⚠ {task.title}",
                        start_time=f"{estart.hour:02d}:{estart.minute:02d}",
                        end_time=f"{eend.hour:02d}:{eend.minute:02d}",
                        color=_color_for_type("emergent"), is_locked=False,
                    ))
                    placed = True
                except (ValueError, AttributeError):
                    pass
            if not placed:
                free_slots = find_free_slots(occupied, day_start, day_end)
                for fs in free_slots:
                    if fits_in(fs, task.estimated_minutes):
                        start = fs[0]
                        end = minutes_to_time(time_to_minutes(start) + task.estimated_minutes)
                        all_slots.append(SlotOutput(
                            task_id=task.id, label=f"⚠ {task.title}",
                            start_time=f"{start.hour:02d}:{start.minute:02d}",
                            end_time=f"{end.hour:02d}:{end.minute:02d}",
                            color=_color_for_type("emergent"), is_locked=False,
                        ))
                        occupied.append((start, end))
                        placed = True
                        break
            if not placed:
                deferred.append(task)

    # Sort all slots by time
    all_slots.sort(key=lambda s: time_to_minutes(parse_time_str(s.start_time)))

    # ── Build message ──
    msg_parts = [f"📅 {schedule_date} 日程已生成"]
    msg_parts.append(f"共 {len(all_slots)} 个时段")
    if deferred:
        names = ", ".join(t.title for t in deferred)
        msg_parts.append(f"⚠ {len(deferred)} 项溢出，建议顺延: {names}")

    return ScheduleResult(
        date=schedule_date,
        slots=all_slots,
        deferred=deferred,
        message=" | ".join(msg_parts),
    )
```

- [ ] **Step 3: Verify engine works with a quick test**

```bash
cd /c/Users/29169/schedule-agent && python -c "
import sys; sys.path.insert(0, '.')
from datetime import date
from backend.engine.scheduler import TaskItem, schedule_day

# Test: simple day
fixed = [
    TaskItem(1, '马原课', 'fixed', 'normal', 100, time_hint='08:00'),
    TaskItem(2, '语文课程论', 'fixed', 'normal', 100, time_hint='14:00'),
    TaskItem(3, '家教', 'fixed', 'normal', 120, time_hint='19:00'),
]
flexible = [
    TaskItem(4, '写文献综述', 'flexible', 'urgent', 40),
    TaskItem(5, '交申请表', 'flexible', 'urgent', 30),
    TaskItem(6, '回导师邮件', 'flexible', 'normal', 20),
    TaskItem(7, '取快递', 'flexible', 'low', 15),
]
protections = {
    'lunch': {'start': '12:00', 'end': '13:00'},
    'nap': {'start': '12:30', 'end': '13:30'},
    'dinner': {'start': '18:00', 'end': '19:00'},
    'sleep': {'start': '23:00', 'end': '07:00'},
}
result = schedule_day(date.today(), fixed, flexible, protections)
print(result.message)
for s in result.slots:
    print(f'  {s.start_time}-{s.end_time} | {s.label} | {\"🔒\" if s.is_locked else \"📝\"}')
if result.deferred:
    print(f'Deferred: {[t.title for t in result.deferred]}')
"
```

Expected: All tasks placed, no deferred, output shows all 7 time slots sorted by time.

---

### Task 4: Intent parser — NL text to structured tasks

**Files:**
- Create: `backend/engine/intent_parser.py`

- [ ] **Step 1: Write intent_parser.py**

```python
"""Intent parser — converts natural language text into structured task lists."""

import re
from typing import List, Optional
from dataclasses import dataclass, field


@dataclass
class ParsedTask:
    """A task extracted from natural language."""
    title: str
    task_type: str  # fixed | flexible | protected
    priority: str   # urgent | normal | low
    estimated_minutes: int = 60
    time_hint: Optional[str] = None  # "15:00" parsed from text


# ── Time patterns ──
TIME_PATTERNS = [
    (re.compile(r"(早上|上午|早晨)(\d{1,2})[点时]"), lambda m: f"{int(m.group(2)):02d}:00"),
    (re.compile(r"(下午|中午)(\d{1,2})[点时]"), lambda m: f"{int(m.group(2)) + 12:02d}:00"),
    (re.compile(r"(晚上)(\d{1,2})[点时]"), lambda m: f"{int(m.group(2)) + 12:02d}:00"),
    (re.compile(r"(凌晨|半夜)(\d{1,2})[点时]"), lambda m: f"{int(m.group(2)):02d}:00"),
    (re.compile(r"(\d{1,2})[点时](\d{1,2})?(半|分)?"), lambda m: f"{int(m.group(1)):02d}:{m.group(2) or '00'}"),
    # 下午3点 → 15:00
    (re.compile(r"(下午|晚上)(\d{1,2})[点时：:](\d{0,2})"), lambda m: f"{int(m.group(2))+12:02d}:{m.group(3) or '00'}"),
    # "五六节" → 14:00
    (re.compile(r"第?(\d{1,2})[节节]课?"), _infer_period_time),
]


def _infer_period_time(match) -> str:
    """Infer time from class period number (Chinese university convention)."""
    period = int(match.group(1))
    # Typical: Period 1-2 = 8:00-9:40, 3-4 = 10:00-11:40, 5-6 = 14:00-15:40, etc.
    period_start = {
        1: "08:00", 3: "10:00", 5: "14:00", 7: "16:00", 9: "19:00",
    }
    return period_start.get(period, "08:00")


# ── Type/priority keywords ──
FIXED_KEYWORDS = ["课", "上课", "开会", "组会", "班会", "考试", "答辩", "家教", "兼职", "值班", "实习"]
PROTECTED_KEYWORDS = ["吃饭", "午饭", "晚饭", "早餐", "午餐", "晚餐", "午休", "午睡", "睡觉", "休息", "洗漱"]
URGENT_KEYWORDS = ["今天截止", "明天截止", "ddl", "截止", "赶紧", "马上", "必须", "急", "尽快"]
LOW_KEYWORDS = ["取快递", "打印", "顺路", "顺便", "有空再", "不急"]

# Task duration estimation by keyword
DURATION_HINTS = [
    (re.compile(r"(\d+)\s*分[钟钟]"), lambda m: int(m.group(1))),
    (re.compile(r"(\d+)\s*(小?时|个?小时|个半?小时)"), lambda m: int(m.group(1)) * 60),
    (re.compile(r"半小?时"), lambda m: 30),
    (re.compile(r"(\d+\.?\d*)\s*(小?时)"), lambda m: int(float(m.group(1)) * 60)),
]


def parse_intent(text: str) -> List[ParsedTask]:
    """
    Parse a natural language sentence into structured tasks.

    Example input: "明天一二节马原课，下午五六节课题组开会，晚上七点到九点家教。另外我还要写文献综述第一节、交补修课程申请表、取快递、回导师邮件。"

    Returns list of ParsedTask with type, priority, time_hint filled.
    """
    # Split by common delimiters
    clauses = re.split(r"[，,。；;、另外还有还要]", text)
    clauses = [c.strip() for c in clauses if c.strip()]

    results: List[ParsedTask] = []
    for clause in clauses:
        task_type = _classify_type(clause)
        priority = _classify_priority(clause)
        duration = _extract_duration(clause)
        time_hint = _extract_time(clause)

        results.append(ParsedTask(
            title=clause[:100],
            task_type=task_type,
            priority=priority,
            estimated_minutes=duration,
            time_hint=time_hint,
        ))

    return results


def _classify_type(text: str) -> str:
    for kw in FIXED_KEYWORDS:
        if kw in text:
            return "fixed"
    for kw in PROTECTED_KEYWORDS:
        if kw in text:
            return "protected"
    return "flexible"


def _classify_priority(text: str) -> str:
    for kw in URGENT_KEYWORDS:
        if kw in text.lower():
            return "urgent"
    for kw in LOW_KEYWORDS:
        if kw in text:
            return "low"
    return "normal"


def _extract_duration(text: str) -> int:
    for pattern, extractor in DURATION_HINTS:
        m = pattern.search(text)
        if m:
            return extractor(m)
    return 60  # default 1 hour


def _extract_time(text: str) -> Optional[str]:
    """Extract time hint from text. Returns 'HH:MM' or None."""
    # Special: "一二节" → 08:00, "五六节" → 14:00
    period_match = re.search(r"([一二三四五六七八九]+)[节节]", text)
    if period_match:
        return _period_to_time(period_match.group(1))

    for pattern, extractor in TIME_PATTERNS:
        m = pattern.search(text)
        if m and not isinstance(extractor, type(_infer_period_time)):
            try:
                return extractor(m)
            except Exception:
                continue

    return None


_PERIOD_MAP = {
    "一": "08:00", "二": "10:00", "三": "10:00",
    "四": "10:00", "五": "14:00", "六": "14:00",
    "七": "16:00", "八": "16:00", "九": "19:00",
}


def _period_to_time(period_chars: str) -> Optional[str]:
    """一二节 → 08:00, 五六节 → 14:00"""
    if period_chars and period_chars[0] in _PERIOD_MAP:
        return _PERIOD_MAP[period_chars[0]]
    return None
```

- [ ] **Step 2: Test intent parser**

```bash
cd /c/Users/29169/schedule-agent && python -c "
import sys; sys.path.insert(0, '.')
from backend.engine.intent_parser import parse_intent

text = '明天一二节马原课，下午五六节课题组开会，晚上七点到九点家教。另外我还要写文献综述第一节、交补修课程申请表、取快递、回导师邮件。'
tasks = parse_intent(text)
for t in tasks:
    print(f'  {t.task_type:10s} | {t.priority:8s} | {t.estimated_minutes:3d}min | {t.time_hint or \"无\"} | {t.title}')
"
```

Expected: 马原课=fixed, 开会=fixed, 家教=fixed, 文献综述=flexible, etc.

---

## Phase 2: Backend API + Frontend Framework + PWA

### Task 5: FastAPI main entry and routers skeleton

**Files:**
- Create: `backend/main.py`
- Create: `backend/routers/__init__.py` (empty)
- Create: `backend/routers/goals.py`
- Create: `backend/routers/schedule.py`
- Create: `backend/routers/voice.py`
- Create: `backend/routers/settings.py`
- Create: `backend/schemas.py`

- [ ] **Step 1: Write schemas.py**

```python
"""Pydantic schemas for API request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
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
    description: str
    level: str
    parent_id: Optional[int]
    progress: float
    deadline: Optional[datetime]
    status: str
    children: List["GoalResponse"] = []
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
    time_hint: Optional[str]
    deadline: Optional[datetime]
    status: str
    goal_id: Optional[int]
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
    reminder_enabled: bool
    reminder_minutes: int
    model_config = {"from_attributes": True}


# ── Adjustment schemas ──
class AdjustRequest(BaseModel):
    schedule_date: date
    emergent_task: TaskCreate
    strategy: str = "auto"  # auto | suggest | manual

class AdjustResponse(BaseModel):
    slots: List[SlotData]
    message: str
    options: Optional[List[List[SlotData]]] = None  # for suggest strategy
```

- [ ] **Step 2: Write routers/goals.py**

```python
"""Goals API — CRUD for four-level goal hierarchy."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from backend.models import get_session
from backend.models.goal import Goal, GoalLevel, GoalStatus
from backend.schemas import GoalCreate, GoalResponse, GoalUpdate

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
        from fastapi import HTTPException
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
        from fastapi import HTTPException
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Write routers/schedule.py**

```python
"""Schedule API — generate daily schedule from tasks."""

from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.models import get_session
from backend.models.task import Task, TaskType
from backend.models.schedule import TimeSlot
from backend.models.config import UserConfig
from backend.engine.scheduler import TaskItem, schedule_day, ScheduleResult
from backend.schemas import ScheduleRequest, ScheduleResponse, SlotData, AdjustRequest, AdjustResponse, TaskCreate

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


@router.post("", response_model=ScheduleResponse)
def generate_schedule(req: ScheduleRequest, user_id: str = "default", db: Session = Depends(get_db)):
    """Generate a daily schedule from task lists."""
    # Load user config
    config = db.query(UserConfig).filter(UserConfig.user_id == user_id).first()
    protections = config.protection_rules if config else {}
    policy = config.schedule_policy if config else "efficiency_first"

    # Load tasks from DB
    fixed = [_task_to_item(t) for t in db.query(Task).filter(
        Task.id.in_(req.fixed_task_ids),
        Task.user_id == user_id,
    ).all()]

    flexible = [_task_to_item(t) for t in db.query(Task).filter(
        Task.id.in_(req.flexible_task_ids),
        Task.user_id == user_id,
    ).all()]

    result = schedule_day(
        schedule_date=req.schedule_date,
        fixed_tasks=fixed,
        flexible_tasks=flexible,
        protection_rules=protections or {},
        schedule_policy=policy,
    )

    # Save TimeSlots to DB (clear old first)
    db.query(TimeSlot).filter(
        TimeSlot.schedule_date == req.schedule_date,
        TimeSlot.user_id == user_id,
    ).delete()
    for slot in result.slots:
        ts = TimeSlot(
            user_id=user_id,
            task_id=slot.task_id,
            schedule_date=req.schedule_date,
            start_time=slot.start_time,
            end_time=slot.end_time,
            label=slot.label,
            color=slot.color,
            is_locked=slot.is_locked,
        )
        db.add(ts)
    db.commit()

    return ScheduleResponse(
        date=req.schedule_date,
        slots=[SlotData(**s.__dict__) for s in result.slots],
        deferred_task_ids=[t.id for t in result.deferred],
        message=result.message,
    )


@router.get("/{schedule_date}")
def get_schedule(schedule_date: date, user_id: str = "default", db: Session = Depends(get_db)):
    """Get a previously generated schedule."""
    slots = db.query(TimeSlot).filter(
        TimeSlot.schedule_date == schedule_date,
        TimeSlot.user_id == user_id,
    ).order_by(TimeSlot.start_time).all()

    return {
        "date": str(schedule_date),
        "slots": [
            {
                "task_id": s.task_id,
                "label": s.label,
                "start_time": str(s.start_time),
                "end_time": str(s.end_time),
                "color": s.color,
                "is_locked": s.is_locked,
            }
            for s in slots
        ],
    }


@router.post("/adjust", response_model=AdjustResponse)
def adjust_schedule(req: AdjustRequest, user_id: str = "default", db: Session = Depends(get_db)):
    """Handle emergent task — adjust today's schedule."""
    # Load existing schedule
    existing_slots = db.query(TimeSlot).filter(
        TimeSlot.schedule_date == req.schedule_date,
        TimeSlot.user_id == user_id,
    ).all()

    # Build emergent task as TaskItem
    emergent = TaskItem(
        id=-1,  # temporary
        title=req.emergent_task.title,
        task_type=req.emergent_task.task_type,
        priority=req.emergent_task.priority,
        estimated_minutes=req.emergent_task.estimated_minutes,
        time_hint=req.emergent_task.time_hint,
    )

    # Reload all tasks for this date
    task_ids = [s.task_id for s in existing_slots if s.task_id]
    all_tasks = db.query(Task).filter(Task.id.in_(task_ids)).all()
    fixed = [_task_to_item(t) for t in all_tasks if t.task_type.value == "fixed"]
    flexible = [_task_to_item(t) for t in all_tasks if t.task_type.value in ("flexible", "protected")]

    config = db.query(UserConfig).filter(UserConfig.user_id == user_id).first()
    protections = config.protection_rules if config else {}

    result = schedule_day(
        schedule_date=req.schedule_date,
        fixed_tasks=fixed,
        flexible_tasks=flexible,
        protection_rules=protections,
        emergent_tasks=[emergent],
    )

    # Update DB
    db.query(TimeSlot).filter(
        TimeSlot.schedule_date == req.schedule_date,
        TimeSlot.user_id == user_id,
    ).delete()
    for slot in result.slots:
        ts = TimeSlot(
            user_id=user_id, task_id=slot.task_id,
            schedule_date=req.schedule_date, start_time=slot.start_time,
            end_time=slot.end_time, label=slot.label,
            color=slot.color, is_locked=slot.is_locked,
        )
        db.add(ts)
    db.commit()

    return AdjustResponse(
        slots=[SlotData(**s.__dict__) for s in result.slots],
        message=result.message,
    )
```

- [ ] **Step 4: Write routers/voice.py**

```python
"""Voice API — parse natural language into structured tasks."""

from fastapi import APIRouter
from backend.engine.intent_parser import parse_intent
from backend.schemas import VoiceParseRequest, VoiceParseResponse, TaskCreate

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/parse", response_model=VoiceParseResponse)
def parse_voice(req: VoiceParseRequest):
    """Parse voice transcription text into structured tasks."""
    parsed = parse_intent(req.text)
    tasks = [
        TaskCreate(
            title=p.title,
            task_type=p.task_type,
            priority=p.priority,
            estimated_minutes=p.estimated_minutes,
            time_hint=p.time_hint,
        )
        for p in parsed
    ]
    return VoiceParseResponse(tasks=tasks)
```

- [ ] **Step 5: Write routers/settings.py**

```python
"""Settings API — user preferences and protection rules."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models import get_session
from backend.models.config import UserConfig as UserConfigModel
from backend.schemas import SettingsUpdate, SettingsResponse

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=SettingsResponse)
def get_settings(user_id: str = "default", db: Session = Depends(get_db)):
    cfg = db.query(UserConfigModel).filter(UserConfigModel.user_id == user_id).first()
    if not cfg:
        cfg = UserConfigModel(user_id=user_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.put("", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate, user_id: str = "default", db: Session = Depends(get_db)):
    cfg = db.query(UserConfigModel).filter(UserConfigModel.user_id == user_id).first()
    if not cfg:
        cfg = UserConfigModel(user_id=user_id)
        db.add(cfg)
    if data.protection_rules is not None:
        cfg.protection_rules = data.protection_rules
    if data.schedule_policy is not None:
        cfg.schedule_policy = data.schedule_policy
    if data.interaction_mode is not None:
        cfg.interaction_mode = data.interaction_mode
    if data.reminder_enabled is not None:
        cfg.reminder_enabled = data.reminder_enabled
    if data.reminder_minutes is not None:
        cfg.reminder_minutes = data.reminder_minutes
    db.commit()
    db.refresh(cfg)
    return cfg
```

- [ ] **Step 6: Write main.py**

```python
"""日程智排 — FastAPI application entry point."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.models import init_db
from backend.config import config
from backend.routers import goals, schedule, voice, settings

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Init database
init_db(config.database_url)

app = FastAPI(
    title="日程智排",
    description="AI 每日时间规划智能体",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(goals.router)
app.include_router(schedule.router)
app.include_router(voice.router)
app.include_router(settings.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "product": "日程智排"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=config.host, port=config.port, reload=config.debug)
```

- [ ] **Step 7: Start backend and verify**

```bash
cd /c/Users/29169/schedule-agent && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/api/health
```

Expected: `{"status":"ok","product":"日程智排"}`

---

### Task 6: React PWA frontend scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/sw.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/services/api.ts`
- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/pages/GoalPage.tsx`
- Create: `frontend/src/pages/SchedulePage.tsx`
- Create: `frontend/src/components/VoiceInput.tsx`
- Create: `frontend/src/components/Timeline.tsx`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "schedule-agent-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.3",
    "vite": "^5.4.9",
    "vite-plugin-pwa": "^0.20.5"
  }
}
```

- [ ] **Step 2: Write config files**

tsconfig.json:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" }
  ]
}
```

tsconfig.app.json:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

vite.config.ts:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: '日程智排',
        short_name: '日程智排',
        description: 'AI 每日时间规划智能体',
        theme_color: '#3B82F6',
        background_color: '#F9FAFB',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

tailwind.config.js:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        warm: '#F59E0B',
        danger: '#EF4444',
        calm: '#10B981',
      },
    },
  },
  plugins: [],
}
```

postcss.config.js:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Write index.html and manifest.json**

index.html:
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#3B82F6" />
    <link rel="manifest" href="/manifest.json" />
    <title>日程智排</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

public/manifest.json:
```json
{
  "name": "日程智排",
  "short_name": "日程智排",
  "description": "AI 每日时间规划智能体",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F9FAFB",
  "theme_color": "#3B82F6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

public/sw.js:
```javascript
const CACHE_NAME = 'schedule-agent-v0.1.0'
const urlsToCache = ['/', '/index.html', '/src/main.tsx']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  )
})
```

- [ ] **Step 4: Write src/main.tsx and src/index.css**

src/main.tsx:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

src/index.css:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  background: #F9FAFB;
}

@media (prefers-color-scheme: dark) {
  body { background: #111827; color: #F9FAFB; }
}
```

- [ ] **Step 5: Write src/services/api.ts**

```typescript
const BASE = '/api'

export interface Task {
  id: number; title: string; task_type: string; priority: string
  estimated_minutes: number; time_hint?: string; deadline?: string; status: string
}

export interface Goal {
  id: number; title: string; description: string; level: string
  parent_id?: number; progress: number; deadline?: string; status: string
  children: Goal[]
}

export interface SlotData {
  task_id: number; label: string; start_time: string; end_time: string
  color: string; is_locked: boolean
}

export interface ScheduleResponse {
  date: string; slots: SlotData[]; deferred_task_ids: number[]; message: string
}

export async function fetchTasks(): Promise<Task[]> {
  const r = await fetch(`${BASE}/schedule/tasks`) // we will add this route
  if (!r.ok) return []
  return r.json()
}

export async function createTask(data: Partial<Task>): Promise<Task> {
  const r = await fetch(`${BASE}/schedule/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return r.json()
}

export async function fetchGoals(): Promise<Goal[]> {
  const r = await fetch(`${BASE}/goals`)
  return r.json()
}

export async function createGoal(data: Partial<Goal>): Promise<Goal> {
  const r = await fetch(`${BASE}/goals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return r.json()
}

export async function generateSchedule(date: string, fixedIds: number[], flexIds: number[]): Promise<ScheduleResponse> {
  const r = await fetch(`${BASE}/schedule`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schedule_date: date, fixed_task_ids: fixedIds, flexible_task_ids: flexIds }),
  })
  return r.json()
}

export async function getSchedule(date: string): Promise<{ date: string; slots: SlotData[] }> {
  const r = await fetch(`${BASE}/schedule/${date}`)
  return r.json()
}

export async function parseVoice(text: string): Promise<{ tasks: Partial<Task>[] }> {
  const r = await fetch(`${BASE}/voice/parse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return r.json()
}

export async function adjustSchedule(date: string, emergent: Partial<Task>, strategy = 'auto'): Promise<any> {
  const r = await fetch(`${BASE}/schedule/adjust`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schedule_date: date, emergent_task: emergent, strategy }),
  })
  return r.json()
}

export async function fetchSettings(): Promise<any> {
  const r = await fetch(`${BASE}/settings`)
  return r.json()
}

export async function updateSettings(data: any): Promise<any> {
  const r = await fetch(`${BASE}/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return r.json()
}
```

- [ ] **Step 6: Write App.tsx with routing**

```tsx
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import GoalPage from './pages/GoalPage'
import SchedulePage from './pages/SchedulePage'

function NavBar() {
  const location = useLocation()
  const links = [
    { path: '/', label: '📅 今日', icon: '📅' },
    { path: '/schedule', label: '📋 排程', icon: '📋' },
    { path: '/goals', label: '🎯 目标', icon: '🎯' },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
      <div className="flex justify-around py-2">
        {links.map((l) => (
          <Link
            key={l.path}
            to={l.path}
            className={`flex flex-col items-center text-xs px-4 py-1 rounded-lg transition ${
              location.pathname === l.path
                ? 'text-blue-600 font-semibold'
                : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{l.icon}</span>
            <span>{l.label.split(' ')[1]}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen pb-16">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/goals" element={<GoalPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
        </Routes>
        <NavBar />
      </div>
    </BrowserRouter>
  )
}
```

- [ ] **Step 7: Write placeholder pages**

src/pages/HomePage.tsx:
```tsx
import { useState, useEffect } from 'react'
import { getSchedule, SlotData } from '../services/api'

export default function HomePage() {
  const [slots, setSlots] = useState<SlotData[]>([])
  const [date] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    getSchedule(date).then((d) => setSlots(d.slots || []))
  }, [date])

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">日程智排</h1>
      <p className="text-gray-500 text-sm mb-4">
        {date} · {slots.length > 0 ? `${slots.length} 项日程` : '暂无日程'}
      </p>
      {slots.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">📭</p>
          <p>今天还没有日程</p>
          <p className="text-sm">去「排程」页生成明天的日程吧</p>
        </div>
      )}
      <div className="space-y-2">
        {slots.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl border-l-4 bg-white shadow-sm"
            style={{ borderLeftColor: s.color }}
          >
            <span className="text-sm font-mono text-gray-500 w-24">
              {s.start_time}-{s.end_time}
            </span>
            <span className="flex-1">{s.label}</span>
            {s.is_locked && <span className="text-xs">🔒</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

src/pages/GoalPage.tsx:
```tsx
import { useState, useEffect } from 'react'
import { fetchGoals, createGoal, Goal } from '../services/api'

export default function GoalPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('big')

  useEffect(() => { fetchGoals().then(setGoals) }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    const g = await createGoal({ title, level })
    setGoals([...goals, g])
    setTitle('')
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">🎯 目标体系</h1>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          placeholder="新目标，如：考上研究生"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="border rounded-lg px-2 py-2 text-sm"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="big">大目标</option>
          <option value="long">长期</option>
          <option value="mid">中期</option>
          <option value="daily">每日</option>
        </select>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
          onClick={handleCreate}
        >
          添加
        </button>
      </div>
      {goals.length === 0 && (
        <p className="text-gray-400 text-center py-8">还没有目标，添加一个吧</p>
      )}
      <div className="space-y-2">
        {goals.map((g) => (
          <div key={g.id} className="p-3 bg-white rounded-xl shadow-sm">
            <div className="flex justify-between items-center">
              <span className="font-medium">{g.title}</span>
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                {g.level === 'big' ? '🏔️大目标' : g.level === 'long' ? '📅长期' : g.level === 'mid' ? '📆中期' : '✅每日'}
              </span>
            </div>
            <div className="mt-2 bg-gray-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${g.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{g.progress}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

src/pages/SchedulePage.tsx:
```tsx
import { useState } from 'react'
import VoiceInput from '../components/VoiceInput'
import { parseVoice, createTask, generateSchedule, Task as ApiTask, ScheduleResponse, SlotData } from '../services/api'

interface ParsedTask {
  title: string; task_type: string; priority: string
  estimated_minutes: number; time_hint?: string
}

export default function SchedulePage() {
  const [tasks, setTasks] = useState<ParsedTask[]>([])
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null)
  const [date] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })

  const handleVoiceResult = async (text: string) => {
    const result = await parseVoice(text)
    setTasks(result.tasks as ParsedTask[])
  }

  const handleGenerate = async () => {
    const fixedIds: number[] = []
    const flexIds: number[] = []
    for (const t of tasks) {
      const created = await createTask({
        title: t.title, task_type: t.task_type, priority: t.priority,
        estimated_minutes: t.estimated_minutes, time_hint: t.time_hint,
      })
      if (t.task_type === 'fixed') fixedIds.push(created.id)
      else flexIds.push(created.id)
    }
    const s = await generateSchedule(date, fixedIds, flexIds)
    setSchedule(s)
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">📋 明日排程</h1>
      <p className="text-gray-500 text-sm mb-4">日期: {date}</p>

      <VoiceInput onResult={handleVoiceResult} />

      {tasks.length > 0 && (
        <div className="mt-4 space-y-2">
          <h2 className="font-semibold text-sm text-gray-600">识别到的任务:</h2>
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-white rounded-lg shadow-sm text-sm">
              <span>{t.task_type === 'fixed' ? '🔒' : t.task_type === 'protected' ? '🛡' : '📝'}</span>
              <span className="flex-1">{t.title}</span>
              <span className="text-xs text-gray-400">{t.estimated_minutes}min</span>
              {t.time_hint && <span className="text-xs text-blue-500">{t.time_hint}</span>}
            </div>
          ))}
          <button
            className="w-full mt-2 bg-blue-500 text-white py-3 rounded-xl font-medium"
            onClick={handleGenerate}
          >
            🤖 生成明日日程
          </button>
        </div>
      )}

      {schedule && (
        <div className="mt-4 space-y-2">
          <h2 className="font-semibold text-sm text-gray-600">{schedule.message}</h2>
          {schedule.slots.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl border-l-4 bg-white shadow-sm"
              style={{ borderLeftColor: s.color }}
            >
              <span className="text-sm font-mono text-gray-500 w-24">
                {s.start_time}-{s.end_time}
              </span>
              <span className="flex-1 text-sm">{s.label}</span>
              {s.is_locked && <span className="text-xs">🔒</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Write VoiceInput component**

src/components/VoiceInput.tsx:
```tsx
import { useState, useRef } from 'react'

interface Props {
  onResult: (text: string) => void
}

export default function VoiceInput({ onResult }: Props) {
  const [listening, setListening] = useState(false)
  const [manualText, setManualText] = useState('')
  const recognitionRef = useRef<any>(null)

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('您的浏览器不支持语音识别，请使用 Chrome')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript
      setListening(false)
      onResult(text)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const handleManual = () => {
    if (manualText.trim()) {
      onResult(manualText.trim())
      setManualText('')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          placeholder="或打字输入：明天上午马原课，下午写文献综述..."
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleManual()}
        />
        <button
          className="px-3 py-2 bg-gray-100 rounded-lg text-sm"
          onClick={handleManual}
        >
          发送
        </button>
      </div>
      <button
        className={`w-full py-3 rounded-xl font-medium transition ${
          listening
            ? 'bg-red-500 text-white animate-pulse'
            : 'bg-blue-500 text-white'
        }`}
        onClick={startListening}
        disabled={listening}
      >
        {listening ? '🎤 正在聆听...' : '🎤 点击语音输入'}
      </button>
    </div>
  )
}
```

- [ ] **Step 9: Install frontend dependencies and verify build**

```bash
cd /c/Users/29169/schedule-agent/frontend && npm install && npm run build
```

Expected: Build succeeds, dist/ directory created.

---

### Task 7: Add task CRUD route to backend

**Files:**
- Modify: `backend/routers/schedule.py` (add task routes)

Add these routes at the bottom of the file, before `router` definition end:

```python
# Add a separate task router
from backend.models.task import Task as TaskModel, TaskType, TaskPriority, TaskStatus
from backend.schemas import TaskCreate as TaskCreateSchema, TaskResponse as TaskResponseSchema

# These routes use the same /api prefix but for tasks
task_router = APIRouter(prefix="/api/schedule/tasks", tags=["tasks"])

@task_router.get("", response_model=list)
def list_tasks(user_id: str = "default", task_type: str = None, db: Session = Depends(get_db)):
    """List tasks, optionally filtered by type."""
    q = db.query(TaskModel).filter(TaskModel.user_id == user_id)
    if task_type:
        q = q.filter(TaskModel.task_type == TaskType(task_type))
    tasks = q.order_by(TaskModel.created_at.desc()).all()
    return [
        {
            "id": t.id, "title": t.title, "task_type": t.task_type.value,
            "priority": t.priority.value, "estimated_minutes": t.estimated_minutes,
            "time_hint": t.time_hint, "deadline": str(t.deadline) if t.deadline else None,
            "status": t.status.value, "goal_id": t.goal_id,
        }
        for t in tasks
    ]

@task_router.post("", response_model=dict)
def create_task_endpoint(data: TaskCreateSchema, user_id: str = "default", db: Session = Depends(get_db)):
    """Create a new task."""
    task = TaskModel(
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

@task_router.put("/{task_id}")
def update_task(task_id: int, data: dict, db: Session = Depends(get_db)):
    """Update task status or fields."""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if "status" in data:
        task.status = TaskStatus(data["status"])
    if "title" in data:
        task.title = data["title"]
    db.commit()
    return {"ok": True}
```

Then in `backend/main.py`, add:
```python
from backend.routers.schedule import task_router
app.include_router(task_router)
```

---

## Phase 3: Voice + Multi-mode UI + Goal Decomposer + Conflict Resolver

### Task 8: Goal decomposer engine

**Files:**
- Create: `backend/engine/goal_decomposer.py`

```python
"""Goal decomposer — breaks big goals into layered sub-goals."""

from typing import List, Optional
from dataclasses import dataclass, field


@dataclass
class GoalNode:
    title: str
    level: str  # big | long | mid | daily
    children: List["GoalNode"] = field(default_factory=list)
    estimated_days: int = 0


# ── Rule-based templates ──
TEMPLATES = {
    "考研": GoalNode("考研上岸", "big", children=[
        GoalNode("初试准备", "long", children=[
            GoalNode("基础阶段（数学+英语）", "mid", children=[
                GoalNode("背单词 100 个", "daily", estimated_days=90),
                GoalNode("数学基础教材一章", "daily", estimated_days=60),
            ]),
            GoalNode("强化阶段（专业课+真题）", "mid", children=[
                GoalNode("专业课一章精读", "daily", estimated_days=60),
                GoalNode("真题一套", "daily", estimated_days=30),
            ]),
            GoalNode("冲刺阶段（模拟+背诵）", "mid", children=[
                GoalNode("政治背诵一章", "daily", estimated_days=30),
                GoalNode("模拟考试一套", "daily", estimated_days=14),
            ]),
        ]),
    ]),
    "考公": GoalNode("考上公务员", "big", children=[
        GoalNode("笔试准备", "long", children=[
            GoalNode("行测专项训练", "mid", children=[
                GoalNode("言语理解 40 题", "daily"),
                GoalNode("数量关系 20 题", "daily"),
            ]),
            GoalNode("申论专项训练", "mid", children=[
                GoalNode("申论范文精读 1 篇", "daily"),
                GoalNode("申论写作练习 1 篇", "daily"),
            ]),
        ]),
        GoalNode("面试准备", "long", children=[
            GoalNode("结构化面试训练", "mid", children=[
                GoalNode("模拟面试 3 题", "daily"),
            ]),
        ]),
    ]),
    "论文": GoalNode("完成毕业论文", "big", children=[
        GoalNode("选题阶段", "long", children=[
            GoalNode("文献调研", "mid", children=[
                GoalNode("精读文献 2 篇", "daily"),
            ]),
            GoalNode("确定选题", "mid", children=[
                GoalNode("写作选题报告", "daily"),
            ]),
        ]),
        GoalNode("开题阶段", "long", children=[
            GoalNode("撰写开题报告", "mid", children=[
                GoalNode("写作开题报告一节", "daily"),
            ]),
        ]),
        GoalNode("写作阶段", "long", children=[
            GoalNode("正文撰写", "mid", children=[
                GoalNode("写作论文章节", "daily"),
            ]),
        ]),
    ]),
    "考证": GoalNode("通过证书考试", "big", children=[
        GoalNode("教材学习", "long", children=[
            GoalNode("教材一轮", "mid", children=[
                GoalNode("教材一章", "daily"),
            ]),
        ]),
        GoalNode("真题刷题", "long", children=[
            GoalNode("真题训练", "mid", children=[
                GoalNode("真题一套", "daily"),
            ]),
        ]),
    ]),
}


def decompose_goal(goal_title: str, llm_provider=None) -> Optional[GoalNode]:
    """
    Decompose a big goal into a four-level goal tree.

    Args:
        goal_title: User's goal description, e.g., "考上研究生"
        llm_provider: Optional LLM provider for smart decomposition

    Returns:
        GoalNode tree, or None if no template matches
    """
    # Try LLM first
    if llm_provider:
        try:
            result = llm_provider.decompose_goal(goal_title)
            if result:
                return result
        except Exception:
            pass  # fall through to template

    # Template matching
    for keyword, template in TEMPLATES.items():
        if keyword in goal_title:
            return template

    # Generic fallback: create a simple 2-level structure
    return GoalNode(goal_title, "big", children=[
        GoalNode(f"{goal_title} - 准备阶段", "long", children=[
            GoalNode("制定计划", "mid", children=[
                GoalNode("规划每日任务", "daily"),
            ]),
        ]),
    ])


def flatten_goals(node: GoalNode, parent_id: int | None = None) -> list[dict]:
    """Flatten a goal tree into a list of DB-ready dicts, breadth-first."""
    result = [{
        "title": node.title,
        "level": node.level,
        "parent_id": parent_id,
        "estimated_days": node.estimated_days,
    }]
    # Note: parent_id will be set after insertion; this returns in order
    for child in node.children:
        result.extend(flatten_goals(child, parent_id=None))
    return result


def get_daily_tasks(node: GoalNode) -> list[str]:
    """Extract all daily-level task titles from a goal tree."""
    tasks = []
    if node.level == "daily":
        tasks.append(node.title)
    for child in node.children:
        tasks.extend(get_daily_tasks(child))
    return tasks
```

---

### Task 9: Add decompose endpoint to goals router

**Files:**
- Modify: `backend/routers/goals.py`

Add this route:

```python
from backend.engine.goal_decomposer import decompose_goal, flatten_goals
from backend.llm.base import get_llm_provider


@router.post("/decompose")
def decompose_goal_endpoint(title: str, user_id: str = "default", db: Session = Depends(get_db)):
    """Decompose a goal title into a 4-level tree and save to DB."""
    llm = get_llm_provider()
    tree = decompose_goal(title, llm)
    if not tree:
        raise HTTPException(400, "无法拆解此目标，请提供更多信息")

    # Save tree to DB
    def save_node(node: GoalNode, parent_id: int | None) -> Goal:
        goal = Goal(
            user_id=user_id,
            title=node.title,
            level=GoalLevel(node.level),
            parent_id=parent_id,
        )
        db.add(goal)
        db.flush()  # get goal.id
        for child in node.children:
            save_node(child, goal.id)
        return goal

    root = save_node(tree, None)
    db.commit()
    db.refresh(root)
    return {"ok": True, "root_id": root.id, "goal": tree.title}
```

---

### Task 10: Add LLM provider infrastructure

**Files:**
- Create: `backend/llm/__init__.py` (empty)
- Create: `backend/llm/base.py`
- Create: `backend/llm/rule_based.py`
- Create: `backend/llm/claude_provider.py`

### Task 11: Multi-mode UI — Table, Swift, Warm, Game modes

**Files:**
- Create: `frontend/src/components/modes/TableMode.tsx`
- Create: `frontend/src/components/modes/SwiftMode.tsx`
- Create: `frontend/src/components/modes/WarmMode.tsx`
- Create: `frontend/src/components/modes/GameMode.tsx`
- Create: `frontend/src/components/Timeline.tsx`
- Modify: `frontend/src/pages/HomePage.tsx` (add mode switcher)
- Modify: `frontend/src/pages/SchedulePage.tsx` (add mode selector)

### Task 12: Conflict resolver + PWA icons

**Files:**
- Create: `backend/engine/conflict_resolver.py`
- Create: frontend PWA icon SVGs
- Modify: `backend/routers/schedule.py` (add adjust endpoint improvements)

---

## Phase 4: LLM Integration + Polish

### Task 13: Claude provider

**Files:**
- Create: `backend/llm/claude_provider.py`
- Modify: `backend/llm/base.py` (factory)

### Task 14: Progress tracking + stats

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx` (add completion tracking)
- Create: `frontend/src/pages/StatsPage.tsx`
- Add stats API route

### Task 15: Settings page + Protection rules UI

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/App.tsx` (add settings nav)

### Task 16: End-to-end polish

- Error states, loading skeletons, empty states
- Dark mode toggle
- Responsive layout testing
- README.md
