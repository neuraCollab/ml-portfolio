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

Multi-class topic classification: predict `topic_id`/`topic_name` (one of 50 real categories,
e.g. "Поздравления с днем рождения", "Рецепты действий") from `cleaned_text`, using
`AutoTopic/data/raw/labeled_requests.parquet` (373,657 real rows, gitignored -- see
`AutoTopic/data/README.md`). A stratified sample capped at 40,000 rows (configurable via
`CASSANDRA_GRPC_SAMPLE_SIZE`) is ingested into Cassandra with a 90/10 train/test split per class.

## Architecture

```
Client (browser)
  -> HTTP -> FastAPI backend (coordinator + gateway, docker-compose)
      -> HTTP -> Coordinator (FastAPI, real k8s pod, NodePort :30080)
          -> k8s API -> discovers Ready pods of the `cassandra-grpc-ml-worker` Deployment
          -> gRPC (round-robin, retries once per remaining pod on RpcError)
              -> one of N real worker pods (Deployment, 1-5 replicas)
                  -> cassandra-driver -> Cassandra (k8s pod; Train reads `requests`,
                     writes the trained model to `models`; Predict reads neither)
                  -> scikit-learn (TF-IDF + LogisticRegression train / predict)
      <- gRPC response
  <- HTTP response
```

The backend also writes every prediction and training run to Cassandra directly
(`predictions`, `training_runs` tables) -- a real storage round-trip independent of the worker's
own Cassandra access for training data.

The Coordinator is itself a real FastAPI app (`cassandra-grpc-ml/coordinator/app.py`) running as
a pod in the `kind` cluster (see `## Kubernetes` below), not a stand-in inside the docker-compose
backend -- the backend proxies `/api/cassandra-grpc/{predict,train,status,pool/scale}` to it over
HTTP (`CASSANDRA_GRPC_COORDINATOR_URL`, `host.docker.internal:30080` from inside the backend
container). It discovers worker pods via the real Kubernetes API (`list_worker_endpoints`,
filtering on Ready status), dispatches `Predict`/`Train` gRPC calls round-robin across them
(`RoundRobinDispatcher`, with automatic retry against a different pod on `grpc.RpcError`), and
scales the real `cassandra-grpc-ml-worker` Deployment via `POST /pool/scale` (bounds enforced at
`[1, 5]`, HTTP 422 outside that range).

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

## How to run (Kubernetes worker pool)

Prerequisites: `kind` and `kubectl`, in addition to Docker (already required by the rest of this
portfolio).

```bash
bash cassandra-grpc-ml/k8s/setup-kind.sh
docker compose up -d --build backend frontend
```

This starts a real local Kubernetes cluster (Cassandra + a real Coordinator + one real worker
pod), then the existing docker-compose backend/frontend, which talk to that cluster over
`host.docker.internal`. Open `http://localhost:3000`, select "Cassandra gRPC ML", and use the
Architecture section's worker pool controls to scale real worker pods up/down (1-5) -- this
patches a real `Deployment`'s replica count via the Coordinator's k8s API calls, not a
simulation.

To tear the cluster down: `kind delete cluster --name cassandra-grpc-ml`.

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

`cassandra-grpc-ml/k8s/` contains real manifests, deployed and verified end-to-end against a real
local `kind` cluster (`bash cassandra-grpc-ml/k8s/setup-kind.sh`): a `cassandra-grpc-ml-cassandra`
Deployment, a `cassandra-grpc-ml-coordinator` Deployment (NodePort `:30080`), and a
`cassandra-grpc-ml-worker` Deployment (ClusterIP, gRPC `:50061`) that the Coordinator scales
between 1 and 5 replicas on request. This is the only supported way to run the worker-pool parts
of this project -- see `## How to run` above.

Verified real, end-to-end, against this cluster:
- The Coordinator discovers Ready worker pods via the real k8s API and round-robins real gRPC
  `Predict`/`Train`/`GetStatus` calls across them, retrying once against a different pod on
  `grpc.RpcError`.
- `POST /api/cassandra-grpc/pool/scale` patches the real worker Deployment's replica count;
  requests outside `[1, 5]` are rejected with HTTP 422.
- Scaling the pool up starts real new pods (`kubectl get pods -l app=cassandra-grpc-ml-worker`
  reflects the change), and scaling down real-terminates the extra ones.

**Known limitation, found during this verification pass (not fixed here): Cassandra-backed model
sharing (`MODEL_PERSISTENCE=cassandra`) fails to persist realistically-sized models.** The worker
serializes the trained `TrainedModel` (a `TfidfVectorizer` with `max_features=50000`,
`ngram_range=(1, 2)`, plus a 50-class `LogisticRegression`) with `joblib` into a single CQL blob
column (`cassandra-grpc-ml/worker/model_store.py::save_model_to_cassandra`). For this project's
real dataset (50 classes) that blob is tens of megabytes -- a real training run during this
verification pass produced a 45,335,967-byte blob, which Cassandra's driver rejected with
`cassandra.InvalidRequest: ... CQL Message of size 45335967 bytes exceeds allowed maximum of
16777216 bytes`. The exception is caught and only logged (`server.py::Train`), so `POST
/api/cassandra-grpc/train` still reports success -- the model trains and serves fine from the pod
that trained it, but nothing is ever written to the `models` table
(`SELECT * FROM cassandra_grpc_ml.models` returns 0 rows after a real training run). Consequently,
when the pool is scaled up, newly-started pods log `No persisted model found -- waiting for a
Train call.` and stay at `modelLoaded: false` indefinitely (confirmed past several
30-second `_maybe_refresh_model` cycles) instead of converging to the trained pod's `trainedAt`,
so the round-robin dispatcher's automatic retry (above) ends up masking this by silently falling
back to the one pod that actually has the model. Round-robin dispatch, pod discovery, and
Deployment scaling are real and verified as described above; only the Cassandra-write side of
model sharing needs a fix (e.g. chunking the blob across rows, compressing it, capping
`max_features` lower, or raising Cassandra's `native_transport_max_message_size_in_mb`) before
multi-pod convergence can be relied on for this dataset.

## Tech Stack

| Component | Technology |
|---|---|
| Storage | Apache Cassandra 5 |
| Inter-service communication | gRPC + Protocol Buffers |
| ML model | scikit-learn (TfidfVectorizer + LogisticRegression) |
| Worker runtime | Python 3.11, grpcio, cassandra-driver |
| Worker orchestration | Kubernetes (`kind`), 1-5 real replicas, scaled by the Coordinator |
| Coordinator | FastAPI, real k8s pod -- pod discovery, round-robin gRPC dispatch, Deployment scaling |
| Gateway | FastAPI (existing backend, reused) -- proxies to the Coordinator over HTTP |
| Frontend | React + TypeScript + Tailwind (existing frontend, reused) |
