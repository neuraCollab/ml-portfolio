# backend/app/services/cassandra_grpc_service.py
"""Gateway-side glue for the Cassandra+gRPC ML project: owns the Cassandra
session used for ingestion/dataset-info/logging, and an `httpx` client used
to proxy predict/train/status/pool-scale requests over HTTP to the real
Coordinator (a FastAPI pod running in the `kind` k8s cluster, see
cassandra-grpc-ml/coordinator/app.py). The Coordinator discovers real worker
pods via the Kubernetes API and round-robin dispatches gRPC calls to them;
those worker pods (see cassandra-grpc-ml/worker/server.py) independently own
their own Cassandra session for reading training rows and for loading/saving
the persisted model -- this module never reads `requests` rows for training
itself, only for ingestion and dataset-info display.
"""
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
import psutil
from cassandra.cluster import Cluster
from cassandra.concurrent import execute_concurrent_with_args

from app.core.config import (
    CASSANDRA_GRPC_COORDINATOR_URL,
    CASSANDRA_GRPC_DATASET_PATH,
    CASSANDRA_GRPC_SAMPLE_SIZE,
    CASSANDRA_HOST,
    CASSANDRA_PORT,
    REPO_ROOT,
)
from app.schemas.cassandra_grpc import (
    BenchmarkResult,
    CassandraGrpcStatus,
    CassandraSystemInfo,
    ClassDistributionEntry,
    ClassSupport,
    ConfusionMatrixEntry,
    DatasetInfo,
    GrpcLogEntry,
    PodStatus,
    PoolScaleResult,
    PredictResult,
    ServiceSelfStats,
    TrainJobStatus,
    TrainMetrics,
)
from app.services.cassandra_grpc_ingestion import stratified_sample

logger = logging.getLogger(__name__)

KEYSPACE = "cassandra_grpc_ml"

# Real self-reported process stats for the backend's own container -- same
# pattern as the worker's psutil usage in cassandra-grpc-ml/worker/server.py.
# Primed once at import time so the first cpu_percent() call in get_status()
# returns a real reading instead of the meaningless 0.0 a cold first call
# always produces.
_backend_process = psutil.Process()
_backend_process.cpu_percent(interval=None)


def _backend_self_stats() -> ServiceSelfStats:
    return ServiceSelfStats(
        cpuPercent=round(_backend_process.cpu_percent(interval=0.1), 1),
        memoryMb=round(_backend_process.memory_info().rss / (1024 * 1024), 1),
        uptimeSeconds=round(time.time() - _backend_process.create_time(), 1),
    )

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
    f"CREATE TABLE IF NOT EXISTS {KEYSPACE}.models ("
    "id timeuuid PRIMARY KEY, trained_at timestamp, model_blob blob)",
]


class CassandraGrpcError(Exception):
    """Raised for expected failures (Cassandra/worker unreachable, no data yet)."""


def _connect_cassandra():
    cluster = Cluster([CASSANDRA_HOST], port=CASSANDRA_PORT)
    try:
        session = cluster.connect()
        for stmt in _SCHEMA_STATEMENTS:
            session.execute(stmt)
        session.set_keyspace(KEYSPACE)
    except Exception as exc:
        cluster.shutdown()
        raise CassandraGrpcError(f"Cassandra unreachable at {CASSANDRA_HOST}: {exc}")
    return cluster, session


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


def _cassandra_system_info(session) -> CassandraSystemInfo | None:
    try:
        row = session.execute("SELECT release_version, cluster_name, host_id FROM system.local").one()
        if not row:
            return None
        return CassandraSystemInfo(
            releaseVersion=row.release_version, clusterName=row.cluster_name, hostId=str(row.host_id),
        )
    except Exception:
        logger.exception("Could not read Cassandra system.local")
        return None


