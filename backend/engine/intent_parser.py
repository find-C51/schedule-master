"""Intent parser — converts natural language text into structured task lists."""

import re
from typing import List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class ParsedTask:
    """A task extracted from natural language."""
    title: str
    task_type: str  # fixed | flexible | protected
    priority: str   # urgent | normal | low
    estimated_minutes: int = 60
    time_hint: Optional[str] = None  # "15:00" parsed from text


# ── Type/priority keywords ──
FIXED_KEYWORDS = ["课", "上课", "开会", "组会", "班会", "考试", "答辩", "家教", "兼职", "值班", "实习"]
PROTECTED_KEYWORDS = ["吃饭", "午饭", "晚饭", "早餐", "午餐", "晚餐", "午休", "午睡", "睡觉", "休息", "洗漱"]
URGENT_KEYWORDS = ["今天截止", "明天截止", "ddl", "截止", "赶紧", "马上", "必须", "急", "尽快"]
LOW_KEYWORDS = ["取快递", "打印", "顺路", "顺便", "有空再", "不急"]

# ── Period-to-time mapping ──
_PERIOD_MAP = {
    "一": "08:00", "二": "10:00", "三": "10:00",
    "四": "10:00", "五": "14:00", "六": "14:00",
    "七": "16:00", "八": "16:00", "九": "19:00",
}

# Chinese numeral to int
_CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
           "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12}


def _to_int(s: str) -> int:
    """Convert Chinese or Arabic numeral to int."""
    s = s.strip()
    if s.isdigit():
        return int(s)
    if s in _CN_NUM:
        return _CN_NUM[s]
    return 0


# A time atom like "8点", "8点30", "8点30分", "7点半", "12时"
# Requires the hour marker 点/时. Minutes optional (may omit 分 in "8点30").
_TIME_ATOM = r"[0-9一二两三四五六七八九十]+[点时](?:[0-9一二两三四五六七八九十半]+分?)?"


def _parse_time_atom(s: str) -> Tuple[int, int]:
    """Parse '8点30' → (8, 30); '7点半' → (7, 30); '9点' → (9, 0)."""
    s = s.strip()
    m = re.match(r"([0-9一二两三四五六七八九十]+)[点时](?:([0-9一二两三四五六七八九十半]+)分?)?", s)
    if not m:
        return 0, 0
    hour = _to_int(m.group(1))
    minute_str = m.group(2)
    if minute_str is None:
        minute = 0
    elif minute_str == "半":
        minute = 30
    else:
        minute = _to_int(minute_str)
    return hour, minute


def _apply_period(prefix: str, h: int) -> int:
    """Apply AM/PM offset for a single hour based on period prefix."""
    if prefix in ("下午", "晚上") and h <= 11:
        return h + 12
    return h


def _get_period_prefix(text: str) -> str:
    for p in ["凌晨", "早上", "上午", "中午", "下午", "晚上"]:
        if p in text:
            return p
    return ""


_DUR_PATTERNS = [
    (re.compile(r"一个半小?时"), lambda m: 90),
    (re.compile(r"两个半小?时"), lambda m: 150),
    (re.compile(r"(\d+)\s*分[钟钟]"), lambda m: int(m.group(1))),
    (re.compile(r"(\d+)\s*(?:个)?(?:小?时|小时)"), lambda m: int(m.group(1)) * 60),
    (re.compile(r"半小?时"), lambda m: 30),
    (re.compile(r"(一|两|二)\s*个?\s*小?时"), lambda m: 60 if m.group(1) == "一" else 120),
]


def _find_duration(text: str) -> int:
    """Extract a standalone duration keyword (minutes). Returns 0 if none."""
    for pat, extractor in _DUR_PATTERNS:
        m = pat.search(text)
        if m:
            try:
                return extractor(m)
            except Exception:
                continue
    return 0


def _extract_time_and_duration(text: str) -> Tuple[Optional[str], int]:
    """
    Extract start time AND compute duration from time expressions.
    Returns (time_hint "HH:MM", duration_minutes).
    Duration=0 means use default.
    """
    prefix = _get_period_prefix(text)

    # ── Pattern A: adjacent range "8点到10点" / "8点30到9点50" / "7点半到9点" ──
    m = re.search(rf"({_TIME_ATOM})\s*[到至\-～~]\s*({_TIME_ATOM})", text)
    if m:
        h1, m1 = _parse_time_atom(m.group(1))
        h2, m2 = _parse_time_atom(m.group(2))
        if h1 > 0 and h2 > 0:
            h1 = _apply_period(prefix, h1)
            h2 = _apply_period(prefix, h2)
            start = f"{h1:02d}:{m1:02d}"
            duration = (h2 * 60 + m2) - (h1 * 60 + m1)
            if duration < 0:
                duration += 12 * 60
            duration = max(30, duration)
            return start, duration

    # ── Pattern B: range with task in middle "8点上数学课到9点40" ──
    m = re.search(rf"({_TIME_ATOM})\s*(.+?)\s*[到至]\s*({_TIME_ATOM})", text)
    if m:
        h1, m1 = _parse_time_atom(m.group(1))
        h2, m2 = _parse_time_atom(m.group(3))
        middle = m.group(2)
        if h1 > 0 and h2 > 0 and len(middle) <= 15 and not re.search(_TIME_ATOM, middle):
            h1 = _apply_period(prefix, h1)
            h2 = _apply_period(prefix, h2)
            start = f"{h1:02d}:{m1:02d}"
            duration = (h2 * 60 + m2) - (h1 * 60 + m1)
            if duration < 0:
                duration += 12 * 60
            duration = max(30, duration)
            return start, duration

    # ── Find a standalone start time (single time, no range) ──
    start: Optional[str] = None

    # Pattern C: with period prefix "下午3点" / "晚上7点半"
    m = re.search(rf"(?:凌晨|早上|上午|中午|下午|晚上)\s*({_TIME_ATOM})", text)
    if m:
        h, minute = _parse_time_atom(m.group(1))
        if h > 0:
            h = _apply_period(prefix, h)
            start = f"{h:02d}:{minute:02d}"

    # Pattern D: bare time "8点"
    if start is None:
        m = re.search(rf"({_TIME_ATOM})", text)
        if m:
            h, minute = _parse_time_atom(m.group(1))
            if h > 0:
                start = f"{h:02d}:{minute:02d}"

    # Pattern E: "一二节" / "第N节" → period-based
    if start is None:
        period_match = re.search(r"([一二三四五六七八九]+)[节节]", text)
        if period_match:
            start = _period_to_time(period_match.group(1))
        else:
            m = re.search(r"[第]?([0-9一二三四五六七八九]{1,2})\s*[节][课]?", text)
            if m:
                p = m.group(1)
                if p.isdigit():
                    pn = int(p)
                    period_starts = {1: "08:00", 3: "10:00", 5: "14:00", 7: "16:00", 9: "19:00"}
                    start = period_starts.get(pn)
                else:
                    start = _period_to_time(p)

    # ── Duration keyword (may coexist with start time) ──
    duration = _find_duration(text)

    return start, duration


