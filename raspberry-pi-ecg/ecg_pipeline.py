"""Reusable ECG signal-processing + inference functions for the portfolio backend.

Source project: https://github.com/neuraCollab/rasbery-pi-5-ECG (see rp/main.py,
ai/nn_main.py, physics/generate_mock_ecg_6leads.py in this folder for the
original files this is adapted from).

rp/main.py is a hardware-coupled FastAPI app (it opens two serial ports at
import/startup time and can't be imported standalone), so rather than import
it directly we extract its pure, hardware-independent pieces here -- the same
pattern used for the RL Autopilot project's kitti_vision.py.

Two real bugs found while cross-referencing rp/main.py against the training
script (ai/nn_main.py) are fixed here rather than reproduced -- see the
docstrings on `preprocess_ecg` and `run_inference` below for the evidence.
Everything else (Einthoven lead reconstruction, bandpass filter design,
model architecture/weights, class list and order) is preserved as-is.
"""
from pathlib import Path

import numpy as np
from scipy import signal as scipy_signal

LEAD_NAMES = ["I", "II", "III", "aVR", "aVL", "aVF"]
SEQ_LEN = 1000
SAMPLING_RATE_HZ = 100

# Order and names verified against ai/main.py's `ii_targets` dict (the exact
# mapping used to build the training labels) -- matches rp/main.py's
# class_names list.
CLASS_NAMES = [
    "is_sinus_rhythm", "is_afib", "is_aflt", "is_pac", "is_pvc",
    "is_svt", "is_sinus_arrhythmia", "has_1avb", "has_2avb", "has_3avb",
    "has_rbbb", "has_lbbb", "has_irbbb", "has_ilbbb", "has_lafb",
    "has_lpfb", "has_wpw", "has_bigeminy", "has_trigeminy",
]

# English labels for CLASS_NAMES, adapted from rp/templates/index.html's
# CLASS_LABELS dict (translated; same 19 classes, same meaning).
CLASS_LABELS = {
    "is_sinus_rhythm": "Sinus rhythm",
    "is_afib": "Atrial fibrillation",
    "is_aflt": "Atrial flutter",
    "is_pac": "Premature atrial contraction",
    "is_pvc": "Premature ventricular contraction",
    "is_svt": "Supraventricular tachycardia",
    "is_sinus_arrhythmia": "Sinus arrhythmia",
    "has_1avb": "1st degree AV block",
    "has_2avb": "2nd degree AV block",
    "has_3avb": "3rd degree AV block",
    "has_rbbb": "Right bundle branch block (complete)",
    "has_lbbb": "Left bundle branch block (complete)",
    "has_irbbb": "Right bundle branch block (incomplete)",
    "has_ilbbb": "Left bundle branch block (incomplete)",
    "has_lafb": "Left anterior fascicular block",
    "has_lpfb": "Left posterior fascicular block",
    "has_wpw": "Wolff-Parkinson-White pattern",
    "has_bigeminy": "Bigeminy",
    "has_trigeminy": "Trigeminy",
}

DATA_DIR = Path(__file__).resolve().parent / "data"

# ai/nn_main.py binarizes at a flat 0.5 (`y_pred_binary = (y_pred_proba >
# 0.5)`), which is the standard convention *if* the model is well-calibrated.
# It isn't: validated against real PTB-XL data (see data/README.md), this
# checkpoint's raw sigmoid outputs top out around 1e-4 -- nowhere near 0.5 --
# almost certainly because ai/nn_main.py only trains for 10 epochs with no
# early stopping/calibration step. A flat 0.5 threshold means "predicted"
# is False for every class on every real input, which is honest about the
# probabilities but useless as a classifier.
#
# data/per_class_thresholds.npy holds one threshold per class in CLASS_NAMES
# order, chosen to maximize each class's own F1 on a 48-record PTB-XL
# calibration set disjoint from data/ptbxl_labeled_eval.npz (see
# data/README.md for exactly how it was built and how to regenerate it).
# This is ordinary threshold tuning on held-out data, not a change to the
# model or its outputs -- every probability returned by run_inference() is
# still the model's raw, unmodified sigmoid output.
try:
    PREDICTION_THRESHOLDS = np.load(DATA_DIR / "per_class_thresholds.npy")
