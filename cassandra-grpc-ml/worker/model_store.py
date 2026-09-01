from pathlib import Path

import joblib

from ml_core import TrainedModel

MODEL_FILENAME = "model.joblib"


def save_model(model: TrainedModel, store_dir: Path) -> None:
    store_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, store_dir / MODEL_FILENAME)


def load_model(store_dir: Path) -> TrainedModel | None:
    path = store_dir / MODEL_FILENAME
    if not path.exists():
        return None
    return joblib.load(path)
