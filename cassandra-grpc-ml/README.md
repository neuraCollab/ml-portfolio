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
                     writes a small model-metadata row to `models`; Predict reads neither)
                  -> minio client -> MinIO (k8s pod; the actual model artifact -- joblib +
                     gzip -- lives here, never in Cassandra)
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

Distributed application state and metadata, never large ML artifacts: the ingested labeled sample
(`requests`), a log of every inference made through the UI (`predictions`), the history of
training runs (`training_runs`), and, in `models`, only a pointer to the current model artifact
(id, `trained_at`, `artifact_uri`, `num_classes`, `size_bytes`) -- not the model itself. All in the
`cassandra_grpc_ml` keyspace (`SimpleStrategy`, replication factor 1 -- single dev node, no auth,
matches the original repo's own dev-mode setup).

## MinIO's role

Object storage for the trained model artifact itself (`joblib`-serialized, gzip-compressed). A
worker uploads it after training and every worker (including newly-scaled ones) downloads it at
startup and on periodic refresh, using the artifact URI recorded in Cassandra to find it. This is
a minimal, real model-registry pattern -- not a production-ready one: no versioning UI, no
rollback, no access control beyond MinIO's own root credentials. See "Model storage: Cassandra
metadata + MinIO artifacts" below for why this replaced storing the blob directly in Cassandra.

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

This starts a real local Kubernetes cluster (Cassandra + MinIO + a real Coordinator + one real
worker pod), then the existing docker-compose backend/frontend, which talk to that cluster over
`host.docker.internal`. Open `http://localhost:3000`, select "Cassandra gRPC ML", and use the
Architecture section's worker pool controls to scale real worker pods up/down (1-5) -- this
patches a real `Deployment`'s replica count via the Coordinator's k8s API calls, not a
simulation.

To tear the cluster down: `kind delete cluster --name cassandra-grpc-ml`.

**Troubleshooting: Cassandra/Coordinator/pods unreachable after a Docker Desktop restart.**
Observed live: a Docker Desktop restart can bring the `cassandra-grpc-ml-control-plane` container
back up healthy, but without republishing any of its NodePort mappings to the host (`docker port
cassandra-grpc-ml-control-plane` returns nothing) -- Cassandra, the Coordinator, and every worker
pod are fine *inside* the cluster and completely unreachable from outside it, and the backend's
status endpoint reports everything as unreachable. There is no in-place fix for a container that
lost its port publishing; recreate the cluster:

```bash
kind delete cluster --name cassandra-grpc-ml
bash cassandra-grpc-ml/k8s/setup-kind.sh
```

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
Deployment, a `cassandra-grpc-ml-minio` Deployment (ClusterIP, S3 API `:9000`, in-cluster only), a
`cassandra-grpc-ml-coordinator` Deployment (NodePort `:30080`), and a `cassandra-grpc-ml-worker`
Deployment (ClusterIP, gRPC `:50061`) that the Coordinator scales between 1 and 5 replicas on
request. This is the only supported way to run the worker-pool parts of this project -- see
`## How to run` above.

Verified real, end-to-end, against this cluster:
- The Coordinator discovers Ready worker pods via the real k8s API and round-robins real gRPC
  `Predict`/`Train`/`GetStatus` calls across them, retrying once against a different pod on
  `grpc.RpcError`.
- `POST /api/cassandra-grpc/pool/scale` patches the real worker Deployment's replica count;
  requests outside `[1, 5]` are rejected with HTTP 422.
- Scaling the pool up starts real new pods (`kubectl get pods -l app=cassandra-grpc-ml-worker`
  reflects the change), and scaling down real-terminates the extra ones.
- `POST /api/cassandra-grpc/pool/kill-one` deletes a real Ready pod; the Coordinator's next call
  simply doesn't see it (pod discovery re-queries the k8s API every time), and the Deployment
  controller replaces it on its own within seconds -- no special-case code for either half.

### Model storage: Cassandra metadata + MinIO artifacts

`MODEL_PERSISTENCE=shared` (the real in-cluster setting): a worker that finishes training
joblib-serializes and gzip-compresses the model, uploads it to MinIO as one object, then writes a
small metadata row to Cassandra's `models` table (`id`, `trained_at`, `artifact_uri`,
`num_classes`, `size_bytes`) -- never the blob. Every worker pod (including ones scaled up after
training) reads that metadata at startup and on a periodic refresh, then downloads the artifact
from MinIO by its URI. Verified live at this project's actual UI default (`sampleSize=40000`,
50 classes): all pods in a 3- and 5-replica pool converged on `modelLoaded: true` with a matching
`trainedAt`, and real `Predict` calls succeeded on every one of them.

**Historical: this used to store the blob directly in Cassandra, and that broke at real scale.**
The worker originally serialized the trained `TrainedModel` (`TfidfVectorizer` with
`max_features=50000` + a 50-class `LogisticRegression`) straight into a single CQL blob column.
Two compounding bugs made the INSERT fail: (1) the raw joblib dump is ~22.7MB, already close to
Cassandra's 16MB native-protocol message limit; (2) a `session.execute(query_with_%s_placeholders,
params)` "simple statement" made the driver inline the blob as a `0x...` hex literal client-side,
doubling it on the wire (the original failure reported ~45.3MB for this reason, not the blob's
real ~22.7MB). Switching to a prepared statement plus gzip compression fixed the encoding bug and
worked at a small dev sample size (~1.86x compression, comfortably under 16MB) -- but at this
project's actual 40,000-row default, a fuller, more realistic model compresses far less well
(~18.9MB, ~1.18x), still over the limit. That's what motivated moving the artifact to MinIO
entirely rather than continuing to work around Cassandra's message-size ceiling.

## Tech Stack

| Component | Technology |
|---|---|
| Application state / metadata | Apache Cassandra 5 |
| Model artifact storage | MinIO (S3-compatible object storage) |
| Inter-service communication | gRPC + Protocol Buffers |
| ML model | scikit-learn (TfidfVectorizer + LogisticRegression, One-vs-Rest with `n_jobs=-1`) |
| Worker runtime | Python 3.11, grpcio, cassandra-driver |
| Worker orchestration | Kubernetes (`kind`), 1-5 real replicas, scaled by the Coordinator |
| Coordinator | FastAPI, real k8s pod -- pod discovery, round-robin gRPC dispatch, Deployment scaling |
| Gateway | FastAPI (existing backend, reused) -- proxies to the Coordinator over HTTP |
| Frontend | React + TypeScript + Tailwind (existing frontend, reused) |
