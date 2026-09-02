# Cassandra + gRPC ML — Real Kubernetes-Backed Worker Pool

Status: approved by user 2026-09-02. Not yet implemented.

## 1. Origin and framing

The Cassandra + gRPC ML project (see `2026-09-01-cassandra-grpc-ml-design.md`)
currently runs a single `grpc-worker` container under docker-compose. The
portfolio's "System Status" panel and worker-pool visualizer were built
honestly: worker/backend self-stats are real (psutil), but the add/remove
worker controls are an explicitly-labeled **Simulation**, because there was
only ever one real worker container and no live pool to scale.

This design replaces that Simulation with a real, horizontally-scalable
worker pool running under Kubernetes (a local `kind` cluster), with a real
coordinator dispatching real gRPC calls across real worker pods, and real
add/remove buttons that patch a real Deployment's replica count.

This does **not** change AutoTopic, ECG, or Autopilot in any way. It also
does not change the frontend's HTTP contract with the existing backend
(`/api/cassandra-grpc/*` stays the same shape) — only what's behind
`cassandra_grpc_service.py`'s worker-dispatch calls changes.

## 2. Cluster target

A local `kind` (Kubernetes-in-Docker) cluster, created via a checked-in
`kind-config.yaml` with `extraPortMappings` exposing one host port (`30080`)
mapped to a `NodePort` Service in front of the Coordinator. This runs on the
same Docker host as the existing docker-compose stack, requires no cloud
account, and works offline — matching the project's existing "everything
runs locally" posture. Anyone running the portfolio without setting up the
cluster loses only this one project's live worker-pool demo (same pattern as
ECG's real-hardware mode being unavailable without a physical Raspberry Pi)
— the rest of the app, and this project's non-worker-pool sections
(Dataset, Model's inference/training UI once reachable, static Results),
are unaffected.

## 3. Components

### 3.1 Coordinator (new)

A small FastAPI service, `cassandra-grpc-ml/coordinator/`, deployed as its
own k8s Deployment + Service (`coordinator-svc`, exposed via the NodePort
above). Responsibilities:

- **Pod discovery**: lists real Ready endpoints of the `grpc-worker`
  headless/ClusterIP Service via the k8s API (`kubernetes` Python client,
  in-cluster config since the Coordinator itself runs in the cluster).
- **Dispatch**: `POST /predict` and `POST /train` pick one real worker pod
  via a simple in-memory counter (incremented mod the current real endpoint
  count on every call — genuine round-robin, not random) over the current
  real endpoint list; the counter resets to 0 whenever the endpoint list's
  size changes (a scale event) so it never indexes past the end of a
  shrunk list. A `Train` or `Predict` gRPC failure against the chosen pod is
  retried once against a different real pod if one exists, then surfaced as
  a real error — no infinite retry, no fabricated success.
- **Pool status**: `GET /pool` calls real `GetStatus` on every real worker
  pod currently in the endpoint list and returns the aggregated real list
  (per-pod model-loaded/cpu/memory/uptime — same fields already defined in
  `ml_worker.proto`'s `StatusResponse`, unchanged).
- **Scaling**: `POST /pool/scale {"replicas": N}` validates `1 <= N <= 5`
  (the real, now-enforced bounds — previously only illustrative HPA
  reference numbers) and patches the real `grpc-worker` Deployment's
  `spec.replicas` via the k8s API. Returns the real resulting pod list
  (which may still show pods in a starting/not-ready state — the frontend
  must not pretend scaling is instantaneous).

The Coordinator holds no ML logic and no Cassandra session of its own — it
is purely a dispatcher/aggregator, matching the "coordinator hands work to
workers" role from the project's own originating design.

### 3.2 Worker (existing `grpc-worker`, now real multi-replica)

Unchanged gRPC surface (`Predict`, `Train`, `GetStatus`) and unchanged ML
logic (`ml_core.py`). One real change: model persistence moves from a local
joblib file to a Cassandra-backed blob (see §4), so every replica converges
on the same trained model regardless of which pod trained it. Deployed via
`cassandra-grpc-ml/k8s/grpc-worker-deployment.yaml` and
`grpc-worker-service.yaml` — these files exist today but are explicitly
documented as **never deployed against a real cluster**; part of this work
is actually deploying and fixing them against the real local `kind` cluster.

### 3.3 Cassandra (moves into the cluster)

Deployed via `cassandra-grpc-ml/k8s/cassandra-deployment.yaml` +
`cassandra-pvc.yaml` (same caveat: exists today, never verified). Same
single-node dev-mode configuration as the current docker-compose service
(no auth, `SimpleStrategy` replication factor 1) — this design does not
change Cassandra's own configuration, only where it runs.

### 3.4 Existing backend (docker-compose, mostly unchanged)

`cassandra_grpc_service.py` keeps owning ingestion, the `predictions`/
`training_runs` logging tables, and the `/api/cassandra-grpc/*` HTTP
contract the frontend already uses. Its `_grpc_channel()` direct-dial-worker
path is replaced with real HTTP calls to the Coordinator
(`CASSANDRA_GRPC_COORDINATOR_URL`, defaulting to
`http://host.docker.internal:30080`). `get_status()` now calls the
Coordinator's `GET /pool` instead of a single worker's `GetStatus`, and a
new `scale_pool(n)` function calls the Coordinator's `POST /pool/scale`.

The docker-compose `grpc-worker` service is **removed** from
`docker-compose.yml` — all real workers now live in the kind cluster, and
keeping a second, parallel docker-compose worker around would mean two
different code paths to maintain for no benefit. `cassandra`'s
docker-compose service is likewise removed (Cassandra now runs in the
cluster too, per §3.3); the backend's own `predictions`/`training_runs`
Cassandra session now points at the in-cluster Cassandra via the same
NodePort-style exposure pattern as §5, on its own port.

### 3.5 Frontend

`WorkerPoolSimulation.tsx` is renamed `WorkerPool.tsx` and rewired: the
"Simulation" badge and randomly-generated per-pod numbers are removed;
add/remove buttons call the backend's new scale endpoint; the pod list and
each pod's "inspect" card render the real per-pod data from `GET /pool`
(cpu/memory/uptime — reusing the existing `ServiceSelfStats` shape) instead
of client-generated random numbers. `SystemStatusPanel.tsx` changes from a
single fixed worker card to one real card per pod in the current real list.
No other frontend section changes.

## 4. Shared model state across replicas

**Problem**: with N real worker replicas, a `Train` call lands on one pod.
If the model stays a local file, other pods never see it, and a later
`Predict` routed to a different pod would silently serve a stale or missing
model depending purely on which pod the Coordinator's round-robin happened
to pick.

**Fix**: add a `models` table to the existing `cassandra_grpc_ml` keyspace:

```
CREATE TABLE cassandra_grpc_ml.models (
  id timeuuid PRIMARY KEY,
  trained_at timestamp,
  vectorizer_blob blob,
  classifier_blob blob,
  class_labels_json text
)
```

`model_store.py` gains `save_model_to_cassandra(model, session)` (joblib-
serializes vectorizer/classifier into the blob columns, called at the end
of a real `Train`) and `load_latest_model_from_cassandra(session)` (reads
the newest row by `trained_at`). Each worker pod loads the latest model on
startup and re-checks Cassandra for a newer `trained_at` on a short interval
(30s) or lazily before serving a `Predict` if its cached `trained_at` looks
stale — real polling against real data, not a fabricated "sync" animation.
The existing local-file path (`save_model`/`load_model`) stays only as a
dev/test convenience — it's what the existing `test_model_store.py` unit
tests already exercise with a `tmp_path` fixture and no live Cassandra, and
what `python server.py` falls back to if run standalone outside the cluster
for local debugging. It is not a parallel production path: the deployed
in-cluster worker always uses the Cassandra-backed functions.

## 5. Network path

kind's node(s) run as Docker container(s) on their own Docker network,
separate from the docker-compose stack's network. The kind cluster is
created with:

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080   # coordinator-svc NodePort
        hostPort: 30080
      - containerPort: 30942   # cassandra-svc NodePort (CQL native, 9042 in-cluster)
        hostPort: 30942
```

`coordinator-svc` is a `NodePort` Service listening on `nodePort: 30080`.
`cassandra-svc` gains a second, equally real `NodePort` (`30942`) mapping to
its native CQL port (`9042`) so the docker-compose backend's own Cassandra
session (ingestion, `predictions`/`training_runs` logging — §3.4) can reach
it too. Because both kind and docker-compose run under the same Docker
Desktop host (Windows), any docker-compose container reaches these at
`host.docker.internal:30080` / `host.docker.internal:30942` — no custom
bridging required. The backend's existing `CASSANDRA_HOST` env var becomes
`CASSANDRA_HOST=host.docker.internal` with a new `CASSANDRA_PORT=30942`
(the cassandra-driver `Cluster` constructor already accepts a `port` kwarg,
defaulting to the standard `9042` when unset, so this is additive). This is
also how manual verification during implementation will reach both
(`curl localhost:30080/pool`, `cqlsh localhost 30942`, from the host).

## 6. Request lifecycle

- **Train**: backend → Coordinator `POST /train` → real gRPC `Train` on one
  real pod → worker reads `requests` from Cassandra (unchanged), trains,
  saves the model to the new `models` table → real metrics flow back through
  the Coordinator to the backend, logged to `training_runs` exactly as today.
- **Predict**: backend → Coordinator `POST /predict` → round-robin to a real
  pod → that pod's gRPC `Predict` using its currently-loaded (Cassandra-
  synced) model → response flows back and is logged to `predictions` exactly
  as today.
- **System Status**: backend's `get_status()` → Coordinator `GET /pool` →
  real per-pod list → `SystemStatusPanel` shows one real card per real pod
  instead of a single worker card.
- **Scale**: frontend add/remove → backend → Coordinator
  `POST /pool/scale` → real Deployment patch → real new pod list (some
  possibly still starting) returned and reflected honestly in the UI.

## 7. Error handling

- Coordinator unreachable (cluster not running): existing
  `CassandraGrpcError` / "unreachable" UI path is reused as-is — no new
  error-state UI needed, just a new failure source feeding the same honest
  path.
- Scale requests outside `[1, 5]` are rejected by the Coordinator with a
  clear error (frontend already has error-display plumbing from the
  Simulation-era buttons to reuse).
- A gRPC call to a chosen pod that fails is retried once against a
  different real pod if the endpoint list has more than one entry, then
  surfaced as a real error.
- Untrained-model (`FAILED_PRECONDITION`) and Cassandra-unreachable paths
  are unchanged in substance, just one hop further through the Coordinator.

## 8. Testing

- **Coordinator unit tests** (new, `cassandra-grpc-ml/coordinator/tests/`):
  round-robin pod selection over a fake endpoint list, scale-request bounds
  validation (rejects 0, rejects 6, accepts 1-5), pool-status aggregation
  over fake per-pod responses (including one pod erroring) — all against a
  fake/mocked k8s client, no live cluster required to run these.
- **Worker tests**: existing `test_ml_core.py`/`test_model_store.py` stay as
  is; `test_model_store.py` gains cases for the new
  `save_model_to_cassandra`/`load_latest_model_from_cassandra` functions
  using a fake Cassandra session (mock/stub), not a live connection.
- **Backend tests**: existing `test_cassandra_grpc_schemas.py` /
  `test_cassandra_grpc_ingestion.py` unaffected; new schema tests for
  whatever new response shapes `get_status()`/`scale_pool()` return.
- **Real end-to-end verification** (manual, done during implementation and
  reported with real output, same as the psutil/system.local verification
  already done for this project): stand up the real kind cluster, deploy
  real manifests, hit the real Coordinator, train a real model, predict
  through multiple real pods, scale up/down for real, confirm all pods
  converge on the same model via Cassandra.

## 9. Explicitly out of scope

- AutoTopic, ECG, Autopilot: untouched.
- HPA (`grpc-worker-hpa.yaml`): left as unverified reference material, same
  as today — this design implements *manual* real scaling via the
  Coordinator, not automatic CPU-based scaling. HPA could be layered on
  later without conflicting with manual scaling (HPA and manual `kubectl
  scale`-equivalent calls both just set `spec.replicas`), but that's a
  separate, later piece of work if ever wanted.
- Any cloud/remote cluster support — `kind` only.
- Migrating the existing docker-compose backend itself into the cluster —
  it stays where it is and becomes a client of the in-cluster Coordinator.
