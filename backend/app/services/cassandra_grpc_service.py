# backend/app/services/cassandra_grpc_service.py
"""Coordinator-side glue for the Cassandra+gRPC ML project: owns the
Cassandra session used for ingestion/dataset-info/logging, and the gRPC
client used to call the grpc-worker container. The worker (see
cassandra-grpc-ml/worker/server.py) independently owns its own Cassandra
session for reading training rows -- this module never reads `requests`
rows for training itself, only for ingestion and dataset-info display.
"""
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import grpc
import pandas as pd
from cassandra.cluster import Cluster
from cassandra.concurrent import execute_concurrent_with_args

from app.core.config import (
    CASSANDRA_GRPC_DATASET_PATH,
    CASSANDRA_GRPC_SAMPLE_SIZE,
    CASSANDRA_HOST,
    GRPC_WORKER_ADDRESS,
    REPO_ROOT,
)
from app.schemas.cassandra_grpc import (
    CassandraGrpcStatus,
    ClassDistributionEntry,
    ClassSupport,
    ConfusionMatrixEntry,
    DatasetInfo,
    GrpcLogEntry,
    PredictResult,
    TrainJobStatus,
    TrainMetrics,
)
from app.services.cassandra_grpc_ingestion import stratified_sample

import ml_worker_pb2
import ml_worker_pb2_grpc

logger = logging.getLogger(__name__)

KEYSPACE = "cassandra_grpc_ml"

_SCHEMA_STATEMENTS = [
    f"CREATE KEYSPACE IF NOT EXISTS {KEYSPACE} "
    "WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}",
    f"CREATE TABLE IF NOT EXISTS {KEYSPACE}.requests ("
    "id uuid PRIMARY KEY, text text, cleaned_text text, topic_id int, "
    "topic_name text, split text, ingested_at timestamp)",
    f"CREATE TABLE IF NOT EXISTS {KEYSPACE}.predictions ("
    "id timeuuid PRIMARY KEY, input_text text, predicted_topic_id int, "
    "predicted_topic_name text, confidence double, latency_ms double, created_at timestamp)",
    f"CREATE TABLE IF NOT EXISTS {KEYSPACE}.training_runs ("
    "id timeuuid PRIMARY KEY, sample_size int, num_classes int, accuracy double, "
    "macro_precision double, macro_recall double, macro_f1 double, "
    "micro_precision double, micro_recall double, micro_f1 double, "
    "training_time_seconds double, trained_at timestamp)",
]


class CassandraGrpcError(Exception):
    """Raised for expected failures (Cassandra/worker unreachable, no data yet)."""


def _connect_cassandra():
    cluster = Cluster([CASSANDRA_HOST])
    try:
        session = cluster.connect()
        for stmt in _SCHEMA_STATEMENTS:
            session.execute(stmt)
        session.set_keyspace(KEYSPACE)
    except Exception as exc:
        cluster.shutdown()
        raise CassandraGrpcError(f"Cassandra unreachable at {CASSANDRA_HOST}: {exc}")
    return cluster, session


def _grpc_channel():
    return grpc.insecure_channel(GRPC_WORKER_ADDRESS)


_grpc_log_lock = threading.Lock()
_grpc_log: list[GrpcLogEntry] = []
_GRPC_LOG_MAX = 50

# Guards ingest_if_needed()'s count-check-and-insert so two concurrent callers
# (e.g. GET /dataset-info on mount and POST /train's background job) can't both
# see COUNT(*) == 0 and race to ingest, or have one see a partial in-progress
# ingestion's non-zero count and short-circuit onto a half-populated table.
_ingest_lock = threading.Lock()


def _log_grpc_call(method: str, status: str, latency_ms: float, detail: str) -> None:
    entry = GrpcLogEntry(
        id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        method=method,
        status=status,
        latencyMs=round(latency_ms, 2),
        detail=detail,
    )
    with _grpc_log_lock:
        _grpc_log.append(entry)
        del _grpc_log[:-_GRPC_LOG_MAX]


def get_recent_grpc_log() -> list[GrpcLogEntry]:
    with _grpc_log_lock:
        return list(reversed(_grpc_log))


def get_status() -> CassandraGrpcStatus:
    cassandra_ok = True
    try:
        cluster, session = _connect_cassandra()
        cluster.shutdown()
    except Exception:
        logger.exception("Cassandra unreachable")
        cassandra_ok = False

    worker_ok = True
    model_loaded, num_classes, trained_at = False, 0, None
    start = time.time()
    try:
        with _grpc_channel() as channel:
            stub = ml_worker_pb2_grpc.MLWorkerStub(channel)
            resp = stub.GetStatus(ml_worker_pb2.StatusRequest(), timeout=5)
            model_loaded = resp.model_loaded
            num_classes = resp.num_classes
            trained_at = resp.trained_at or None
        _log_grpc_call("GetStatus", "OK", (time.time() - start) * 1000, "ok")
    except grpc.RpcError as exc:
        worker_ok = False
        detail = exc.details() if hasattr(exc, "details") else str(exc)
        _log_grpc_call("GetStatus", "UNAVAILABLE", (time.time() - start) * 1000, str(detail))

    return CassandraGrpcStatus(
        cassandra="connected" if cassandra_ok else "unreachable",
        worker="connected" if worker_ok else "unreachable",
        modelLoaded=model_loaded,
        numClasses=num_classes,
        trainedAt=trained_at,
    )


