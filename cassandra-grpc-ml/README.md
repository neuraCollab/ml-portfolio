# Cassandra + gRPC ML — Distributed Serving for a Topic Classifier

## Summary

A TF-IDF + Logistic Regression topic classifier, distilled from AutoTopic's much slower
unsupervised clustering, served across a horizontally-scaled Kubernetes worker pool behind a
gRPC coordinator. Cassandra holds application state and model metadata; MinIO holds the model
artifact itself. Measured throughput scales from 87.1 req/s at 1 replica to 346.2 req/s at 5.

## Problem

AutoTopic's BERTopic pipeline takes minutes per run and has no natural way to answer "what topic
is this one message about" in real time. Separately: once a trained model needs to be shared
across more than one serving process, "where does the model live, and how does a new replica get
it" becomes its own design problem. This project addresses both — a fast, supervised classifier
distilled from AutoTopic's labeled output, served by a pool of workers that can scale
independently of the request path.

## Approach

**Model.** TF-IDF vectorization + One-vs-Rest Logistic Regression (`n_jobs=-1`, so each class's
binary sub-classifier fits on its own CPU core), predicting one of 50 topic categories from a
stratified sample (40,000 rows by default) of AutoTopic's labeled dataset, with a 90/10
train/test split per class.

**Serving architecture.** A FastAPI gateway forwards requests to a Coordinator, which discovers
Ready worker pods through the Kubernetes API and round-robins gRPC calls across them, retrying
once against a different pod on an RPC error. Each worker runs the trained model and answers
`Predict`/`Train`/`GetStatus` gRPC calls. The Coordinator also exposes a scaling endpoint that
patches the worker Deployment's replica count (bounded to 1–5) and a failure-injection endpoint
that deletes one Ready pod — recovery relies entirely on Kubernetes' own Deployment self-healing
and the Coordinator's per-call pod discovery; no custom reconciliation logic was written for
either.

**Storage split.** Cassandra holds application state: the ingested training sample, a log of
every prediction, the history of training runs, and — critically — only a small metadata row per
trained model (id, timestamp, artifact URI, class count, size), never the model artifact itself.
The artifact (a gzip-compressed joblib dump) lives in MinIO; a worker uploads it after training,
and every worker — including ones scaled up afterward — downloads it at startup using the URI
recorded in Cassandra.

**Origin.** The Cassandra-for-storage-plus-gRPC-coordinator/worker pattern is adapted from an
earlier project (a distributed web crawler), reimplemented here in Python around a supervised ML
task instead of URL fetching.

## Results

- Accuracy **51.5%**, macro F1 **0.294** on the held-out split (50 imbalanced classes; the
  largest class accounts for over a third of the sample, which caps macro-averaged metrics well
  below accuracy).
- Throughput measured at 1, 3, and 5 worker replicas under the same concurrent-request load:

  | Replicas | Throughput (req/s) | p50 latency | p99 latency |
  |---|---|---|---|
  | 1 | 87.1 | 684ms | 743ms |
  | 3 | 244.6 | 235ms | 282ms |
  | 5 | 346.2 | 165ms | 233ms |

- 63 automated tests across the worker, coordinator, and backend layers (12 / 23 / 28).

## Engineering notes

**Tracing a message-size failure to its root cause.** The model artifact was originally stored
as a blob column directly in Cassandra. That failed at the project's default sample size
(40,000 rows), and the investigation turned up two compounding issues rather than one: the raw
joblib dump (~22.7MB) was already close to Cassandra's 16MB native-protocol message limit, and a
non-prepared statement was making the driver inline the blob as a hex literal client-side,
roughly doubling its size on the wire. Switching to a prepared statement plus gzip compression
fixed the encoding bug and worked at small sample sizes (~1.9× compression) — but a fuller,
40,000-row model compresses less well (~1.2×) and still exceeds the limit. That gap between "the
fix works on a small sample" and "the fix works at the size this project runs at" is
what motivated moving the artifact out of Cassandra entirely rather than continuing to tune
around the message-size ceiling.

**Why gRPC between Coordinator and workers.** Protocol Buffers give a typed, versioned contract
for the `Predict`/`Train`/`GetStatus` calls, and gRPC's per-call latency overhead is small enough
not to dominate the actual model inference time — relevant once the Coordinator is fanning
requests out across a pool rather than making one call.

## Limitations

- Single-node Cassandra with no authentication (development-mode configuration) — this is a
  demonstration of the serving architecture, not a production deployment.
- MinIO's role here is a minimal model registry: no artifact versioning UI, no rollback, no
  access control beyond MinIO's own root credentials.
- The classifier is intentionally simple (TF-IDF + Logistic Regression); the project's focus is
  the serving infrastructure around it, not maximizing classification accuracy.

## Tech stack

gRPC + Protocol Buffers, Kubernetes, Apache Cassandra, MinIO, scikit-learn, FastAPI.

## Running it

```bash
bash k8s/setup-kind.sh
docker compose up -d --build backend frontend
```

Open the portfolio frontend, select "Cassandra gRPC ML" to train, predict, and scale the worker
pool. Teardown: `kind delete cluster --name cassandra-grpc-ml`.
