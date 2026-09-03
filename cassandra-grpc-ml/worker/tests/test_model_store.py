import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml_core import train_and_evaluate
from model_store import save_model, load_model, save_model_to_object_storage, load_latest_model_from_object_storage


def _tiny_trained_model():
    texts = ["cat meow", "dog bark", "cat purr", "dog woof"]
    labels = [0, 1, 0, 1]
    model, _ = train_and_evaluate(texts, labels, texts, labels, {0: "cats", 1: "dogs"})
    return model


def test_load_model_returns_none_when_nothing_saved(tmp_path):
    assert load_model(tmp_path) is None


def test_save_then_load_round_trips_predictions(tmp_path):
    model = _tiny_trained_model()
    save_model(model, tmp_path)

    loaded = load_model(tmp_path)
    assert loaded is not None
    assert loaded.class_labels == {0: "cats", 1: "dogs"}
    assert loaded.trained_at == model.trained_at

    from ml_core import predict_one
    original_pred = predict_one(model, "cat meow")
    loaded_pred = predict_one(loaded, "cat meow")
    assert original_pred == loaded_pred


BUCKET = "cassandra-grpc-ml-models"


class FakeRow:
    def __init__(self, trained_at, artifact_uri):
        self.trained_at = trained_at
        self.artifact_uri = artifact_uri


class FakeSession:
    """Fakes just enough of cassandra.cluster.Session for model_store's real
    usage: plain string execute() for SELECT, and prepare()+execute() for
    the INSERT of a small metadata row (id, trained_at, artifact_uri,
    num_classes, size_bytes) -- the model artifact itself no longer goes
    through Cassandra at all, see save_model_to_object_storage's docstring."""

    def __init__(self):
        self.inserted = []
        self._rows = []
        self.prepared_queries = []

    def prepare(self, query):
        self.prepared_queries.append(query)
        return query  # good enough for this fake: execute() below just needs *a* query string back

    def execute(self, query, params=None):
        if query.strip().upper().startswith("INSERT"):
            self.inserted.append(params)
            trained_at, artifact_uri, _num_classes, _size_bytes = params
            self._rows.append(FakeRow(trained_at, artifact_uri))
            return []
        return list(self._rows)


class FakeMinioResponse:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data

    def close(self):
        pass

    def release_conn(self):
        pass


class FakeMinioClient:
    """Fakes just enough of minio.Minio for model_store's real usage:
    idempotent bucket creation, put_object storing bytes in memory, and
    get_object returning a stream-like response."""

    def __init__(self):
        self._buckets: set[str] = set()
        self.objects: dict[tuple[str, str], bytes] = {}
        self.put_calls: list[tuple[str, str, int]] = []

    def bucket_exists(self, bucket: str) -> bool:
        return bucket in self._buckets

    def make_bucket(self, bucket: str) -> None:
        self._buckets.add(bucket)

    def put_object(self, bucket, object_name, data, length, content_type=None):
        self.objects[(bucket, object_name)] = data.read()
        self.put_calls.append((bucket, object_name, length))

    def get_object(self, bucket, object_name):
        return FakeMinioResponse(self.objects[(bucket, object_name)])


def test_load_latest_model_from_object_storage_returns_none_when_no_rows():
    assert load_latest_model_from_object_storage(FakeSession(), FakeMinioClient()) is None


def test_save_then_load_from_object_storage_round_trips_predictions():
    from datetime import datetime

    from ml_core import predict_one

    model = _tiny_trained_model()
    session = FakeSession()
    minio_client = FakeMinioClient()
    artifact_uri = save_model_to_object_storage(model, session, minio_client, BUCKET)

    assert artifact_uri.startswith(f"s3://{BUCKET}/")
    assert len(session.inserted) == 1
    trained_at_param, artifact_uri_param, num_classes_param, size_bytes_param = session.inserted[0]
    assert isinstance(trained_at_param, datetime)
    assert artifact_uri_param == artifact_uri
    assert num_classes_param == len(model.class_labels)
    assert isinstance(size_bytes_param, int)
    assert len(session.prepared_queries) == 1, (
        "save_model_to_object_storage must INSERT the metadata row via a "
        "prepared statement (kept for consistency/safety even though the "
        "row is now small, see the module docstring for the historical bug "
        "this pattern originally fixed)"
    )
    assert "?" in session.prepared_queries[0]
    assert len(minio_client.put_calls) == 1, "the artifact must be uploaded to MinIO exactly once"

    loaded = load_latest_model_from_object_storage(session, minio_client)
    assert loaded is not None
    assert loaded.class_labels == model.class_labels
    assert predict_one(model, "cat meow") == predict_one(loaded, "cat meow")