def _resolve_dataset_path() -> Path:
    path = Path(CASSANDRA_GRPC_DATASET_PATH)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path


def _dataset_info_from_cassandra(session, total: int) -> DatasetInfo:
    rows = list(session.execute(f"SELECT topic_id, topic_name, split FROM {KEYSPACE}.requests"))
    train_rows = sum(1 for r in rows if r.split == "train")
    test_rows = sum(1 for r in rows if r.split == "test")
    counts: dict[tuple[int, str], int] = {}
    for r in rows:
        key = (r.topic_id, r.topic_name)
        counts[key] = counts.get(key, 0) + 1
    distribution = sorted(
        (ClassDistributionEntry(topicId=k[0], topicName=k[1], count=v) for k, v in counts.items()),
        key=lambda e: e.count,
        reverse=True,
    )
    return DatasetInfo(
        ingestedRows=total,
        trainRows=train_rows,
        testRows=test_rows,
        numClasses=len(counts),
        sampleSize=CASSANDRA_GRPC_SAMPLE_SIZE,
        topicDistribution=distribution[:20],
        note=(
            f"A stratified sample of {total:,} rows (capped at {CASSANDRA_GRPC_SAMPLE_SIZE:,}) from "
            "AutoTopic/data/raw/labeled_requests.parquet (373,657 real rows total), split 90/10 "
            "train/test per class."
        ),
    )


def ingest_if_needed() -> DatasetInfo:
    with _ingest_lock:
        cluster, session = _connect_cassandra()
        try:
            row = session.execute(f"SELECT COUNT(*) AS c FROM {KEYSPACE}.requests").one()
            if row and row.c > 0:
                return _dataset_info_from_cassandra(session, row.c)

            path = _resolve_dataset_path()
            if not path.exists():
                raise CassandraGrpcError(
                    f"Dataset not found at '{path}' (CASSANDRA_GRPC_DATASET_PATH="
                    f"{CASSANDRA_GRPC_DATASET_PATH}). This reuses AutoTopic's real "
                    "labeled_requests.parquet -- see AutoTopic/data/README.md."
                )

            df = pd.read_parquet(path, columns=["cleaned_text", "topic_id", "topic_name"])
            df = df.dropna(subset=["cleaned_text"])
            df = df[df["cleaned_text"].str.strip() != ""]
            sampled = stratified_sample(df, CASSANDRA_GRPC_SAMPLE_SIZE)

            insert_stmt = session.prepare(
                f"INSERT INTO {KEYSPACE}.requests "
                "(id, text, cleaned_text, topic_id, topic_name, split, ingested_at) "
                "VALUES (uuid(), ?, ?, ?, ?, ?, toTimestamp(now()))"
            )
            params = [
                (r.cleaned_text, r.cleaned_text, int(r.topic_id), r.topic_name, r.split)
                for r in sampled.itertuples()
            ]
            execute_concurrent_with_args(session, insert_stmt, params, concurrency=50)
            logger.info(f"Ingested {len(sampled)} rows into {KEYSPACE}.requests")
            return _dataset_info_from_cassandra(session, len(sampled))
        finally:
            cluster.shutdown()


def get_dataset_info() -> DatasetInfo:
    cluster, session = _connect_cassandra()
    try:
        row = session.execute(f"SELECT COUNT(*) AS c FROM {KEYSPACE}.requests").one()
        total = row.c if row else 0
        if total == 0:
            raise CassandraGrpcError("No data ingested yet -- call ingest_if_needed() first.")
        return _dataset_info_from_cassandra(session, total)
    finally:
        cluster.shutdown()


# ---------------------------------------------------------------------------
# Training job tracker -- same single-slot background-thread + polling
# pattern as autotopic_service.py's full-dataset pipeline job.
# ---------------------------------------------------------------------------
_train_lock = threading.Lock()
_train_state: dict[str, Any] = {"status": "idle", "startedAt": None, "finishedAt": None, "error": None, "result": None}


def get_train_status() -> TrainJobStatus:
    with _train_lock:
        return TrainJobStatus(**_train_state)


def start_training(sample_size: int) -> TrainJobStatus:
    with _train_lock:
        if _train_state["status"] == "running":
            raise CassandraGrpcError("A training run is already in progress -- poll GET /api/cassandra-grpc/train/status.")
        _train_state.update(status="running", startedAt=time.time(), finishedAt=None, error=None, result=None)
        snapshot = TrainJobStatus(**_train_state)

    thread = threading.Thread(target=_run_training, args=(sample_size,), daemon=True)
    thread.start()
    return snapshot


