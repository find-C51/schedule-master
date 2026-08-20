"""Assistant brain — rule-based conversational intelligence that feels human.

This is the "heart" of 日程智排's companion layer. It turns raw text into a
warm, context-aware reply WITHOUT any external API, so it always answers
instantly and never hangs. It reads the user's mood, their schedule, and the
time of day, then responds the way a considerate friend would.
"""

import random
from datetime import datetime, time as dtime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field

from backend.engine.intent_parser import parse_intent, ParsedTask
from backend.engine.time_utils import parse_time_str, time_to_minutes


@dataclass
class AssistantReply:
    """Structured result from the assistant brain."""
    reply: str
    tasks: List[Dict[str, Any]] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    action: str = "none"   # greet | query_schedule | parse_tasks | comfort | rest | thanks | fallback


# ──────────────────────────────────────────────────────────────────────────
# Small helpers
# ──────────────────────────────────────────────────────────────────────────

def _pick(items: List[str]) -> str:
    return random.choice(items)


def _time_bucket(hour: int) -> str:
    if hour < 5:
        return "深夜"
    if hour < 8:
        return "清晨"
    if hour < 11:
        return "上午"
    if hour < 13:
        return "中午"
    if hour < 14:
        return "午间"
    if hour < 18:
        return "下午"
    if hour < 21:
        return "傍晚"
    return "夜晚"


def _greeting(hour: int) -> str:
    b = _time_bucket(hour)
    lines = {
        "深夜": ["都这么晚了还没睡呀～辛苦了，但也别熬太狠哦 🌙", "夜深了，注意休息呀，明天才有精神 🌙"],
        "清晨": ["早上好呀！新的一天，先给自己一个元气满满的开场 ☀️", "早呀～记得吃早餐，然后我们再开始安排今天 💪"],
        "上午": ["上午好呀！这会儿精神最好，适合啃硬骨头 📚", "上午好～今天有什么计划呀，我帮你理一理 ✨"],
        "中午": ["中午好！该吃午饭啦，吃饱才有力气继续冲 🍜", "中午好呀～吃完午休一下，下午效率更高哦 💤"],
        "午间": ["午间好～眯一小会儿，下午会精神很多 🌤", "午间好呀～别一直坐着，起来动动肩颈 🍃"],
        "下午": ["下午好～快过半啦，再坚持一下！想排点什么吗？🌿", "下午好呀～下午适合做点轻松的任务收收尾 ✨"],
        "傍晚": ["傍晚好～今天辛苦啦，晚上给自己留点放松时间 🌆", "傍晚好呀～吃晚饭了吗？吃完可以运动运动 🏃"],
        "夜晚": ["晚上好～一天接近尾声，剩下的时间要留给休息啦 🌙", "晚上好呀～今天过得怎么样？有需要我帮忙的吗 ✨"],
    }
    return _pick(lines[b])


def _comfort() -> str:
    return _pick([
        "抱抱你 🫂 你已经很努力了，真的。累了就先别硬撑，哪怕只休息 15 分钟也好，我会一直在这儿。",
        "没关系，谁都有状态不好的时候。要不先做一件最小的事？比如喝口水、整理下桌面，动起来就好了一半 🍃",
        "辛苦了，我知道你不容易。今天不用追求满分，能往前走一点点就很棒了 💛",
        "先停一下，深呼吸三次。你不是一个人在扛，我在呢。想跟我聊聊，还是想让我帮你把任务拆小一点？",
    ])


def _rest() -> str:
    return _pick([
        "困了就去休息呀～身体比计划重要。哪怕只是趴在桌上眯 20 分钟，也比硬撑强 💤",
        "熬夜真的不划算，第二天会没精神的。听我的，今天早点睡，明天我帮你把任务排松一点 🌙",
        "先睡吧，剩下的交给我，我帮你记着，明天起来再继续 😴",
    ])


def _thanks() -> str:
    return _pick([
        "不客气呀～能帮到你我很开心 💛 还有别的想安排的吗？",
        "嘿嘿，都是我应该做的 ✨ 需要的时候随时喊我～",
        "客气啦～你忙你的，有需要我随时在 🌸",
    ])


def _fallback(text: str) -> str:
    return _pick([
        "我听着呢～你可以直接告诉我明天要做什么，比如「上午8点到10点上课，下午去图书馆自习」📝",
        "明白啦！其实你可以试试这样跟我说：「帮我安排明天：8点上数学课到9点40，晚上跑步半小时」✨",
        "收到～不过我没太确定你的意思。你可以问我「今天有什么安排」，或者直接说「明天要……」我就帮你排 📋",
    ])


# ──────────────────────────────────────────────────────────────────────────
# Schedule summary
# ──────────────────────────────────────────────────────────────────────────

