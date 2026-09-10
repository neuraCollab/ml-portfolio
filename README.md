# ML Portfolio

ML and ML-systems projects spanning model development, LLM-inference research, and end-to-end
engineering: an LLM KV-cache quantization study, an unsupervised NLP pipeline, a real
embedded-hardware inference rig, and a Kubernetes-based ML serving system. Built as a working
portfolio for ML Engineer / Data Scientist / ML research-oriented internship roles.

🔗 **Live demo:** https://neuracollab.github.io/ml-portfolio/
🎥 **Video walkthrough:** https://youtu.be/4Eko7m_eC98

Results sections show real numbers from real runs (checked in, not recomputed live). Interactive
tabs (training/inference, Kubernetes scaling) need the backend running locally -- see
[Limitations](#limitations).

## At a glance

- **373K+** real, unlabeled user chat/prompt logs processed end to end in an unsupervised
  topic-modeling pipeline (AutoTopic)
- **3 reasoning LLMs × 4 KV-cache quantization schemes** evaluated on 80 math problems,
  including tensor-level failure analysis (quantization study)
- Real **AD8232 + Arduino + Raspberry Pi 5** pipeline, **5.18ms** CPU inference (ECG Edge AI)
- Kubernetes ML serving system, measured scaling **87.1 → 346.2 req/s** across 1→5 replicas
  (Cassandra + gRPC ML)

## Projects

| Project | Problem / Goal | What I built | Result |
|---|---|---|---|
| **[KV-Cache Quantization × Reasoning Study](https://github.com/neuraCollab/kv-cache-quantization-reasoning-study)** | Does KV-cache quantization break LLM reasoning, and why? | Quantized 3 reasoning LLMs across 4 schemes on 80 real math problems; captured per-layer K/V tensors under a teacher-forced replay | DeepSeek-R1-Distill collapses to 0% accuracy under FP8-E4M3; a same-size Qwen3 model keeps ~53.7% (vs. 52.5% baseline) |
| **[AutoTopic](AutoTopic/README.md)** | Discover topics in 373K+ unlabeled real chat logs with no manual annotation | Built an unsupervised pipeline (BERTopic + UMAP + HDBSCAN), tuned it with Optuna, benchmarked against a classical LDA baseline | 59 topics from 236K analyzed docs; BERTopic diversity 0.966 vs. LDA-10 ~0.91 |
| **[ECG Edge AI](raspberry-pi-ecg/README.md)** | Run a multi-label ECG rhythm classifier on real sensor hardware, fully offline | Wired 2 AD8232 sensors to a Raspberry Pi 5, reconstructed a 6-lead ECG from 2 channels, trained a TorchScript classifier (19 output labels) | 5.18ms CPU-only inference per prediction, no cloud round-trip |
| **[Cassandra + gRPC ML](cassandra-grpc-ml/README.md)** | Serve an ML classifier across a horizontally-scaled worker pool | Built a gRPC Coordinator + Kubernetes worker pool (pod discovery, round-robin dispatch, MinIO model registry) around a distilled classifier | 87.1 → 346.2 req/s scaling 1→5 replicas; automatic recovery after pod failure; 63/63 tests passing |

---

## Featured projects

### KV-Cache Quantization × Reasoning Study

**Problem.** KV-cache quantization is a standard LLM-serving memory optimization, but its effect
on multi-step reasoning specifically -- not just single-token accuracy -- wasn't clear: does it
degrade gracefully, or does it break the reasoning chain outright?

**Approach.** Ran 3 reasoning models (DeepSeek-R1-Distill-Qwen 1.5B/7B, Qwen3-1.7B) across 4
KV-cache quantization schemes (FP8-E4M3, FP8-E5M2, HQQ-INT4, HQQ-INT2) on 80 real problems
(AIME-24 + MATH-500), located each trace's first divergence point from an unquantized baseline
(token-exact matching + a semantic re-sync filter), and classified failures into a 6-category
taxonomy. Then teacher-forced a subset of traces through the model under an instrumented
quantized KV-cache to capture per-layer, per-channel K-tensor statistics.

**Results.** DeepSeek-R1-Distill collapses to 0% accuracy under the mildest scheme tested
(FP8-E4M3), both at 1.5B and 7B; Qwen3-1.7B, a comparably-sized model, keeps ~53.7% vs. a 52.5%
baseline under the same quantization -- a difference within noise. A checked-in reproduction
command against the real model shows one tensor-level mechanism behind the degradation (not
claimed as universal across every model/scheme tested): a small number of outlier K-channels
carry a disproportionate share of the quantization noise, because a per-tensor FP8 scale is set
by the single largest-magnitude value in the tensor.

**What I learned.** Model family, not size or quantization aggressiveness, predicted the outcome
-- a result that only shows up when you run the *same* method on architecturally different
models rather than one model at different sizes. A follow-up "protect the top-N outlier channels
in bf16" defense recovered the K-error in an isolated, teacher-forced measurement, but the
benefit nearly disappeared in real autoregressive generation, because each decode step only sees
one new K-token and outlier-channel identity isn't stable step to step -- a concrete example of a
lab-measured fix not surviving contact with the real generation loop.

**Discussion points:** why the failure is model-family-specific rather than a universal
quantization effect; why a per-tensor FP8 scale creates outlier-channel concentration; why a
defense that works in a teacher-forced measurement can fail in real generation.

**Tech:** PyTorch, HuggingFace Transformers, vLLM, FP8/HQQ quantization, statistical testing
(chi-square, Cramér's V).

---

### AutoTopic — unsupervised topic discovery

**Problem.** Find recurring themes in 373K+ real, unlabeled user chat/prompt logs, with no
manual annotation to start from.

**Approach.** Built an embedding → UMAP → HDBSCAN → c-TF-IDF pipeline (BERTopic), tuned via 30
Optuna trials against a composite coherence + diversity objective. Before committing to
BERTopic, ran a classical LDA baseline study first -- including an initial attempt at
*supervised* classification using LLM-generated labels, and a topic-stability check across 5
reruns.

**Results.** 59 topics discovered from 236K analyzed documents (out of the 373,657-row real
dataset). Diversity is one intrinsic signal among several checked, not a standalone proof of
superiority: BERTopic scores marginally higher than the LDA-10 baseline on that single metric
(0.966 vs. ~0.91), while LDA-10's own topic stability across 5 reruns passed on aggregate (mean
Jaccard 0.376 > the 0.3 threshold) but not for 4 of its 10 individual topics.

**What I learned.** The supervised-classification attempt was abandoned after the confusion
matrix came back almost empty off a few cells -- the LLM-generated labels weren't reliable enough
to evaluate against, which is what motivated moving to unsupervised, intrinsic metrics
(coherence, diversity) instead of forcing a supervised evaluation to work.

**Discussion points:** why intrinsic metrics (coherence/diversity) instead of supervised
accuracy; why LDA as a baseline before BERTopic rather than after; what the topic-stability check
across reruns is actually testing.

**Tech:** BERTopic, UMAP, HDBSCAN, sentence-transformers, Optuna, gensim (LDA), FastAPI, React.

---

### ECG Edge AI — real hardware end to end

**Problem.** Run a multi-label ECG rhythm classifier on real sensor hardware, fully offline, with
only 2 of the 6 standard leads physically measured.

**Approach.** Wired 2 AD8232 analog front-ends to Arduino Nano boards, streamed the signal over
USB serial to a Raspberry Pi 5, reconstructed the 6-lead frontal-plane ECG from those 2 channels
via Einthoven's/Goldberger's equations, and trained a 4-block Conv1d classifier (19-way
multi-label sigmoid head) on ~21,800 real PTB-XL records, exported to TorchScript for CPU-only
inference.

**Results.** 5.18ms per prediction on CPU, no cloud round-trip. The classifier itself is
intentionally small; the project's point is the end-to-end system, not chasing state-of-the-art
PTB-XL accuracy.

**What I learned.** 4 of the 6 leads are *derived*, not measured -- reconstructed from the 2
physical channels via Einthoven's/Goldberger's equations. Any electrode noise or lead-off
artifact in those 2 raw channels propagates into every derived lead before the bandpass filter or
the model ever sees it, so correct signal handling has to happen at acquisition time, not inside
the model.

**Discussion points:** why Einthoven's/Goldberger's equations let 2 physical leads stand in for
6; what changes between training-time and inference-time preprocessing on an edge device; why
TorchScript for on-device inference.

**Tech:** PyTorch/TorchScript, SciPy, Arduino C++, AD8232, Raspberry Pi 5, FastAPI + WebSockets.

---

### Cassandra + gRPC ML — distributed serving

**Problem.** Serve an ML classifier across a horizontally-scaled Kubernetes worker pool, not just
a single in-process model call.

**Approach.** Distilled AutoTopic's slow BERTopic clustering into a TF-IDF + LogisticRegression
classifier, then built a Kubernetes worker pool around it: a Coordinator that discovers Ready
pods via the k8s API and round-robins gRPC calls across them, pod-failure injection relying on
Kubernetes' own Deployment self-healing (no custom reconciliation logic), and a MinIO
object-storage model registry after an earlier design hit Cassandra's 16MB message-size limit.

**Results.** Measured throughput scaling from 87.1 req/s at 1 replica to 346.2 req/s at 5
replicas (real concurrent gRPC `Predict` calls against the live pool); p50 latency dropped from
684ms to 165ms over the same range. 63/63 tests passing across the worker, coordinator, and
backend.

**What I learned.** Tracing the original 16MB Cassandra failure to its root cause (a
non-prepared statement doubling the blob's size on the wire, on top of the blob already sitting
near the limit) was the difference between patching around a symptom and actually fixing the
architecture -- which is what led to moving model artifacts to MinIO and keeping Cassandra to
metadata only.

**Discussion points:** why gRPC between Coordinator and workers instead of REST; why the
failure-recovery demo needed no custom code beyond Kubernetes' own self-healing; why the model
artifact moved out of Cassandra.

**Tech:** gRPC + Protocol Buffers, Kubernetes, scikit-learn, Apache Cassandra, MinIO, FastAPI.

---

## Additional work

**[RL Autopilot](rl_cv_car-autopilot/README.md)** *(WIP)* -- a Gym environment + SAC policy
fusing camera/LiDAR/IMU on KITTI data. Still in active development, not yet a completed case
study; see its own README.

## Limitations

- **ECG Edge AI** is a research/education prototype, not a certified medical device; its
  predictions are model classifications, not diagnoses.
- **KV-Cache Quantization study**: the phenomenology (accuracy, divergence position, failure
  taxonomy) reproduces on CPU from data already checked into the repo; the outlier-channel
  mechanism has a checked-in reproduction command but needs the real model loaded (GPU). A few
  secondary cross-model comparisons in the original write-up are not independently re-verified
  here and are labeled as such in the repo's own results.
- **AutoTopic**'s live demo runs the same pipeline as the full run, on a smaller sample so it
  fits in a request/response cycle.
- **Cassandra + gRPC ML** is a portfolio-scale distributed-systems implementation (single-node
  Cassandra, no auth in dev mode) verified against a real local Kubernetes cluster, not a
  production deployment.
- **RL Autopilot** is a work in progress, not a finished case study.
- The hosted live demo has no backend behind it: Results sections show real precomputed data;
  anything that needs live inference, training, or Kubernetes control needs the app running
  locally (see Quick Start).

## Quick Start

```bash
git clone --recurse-submodules https://github.com/neuraCollab/ml-portfolio.git
cd ml-portfolio
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs

### Project-specific setup

- **AutoTopic and ECG** run fully with the `docker compose` command above -- no extra setup.
- **Cassandra + gRPC ML** additionally needs a local Kubernetes cluster for its
  training/inference/scaling features:
  ```bash
  bash cassandra-grpc-ml/k8s/setup-kind.sh
  docker compose up -d --build backend frontend
  ```
  See [`cassandra-grpc-ml/README.md`](cassandra-grpc-ml/README.md) for teardown and details.
- **KV-Cache Quantization study** is a standalone research repo (git submodule, not part of the
  web app). If cloned without `--recurse-submodules`: `git submodule update --init`. Reproducing
  the underlying study needs a GPU + vLLM; the phenomenology analysis (accuracy, divergence
  position, failure taxonomy) reproduces on CPU from data already checked into the repo -- see
  its own README's "Results" section for exact commands.

## Architecture

```
React + TypeScript frontend --> FastAPI backend --> AutoTopic / ECG (real project code)
                                       |
                                       +--> Cassandra + gRPC ML gateway
                                              --> Coordinator (k8s pod)
                                                  --> gRPC round-robin --> N worker pods
                                                      --> Cassandra (metadata) + MinIO (model)
```

- One FastAPI backend adapts each project's existing code; it doesn't reimplement the ML logic.
- Cassandra + gRPC ML is the one project distributed across separate processes (Coordinator +
  worker pods on Kubernetes); AutoTopic and ECG run in-process inside the backend.
- The KV-cache quantization study sits outside this app, as an independent research repository.

## Stack

**ML / DL:** PyTorch, TorchScript, scikit-learn, HuggingFace Transformers, vLLM

**Data / NLP:** BERTopic, UMAP, HDBSCAN, gensim, sentence-transformers, Optuna, pandas

**ML Systems:** gRPC, Kubernetes, Apache Cassandra, MinIO, FastAPI

**Backend / Infrastructure:** Docker, Docker Compose, React + TypeScript

## Testing

AutoTopic and ECG have no automated test suite -- verified end-to-end through the browser instead.
Cassandra + gRPC ML has a real pytest suite, 63 tests total (worker: 12, coordinator: 23,
backend: 28):

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/worker:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q scikit-learn numpy pytest joblib && pytest -v"
```

The KV-cache quantization study has its own CI test suite (`make test`, ≥85% coverage gate) --
see its README's "Testing" section.
