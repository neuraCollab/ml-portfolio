#!/usr/bin/env bash
# cassandra-grpc-ml/k8s/setup-kind.sh
# Creates the local kind cluster, builds and loads the coordinator/worker
# images, and applies all manifests. Run from the repo root.
set -euo pipefail

CLUSTER_NAME="cassandra-grpc-ml"

if ! kind get clusters | grep -qx "$CLUSTER_NAME"; then
  kind create cluster --name "$CLUSTER_NAME" --config cassandra-grpc-ml/k8s/kind-config.yaml
else
  echo "kind cluster '$CLUSTER_NAME' already exists, reusing it."
fi

echo "Building worker image..."
docker build -t cassandra-grpc-ml-worker:latest -f cassandra-grpc-ml/worker/Dockerfile .
echo "Building coordinator image..."
docker build -t cassandra-grpc-ml-coordinator:latest -f cassandra-grpc-ml/coordinator/Dockerfile .

kind load docker-image cassandra-grpc-ml-worker:latest --name "$CLUSTER_NAME"
kind load docker-image cassandra-grpc-ml-coordinator:latest --name "$CLUSTER_NAME"

kubectl apply -f cassandra-grpc-ml/k8s/cassandra-pvc.yaml
kubectl apply -f cassandra-grpc-ml/k8s/cassandra-deployment.yaml
kubectl apply -f cassandra-grpc-ml/k8s/cassandra-service.yaml
kubectl apply -f cassandra-grpc-ml/k8s/grpc-worker-deployment.yaml
kubectl apply -f cassandra-grpc-ml/k8s/grpc-worker-service.yaml
kubectl apply -f cassandra-grpc-ml/k8s/coordinator-deployment.yaml
kubectl apply -f cassandra-grpc-ml/k8s/coordinator-service.yaml

echo "Waiting for cassandra to be Ready (this can take a minute or two)..."
kubectl wait --for=condition=Ready pod -l app=cassandra-grpc-ml-cassandra --timeout=180s

echo "Waiting for the worker and coordinator to be Ready..."
kubectl wait --for=condition=Ready pod -l app=cassandra-grpc-ml-worker --timeout=120s
kubectl wait --for=condition=Ready pod -l app=cassandra-grpc-ml-coordinator --timeout=60s

echo "Done. Coordinator: http://localhost:30080/pool -- Cassandra CQL: localhost:30942"
