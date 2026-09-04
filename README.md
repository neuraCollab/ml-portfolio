# ML Portfolio

Four independent ML/AI projects behind one React + FastAPI web app: NLP topic modeling,
reinforcement learning, edge AI on embedded hardware, and a distributed ML system on Kubernetes.
Each project is runnable both from this app and standalone — see its own README.

🔗 **Live demo:** https://neuracollab.github.io/ml-portfolio/
🎥 **Video walkthrough:** https://youtu.be/4Eko7m_eC98

## Projects

| | Project | Focus |
|---|---|---|
| 🧵 | **[AutoTopic](AutoTopic/README.md)** | NLP topic modeling — LDA, NMF, BERTopic |
| 🚗 | **[RL Autopilot](rl_cv_car-autopilot/README.md)** | Reinforcement learning, sensor fusion (camera + LiDAR + IMU), *WIP* |
| ❤️ | **[ECG Edge AI](raspberry-pi-ecg/README.md)** | Embedded hardware + PyTorch inference + web UI, system design |
| 🌐 | **[Cassandra + gRPC ML](cassandra-grpc-ml/README.md)** | Distributed ML serving on Kubernetes, DevOps |

## Stack

Python, PyTorch, scikit-learn, FastAPI, React + TypeScript, Docker, Kubernetes, gRPC, Cassandra.

## Run

```bash
git clone <this-repo> && cd ml-portfolio
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs

Cassandra + gRPC ML additionally needs a local Kubernetes cluster — see its own README.
