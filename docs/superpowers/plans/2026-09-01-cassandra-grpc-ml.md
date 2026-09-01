# Cassandra + gRPC ML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th portfolio project — a real Cassandra + gRPC distributed ML pipeline that trains and serves a topic classifier over the existing `AutoTopic/data/raw/labeled_requests.parquet` dataset — into the existing unified React/FastAPI portfolio, with its own Docker services, backend routes, and frontend workspace.

**Architecture:** A new `grpc-worker` Python container owns a TF-IDF + LogisticRegression model and exposes `Predict`/`Train`/`GetStatus` over real gRPC; the existing FastAPI `backend` acts as the client-facing gateway and coordinator, calling the worker over gRPC and reading/writing a new `cassandra_grpc_ml` keyspace in a new `cassandra` container. The frontend gets a new workspace tab that mirrors the layout of the existing three (single scrolling page with clearly separated sections, not internal sub-tabs — matching `ECGWorkspace.tsx`'s established convention).

**Tech Stack:** Python `grpcio`/`grpcio-tools`, `cassandra-driver`, `scikit-learn` (worker); FastAPI, Pydantic, `cassandra-driver`, `grpcio` (backend, reusing existing service/route/schema layering); React/TypeScript/Tailwind (frontend, reusing existing component/type/API-client conventions); Cassandra 5 official Docker image; Docker Compose.

**Spec:** [docs/superpowers/specs/2026-09-01-cassandra-grpc-ml-design.md](../specs/2026-09-01-cassandra-grpc-ml-design.md)

## Global Constraints

- Dataset: `AutoTopic/data/raw/labeled_requests.parquet` (373,657 real rows; columns `log_text, cleaned_text, lemmatized_text, topic_id, topic_name`), gitignored, must be present on disk locally — never fabricate a substitute.
- Ingestion sample size: capped at **40,000 rows**, stratified proportionally by `topic_id`, 90/10 train/test split per class. Configurable via `CASSANDRA_GRPC_SAMPLE_SIZE` env var.
- Model: `TfidfVectorizer` + `LogisticRegression(multi_class="multinomial")` — no other model family.
- Confusion matrix / top-classes display: limited to **top 15 classes by test-set support** (`TOP_N_CONFUSION_CLASSES = 15`), same disclosure pattern as `frontend/src/components/ecg/StaticResultsSection.tsx`'s `notableClasses`.
- No authentication/credentials anywhere in this project (dev-mode Cassandra, matches the original repo's own dev setup) — never introduce placeholder credentials.
- Original C++ crawler source is **not** included in this repository (user's explicit choice).
- Kubernetes manifests are adapted for completeness but **not deployed or verified** in this environment — must be clearly labeled as unverified reference material in the manifests themselves and in the README.
- No existing automated test suite exists anywhere in this repo (confirmed: zero `test_*.py` / `*.test.tsx` files). This plan introduces a **minimal** pytest suite scoped only to pure-function logic that needs no live Cassandra/gRPC/Docker (ML training math, stratified sampling, schema validation) — everything else (gRPC wiring, Cassandra I/O, Docker, frontend) is verified live via `docker compose` + `curl` + the browser, consistent with how the other 3 projects were verified.
- No local Python interpreter exists on the host (confirmed: only a Windows Store stub) — every command in this plan that runs Python runs it inside Docker (either a throwaway `docker run` for isolated unit tests, or `docker compose exec`/`docker compose run` once services exist).
- All new frontend code follows the existing dark-slate theme; this project's accent color is **cyan** (`text-cyan-400` / `from-cyan-600 to-sky-700`), distinct from AutoTopic (indigo), Autopilot (emerald), ECG (rose).
- camelCase field names in all Pydantic schemas and TypeScript interfaces (matches every existing schema in this repo).

---

## Task 1: Proto definition + stub generation sanity check

**Files:**
- Create: `cassandra-grpc-ml/proto/ml_worker.proto`

**Interfaces:**
- Produces: the `MLWorker` gRPC service contract (`Predict`, `Train`, `GetStatus` RPCs and all message types) that Tasks 2, 4, 9, 10 depend on.

- [ ] **Step 1: Create the proto file**

```protobuf
syntax = "proto3";

package ml_worker;

service MLWorker {
  rpc Predict(PredictRequest) returns (PredictResponse);
  rpc Train(TrainRequest) returns (TrainResponse);
  rpc GetStatus(StatusRequest) returns (StatusResponse);
}

message PredictRequest {
  string text = 1;
}

message PredictResponse {
  int32 topic_id = 1;
  string topic_name = 2;
  double confidence = 3;
  double latency_ms = 4;
}

message TrainRequest {
  int32 sample_size = 1;
}

message ClassSupport {
  int32 topic_id = 1;
  string topic_name = 2;
  int32 support = 3;
}

message ConfusionMatrixEntry {
  int32 true_topic_id = 1;
  int32 predicted_topic_id = 2;
  int32 count = 3;
}

message TrainResponse {
  bool success = 1;
  string message = 2;
  int32 num_classes = 3;
  int32 train_rows = 4;
  int32 test_rows = 5;
  double accuracy = 6;
  double macro_precision = 7;
  double macro_recall = 8;
  double macro_f1 = 9;
  double micro_precision = 10;
  double micro_recall = 11;
  double micro_f1 = 12;
  double training_time_seconds = 13;
  repeated ClassSupport top_classes = 14;
  repeated ConfusionMatrixEntry confusion_matrix = 15;
}

message StatusRequest {}

message StatusResponse {
  bool model_loaded = 1;
  int32 num_classes = 2;
  string trained_at = 3; // ISO8601, or "" if never trained
}
```

- [ ] **Step 2: Verify the proto compiles standalone**

Run (from repo root, git-bash):

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/proto:/proto" -w /proto python:3.11-slim \
  bash -c "pip install --no-cache-dir -q grpcio-tools==1.67.1 && python -m grpc_tools.protoc -I . --python_out=/tmp --grpc_python_out=/tmp ml_worker.proto && ls /tmp/ml_worker_pb2*.py"
```

Expected: prints `/tmp/ml_worker_pb2.py` and `/tmp/ml_worker_pb2_grpc.py` with no errors.

- [ ] **Step 3: Commit**

```bash
git add cassandra-grpc-ml/proto/ml_worker.proto
git commit -m "Add ml_worker.proto for the Cassandra+gRPC ML project"
```

---

## Task 2: Worker ML core (pure training/inference logic) + unit tests

**Files:**
- Create: `cassandra-grpc-ml/worker/ml_core.py`
- Create: `cassandra-grpc-ml/worker/tests/test_ml_core.py`

**Interfaces:**
- Consumes: nothing (pure function module, no I/O).
- Produces: `TrainedModel` dataclass (`vectorizer`, `classifier`, `class_labels: dict[int,str]`, `trained_at: str`), `TrainMetrics` dataclass (see fields below), `train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names) -> tuple[TrainedModel, TrainMetrics]`, `predict_one(model, text) -> tuple[int, str, float]`. `server.py` (Task 4) and `test_ml_core.py` both depend on these exact names.

- [ ] **Step 1: Write the failing tests**

```python
# cassandra-grpc-ml/worker/tests/test_ml_core.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml_core import train_and_evaluate, predict_one, TOP_N_CONFUSION_CLASSES


def _synthetic_dataset():
    # 4 classes, 20 rows each, distinct vocabulary per class so a linear
    # classifier can separate them perfectly -- this test checks metric
    # plumbing/shapes, not model quality.
    label_names = {0: "cats", 1: "dogs", 2: "cars", 3: "boats"}
    words = {0: "cat meow feline kitten", 1: "dog bark canine puppy",
             2: "car engine wheel drive", 3: "boat sail ocean anchor"}
    train_texts, train_labels, test_texts, test_labels = [], [], [], []
    for label, phrase in words.items():
        for i in range(16):
            train_texts.append(f"{phrase} sample {i}")
            train_labels.append(label)
        for i in range(4):
            test_texts.append(f"{phrase} sample {i}")
            test_labels.append(label)
    return train_texts, train_labels, test_texts, test_labels, label_names


def test_train_and_evaluate_returns_correct_shapes_and_high_accuracy():
    train_texts, train_labels, test_texts, test_labels, label_names = _synthetic_dataset()
    model, metrics = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)

    assert metrics.num_classes == 4
    assert metrics.train_rows == 64
    assert metrics.test_rows == 16
    assert metrics.accuracy > 0.9  # trivially separable synthetic data
    assert 0.0 <= metrics.macro_f1 <= 1.0
    assert 0.0 <= metrics.micro_f1 <= 1.0
    assert len(metrics.top_classes) == 4  # fewer classes than TOP_N_CONFUSION_CLASSES
    assert all(c["support"] == 4 for c in metrics.top_classes)
    assert metrics.training_time_seconds >= 0.0
    assert model.class_labels == label_names


def test_train_and_evaluate_caps_confusion_matrix_to_top_n_classes():
    # 20 classes, 1 test row each -- top_classes must be capped at TOP_N_CONFUSION_CLASSES.
    label_names = {i: f"class_{i}" for i in range(20)}
    train_texts, train_labels, test_texts, test_labels = [], [], [], []
    for i in range(20):
        for _ in range(3):
            train_texts.append(f"word{i} filler token")
            train_labels.append(i)
        test_texts.append(f"word{i} filler token")
        test_labels.append(i)

    _, metrics = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)
    assert len(metrics.top_classes) == TOP_N_CONFUSION_CLASSES
    assert metrics.num_classes == 20
    seen_pairs = {(e["trueTopicId"], e["predictedTopicId"]) for e in metrics.confusion_matrix}
    top_ids = {c["topicId"] for c in metrics.top_classes}
    assert all(true_id in top_ids and pred_id in top_ids for true_id, pred_id in seen_pairs)


def test_train_and_evaluate_rejects_empty_splits():
    import pytest
    with pytest.raises(ValueError):
        train_and_evaluate([], [], ["x"], [0], {0: "a"})


def test_predict_one_returns_a_known_label():
    train_texts, train_labels, test_texts, test_labels, label_names = _synthetic_dataset()
    model, _ = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)

    topic_id, topic_name, confidence = predict_one(model, "cat meow feline kitten sample 99")
    assert topic_id == 0
    assert topic_name == "cats"
    assert 0.0 <= confidence <= 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/worker:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q scikit-learn numpy pytest && pytest tests/test_ml_core.py -v"