def get_status() -> CassandraGrpcStatus:
    cassandra_ok = True
    cassandra_info = None
    try:
        cluster, session = _connect_cassandra()
        try:
            cassandra_info = _cassandra_system_info(session)
        finally:
            cluster.shutdown()
    except Exception:
        logger.exception("Cassandra unreachable")
        cassandra_ok = False

    coordinator_ok = True
    pods: list[PodStatus] = []
    model_loaded, num_classes, trained_at = False, 0, None
    start = time.time()
    try:
        resp = httpx.get(f"{CASSANDRA_GRPC_COORDINATOR_URL}/pool", timeout=5)
        resp.raise_for_status()
        body = resp.json()
        for pod in body["pods"]:
            pods.append(PodStatus(
                address=pod["address"], modelLoaded=pod["modelLoaded"], numClasses=pod["numClasses"],
                trainedAt=pod.get("trainedAt"),
                stats=ServiceSelfStats(
                    cpuPercent=pod["cpuPercent"], memoryMb=pod["memoryMb"], uptimeSeconds=pod["uptimeSeconds"],
                ) if pod.get("error") is None else None,
                error=pod.get("error"),
            ))
        healthy_pods = [p for p in pods if p.error is None]
        if healthy_pods:
            model_loaded = any(p.modelLoaded for p in healthy_pods)
            latest_pod = max(healthy_pods, key=lambda p: p.trainedAt or "")
            num_classes = latest_pod.numClasses
            trained_at = latest_pod.trainedAt
        _log_grpc_call("GetStatus", "OK", (time.time() - start) * 1000, f"{len(pods)} pods")
    except (httpx.HTTPError, KeyError) as exc:
        coordinator_ok = False
        _log_grpc_call("GetStatus", "UNAVAILABLE", (time.time() - start) * 1000, str(exc))

    return CassandraGrpcStatus(
        cassandra="connected" if cassandra_ok else "unreachable",
        coordinator="connected" if coordinator_ok else "unreachable",
        modelLoaded=model_loaded,
        numClasses=num_classes,
        trainedAt=trained_at,
        backendStats=_backend_self_stats(),
        pods=pods,
        cassandraInfo=cassandra_info,
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
        try:
            resp = httpx.post(
                f"{CASSANDRA_GRPC_COORDINATOR_URL}/train",
                # Keep in sync with the Coordinator's own worker-call timeout
                # (cassandra-grpc-ml/coordinator/app.py's /train route) -- a
                # real 40k-row training run (this project's UI default) can
                # take longer than 300s on a CPU-constrained worker pod.
                json={"sampleSize": sample_size}, timeout=900,
            )
        except httpx.HTTPError as exc:
            _log_grpc_call("Train", "UNAVAILABLE", (time.time() - start) * 1000, str(exc))
            raise CassandraGrpcError(f"Coordinator unreachable: {exc}")
        latency_ms = (time.time() - start) * 1000

        if resp.status_code != 200:
            detail = resp.json().get("detail", resp.text)
            _log_grpc_call("Train", "FAILED_PRECONDITION", latency_ms, detail)
            raise CassandraGrpcError(detail)
        _log_grpc_call("Train", "OK", latency_ms, "trained")
        body = resp.json()

        metrics = TrainMetrics(
            numClasses=body["numClasses"], trainRows=body["trainRows"], testRows=body["testRows"],
            accuracy=body["accuracy"], macroPrecision=body["macroPrecision"], macroRecall=body["macroRecall"],
            macroF1=body["macroF1"], microPrecision=body["microPrecision"], microRecall=body["microRecall"],
            microF1=body["microF1"], trainingTimeSeconds=body["trainingTimeSeconds"],
            topClasses=[ClassSupport(**c) for c in body["topClasses"]],
            confusionMatrix=[ConfusionMatrixEntry(**e) for e in body["confusionMatrix"]],
            trainedAt=datetime.now(timezone.utc).isoformat(),
        )
        _record_training_run(sample_size, metrics)

        with _train_lock:
            _train_state.update(status="completed", finishedAt=time.time(), error=None, result=metrics)
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
        resp = httpx.post(
            f"{CASSANDRA_GRPC_COORDINATOR_URL}/predict",
            json={"text": cleaned}, timeout=10,
        )
    except httpx.HTTPError as exc:
        latency_ms = (time.time() - start_grpc) * 1000
        _log_grpc_call("Predict", "UNAVAILABLE", latency_ms, str(exc))
        raise CassandraGrpcError(f"Coordinator unreachable: {exc}")

    grpc_roundtrip_ms = (time.time() - start_grpc) * 1000
    if resp.status_code != 200:
        detail = resp.json().get("detail", resp.text)
        status_name = "FAILED_PRECONDITION" if resp.status_code == 422 else "UNAVAILABLE"
        _log_grpc_call("Predict", status_name, grpc_roundtrip_ms, detail)
        raise CassandraGrpcError(detail)

    body = resp.json()
    _log_grpc_call("Predict", "OK", grpc_roundtrip_ms, f"topic_id={body['topicId']}")
    _log_prediction(cleaned, body, grpc_roundtrip_ms)

    return PredictResult(
        topicId=body["topicId"],
        topicName=body["topicName"],
        confidence=body["confidence"],
        preprocessingTimeMs=round(preprocessing_ms, 3),
        grpcRoundtripMs=round(grpc_roundtrip_ms, 2),
        note="Served by a real worker pod (via the Coordinator's real k8s-backed routing) over a real gRPC call.",
    )


def _log_prediction(text: str, body: dict, latency_ms: float) -> None:
    cluster, session = _connect_cassandra()
    try:
        session.execute(
            f"INSERT INTO {KEYSPACE}.predictions "
            "(id, input_text, predicted_topic_id, predicted_topic_name, confidence, latency_ms, created_at) "
            "VALUES (now(), %s, %s, %s, %s, %s, toTimestamp(now()))",
            (text, body["topicId"], body["topicName"], body["confidence"], latency_ms),
        )
    finally:
        cluster.shutdown()


def run_benchmark(requests: int, concurrency: int) -> BenchmarkResult:
    try:
        resp = httpx.post(
            f"{CASSANDRA_GRPC_COORDINATOR_URL}/benchmark",
            json={"requests": requests, "concurrency": concurrency},
            # The stress test itself can legitimately take a while at high
            # request counts (up to 15,000) -- especially with only 1 worker
            # pod Ready, where real throughput drops to ~40 req/s -- so give
            # it real headroom rather than timing out a benchmark that is
            # still honestly running.
            timeout=600,
        )
    except httpx.HTTPError as exc:
        raise CassandraGrpcError(f"Coordinator unreachable: {exc}")
    if resp.status_code != 200:
        raise CassandraGrpcError(resp.json().get("detail", resp.text))
    return BenchmarkResult(**resp.json())


def scale_pool(replicas: int) -> PoolScaleResult:
    try:
        resp = httpx.post(
            f"{CASSANDRA_GRPC_COORDINATOR_URL}/pool/scale",
            json={"replicas": replicas}, timeout=30,
        )
    except httpx.HTTPError as exc:
        raise CassandraGrpcError(f"Coordinator unreachable: {exc}")
    if resp.status_code != 200:
        raise CassandraGrpcError(resp.json().get("detail", resp.text))
    body = resp.json()
    return PoolScaleResult(requestedReplicas=body["requestedReplicas"], readyReplicas=body["readyReplicas"])
