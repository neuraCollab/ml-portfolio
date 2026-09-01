"""Adapter around the raspberry-pi-ecg project (../raspberry-pi-ecg).

See raspberry-pi-ecg/README.md for what was reused vs. rewritten, and the
bugs found (missing compare_model.py import, train/inference preprocessing
mismatch, a broken probability scale) that this adapter deliberately does
NOT reproduce -- it calls raspberry-pi-ecg/ecg_pipeline.py's corrected
functions instead of rp/main.py's.
"""
import logging
import sys
import time

import numpy as np

from app.core.config import ECG_DIR, ECG_MAX_EVAL_SAMPLES, ECG_MODEL_PATH, ECG_SAMPLE_PATH
from app.schemas.ecg import EcgAnalysisResponse, EcgEvaluationResponse

logger = logging.getLogger(__name__)

if str(ECG_DIR) not in sys.path:
    sys.path.insert(0, str(ECG_DIR))

import ecg_pipeline  # noqa: E402


class EcgError(Exception):
    pass


def warmup() -> None:
    ecg_pipeline.load_model(ECG_MODEL_PATH)


def is_model_loaded() -> bool:
    return ecg_pipeline.load_model(ECG_MODEL_PATH) is not None


def model_load_error() -> str | None:
    return ecg_pipeline.get_model_load_error()


_R_PEAK_LEAD_INDEX = 1  # Lead II -- the conventional lead for QRS/R-peak detection


def _run(
    raw_signal_1000x6: np.ndarray,
    source: str,
    ground_truth: dict[str, int] | None = None,
) -> EcgAnalysisResponse:
    model = ecg_pipeline.load_model(ECG_MODEL_PATH)
    if model is None:
        raise EcgError(f"ECG model could not be loaded: {ecg_pipeline.get_model_load_error()}")

    six_leads = raw_signal_1000x6

    start = time.perf_counter()
    filtered = ecg_pipeline.bandpass_filter(six_leads)
    processed = ecg_pipeline.zscore_normalize(filtered)
    metrics = ecg_pipeline.signal_metrics(six_leads)
    r_peaks = ecg_pipeline.detect_r_peaks(filtered[:, _R_PEAK_LEAD_INDEX])
    preprocessing_ms = (time.perf_counter() - start) * 1000

    start = time.perf_counter()
    result = ecg_pipeline.run_inference(model, processed)
    inference_ms = (time.perf_counter() - start) * 1000

    def _to_leads(arr: np.ndarray) -> dict[str, list[float]]:
        return {name: arr[:, i].round(4).tolist() for i, name in enumerate(ecg_pipeline.LEAD_NAMES)}

    ground_truth_labels = None
    ground_truth_correct = None
    note = (
        "Demo input; the preprocessing and model forward pass are real "
        "(raspberry-pi-ecg/ecg_pipeline.py). No ground-truth label exists for this "
        "sample -- this demonstrates inference only, not measured accuracy. "
        "Not a medical diagnosis."
    )
    if ground_truth is not None:
        ground_truth_labels = {name: bool(val) for name, val in ground_truth.items()}
        ground_truth_correct = {
            name: bool(result["predictions"][name]["predicted"]) == bool(val)
            for name, val in ground_truth.items()
        }
        note = (
            "Real public PTB-XL record (see raspberry-pi-ecg/data/README.md) with real "
            "ground-truth labels. groundTruthCorrect compares this model's calibrated "
            "per-class predictions against those labels for every class -- not a medical "
            "diagnosis."
        )

    return EcgAnalysisResponse(
        leads=_to_leads(six_leads),
        filteredLeads=_to_leads(filtered),
        processedLeads=_to_leads(processed),
        samplingRateHz=ecg_pipeline.SAMPLING_RATE_HZ,
        signalMetrics=metrics,
        rPeaks={
            **r_peaks,
            "note": (
                "Simple scipy.signal.find_peaks R-peak detection on filtered Lead II "
                "(mean+1std threshold, 300ms refractory) -- a standard DSP technique, "
                "not a clinically validated QRS detector."
            ),
        },
        predictions=result["predictions"],
        topClass=result["topClass"],
        topLabel=result["topLabel"],
        topProbability=result["topProbability"],
        preprocessingTimeMs=round(preprocessing_ms, 3),
        inferenceTimeMs=round(inference_ms, 3),
        source=source,
        groundTruthAvailable=ground_truth is not None,
        groundTruthLabels=ground_truth_labels,
        groundTruthCorrect=ground_truth_correct,
        note=note,
    )


