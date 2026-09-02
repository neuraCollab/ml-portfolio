import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml_core import train_and_evaluate
from model_store import save_model, load_model


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
    def __init__(self):
        self.inserted = []
        self._rows = []

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
