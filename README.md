# ML Portfolio

Five independent ML/AI projects: NLP topic modeling, reinforcement learning, edge AI on
embedded hardware, a distributed ML system on Kubernetes, and LLM-inference research — the
first four behind one React + FastAPI web app, the fifth a standalone research repository
(git submodule). Each project is runnable both from this app (where applicable) and
standalone — see its own README.

🔗 **Live demo:** https://neuracollab.github.io/ml-portfolio/
🎥 **Video walkthrough:** https://youtu.be/4Eko7m_eC98

## Projects

| | Project | Focus |
|---|---|---|
| 🧵 | **[AutoTopic](AutoTopic/README.md)** | NLP topic modeling — LDA, NMF, BERTopic |
| 🚗 | **[RL Autopilot](rl_cv_car-autopilot/README.md)** | Reinforcement learning, sensor fusion (camera + LiDAR + IMU), *WIP* |
| ❤️ | **[ECG Edge AI](raspberry-pi-ecg/README.md)** | Embedded hardware + PyTorch inference + web UI, system design |
| 🌐 | **[Cassandra + gRPC ML](cassandra-grpc-ml/README.md)** | Distributed ML serving on Kubernetes, DevOps |
| 🧠 | **[KV-Cache Quantization](kv-cache-quantization-reasoning-study/README.md)** | LLM inference — mechanistic analysis of KV-cache quantization failures in reasoning models (*submodule*) |

## Stack

Python, PyTorch, scikit-learn, FastAPI, React + TypeScript, Docker, Kubernetes, gRPC, Cassandra,
vLLM/HuggingFace Transformers.

## Run

```bash
git clone --recurse-submodules <this-repo> && cd ml-portfolio
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs

Cassandra + gRPC ML additionally needs a local Kubernetes cluster — see its own README.

KV-Cache Quantization is a standalone research repository (git submodule, not part of the
docker-compose app or the frontend) — see
[its own README](kv-cache-quantization-reasoning-study/README.md) for setup (GPU + vLLM required to
reproduce the underlying study; some post-hoc analysis scripts run on CPU against the
checked-in data). If you cloned without `--recurse-submodules`, run
`git submodule update --init` to pull it in.
