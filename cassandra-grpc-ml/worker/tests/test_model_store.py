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
