import json
import logging

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.autotopic import (
    AnalyzeDatasetRequest,
    AnalyzeTextsRequest,
    AutoTopicConfig,
    AutoTopicResults,
    DatasetInfo,
    FullPipelineStartRequest,
    FullPipelineStatus,
)
from app.services import autotopic_service
from app.services.autotopic_service import AutoTopicError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/autotopic", tags=["autotopic"])


@router.post("/analyze", response_model=AutoTopicResults)
def analyze(request: AnalyzeTextsRequest):
    try:
        return autotopic_service.analyze(request.texts, request.config)
    except AutoTopicError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("AutoTopic analysis failed")
        raise HTTPException(status_code=500, detail="Topic modeling failed unexpectedly. See server logs.")


@router.post("/analyze-csv", response_model=AutoTopicResults)
async def analyze_csv(
    file: UploadFile = File(...),
    text_column: str = Form("log_text"),
    config: str = Form(...),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Please upload a .csv file")

    try:
        cfg = AutoTopicConfig(**json.loads(config))
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid config: {exc}")

    try:
        df = pd.read_csv(file.file)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse CSV: {exc}")

    if text_column not in df.columns:
        raise HTTPException(
            status_code=422,
            detail=f"Column '{text_column}' not found in CSV. Available columns: {list(df.columns)}",
        )

    texts = df[text_column].dropna().astype(str).tolist()
    if not texts:
        raise HTTPException(status_code=422, detail=f"Column '{text_column}' has no non-empty rows")

    try:
        return autotopic_service.analyze(texts, cfg)
    except AutoTopicError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("AutoTopic CSV analysis failed")
        raise HTTPException(status_code=500, detail="Topic modeling failed unexpectedly. See server logs.")


@router.get("/dataset-info", response_model=DatasetInfo)
def dataset_info():
    return autotopic_service.get_dataset_info()


@router.post("/analyze-dataset", response_model=AutoTopicResults)
def analyze_dataset(request: AnalyzeDatasetRequest):
    try:
        return autotopic_service.analyze_dataset(request.sampleSize, request.seed, request.config)
    except AutoTopicError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("AutoTopic real-dataset analysis failed")
        raise HTTPException(status_code=500, detail="Topic modeling failed unexpectedly. See server logs.")


@router.post("/full-pipeline/start", response_model=FullPipelineStatus)
def full_pipeline_start(request: FullPipelineStartRequest):
    try:
        return autotopic_service.start_full_pipeline(request.config)
    except AutoTopicError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception:
        logger.exception("Could not start the full-dataset AutoTopic pipeline")
        raise HTTPException(status_code=500, detail="Could not start the full-dataset pipeline. See server logs.")


@router.get("/full-pipeline/status", response_model=FullPipelineStatus)
def full_pipeline_status():
    return autotopic_service.get_full_pipeline_status()
