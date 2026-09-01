import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import autopilot, autotopic, ecg, health
from app.core.config import CORS_ORIGINS
from app.services import autotopic_service, ecg_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Warming up AutoTopic embedding model...")
    try:
        autotopic_service.warmup()
        logger.info("AutoTopic embedding model ready.")
    except Exception:
        logger.exception("AutoTopic warmup failed; first /api/autotopic/analyze call will load it lazily.")

    logger.info("Warming up ECG model...")
    try:
        ecg_service.warmup()
        logger.info("ECG model ready.")
    except Exception:
        logger.exception("ECG model warmup failed; first /api/ecg/demo call will report the error.")

    yield


app = FastAPI(title="ML Portfolio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(autotopic.router)
app.include_router(autopilot.router)
app.include_router(ecg.router)
