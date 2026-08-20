"""LLM provider abstract interface and factory."""

from abc import ABC, abstractmethod
from typing import Optional
from backend.engine.goal_decomposer import GoalNode


class LLMProvider(ABC):
    """Pluggable LLM provider for intelligent features."""

    @abstractmethod
    def decompose_goal(self, goal: str) -> Optional[GoalNode]:
        """Decompose a goal description into a goal tree."""
        ...

    @abstractmethod
    def parse_intent(self, text: str) -> list:
        """Parse natural language into structured task intents."""
        ...

    def chat(self, messages: list, mode: str = "swift") -> str:
        """Generate a response in the given interaction mode."""
        raise NotImplementedError


def get_llm_provider() -> Optional[LLMProvider]:
    """Factory: return LLM provider based on config."""
    from backend.config import config

    provider_name = config.llm_provider.lower()
    if provider_name == "none" or not provider_name:
        return None

    if provider_name == "claude":
        from backend.llm.claude_provider import ClaudeProvider
        return ClaudeProvider(api_key=config.anthropic_api_key)

    # Future: openai, local, etc.
    return None
