# Cassandra + gRPC ML — 4th Portfolio Project Design

Status: approved by user 2026-09-01. Implementation in progress.

## 1. Origin and framing

`neuraCollab/cassandra-grpc-dev` is a C++ distributed web crawler: a
coordinator hands URLs to workers over gRPC; workers fetch pages (libcurl),
extract `<a href>` links (libxml2), and store `(url, links, time_taken)` in
Cassandra. There is no text/label data in it and no ML. The accompanying ZIP
UI is a fully mocked React demo (its `server.ts` fakes cluster state; no real
backend behind it) with a dark slate theme that already matches this
portfolio's existing look.

This design does **not** try to bolt ML onto the crawler. Instead it reuses
the two things that are actually valuable from that repo — the
Cassandra-for-storage + gRPC-coordinator/worker distributed-processing
pattern, and the UI's visual language (worker pool, gRPC log stream, proto
viewer, cluster overview) — and rebuilds them around a real, already-present
dataset to produce a genuine ML pipeline: **AutoTopic discovers ~60 topics
in a large Russian request corpus via expensive unsupervised BERTopic; this
project stores a labeled sample of that corpus in Cassandra and distills it
into a fast supervised classifier served over real gRPC for low-latency
inference.**

The original C++ source is not carried into the portfolio repo (user chose
"exclude entirely" over keeping it as unbuilt reference material).

## 2. Data & ML task

- **Source**: `AutoTopic/data/raw/labeled_requests.parquet` — 373,657 rows,
  columns `log_text, cleaned_text, lemmatized_text, topic_id, topic_name`.
  Real, already on disk, gitignored (118MB), currently unused by any running
  pipeline (AutoTopic's live demo runs against its own separate bundled
  sample — no functional overlap/collision).
- **Ingestion**: on first backend startup (or lazily on first `/status` or
  `/dataset-info` call if the `requests` table is empty), ingest a
  **stratified sample capped at 40,000 rows**, proportional per `topic_id`,
  via `cassandra-driver`'s `execute_concurrent_with_args` for reasonable
  ingest speed. A 90/10 train/test split is assigned at ingestion time and
  stored in the `split` column so training is reproducible across runs.
  Full 373k-row ingestion is unnecessary for what this demonstrates and
  would slow down verification for no benefit — this is disclosed in the UI
  copy, not hidden.
- **Model**: `TfidfVectorizer` (Russian stopwords already stripped in
  `cleaned_text`) + `LogisticRegression(multi_class="multinomial")` from
  scikit-learn. Chosen for reliability and fast local training (tens of
  seconds on 36k train rows), not for state-of-the-art accuracy — consistent
  with "prefer a simple, reliable model that can actually train and run
  locally."
- **Metrics**: computed for real on the held-out `split='test'` rows —
  accuracy, macro/micro precision, macro/micro recall, macro/micro F1, and a
  confusion matrix. With ~60 classes, the UI shows the confusion matrix for
  the **top 15 classes by support** (same "notable classes" disclosure
  pattern already used in the ECG static results section), with a note
  about how many classes are omitted and why.

## 3. Cassandra schema

Keyspace `cassandra_grpc_ml`, `SimpleStrategy` replication factor 1 (single
dev node, matches the original repo's own dev setup — no auth, no prod
config, documented as dev-only).

```sql
CREATE TABLE requests (
    id uuid PRIMARY KEY,
    text text,
    cleaned_text text,
    topic_id int,
    topic_name text,
    split text,          -- 'train' | 'test'
    ingested_at timestamp
);

CREATE TABLE predictions (
    id timeuuid PRIMARY KEY,
    input_text text,
    predicted_topic_id int,
    predicted_topic_name text,
    confidence double,
    latency_ms double,
    created_at timestamp
);

CREATE TABLE training_runs (
    id timeuuid PRIMARY KEY,
    sample_size int,
    num_classes int,
    accuracy double,
    macro_precision double,
    macro_recall double,
    macro_f1 double,
    micro_precision double,
    micro_recall double,
    micro_f1 double,
    training_time_seconds double,
    trained_at timestamp
);
```

