import os
from pathlib import Path

# Layout inside the container (see backend/Dockerfile):
#   /app/app/...            <- this package
#   /app/AutoTopic/...      <- project 1, reused as-is
#   /app/rl_cv_car-autopilot/... <- project 2, reused as-is
#   /app/raspberry-pi-ecg/... <- project 3, reused as-is
REPO_ROOT = Path(__file__).resolve().parents[2]
AUTOTOPIC_DIR = REPO_ROOT / "AutoTopic"
AUTOPILOT_DIR = REPO_ROOT / "rl_cv_car-autopilot"
ECG_DIR = REPO_ROOT / "raspberry-pi-ecg"

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

# Keep uploaded/sample/interactive corpora small enough that BERTopic finishes
# in a request/response cycle on CPU. The full real dataset (373k+ rows) is
# run separately via the full-pipeline background job (autotopic_service.py's
# start_full_pipeline), which is NOT subject to this cap.
MAX_DOCUMENTS = int(os.environ.get("AUTOTOPIC_MAX_DOCUMENTS", "1000"))

# Where the real AutoTopic dataset (AutoTopic/data/raw/labeled_requests.parquet,
# too large for git -- see AutoTopic/data/README.md) lives. Used by
# autotopic_service.load_real_dataset() -- NOT hardcoded there. Accepts either:
#   * a path relative to AutoTopic/ (the default -- the file already lives at
#     that path locally), or an absolute local path
#   * an http(s) URL (e.g. a Google Drive *direct-download* link), downloaded
#     and cached on first use
# Replace this in .env / backend/.env.example with the real Google Drive URL
# once the file is uploaded there -- see AutoTopic/data/README.md.
AUTOTOPIC_DATA_URL = os.environ.get("AUTOTOPIC_DATA_URL", "data/raw/labeled_requests.parquet")

SAMPLE_IMAGE_PATH = AUTOPILOT_DIR / "undistorted_image.png"
POLICY_MODEL_DIR = AUTOPILOT_DIR / "models"

ECG_MODEL_PATH = ECG_DIR / "rp" / "ecg_model_traced.pt"
ECG_SAMPLE_PATH = ECG_DIR / "physics" / "ecg_mock_0001_raw.npy"
ECG_MAX_UPLOAD_BYTES = int(os.environ.get("ECG_MAX_UPLOAD_BYTES", str(2 * 1024 * 1024)))
ECG_MAX_EVAL_UPLOAD_BYTES = int(os.environ.get("ECG_MAX_EVAL_UPLOAD_BYTES", str(50 * 1024 * 1024)))
ECG_MAX_EVAL_SAMPLES = int(os.environ.get("ECG_MAX_EVAL_SAMPLES", "500"))