def _summarize_slots(slots: List[Dict], day_label: str) -> str:
    if not slots:
        return f"{day_label}还没有安排呢～可以好好放松，或者告诉我你想做什么，我帮你排 🌿"
    locked = [s for s in slots if s.get("is_locked")]
    flexible = [s for s in slots if not s.get("is_locked")]
    try:
        first = min(slots, key=lambda s: s["start_time"])
        last = max(slots, key=lambda s: s["end_time"])
    except (KeyError, ValueError):
        first = last = None

    parts = [f"{day_label}一共安排了 {len(slots)} 件事："]
    if locked:
        head = f"固定任务 {len(locked)} 项"
        if first:
            head += f"，最早 {first['start_time']} 是「{first['label']}」"
        parts.append(head)
    if flexible:
        names = "、".join(s["label"] for s in flexible[:3])
        more = f" 等" if len(flexible) > 3 else ""
        parts.append(f"灵活任务 {len(flexible)} 项：{names}{more}")
    if first and last:
        parts.append(f"全天从 {first['start_time']} 到 {last['end_time']}")
    return "\n".join(parts)


def _coach_tips_for_slots(slots: List[Dict]) -> List[str]:
    """Derive caring, human tips from a schedule."""
    if not slots:
        return []
    tips: List[str] = []
    locked = [s for s in slots if s.get("is_locked")]
    try:
        first_start = min(s["start_time"] for s in slots)
        last_end = max(s["end_time"] for s in slots)
    except (KeyError, ValueError):
        return tips

    if len(slots) >= 8:
        tips.append("今天安排得挺满，记得给自己留点喝水、伸懒腰的小空档 🍵")
    if locked:
        tips.append(f"有 {len(locked)} 个固定任务，提前把东西准备好，到点就能直接进入状态 🔒")

    first_min = time_to_minutes(parse_time_str(first_start))
    last_min = time_to_minutes(parse_time_str(last_end))
    if first_min <= 8 * 60:
        tips.append("第一件事开始得早，今晚别熬夜啦，明早才起得来 ☀️")
    if last_min >= 21 * 60:
        tips.append("晚上安排到比较晚，记得留点时间放松，睡前少刷手机 🌙")
    # Free time between first and last
    occupied = sum(time_to_minutes(parse_time_str(s["end_time"])) - time_to_minutes(parse_time_str(s["start_time"]))
                   for s in slots)
    span = last_min - first_min
    if span > 0:
        free_min = max(0, span - occupied)
        if free_min >= 120:
            tips.append(f"中间大概有 {free_min // 60} 小时的空档，可以插一件一直想做的小事 ✨")
    return tips


# ──────────────────────────────────────────────────────────────────────────
# Intent detection
# ──────────────────────────────────────────────────────────────────────────

_GREET_WORDS = ["你好", "您好", "嗨", "哈喽", "哈啰", "在吗", "早上好", "上午好", "下午好", "晚上好", "早安", "午安", "晚安", "hello", "hi "]
_SCHEDULE_WORDS = ["安排", "日程", "计划", "做什么", "干什么", "排了", "有什么", "干啥"]
_DAY_WORDS = ["今天", "今日", "明天", "明日", "后天"]
_COMFORT_WORDS = ["累", "烦", "焦虑", "压力", "难过", "崩溃", "不想", "学不进去", "撑不住", "沮丧", "绝望", "emo", "没动力", "好难", "扛不住"]
_REST_WORDS = ["困", "睡", "休息", "熬夜", "失眠", "疲惫", "没精神"]
_THANKS_WORDS = ["谢谢", "感谢", "辛苦", "多谢", "感恩"]


def _has(text: str, words: List[str]) -> bool:
    return any(w in text for w in words)


def _detect_intent(text: str, slots_have_data: bool) -> str:
    t = text.strip().lower()
    if _has(t, _GREET_WORDS) and len(t) <= 6:
        return "greet"
    if _has(t, _THANKS_WORDS) and len(t) <= 8:
        return "thanks"
    if _has(t, _REST_WORDS) and len(t) <= 12:
        return "rest"
    if _has(t, _COMFORT_WORDS):
        return "comfort"
    if _has(t, _DAY_WORDS) and _has(t, _SCHEDULE_WORDS):
        return "query_schedule"
    if _has(t, ["我的日程", "今天干嘛", "明天干嘛", "日程"]):
        return "query_schedule"
    return "maybe_tasks"


# ──────────────────────────────────────────────────────────────────────────
# Main entry
# ──────────────────────────────────────────────────────────────────────────

