import gzip
import io
import logging
from datetime import datetime
from pathlib import Path

import joblib

from ml_core import TrainedModel

logger = logging.getLogger(__name__)

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
    TrainedModel (vectorizer + classifier + class_labels) is joblib-dumped,
    gzip-compressed, and stored in one blob column, so every worker replica
    can load exactly the same model regardless of which pod trained it.

    Two compounding real bugs made this fail on this project's real 50-class
    model (see cassandra-grpc-ml/README.md for the fuller writeup):

    1. The raw joblib dump (TfidfVectorizer(max_features=50000) +
       LogisticRegression over ~50 classes, trained on 1,825 rows) is
       ~22.7MB (measured: 22,667,923 bytes). gzip brings that down to
       ~11.6MB (measured: 12,180,193 bytes, a 1.86x ratio) -- already under
       Cassandra's default 16MB native-protocol message limit on its own.
    2. But sending it via `session.execute(query_with_%s_placeholders,
       params)` (a "simple statement") made the driver inline the blob into
       the CQL text client-side as a "0x..." hex literal, which doubles its
       size on the wire -- so even the compressed 12.18MB blob produced a
       24.36MB CQL message (measured: "CQL Message of size 24360507 bytes
       exceeds allowed maximum of 16777216 bytes"), still over the limit.
       (For reference, this is also why the *original*, pre-gzip bug
       reported message sizes around ~45.3MB rather than the blob's real
       ~22.7MB -- that number was already hex-doubled by this same
       encoding, not the raw blob size.)

    Fixed here by combining gzip compression with a real prepared statement
    (see below), which sends the blob as raw binary instead of a hex
    literal -- confirmed live: with both fixes, the INSERT succeeds and the
    ~12.18MB compressed blob lands intact in Cassandra.

    Important caveat on the 1.86x compression ratio above: it was measured
    on a small 1,825-row dev sample, and does not generalize. A real
    production-scale training run (the default 40,000-row sample) measured
    a raw joblib dump of ~22.4MB compressing to only ~18.9MB (a much worse
    ~1.18x ratio -- a fuller, more realistic model's vectorizer/classifier
    weights compress less well than the small sample's). That ~18.9MB
    still exceeds Cassandra's 16MB native-protocol message limit even after
    compression and even as raw binary (no hex-doubling). This is a real,
    currently-open limitation, not a fixed one: compression plus the
    prepared-statement fix are necessary but not sufficient at this
    project's actual UI default sample size. A smaller sample size (e.g.
    2,000 rows) is confirmed to persist and propagate correctly across
    worker pods; at the 40,000-row default, the training pod continues to
    serve its freshly-trained model correctly from memory, but other (or
    newly-scaled) worker pods will not see it via Cassandra. See
    cassandra-grpc-ml/worker/server.py's TrainedModel-persistence exception
    handler for the corresponding non-fatal, intentional error-handling
    path, and cassandra-grpc-ml/README.md's "Known limitation" note."""
    buffer = io.BytesIO()
    joblib.dump(model, buffer)
    raw_bytes = buffer.getvalue()
    compressed = gzip.compress(raw_bytes)
    logger.info(
        f"Model blob for Cassandra: {len(raw_bytes):,} bytes raw -> "
        f"{len(compressed):,} bytes gzip-compressed "
        f"({len(raw_bytes) / len(compressed):.2f}x)"
    )
    trained_at = datetime.fromisoformat(model.trained_at)
    # Deliberately a *prepared* statement (`?` placeholders + session.prepare),
    # not session.execute(query_with_%s_placeholders, params). The latter
    # (a "simple statement") makes the driver inline parameters into the CQL
    # text client-side via cassandra.query.bind_params, which renders a blob
    # as a "0x..." hex literal -- doubling its size on the wire. A prepared
    # statement sends the blob as raw binary in the protocol frame instead.
    # Confirmed empirically: a %s-style INSERT of a 12.18MB compressed blob
    # produced a 24.36MB CQL message (server error: "CQL Message of size
    # 24360507 bytes exceeds allowed maximum of 16777216 bytes") -- almost
    # exactly 2x, matching hex-encoding overhead, not the blob itself.
    insert_stmt = session.prepare(
        "INSERT INTO cassandra_grpc_ml.models (id, trained_at, model_blob) VALUES (now(), ?, ?)"
    )
    session.execute(insert_stmt, (trained_at, compressed))


def load_latest_model_from_cassandra(session) -> TrainedModel | None:
    rows = list(session.execute("SELECT trained_at, model_blob FROM cassandra_grpc_ml.models"))
    if not rows:
        return None
    latest = max(rows, key=lambda r: r.trained_at)
    decompressed = gzip.decompress(latest.model_blob)
    return joblib.load(io.BytesIO(decompressed))