def _period_to_time(period_chars: str) -> Optional[str]:
    if period_chars and period_chars[0] in _PERIOD_MAP:
        return _PERIOD_MAP[period_chars[0]]
    return None


# ── Title cleanup (iteratively strips time/prefix/duration tokens) ──
_TITLE_LEAD = [
    re.compile(r"^(明天|今天|另外|我还要|还有|还要)\s*"),
    re.compile(r"^(上午|下午|晚上|早上|中午|凌晨)\s*"),
    re.compile(rf"^{_TIME_ATOM}\s*[到至\-～~]\s*{_TIME_ATOM}"),
    re.compile(rf"^{_TIME_ATOM}"),
    re.compile(r"^第?[0-9一二三四五六七八九十]+\s*[节节]"),
]
_TITLE_TRAIL = [
    # Trailing end-time "到9点40" / "至10点" (from mid-sentence ranges)
    re.compile(r"[到至]\s*" + _TIME_ATOM + r"\s*$"),
    # Duration with zero-or-more filler prefixes "大概需要一小时" / "约半小时"
    re.compile(r"(?:大概|大约|约|需要|要|差不多|估计|得|花)*\s*(?:一个半|两个半|半)\s*小?时\s*$"),
    re.compile(r"(?:大概|大约|约|需要|要|差不多|估计|得|花)*\s*[0-9一二两三四五六七八九十]+(?:个)?(?:小?时|分钟|分)[钟]?\s*$"),
    re.compile(r"(?:一个半|两个半|半)\s*小?时\s*$"),
    re.compile(r"[0-9一二两三四五六七八九十]+(?:个)?(?:小?时|分钟|分)[钟]?\s*$"),
]


def _clean_title(clause: str) -> str:
    """Strip leading time/prefix tokens and trailing duration tokens."""
    clean = clause.strip()
    changed = True
    while changed:
        changed = False
        # Leading
        for pat in _TITLE_LEAD:
            m = pat.match(clean)
            if m:
                new_title = clean[m.end():].strip()
                if len(new_title) < len(clean):
                    clean = new_title
                    changed = True
                    break
        if changed:
            continue
        # Trailing
        for pat in _TITLE_TRAIL:
            m = pat.search(clean)
            if m and m.end() == len(clean):
                new_title = clean[:m.start()].strip()
                if len(new_title) < len(clean):
                    clean = new_title
                    changed = True
                    break
    return clean


def parse_intent(text: str) -> List[ParsedTask]:
    """Parse natural language into structured tasks."""
    text = re.sub(r"^(明天|今天)\s*", "", text.strip())

    # Split by sentence delimiters, then fine-split
    sentences = re.split(r"[。；;]", text)
    all_clauses = []
    for sent in sentences:
        sub = re.split(r"[，,、]", sent)
        sub = [s.strip() for s in sub if s.strip() and len(s.strip()) > 1]
        all_clauses.extend(sub)

    if not all_clauses:
        all_clauses = [text.strip()]

    results: List[ParsedTask] = []
    for clause in all_clauses:
        clean = _clean_title(clause)
        if len(clean) < 1:
            continue

        task_type = _classify_type(clause)
        priority = _classify_priority(clause)
        time_hint, duration = _extract_time_and_duration(clause)

        if duration == 0:
            if task_type == "fixed":
                duration = 100
            elif task_type == "protected":
                duration = 60
            else:
                duration = 60

        results.append(ParsedTask(
            title=clean[:100],
            task_type=task_type,
            priority=priority,
            estimated_minutes=duration,
            time_hint=time_hint,
        ))

    return results


def _classify_type(text: str) -> str:
    # Meals/sleep always protected
    for kw in PROTECTED_KEYWORDS:
        if kw in text:
            return "protected"
    # Explicit course/meeting/job keywords
    for kw in FIXED_KEYWORDS:
        if kw in text:
            return "fixed"
    # Explicit time range "8点到10点X" → hard-scheduled activity
    if re.search(rf"{_TIME_ATOM}\s*[到至\-～~]\s*{_TIME_ATOM}", text):
        return "fixed"
    return "flexible"


def _classify_priority(text: str) -> str:
    for kw in URGENT_KEYWORDS:
        if kw in text.lower():
            return "urgent"
    for kw in LOW_KEYWORDS:
        if kw in text:
            return "low"
    return "normal"