`predictions` is written to on every real `/predict` call (real round-trip
demonstration: input → Cassandra). `training_runs` gives real history for
the Metrics/Results panels and lets "Not available" be literal (no rows yet)
rather than a fake placeholder.

## 4. Services & gRPC

Python (`grpcio` + `grpcio-tools`) throughout — no C++ toolchain. Rationale:
pure-pip deps, matches the rest of the stack (FastAPI/scikit-learn already
used elsewhere in this backend), reliable to build/verify in this
environment, and the "distributed" property that actually matters (a real
gRPC call across a real container boundary) is fully preserved.

- **`grpc-worker`** (new container, `cassandra-grpc-ml/worker/`): owns the
  model. Has its own `cassandra-driver` session (pulls training rows
  directly from Cassandra — real "load data from Cassandra" step, not
  proxied through the coordinator). Persists the trained
  `(vectorizer, classifier)` via `joblib` to a named Docker volume
  (`cassandra_grpc_model_data:/app/model_store`) so it survives container
  restarts. Exposes:
  - `Predict(text) -> (topic_id, topic_name, confidence, latency_ms)`
  - `Train(sample_size) -> (accuracy, macro_precision, macro_recall,
    macro_f1, micro_precision, micro_recall, micro_f1, num_classes,
    training_time_seconds, confusion_matrix, class_labels)`
  - `GetStatus() -> (model_loaded, num_classes, trained_at)`
- **`backend`** (existing FastAPI service) acts as the client-facing
  gateway *and* coordinator: new `backend/app/api/routes/cassandra_grpc.py`
  + `backend/app/services/cassandra_grpc_service.py` hold a gRPC channel to
  `grpc-worker` and a `cassandra-driver` session for read-side queries
  (`dataset-info`, recent predictions, training run history). This matches
  the existing pattern where AutoTopic/Autopilot/ECG source lives in their
  own project folder and the FastAPI glue lives in `backend/app`.
  `Train` is wrapped in a backend-side in-memory job tracker, polled the
  same way `autotopic_service.py`'s full-pipeline job already is — training
  takes tens of seconds, long enough to want a non-blocking UI, and this
  keeps the pattern consistent across projects rather than introducing a
  second async style.
- Proto file `cassandra-grpc-ml/proto/ml_worker.proto` is the single source
  of truth; stubs are generated at Docker image build time in both the
  `backend` and `grpc-worker` Dockerfiles via `grpc_tools.protoc` (build
  context is the repo root for both, so both can see `cassandra-grpc-ml/proto/`).

### Data flow

```
Browser
  → HTTP → FastAPI (backend, coordinator role)
      → gRPC → grpc-worker
          → cassandra-driver → Cassandra (Train reads `requests`; Predict does not need to read Cassandra)
          → scikit-learn (train / predict)
      ← gRPC response
  ← HTTP response
Backend also writes predictions/training_runs rows to Cassandra directly (coordinator-side logging, real storage round-trip independent of the worker's own Cassandra access).
```

### Error handling

- Worker unavailable (gRPC channel down) → `/status` reports
  `worker: "unreachable"`, `/predict` and `/train` return HTTP 503 with a
  clear message — never a silent fake prediction.
- Cassandra unavailable → `/status` reports `cassandra: "unreachable"`;
  ingestion/training endpoints return 503. Backend does not fall back to an
  in-memory dataset — if Cassandra is down, the UI says so.
- No training run yet → `/metrics` and the static Results section return
  `"Not available"` literally (per requirement — never a fabricated number).
- Parquet file missing at ingestion time (e.g. a clone without the gitignored
  data file) → `/dataset-info` reports the row count as 0 and a clear note
  explaining the file must be present locally; this mirrors the existing
  `AutoTopic/data/README.md` disclosure pattern for the same file.

## 5. Docker Compose

New services added to the existing root `docker-compose.yml` (existing
`backend`/`frontend` services unchanged apart from new `depends_on`/env):

```yaml
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
  depends_on:
    cassandra:
      condition: service_healthy
    grpc-worker:
      condition: service_started
  environment:
    - CASSANDRA_HOST=cassandra
    - GRPC_WORKER_ADDRESS=grpc-worker:50061
    - CASSANDRA_GRPC_DATASET_PATH=AutoTopic/data/raw/labeled_requests.parquet
    - CASSANDRA_GRPC_SAMPLE_SIZE=40000

volumes:
  cassandra_data:
  cassandra_grpc_model_data:
```