def _run_training(sample_size: int) -> None:
    start = time.time()
    try:
        ingest_if_needed()
        with _grpc_channel() as channel:
            stub = ml_worker_pb2_grpc.MLWorkerStub(channel)
            resp = stub.Train(ml_worker_pb2.TrainRequest(sample_size=sample_size), timeout=300)
        latency_ms = (time.time() - start) * 1000

        if not resp.success:
            _log_grpc_call("Train", "FAILED_PRECONDITION", latency_ms, resp.message)
            raise CassandraGrpcError(resp.message or "Training failed on the worker")
        _log_grpc_call("Train", "OK", latency_ms, resp.message)

        metrics = TrainMetrics(
            numClasses=resp.num_classes,
            trainRows=resp.train_rows,
            testRows=resp.test_rows,
            accuracy=resp.accuracy,
            macroPrecision=resp.macro_precision,
            macroRecall=resp.macro_recall,
            macroF1=resp.macro_f1,
            microPrecision=resp.micro_precision,
            microRecall=resp.micro_recall,
            microF1=resp.micro_f1,
            trainingTimeSeconds=resp.training_time_seconds,
            topClasses=[
                ClassSupport(topicId=c.topic_id, topicName=c.topic_name, support=c.support)
                for c in resp.top_classes
            ],
            confusionMatrix=[
                ConfusionMatrixEntry(trueTopicId=e.true_topic_id, predictedTopicId=e.predicted_topic_id, count=e.count)
                for e in resp.confusion_matrix
            ],
            trainedAt=datetime.now(timezone.utc).isoformat(),
        )
        _record_training_run(sample_size, metrics)

        with _train_lock:
            _train_state.update(status="completed", finishedAt=time.time(), error=None, result=metrics)
    except grpc.RpcError as exc:
        logger.exception("Training gRPC call failed")
        detail = exc.details() if hasattr(exc, "details") else str(exc)
        with _train_lock:
            _train_state.update(status="failed", finishedAt=time.time(), error=str(detail))
    except Exception as exc:
        logger.exception("Training failed")
        with _train_lock:
            _train_state.update(status="failed", finishedAt=time.time(), error=str(exc))


def _record_training_run(sample_size: int, metrics: TrainMetrics) -> None:
    cluster, session = _connect_cassandra()
    try:
        session.execute(
            f"INSERT INTO {KEYSPACE}.training_runs "
            "(id, sample_size, num_classes, accuracy, macro_precision, macro_recall, macro_f1, "
            "micro_precision, micro_recall, micro_f1, training_time_seconds, trained_at) "
            "VALUES (now(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, toTimestamp(now()))",
            (
                sample_size, metrics.numClasses, metrics.accuracy, metrics.macroPrecision, metrics.macroRecall,
                metrics.macroF1, metrics.microPrecision, metrics.microRecall, metrics.microF1,
                metrics.trainingTimeSeconds,
            ),
        )
    finally:
        cluster.shutdown()


def get_latest_metrics() -> TrainMetrics | None:
    with _train_lock:
        return _train_state["result"]


def predict(text: str) -> PredictResult:
    start_pre = time.time()
    cleaned = text.strip()
    preprocessing_ms = (time.time() - start_pre) * 1000

    start_grpc = time.time()
    try:
        with _grpc_channel() as channel:
            stub = ml_worker_pb2_grpc.MLWorkerStub(channel)
            resp = stub.Predict(ml_worker_pb2.PredictRequest(text=cleaned), timeout=10)
    except grpc.RpcError as exc:
        latency_ms = (time.time() - start_grpc) * 1000
        detail = exc.details() if hasattr(exc, "details") else str(exc)
        status_name = "FAILED_PRECONDITION" if "FAILED_PRECONDITION" in str(exc) else "UNAVAILABLE"
        _log_grpc_call("Predict", status_name, latency_ms, str(detail))
        raise CassandraGrpcError(str(detail))

    grpc_roundtrip_ms = (time.time() - start_grpc) * 1000
    _log_grpc_call("Predict", "OK", grpc_roundtrip_ms, f"topic_id={resp.topic_id}")
    _log_prediction(cleaned, resp, grpc_roundtrip_ms)

    return PredictResult(
        topicId=resp.topic_id,
        topicName=resp.topic_name,
        confidence=resp.confidence,
        preprocessingTimeMs=round(preprocessing_ms, 3),
        grpcRoundtripMs=round(grpc_roundtrip_ms, 2),
        note="Served by the grpc-worker container's TF-IDF + LogisticRegression model over a real gRPC call.",
    )


def _log_prediction(text: str, resp, latency_ms: float) -> None:
    cluster, session = _connect_cassandra()
    try:
        session.execute(
            f"INSERT INTO {KEYSPACE}.predictions "
            "(id, input_text, predicted_topic_id, predicted_topic_name, confidence, latency_ms, created_at) "
            "VALUES (now(), %s, %s, %s, %s, %s, toTimestamp(now()))",
            (text, resp.topic_id, resp.topic_name, resp.confidence, latency_ms),
        )
    finally:
        cluster.shutdown()
