# ML Portfolio

One web interface over four ML projects: an NLP topic-modeling pipeline (**AutoTopic**), an
RL/computer-vision autonomous-driving project (**RL Car Autopilot**), an edge-AI ECG monitor
(**Raspberry Pi 5 ECG**), and a distributed Cassandra+gRPC ML pipeline (**Cassandra gRPC ML**).
The frontend is a React app originally prototyped in Google AI Studio; a FastAPI backend wraps
each project's existing Python code so the UI calls real ML code, not mocked data.

## Projects

### 1. AutoTopic -- NLP topic modeling (`AutoTopic/`)

- **Problem**: automatically discover and label recurring themes in unstructured text logs
  (incident reports, LLM prompts, error messages) without manual annotation.
- **ML approach**: SentenceTransformers multilingual embeddings -> UMAP dimensionality reduction
  -> HDBSCAN density clustering -> c-TF-IDF topic keyword extraction (BERTopic), evaluated with
  Gensim coherence (c_uci / u_mass) and topic-word diversity.
- **Technologies**: bertopic, sentence-transformers, umap-learn, hdbscan, gensim, spaCy, pymorphy3.
- **How to use**: open the *AutoTopic (NLP)* tab, optionally tweak the cleaning/BERTopic sliders or
  upload a CSV with a `log_text` column, and click **Execute BERTopic Pipeline** -- a real,
  synchronous call into `AutoTopic/stages/*` and `AutoTopic/pipeline/*` (the same functions
  `AutoTopic/app.py`'s Streamlit UI uses) via `backend/app/services/autotopic_service.py`.

  **Known limitation, not something this integration changed**: `AutoTopic/stages/cleaning.py`'s
  character filter always keeps Cyrillic characters only, regardless of the language-mode setting
  passed in (the "mixed" branch is unreachable dead code in the original file). English-heavy input
  is therefore aggressively stripped during cleaning; the UI surfaces how many documents were
  dropped after each run. (The bundled sample set includes extra Russian-language log lines and a
  lower default `umap_n_neighbors` specifically so the out-of-the-box demo still clears the survivor
  threshold below despite this.)

  **Two bugs found and fixed in the backend adapter, not in AutoTopic's own files** (verified by
  reproducing each in isolation):
  1. `stages/topic_modeling.py::run_topic_modeling` builds `BERTopic(embedding_model=None, ...)`
     since embeddings are precomputed externally -- reasonable in principle, but with the BERTopic
     version this project resolves to (0.17.4), that specific combination corrupts every per-topic
     document into a blank string before c-TF-IDF vectorization, crashing with sklearn's "empty
     vocabulary" on any non-English corpus. `autotopic_service.py::_fit_bertopic` reuses everything
     else from that function but passes the real cached SentenceTransformer object instead of `None`.
  2. The default `vectorizerMaxDf: 0.9` is a *fraction*; with a small demo corpus, BERTopic often
     finds only 1-2 topic groups, and 0.9 as a fraction of 1 excludes literally every term (100% >
     90%), again raising "empty vocabulary". Default changed to `1.0` (no upper-frequency cutoff).

  A third, milder issue is guarded rather than "fixed": BERTopic's UMAP step needs strictly more
  surviving documents than `umap_n_neighbors` (undocumented, and BERTopic's hardcoded
  `n_components=5` needs a bit more headroom than that alone suggests) or scipy's `eigsh` raises a
  cryptic `k >= N` error; `autotopic_service.py` checks the survivor count up front and returns a
  clear, actionable message instead.

### 2. RL & CV Car Autopilot (`rl_cv_car-autopilot/`)

- **Problem**: fuse a car's camera, LiDAR, and IMU/GPS streams (KITTI raw dataset) into a
  reinforcement-learning driving policy.
- **ML approach**: OpenCV camera calibration/undistortion, LiDAR-to-camera point projection, a
  custom Gym environment (`KITTICarEnv`) combining an 84x84 RGB image with a 6-value sensor vector,
  and a Stable-Baselines3 SAC agent with a custom CNN+MLP feature extractor.
