# backend/app/api/routes/cassandra_grpc.py
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.schemas.cassandra_grpc import (
    CassandraGrpcStatus, DatasetInfo, GrpcLogEntry, PoolScaleRequest, PoolScaleResult, PredictRequestBody,
    PredictResult, TrainJobStatus, TrainMetrics, TrainRequestBody,
)
from app.services import cassandra_grpc_service as svc
from app.services.cassandra_grpc_service import CassandraGrpcError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cassandra-grpc", tags=["cassandra-grpc"])


@router.get("/status", response_model=CassandraGrpcStatus)
def status():
    return svc.get_status()


@router.post("/pool/scale", response_model=PoolScaleResult)
def scale_pool(request: PoolScaleRequest):
    try:
        return svc.scale_pool(request.replicas)
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/dataset-info", response_model=DatasetInfo)
def dataset_info():
    try:
        return svc.ingest_if_needed()
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("Cassandra+gRPC dataset-info failed")
        raise HTTPException(status_code=500, detail="Could not read dataset info. See server logs.")


@router.post("/train", response_model=TrainJobStatus)
def train(request: TrainRequestBody):
    try:
        return svc.start_training(request.sampleSize)
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception:
        logger.exception("Cassandra+gRPC train-start failed")
        raise HTTPException(status_code=500, detail="Could not start training. See server logs.")


@router.get("/train/status", response_model=TrainJobStatus)
def train_status():
    return svc.get_train_status()


@router.get("/metrics", response_model=Optional[TrainMetrics])
def metrics():
    return svc.get_latest_metrics()


@router.post("/predict", response_model=PredictResult)
def predict(request: PredictRequestBody):
    try:
        return svc.predict(request.text)
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("Cassandra+gRPC predict failed")
        raise HTTPException(status_code=500, detail="Prediction failed unexpectedly. See server logs.")


@router.get("/grpc-log", response_model=list[GrpcLogEntry])
def grpc_log():
    return svc.get_recent_grpc_log()
