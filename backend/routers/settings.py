"""Settings API — user preferences and protection rules."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models import get_session
from backend.models.config import UserConfig as UserConfigModel
from backend.schemas import SettingsUpdate, SettingsResponse

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=SettingsResponse)
def get_settings(user_id: str = "default", db: Session = Depends(get_db)):
    cfg = db.query(UserConfigModel).filter(UserConfigModel.user_id == user_id).first()
    if not cfg:
        cfg = UserConfigModel(user_id=user_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.put("", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate, user_id: str = "default", db: Session = Depends(get_db)):
    cfg = db.query(UserConfigModel).filter(UserConfigModel.user_id == user_id).first()
    if not cfg:
        cfg = UserConfigModel(user_id=user_id)
        db.add(cfg)
    if data.protection_rules is not None:
        cfg.protection_rules = data.protection_rules
    if data.schedule_policy is not None:
        cfg.schedule_policy = data.schedule_policy
    if data.interaction_mode is not None:
        cfg.interaction_mode = data.interaction_mode
    if data.reminder_enabled is not None:
        cfg.reminder_enabled = data.reminder_enabled
    if data.reminder_minutes is not None:
        cfg.reminder_minutes = data.reminder_minutes
    db.commit()
    db.refresh(cfg)
    return cfg