except FileNotFoundError:
    PREDICTION_THRESHOLDS = None  # falls back to a flat 0.5 below

PREDICTION_THRESHOLD = 0.5  # kept for reference/back-compat; see above


def compute_all_leads(lead_I: np.ndarray, lead_II: np.ndarray) -> np.ndarray:
    """Verbatim from rp/main.py: Einthoven's/Goldberger's formulas
    reconstructing III, aVR, aVL, aVF from the two physical AD8232 channels."""
    lead_III = lead_II - lead_I
    lead_aVR = -(lead_I + lead_II) / 2.0
    lead_aVL = lead_I - lead_II / 2.0
    lead_aVF = lead_II - lead_I / 2.0
    return np.stack([lead_I, lead_II, lead_III, lead_aVR, lead_aVL, lead_aVF], axis=1)


def bandpass_filter(signal: np.ndarray, fs: int = SAMPLING_RATE_HZ) -> np.ndarray:
    """Just the filtering half of `preprocess_ecg` (0.5-40 Hz order-4
    Butterworth), split out so the UI can show "filtered, not yet
    normalized" as its own visualization stage."""
    sos = scipy_signal.butter(4, [0.5, 40], btype="band", fs=fs, output="sos")
    return scipy_signal.sosfilt(sos, signal, axis=0)


def zscore_normalize(filtered: np.ndarray) -> np.ndarray:
    """Per-lead z-score -- the second half of `preprocess_ecg`."""
    mean = filtered.mean(axis=0, keepdims=True)
    std = filtered.std(axis=0, keepdims=True) + 1e-6
    return (filtered - mean) / std


def preprocess_ecg(signal: np.ndarray, fs: int = SAMPLING_RATE_HZ) -> np.ndarray:
    """Bandpass filter (0.5-40 Hz, order-4 Butterworth) + per-lead z-score.

    This matches `preprocess_ecg_batch()` in ai/main.py -- the function
    actually used to build X_train/X_test before training ECGNet -- and
    rp/main.py's own (unused) `preprocess_single_ecg()`, whose docstring
    claims to be "exactly the same preprocessing as training".

    It does NOT match rp/main.py's `predict_ecg()`, which is the function
    actually wired to the live /predict_latest and /predict_upload
    endpoints: that one centers by a hardcoded ADC baseline of 512, then
    applies Gaussian smoothing and per-signal max-abs scaling to a [-1.7,
    1.7] range clipped to [-4, 4] -- a different transform the model never
    saw during training. That looks like a debugging leftover rather than a
    deliberate choice, so this adapter uses the training-matching transform
    instead. Z-scoring is scale/offset-invariant, so it works the same
    whether `signal` is in raw ADC codes (~0-1023) or physical microvolts.
    """
    return zscore_normalize(bandpass_filter(signal, fs))


def detect_r_peaks(lead_signal: np.ndarray, fs: int = SAMPLING_RATE_HZ) -> dict:
    """Simple R-peak detection via scipy.signal.find_peaks on one (filtered)
    lead -- a standard, real DSP technique, not a clinically-validated
    QRS detector. Height threshold is mean + 1 std of the signal itself, and
    a minimum 300ms refractory distance (caps the derivable rate at 200bpm)
    to avoid double-counting noisy peaks. Returns None for heartRateBpm when
    fewer than 2 peaks are found, since a rate needs at least one interval.
    """
    from scipy.signal import find_peaks

    threshold = lead_signal.mean() + lead_signal.std()
    min_distance = max(1, int(0.3 * fs))
    peaks, _ = find_peaks(lead_signal, height=threshold, distance=min_distance)

    heart_rate_bpm = None
    if len(peaks) >= 2:
        intervals_sec = np.diff(peaks) / fs
        mean_interval_sec = float(np.mean(intervals_sec))
        if mean_interval_sec > 0:
            heart_rate_bpm = round(60.0 / mean_interval_sec, 1)

    return {
        "peakIndices": [int(p) for p in peaks],
        "peakCount": int(len(peaks)),
        "heartRateBpm": heart_rate_bpm,
    }


