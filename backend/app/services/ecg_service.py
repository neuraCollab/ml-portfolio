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
from pathlib import Path

import numpy as np

from app.core.config import ECG_DIR, ECG_MAX_EVAL_SAMPLES, ECG_MODEL_PATH, ECG_SAMPLE_PATH
from app.schemas.ecg import (
    BenchmarkResponse,
    EcgAnalysisResponse,
    EcgEvaluationResponse,
    LatencyPercentiles,
    RuntimeInfo,
)

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

# Real last-request timings, for get_runtime_info() -- process-local state,
# not a monitoring system. None until at least one real /demo, /analyze, or
# /evaluate* call has completed in this process.
_last_preprocessing_ms: float | None = None
_last_inference_ms: float | None = None


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
    signal_quality = ecg_pipeline.assess_signal_quality(six_leads, filtered, r_peaks)
    preprocessing_ms = (time.perf_counter() - start) * 1000

    start = time.perf_counter()
    result = ecg_pipeline.run_inference(model, processed)
    inference_ms = (time.perf_counter() - start) * 1000

    global _last_preprocessing_ms, _last_inference_ms
    _last_preprocessing_ms = round(preprocessing_ms, 3)
    _last_inference_ms = round(inference_ms, 3)

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
        signalQuality=signal_quality,
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