def run_demo(source: str, heart_rate: float, seed: int | None) -> EcgAnalysisResponse:
    if source == "synthetic":
        raw = ecg_pipeline.generate_mock_ecg(heart_rate=heart_rate, seed=seed)
        return _run(raw, "synthetic")
    if source == "public":
        raw, meta = ecg_pipeline.load_public_example()
        return _run(raw, "public", ground_truth=meta["labels"])
    raw = ecg_pipeline.load_bundled_sample(ECG_SAMPLE_PATH)
    return _run(raw, "sample")


def detect_serial_ports() -> list[str]:
    """Looks for USB-serial devices that could be the two Arduino/AD8232
    units rp/main.py expects on PORT_I/PORT_II. Real detection (not a
    hardcoded False) so this backend behaves correctly if it's ever actually
    run on a Raspberry Pi with the sensors attached -- but in this portfolio
    deployment (a container with no USB passthrough) it will always find none.
    """
    try:
        from serial.tools import list_ports

        return [p.device for p in list_ports.comports()]
    except Exception:
        return []


async def stream_live_ecg(websocket) -> None:
    """WebSocket handler for /api/ecg/live. Ports rp/main.py's read_serial_data
    loop (Butterworth low-pass + moving-average smoothing, Einthoven/Goldberger
    reconstruction, broadcast as JSON) but scoped to this one connection
    instead of a module-global connection list, and only runs it if it can
    actually open two serial ports -- otherwise it reports that plainly
    instead of pretending to stream.
    """
    import asyncio
    import json
    import threading

    import serial
    from scipy.signal import butter, filtfilt

    ports = detect_serial_ports()
    if len(ports) < 2:
        await websocket.send_json({
            "type": "status",
            "hardwareAvailable": False,
            "detectedPorts": ports,
            "message": (
                "No two serial devices detected -- live hardware streaming needs this "
                "backend running on the actual Raspberry Pi with both AD8232/Arduino "
                "units attached. Use POST /api/ecg/demo for a live pipeline demo "
                "without hardware."
            ),
        })
        return

    try:
        ser_I = serial.Serial(ports[0], 115200, timeout=0.01)
        ser_II = serial.Serial(ports[1], 115200, timeout=0.01)
    except Exception as exc:
        await websocket.send_json({
            "type": "status", "hardwareAvailable": False, "detectedPorts": ports,
            "message": f"Found serial ports but could not open them: {exc}",
        })
        return

    await websocket.send_json({"type": "status", "hardwareAvailable": True, "detectedPorts": ports})

    stop = threading.Event()
    loop = asyncio.get_running_loop()

    def read_loop():
        buf_I, buf_II = [], []
        while not stop.is_set():
            try:
                if ser_I.in_waiting:
                    line = ser_I.readline().decode("utf-8", errors="ignore").strip()
                    if line.isdigit():
                        buf_I.append(int(line))
                if ser_II.in_waiting:
                    line = ser_II.readline().decode("utf-8", errors="ignore").strip()
                    if line.isdigit():
                        buf_II.append(int(line))
            except Exception:
                break

            if len(buf_I) >= 50 and len(buf_II) >= 50:
                I_raw, II_raw = np.array(buf_I[-50:]), np.array(buf_II[-50:])
                b, a = butter(5, 40 / 50, btype="low")
                I_f, II_f = float(filtfilt(b, a, I_raw)[-1]), float(filtfilt(b, a, II_raw)[-1])
                six = ecg_pipeline.compute_all_leads(np.array([I_f]), np.array([II_f]))[0]
                data = dict(zip(ecg_pipeline.LEAD_NAMES, [round(float(v), 1) for v in six]))
                data["timestamp"] = time.time()
                try:
                    asyncio.run_coroutine_threadsafe(websocket.send_text(json.dumps(data)), loop)
                except Exception:
                    pass
            time.sleep(0.01)

    thread = threading.Thread(target=read_loop, daemon=True)
    thread.start()
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        stop.set()
        ser_I.close()
        ser_II.close()