def respond(text: str, context: Optional[Dict[str, Any]] = None, mode: str = "warm") -> AssistantReply:
    """Generate a warm, context-aware reply.

    context may include:
        now_hour: int
        today_slots: list of {start_time, end_time, label, is_locked}
        tomorrow_slots: list of same
        task_count: int
        goal_count: int
        day_label: str  (e.g. "明天")
    """
    ctx = context or {}
    now_hour = ctx.get("now_hour", datetime.now().hour)
    today_slots = ctx.get("today_slots") or []
    tomorrow_slots = ctx.get("tomorrow_slots") or []
    day_label = ctx.get("day_label", "明天")

    intent = _detect_intent(text, bool(today_slots or tomorrow_slots))

    # ── Greeting ──
    if intent == "greet":
        reply = _greeting(now_hour)
        if tomorrow_slots:
            reply += "\n\n对了，" + _summarize_slots(tomorrow_slots, day_label)
        elif today_slots:
            reply += "\n\n" + _summarize_slots(today_slots, "今天")
        else:
            reply += "\n\n要不我们先聊聊今天或明天怎么安排？直接告诉我就行 😊"
        return AssistantReply(
            reply=reply,
            suggestions=["今天有什么安排？", "帮我安排明天", "我想定个目标"],
            action="greet",
        )

    # ── Thanks ──
    if intent == "thanks":
        return AssistantReply(reply=_thanks(), suggestions=["今天有什么安排？", "帮我安排明天"], action="thanks")

    # ── Rest ──
    if intent == "rest":
        reply = _rest()
        reply += "\n\n要不要我帮你看看明天的安排，把强度调低一点？"
        return AssistantReply(reply=reply, suggestions=["看看明天安排", "帮我排松一点"], action="rest")

    # ── Comfort ──
    if intent == "comfort":
        reply = _comfort()
        reply += "\n\n要是愿意，我可以帮你把今天的事拆成最小的一步，你只需要做第一步就好 🍃"
        return AssistantReply(reply=reply, suggestions=["帮我拆解任务", "陪我聊聊天"], action="comfort")

    # ── Schedule query ──
    if intent == "query_schedule":
        # Determine which day the user is asking about
        if "今天" in text or "今日" in text:
            target = today_slots
            label = "今天"
        elif "后天" in text:
            target = ctx.get("after_tomorrow_slots") or []
            label = "后天"
        else:
            target = tomorrow_slots
            label = day_label
        summary = _summarize_slots(target, label)
        tips = _coach_tips_for_slots(target)
        reply = summary
        if tips:
            reply += "\n\n💡 小提醒：\n· " + "\n· ".join(tips[:3])
        if not target:
            reply += "\n\n需要我帮你排一下吗？直接告诉我你要做什么就行～"
        return AssistantReply(
            reply=reply,
            suggestions=["帮我安排" + label, "今天有什么安排？"],
            action="query_schedule",
        )

    # ── Try to parse tasks ──
    parsed: List[ParsedTask] = parse_intent(text)
    if parsed:
        task_dicts = [
            {
                "title": p.title,
                "task_type": p.task_type,
                "priority": p.priority,
                "estimated_minutes": p.estimated_minutes,
                "time_hint": p.time_hint,
            }
            for p in parsed
        ]
        names = "、".join(f"「{p.title}」" for p in parsed[:6])
        more = f" 等 {len(parsed)} 件事" if len(parsed) > 6 else f" {len(parsed)} 件事"
        reply = f"收到！我帮你理出了{more}：{names}。\n\n我会把它们按时间排好，锁定的课程不会动，灵活的帮你塞进空档。要现在生成日程吗？"
        return AssistantReply(
            reply=reply,
            tasks=task_dicts,
            suggestions=["生成日程", "再补充几件事"],
            action="parse_tasks",
        )

    # ── Fallback ──
    return AssistantReply(
        reply=_fallback(text),
        suggestions=["帮我安排明天", "今天有什么安排？", "我好累"],
        action="fallback",
    )


# ──────────────────────────────────────────────────────────────────────────
# Daily brief
# ──────────────────────────────────────────────────────────────────────────

def daily_brief(slots: List[Dict], day_label: str, now_hour: Optional[int] = None) -> Dict[str, Any]:
    """A caring morning/evening briefing about a day's schedule."""
    hour = now_hour if now_hour is not None else datetime.now().hour
    morning = hour < 14

    if not slots:
        return {
            "headline": "今天是张空白的画布 🎨",
            "body": f"{day_label}还没有安排。你可以好好休息，也可以告诉我几件想做的事，我帮你搭一个舒服的节奏。",
            "tips": ["给自己留一段完全不被打扰的时间", "哪怕只做一件小事，也会很有成就感"],
            "mood": "calm",
        }

    locked = [s for s in slots if s.get("is_locked")]
    flexible = [s for s in slots if not s.get("is_locked")]
    try:
        first = min(slots, key=lambda s: s["start_time"])
    except (KeyError, ValueError):
        first = None

    if morning:
        headline = f"{day_label}有 {len(slots)} 件事等着你，别慌，一件件来 🌤"
    else:
        headline = f"今天辛苦了，还剩这些要收尾 🌆"

    parts = []
    if first:
        parts.append(f"第一件事：{first['start_time']} · {first['label']}")
    if locked:
        parts.append(f"固定任务 {len(locked)} 项，已经帮你锁好时间 🔒")
    if flexible:
        parts.append(f"灵活任务 {len(flexible)} 项，可以按心情微调 📝")

    tips = _coach_tips_for_slots(slots)
    if morning and not any("睡" in t for t in tips):
        tips.insert(0, "起床后先喝杯温水，再进入第一件事 🥛")

    return {
        "headline": headline,
        "body": "\n".join(parts),
        "tips": tips[:4],
        "mood": "busy" if len(slots) >= 8 else "balanced",
    }
