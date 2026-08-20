"""Rule-based LLM provider — always works offline."""

from typing import Optional
from backend.llm.base import LLMProvider
from backend.engine.goal_decomposer import GoalNode, decompose_goal as template_decompose
from backend.engine.intent_parser import parse_intent, ParsedTask


class RuleBasedProvider(LLMProvider):
    """Pure rule-based provider. All methods work without API keys."""

    def decompose_goal(self, goal: str) -> Optional[GoalNode]:
        return template_decompose(goal, llm_provider=None)

    def parse_intent(self, text: str) -> list:
        parsed = parse_intent(text)
        return [
            {
                "title": p.title,
                "task_type": p.task_type,
                "priority": p.priority,
                "estimated_minutes": p.estimated_minutes,
                "time_hint": p.time_hint,
            }
            for p in parsed
        ]

    def chat(self, messages: list, mode: str = "swift") -> str:
        if mode == "swift":
            return "收到。任务已处理。"
        elif mode == "warm":
            return "好的呀～我帮你记下来啦 ✨"
        elif mode == "game":
            return "✅ 任务已接收！经验值 +10"
        return "OK"