def run_upload(raw_bytes: bytes) -> EcgAnalysisResponse:
    import io

    try:
        data = np.load(io.BytesIO(raw_bytes))
    except Exception as exc:
        raise EcgError(f"Could not parse .npy file: {exc}")

    if data.shape == (6, 1000):
        data = data.T
    if data.shape != (1000, 6):
        raise EcgError(f"Expected array shape (1000, 6) or (6, 1000), got {data.shape}")

    return _run(data.astype(np.float32), "upload")


def _evaluate(X: np.ndarray, y: np.ndarray, note: str) -> EcgEvaluationResponse:
    """Shared metric computation for evaluate_dataset() and
    evaluate_bundled_dataset(): runs the actual model on every sample and
    compares to ground-truth labels with scikit-learn's standard metric
    functions -- this is the only place in the ECG demo where
    "accuracy"/"precision"/"recall" are legitimate, because it's the only
    place we have real labels to compare against. Uses the same calibrated
    per-class thresholds as live inference (see ecg_pipeline.PREDICTION_THRESHOLDS
    and raspberry-pi-ecg/data/README.md) rather than the model's un-calibrated
    flat 0.5, so these numbers match what /api/ecg/demo and /analyze report.
    """
    from sklearn.metrics import accuracy_score, hamming_loss, precision_recall_fscore_support

    n_classes = len(ecg_pipeline.CLASS_NAMES)

    model = ecg_pipeline.load_model(ECG_MODEL_PATH)
    if model is None:
        raise EcgError(f"ECG model could not be loaded: {ecg_pipeline.get_model_load_error()}")

    processed = np.stack([
        ecg_pipeline.preprocess_ecg(X[i].astype(np.float32)) for i in range(X.shape[0])
    ])
    probs = ecg_pipeline.run_inference_batch(model, processed)
    thresholds = ecg_pipeline._thresholds_for(n_classes)
    preds = (probs >= thresholds[None, :]).astype(int)
    y_true = (y > 0.5).astype(int)

    subset_acc = accuracy_score(y_true, preds)
    hamming_acc = 1 - hamming_loss(y_true, preds)
    micro_p, micro_r, micro_f1, _ = precision_recall_fscore_support(
        y_true, preds, average="micro", zero_division=0
    )
    per_class_p, per_class_r, per_class_f1, support = precision_recall_fscore_support(
        y_true, preds, average=None, zero_division=0, labels=list(range(n_classes))
    )

    per_class = []
    for i, name in enumerate(ecg_pipeline.CLASS_NAMES):
        tp = int(((preds[:, i] == 1) & (y_true[:, i] == 1)).sum())
        fp = int(((preds[:, i] == 1) & (y_true[:, i] == 0)).sum())
        fn = int(((preds[:, i] == 0) & (y_true[:, i] == 1)).sum())
        tn = int(((preds[:, i] == 0) & (y_true[:, i] == 0)).sum())
        per_class.append({
            "className": name,
            "label": ecg_pipeline.CLASS_LABELS[name],
            "support": int(support[i]),
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
            "trueNegatives": tn,
            "precision": round(float(per_class_p[i]), 4),
            "recall": round(float(per_class_r[i]), 4),
            "f1": round(float(per_class_f1[i]), 4),
        })

    return EcgEvaluationResponse(
        numSamples=int(X.shape[0]),
        numClasses=n_classes,
        subsetAccuracy=round(float(subset_acc), 4),
        hammingAccuracy=round(float(hamming_acc), 4),
        microPrecision=round(float(micro_p), 4),
        microRecall=round(float(micro_r), 4),
        microF1=round(float(micro_f1), 4),
        perClass=per_class,
        note=note,
    )