- **Technologies**: OpenCV, Gymnasium, Stable-Baselines3, PyTorch.
- **Important caveat**: the raw KITTI dataset (camera frames, Velodyne `.bin` scans, OXTS,
  calibration files) is **not bundled in this repo** -- it's several GB and its license asks users
  to download it themselves, and `rl_cv_car-autopilot/data/` ships empty. `anomaly_detection.py` is
  also a notebook-style script, not refactored into reusable functions, and its rendering uses
  `cv2.imshow`, a GUI window that can't run server-side.

  So this project is **not** an end-to-end "upload your drive, get a decision" demo:
  - The *RL Car Autopilot (CV)* tab's dual camera/LiDAR displays and reward chart are an
    illustrative example sequence (client-side, clearly labeled as such) standing in for a real
    KITTI drive.
  - Its **Live Backend Demo** panel calls the real backend, which runs the project's actual
    `undistort_image()` / `velo_to_cam()` / `project_to_image()` OpenCV functions (extracted
    unchanged into `rl_cv_car-autopilot/kitti_vision.py`) against a bundled sample frame, using
    calibration values you can edit.
  - Its "Query Pretrained SAC Policy" button loads the actual pretrained weights committed under
    `rl_cv_car-autopilot/models/` and runs a real forward pass (`modelSource: "pretrained-sac"`),
    falling back to a small heuristic and saying so explicitly if that ever can't be reconstructed
    in a given environment. Getting this to load took three fixes in `policy_inference.py`, all
    because the model was constructed with `env=None` (we only need inference, never training):
    SB3's `_setup_model()`/`predict()` read `self.n_envs` and `self.env.action_space`, neither of
    which `BaseAlgorithm.__init__` sets up without a real env -- both are supplied with minimal
    stand-ins. Separately, the observation space was declared channels-last `(84, 84, 3)` (the Gym
    convention `KITTICarEnv` used, relying on training-time `VecTransposeImage` auto-wrapping to
    feed the CNN channels-first) but nothing here builds a VecEnv to do that transposing, so the
    image is transposed once, up front, and the declared space updated to channels-first `(3, 84,
    84)` to match, rather than relying on `predict()`'s auto-transpose heuristics (built around a
    real VecEnv, and produced a nonsensical Conv2d error for a raw one-off numpy dict here).

### 3. Raspberry Pi 5 ECG / Edge AI (`raspberry-pi-ecg/`)

> Adapted from [neuraCollab/rasbery-pi-5-ECG](https://github.com/neuraCollab/rasbery-pi-5-ECG).
> **Research/education prototype, not a certified medical device. Model output is a
> classification, not a medical diagnosis, and must not be used for clinical decisions.**

- **Hardware**: 2x AD8232 ECG sensor + Arduino Nano (one per physical lead) -> USB serial ->
  Raspberry Pi 5.
- **Signal processing**: 0.5-40Hz order-4 Butterworth bandpass; the 6 standard frontal-plane leads
  (I, II, III, aVR, aVL, aVF) are reconstructed from the 2 physical channels via
  Einthoven's/Goldberger's equations.
- **ML approach**: `ECGNet`, a 4-block Conv1d/BatchNorm/ReLU/MaxPool stack ending in a 19-way
  sigmoid multi-label head, trained on ~21,800 PTB-XL records and exported to TorchScript for
  CPU-only edge inference.
- **Technologies**: FastAPI + WebSocket, PyTorch/TorchScript, SciPy, pyserial.
- **Live mode vs. demo mode**: the source project's FastAPI app (`raspberry-pi-ecg/rp/main.py`)
  needs two live serial devices and a Raspberry Pi. The *ECG Edge AI* tab's **Live Hardware**
  toggle calls a real WebSocket endpoint that actually probes for attached serial devices
  (`app/services/ecg_service.py::detect_serial_ports`) and streams real sensor data if it finds
  two -- which it won't in this portfolio deployment, and says so plainly rather than faking a
  signal. Its **Demo Mode** runs the exact same preprocessing + `ECGNet` forward pass on a bundled
  recorded sample or a freshly generated synthetic signal, so the prediction you see is real model
  output, only the input is not live hardware.
  - Three real bugs were found while reviewing this project against its own training script
    (a missing import that would make it fail to start, a preprocessing mismatch between training
    and inference, and a broken probability scale) and are fixed in
    `raspberry-pi-ecg/ecg_pipeline.py` rather than reproduced -- see `raspberry-pi-ecg/README.md`
    for the evidence for each one.
  - The source repo's `frp/` reverse-tunnel setup (committed binaries, a real VPS IP, an SSH
    port-forward, no auth token) was deliberately **not** brought into this repo -- see that same
    README's "Security findings" section.