def test_load_latest_model_from_object_storage_picks_the_newest_row():
    older_model = _tiny_trained_model()
    older_model.trained_at = "2020-01-01T00:00:00+00:00"
    newer_model = _tiny_trained_model()
    newer_model.trained_at = "2026-01-01T00:00:00+00:00"

    session = FakeSession()
    minio_client = FakeMinioClient()

    save_model_to_object_storage(older_model, session, minio_client, BUCKET)
    save_model_to_object_storage(newer_model, session, minio_client, BUCKET)

    loaded = load_latest_model_from_object_storage(session, minio_client)
    assert loaded.trained_at == "2026-01-01T00:00:00+00:00"


def test_save_model_to_object_storage_gzip_compresses_the_artifact():
    """Regression test for the real Cassandra message-size bug this project
    hit before moving model artifacts to MinIO (see cassandra-grpc-ml/README.md):
    confirms the object uploaded to MinIO is actually gzip-compressed (not a
    no-op) by checking the gzip magic header."""
    model = _tiny_trained_model()
    session = FakeSession()
    minio_client = FakeMinioClient()
    save_model_to_object_storage(model, session, minio_client, BUCKET)

    (bucket, object_name, _length), = minio_client.put_calls
    stored = minio_client.objects[(bucket, object_name)]
    assert stored[:2] == b"\x1f\x8b", "stored artifact should be gzip-compressed (gzip magic header)"


def test_save_model_to_object_storage_round_trips_a_realistic_sized_model():
    """Mechanism check at a size shaped like this project's real model
    (TfidfVectorizer with a large vocabulary + a dense LogisticRegression
    coefficient matrix over many classes) -- the exact shape that produced a
    real ~22MB+ raw serialized blob in practice, well past what Cassandra's
    16MB CQL message limit could ever hold directly (the reason this project
    moved the artifact to MinIO -- see cassandra-grpc-ml/README.md). MinIO
    objects have no such ceiling; this test confirms the compress/decompress
    round trip through MinIO still works correctly at real scale (tens of
    MB) and that gzip does not simply no-op or corrupt the data."""
    import io

    import joblib
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    from ml_core import TrainedModel

    rng = np.random.RandomState(42)
    num_classes = 50
    vocab_size = 50_000

    vectorizer = TfidfVectorizer(max_features=vocab_size, ngram_range=(1, 2))
    vectorizer.vocabulary_ = {f"token_{i}": i for i in range(vocab_size)}
    vectorizer.idf_ = rng.normal(loc=5.0, scale=1.5, size=vocab_size).astype(np.float64)

    classifier = LogisticRegression(max_iter=200, solver="lbfgs")
    classifier.classes_ = np.arange(num_classes)
    classifier.coef_ = rng.normal(loc=0.0, scale=0.05, size=(num_classes, vocab_size)).astype(np.float64)
    classifier.intercept_ = rng.normal(loc=0.0, scale=0.05, size=num_classes).astype(np.float64)
    classifier.n_features_in_ = vocab_size

    model = TrainedModel(
        vectorizer=vectorizer,
        classifier=classifier,
        class_labels={i: f"class_{i}" for i in range(num_classes)},
    )

    raw_buffer = io.BytesIO()
    joblib.dump(model, raw_buffer)
    raw_size = len(raw_buffer.getvalue())

    session = FakeSession()
    minio_client = FakeMinioClient()
    save_model_to_object_storage(model, session, minio_client, BUCKET)
    (bucket, object_name, _length), = minio_client.put_calls
    compressed_size = len(minio_client.objects[(bucket, object_name)])

    # Sanity check this synthetic model is actually in the same ballpark as
    # the real one that motivated the move to MinIO.
    assert raw_size > 15_000_000, f"synthetic model too small to be representative: {raw_size} bytes raw"
    print(f"\n[synthetic large-model check] raw={raw_size:,} bytes, compressed={compressed_size:,} bytes")

    # The round trip decompresses/deserializes correctly at this size, with
    # the large numeric arrays intact byte-for-byte.
    loaded = load_latest_model_from_object_storage(session, minio_client)
    assert loaded.class_labels == model.class_labels
    assert loaded.vectorizer.vocabulary_ == model.vectorizer.vocabulary_
    np.testing.assert_array_equal(loaded.classifier.coef_, model.classifier.coef_)
