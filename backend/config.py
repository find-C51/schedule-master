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