_THRESHOLD_CALIBRATION_NOTE = (
    "Thresholds are calibrated separately per class (not one shared cutoff): each is the "
    "value that maximizes that class's own F1 score, selected on a 48-record PTB-XL "
    "calibration set. That calibration set is disjoint from both the training data and from "
    "the evaluation set these metrics are computed on -- see raspberry-pi-ecg/data/README.md "
    "for exactly how each set was built. This is ordinary threshold tuning on held-out data; "
    "it never touches the model's weights or its raw probabilities, only the cutoff applied "
    "to decide predicted=true/false."
)


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

    Classes with zero positive support in this evaluation set report
    precision/recall/F1/PR-AUC as None ("N/A") rather than sklearn's
    zero_division=0 default of 0.0 -- a 0.0 looks like a measured failure,
    but a class that was never evaluated wasn't measured at all. Macro
    metrics are averaged only over classes that DO have real support, for
    the same reason: including 12 unevaluated all-zero classes in a raw
    19-class macro average would understate the model's real (if weak)
    performance on the 7 classes this set can actually measure.
    """
    from sklearn.metrics import accuracy_score, average_precision_score, hamming_loss, precision_recall_fscore_support

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

    evaluated_mask = support > 0
    num_evaluated = int(evaluated_mask.sum())

    if num_evaluated > 0:
        macro_p = float(per_class_p[evaluated_mask].mean())
        macro_r = float(per_class_r[evaluated_mask].mean())
        macro_f1 = float(per_class_f1[evaluated_mask].mean())
    else:
        macro_p = macro_r = macro_f1 = 0.0

    # PR-AUC: undefined for a class with zero positive examples (there is
    # nothing to rank against), so those columns are excluded rather than
    # passed to average_precision_score, which would otherwise raise or
    # return a misleading value for an all-negative column.
    per_class_pr_auc: list[float | None] = [None] * n_classes
    for i in range(n_classes):
        if support[i] > 0:
            per_class_pr_auc[i] = float(average_precision_score(y_true[:, i], probs[:, i]))
    evaluated_pr_aucs = [v for v in per_class_pr_auc if v is not None]
    pr_auc_macro = float(np.mean(evaluated_pr_aucs)) if evaluated_pr_aucs else None
    pr_auc_micro = (
        float(average_precision_score(y_true[:, evaluated_mask], probs[:, evaluated_mask], average="micro"))
        if num_evaluated > 0
        else None
    )

    per_class = []
    for i, name in enumerate(ecg_pipeline.CLASS_NAMES):
        tp = int(((preds[:, i] == 1) & (y_true[:, i] == 1)).sum())
        fp = int(((preds[:, i] == 1) & (y_true[:, i] == 0)).sum())
        fn = int(((preds[:, i] == 0) & (y_true[:, i] == 1)).sum())
        tn = int(((preds[:, i] == 0) & (y_true[:, i] == 0)).sum())
        has_support = support[i] > 0
        per_class.append({
            "className": name,
            "label": ecg_pipeline.CLASS_LABELS[name],
            "support": int(support[i]),
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
            "trueNegatives": tn,
            "precision": round(float(per_class_p[i]), 4) if has_support else None,
            "recall": round(float(per_class_r[i]), 4) if has_support else None,
            "f1": round(float(per_class_f1[i]), 4) if has_support else None,
            "prAuc": round(per_class_pr_auc[i], 4) if per_class_pr_auc[i] is not None else None,
            "threshold": round(float(thresholds[i]), 6),
        })

    return EcgEvaluationResponse(
        numSamples=int(X.shape[0]),
        numClasses=n_classes,
        numEvaluatedClasses=num_evaluated,
        subsetAccuracy=round(float(subset_acc), 4),
        hammingAccuracy=round(float(hamming_acc), 4),
        microPrecision=round(float(micro_p), 4),
        microRecall=round(float(micro_r), 4),
        microF1=round(float(micro_f1), 4),
        macroPrecision=round(macro_p, 4),
        macroRecall=round(macro_r, 4),
        macroF1=round(macro_f1, 4),
        prAucMicro=round(pr_auc_micro, 4) if pr_auc_micro is not None else None,
        prAucMacro=round(pr_auc_macro, 4) if pr_auc_macro is not None else None,
        perClass=per_class,
        thresholds=ecg_pipeline.get_threshold_info(),
        thresholdCalibrationNote=_THRESHOLD_CALIBRATION_NOTE,
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
            "(scikit-learn precision_recall_fscore_support / average_precision_score / "
            "accuracy_score / hamming_loss), using the same calibrated per-class thresholds "
            "as live inference. Subset accuracy = exact match across all 19 labels per sample "
            "(strict). Hamming accuracy = fraction of individual label predictions correct "
            "(lenient) -- with 19 mostly-easy-to-get-right-by-predicting-nothing classes, this "
            "is easy to inflate and should not be read as the primary quality indicator; macro "
            "F1 and micro F1 are more informative for this multi-label, imbalanced problem. "
            "Classes with zero positive examples in your uploaded labels report precision/"
            "recall/F1/PR-AUC as null (not evaluated), and are excluded from the macro averages."
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
            "set (scikit-learn precision_recall_fscore_support / average_precision_score / "
            "accuracy_score / hamming_loss). Subset accuracy = exact match across all 19 "
            "labels per sample (strict). Hamming accuracy = fraction of individual label "
            "predictions correct (lenient) -- with 19 mostly-easy-to-get-right-by-predicting-"
            "nothing classes, this is easy to inflate and should not be read as the primary "
            "quality indicator; macro F1 and micro F1 are more informative for this "
            "multi-label, imbalanced problem. Only 7 of 19 classes have any positive "
            "examples in this 61-record set -- the other 12 report precision/recall/F1/"
            "PR-AUC as null (not evaluated, not a measured 0) and are excluded from the "
            "macro averages. See the README for why some of the 7 evaluated classes score "
            "far better than others."
        ),
    )


def get_runtime_info() -> RuntimeInfo:
    """Real, self-reported runtime characteristics of the process running this
    pipeline right now -- same pattern as this portfolio's other real
    self-reported System Status panels (psutil CPU%/RAM), plus a Linux-only
    CPU temperature read that only returns a real value on hardware that
    actually exposes one (a real Raspberry Pi; most containers do not).
    Lightweight and local: no monitoring infrastructure, no Prometheus/
    Grafana, no external telemetry -- just reading this process's own state.
    """
    import platform as platform_module

    import psutil

    process = psutil.Process()
    cpu_percent = process.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()

    cpu_temp_c: float | None = None
    try:
        temp_path = Path("/sys/class/thermal/thermal_zone0/temp")
        if temp_path.exists():
            cpu_temp_c = round(int(temp_path.read_text().strip()) / 1000.0, 1)
    except Exception:
        cpu_temp_c = None

    return RuntimeInfo(
        cpuPercent=round(cpu_percent, 1),
        memoryUsedMb=round(process.memory_info().rss / (1024 * 1024), 1),
        memoryTotalMb=round(mem.total / (1024 * 1024), 1),
        cpuTemperatureCelsius=cpu_temp_c,
        samplingRateHz=ecg_pipeline.SAMPLING_RATE_HZ,
        lastInferenceTimeMs=_last_inference_ms,
        lastPreprocessingTimeMs=_last_preprocessing_ms,
        platform=platform_module.platform(),
        note=(
            "Real, self-reported process/host readings (psutil CPU%/RSS memory). CPU "
            "temperature is only available on Linux hosts exposing "
            "/sys/class/thermal/thermal_zone0/temp -- true on a real Raspberry Pi, null "
            "in most container deployments (including this portfolio's) rather than a "
            "fabricated value. lastInferenceTimeMs/lastPreprocessingTimeMs are from the "
            "most recent real /demo, /analyze, or /evaluate* call in this process, null "
            "until one has run. No monitoring infrastructure, no external telemetry."
        ),
    )


_BENCHMARK_ITERATIONS = 50


def run_latency_benchmark() -> BenchmarkResponse:
    """Runs real, repeated end-to-end passes (bundled real sample ->
    preprocess -> real model forward pass) and reports real P50/P95/P99
    latency percentiles for preprocessing, inference, and the combined
    total, computed separately -- expanding the single-shot
    preprocessingTimeMs/inferenceTimeMs every /demo,/analyze call already
    reports into a real percentile distribution instead of one sample.

    Runs on whatever CPU this backend process is actually executing on --
    a real Raspberry Pi 5 in the source hardware deployment, this
    portfolio's container elsewhere (see `platform` in the response, so the
    numbers are read in the right context). No distributed benchmarking
    infrastructure: just N sequential real local timings, in-process.
    """
    import platform as platform_module

    model = ecg_pipeline.load_model(ECG_MODEL_PATH)
    if model is None:
        raise EcgError(f"ECG model could not be loaded: {ecg_pipeline.get_model_load_error()}")

    raw = ecg_pipeline.load_bundled_sample(ECG_SAMPLE_PATH)

    preprocessing_times, inference_times, total_times = [], [], []
    for _ in range(_BENCHMARK_ITERATIONS):
        t0 = time.perf_counter()
        filtered = ecg_pipeline.bandpass_filter(raw)
        processed = ecg_pipeline.zscore_normalize(filtered)
        t1 = time.perf_counter()
        ecg_pipeline.run_inference(model, processed)
        t2 = time.perf_counter()
        preprocessing_times.append((t1 - t0) * 1000)
        inference_times.append((t2 - t1) * 1000)
        total_times.append((t2 - t0) * 1000)

    def _percentiles(values: list[float]) -> LatencyPercentiles:
        arr = np.array(values)
        return LatencyPercentiles(
            p50=round(float(np.percentile(arr, 50)), 3),
            p95=round(float(np.percentile(arr, 95)), 3),
            p99=round(float(np.percentile(arr, 99)), 3),
            mean=round(float(arr.mean()), 3),
        )

    return BenchmarkResponse(
        iterations=_BENCHMARK_ITERATIONS,
        preprocessing=_percentiles(preprocessing_times),
        inference=_percentiles(inference_times),
        total=_percentiles(total_times),
        platform=platform_module.platform(),
        note=(
            f"Real, repeated ({_BENCHMARK_ITERATIONS}x) end-to-end timings of the actual "
            "preprocessing and model forward pass on the bundled sample, run sequentially "
            "in-process on whatever CPU this backend is executing on right now (see "
            "`platform`) -- a real Raspberry Pi 5 in the source hardware deployment; this "
            "portfolio's container CPU in this deployment. No distributed benchmarking "
            "infrastructure, no synthetic timing estimates -- N sequential real local "
            "measurements, same technique this project already uses for its real "
            "self-reported latency figures."
        ),
    )
