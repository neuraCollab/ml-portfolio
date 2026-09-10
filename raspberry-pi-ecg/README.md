# ECG Edge AI — Sensor-to-Inference Pipeline on Raspberry Pi 5

> Research/education prototype, not a certified medical device. Model output is a
> classification, not a diagnosis, and isn't intended for clinical use.

## Summary

A two-channel ECG acquisition rig feeds a Raspberry Pi 5, which reconstructs the standard 6-lead
frontal-plane signal from those 2 physical channels and classifies 19 rhythm/conduction patterns
locally, entirely on CPU, with no cloud dependency. Inference takes 5.18ms per prediction. The
classifier itself is intentionally small; the point of the project is the full pipeline — sensor
wiring, signal reconstruction, model, and serving — working together end to end.

## Problem

Two AD8232 analog front-ends only give you 2 of the 6 standard ECG leads. Everything downstream —
signal reconstruction, filtering, classification, and serving — has to work from that limited
input on hardware with no GPU, and has to keep working when the input is noisy or the electrodes
lose contact.

## Approach

**Acquisition.** Two AD8232 sensors, each read by its own Arduino Nano, stream over USB serial to
the Raspberry Pi.

**Signal processing.** A 4th-order Butterworth bandpass (0.5–40Hz) removes baseline wander and
high-frequency noise. The remaining 4 standard leads (III, aVR, aVL, aVF) are derived from the 2
measured leads via Einthoven's and Goldberger's equations — they're computed, not measured.

**Model.** `ECGNet`: a 4-block Conv1d/BatchNorm/ReLU/MaxPool stack ending in a 19-way sigmoid
multi-label head, trained on ~21,800 records from PTB-XL and exported to TorchScript for
CPU-only inference. Training runs for 10 epochs with no learning-rate schedule or early
stopping — a deliberate scope choice to keep the project's focus on the pipeline rather than
chasing state-of-the-art PTB-XL accuracy, with per-class decision thresholds calibrated
separately on held-out data.

**Signal-quality gate.** Before a prediction is trusted, a small set of deterministic,
rule-based checks run on the raw and filtered signal: value-uniqueness fraction (flatline),
fraction of samples at the observed min/max (clipping), raw-vs-filtered residual RMS ratio
(noise), moving-average drift range (baseline instability), R-peak count against a physiologically
plausible minimum, and an AD8232-specific check for a lead-off rail value. No learned model or
training data involved — every threshold is a fixed, documented constant. A `POOR` result
surfaces as an explicit reliability warning alongside the prediction, rather than silently
degrading it.

**Serving.** FastAPI + WebSocket for live streaming and single-shot analysis; runtime and
benchmark endpoints report process stats (CPU/RSS via `psutil`, CPU temperature on Linux) and a
repeated-measurement P50/P95/P99 inference-latency breakdown.

## Results

- **5.18ms** per prediction (CPU-only, TorchScript).
- Evaluation reports macro/micro precision, recall, F1, and PR-AUC — computed only over classes
  with positive support in a given evaluation set, reporting `null` rather than a misleading 0.0
  for classes never evaluated. Hamming accuracy is tracked but not the headline number: with 19
  mostly-easy-to-get-right-by-predicting-nothing classes it's easy to inflate.

## Engineering notes

Three issues surfaced while reviewing the original pipeline against its own training script, and
were corrected in the adapter used for this portfolio rather than left in place:

- **A missing module.** The original entry point imports a `compare_model` module that doesn't
  exist in the source tree, so it fails at import time before the app ever starts. The adapter
  reimplements the one function it needed, `generate_mock_ecg_data`, from the project's own
  signal-synthesis script.
- **A training/inference preprocessing mismatch.** Training built its feature distribution with
  bandpass filtering plus per-lead z-score normalization. The live prediction path instead
  centered the signal on a hardcoded ADC baseline, Gaussian-smoothed it, and scaled it into a
  different numeric range — a distribution the model never saw during training. The adapter
  applies the same transform used at training time.
- **A miscalibrated decision threshold.** `ECGNet`'s output layer is already a sigmoid, so the
  raw output is a proper per-class probability. The original prediction path multiplied that
  probability by 10 and thresholded at 0.1 — equivalent to thresholding the real probability at
  0.01, which would flag nearly every class as positive on almost any input. The adapter
  thresholds the raw probability at 0.5, matching how the model was evaluated during training.

## Limitations

- Research/education prototype; not a certified medical device, and its output must not be used
  for clinical decisions.
- The 10-epoch training schedule is a scope choice, not an attempt at competitive PTB-XL
  accuracy — the model demonstrates a working pipeline, not a state-of-the-art classifier.
- Live hardware mode needs two attached serial devices and a Raspberry Pi; without that hardware,
  the demo path runs the same preprocessing and inference on a bundled recording or a
  synthetically generated signal instead.
- An earlier reverse-tunnel setup in the source project (prebuilt binaries, a hardcoded endpoint,
  no auth token) was deliberately left out of this repository rather than reproduced.

## Tech stack

PyTorch / TorchScript, SciPy, FastAPI, WebSockets, Arduino C++, AD8232, Raspberry Pi 5, PTB-XL
dataset.

## Running it

Demo mode (no hardware required):

```bash
cd ../backend && pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open the ECG Edge AI page in the portfolio frontend — it runs the same model on a bundled or
synthetic sample instead of live hardware. For the live-hardware serial path, see `rp/main.py`.
