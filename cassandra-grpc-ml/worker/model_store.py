import io
from datetime import datetime
from pathlib import Path

import joblib

from ml_core import TrainedModel

MODEL_FILENAME = "model.joblib"


def save_model(model: TrainedModel, store_dir: Path) -> None:
    """Dev/test-only local-file persistence -- what test_model_store.py's
    tmp_path-based tests exercise, and what `python server.py` falls back to
    for standalone local debugging outside the cluster. The deployed
    in-cluster worker uses save_model_to_cassandra instead (see
    docs/superpowers/specs/2026-09-02-cassandra-grpc-k8s-design.md)."""
    store_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, store_dir / MODEL_FILENAME)


def load_model(store_dir: Path) -> TrainedModel | None:
    path = store_dir / MODEL_FILENAME
    if not path.exists():
        return None
    return joblib.load(path)


def save_model_to_cassandra(model: TrainedModel, session) -> None:
    """Real persistence path for the deployed in-cluster worker: the whole
    TrainedModel (vectorizer + classifier + class_labels) is joblib-dumped
    into one blob column, so every worker replica can load exactly the same
    model regardless of which pod trained it."""
    buffer = io.BytesIO()
    joblib.dump(model, buffer)
    trained_at = datetime.fromisoformat(model.trained_at)
    session.execute(
        "INSERT INTO cassandra_grpc_ml.models (id, trained_at, model_blob) "
        "VALUES (now(), %s, %s)",
        (trained_at, buffer.getvalue()),
    )


def load_latest_model_from_cassandra(session) -> TrainedModel | None:
    rows = list(session.execute("SELECT trained_at, model_blob FROM cassandra_grpc_ml.models"))
    if not rows:
        return None
    latest = max(rows, key=lambda r: r.trained_at)
    return joblib.load(io.BytesIO(latest.model_blob))