```

Expected: FAIL with `ModuleNotFoundError: No module named 'ml_core'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```python
# cassandra-grpc-ml/worker/ml_core.py
"""Pure ML logic for the Cassandra+gRPC topic classifier -- no Cassandra or
gRPC I/O here (see server.py for that), so this is unit-testable in
isolation. Distills AutoTopic's slow unsupervised BERTopic clustering into a
fast supervised classifier: TF-IDF + multinomial LogisticRegression trained
on real (text, topic_id) pairs from AutoTopic/data/raw/labeled_requests.parquet.
"""
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

# With ~60 real topic classes, a full NxN confusion matrix is impractical to
# render -- restricting to the top-15 by test-set support matches the
# "notable classes" disclosure pattern already used in the ECG project's
# static results section (frontend/src/components/ecg/StaticResultsSection.tsx).
TOP_N_CONFUSION_CLASSES = 15


@dataclass
class TrainedModel:
    vectorizer: TfidfVectorizer
    classifier: LogisticRegression
    class_labels: dict[int, str]
    trained_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class TrainMetrics:
    num_classes: int
    train_rows: int
    test_rows: int
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    micro_precision: float
    micro_recall: float
    micro_f1: float
    training_time_seconds: float
    top_classes: list[dict]
    confusion_matrix: list[dict]


def train_and_evaluate(
    train_texts: list[str],
    train_labels: list[int],
    test_texts: list[str],
    test_labels: list[int],
    label_names: dict[int, str],
) -> tuple[TrainedModel, TrainMetrics]:
    if not train_texts or not test_texts:
        raise ValueError("train_texts and test_texts must both be non-empty")

    start = time.time()
    vectorizer = TfidfVectorizer(max_features=50000, ngram_range=(1, 2), min_df=1)
    X_train = vectorizer.fit_transform(train_texts)
    classifier = LogisticRegression(max_iter=200, multi_class="multinomial", n_jobs=-1)
    classifier.fit(X_train, train_labels)
    training_time = time.time() - start

    X_test = vectorizer.transform(test_texts)
    predictions = classifier.predict(X_test)

    accuracy = float(accuracy_score(test_labels, predictions))
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        test_labels, predictions, average="macro", zero_division=0
    )
    micro_p, micro_r, micro_f1, _ = precision_recall_fscore_support(
        test_labels, predictions, average="micro", zero_division=0
    )

    test_labels_arr = np.array(test_labels)
    unique, counts = np.unique(test_labels_arr, return_counts=True)
    support_by_label = dict(zip(unique.tolist(), counts.tolist()))
    top_label_ids = sorted(support_by_label, key=lambda l: support_by_label[l], reverse=True)[:TOP_N_CONFUSION_CLASSES]
    top_classes = [
        {"topicId": int(l), "topicName": label_names.get(int(l), str(l)), "support": int(support_by_label[l])}
        for l in top_label_ids
    ]

    mask = np.isin(test_labels_arr, top_label_ids)
    filtered_true = test_labels_arr[mask]
    filtered_pred = predictions[mask]
    cm = confusion_matrix(filtered_true, filtered_pred, labels=top_label_ids)
    confusion_entries = []
    for i, true_id in enumerate(top_label_ids):
        for j, pred_id in enumerate(top_label_ids):
            count = int(cm[i, j])
            if count > 0:
                confusion_entries.append({"trueTopicId": int(true_id), "predictedTopicId": int(pred_id), "count": count})

    metrics = TrainMetrics(
        num_classes=len(label_names),
        train_rows=len(train_texts),
        test_rows=len(test_texts),
        accuracy=accuracy,
        macro_precision=float(macro_p),
        macro_recall=float(macro_r),
        macro_f1=float(macro_f1),
        micro_precision=float(micro_p),
        micro_recall=float(micro_r),
        micro_f1=float(micro_f1),
        training_time_seconds=training_time,
        top_classes=top_classes,
        confusion_matrix=confusion_entries,
    )
    model = TrainedModel(vectorizer=vectorizer, classifier=classifier, class_labels=label_names)
    return model, metrics


def predict_one(model: TrainedModel, text: str) -> tuple[int, str, float]:
    X = model.vectorizer.transform([text])
    proba = model.classifier.predict_proba(X)[0]
    idx = int(np.argmax(proba))
    topic_id = int(model.classifier.classes_[idx])
    confidence = float(proba[idx])
    topic_name = model.class_labels.get(topic_id, str(topic_id))
    return topic_id, topic_name, confidence
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/worker:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q scikit-learn numpy pytest && pytest tests/test_ml_core.py -v"
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add cassandra-grpc-ml/worker/ml_core.py cassandra-grpc-ml/worker/tests/test_ml_core.py
git commit -m "Add worker ML core (TF-IDF + LogisticRegression train/eval/predict) with unit tests"
```

---

## Task 3: Worker model persistence + unit tests

**Files:**
- Create: `cassandra-grpc-ml/worker/model_store.py`
- Create: `cassandra-grpc-ml/worker/tests/test_model_store.py`

**Interfaces:**
- Consumes: `TrainedModel` from Task 2 (`ml_core.py`).
- Produces: `save_model(model: TrainedModel, store_dir: Path) -> None`, `load_model(store_dir: Path) -> TrainedModel | None`. Task 4's `server.py` calls these with `store_dir=Path(os.environ.get("MODEL_STORE_DIR", "/app/model_store"))`.

- [ ] **Step 1: Write the failing test**

```python
# cassandra-grpc-ml/worker/tests/test_model_store.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/worker:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q scikit-learn numpy pytest joblib && pytest tests/test_model_store.py -v"
```

Expected: FAIL with `ModuleNotFoundError: No module named 'model_store'`.

- [ ] **Step 3: Write the implementation**

```python
# cassandra-grpc-ml/worker/model_store.py
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/worker:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q scikit-learn numpy pytest joblib && pytest tests/test_model_store.py -v"
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add cassandra-grpc-ml/worker/model_store.py cassandra-grpc-ml/worker/tests/test_model_store.py
git commit -m "Add worker model persistence (joblib save/load) with unit tests"
```

---

## Task 4: Worker gRPC server

**Files:**
- Create: `cassandra-grpc-ml/worker/server.py`

