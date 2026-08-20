"""Conflict resolver — handles real-time schedule adjustments with smart suggestions."""

from typing import List, Optional
from dataclasses import dataclass
from datetime import date
from backend.engine.scheduler import TaskItem, SlotOutput, schedule_day


@dataclass
class AdjustmentOption:
    description: str
    slots: List[SlotOutput]
    message: str


def resolve_conflict(
    schedule_date: date,
    existing_fixed: List[TaskItem],
    existing_flexible: List[TaskItem],
    emergent_task: TaskItem,
    protection_rules: dict,
    strategy: str = "auto",
) -> dict:
    """
    Resolve schedule conflict when an emergent task appears.

    Args:
        schedule_date: The date to adjust
        existing_fixed: Current fixed tasks
        existing_flexible: Current flexible tasks
        emergent_task: New emergent task to insert
        protection_rules: User's protection rules
        strategy: 'auto' | 'suggest' | 'manual'

    Returns:
        dict with slots, message, and options (for suggest strategy)
    """
    if strategy == "auto":
        # Auto: just try to fit it
        result = schedule_day(
            schedule_date=schedule_date,
            fixed_tasks=existing_fixed,
            flexible_tasks=existing_flexible,
            protection_rules=protection_rules,
            emergent_tasks=[emergent_task],
        )
        return {
            "slots": result.slots,
            "message": result.message,
            "options": None,
        }

    elif strategy == "suggest":
        # Generate options intelligently
        options = []

        # Option A: Try to squeeze in emergent, keep all existing
        result_a = schedule_day(
            schedule_date=schedule_date,
            fixed_tasks=existing_fixed,
            flexible_tasks=existing_flexible,
            protection_rules=protection_rules,
            emergent_tasks=[emergent_task],
        )
        emergent_placed_a = all(
            d.id != emergent_task.id for d in result_a.deferred
        ) if result_a.deferred else True

        options.append({
            "description": "方案A：保留所有任务，直接插入",
            "slots": _slots_to_dict(result_a.slots),
            "message": result_a.message,
        })

        if not emergent_placed_a:
            # Option B: Move 1 lowest-priority flexible task to make room
            flex_by_priority = sorted(
                [t for t in existing_flexible if t.task_type == "flexible"],
                key=lambda t: ({"urgent": 3, "normal": 2, "low": 1}.get(t.priority, 2)),
            )
            # Try dropping the single lowest-priority task
            if len(flex_by_priority) >= 1:
                reduced = [t for t in flex_by_priority[:-1]]  # drop 1 lowest
                result_b = schedule_day(
                    schedule_date=schedule_date,
                    fixed_tasks=existing_fixed,
                    flexible_tasks=reduced,
                    protection_rules=protection_rules,
                    emergent_tasks=[emergent_task],
                )
                options.append({
                    "description": f"方案B：将「{flex_by_priority[-1].title}」移到明天",
                    "slots": _slots_to_dict(result_b.slots),
                    "message": result_b.message,
                })

            # Option C: Reschedule to a different time (best-effort)
            options.append({
                "description": "方案C：保持现有日程不变，在最早空闲时间插入",
                "slots": _slots_to_dict(result_a.slots),
                "message": "请在空闲时段手动确认插入位置",
            })

        return {
            "slots": result_a.slots,
            "message": f"检测到冲突，请选择处理方案",
            "options": options,
        }

    else:  # manual
        return {
            "slots": [],
            "message": "已标记为手动模式，请在前端拖拽调整日程",
            "options": None,
        }


def _slots_to_dict(slots: List[SlotOutput]) -> List[dict]:
    return [{
        "task_id": s.task_id, "label": s.label,
        "start_time": s.start_time, "end_time": s.end_time,
        "color": s.color, "is_locked": s.is_locked,
    } for s in slots]
