"""SQLAlchemy models and session factory."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

_engine = None
_SessionLocal = None


def get_engine(database_url: str = "sqlite:///data/schedule.db"):
    global _engine
    if _engine is None:
        _engine = create_engine(database_url, echo=False, connect_args={"check_same_thread": False})
    return _engine


def get_session(database_url: str = "sqlite:///data/schedule.db"):
    global _SessionLocal
    if _SessionLocal is None:
        # Ensure all models are imported so relationships resolve
        from backend.models.goal import Goal       # noqa: F401, F811
        from backend.models.task import Task       # noqa: F401, F811
        from backend.models.schedule import TimeSlot  # noqa: F401, F811
        from backend.models.config import UserConfig   # noqa: F401, F811
        engine = get_engine(database_url)
        _SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    return _SessionLocal()


def init_db(database_url: str = "sqlite:///data/schedule.db"):
    """Create all tables. Call once at startup."""
    from backend.models.goal import Goal       # noqa: F401
    from backend.models.task import Task       # noqa: F401
    from backend.models.schedule import TimeSlot  # noqa: F401
    from backend.models.config import UserConfig   # noqa: F401

    engine = get_engine(database_url)
    Base.metadata.create_all(bind=engine)
