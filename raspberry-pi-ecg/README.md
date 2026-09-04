# ECG Edge AI — System Design Across Hardware and Software

> Research/education prototype, not a certified medical device. Predictions are model
> classifications, not diagnoses.

The ML model here is intentionally simple — a small Conv1d classifier. The point of this project
is **system design**: chaining real electronics through signal processing to a live web UI, all
running locally on a Raspberry Pi with no cloud dependency.

Pipeline: two AD8232 ECG sensors + Arduino Nano boards → USB serial → Raspberry Pi 5 → Butterworth
bandpass filtering → 6-lead reconstruction (Einthoven/Goldberger) → CPU-only TorchScript inference
(19 rhythm/conduction classes) → FastAPI + WebSocket → Chart.js dashboard.

**Tech:** PyTorch/TorchScript, SciPy, FastAPI, WebSockets, Arduino C++, AD8232, Raspberry Pi 5,
PTB-XL dataset.

## Run (demo mode, no hardware required)

```bash
cd ../backend && pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open the ECG Edge AI page in the frontend — it runs the same model on a bundled/synthetic sample
instead of live hardware. For the live hardware path, see `rp/main.py`.
