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
    tips: List[str] = None     # caring coach suggestions


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
        fixed_tasks: Fixed-time tasks (courses, meetings) - must have time_hint
        flexible_tasks: Flexible tasks to fill gaps
        protection_rules: {"breakfast": {"start":"07:00","end":"08:00"}, ...}
        emergent_tasks: New emergent tasks to integrate
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

    # -- Step 1: Place fixed tasks --
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

    # -- Step 2: Apply protection rules --
    for rule in protection_rules.values():
        try:
            ps = parse_time_str(rule["start"])
            pe = parse_time_str(rule["end"])
            # Handle overnight (sleep 23:00-07:00)
            if time_to_minutes(pe) <= time_to_minutes(ps):
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

    # -- Step 3: Find free slots --
    free_slots = find_free_slots(occupied, day_start, day_end)

    # -- Step 4: Sort flexible tasks by priority --
    # Tasks with a time hint MUST be placed before hint-less tasks,
    # otherwise hint-less tasks fill the gap and block the hinted time.
    flex_pool = [t for t in flexible_tasks if t.task_type == "flexible"]
    if schedule_policy == "hard_time_first":
        sorted_flex = sorted(
            flex_pool,
            key=lambda t: (0 if t.time_hint else 1, -_priority_score(t.priority), t.estimated_minutes)
        )
    elif schedule_policy == "deadline_first":
        sorted_flex = sorted(
            flex_pool,
            key=lambda t: (
                0 if t.time_hint else 1,
                t.deadline or datetime(2099, 1, 1, tzinfo=timezone.utc),
                -_priority_score(t.priority),
            )
        )
    else:  # efficiency_first
        sorted_flex = sorted(
            flex_pool,
            key=lambda t: (0 if t.time_hint else 1, -_priority_score(t.priority), t.estimated_minutes)
        )

    # -- Step 5: Greedy bin-packing --
    deferred: List[TaskItem] = []

    for task in sorted_flex:
        placed = False
        # Try time hint first
        if task.time_hint:
            try:
                hint_start = parse_time_str(task.time_hint)
                hint_end = minutes_to_time(time_to_minutes(hint_start) + task.estimated_minutes)
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
            for fs in free_slots:
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

    # -- Step 6: Integrate emergent tasks --
    if emergent_tasks:
        for task in emergent_tasks:
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

    # Build message
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
        tips=_build_tips(all_slots, len(deferred)),
    )


def _build_tips(slots: List[SlotOutput], deferred_count: int) -> List[str]:
    """Generate caring, human coach suggestions from the final schedule."""
    tips: List[str] = []
    if not slots:
        return tips
    try:
        first_start = min(s.start_time for s in slots)
        last_end = max(s.end_time for s in slots)
    except (KeyError, ValueError):
        return tips

    locked = [s for s in slots if s.is_locked]
    if locked:
        tips.append(f"{len(locked)} 项固定任务已锁定，记得提前备好资料，到点直接进入状态 🔒")

    first_min = time_to_minutes(parse_time_str(first_start))
    last_min = time_to_minutes(parse_time_str(last_end))
    if first_min <= 8 * 60:
        tips.append("第一件事开始得早，今晚早点休息，明早才有精神 ☀️")
    if last_min >= 21 * 60:
        tips.append("晚上排到比较晚，睡前留点放松时间，少刷手机哦 🌙")
    if len(slots) >= 8:
        tips.append("今天挺满的，记得留点喝水和起身活动的空档 🍵")
    if deferred_count:
        tips.append(f"有 {deferred_count} 件事排不下，明天优先处理，别焦虑 💛")
    if not tips:
        tips.append("节奏很舒服，记得按计划走，也别给自己太大压力 ✨")
    return tips
