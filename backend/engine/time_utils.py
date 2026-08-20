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
