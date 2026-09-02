import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml_core import train_and_evaluate
from model_store import save_model, load_model, save_model_to_cassandra, load_latest_model_from_cassandra


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


class FakeRow:
    def __init__(self, trained_at, model_blob):
        self.trained_at = trained_at
        self.model_blob = model_blob


class FakeSession:
    """Fakes just enough of cassandra.cluster.Session for model_store's real
    usage: plain string execute() for SELECT, and prepare()+execute() for
    the INSERT (a real PreparedStatement -- see save_model_to_cassandra's
    docstring for why a prepared statement is used instead of %s-style
    parameter substitution)."""

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
            trained_at, model_blob = params
            self._rows.append(FakeRow(trained_at, model_blob))
            return []
        return list(self._rows)


def test_load_latest_model_from_cassandra_returns_none_when_no_rows():
    from model_store import load_latest_model_from_cassandra

    assert load_latest_model_from_cassandra(FakeSession()) is None


def test_save_then_load_from_cassandra_round_trips_predictions():
    from datetime import datetime, timezone

    from model_store import load_latest_model_from_cassandra, save_model_to_cassandra
    from ml_core import predict_one

    model = _tiny_trained_model()
    session = FakeSession()
    save_model_to_cassandra(model, session)

    assert len(session.inserted) == 1
    trained_at_param, blob_param = session.inserted[0]
    assert isinstance(trained_at_param, datetime)
    assert isinstance(blob_param, (bytes, bytearray))
    assert len(session.prepared_queries) == 1, (
        "save_model_to_cassandra must INSERT via a prepared statement, not a "
        "%s-style simple statement -- a simple statement hex-encodes the blob "
        "client-side, doubling its size on the wire and re-introducing the "
        "real Task 8 bug this fix exists to prevent (see the module docstring)"
    )
    assert "?" in session.prepared_queries[0]

    loaded = load_latest_model_from_cassandra(session)
    assert loaded is not None
    assert loaded.class_labels == model.class_labels
    assert predict_one(model, "cat meow") == predict_one(loaded, "cat meow")


def test_load_latest_model_from_cassandra_picks_the_newest_row():
    from datetime import datetime, timezone

    from model_store import load_latest_model_from_cassandra

    older_model = _tiny_trained_model()
    older_model.trained_at = "2020-01-01T00:00:00+00:00"
    newer_model = _tiny_trained_model()
    newer_model.trained_at = "2026-01-01T00:00:00+00:00"

    session = FakeSession()
    from model_store import save_model_to_cassandra

    save_model_to_cassandra(older_model, session)
    save_model_to_cassandra(newer_model, session)

    loaded = load_latest_model_from_cassandra(session)
    assert loaded.trained_at == "2026-01-01T00:00:00+00:00"


def test_save_model_to_cassandra_gzip_compresses_the_blob():
    """Regression test for the real bug found in Task 8 E2E verification:
    an uncompressed joblib dump of this project's real 50-class model landed
    around 45MB, well past Cassandra's default 16MB CQL message limit, so the
    INSERT silently failed (0 rows persisted) and newly-scaled worker pods
    never converged on the trained model. Confirms the stored blob is
    actually gzip-compressed (not a no-op) by checking the gzip magic
    header, independent of whether that particular model happens to shrink."""
    model = _tiny_trained_model()
    session = FakeSession()
    save_model_to_cassandra(model, session)

    _, blob = session.inserted[0]
    assert bytes(blob[:2]) == b"\x1f\x8b", "stored blob should be gzip-compressed (gzip magic header)"


def test_save_model_to_cassandra_round_trips_a_realistic_sized_model():
    """Mechanism check at a size shaped like this project's real model
    (TfidfVectorizer with a large vocabulary + a dense LogisticRegression
    coefficient matrix over many classes) -- the exact shape that produced
    the real ~45MB uncompressed blob that overflowed Cassandra's 16MB CQL
    message limit in Task 8's live E2E run (`cassandra.InvalidRequest:
    ... CQL Message of size 45335967 bytes exceeds allowed maximum of
    16777216 bytes`).

    This confirms the compress/decompress round trip works correctly at
    real scale (tens of MB) and that gzip does not simply no-op or corrupt
    the data. It intentionally does NOT assert a specific compression ratio
    or that the result lands under 16MB: gauging that requires an array with
    the actual statistical structure of trained model weights (this test
    uses independent Gaussian noise, which -- confirmed empirically while
    writing this test -- gzip barely shrinks, unlike the real trained
    weights). The real ratio was instead measured against the live cluster
    with an actual trained model; see task-8-fix-cassandra-report.md."""
    import io

    import joblib
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    from ml_core import TrainedModel
    from model_store import save_model_to_cassandra

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
    save_model_to_cassandra(model, session)
    _, compressed_blob = session.inserted[0]
    compressed_size = len(compressed_blob)

    # Sanity check this synthetic model is actually in the same ballpark as
    # the real one that broke in Task 8 (45,335,967 bytes uncompressed).
    assert raw_size > 15_000_000, f"synthetic model too small to be representative: {raw_size} bytes raw"
    print(f"\n[synthetic large-model check] raw={raw_size:,} bytes, compressed={compressed_size:,} bytes")

    # The round trip decompresses/deserializes correctly at this size, with
    # the large numeric arrays intact byte-for-byte.
    loaded = load_latest_model_from_cassandra(session)
    assert loaded.class_labels == model.class_labels
    assert loaded.vectorizer.vocabulary_ == model.vectorizer.vocabulary_
    np.testing.assert_array_equal(loaded.classifier.coef_, model.classifier.coef_)