### 4. Cassandra + gRPC ML (`cassandra-grpc-ml/`)

> Originated from [neuraCollab/cassandra-grpc-dev](https://github.com/neuraCollab/cassandra-grpc-dev),
> a C++ distributed web crawler (coordinator hands URLs to workers over gRPC; workers fetch pages
> and extract links into Cassandra). This integration keeps the Cassandra-for-storage +
> gRPC-coordinator/worker pattern but reimplements it in Python around a real ML task; the
> original C++ source is not included in this repository.

- **Problem**: distill AutoTopic's slow unsupervised topic discovery (BERTopic, minutes per run)
  into a fast supervised classifier suitable for real-time inference, on top of a genuinely
  distributed architecture -- a separate worker process reached over the network, not an in-process
  function call.
- **ML approach**: TF-IDF vectorization + Logistic Regression multi-class classification, trained
  on a stratified sample (capped at 40,000 rows, configurable) of AutoTopic's real labeled request
  corpus (`AutoTopic/data/raw/labeled_requests.parquet`, 373,657 real rows total), predicting one
  of 50 real topic categories with a 90/10 train/test split per class. The latest training run
  (40,000-row sample, 68 seconds) reached 52.8% accuracy / 0.315 macro F1 on the held-out test
  split.
- **Technologies**: Apache Cassandra 5 (storage), gRPC + Protocol Buffers (inter-service
  communication), scikit-learn (TfidfVectorizer + LogisticRegression), grpcio + cassandra-driver
  (the separate `grpc-worker` container), FastAPI (coordinator/gateway -- the existing backend,
  reused).
- **How to use**: open the *Cassandra gRPC ML* tab, click **Train Model** in the Training section
  to trigger ingestion (if needed) and a real gRPC `Train` call to the `grpc-worker` container --
  tracked as a background job polled for status, same pattern as AutoTopic's pipeline -- then use
  the Inference section to send text over a real gRPC call for a real prediction. Every training
  run and every prediction is logged to Cassandra (`training_runs`, `predictions` tables).

## Architecture

```
React + TypeScript + Vite frontend (frontend/)
        |  fetch() / WebSocket
        v
FastAPI backend (backend/)
        |
        +--> AutoTopic/stages, AutoTopic/pipeline        (Project 1, imported as-is)
        +--> rl_cv_car-autopilot/kitti_vision.py,          (Project 2 adapters, new files;
             rl_cv_car-autopilot/policy_inference.py        the rest of that project is unchanged)
        +--> raspberry-pi-ecg/ecg_pipeline.py              (Project 3 adapter, new file, fixes
                                                              3 bugs found in the source project)
        +--> app/services/cassandra_grpc_service.py        (Project 4 coordinator/gateway logic)
                |
                +--> Cassandra (storage: requests, predictions, training_runs)
                +--> gRPC --> grpc-worker container         (separate process, holds the
                                                               trained TF-IDF + LogisticRegression
                                                               model; reached over a real network
                                                               call, not an in-process function)
                                |
                                +--> Cassandra (reads `requests` for training)
```

The backend is a thin adapter layer (`backend/app/services/*`) around each project's existing
code -- it does not reimplement ML logic (beyond the specific, documented ECG bug fixes above).
See `backend/app/api/routes/` for the HTTP surface and each service module's docstring for exactly
what's real vs. illustrative.

## Technologies

Across the four projects and the integration layer: **Python** (FastAPI, PyTorch/TorchScript,
scikit-learn, SciPy, OpenCV, BERTopic, Stable-Baselines3, Gymnasium), **React 18 + TypeScript +
Vite + Tailwind CSS + Recharts**, **Docker / docker-compose**, **Apache Cassandra**, **gRPC +
Protocol Buffers**. NLP, reinforcement learning, computer vision, digital signal processing,
edge/on-device inference, and distributed storage/service architecture are each represented by
one project.

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| POST | `/api/autotopic/analyze` | `{texts: string[], config}` -> `AutoTopicResults` (JSON corpus) |
| POST | `/api/autotopic/analyze-csv` | multipart CSV upload + `text_column` + `config` -> `AutoTopicResults` |
| POST | `/api/autopilot/undistort` | `{calibration}` -> undistorted sample frame (base64 PNG) |
| POST | `/api/autopilot/lidar-overlay` | `{calibration, numPoints}` -> sample frame with projected synthetic LiDAR points |
| POST | `/api/autopilot/predict` | `{state}` -> RL action from the pretrained policy (or heuristic fallback) |
| GET | `/api/ecg/health` | ECG model load status |
| POST | `/api/ecg/demo` | `{source: "sample"\|"synthetic", heartRate, seed}` -> `EcgAnalysisResponse` |
| POST | `/api/ecg/analyze` | multipart `.npy` upload (shape `(1000,6)` or `(6,1000)`) -> `EcgAnalysisResponse` |
| WS | `/api/ecg/live` | Live sensor stream if 2 serial devices are detected; otherwise a status message explaining why not |
| GET | `/api/cassandra-grpc/status` | Cassandra/worker reachability, model-loaded flag, class count, last-trained timestamp |
| GET | `/api/cassandra-grpc/dataset-info` | Triggers ingestion-if-needed, then returns row counts and class distribution for the ingested sample |
| POST | `/api/cassandra-grpc/train` | `{sampleSize}` -> starts a background training job (ingest + real gRPC `Train` call) |
| GET | `/api/cassandra-grpc/train/status` | Polls the current/last training job's status and, once completed, its result metrics |
| GET | `/api/cassandra-grpc/metrics` | Latest completed training run's real metrics, or `null` if none yet this process |
| POST | `/api/cassandra-grpc/predict` | `{text}` -> real gRPC `Predict` call to `grpc-worker` -> `topicId`/`topicName`/confidence |
| GET | `/api/cassandra-grpc/grpc-log` | Recent gRPC calls made by the backend (method, status, latency), for the UI's live log stream |

Interactive OpenAPI docs are available at `http://localhost:8000/docs` once the backend is running.

## Installation

Requires Docker Desktop. (There's no other reliable path here: the three ML projects together pull
in bertopic/sentence-transformers/torch/stable-baselines3/opencv -- installing that stack directly
into a bare host Python is exactly the kind of environment drift Docker avoids, and this repo
doesn't assume a host Python matching every project's exact original toolchain.)

```bash
git clone <this-repo>
cd ml-portfolio
docker compose build
```

The backend image pre-downloads its spaCy models and the SentenceTransformer model at build time
(so requests don't hit the network), which makes the first `docker compose build` slow (~10-15
minutes depending on connection speed) and the resulting image large (~3-4GB, mostly PyTorch + the
embedding model).

## Environment Variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | frontend | `http://localhost:8000` | Backend base URL, inlined at frontend build time |
| `CORS_ORIGINS` | backend | `http://localhost:3000` | Comma-separated list of allowed frontend origins |
| `AUTOTOPIC_MAX_DOCUMENTS` | backend | `500` | Caps corpus size per request so BERTopic stays fast on CPU |
| `ECG_MAX_UPLOAD_BYTES` | backend | `2097152` (2MB) | Caps `.npy` upload size for `/api/ecg/analyze` |
| `CASSANDRA_GRPC_DATASET_PATH` | backend | `AutoTopic/data/raw/labeled_requests.parquet` | Reuses AutoTopic's real dataset -- a path relative to the repo root, or an absolute local path |
| `CASSANDRA_GRPC_SAMPLE_SIZE` | backend | `40000` | Caps the stratified sample ingested into Cassandra for training |
| `CASSANDRA_HOST` | backend | `cassandra` | Hostname of the Cassandra node (the `cassandra` service name under docker-compose) |
| `GRPC_WORKER_ADDRESS` | backend | `grpc-worker:50061` | Host:port of the `grpc-worker` container the backend calls over gRPC |

See `.env.example`, `backend/.env.example`, and `frontend/.env.example`. None of the four projects
need any API keys or credentials -- the AI Studio scaffold's `GEMINI_API_KEY` placeholder was
unused dead boilerplate (no code ever read it) and has been removed, the ECG project's real
infrastructure secrets (VPS IP, tunnel binaries) were deliberately excluded, not parameterized, and
Cassandra runs in dev mode with no auth. (`CASSANDRA_HOST` and `GRPC_WORKER_ADDRESS` are set
directly in `docker-compose.yml` to the in-network service names/ports rather than exposed in the
`.env.example` files, since overriding them only makes sense for a non-Docker run.)

## Running the Portfolio

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (docs at `/docs`)

Without Docker, you'd need Node 20+ for `frontend/` (`npm install && npm run dev`) and a Python
environment matching `backend/requirements.txt` for `backend/` (`uvicorn app.main:app --reload`,
run from inside `backend/` with `AutoTopic/`, `rl_cv_car-autopilot/`, and `raspberry-pi-ecg/`
present as siblings of `backend/app/`, or adjust `backend/app/core/config.py`'s paths).

## Project Demonstrations

- **AutoTopic**: *AutoTopic (NLP)* tab -> Execute BERTopic Pipeline (bundled sample logs) or
  upload a CSV with a `log_text` column.
- **RL Car Autopilot**: *RL Car Autopilot (CV)* tab -> Live Backend Demo panel -> Run Undistort /
  Run LiDAR Overlay / Query Pretrained SAC Policy.
- **ECG**: *ECG Edge AI* tab -> Demo Mode -> Run Analysis (bundled sample, synthetic signal, or
  upload your own `.npy`); Live Hardware toggle demonstrates the real hardware-detection path.

## Development

Each project's own README documents its original design in full:
[`AutoTopic/README.md`](AutoTopic/README.md), [`rl_cv_car-autopilot/README.md`](rl_cv_car-autopilot/README.md),
[`raspberry-pi-ecg/README.md`](raspberry-pi-ecg/README.md) (the latter also documents this
integration's bug fixes and security exclusions in detail), and
[`cassandra-grpc-ml/README.md`](cassandra-grpc-ml/README.md). Backend code is organized as
`app/api/routes/<project>.py` -> `app/services/<project>_service.py` -> the project's own adapter
module, kept flat and parallel across all four projects rather than nested per-project
directories, to match the scale of this repo (four route files, four service files -- a deeper
`projects/<name>/` package structure would be organizational overhead without a matching payoff
here).

## Testing

```bash
# Backend
curl http://localhost:8000/api/health
curl http://localhost:8000/api/ecg/health
curl -X POST http://localhost:8000/api/autotopic/analyze \
  -H 'Content-Type: application/json' \
  -d '{"texts": ["Ошибка подключения к базе данных PostgreSQL"], "config": {}}'
curl -X POST http://localhost:8000/api/ecg/demo \
  -H 'Content-Type: application/json' \
  -d '{"source": "sample", "heartRate": 72}'
curl http://localhost:8000/api/cassandra-grpc/status
curl -X POST http://localhost:8000/api/cassandra-grpc/predict \
  -H 'Content-Type: application/json' \
  -d '{"text": "подбери синонимы к слову веселый"}'

# Frontend
cd frontend
npm install
npm run build   # type-checks (tsc) then builds
```

There is no automated test suite for the first three ML projects (AutoTopic, RL Car Autopilot,
ECG) to preserve/extend; those were verified by running all three flows end-to-end through the
browser: sample-data runs, CSV/`.npy` upload, invalid input, backend-down, and mobile viewport. See
the final report for the exact scenarios exercised in this session.

The fourth project (Cassandra + gRPC ML) additionally has a minimal pytest suite covering its
pure-function logic that needs no live Cassandra/gRPC/Docker service (ML training math and
stratified sampling in `cassandra-grpc-ml/worker/tests/test_ml_core.py` and
`test_model_store.py`; request/schema validation in
`backend/tests/test_cassandra_grpc_schemas.py` and `test_cassandra_grpc_ingestion.py`) --
everything else for this project (gRPC wiring, Cassandra I/O, Docker, frontend) is still verified
live, the same way as the other three. Run it in a throwaway container, e.g.:

```bash
docker run --rm -v "$(pwd)/cassandra-grpc-ml/worker:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q scikit-learn numpy pytest joblib && pytest -v"
docker run --rm -v "$(pwd)/backend:/app" -w /app python:3.11-slim \
  bash -c "pip install --no-cache-dir -q pydantic pandas pyarrow pytest && pytest tests/test_cassandra_grpc_schemas.py tests/test_cassandra_grpc_ingestion.py -v"
```
