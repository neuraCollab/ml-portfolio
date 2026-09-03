# Raspberry Pi 5 ECG / Edge AI

> Source project: [neuraCollab/rasbery-pi-5-ECG](https://github.com/neuraCollab/rasbery-pi-5-ECG).
> This folder is a curated subset of that repository (see "What's here" below) plus one new
> file, `ecg_pipeline.py`, written for this portfolio integration.

**This project is a research/education prototype, not a certified medical device. Its
predictions are model classifications, not medical diagnoses, and must not be used for
clinical decisions.**

## Overview

A portable edge device that records a 2-channel ECG (via two AD8232 sensor + Arduino Nano
units), reconstructs the standard 6-lead frontal-plane ECG (I, II, III, aVR, aVL, aVF) from
those 2 physical channels using Einthoven's/Goldberger's equations, and runs a local
(CPU-only) multi-label PyTorch model to flag 19 possible rhythm/conduction patterns, all on
a Raspberry Pi 5 with no cloud dependency.

- **Hardware**: AD8232 x2 -> Arduino Nano x2 (one per physical lead, `arduino/`) -> USB
  serial -> Raspberry Pi 5.
- **Signal processing**: 0.5-40 Hz order-4 Butterworth bandpass, Einthoven/Goldberger lead
  reconstruction (`rp/main.py`).
- **Model**: `ECGNet` (`ai/nn_main.py`) -- a 4-block Conv1d/BatchNorm/ReLU/MaxPool stack over
  the 6-lead signal, ending in a 19-way sigmoid multi-label head. Trained on ~21,800 records
  from **PTB-XL** (`ai/main.py` builds the training set from the raw PTB-XL wfdb files).
  Exported to TorchScript (`ecg_model_traced.pt`) for CPU inference.
- **Serving**: FastAPI + WebSocket (`rp/main.py`), Jinja2 + Chart.js frontend
  (`rp/templates/index.html`).
- **Validated against real, public, labeled data**: see `data/README.md` for how the model's
  calibrated per-class decision thresholds and evaluation metrics (accuracy/precision/recall/F1,
  per-class confusion matrix) were derived from the real PTB-XL dataset, not fabricated.

## Tech Stack

| Category | Library / Tool |
|---|---|
| Model | PyTorch, TorchScript (CPU inference) |
| Signal processing | SciPy (Butterworth bandpass, R-peak detection), NumPy |
| Data | PTB-XL (via `wfdb`), pandas |
| Serving | FastAPI, WebSockets, Jinja2, Chart.js |
| Hardware | AD8232 ECG front-end, Arduino Nano (2x), Raspberry Pi 5 |
| Firmware | Arduino C++ (`arduino/`) |

## What's here vs. what was left out

Brought in: `rp/main.py`, `rp/templates/index.html`, the canonical `ecg_model_traced.pt`,
the training scripts (`ai/main.py`, `ai/nn_main.py`), both Arduino sketches, and the
synthetic-ECG generator (`physics/generate_mock_ecg_6leads.py`) plus one bundled sample
(`physics/ecg_mock_0001_raw.npy`).

Deliberately **not** brought in:
- `frp/` -- reverse-tunnel binaries (`frpc`/`frps`, ~33MB of committed executables) configured
  with a real VPS IP address and an SSH port-forward, and no auth token. This is
  infrastructure-specific and mildly risky to publish; it doesn't belong in a portfolio repo
  either way. See "Security findings" below.
- `rp/back.py` -- an earlier, simpler version of `rp/main.py` (no model, no `/predict*`
  routes) that's superseded dead code.
- Duplicate model checkpoints (`rp/ecg/ecg_model.pth`, `rp/ecg/ecg_model_traced.pt`,
  `rp/ecg_model.pth`) and debug artifacts (`ecg_app.log`, `debug_signal.png`, `output2.png`).
- The `ai/tr.py` gradient-boosting experiment and the standalone `physics/` biophysics
  exploration (Hamiltonian dipole model, spectral analysis) -- interesting research, not part
  of the deployed pipeline.

## Findings from reviewing the pipeline

1. **`rp/main.py` cannot actually be imported as-is.** It does
   `from .compare_model import compare_simulation_with_recording, generate_mock_ecg_data` at
   module level, but `compare_model.py` does not exist anywhere in the source repository. Any
   fresh clone would fail at import time with `ModuleNotFoundError`, before the FastAPI app
   object is even created. `ecg_pipeline.generate_mock_ecg()` reimplements the missing
   `generate_mock_ecg_data()` using the real synthesis algorithm from the sibling
   `physics/generate_mock_ecg_6leads.py` script.

2. **Inference preprocessing doesn't match training preprocessing.** `ai/main.py` builds
   the training set with bandpass (0.5-40Hz) + per-lead z-score normalization
   (`preprocess_ecg_batch`). `rp/main.py` even has a `preprocess_single_ecg()` function whose
   docstring says it applies "exactly the same preprocessing as training" -- z-score included.
   But the function actually wired to the live `/predict_latest` and `/predict_upload`
   endpoints, `predict_ecg()`, uses a *different* transform: center by a hardcoded ADC baseline
   of 512, bandpass, Gaussian-smooth, then scale by per-signal max-abs to roughly [-1.7, 1.7]
   clipped to [-4, 4]. The model never saw that distribution during training.
   `ecg_pipeline.preprocess_ecg()` uses the training-matching bandpass+z-score transform.

3. **The live endpoint's probability isn't a probability.** `ECGNet`'s last layer is
   `nn.Sigmoid()`, so the model already outputs a proper per-class probability in [0, 1], and
   training/evaluation binarizes it at the standard 0.5 (`ai/nn_main.py`:
   `y_pred_binary = (y_pred_proba > 0.5)`). `rp/main.py`'s `predict_ecg()` instead multiplies
   the output by 10 and thresholds at 0.1 -- equivalent to thresholding the real probability at
   0.01, which would flag nearly every class as "predicted" on almost any input.
   `ecg_pipeline.run_inference()` returns the raw sigmoid probability and thresholds at 0.5.

4. **The two mock-data sources disagree on array layout.** `physics/generate_mock_ecg_6leads.py`
   saves `(6, 1000)` arrays (leads-first); `rp/main.py`'s `predict_ecg()` requires `(1000, 6)`
   (time-first) and would reject the physics-generated files outright.
   `ecg_pipeline.load_bundled_sample()` transposes on load.

None of this touches the physically/scientifically meaningful parts -- the Einthoven/Goldberger
lead reconstruction, the bandpass filter design, and the trained model weights are used exactly
as they are in the source repo.

## Security findings

- The real VPS IP address used for the frp reverse tunnel is committed in both the top-level
  README and `frp/frpc.toml`, alongside an SSH port-forward (local port 22 -> remote port 6000)
  and no `auth.token` on either `frps`/`frpc` config -- meaning anyone who found that IP could
  attempt to reach the tunneled SSH port. Not something to reproduce here; excluded entirely
  (see above).
- `frp/frpc` and `frp/frps` are ~33MB of prebuilt binaries committed straight into git history.
- `/predict_upload` accepts arbitrary `.npy` uploads and calls `np.load()` on them; this is
  actually safe as shipped (no `allow_pickle=True`, so it can't deserialize arbitrary pickled
  objects), but it has no upload size limit. The portfolio backend's equivalent endpoint adds one.

## Scope: why the model only trains for 10 epochs

`ai/nn_main.py` trains `ECGNet` for a literal `for _e in range(10):` with no
learning-rate schedule, early stopping, or calibration step. That is a
deliberate scope choice for this portfolio project, not an oversight: the
goal here is demonstrating a complete, honest edge-AI pipeline (real hardware
signal reconstruction, real hardware-realistic preprocessing, a real trained
model, real threshold calibration on held-out data, real evaluation with
correct multi-label statistics) end-to-end, not chasing state-of-the-art
accuracy on PTB-XL. See `data/README.md`'s "Why per-class thresholds" section
for exactly what 10 epochs of training produces (raw sigmoid outputs that
never approach 0.5) and how that's measured and corrected rather than hidden.

## Signal-quality layer (deterministic, not a second ML model)

`ecg_pipeline.assess_signal_quality()` runs a handful of scale-invariant,
rule-based checks directly on the raw and filtered signal -- value-uniqueness
fraction (flatline), fraction of samples at the observed min/max (clipping),
raw-vs-filtered residual RMS ratio (noise), moving-average drift range
(baseline instability), and R-peak count against a physiologically plausible
minimum -- plus one AD8232-specific check for a signal sitting at the
lead-off rail (512, ADC-scale data only). No ML model, no training data,
no learned thresholds -- every constant is documented in the module and
checked against real data (this scale-invariant design replaced an earlier
absolute-std check that misflagged every one of the 61 real PTB-XL
evaluation records as "flatline" purely because their physical-unit values
are numerically small). The result (`GOOD`/`WARNING`/`POOR` + which checks
fired) is included in every `/demo`, `/analyze`, and `/evaluate*` response,
and the frontend shows an explicit prediction-reliability warning when a
result comes back `POOR` -- this is a presentation-layer caution, not a
change to `run_inference()` itself.

## Runtime info and latency benchmarking

`GET /api/ecg/runtime` reports real, self-reported process/host stats
(`psutil` CPU%/RSS memory, plus a Linux-only CPU-temperature read from
`/sys/class/thermal/thermal_zone0/temp` -- real on an actual Raspberry Pi 5,
`null` elsewhere rather than a fabricated value) alongside the sampling rate
and the most recent request's real preprocessing/inference timings.
`POST /api/ecg/benchmark` runs 50 real repeated end-to-end passes on the
bundled sample and reports real P50/P95/P99/mean latency, broken out by
preprocessing/inference/total -- the same "N real repeated measurements"
technique already used elsewhere in this portfolio for benchmark numbers, no
distributed benchmarking infrastructure and no synthetic timing estimates.
No Prometheus/Grafana/external telemetry anywhere in this path.

## Expanded evaluation metrics

`POST /api/ecg/evaluate` and `/evaluate-bundled` now also report macro
precision/recall/F1 (averaged only over classes with real positive support
in that evaluation set -- see `data/README.md` for exactly which classes
that is for the bundled 61-record set) and per-class + micro/macro PR-AUC.
Classes with zero positive support report `null` ("N/A") for precision/
recall/F1/PR-AUC rather than scikit-learn's `zero_division=0` default of
`0.0`, which would otherwise look like a measured failure rather than "never
evaluated" -- `numEvaluatedClasses` in the response says exactly how many of
the 19 classes were actually scored. Hamming accuracy is still reported, but
is not the headline number: with 19 mostly-easy-to-get-right-by-predicting-
nothing classes it's easy to inflate, so the response text and the frontend
both lead with macro/micro F1 instead.

## Live mode vs. demo mode (this portfolio)

`rp/main.py` needs two USB serial devices, an Arduino per lead, and a Raspberry Pi -- none of
which are available in a portfolio deployment. The backend integration
(`backend/app/services/ecg/`) keeps `ecg_pipeline.py`'s functions hardware-independent and adds
a demo path: `generate_mock_ecg()` (synthetic) or `load_bundled_sample()` (a real recorded
example) feeds the exact same `preprocess_ecg()` -> `run_inference()` pipeline a live Raspberry
Pi would use for `/predict_latest`. The prediction you see in the demo comes from a real forward
pass through the real trained weights -- only the input signal is synthetic/prerecorded rather
than live hardware.
