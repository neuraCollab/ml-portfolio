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
