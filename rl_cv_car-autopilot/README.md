# RL Car Autopilot — Sensor Fusion & Reinforcement Learning (WIP)

> **Work in progress.** This is a prototype/placeholder, not a finished pipeline — active
> development continues through the current academic year.

A reinforcement-learning driving policy on real autonomous-driving sensor data (KITTI): camera,
LiDAR, and IMU/GPS fused into one observation space. Covers camera calibration, 3D→2D LiDAR
point projection, a custom `Gym` environment, and an SAC policy (Stable-Baselines3) with a
combined CNN + MLP feature extractor.

**Tech:** Python, PyTorch, OpenCV, Stable-Baselines3 (SAC/DDPG), Gym, NumPy/pandas, KITTI dataset.

## Run

```bash
pip install numpy opencv-python matplotlib pandas gym==0.26.2 torch stable-baselines3[extra]
python anomaly_detection.py
```

Requires the KITTI Raw scene `2011_09_26_drive_0001_sync` (with calibration files) placed next
to the script, or a `.zip` of it — the script extracts it automatically.
