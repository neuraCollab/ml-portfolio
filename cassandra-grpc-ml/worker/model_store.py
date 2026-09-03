import gzip
import io
import logging
import uuid
from datetime import datetime
from pathlib import Path

import joblib
from minio import Minio

from ml_core import TrainedModel

logger = logging.getLogger(__name__)

MODEL_FILENAME = "model.joblib"


def save_model(model: TrainedModel, store_dir: Path) -> None:
    """Dev/test-only local-file persistence -- what test_model_store.py's
    tmp_path-based tests exercise, and what `python server.py` falls back to
    for standalone local debugging outside the cluster. The deployed
    in-cluster worker uses save_model_to_object_storage instead."""
    store_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, store_dir / MODEL_FILENAME)


def load_model(store_dir: Path) -> TrainedModel | None:
    path = store_dir / MODEL_FILENAME
    if not path.exists():
        return None
    return joblib.load(path)


def get_minio_client(endpoint: str, access_key: str, secret_key: str) -> Minio:
    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)


def _ensure_bucket(client: Minio, bucket: str) -> None:
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def save_model_to_object_storage(model: TrainedModel, cassandra_session, minio_client: Minio, bucket: str) -> str:
    """Real persistence path for the deployed in-cluster worker: the whole
    TrainedModel (vectorizer + classifier + class_labels) is joblib-dumped,
    gzip-compressed, and uploaded to MinIO as one object; only a small
    metadata row (id, trained_at, artifact_uri, num_classes, size_bytes)
    goes into Cassandra's `models` table, so every worker replica can find
    and load the same artifact regardless of which pod trained it.

    This is the fix for a real, previously-open limitation: storing the
    compressed blob directly in Cassandra hit its 16MB native-protocol
    message limit at this project's actual training-sample default (a
    ~18.9MB compressed blob at 40,000 rows) -- see cassandra-grpc-ml/README.md
    for that history. Object storage has no such ceiling; Cassandra now only
    ever holds a short text URI, never the blob."""
    buffer = io.BytesIO()
    joblib.dump(model, buffer)
    raw_bytes = buffer.getvalue()
    compressed = gzip.compress(raw_bytes)
    logger.info(f"Model artifact: {len(raw_bytes):,} bytes raw -> {len(compressed):,} bytes gzip-compressed")

    _ensure_bucket(minio_client, bucket)
    object_name = f"{uuid.uuid4()}.joblib.gz"
    minio_client.put_object(
        bucket, object_name, io.BytesIO(compressed), length=len(compressed), content_type="application/gzip"
    )
    artifact_uri = f"s3://{bucket}/{object_name}"

    trained_at = datetime.fromisoformat(model.trained_at)
    insert_stmt = cassandra_session.prepare(
        "INSERT INTO cassandra_grpc_ml.models (id, trained_at, artifact_uri, num_classes, size_bytes) "
        "VALUES (now(), ?, ?, ?, ?)"
    )
    cassandra_session.execute(insert_stmt, (trained_at, artifact_uri, len(model.class_labels), len(compressed)))
    logger.info(f"Model metadata recorded in Cassandra -- artifact_uri={artifact_uri}")
    return artifact_uri


def load_latest_model_from_object_storage(cassandra_session, minio_client: Minio) -> TrainedModel | None:
    rows = list(cassandra_session.execute("SELECT trained_at, artifact_uri FROM cassandra_grpc_ml.models"))
    if not rows:
        return None
    latest = max(rows, key=lambda r: r.trained_at)
    bucket, object_name = latest.artifact_uri.removeprefix("s3://").split("/", 1)
    response = minio_client.get_object(bucket, object_name)
    try:
        compressed = response.read()
    finally:
        response.close()
        response.release_conn()
    decompressed = gzip.decompress(compressed)
    return joblib.load(io.BytesIO(decompressed))