New `.env.example` entries mirror the compose environment vars above (no
credentials exist to hardcode — dev-mode Cassandra has none, documented as
such).

## 6. File layout

```
cassandra-grpc-ml/
  README.md                       # project doc (overview, tech stack, architecture, training, inference, metrics, how to run)
  proto/ml_worker.proto
  worker/
    Dockerfile
    requirements.txt
    server.py                     # gRPC server entrypoint
    train.py                      # ingestion + training logic (also used by generate_static_results.py extension)
    model_store.py                # joblib load/save helpers
  k8s/                             # adapted from the original repo, UNVERIFIED (no cluster available here)
    cassandra-deployment.yaml
    cassandra-service.yaml
    cassandra-pv.yaml
    cassandra-pvc.yaml
    grpc-worker-deployment.yaml
    grpc-worker-service.yaml
    grpc-worker-hpa.yaml

backend/app/
  api/routes/cassandra_grpc.py
  services/cassandra_grpc_service.py
  schemas/cassandra_grpc.py

frontend/src/
  components/CassandraGrpcWorkspace.tsx
  components/cassandragrpc/
    OverviewPanel.tsx
    PipelineDiagram.tsx
    DatasetPanel.tsx
    TrainingPanel.tsx
    InferencePanel.tsx
    MetricsPanel.tsx
    ConfusionMatrixTable.tsx
    GrpcLogStream.tsx
    StaticResultsSection.tsx
  data/staticResults/cassandraGrpcResults.json (or public/, if large — same size-based decision as AutoTopic's snapshot)
```

## 7. Frontend UI

New tab in the existing nav (`Header.tsx`/`App.tsx`) alongside AutoTopic /
Car Autopilot / ECG: **"Cassandra gRPC ML"**. Workspace tabs: Overview →
Architecture → Dataset → Training → Inference → Metrics, plus a bottom
static Results section following the exact pattern already established for
the other 3 projects (real snapshot generated by extending
`backend/scripts/generate_static_results.py`, "Not available" if no
training run exists yet when the script runs).

Reused from the ZIP UI (rewired to real endpoints, no mocked state): worker
pool / cluster status cards, gRPC log stream, proto viewer-style display of
the actual `.proto` contents. Interactive elements per the requirements:
dataset info, training button + live status, model status, inference text
input, prediction result, model metrics, confusion matrix (top-15), request
latency breakdown, Cassandra/gRPC connection status.

## 8. Verification plan

1. `docker compose up -d cassandra`, wait for healthy.
2. `docker compose up -d grpc-worker backend`, confirm worker connects to
   Cassandra and backend connects to worker (`/status` → both connected).
3. Confirm automatic ingestion produced a real row count and class
   distribution via `/dataset-info`.
4. `POST /train` (small sample first for speed, e.g. 5,000, then the full
   40,000 for the final static snapshot) → poll `/train/status` → confirm
   real, non-trivial accuracy/precision/recall/F1 and confusion matrix.
5. `POST /predict` with a real Russian sentence → confirm a real
   `topic_id`/`topic_name`/confidence/latency, and confirm it lands in the
   Cassandra `predictions` table.
6. Full flow in the browser: load the new workspace tab, run training and
   inference live, confirm no console errors, confirm the static Results
   section renders real numbers (or "Not available" pre-training).
7. `docker compose build` for the whole portfolio (now 4 services) —
   confirm AutoTopic/Autopilot/ECG are unaffected.
8. Run the extended `generate_static_results.py`, confirm the new JSON
   section contains real numbers matching a completed training run.

## 9. Explicitly out of scope

- Kubernetes manifests are adapted for completeness but **not deployed or
  verified** (no cluster available in this environment) — labeled as
  unverified reference material in both the manifests and the README.
- Original C++ crawler source is not included in the repository.
- No authentication/credentials for Cassandra (matches the original repo's
  own dev-mode setup; documented as dev-only, not production config).
