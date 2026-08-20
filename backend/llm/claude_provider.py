"""Claude API provider for LLM-powered features."""

import json
from typing import Optional
from backend.llm.base import LLMProvider
from backend.engine.goal_decomposer import GoalNode, decompose_goal as template_decompose
from backend.engine.intent_parser import parse_intent


class ClaudeProvider(LLMProvider):
    """Claude API provider. Requires ANTHROPIC_API_KEY env var."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1/messages"
        self.model = "claude-sonnet-5-20250915"

    def _call(self, system: str, user: str) -> str:
        """Make a Claude API call."""
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        import urllib.request
        import urllib.error

        data = json.dumps({
            "model": self.model,
            "max_tokens": 1024,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }).encode()

        req = urllib.request.Request(
            self.base_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
        )

        try:
            with urllib.request.urlopen(req) as resp:
                result = json.loads(resp.read())
                return result["content"][0]["text"]
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Claude API error: {e.code} {e.read().decode()[:200]}")

    def decompose_goal(self, goal: str) -> Optional[GoalNode]:
        """Use Claude to decompose a goal, fall back to templates."""
        try:
            prompt = f"""Break this goal into a 4-level tree (big > long > mid > daily):
Goal: {goal}

Return JSON: {{"title": "...", "level": "big", "children": [{{"title": "...", "level": "long", "children": [...]}}]}}
Daily-level children should have no further nesting. Keep it practical, 2-4 children per level."""
            result = self._call("You are a goal decomposition assistant. Return only valid JSON.", prompt)
            data = json.loads(result)
            return _json_to_node(data)
        except Exception:
            return template_decompose(goal, llm_provider=None)

    def parse_intent(self, text: str) -> list:
        """Use Claude to parse intent, fall back to rule-based."""
        try:
            prompt = f"""Parse this Chinese scheduling text into tasks:
Text: {text}

Return JSON array: [{{"title": "...", "task_type": "fixed|flexible|protected", "priority": "urgent|normal|low", "estimated_minutes": 60, "time_hint": "08:00" or null}}]
Fixed = classes, meetings, appointments. Protected = meals, sleep. Flexible = todo items."""
            result = self._call("You are an intent parser. Return only valid JSON array.", prompt)
            return json.loads(result)
        except Exception:
            parsed = parse_intent(text)
            return [{"title": p.title, "task_type": p.task_type, "priority": p.priority,
                     "estimated_minutes": p.estimated_minutes, "time_hint": p.time_hint} for p in parsed]

    def chat(self, messages: list, mode: str = "swift") -> str:
        """Generate persona-appropriate responses."""
        personas = {
            "swift": "You are a concise secretary. Use brief replies.",
            "warm": "You are a warm senior student 'Xiao Nuan'. Be caring and gentle.",
            "game": "You are a game coach. Use RPG terms (EXP, quests, HP).",
        }
        try:
            return self._call(personas.get(mode, personas["swift"]), messages[-1]["content"])
        except Exception:
            return "收到。"


def _json_to_node(data: dict) -> GoalNode:
    """Convert JSON dict to GoalNode tree."""
    node = GoalNode(
        title=data.get("title", ""),
        level=data.get("level", "daily"),
        estimated_days=data.get("estimated_days", 0),
    )
    for child in data.get("children", []):
        node.children.append(_json_to_node(child))
    return node
