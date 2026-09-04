# Cassandra + gRPC ML — Distributed ML Serving

Built to demonstrate working with complex, real infrastructure dependencies: a DevOps-style
distributed system, not just a model in a notebook. A TF-IDF + Logistic Regression text
classifier is trained and served across a real Kubernetes worker pool.

Architecture: FastAPI gateway → Coordinator (discovers worker pods via the k8s API, dispatches
requests round-robin over gRPC) → N worker pods (scikit-learn train/predict) → Cassandra
(state/metadata) + MinIO (model artifacts). The Cassandra-for-storage + gRPC coordinator/worker
pattern is adapted as a template from an earlier personal project (`cassandra-grpc-dev`).

Worker pool is scalable live (1–5 replicas) and self-heals when a pod is killed — verified
end-to-end against a real local Kubernetes cluster.

**Tech:** Python, scikit-learn, gRPC + Protocol Buffers, Kubernetes, Apache Cassandra, MinIO,
FastAPI.

## Run

```bash
bash k8s/setup-kind.sh
docker compose up -d --build backend frontend
```

Open the frontend, select "Cassandra gRPC ML" to train, predict, and scale the worker pool.
Teardown: `kind delete cluster --name cassandra-grpc-ml`.
