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
from app.schemas.cassandra_grpc import CassandraGrpcStatus, ClassDistributionEntry, DatasetInfo, GrpcLogEntry
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
