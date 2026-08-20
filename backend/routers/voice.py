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