**Interfaces:**
- Consumes: `train_and_evaluate`, `predict_one` (Task 2); `save_model`, `load_model` (Task 3); `ml_worker_pb2`, `ml_worker_pb2_grpc` (generated from Task 1's proto at Docker build time in Task 5).
- Produces: the running `MLWorker` gRPC service that Task 10 (`backend/app/services/cassandra_grpc_service.py`) calls as a client. Reads Cassandra table `cassandra_grpc_ml.requests` (columns `cleaned_text, topic_id, topic_name, split`) — this table is created by Task 9's schema statements, so this task's `Train` RPC will fail gracefully (not crash) if that table doesn't exist yet or is empty.

This task is glue code (real Cassandra + real gRPC networking) with no pure-function surface left to unit test in isolation — it's verified live in Task 13 once the worker, Cassandra, and backend are all running together.

- [ ] **Step 1: Write the gRPC server**

```python
# cassandra-grpc-ml/worker/server.py
import logging
import os
import time
from concurrent import futures
from pathlib import Path

import grpc
from cassandra.cluster import Cluster

import ml_worker_pb2
import ml_worker_pb2_grpc
from ml_core import predict_one, train_and_evaluate
from model_store import load_model, save_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

CASSANDRA_HOST = os.environ.get("CASSANDRA_HOST", "cassandra")
GRPC_PORT = int(os.environ.get("GRPC_PORT", "50061"))
MODEL_STORE_DIR = Path(os.environ.get("MODEL_STORE_DIR", "/app/model_store"))
KEYSPACE = "cassandra_grpc_ml"


def _cassandra_session():
    cluster = Cluster([CASSANDRA_HOST])
    session = cluster.connect(KEYSPACE)
    return cluster, session


class MLWorkerServicer(ml_worker_pb2_grpc.MLWorkerServicer):
    def __init__(self):
        self._model = load_model(MODEL_STORE_DIR)
        if self._model:
            logger.info(f"Loaded persisted model trained at {self._model.trained_at} ({len(self._model.class_labels)} classes)")
        else:
            logger.info("No persisted model found -- waiting for a Train call.")

    def GetStatus(self, request, context):
        return ml_worker_pb2.StatusResponse(
            model_loaded=self._model is not None,
            num_classes=len(self._model.class_labels) if self._model else 0,
            trained_at=self._model.trained_at if self._model else "",
        )

    def Predict(self, request, context):
        if self._model is None:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details("No trained model available -- call Train first.")
            return ml_worker_pb2.PredictResponse()
        start = time.time()
        topic_id, topic_name, confidence = predict_one(self._model, request.text)
        latency_ms = (time.time() - start) * 1000
        return ml_worker_pb2.PredictResponse(
            topic_id=topic_id, topic_name=topic_name, confidence=confidence, latency_ms=latency_ms,
        )

    def Train(self, request, context):
        try:
            cluster, session = _cassandra_session()
        except Exception as exc:
            logger.exception("Could not connect to Cassandra for training")
            context.set_code(grpc.StatusCode.UNAVAILABLE)
            context.set_details(f"Could not connect to Cassandra: {exc}")
            return ml_worker_pb2.TrainResponse(success=False, message=str(exc))

        try:
            rows = list(session.execute("SELECT cleaned_text, topic_id, topic_name, split FROM requests"))
        finally:
            cluster.shutdown()

        if not rows:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details("No ingested rows found in Cassandra -- has the backend run ingestion yet?")
            return ml_worker_pb2.TrainResponse(success=False, message="No data ingested yet")

        train_texts, train_labels, test_texts, test_labels = [], [], [], []
        label_names: dict[int, str] = {}
        for row in rows:
            label_names[row.topic_id] = row.topic_name
            if row.split == "train":
                train_texts.append(row.cleaned_text)
                train_labels.append(row.topic_id)
            else:
                test_texts.append(row.cleaned_text)
                test_labels.append(row.topic_id)

        try:
            model, metrics = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)
        except ValueError as exc:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details(str(exc))
            return ml_worker_pb2.TrainResponse(success=False, message=str(exc))

        save_model(model, MODEL_STORE_DIR)
        self._model = model
        logger.info(f"Trained on {metrics.train_rows} rows, evaluated on {metrics.test_rows} rows, accuracy={metrics.accuracy:.3f}")

        return ml_worker_pb2.TrainResponse(
            success=True,
            message=f"Trained on {metrics.train_rows} rows, evaluated on {metrics.test_rows} rows.",
            num_classes=metrics.num_classes,
            train_rows=metrics.train_rows,
            test_rows=metrics.test_rows,
            accuracy=metrics.accuracy,
            macro_precision=metrics.macro_precision,
            macro_recall=metrics.macro_recall,
            macro_f1=metrics.macro_f1,
            micro_precision=metrics.micro_precision,
            micro_recall=metrics.micro_recall,
            micro_f1=metrics.micro_f1,
            training_time_seconds=metrics.training_time_seconds,
            top_classes=[
                ml_worker_pb2.ClassSupport(topic_id=c["topicId"], topic_name=c["topicName"], support=c["support"])
                for c in metrics.top_classes
            ],
            confusion_matrix=[
                ml_worker_pb2.ConfusionMatrixEntry(
                    true_topic_id=e["trueTopicId"], predicted_topic_id=e["predictedTopicId"], count=e["count"]
                )
                for e in metrics.confusion_matrix
            ],
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    ml_worker_pb2_grpc.add_MLWorkerServicer_to_server(MLWorkerServicer(), server)
    server.add_insecure_port(f"[::]:{GRPC_PORT}")
    server.start()
    logger.info(f"MLWorker gRPC server listening on :{GRPC_PORT}")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
```

- [ ] **Step 2: Commit**

```bash
git add cassandra-grpc-ml/worker/server.py
git commit -m "Add worker gRPC server (Predict/Train/GetStatus)"
```

---

## Task 5: Worker Dockerfile + requirements

**Files:**
- Create: `cassandra-grpc-ml/worker/requirements.txt`
- Create: `cassandra-grpc-ml/worker/Dockerfile`

**Interfaces:**
- Consumes: `cassandra-grpc-ml/proto/ml_worker.proto` (Task 1), `ml_core.py`/`model_store.py`/`server.py` (Tasks 2-4).
- Produces: a buildable `grpc-worker` image, referenced by `docker-compose.yml` in Task 12.

- [ ] **Step 1: Write requirements.txt**

```
grpcio>=1.62,<1.68
grpcio-tools>=1.62,<1.68
cassandra-driver>=3.29,<4.0
scikit-learn>=1.3.0
numpy>=1.24,<2.0
joblib>=1.3.0
```

- [ ] **Step 2: Write the Dockerfile**

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY cassandra-grpc-ml/worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY cassandra-grpc-ml/proto ./proto
RUN python -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/ml_worker.proto

COPY cassandra-grpc-ml/worker/ml_core.py cassandra-grpc-ml/worker/model_store.py cassandra-grpc-ml/worker/server.py ./

ENV PYTHONUNBUFFERED=1
EXPOSE 50061

CMD ["python", "server.py"]
```

- [ ] **Step 3: Verify the image builds standalone**

```bash
docker build -f cassandra-grpc-ml/worker/Dockerfile -t cassandra-grpc-worker-test .
```

Expected: builds successfully (it will not run correctly yet without a live Cassandra to connect to at startup — `server.py`'s `__init__` only reads the local model store, not Cassandra, so the container will start and idle waiting for RPCs; full behavior is verified in Task 13).

- [ ] **Step 4: Commit**

```bash
git add cassandra-grpc-ml/worker/requirements.txt cassandra-grpc-ml/worker/Dockerfile
git commit -m "Add grpc-worker Dockerfile"
```

---

## Task 6: Backend config + dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`

**Interfaces:**
- Produces: `CASSANDRA_GRPC_DATASET_PATH`, `CASSANDRA_GRPC_SAMPLE_SIZE`, `CASSANDRA_HOST`, `GRPC_WORKER_ADDRESS` constants consumed by Task 9's `cassandra_grpc_service.py`.

- [ ] **Step 1: Add dependencies to backend/requirements.txt**

Append to the end of `backend/requirements.txt`:

```

# Cassandra + gRPC ML project
grpcio>=1.62,<1.68
grpcio-tools>=1.62,<1.68
cassandra-driver>=3.29,<4.0
```

- [ ] **Step 2: Add config constants**

In `backend/app/core/config.py`, append after the existing `ECG_MAX_EVAL_SAMPLES` line:

```python

# Cassandra + gRPC ML project: reuses AutoTopic's real labeled dataset (see
# AutoTopic/data/README.md) to train a fast supervised topic classifier
# served over gRPC by the grpc-worker container, backed by a Cassandra
# keyspace. See cassandra-grpc-ml/README.md for the full architecture.
CASSANDRA_GRPC_DATASET_PATH = os.environ.get(
    "CASSANDRA_GRPC_DATASET_PATH", "AutoTopic/data/raw/labeled_requests.parquet"
)
CASSANDRA_GRPC_SAMPLE_SIZE = int(os.environ.get("CASSANDRA_GRPC_SAMPLE_SIZE", "40000"))
CASSANDRA_HOST = os.environ.get("CASSANDRA_HOST", "cassandra")
GRPC_WORKER_ADDRESS = os.environ.get("GRPC_WORKER_ADDRESS", "grpc-worker:50061")
```

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py
git commit -m "Add Cassandra+gRPC ML config and dependencies to backend"
```

---

## Task 7: Backend Pydantic schemas + unit tests

**Files:**
- Create: `backend/app/schemas/cassandra_grpc.py`
- Create: `backend/tests/test_cassandra_grpc_schemas.py`

**Interfaces:**
- Produces: `CassandraGrpcStatus`, `ClassDistributionEntry`, `DatasetInfo`, `TrainRequestBody`, `ClassSupport`, `ConfusionMatrixEntry`, `TrainMetrics`, `TrainJobStatus`, `PredictRequestBody`, `PredictResult`, `GrpcLogEntry` — all consumed by Tasks 9-11.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_cassandra_grpc_schemas.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from app.schemas.cassandra_grpc import (
    ClassSupport, ConfusionMatrixEntry, DatasetInfo, PredictRequestBody,
    TrainJobStatus, TrainMetrics, TrainRequestBody,
)


def test_train_request_body_defaults_to_40000():
    body = TrainRequestBody()
    assert body.sampleSize == 40000


def test_train_request_body_rejects_too_small_sample():
    with pytest.raises(ValidationError):
        TrainRequestBody(sampleSize=10)


def test_predict_request_body_rejects_empty_text():
    with pytest.raises(ValidationError):
        PredictRequestBody(text="")


def test_dataset_info_round_trips_through_json():
    info = DatasetInfo(
        ingestedRows=40000, trainRows=36000, testRows=4000, numClasses=59,
        sampleSize=40000, topicDistribution=[], note="test",
    )
    restored = DatasetInfo.model_validate_json(info.model_dump_json())
    assert restored == info


def test_train_job_status_idle_has_no_result():
    status = TrainJobStatus(status="idle")
    assert status.result is None
    assert status.error is None


def test_train_metrics_with_confusion_matrix_round_trips():
    metrics = TrainMetrics(
        numClasses=59, trainRows=36000, testRows=4000, accuracy=0.72,
        macroPrecision=0.6, macroRecall=0.58, macroF1=0.59,
        microPrecision=0.72, microRecall=0.72, microF1=0.72,
        trainingTimeSeconds=12.5,
        topClasses=[ClassSupport(topicId=1, topicName="Test Topic", support=200)],
        confusionMatrix=[ConfusionMatrixEntry(trueTopicId=1, predictedTopicId=1, count=180)],
        trainedAt="2026-09-01T00:00:00+00:00",
    )
    restored = TrainMetrics.model_validate_json(metrics.model_dump_json())
    assert restored == metrics
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker run --rm -v "$(pwd)/backend:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q pydantic pytest && pytest tests/test_cassandra_grpc_schemas.py -v"
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.cassandra_grpc'`.

- [ ] **Step 3: Write the schemas**

```python
# backend/app/schemas/cassandra_grpc.py
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CassandraGrpcStatus(BaseModel):
    cassandra: Literal["connected", "unreachable"]
    worker: Literal["connected", "unreachable"]
    modelLoaded: bool
    numClasses: int
    trainedAt: Optional[str] = None


class ClassDistributionEntry(BaseModel):
    topicId: int
    topicName: str
    count: int


class DatasetInfo(BaseModel):
    ingestedRows: int
    trainRows: int
    testRows: int
    numClasses: int
    sampleSize: int
    topicDistribution: list[ClassDistributionEntry]
    note: str


class TrainRequestBody(BaseModel):
    sampleSize: int = Field(40000, ge=100, le=373657)


class ClassSupport(BaseModel):
    topicId: int
    topicName: str
    support: int


class ConfusionMatrixEntry(BaseModel):
    trueTopicId: int
    predictedTopicId: int
    count: int


class TrainMetrics(BaseModel):
    numClasses: int
    trainRows: int
    testRows: int
    accuracy: float
    macroPrecision: float
    macroRecall: float
    macroF1: float
    microPrecision: float
    microRecall: float
    microF1: float
    trainingTimeSeconds: float
    topClasses: list[ClassSupport]
    confusionMatrix: list[ConfusionMatrixEntry]
    trainedAt: str


class TrainJobStatus(BaseModel):
    status: Literal["idle", "running", "completed", "failed"]
    startedAt: Optional[float] = None
    finishedAt: Optional[float] = None
    error: Optional[str] = None
    result: Optional[TrainMetrics] = None


class PredictRequestBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class PredictResult(BaseModel):
    topicId: int
    topicName: str
    confidence: float
    preprocessingTimeMs: float
    grpcRoundtripMs: float
    note: str


class GrpcLogEntry(BaseModel):
    id: str
    timestamp: str
    method: Literal["Predict", "Train", "GetStatus"]
    status: Literal["OK", "UNAVAILABLE", "FAILED_PRECONDITION", "INTERNAL"]
    latencyMs: float
    detail: str
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker run --rm -v "$(pwd)/backend:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q pydantic pytest && pytest tests/test_cassandra_grpc_schemas.py -v"
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/cassandra_grpc.py backend/tests/test_cassandra_grpc_schemas.py
git commit -m "Add Cassandra+gRPC ML Pydantic schemas with unit tests"
```

---

## Task 8: Backend stratified sampling + unit tests

**Files:**
- Create: `backend/app/services/cassandra_grpc_ingestion.py`
- Create: `backend/tests/test_cassandra_grpc_ingestion.py`

**Interfaces:**
- Produces: `stratified_sample(df: pd.DataFrame, sample_size: int, seed: int = 42, label_column: str = "topic_id") -> pd.DataFrame` (adds a `split` column with values `"train"`/`"test"`). Consumed by Task 9's `ingest_if_needed()`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_cassandra_grpc_ingestion.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from app.services.cassandra_grpc_ingestion import stratified_sample


def _synthetic_df(rows_per_class=100, n_classes=5):
    rows = []
    for cls in range(n_classes):
        for i in range(rows_per_class):
            rows.append({"cleaned_text": f"text {cls} {i}", "topic_id": cls, "topic_name": f"Topic {cls}"})
    return pd.DataFrame(rows)


def test_returns_all_rows_when_sample_size_exceeds_dataset():
    df = _synthetic_df(rows_per_class=10, n_classes=3)  # 30 rows total
    sampled = stratified_sample(df, sample_size=1000)
    assert len(sampled) == 30
    assert "split" in sampled.columns


def test_caps_at_sample_size_and_stays_proportional():
    df = _synthetic_df(rows_per_class=100, n_classes=5)  # 500 rows, balanced
    sampled = stratified_sample(df, sample_size=100, seed=42)
    assert len(sampled) <= 100
    counts = sampled["topic_id"].value_counts()
    # balanced input -> roughly balanced sample (each class within a few rows of the mean)
    assert counts.max() - counts.min() <= 5


def test_assigns_both_train_and_test_rows_per_class():
    df = _synthetic_df(rows_per_class=20, n_classes=2)
    sampled = stratified_sample(df, sample_size=40, seed=1)
    for cls in [0, 1]:
        class_rows = sampled[sampled["topic_id"] == cls]
        assert (class_rows["split"] == "train").sum() > 0
        assert (class_rows["split"] == "test").sum() > 0


def test_is_deterministic_given_same_seed():
    df = _synthetic_df(rows_per_class=50, n_classes=4)
    a = stratified_sample(df, sample_size=80, seed=7)
    b = stratified_sample(df, sample_size=80, seed=7)
    assert sorted(a["cleaned_text"].tolist()) == sorted(b["cleaned_text"].tolist())
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker run --rm -v "$(pwd)/backend:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q pandas pytest pyarrow && pytest tests/test_cassandra_grpc_ingestion.py -v"
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.cassandra_grpc_ingestion'`.

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/cassandra_grpc_ingestion.py
"""Pure sampling logic for ingesting a subset of AutoTopic's real
labeled_requests.parquet into Cassandra (see cassandra_grpc_service.py for
the Cassandra I/O side). Kept separate and I/O-free so it's unit-testable
against a small synthetic DataFrame instead of the real 118MB file.
"""
import pandas as pd


def stratified_sample(
    df: pd.DataFrame, sample_size: int, seed: int = 42, label_column: str = "topic_id"
) -> pd.DataFrame:
    """Proportionally samples up to sample_size rows from df stratified by
    label_column, then assigns a 90/10 train/test split within each
    resulting class (every class with 2+ rows gets at least one test row).
    """
    if sample_size >= len(df):
        sampled = df.copy()
    else:
        frac = sample_size / len(df)
        sampled = df.groupby(label_column, group_keys=False).apply(
            lambda g: g.sample(frac=frac, random_state=seed) if len(g) > 1 else g
        )
        if len(sampled) > sample_size:
            sampled = sampled.sample(n=sample_size, random_state=seed)

    def _assign_split(group: pd.DataFrame) -> pd.DataFrame:
        shuffled = group.sample(frac=1.0, random_state=seed)
        n_test = max(1, int(len(shuffled) * 0.1)) if len(shuffled) > 1 else 0
        split = ["test"] * n_test + ["train"] * (len(shuffled) - n_test)
        return shuffled.assign(split=split)

    sampled = sampled.groupby(label_column, group_keys=False).apply(_assign_split)
    return sampled.reset_index(drop=True)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker run --rm -v "$(pwd)/backend:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q pandas pytest pyarrow && pytest tests/test_cassandra_grpc_ingestion.py -v"
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cassandra_grpc_ingestion.py backend/tests/test_cassandra_grpc_ingestion.py
git commit -m "Add stratified sampling for Cassandra+gRPC ingestion with unit tests"
```

---

## Task 9: Backend Cassandra service — connection, schema, ingestion, status

**Files:**
- Create: `backend/app/services/cassandra_grpc_service.py` (part 1 of this file — status/ingestion/dataset-info; Task 10 appends training/prediction to the same file)

**Interfaces:**
- Consumes: `CASSANDRA_GRPC_DATASET_PATH`, `CASSANDRA_GRPC_SAMPLE_SIZE`, `CASSANDRA_HOST`, `GRPC_WORKER_ADDRESS`, `REPO_ROOT` (Task 6's `config.py`); `stratified_sample` (Task 8); schemas from Task 7; `ml_worker_pb2`/`ml_worker_pb2_grpc` (generated at backend Docker build time — see Task 12).
- Produces: `CassandraGrpcError` exception; `get_status() -> CassandraGrpcStatus`; `ingest_if_needed() -> DatasetInfo`; `get_dataset_info() -> DatasetInfo`. Task 10 adds `start_training`, `get_train_status`, `get_latest_metrics`, `predict`, `get_recent_grpc_log` to this same module.

This task is glue code (real Cassandra networking) — verified live in Task 13, not unit tested.

- [ ] **Step 1: Write the service module (status/ingestion portion)**

```python
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
    session = cluster.connect()
    for stmt in _SCHEMA_STATEMENTS:
        session.execute(stmt)
    session.set_keyspace(KEYSPACE)
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/cassandra_grpc_service.py
git commit -m "Add Cassandra connection, schema, and ingestion for Cassandra+gRPC ML"
```

---

## Task 10: Backend gRPC client, training job tracker, prediction

**Files:**
- Modify: `backend/app/services/cassandra_grpc_service.py` (append to the file created in Task 9)

**Interfaces:**
- Consumes: everything in Task 9's part of the file, plus `TrainMetrics`, `ClassSupport`, `ConfusionMatrixEntry`, `TrainJobStatus`, `PredictResult` schemas (Task 7).
- Produces: `start_training(sample_size: int) -> TrainJobStatus`, `get_train_status() -> TrainJobStatus`, `get_latest_metrics() -> TrainMetrics | None`, `predict(text: str) -> PredictResult`. Consumed by Task 11's routes.

- [ ] **Step 1: Append the training/prediction logic**

Add these imports to the top of `backend/app/services/cassandra_grpc_service.py` (alongside the existing ones from Task 9):

```python
from app.schemas.cassandra_grpc import ClassSupport, ConfusionMatrixEntry, PredictResult, TrainJobStatus, TrainMetrics
```

Append to the end of `backend/app/services/cassandra_grpc_service.py`:

```python


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
        with _grpc_channel() as channel:
            stub = ml_worker_pb2_grpc.MLWorkerStub(channel)
            resp = stub.Train(ml_worker_pb2.TrainRequest(sample_size=sample_size), timeout=300)
        latency_ms = (time.time() - start) * 1000

        if not resp.success:
            _log_grpc_call("Train", "FAILED_PRECONDITION", latency_ms, resp.message)
            raise CassandraGrpcError(resp.message or "Training failed on the worker")
        _log_grpc_call("Train", "OK", latency_ms, resp.message)

        metrics = TrainMetrics(
            numClasses=resp.num_classes,
            trainRows=resp.train_rows,
            testRows=resp.test_rows,
            accuracy=resp.accuracy,
            macroPrecision=resp.macro_precision,
            macroRecall=resp.macro_recall,
            macroF1=resp.macro_f1,
            microPrecision=resp.micro_precision,
            microRecall=resp.micro_recall,
            microF1=resp.micro_f1,
            trainingTimeSeconds=resp.training_time_seconds,
            topClasses=[
                ClassSupport(topicId=c.topic_id, topicName=c.topic_name, support=c.support)
                for c in resp.top_classes
            ],
            confusionMatrix=[
                ConfusionMatrixEntry(trueTopicId=e.true_topic_id, predictedTopicId=e.predicted_topic_id, count=e.count)
                for e in resp.confusion_matrix
            ],
            trainedAt=datetime.now(timezone.utc).isoformat(),
        )
        _record_training_run(sample_size, metrics)

        with _train_lock:
            _train_state.update(status="completed", finishedAt=time.time(), error=None, result=metrics)
    except grpc.RpcError as exc:
        logger.exception("Training gRPC call failed")
        detail = exc.details() if hasattr(exc, "details") else str(exc)
        with _train_lock:
            _train_state.update(status="failed", finishedAt=time.time(), error=str(detail))
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
        with _grpc_channel() as channel:
            stub = ml_worker_pb2_grpc.MLWorkerStub(channel)
            resp = stub.Predict(ml_worker_pb2.PredictRequest(text=cleaned), timeout=10)
    except grpc.RpcError as exc:
        latency_ms = (time.time() - start_grpc) * 1000
        detail = exc.details() if hasattr(exc, "details") else str(exc)
        status_name = "FAILED_PRECONDITION" if "FAILED_PRECONDITION" in str(exc) else "UNAVAILABLE"
        _log_grpc_call("Predict", status_name, latency_ms, str(detail))
        raise CassandraGrpcError(str(detail))

    grpc_roundtrip_ms = (time.time() - start_grpc) * 1000
    _log_grpc_call("Predict", "OK", grpc_roundtrip_ms, f"topic_id={resp.topic_id}")
    _log_prediction(cleaned, resp, grpc_roundtrip_ms)

    return PredictResult(
        topicId=resp.topic_id,
        topicName=resp.topic_name,
        confidence=resp.confidence,
        preprocessingTimeMs=round(preprocessing_ms, 3),
        grpcRoundtripMs=round(grpc_roundtrip_ms, 2),
        note="Served by the grpc-worker container's TF-IDF + LogisticRegression model over a real gRPC call.",
    )


def _log_prediction(text: str, resp, latency_ms: float) -> None:
    cluster, session = _connect_cassandra()
    try:
        session.execute(
            f"INSERT INTO {KEYSPACE}.predictions "
            "(id, input_text, predicted_topic_id, predicted_topic_name, confidence, latency_ms, created_at) "
            "VALUES (now(), %s, %s, %s, %s, %s, toTimestamp(now()))",
            (text, resp.topic_id, resp.topic_name, resp.confidence, latency_ms),
        )
    finally:
        cluster.shutdown()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/cassandra_grpc_service.py
git commit -m "Add training job tracker and predict flow to Cassandra+gRPC service"
```

---

## Task 11: Backend API routes

**Files:**
- Create: `backend/app/api/routes/cassandra_grpc.py`
- Modify: `backend/app/main.py:7,47` (add import and `include_router`)

**Interfaces:**
- Consumes: everything from `cassandra_grpc_service` (Tasks 9-10) and `cassandra_grpc` schemas (Task 7).
- Produces: `GET /api/cassandra-grpc/status`, `GET /api/cassandra-grpc/dataset-info`, `POST /api/cassandra-grpc/train`, `GET /api/cassandra-grpc/train/status`, `GET /api/cassandra-grpc/metrics`, `POST /api/cassandra-grpc/predict`, `GET /api/cassandra-grpc/grpc-log` — all consumed by Task 15's frontend API client.

- [ ] **Step 1: Write the routes file**

```python
# backend/app/api/routes/cassandra_grpc.py
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.schemas.cassandra_grpc import (
    CassandraGrpcStatus, DatasetInfo, GrpcLogEntry, PredictRequestBody, PredictResult,
    TrainJobStatus, TrainMetrics, TrainRequestBody,
)
from app.services import cassandra_grpc_service as svc
from app.services.cassandra_grpc_service import CassandraGrpcError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cassandra-grpc", tags=["cassandra-grpc"])


@router.get("/status", response_model=CassandraGrpcStatus)
def status():
    return svc.get_status()


@router.get("/dataset-info", response_model=DatasetInfo)
def dataset_info():
    try:
        return svc.ingest_if_needed()
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("Cassandra+gRPC dataset-info failed")
        raise HTTPException(status_code=500, detail="Could not read dataset info. See server logs.")


@router.post("/train", response_model=TrainJobStatus)
def train(request: TrainRequestBody):
    try:
        return svc.start_training(request.sampleSize)
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/train/status", response_model=TrainJobStatus)
def train_status():
    return svc.get_train_status()


@router.get("/metrics", response_model=Optional[TrainMetrics])
def metrics():
    return svc.get_latest_metrics()


@router.post("/predict", response_model=PredictResult)
def predict(request: PredictRequestBody):
    try:
        return svc.predict(request.text)
    except CassandraGrpcError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("Cassandra+gRPC predict failed")
        raise HTTPException(status_code=500, detail="Prediction failed unexpectedly. See server logs.")


@router.get("/grpc-log", response_model=list[GrpcLogEntry])
def grpc_log():
    return svc.get_recent_grpc_log()
```

- [ ] **Step 2: Register the router in main.py**

In `backend/app/main.py`, change line 7:

```python
from app.api.routes import autopilot, autotopic, cassandra_grpc, ecg, health
```

And add after line 47 (`app.include_router(ecg.router)`):

```python
app.include_router(cassandra_grpc.router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/cassandra_grpc.py backend/app/main.py
git commit -m "Wire Cassandra+gRPC ML API routes into the backend"
```

---

## Task 12: Docker Compose + env updates

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `cassandra-grpc-ml/proto/ml_worker.proto` (Task 1), `cassandra-grpc-ml/worker/Dockerfile` (Task 5).
- Produces: the four-service (`backend`, `frontend`, `cassandra`, `grpc-worker`) Docker Compose stack that Task 13 verifies live.

- [ ] **Step 1: Add proto stub generation to backend/Dockerfile**

In `backend/Dockerfile`, insert this block after the `sentence_transformers` pre-download line (after line 21) and before `COPY backend/app ./app` (currently line 28):

```dockerfile
# Cassandra + gRPC ML project: generate the gRPC Python stubs the backend
# needs to act as a client of the grpc-worker service.
COPY cassandra-grpc-ml/proto ./cassandra-grpc-ml/proto
RUN python -m grpc_tools.protoc -I cassandra-grpc-ml/proto --python_out=. --grpc_python_out=. cassandra-grpc-ml/proto/ml_worker.proto
```

- [ ] **Step 2: Rewrite docker-compose.yml**

```yaml
services:
  cassandra:
    image: cassandra:5
    environment:
      - CASSANDRA_CLUSTER_NAME=PortfolioCassandra
    healthcheck:
      test: ["CMD-SHELL", "cqlsh -e 'describe keyspaces' || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 20
      start_period: 60s
    volumes:
      - cassandra_data:/var/lib/cassandra

  grpc-worker:
    build:
      context: .
      dockerfile: cassandra-grpc-ml/worker/Dockerfile
    depends_on:
      cassandra:
        condition: service_healthy
    environment:
      - CASSANDRA_HOST=cassandra
    volumes:
      - cassandra_grpc_model_data:/app/model_store

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    depends_on:
      cassandra:
        condition: service_healthy
      grpc-worker:
        condition: service_started
    environment:
      - CORS_ORIGINS=http://localhost:3000
      - AUTOTOPIC_DATA_URL=${AUTOTOPIC_DATA_URL:-data/raw/labeled_requests.parquet}
      - CASSANDRA_HOST=cassandra
      - GRPC_WORKER_ADDRESS=grpc-worker:50061
      - CASSANDRA_GRPC_DATASET_PATH=${CASSANDRA_GRPC_DATASET_PATH:-AutoTopic/data/raw/labeled_requests.parquet}
      - CASSANDRA_GRPC_SAMPLE_SIZE=${CASSANDRA_GRPC_SAMPLE_SIZE:-40000}
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_BASE_URL=http://localhost:8000
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  cassandra_data:
  cassandra_grpc_model_data:
```

- [ ] **Step 3: Update .env.example**

Append to the end of `.env.example`:

```

# Cassandra + gRPC ML: reuses the same real dataset as AutoTopic (see
# AutoTopic/data/README.md) -- a path relative to the repo root, or an
# absolute local path. No credentials needed (dev-mode Cassandra, no auth).
CASSANDRA_GRPC_DATASET_PATH=AutoTopic/data/raw/labeled_requests.parquet
CASSANDRA_GRPC_SAMPLE_SIZE=40000
```

- [ ] **Step 4: Verify the full stack builds**

```bash
docker compose build cassandra grpc-worker backend frontend
```

Expected: all four images build without error (this does not start them yet — see Task 13 for the live run).

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile docker-compose.yml .env.example
git commit -m "Add cassandra and grpc-worker services to docker-compose"
```

---

## Task 13: Live integration verification pass #1

**Files:** none (verification only — fix forward in the relevant task's files if something breaks)

**Interfaces:** exercises the full chain built in Tasks 1-12.

- [ ] **Step 1: Start the stack**

```bash
docker compose up -d cassandra
```

Wait for healthy (poll, don't sleep-guess):

```bash
docker compose ps cassandra
```

Repeat until `STATUS` shows `healthy` (Cassandra can take up to ~60s on first start).

- [ ] **Step 2: Start the worker and backend**

```bash
docker compose up -d grpc-worker backend
```

- [ ] **Step 3: Check status end-to-end**

```bash
curl -s http://localhost:8000/api/cassandra-grpc/status
```

Expected: `{"cassandra":"connected","worker":"connected","modelLoaded":false,"numClasses":0,"trainedAt":null}`. If `cassandra` or `worker` shows `"unreachable"`, check `docker compose logs backend grpc-worker` and fix the underlying connectivity/env issue before proceeding (do not skip this check).

- [ ] **Step 4: Verify ingestion**

```bash
curl -s http://localhost:8000/api/cassandra-grpc/dataset-info
```

Expected: `ingestedRows` close to 40000 (may run a large parquet read, allow up to ~60s), `numClasses` around 59-60, non-empty `topicDistribution`, with real Russian `topicName` values (e.g. "Поздравления с днем рождения"). If the dataset file is missing, this returns a 503 with a clear message — confirm the file exists at `AutoTopic/data/raw/labeled_requests.parquet` before treating this as a bug.

- [ ] **Step 5: Train on a small sample first (fast feedback)**

```bash
curl -s -X POST http://localhost:8000/api/cassandra-grpc/train -H "Content-Type: application/json" -d '{"sampleSize": 5000}'
```

Poll:

```bash
curl -s http://localhost:8000/api/cassandra-grpc/train/status
```

Expected: eventually `"status":"completed"` with a `result` containing real `accuracy`/`macroF1`/`microF1` between 0 and 1 (not exactly 0, not exactly 1), `topClasses` and `confusionMatrix` non-empty. If `"status":"failed"`, read the `error` field and fix the underlying issue in the relevant Task 9/10 file.

- [ ] **Step 6: Predict on a real Russian sentence**

```bash
curl -s -X POST http://localhost:8000/api/cassandra-grpc/predict -H "Content-Type: application/json" -d '{"text": "подбери синонимы к слову веселый"}'
```

Expected: a real `topicId`/`topicName`/`confidence` (matching the training vocabulary — this exact phrase resembles row 3 of the dataset's `"Анализ персонажей"` topic seen during data inspection, so the predicted topic should plausibly relate to text/word analysis, though the real model's actual output is authoritative, not this expectation).

- [ ] **Step 7: Confirm the prediction was logged to Cassandra**

```bash
docker compose exec cassandra cqlsh -e "SELECT input_text, predicted_topic_name, confidence FROM cassandra_grpc_ml.predictions LIMIT 5;"
```

Expected: the row from Step 6 appears.

- [ ] **Step 8: Confirm the full portfolio still builds together**

```bash
docker compose build
docker compose up -d
docker compose ps
```

Expected: all 4 services `Up`/`healthy`. Spot-check the existing 3 projects are unaffected: `curl -s http://localhost:8000/api/health`, `curl -s http://localhost:8000/api/autotopic/dataset-info`, `curl -s http://localhost:8000/api/ecg/health`.

- [ ] **Step 9: If anything failed, fix forward**

Any failures found in Steps 1-8 must be fixed in the relevant task's file (Task 9/10 for service logic, Task 11 for routing, Task 12 for compose/env) before moving on — do not defer known-broken integration to a later task.

---

## Task 14: Kubernetes manifests (adapted, unverified reference material)

**Files:**
- Create: `cassandra-grpc-ml/k8s/cassandra-deployment.yaml`
- Create: `cassandra-grpc-ml/k8s/cassandra-service.yaml`
- Create: `cassandra-grpc-ml/k8s/cassandra-pvc.yaml`
- Create: `cassandra-grpc-ml/k8s/grpc-worker-deployment.yaml`
- Create: `cassandra-grpc-ml/k8s/grpc-worker-service.yaml`
- Create: `cassandra-grpc-ml/k8s/grpc-worker-hpa.yaml`

**Interfaces:** none — reference-only, not wired into CI or verified against a live cluster.

- [ ] **Step 1: Write cassandra-deployment.yaml (adapted from the original repo)**

```yaml
# UNVERIFIED: adapted from the original cassandra-grpc-dev repo's k8s
# manifests for this project's schema/keyspace; not deployed or tested
# against a live cluster in this environment. See cassandra-grpc-ml/README.md.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cassandra-grpc-ml-cassandra
  labels:
    app: cassandra-grpc-ml-cassandra
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cassandra-grpc-ml-cassandra
  template:
    metadata:
      labels:
        app: cassandra-grpc-ml-cassandra
    spec:
      containers:
        - name: cassandra
          image: cassandra:5
          ports:
            - containerPort: 9042
          env:
            - name: MAX_HEAP_SIZE
              value: "768M"
            - name: HEAP_NEWSIZE
              value: "200M"
            - name: CASSANDRA_CLUSTER_NAME
              value: PortfolioCassandra
          resources:
            requests:
              memory: "1.5Gi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "1"
          volumeMounts:
            - name: cassandra-data
              mountPath: /var/lib/cassandra
      volumes:
        - name: cassandra-data
          persistentVolumeClaim:
            claimName: cassandra-grpc-ml-cassandra-pvc
```

- [ ] **Step 2: Write cassandra-service.yaml**

```yaml
# UNVERIFIED: see cassandra-deployment.yaml.
apiVersion: v1
kind: Service
metadata:
  name: cassandra-grpc-ml-cassandra
spec:
  selector:
    app: cassandra-grpc-ml-cassandra
  ports:
    - name: cql
      port: 9042
      targetPort: 9042
  type: ClusterIP
```

- [ ] **Step 3: Write cassandra-pvc.yaml**

```yaml
# UNVERIFIED: see cassandra-deployment.yaml.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cassandra-grpc-ml-cassandra-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

- [ ] **Step 4: Write grpc-worker-deployment.yaml (adapted from the original worker-deployment.yaml)**

```yaml
# UNVERIFIED: adapted from the original cassandra-grpc-dev repo's
# worker-deployment.yaml for the new Python grpc-worker image (built from
# cassandra-grpc-ml/worker/Dockerfile); not deployed or tested against a
# live cluster in this environment. See cassandra-grpc-ml/README.md.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cassandra-grpc-ml-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cassandra-grpc-ml-worker
  template:
    metadata:
      labels:
        app: cassandra-grpc-ml-worker
    spec:
      containers:
        - name: grpc-worker
          image: cassandra-grpc-ml-worker:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 50061
          env:
            - name: CASSANDRA_HOST
              value: "cassandra-grpc-ml-cassandra"
          resources:
            requests:
              memory: "200Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          volumeMounts:
            - name: model-store
              mountPath: /app/model_store
      volumes:
        - name: model-store
          emptyDir: {}
```

- [ ] **Step 5: Write grpc-worker-service.yaml**

```yaml
# UNVERIFIED: see grpc-worker-deployment.yaml.
apiVersion: v1
kind: Service
metadata:
  name: cassandra-grpc-ml-worker
spec:
  selector:
    app: cassandra-grpc-ml-worker
  ports:
    - port: 50061
      targetPort: 50061
  type: ClusterIP
```

- [ ] **Step 6: Write grpc-worker-hpa.yaml (adapted from the original worker-hpa.yaml)**

```yaml
# UNVERIFIED: see grpc-worker-deployment.yaml.
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cassandra-grpc-ml-worker-autoscaler
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cassandra-grpc-ml-worker
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
```

- [ ] **Step 7: Commit**

```bash
git add cassandra-grpc-ml/k8s/
git commit -m "Add unverified reference k8s manifests for Cassandra+gRPC ML"
```

---

## Task 15: Frontend types + API client functions

**Files:**
- Modify: `frontend/src/types.ts` (add new interfaces + extend `ActiveTab`)
- Modify: `frontend/src/api/client.ts` (add new functions)

**Interfaces:**
- Produces: TypeScript types and `getCassandraGrpcStatus`, `getCassandraGrpcDatasetInfo`, `startCassandraGrpcTraining`, `getCassandraGrpcTrainStatus`, `getCassandraGrpcMetrics`, `predictCassandraGrpc`, `getCassandraGrpcLog` — consumed by Tasks 16-21's React components.

- [ ] **Step 1: Add types**

In `frontend/src/types.ts`, change line 1:

```typescript
export type ActiveTab = 'autotopic' | 'autopilot' | 'ecg' | 'cassandragrpc' | 'overview';
```

Append to the end of the file:

```typescript

// Cassandra + gRPC ML Types
export interface CassandraGrpcStatus {
  cassandra: 'connected' | 'unreachable';
  worker: 'connected' | 'unreachable';
  modelLoaded: boolean;
  numClasses: number;
  trainedAt?: string | null;
}

export interface ClassDistributionEntry {
  topicId: number;
  topicName: string;
  count: number;
}

export interface CassandraGrpcDatasetInfo {
  ingestedRows: number;
  trainRows: number;
  testRows: number;
  numClasses: number;
  sampleSize: number;
  topicDistribution: ClassDistributionEntry[];
  note: string;
}

export interface ClassSupport {
  topicId: number;
  topicName: string;
  support: number;
}

export interface ConfusionMatrixEntry {
  trueTopicId: number;
  predictedTopicId: number;
  count: number;
}

export interface CassandraGrpcTrainMetrics {
  numClasses: number;
  trainRows: number;
  testRows: number;
  accuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  microPrecision: number;
  microRecall: number;
  microF1: number;
  trainingTimeSeconds: number;
  topClasses: ClassSupport[];
  confusionMatrix: ConfusionMatrixEntry[];
  trainedAt: string;
}

export interface CassandraGrpcTrainJobStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt?: number | null;
  finishedAt?: number | null;
  error?: string | null;
  result?: CassandraGrpcTrainMetrics | null;
}

export interface CassandraGrpcPredictResult {
  topicId: number;
  topicName: string;
  confidence: number;
  preprocessingTimeMs: number;
  grpcRoundtripMs: number;
  note: string;
}

export interface CassandraGrpcLogEntry {
  id: string;
  timestamp: string;
  method: 'Predict' | 'Train' | 'GetStatus';
  status: 'OK' | 'UNAVAILABLE' | 'FAILED_PRECONDITION' | 'INTERNAL';
  latencyMs: number;
  detail: string;
}
```

- [ ] **Step 2: Add API client functions**

In `frontend/src/api/client.ts`, add this import to the existing import line (line 1):

```typescript
import { AutoTopicConfig, AutoTopicDatasetInfo, AutoTopicFullPipelineStatus, AutoTopicResults, CameraCalibration, CassandraGrpcDatasetInfo, CassandraGrpcLogEntry, CassandraGrpcPredictResult, CassandraGrpcStatus, CassandraGrpcTrainJobStatus, CassandraGrpcTrainMetrics, EcgAnalysisResult, EcgEvaluationResult, EcgHealth } from '../types';
```

Append to the end of the file:

```typescript

export function getCassandraGrpcStatus(): Promise<CassandraGrpcStatus> {
  return request<CassandraGrpcStatus>('/api/cassandra-grpc/status');
}

export function getCassandraGrpcDatasetInfo(): Promise<CassandraGrpcDatasetInfo> {
  return request<CassandraGrpcDatasetInfo>('/api/cassandra-grpc/dataset-info');
}

export function startCassandraGrpcTraining(sampleSize: number): Promise<CassandraGrpcTrainJobStatus> {
  return request<CassandraGrpcTrainJobStatus>('/api/cassandra-grpc/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleSize }),
  });
}

export function getCassandraGrpcTrainStatus(): Promise<CassandraGrpcTrainJobStatus> {
  return request<CassandraGrpcTrainJobStatus>('/api/cassandra-grpc/train/status');
}

export function getCassandraGrpcMetrics(): Promise<CassandraGrpcTrainMetrics | null> {
  return request<CassandraGrpcTrainMetrics | null>('/api/cassandra-grpc/metrics');
}

export function predictCassandraGrpc(text: string): Promise<CassandraGrpcPredictResult> {
  return request<CassandraGrpcPredictResult>('/api/cassandra-grpc/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export function getCassandraGrpcLog(): Promise<CassandraGrpcLogEntry[]> {
  return request<CassandraGrpcLogEntry[]>('/api/cassandra-grpc/grpc-log');
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/api/client.ts
git commit -m "Add Cassandra+gRPC ML frontend types and API client functions"
```

---

## Task 16: Frontend workspace shell + navigation entry

**Files:**
- Create: `frontend/src/components/CassandraGrpcWorkspace.tsx` (shell only — child sections added in Tasks 17-21)
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `ActiveTab` (Task 15).
- Produces: the mounted `CassandraGrpcWorkspace` component that Tasks 17-21 fill in.

- [ ] **Step 1: Create the workspace shell**

```tsx
// frontend/src/components/CassandraGrpcWorkspace.tsx
import React from 'react';
import { Database } from 'lucide-react';

export const CassandraGrpcWorkspace: React.FC = () => {
  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
          <Database className="w-4 h-4" />
          <span>Distributed ML</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">Cassandra + gRPC ML</h1>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          A distilled topic classifier: AutoTopic discovers ~60 topics in a large Russian request
          corpus via slow unsupervised BERTopic clustering; this project stores a labeled sample of
          that corpus in Apache Cassandra and trains a fast TF-IDF + Logistic Regression classifier,
          served over a real gRPC call to a separate worker container for low-latency inference.
        </p>
      </div>
      {/* Overview/Architecture, Dataset, Training, Inference, Metrics, and Results sections
          are added here in later tasks. */}
    </div>
  );
};
```

- [ ] **Step 2: Add the nav entry to Header.tsx**

In `frontend/src/components/Header.tsx`, add `Network` to the lucide-react import on line 3:

```typescript
import { ActiveTab } from '../types';
import { Sparkles, Car, Layers, Github, BookOpen, Activity, HeartPulse, Network } from 'lucide-react';
```

Add this button after the ECG button (after the closing `</button>` that follows the "ECG Edge AI" label, before the "Overview & Docs" button):

```tsx
            <button
              onClick={() => setActiveTab('cassandragrpc')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
                activeTab === 'cassandragrpc'
                  ? 'bg-gradient-to-r from-cyan-600 to-sky-700 text-white shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Network className="w-4 h-4 text-cyan-300" />
              <span className="hidden sm:inline">Cassandra gRPC ML</span>
              <span className="sm:hidden">Cassandra</span>
            </button>
```

- [ ] **Step 3: Wire it into App.tsx**

In `frontend/src/App.tsx`, add the import after line 6:

```typescript
import { CassandraGrpcWorkspace } from './components/CassandraGrpcWorkspace';
```

Add after line 19 (`{activeTab === 'ecg' && <ECGWorkspace />}`):

```tsx
        {activeTab === 'cassandragrpc' && <CassandraGrpcWorkspace />}
```

- [ ] **Step 4: Verify it renders**

```bash
docker compose up -d --build frontend
```

Open `http://localhost:3000`, click the new "Cassandra gRPC ML" tab, confirm the header/description renders with no console errors (check via the browser tool's `read_console_messages`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CassandraGrpcWorkspace.tsx frontend/src/components/Header.tsx frontend/src/App.tsx
git commit -m "Add Cassandra+gRPC ML workspace shell and navigation entry"
```

---

## Task 17: Overview/Architecture section (status + pipeline diagram)

**Files:**
- Create: `frontend/src/components/cassandragrpc/OverviewPanel.tsx`
- Modify: `frontend/src/components/CassandraGrpcWorkspace.tsx`

**Interfaces:**
- Consumes: `getCassandraGrpcStatus` (Task 15).
- Produces: nothing new consumed elsewhere (leaf UI section).

- [ ] **Step 1: Write OverviewPanel.tsx**

```tsx
// frontend/src/components/cassandragrpc/OverviewPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcStatus } from '../../types';
import { getCassandraGrpcStatus } from '../../api/client';
import { ArrowDown, CheckCircle2, XCircle, Server } from 'lucide-react';

const STAGES = ['Client (browser)', 'FastAPI backend (coordinator)', 'gRPC call', 'grpc-worker container', 'Cassandra / scikit-learn model', 'Prediction'];

export const OverviewPanel: React.FC = () => {
  const [status, setStatus] = useState<CassandraGrpcStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setStatus(await getCassandraGrpcStatus());
      setError(null);
    } catch (err) {
      setError('Could not reach the backend status endpoint.');
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Architecture</h2>

      <div className="flex flex-col items-center gap-1.5 py-2">
        {STAGES.map((stage, i) => (
          <React.Fragment key={stage}>
            <div className="px-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 font-mono text-center min-w-[220px]">
              {stage}
            </div>
            {i < STAGES.length - 1 && <ArrowDown className="w-4 h-4 text-slate-600" />}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
        <StatusBadge label="Cassandra" ok={status?.cassandra === 'connected'} />
        <StatusBadge label="gRPC worker" ok={status?.worker === 'connected'} />
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
          <Server className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-slate-300">
            Model: {status?.modelLoaded ? `${status.numClasses} classes` : 'not trained yet'}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-xs text-slate-400 font-mono truncate">
            {status?.trainedAt ? new Date(status.trainedAt).toLocaleString() : 'Never trained'}
          </span>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

const StatusBadge: React.FC<{ label: string; ok?: boolean }> = ({ label, ok }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
    {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
    <span className="text-xs text-slate-300">{label}</span>
  </div>
);
```

- [ ] **Step 2: Mount it in the workspace**

In `frontend/src/components/CassandraGrpcWorkspace.tsx`, add the import:

```typescript
import { OverviewPanel } from './cassandragrpc/OverviewPanel';
```

Replace the placeholder comment (`{/* Overview/Architecture, ... */}`) with:

```tsx
      <OverviewPanel />
```

- [ ] **Step 3: Verify live**

```bash
docker compose up -d --build frontend
```

Open the Cassandra gRPC ML tab; confirm both status badges show green (Cassandra + worker connected, from Task 13's running stack) and "Model: not trained yet" before Task 13's training run, or "N classes" after it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cassandragrpc/OverviewPanel.tsx frontend/src/components/CassandraGrpcWorkspace.tsx
git commit -m "Add Cassandra+gRPC ML overview/architecture panel"
```

---

## Task 18: Dataset section

**Files:**
- Create: `frontend/src/components/cassandragrpc/DatasetPanel.tsx`
- Modify: `frontend/src/components/CassandraGrpcWorkspace.tsx`

**Interfaces:**
- Consumes: `getCassandraGrpcDatasetInfo` (Task 15).

- [ ] **Step 1: Write DatasetPanel.tsx**

```tsx
// frontend/src/components/cassandragrpc/DatasetPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcDatasetInfo } from '../../types';
import { getCassandraGrpcDatasetInfo } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { Database, Layers, ListTree } from 'lucide-react';

export const DatasetPanel: React.FC = () => {
  const [info, setInfo] = useState<CassandraGrpcDatasetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCassandraGrpcDatasetInfo()
      .then(setInfo)
      .catch(() => setError('Could not load dataset info -- ingestion may still be running on first startup.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState message="Loading dataset info (first call triggers ingestion into Cassandra)..." />;
  if (error) return <ErrorState message={error} />;
  if (!info) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Dataset</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Ingested Rows" value={info.ingestedRows.toLocaleString()} icon={Database} color="text-cyan-300" />
        <MetricCard label="Train / Test" value={`${info.trainRows.toLocaleString()} / ${info.testRows.toLocaleString()}`} icon={Layers} color="text-cyan-300" />
        <MetricCard label="Classes" value={info.numClasses} icon={ListTree} color="text-cyan-300" />
        <MetricCard label="Sample Size Cap" value={info.sampleSize.toLocaleString()} icon={Database} color="text-cyan-300" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Top 10 topics by row count</h3>
        <div className="space-y-1.5">
          {info.topicDistribution.slice(0, 10).map((t) => {
            const pct = (t.count / info.ingestedRows) * 100;
            return (
              <div key={t.topicId} className="flex items-center gap-2 text-xs">
                <span className="text-slate-300 font-mono w-56 truncate">{t.topicName}</span>
                <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-slate-500 w-14 text-right">{t.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3">{info.note}</p>
    </div>
  );
};
```

- [ ] **Step 2: Mount it**

In `frontend/src/components/CassandraGrpcWorkspace.tsx`, add the import and render it after `<OverviewPanel />`:

```typescript
import { DatasetPanel } from './cassandragrpc/DatasetPanel';
```

```tsx
      <OverviewPanel />
      <DatasetPanel />
```

- [ ] **Step 3: Verify live and commit**

```bash
docker compose up -d --build frontend
```

Confirm real ingested row counts and real Russian topic names render. Then:

```bash
git add frontend/src/components/cassandragrpc/DatasetPanel.tsx frontend/src/components/CassandraGrpcWorkspace.tsx
git commit -m "Add Cassandra+gRPC ML dataset panel"
```

---

## Task 19: Training section + confusion matrix

**Files:**
- Create: `frontend/src/components/cassandragrpc/ConfusionMatrixTable.tsx`
- Create: `frontend/src/components/cassandragrpc/TrainingPanel.tsx`
- Modify: `frontend/src/components/CassandraGrpcWorkspace.tsx`

**Interfaces:**
- Consumes: `startCassandraGrpcTraining`, `getCassandraGrpcTrainStatus` (Task 15).

- [ ] **Step 1: Write ConfusionMatrixTable.tsx**

```tsx
// frontend/src/components/cassandragrpc/ConfusionMatrixTable.tsx
import React from 'react';
import { ClassSupport, ConfusionMatrixEntry } from '../../types';

interface Props {
  topClasses: ClassSupport[];
  confusionMatrix: ConfusionMatrixEntry[];
}

export const ConfusionMatrixTable: React.FC<Props> = ({ topClasses, confusionMatrix }) => {
  const countFor = (trueId: number, predId: number) =>
    confusionMatrix.find((e) => e.trueTopicId === trueId && e.predictedTopicId === predId)?.count ?? 0;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="text-[10px] text-slate-300 min-w-[700px]">
        <thead>
          <tr>
            <th className="p-2 bg-slate-950 text-left font-mono text-slate-500">true \ predicted</th>
            {topClasses.map((c) => (
              <th key={c.topicId} className="p-1.5 bg-slate-950 font-mono text-slate-400 max-w-[80px] truncate" title={c.topicName}>
                {c.topicId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {topClasses.map((rowClass) => (
            <tr key={rowClass.topicId}>
              <td className="p-2 font-mono text-slate-400 truncate max-w-[160px]" title={rowClass.topicName}>
                {rowClass.topicId} · {rowClass.topicName}
              </td>
              {topClasses.map((colClass) => {
                const count = countFor(rowClass.topicId, colClass.topicId);
                const isDiagonal = rowClass.topicId === colClass.topicId;
                return (
                  <td
                    key={colClass.topicId}
                    className={`p-1.5 text-center font-mono ${isDiagonal ? 'bg-cyan-500/20 text-cyan-300' : count > 0 ? 'text-slate-300' : 'text-slate-700'}`}
                  >
                    {count || '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

- [ ] **Step 2: Write TrainingPanel.tsx**

```tsx
// frontend/src/components/cassandragrpc/TrainingPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { CassandraGrpcTrainJobStatus } from '../../types';
import { startCassandraGrpcTraining, getCassandraGrpcTrainStatus } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { ConfusionMatrixTable } from './ConfusionMatrixTable';
import { Target, Play, Loader2 } from 'lucide-react';

export const TrainingPanel: React.FC = () => {
  const [sampleSize, setSampleSize] = useState(40000);
  const [job, setJob] = useState<CassandraGrpcTrainJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getCassandraGrpcTrainStatus().then(setJob).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const status = await getCassandraGrpcTrainStatus();
      setJob(status);
      if (status.status !== 'running' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 5000);
  };

  const handleTrain = async () => {
    setError(null);
    try {
      const status = await startCassandraGrpcTraining(sampleSize);
      setJob(status);
      startPolling();
    } catch (err) {
      setError('Could not start training -- see the Overview panel for backend/worker status.');
    }
  };

  const running = job?.status === 'running';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Training</h2>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400 font-mono">
          Sample size
          <input
            type="number"
            min={100}
            max={373657}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            className="ml-2 w-28 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
            disabled={running}
          />
        </label>
        <button
          onClick={handleTrain}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span>{running ? 'Training...' : 'Train Model'}</span>
        </button>
        {job && <span className="text-xs text-slate-500 font-mono">status: {job.status}</span>}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {job?.status === 'failed' && <p className="text-xs text-red-400">{job.error}</p>}

      {job?.result && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Accuracy" value={`${(job.result.accuracy * 100).toFixed(1)}%`} icon={Target} color="text-cyan-300" />
            <MetricCard label="Macro F1" value={job.result.macroF1.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label="Micro F1" value={job.result.microF1.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label="Training Time" value={`${job.result.trainingTimeSeconds.toFixed(1)}s`} icon={Target} color="text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">
              Confusion matrix (top {job.result.topClasses.length} classes by test support, of {job.result.numClasses} total)
            </h3>
            <ConfusionMatrixTable topClasses={job.result.topClasses} confusionMatrix={job.result.confusionMatrix} />
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Mount it**

In `frontend/src/components/CassandraGrpcWorkspace.tsx`, add the import and render after `<DatasetPanel />`:

```typescript
import { TrainingPanel } from './cassandragrpc/TrainingPanel';
```

```tsx
      <DatasetPanel />
      <TrainingPanel />
```

- [ ] **Step 4: Verify live**

```bash
docker compose up -d --build frontend
```

Click "Train Model" with a small sample size (e.g. 5000) for a fast check, confirm the button shows a spinner, polls every 5s, and renders real accuracy/F1/confusion-matrix numbers on completion (matching Task 13's earlier curl-based verification).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cassandragrpc/ConfusionMatrixTable.tsx frontend/src/components/cassandragrpc/TrainingPanel.tsx frontend/src/components/CassandraGrpcWorkspace.tsx
git commit -m "Add Cassandra+gRPC ML training panel with confusion matrix"
```

---

## Task 20: Inference section + gRPC log stream

**Files:**
- Create: `frontend/src/components/cassandragrpc/GrpcLogStream.tsx`
- Create: `frontend/src/components/cassandragrpc/InferencePanel.tsx`
- Modify: `frontend/src/components/CassandraGrpcWorkspace.tsx`

**Interfaces:**
- Consumes: `predictCassandraGrpc`, `getCassandraGrpcLog` (Task 15).

- [ ] **Step 1: Write GrpcLogStream.tsx**

```tsx
// frontend/src/components/cassandragrpc/GrpcLogStream.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcLogEntry } from '../../types';
import { getCassandraGrpcLog } from '../../api/client';
import { Radio } from 'lucide-react';

export const GrpcLogStream: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [entries, setEntries] = useState<CassandraGrpcLogEntry[]>([]);

  useEffect(() => {
    getCassandraGrpcLog().then(setEntries).catch(() => {});
  }, [refreshKey]);

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-2">
        <Radio className="w-3.5 h-3.5 text-cyan-400" />
        <span>Recent gRPC calls</span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/60">
        {entries.length === 0 && <div className="p-3 text-xs text-slate-500">No gRPC calls logged yet.</div>}
        {entries.map((e) => (
          <div key={e.id} className="p-2 text-[11px] font-mono flex items-center gap-2">
            <span className={e.status === 'OK' ? 'text-emerald-400' : 'text-red-400'}>{e.status}</span>
            <span className="text-slate-300">{e.method}</span>
            <span className="text-slate-500">{e.latencyMs.toFixed(1)}ms</span>
            <span className="text-slate-600 truncate flex-1">{e.detail}</span>
            <span className="text-slate-600">{new Date(e.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Write InferencePanel.tsx**

```tsx
// frontend/src/components/cassandragrpc/InferencePanel.tsx
import React, { useState } from 'react';
import { CassandraGrpcPredictResult } from '../../types';
import { predictCassandraGrpc, ApiError } from '../../api/client';
import { GrpcLogStream } from './GrpcLogStream';
import { Send, Loader2 } from 'lucide-react';

export const InferencePanel: React.FC = () => {
  const [text, setText] = useState('Подбери синонимы к слову веселый');
  const [result, setResult] = useState<CassandraGrpcPredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await predictCassandraGrpc(text);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prediction request failed.');
    } finally {
      setLoading(false);
      setLogRefreshKey((k) => k + 1);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Inference</h2>
      <p className="text-xs text-slate-400">
        input → preprocessing → gRPC request → grpc-worker → model prediction → confidence → result
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
        placeholder="Enter a Russian request to classify..."
      />
      <button
        onClick={handlePredict}
        disabled={loading || !text.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-700 text-white text-sm font-medium disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>Predict</span>
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-500 font-mono uppercase">Predicted topic</div>
            <div className="text-base font-bold text-cyan-300">{result.topicName}</div>
            <div className="text-[10px] text-slate-500">topic_id {result.topicId}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold font-mono text-cyan-400">{(result.confidence * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-slate-500">
              preprocessing {result.preprocessingTimeMs.toFixed(2)}ms · gRPC {result.grpcRoundtripMs.toFixed(1)}ms
            </div>
          </div>
        </div>
      )}

      <GrpcLogStream refreshKey={logRefreshKey} />
    </div>
  );
};
```

- [ ] **Step 3: Mount it**

In `frontend/src/components/CassandraGrpcWorkspace.tsx`, add the import and render after `<TrainingPanel />`:

```typescript
import { InferencePanel } from './cassandragrpc/InferencePanel';
```

```tsx
      <TrainingPanel />
      <InferencePanel />
```

- [ ] **Step 4: Verify live and commit**

```bash
docker compose up -d --build frontend
```

Enter a real Russian sentence, click Predict, confirm a real `topicName`/confidence renders and a new row appears in the gRPC log stream below it.

```bash
git add frontend/src/components/cassandragrpc/GrpcLogStream.tsx frontend/src/components/cassandragrpc/InferencePanel.tsx frontend/src/components/CassandraGrpcWorkspace.tsx
git commit -m "Add Cassandra+gRPC ML inference panel with gRPC log stream"
```

---

## Task 21: Metrics panel, static results, and generate_static_results.py extension

**Files:**
- Create: `frontend/src/components/cassandragrpc/MetricsPanel.tsx`
- Create: `frontend/src/components/cassandragrpc/StaticResultsSection.tsx`
- Modify: `frontend/src/components/CassandraGrpcWorkspace.tsx`
- Modify: `backend/scripts/generate_static_results.py`
- Create: `frontend/src/data/staticResults/cassandraGrpcResults.json` (generated, not hand-written — placeholder created here, replaced by the real script output in Step 4)

**Interfaces:**
- Consumes: `getCassandraGrpcMetrics` (Task 15).

- [ ] **Step 1: Write MetricsPanel.tsx**

```tsx
// frontend/src/components/cassandragrpc/MetricsPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcTrainMetrics } from '../../types';
import { getCassandraGrpcMetrics } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { Target } from 'lucide-react';

export const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<CassandraGrpcTrainMetrics | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getCassandraGrpcMetrics()
      .then(setMetrics)
      .finally(() => setChecked(true));
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Metrics</h2>
      {!checked ? (
        <p className="text-xs text-slate-500">Loading...</p>
      ) : !metrics ? (
        <p className="text-sm text-slate-500">Not available -- no training run has completed yet this session.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`} icon={Target} color="text-cyan-300" />
          <MetricCard label="Macro Precision" value={metrics.macroPrecision.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Macro Recall" value={metrics.macroRecall.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Macro F1" value={metrics.macroF1.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Micro F1" value={metrics.microF1.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Trained At" value={new Date(metrics.trainedAt).toLocaleString()} icon={Target} color="text-cyan-300" />
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Write StaticResultsSection.tsx**

```tsx
// frontend/src/components/cassandragrpc/StaticResultsSection.tsx
import React from 'react';
import cassandraGrpcResults from '../../data/staticResults/cassandraGrpcResults.json';
import { MetricCard } from '../shared/MetricCard';
import { ConfusionMatrixTable } from './ConfusionMatrixTable';
import { ClipboardCheck, Target } from 'lucide-react';

interface StaticResults {
  available: boolean;
  datasetSize?: number;
  modelType?: string;
  trainingTimeSeconds?: number;
  inferenceLatencyMs?: number;
  accuracy?: number;
  macroPrecision?: number;
  macroRecall?: number;
  macroF1?: number;
  topClasses?: { topicId: number; topicName: string; support: number }[];
  confusionMatrix?: { trueTopicId: number; predictedTopicId: number; count: number }[];
  examplePrediction?: { inputText: string; topicName: string; confidence: number };
  note: string;
}

const data = cassandraGrpcResults as unknown as StaticResults;

export const StaticResultsSection: React.FC = () => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
        <ClipboardCheck className="w-4 h-4" />
        <span>Results</span>
      </div>
      <h2 className="text-xl font-bold text-white tracking-tight">Real Model Results</h2>

      {!data.available ? (
        <p className="text-sm text-slate-500">
          Not available -- this snapshot is generated by running{' '}
          <code className="text-slate-400">backend/scripts/generate_static_results.py</code> after a real
          training run has completed. {data.note}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Dataset Size" value={data.datasetSize!.toLocaleString()} icon={Target} color="text-cyan-300" />
            <MetricCard label="Model" value={data.modelType!} icon={Target} color="text-cyan-300" />
            <MetricCard label="Training Time" value={`${data.trainingTimeSeconds!.toFixed(1)}s`} icon={Target} color="text-cyan-300" />
            <MetricCard label="Inference Latency" value={`${data.inferenceLatencyMs!.toFixed(1)}ms`} icon={Target} color="text-cyan-300" />
            <MetricCard label="Accuracy" value={`${(data.accuracy! * 100).toFixed(1)}%`} icon={Target} color="text-cyan-300" />
            <MetricCard label="Macro Precision" value={data.macroPrecision!.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label="Macro Recall" value={data.macroRecall!.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label="Macro F1" value={data.macroF1!.toFixed(3)} icon={Target} color="text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 mb-2">Confusion Matrix (top classes by support)</h3>
            <ConfusionMatrixTable topClasses={data.topClasses!} confusionMatrix={data.confusionMatrix!} />
          </div>
          {data.examplePrediction && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <div className="text-[10px] text-slate-500 font-mono uppercase">Example prediction</div>
              <p className="text-sm text-slate-300 italic">"{data.examplePrediction.inputText}"</p>
              <p className="text-sm text-cyan-300 font-bold mt-1">
                {data.examplePrediction.topicName} ({(data.examplePrediction.confidence * 100).toFixed(1)}%)
              </p>
            </div>
          )}
          <p className="text-xs text-slate-400 border-t border-slate-800 pt-4">{data.note}</p>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Create a placeholder JSON (before the real snapshot exists)**

```json
{
  "available": false,
  "note": "Run POST /api/cassandra-grpc/train (or the docker exec generate_static_results.py flow) against a live stack, then regenerate this file."
}
```

Save this as `frontend/src/data/staticResults/cassandraGrpcResults.json`.

- [ ] **Step 4: Extend generate_static_results.py**

Append to the end of `backend/scripts/generate_static_results.py`:

```python

# ---------------------------------------------------------------------------
# Cassandra + gRPC ML: reads whatever the last completed training run left
# in the backend's in-memory job state (GET /api/cassandra-grpc/metrics),
# plus one real example prediction. Does NOT trigger training itself -- run
# POST /api/cassandra-grpc/train yourself first if metrics is null.
# ---------------------------------------------------------------------------
(OUT / "cassandra_grpc").mkdir(parents=True, exist_ok=True)
cg_metrics = get("/api/cassandra-grpc/metrics")

if cg_metrics:
    cg_dataset = get("/api/cassandra-grpc/dataset-info")
    example_text = "Подбери синонимы к слову веселый"
    example = post("/api/cassandra-grpc/predict", {"text": example_text})
    cassandra_grpc_results = {
        "available": True,
        "datasetSize": cg_dataset["ingestedRows"],
        "modelType": "TF-IDF + Logistic Regression (multinomial)",
        "trainingTimeSeconds": cg_metrics["trainingTimeSeconds"],
        "inferenceLatencyMs": example["grpcRoundtripMs"],
        "accuracy": cg_metrics["accuracy"],
        "macroPrecision": cg_metrics["macroPrecision"],
        "macroRecall": cg_metrics["macroRecall"],
        "macroF1": cg_metrics["macroF1"],
        "topClasses": cg_metrics["topClasses"],
        "confusionMatrix": cg_metrics["confusionMatrix"],
        "examplePrediction": {
            "inputText": example_text,
            "topicName": example["topicName"],
            "confidence": example["confidence"],
        },
        "note": (
            f"Real training run on {cg_dataset['ingestedRows']:,} ingested rows "
            f"({cg_metrics['numClasses']} classes), evaluated on a real held-out test split. "
            "Confusion matrix limited to the top classes by test support -- see cassandra-grpc-ml/README.md."
        ),
    }
    print("Cassandra+gRPC ML done. accuracy:", cg_metrics["accuracy"], "macroF1:", cg_metrics["macroF1"])
else:
    cassandra_grpc_results = {
        "available": False,
        "note": "No training run has completed yet -- run POST /api/cassandra-grpc/train and wait for it to finish, then re-run this script.",
    }
    print("Cassandra+gRPC ML metrics not available yet -- skipping the snapshot.")

(OUT / "cassandra_grpc" / "results.json").write_text(json.dumps(cassandra_grpc_results, ensure_ascii=False, indent=2))
```

Also update the module docstring's usage instructions (top of the file) to add this line after the existing `docker cp` lines:

```
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/cassandra_grpc/results.json frontend/src/data/staticResults/cassandraGrpcResults.json
```

- [ ] **Step 5: Mount the panels in the workspace**

In `frontend/src/components/CassandraGrpcWorkspace.tsx`, add the imports and render after `<InferencePanel />`:

```typescript
import { MetricsPanel } from './cassandragrpc/MetricsPanel';
import { StaticResultsSection } from './cassandragrpc/StaticResultsSection';
```

```tsx
      <InferencePanel />
      <MetricsPanel />
      <StaticResultsSection />
```

- [ ] **Step 6: Generate the real static snapshot**

With the stack running and Task 13's training already completed (re-run `POST /api/cassandra-grpc/train` with `sampleSize: 40000` for the final real snapshot, not the small 5000 used for fast iteration):

```bash
docker cp backend/scripts/generate_static_results.py portfolio-integration-backend-1:/tmp/generate_static_results.py
docker exec portfolio-integration-backend-1 python /tmp/generate_static_results.py
docker cp portfolio-integration-backend-1:/tmp/static_results_out/cassandra_grpc/results.json frontend/src/data/staticResults/cassandraGrpcResults.json
```

- [ ] **Step 7: Verify live and commit**

```bash
docker compose up -d --build frontend
```

Confirm the Metrics and Results sections render real numbers (or "Not available" if no training has run in the current session for the Metrics panel — that's correct behavior, not a bug).

```bash
git add frontend/src/components/cassandragrpc/MetricsPanel.tsx frontend/src/components/cassandragrpc/StaticResultsSection.tsx frontend/src/components/CassandraGrpcWorkspace.tsx frontend/src/data/staticResults/cassandraGrpcResults.json backend/scripts/generate_static_results.py
git commit -m "Add Cassandra+gRPC ML metrics panel, static results section, and snapshot script"
```

---

## Task 22: Documentation and final end-to-end verification

**Files:**
- Create: `cassandra-grpc-ml/README.md`
- Modify: `README.md` (root)

**Interfaces:** none — documentation + final verification.

- [ ] **Step 1: Write cassandra-grpc-ml/README.md**

```markdown
# Cassandra + gRPC ML

## Overview

A distributed ML pipeline: a real labeled sample of AutoTopic's request corpus is stored in
Apache Cassandra, and a TF-IDF + Logistic Regression topic classifier is trained and served over
a real gRPC call to a separate worker container. This distills AutoTopic's slow unsupervised
BERTopic clustering (minutes per run) into a fast supervised classifier suitable for real-time
inference (milliseconds per prediction).

This project originated from `neuraCollab/cassandra-grpc-dev`, a C++ distributed web crawler
(coordinator hands URLs to workers over gRPC; workers fetch pages and extract links into
Cassandra). That repo had no ML and no text-classification data. This integration keeps the
Cassandra-for-storage + gRPC-coordinator/worker distributed-processing pattern but reimplements
it in Python around a real ML task, using AutoTopic's real labeled dataset. The original C++
source is not included in this repository.

## ML Task

Multi-class topic classification: predict `topic_id`/`topic_name` (one of ~60 real categories,
e.g. "Поздравления с днем рождения", "Рецепты действий") from `cleaned_text`, using
`AutoTopic/data/raw/labeled_requests.parquet` (373,657 real rows, gitignored -- see
`AutoTopic/data/README.md`). A stratified sample capped at 40,000 rows (configurable via
`CASSANDRA_GRPC_SAMPLE_SIZE`) is ingested into Cassandra with a 90/10 train/test split per class.

## Architecture

```
Client (browser)
  -> HTTP -> FastAPI backend (coordinator + gateway)
      -> gRPC -> grpc-worker container (holds the trained model)
          -> cassandra-driver -> Cassandra (Train reads `requests`; Predict does not)
          -> scikit-learn (TF-IDF + LogisticRegression train / predict)
      <- gRPC response
  <- HTTP response
```

The backend also writes every prediction and training run to Cassandra directly
(`predictions`, `training_runs` tables) -- a real storage round-trip independent of the worker's
own Cassandra access for training data.

## Cassandra's role

Stores the ingested labeled sample (`requests`), a log of every real inference made through the
UI (`predictions`), and the history of real training runs (`training_runs`) in the
`cassandra_grpc_ml` keyspace (`SimpleStrategy`, replication factor 1 -- single dev node, no auth,
matches the original repo's own dev-mode setup).

## gRPC's role

`cassandra-grpc-ml/proto/ml_worker.proto` defines the `MLWorker` service (`Predict`, `Train`,
`GetStatus`), implemented in Python (`grpcio`) rather than the original repo's C++ stack --
pure-pip dependencies, no C++ toolchain, matches the rest of this portfolio's backend. The
`grpc-worker` container is a real, separate process reached over a real network call from the
FastAPI backend.

## Training

`POST /api/cassandra-grpc/train` (body: `{"sampleSize": 40000}`) triggers ingestion-if-needed
followed by a real `Train` gRPC call to the worker, tracked as a background job polled via
`GET /api/cassandra-grpc/train/status` (same pattern as AutoTopic's full-dataset pipeline). Real
accuracy, macro/micro precision/recall/F1, and a confusion matrix (limited to the top 15 classes
by test-set support, for readability) are computed on the held-out test split.

## Inference

`POST /api/cassandra-grpc/predict` (body: `{"text": "..."}`) sends the text over gRPC to the
worker, which runs the persisted TF-IDF vectorizer + classifier and returns a real
`topicId`/`topicName`/confidence. Every prediction is logged to Cassandra's `predictions` table.

## Metrics

`GET /api/cassandra-grpc/metrics` returns the latest completed training run's real metrics, or
`null` ("Not available" in the UI) if no training run has completed in the current backend
process.

## How to run

```bash
docker compose up -d cassandra
# wait for `docker compose ps cassandra` to show healthy
docker compose up -d grpc-worker backend frontend
```

Open `http://localhost:3000` and select the "Cassandra gRPC ML" tab.

## How to train

Click "Train Model" in the Training section, or:

```bash
curl -X POST http://localhost:8000/api/cassandra-grpc/train -H "Content-Type: application/json" -d '{"sampleSize": 40000}'
curl http://localhost:8000/api/cassandra-grpc/train/status
```

## How to perform inference

Use the Inference section, or:

```bash
curl -X POST http://localhost:8000/api/cassandra-grpc/predict -H "Content-Type: application/json" -d '{"text": "подбери синонимы к слову веселый"}'
```

## Kubernetes

`cassandra-grpc-ml/k8s/` contains manifests adapted from the original repo's Kubernetes setup for
this project's new Python architecture. **These are unverified reference material** -- there was
no Kubernetes cluster available to deploy against during this integration. Docker Compose (above)
is the supported way to run this project.

## Tech Stack

| Component | Technology |
|---|---|
| Storage | Apache Cassandra 5 |
| Inter-service communication | gRPC + Protocol Buffers |
| ML model | scikit-learn (TfidfVectorizer + LogisticRegression) |
| Worker runtime | Python 3.11, grpcio, cassandra-driver |
| Coordinator/gateway | FastAPI (existing backend, reused) |
| Frontend | React + TypeScript + Tailwind (existing frontend, reused) |
```

- [ ] **Step 2: Update the root README**

In `README.md`, add a new `### 4. Cassandra + gRPC ML` section after the existing 3rd project's section, following the same structure (Problem/ML approach/Technologies/How to use) as the existing entries, and update the intro paragraph's project count from "three ML projects" to "four ML projects" and add "a distributed Cassandra+gRPC ML pipeline (**Cassandra gRPC ML**)" to the list.

- [ ] **Step 3: Final full-portfolio verification**

```bash
docker compose down
docker compose build
docker compose up -d
docker compose ps
```

Expected: all 4 services `Up`/`healthy`. Then, using the browser tool, click through all 4 tabs (AutoTopic, Autopilot, ECG, Cassandra gRPC ML) and confirm no console errors and no regressions in the 3 pre-existing projects.

- [ ] **Step 4: Commit**

```bash
git add cassandra-grpc-ml/README.md README.md
git commit -m "Add Cassandra+gRPC ML documentation and root README entry"
```

---

## Self-Review Notes

**Spec coverage:** Section 1 (origin/framing) -> Task 22 README. Section 2 (data/ML task) -> Tasks 2, 8, 9. Section 3 (Cassandra schema) -> Task 9. Section 4 (services/gRPC) -> Tasks 1, 4, 9, 10, 11. Section 5 (Docker Compose) -> Task 12. Section 6 (file layout) -> reflected throughout. Section 7 (frontend UI) -> Tasks 16-21. Section 8 (verification plan) -> Tasks 13, 22. Section 9 (out of scope: k8s unverified, no C++, no auth) -> Task 14 and Global Constraints. All spec sections have a covering task.

**Type consistency check performed:** `TrainedModel`/`TrainMetrics` (Task 2) match the fields `server.py` (Task 4) reads; `ml_worker_pb2` field names (`topic_id`, `topic_name`, etc., snake_case per protobuf convention) are consistently converted to camelCase (`topicId`, `topicName`) at the Task 10 boundary where Python protobuf objects become Pydantic schema instances; frontend TypeScript interfaces (Task 15) match the Pydantic schema field names exactly (both camelCase) so `response_model` JSON serialization lines up with `JSON.parse` on the frontend with no field renaming needed.