def signal_metrics(signal: np.ndarray, fs: int = SAMPLING_RATE_HZ) -> dict:
    """Basic descriptive statistics computed directly from the given (N, 6)
    signal array -- min/max/mean/std across all leads and samples."""
    n_samples = signal.shape[0]
    return {
        "numSamples": int(n_samples),
        "samplingRateHz": fs,
        "durationSeconds": round(n_samples / fs, 3),
        "minAmplitude": round(float(signal.min()), 4),
        "maxAmplitude": round(float(signal.max()), 4),
        "meanAmplitude": round(float(signal.mean()), 4),
        "stdAmplitude": round(float(signal.std()), 4),
        "amplitudeRange": round(float(signal.max() - signal.min()), 4),
    }


_model = None
_model_load_error: str | None = None


def load_model(model_path: Path):
    global _model, _model_load_error
    if _model is not None or _model_load_error is not None:
        return _model
    import torch

    try:
        _model = torch.jit.load(str(model_path), map_location="cpu")
    except Exception as exc:
        _model_load_error = f"{type(exc).__name__}: {exc}"
    return _model


def get_model_load_error() -> str | None:
    return _model_load_error


def _thresholds_for(n_classes: int) -> np.ndarray:
    if PREDICTION_THRESHOLDS is not None and len(PREDICTION_THRESHOLDS) == n_classes:
        return PREDICTION_THRESHOLDS
    return np.full(n_classes, PREDICTION_THRESHOLD)


def run_inference(model, signal_1000x6: np.ndarray) -> dict:
    """Run the real ECGNet TorchScript model on a preprocessed (1000, 6) signal.

    Bug fixed vs. rp/main.py's `predict_ecg()`: that function multiplies the
    model's sigmoid output by 10 before thresholding at 0.1 (equivalent to
    thresholding the *real* probability at 0.01). ai/nn_main.py's `ECGNet`
    ends in `nn.Sigmoid()`, so the model's raw output is already a proper
    [0, 1] probability. This returns that raw probability, completely
    unscaled, thresholded per-class using PREDICTION_THRESHOLDS (see above).

    Probabilities are rounded to 8 decimal places, not 4 -- this model's
    outputs are commonly ~1e-6, and 4 decimals would silently display every
    single one as 0.0000.
    """
    import torch

    if signal_1000x6.shape != (SEQ_LEN, 6):
        raise ValueError(f"Expected shape ({SEQ_LEN}, 6), got {signal_1000x6.shape}")

    x = torch.tensor(signal_1000x6, dtype=torch.float32).unsqueeze(0)  # (1, 1000, 6)
    x = x.permute(0, 2, 1)  # (1, 6, 1000) -- matches ECGNet's Conv1d(in_channels=6, ...)

    with torch.no_grad():
        probs = model(x).cpu().numpy()[0]

    thresholds = _thresholds_for(len(CLASS_NAMES))
    predictions = {
        name: {"probability": round(float(probs[i]), 8), "predicted": bool(probs[i] >= thresholds[i])}
        for i, name in enumerate(CLASS_NAMES)
    }
    top_idx = int(np.argmax(probs))
    return {
        "predictions": predictions,
        "topClass": CLASS_NAMES[top_idx],
        "topLabel": CLASS_LABELS[CLASS_NAMES[top_idx]],
        "topProbability": round(float(probs[top_idx]), 8),
    }


def run_inference_batch(model, signals_nx1000x6: np.ndarray) -> np.ndarray:
    """Vectorized version of `run_inference` for many already-preprocessed
    signals at once (used by dataset evaluation) -- same model, same
    permute, just batched instead of one at a time."""
    import torch

    if signals_nx1000x6.shape[1:] != (SEQ_LEN, 6):
        raise ValueError(f"Expected shape (N, {SEQ_LEN}, 6), got {signals_nx1000x6.shape}")

    x = torch.tensor(signals_nx1000x6, dtype=torch.float32).permute(0, 2, 1)  # (N, 6, 1000)
    with torch.no_grad():
        probs = model(x).cpu().numpy()
    return probs