def evaluate_dataset(npz_bytes: bytes) -> EcgEvaluationResponse:
    """Evaluates the real model against an uploaded ground-truth .npz.

    Expects an .npz with:
      X: (N, 1000, 6) or (N, 6, 1000) float array -- raw (unprocessed) signals
      y: (N, 19) binary array -- multi-label ground truth, columns in
         ecg_pipeline.CLASS_NAMES order (the same order training used).
    """
    import io

    try:
        npz = np.load(io.BytesIO(npz_bytes))
    except Exception as exc:
        raise EcgError(f"Could not parse .npz file: {exc}")

    if "X" not in npz.files or "y" not in npz.files:
        raise EcgError("Expected an .npz file with arrays named 'X' (signals) and 'y' (labels)")

    X, y = npz["X"], npz["y"]
    n_classes = len(ecg_pipeline.CLASS_NAMES)

    if X.ndim != 3 or 6 not in X.shape[1:3]:
        raise EcgError(f"X must have shape (N, 1000, 6) or (N, 6, 1000), got {X.shape}")
    if X.shape[1] == 6 and X.shape[2] != 6:
        X = np.transpose(X, (0, 2, 1))
    if X.shape[1:] != (ecg_pipeline.SEQ_LEN, 6):
        raise EcgError(f"X must have shape (N, 1000, 6) or (N, 6, 1000), got {npz['X'].shape}")
    if y.shape != (X.shape[0], n_classes):
        raise EcgError(f"y must have shape ({X.shape[0]}, {n_classes}), got {y.shape}")
    if X.shape[0] > ECG_MAX_EVAL_SAMPLES:
        raise EcgError(f"Too many samples ({X.shape[0]}). This demo caps evaluation at {ECG_MAX_EVAL_SAMPLES}.")
    if X.shape[0] < 1:
        raise EcgError("Dataset is empty")

    return _evaluate(
        X,
        y,
        note=(
            "Computed from real model predictions vs. your uploaded ground-truth labels "
            "(scikit-learn precision_recall_fscore_support / accuracy_score / hamming_loss), "
            "using the same calibrated per-class thresholds as live inference. "
            "Subset accuracy = exact match across all 19 labels per sample (strict). "
            "Hamming accuracy = fraction of individual label predictions correct (lenient)."
        ),
    )


def evaluate_bundled_dataset() -> EcgEvaluationResponse:
    """Evaluates the real model against the bundled 61-record real PTB-XL
    labeled evaluation set (raspberry-pi-ecg/data/ptbxl_labeled_eval.npz) --
    no upload needed. See raspberry-pi-ecg/data/README.md for exactly how
    this set was built and how its per-class thresholds were calibrated on a
    disjoint calibration set.
    """
    X, y, _ecg_ids = ecg_pipeline.load_labeled_eval_dataset()
    return _evaluate(
        X,
        y,
        note=(
            "Computed from real model predictions vs. real PTB-XL ground-truth labels "
            "on the bundled 61-record evaluation set (raspberry-pi-ecg/data/README.md), "
            "using per-class thresholds calibrated on a disjoint 48-record calibration "
            "set (scikit-learn precision_recall_fscore_support / accuracy_score / "
            "hamming_loss). Subset accuracy = exact match across all 19 labels per "
            "sample (strict). Hamming accuracy = fraction of individual label "
            "predictions correct (lenient). Support is real and uneven across classes "
            "(7 of 19 classes have any positive examples in this set) -- see the README "
            "for why some classes score far better than others."
        ),
    )
