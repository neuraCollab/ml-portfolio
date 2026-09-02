import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket

from app.core.config import ECG_MAX_EVAL_UPLOAD_BYTES, ECG_MAX_UPLOAD_BYTES
from app.schemas.ecg import (
    BenchmarkResponse,
    DemoRequest,
    EcgAnalysisResponse,
    EcgEvaluationResponse,
    HealthResponse,
    RuntimeInfo,
)
from app.services import ecg_service
from app.services.ecg_service import EcgError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ecg", tags=["ecg"])


@router.get("/health", response_model=HealthResponse)
def health():
    loaded = ecg_service.is_model_loaded()
    return HealthResponse(
        status="ok" if loaded else "degraded",
        modelLoaded=loaded,
        modelLoadError=ecg_service.model_load_error(),
    )


@router.post("/demo", response_model=EcgAnalysisResponse)
def demo(request: DemoRequest):
    try:
        return ecg_service.run_demo(request.source, request.heartRate, request.seed)
    except EcgError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("ECG demo failed")
        raise HTTPException(status_code=500, detail="ECG demo pipeline failed unexpectedly. See server logs.")


@router.post("/analyze", response_model=EcgAnalysisResponse)
async def analyze(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".npy"):
        raise HTTPException(status_code=422, detail="Please upload a .npy file")

    contents = await file.read()
    if len(contents) > ECG_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {ECG_MAX_UPLOAD_BYTES} byte limit")

    try:
        return ecg_service.run_upload(contents)
    except EcgError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("ECG upload analysis failed")
        raise HTTPException(status_code=500, detail="ECG analysis failed unexpectedly. See server logs.")


@router.post("/evaluate", response_model=EcgEvaluationResponse)
async def evaluate(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".npz"):
        raise HTTPException(status_code=422, detail="Please upload a .npz file with 'X' and 'y' arrays")

    contents = await file.read()
    if len(contents) > ECG_MAX_EVAL_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {ECG_MAX_EVAL_UPLOAD_BYTES} byte limit")

    try:
        return ecg_service.evaluate_dataset(contents)
    except EcgError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("ECG dataset evaluation failed")
        raise HTTPException(status_code=500, detail="ECG dataset evaluation failed unexpectedly. See server logs.")


@router.post("/evaluate-bundled", response_model=EcgEvaluationResponse)
def evaluate_bundled():
    try:
        return ecg_service.evaluate_bundled_dataset()
    except EcgError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Bundled ECG dataset evaluation failed")
        raise HTTPException(status_code=500, detail="Bundled ECG dataset evaluation failed unexpectedly. See server logs.")


@router.get("/runtime", response_model=RuntimeInfo)
def runtime():
    return ecg_service.get_runtime_info()


@router.post("/benchmark", response_model=BenchmarkResponse)
def benchmark():
    try:
        return ecg_service.run_latency_benchmark()
    except EcgError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("ECG latency benchmark failed")
        raise HTTPException(status_code=500, detail="ECG latency benchmark failed unexpectedly. See server logs.")


@router.websocket("/live")
async def live(websocket: WebSocket):
    await websocket.accept()
    try:
        await ecg_service.stream_live_ecg(websocket)
    except Exception:
        logger.exception("ECG live stream ended with an error")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