def synth_single_lead(t: np.ndarray, hr: float = 72.0, noise: float = 0.02, drift: float = 0.1, phase_shift: float = 0.0) -> np.ndarray:
    """Verbatim algorithm from physics/generate_mock_ecg_6leads.py: three
    Gaussian bumps per beat (P/QRS/T-ish shape) at the given heart rate, plus
    slow drift and noise."""
    hr_hz = hr / 60.0
    beats = np.arange(0, t[-1], 1 / hr_hz)
    sig = np.zeros_like(t)
    for b in beats:
        sig += np.exp(-0.5 * ((t - b) / 0.05) ** 2)
        sig += 0.3 * np.exp(-0.5 * ((t - (b - 0.15)) / 0.08) ** 2)
        sig += 0.5 * np.exp(-0.5 * ((t - (b + 0.25)) / 0.1) ** 2)
    sig /= np.max(np.abs(sig)) + 1e-9
    sig += drift * np.sin(2 * np.pi * 0.3 * t + phase_shift)
    sig += noise * np.random.default_rng().standard_normal(len(t))
    return sig


def generate_mock_ecg(heart_rate: float = 72.0, duration: float = 10.0, fs: int = SAMPLING_RATE_HZ, seed: int | None = None) -> np.ndarray:
    """Synthetic (1000, 6) ADC-scale ECG, for demo mode when no hardware is
    connected. Ports rp/main.py's `/generate_mock_data` endpoint, which calls
    a `generate_mock_ecg_data()` from a `compare_model` module that does not
    exist anywhere in the source repository (a missing-file bug that would
    make rp/main.py fail to import) -- this reimplements it using the actual
    synthesis algorithm from the sibling physics/generate_mock_ecg_6leads.py
    script, which produces the same kind of signal.
    """
    if seed is not None:
        np.random.seed(seed)
    t = np.arange(int(fs * duration)) / fs
    six_leads = np.stack(
        [synth_single_lead(t, hr=heart_rate, phase_shift=i * np.pi / 12) for i in range(6)],
        axis=1,
    )
    adc = 512 + 200 * six_leads
    adc = np.clip(adc, 0, 1023)
    return adc[:SEQ_LEN].astype(np.float32)


def load_bundled_sample(path: Path) -> np.ndarray:
    """Loads physics/ecg_mock_0001_raw.npy, a real file committed in the
    source repo. It's stored as (6, 1000) int16 (channels-first) -- the
    physics/ mock generator and the rp/ inference pipeline disagree on axis
    order, a real shape/ordering inconsistency between the two halves of the
    upstream repo -- so this transposes it to the (1000, 6) shape
    `run_inference`/`preprocess_ecg` expect.
    """
    raw = np.load(path)  # (6, 1000)
    return raw.T.astype(np.float32)  # (1000, 6)


def load_public_example() -> tuple[np.ndarray, dict]:
    """A single real, public, de-identified ECG record from PTB-XL
    (PhysioNet, CC-BY 4.0) -- see data/README.md for exactly which record,
    how it was fetched, and full attribution. Shape (1000, 6), physical
    units (mV), leads I/II/III/aVR/aVL/aVF in that order (PTB-XL's own
    channel order for its first 6 of 12 leads). Unlike the synthetic/mock
    sources, this one has real ground-truth labels from the dataset.
    """
    import json

    signal = np.load(DATA_DIR / "ptbxl_example_signal.npy").astype(np.float32)
    meta = json.loads((DATA_DIR / "ptbxl_example_meta.json").read_text())
    return signal, meta


def load_labeled_eval_dataset() -> tuple[np.ndarray, np.ndarray, list[str]]:
    """The bundled 61-record real PTB-XL evaluation set (X: (61,1000,6) raw
    mV signals, y: (61,19) multi-label ground truth, same CLASS_NAMES order).
    See data/README.md for provenance and how to regenerate/replace it."""
    npz = np.load(DATA_DIR / "ptbxl_labeled_eval.npz", allow_pickle=True)
    return npz["X"], npz["y"], [str(x) for x in npz["ecg_ids"]]
