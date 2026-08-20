"""日程智排 — FastAPI application entry point."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.models import init_db
from backend.config import config
from backend.routers import goals, schedule, voice, settings, assistant

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Init database
init_db(config.database_url)

app = FastAPI(
    title="日程智排",
    description="AI 每日时间规划智能体",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(goals.router)
app.include_router(schedule.router)
app.include_router(voice.router)
app.include_router(settings.router)
app.include_router(assistant.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "product": "日程智排"}


# Serve PWA frontend static files
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=config.host, port=config.port, reload=config.debug)
