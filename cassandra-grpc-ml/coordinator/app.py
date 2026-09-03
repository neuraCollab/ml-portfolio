# cassandra-grpc-ml/coordinator/app.py
"""Real coordinator: discovers real Ready worker pods via the k8s API,
dispatches real gRPC Predict/Train calls to them (round-robin), aggregates
real per-pod GetStatus, and scales the real worker Deployment on request.
Holds no ML logic and no Cassandra session of its own -- see
cassandra-grpc-ml/README.md and docs/superpowers/specs/
2026-09-02-cassandra-grpc-k8s-design.md."""
import logging
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

import grpc
from fastapi import Depends, FastAPI, HTTPException
from kubernetes import client as k8s_client_lib, config as k8s_config
from pydantic import BaseModel, Field

import ml_worker_pb2
import ml_worker_pb2_grpc
from dispatch import RoundRobinDispatcher
from k8s_client import kill_one_worker_pod, list_worker_endpoints, scale_worker_deployment

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

MIN_REPLICAS = 1
MAX_REPLICAS = 5

app = FastAPI(title="cassandra-grpc-ml coordinator")
_dispatcher = RoundRobinDispatcher()


@app.on_event("startup")
def _load_kube_config():
    # In-cluster config when running as a real pod; falls back to the local
    # kubeconfig for standalone dev/testing outside the cluster.
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()


def get_core_v1():
    return k8s_client_lib.CoreV1Api()


def get_apps_v1():
    return k8s_client_lib.AppsV1Api()


def get_worker_stub(address: str):
    channel = grpc.insecure_channel(address)
    return ml_worker_pb2_grpc.MLWorkerStub(channel)


class PredictBody(BaseModel):
    text: str


class TrainBody(BaseModel):
    sampleSize: int


class ScaleBody(BaseModel):
    replicas: int


class BenchmarkBody(BaseModel):
    requests: int = Field(200, ge=1, le=15000)
    concurrency: int = Field(20, ge=1, le=100)


def _rpc_detail(exc: grpc.RpcError) -> str:
    return str(exc.details()) if hasattr(exc, "details") else str(exc)


def _dispatch_with_retry(endpoints, invoke):
    """Pick a worker via the dispatcher and call `invoke(address)` against it.
    On grpc.RpcError, retries once against each remaining Ready endpoint
    before surfacing a 502 for the last error seen. Shared by /predict and
    /train so both endpoints retry a real gRPC failure against a different
    real pod identically."""
    address = _dispatcher.pick(endpoints)
    tried = {address}
    while True:
        try:
            return invoke(address)
        except grpc.RpcError as exc:
            remaining = [e for e in endpoints if e not in tried]
            if not remaining:
                raise HTTPException(status_code=502, detail=_rpc_detail(exc))
            address = remaining[0]
            tried.add(address)


@app.post("/predict")
def predict(body: PredictBody, core_v1=Depends(get_core_v1)):
    endpoints = list_worker_endpoints(core_v1)
    if not endpoints:
        raise HTTPException(status_code=503, detail="No worker pods are currently Ready")
    resp = _dispatch_with_retry(
        endpoints,
        lambda address: get_worker_stub(address).Predict(
            ml_worker_pb2.PredictRequest(text=body.text), timeout=10
        ),
    )
    return {
        "topicId": resp.topic_id, "topicName": resp.topic_name,
        "confidence": resp.confidence, "latencyMs": resp.latency_ms,
    }


@app.post("/train")
def train(body: TrainBody, core_v1=Depends(get_core_v1)):
    endpoints = list_worker_endpoints(core_v1)
    if not endpoints:
        raise HTTPException(status_code=503, detail="No worker pods are currently Ready")
    resp = _dispatch_with_retry(
        endpoints,
        # 300s was not enough: a real training run at this project's actual
        # UI default (sampleSize=40000) exceeded it on a CPU-constrained
        # worker pod -- confirmed live during the k8s plan's final review
        # ("Deadline Exceeded" after exactly 300s while the worker was still
        # genuinely fitting the model, not hung). 900s gives real headroom;
        # keep in sync with backend/app/services/cassandra_grpc_service.py's
        # matching httpx timeout for this same call.
        lambda address: get_worker_stub(address).Train(
            ml_worker_pb2.TrainRequest(sample_size=body.sampleSize), timeout=900
        ),
    )
    if not resp.success:
        raise HTTPException(status_code=422, detail=resp.message)
    return {
        "success": resp.success, "message": resp.message, "numClasses": resp.num_classes,
        "trainRows": resp.train_rows, "testRows": resp.test_rows, "accuracy": resp.accuracy,
        "macroPrecision": resp.macro_precision, "macroRecall": resp.macro_recall, "macroF1": resp.macro_f1,
        "microPrecision": resp.micro_precision, "microRecall": resp.micro_recall, "microF1": resp.micro_f1,
        "trainingTimeSeconds": resp.training_time_seconds,
        "topClasses": [
            {"topicId": c.topic_id, "topicName": c.topic_name, "support": c.support}
            for c in resp.top_classes
        ],
        "confusionMatrix": [
            {"trueTopicId": e.true_topic_id, "predictedTopicId": e.predicted_topic_id, "count": e.count}
            for e in resp.confusion_matrix
        ],
    }


@app.get("/pool")
def pool_status(core_v1=Depends(get_core_v1)):
    endpoints = list_worker_endpoints(core_v1)
    pods = []
    for address in endpoints:
        try:
            stub = get_worker_stub(address)
            resp = stub.GetStatus(ml_worker_pb2.StatusRequest(), timeout=5)
            pods.append({
                "address": address, "modelLoaded": resp.model_loaded, "numClasses": resp.num_classes,
                "trainedAt": resp.trained_at or None, "cpuPercent": resp.cpu_percent,
                "memoryMb": resp.memory_mb, "uptimeSeconds": resp.uptime_seconds, "error": None,
            })
        except grpc.RpcError as exc:
            pods.append({
                "address": address, "modelLoaded": False, "numClasses": 0, "trainedAt": None,
                "cpuPercent": 0.0, "memoryMb": 0.0, "uptimeSeconds": 0.0, "error": _rpc_detail(exc),
            })
    return {"pods": pods, "replicas": len(pods)}


BENCHMARK_TEXT = "Подбери синонимы к слову веселый"


@app.post("/benchmark")
def benchmark(body: BenchmarkBody, core_v1=Depends(get_core_v1)):
    """Real concurrent gRPC stress test against the live worker pool -- a
    real Predict call per request, so the load is the actual ML workload
    (vectorizer + classifier forward pass) each pod would serve in
    production, not just a cheap health check. Every request is a real RPC
    to a real pod; nothing here is simulated. A pod with no trained model
    genuinely fails with FAILED_PRECONDITION -- that shows up as a real
    error here rather than being hidden."""
    endpoints = list_worker_endpoints(core_v1)
    if not endpoints:
        raise HTTPException(status_code=503, detail="No worker pods are currently Ready")

    def one_call(_):
        address = _dispatcher.pick(endpoints)
        start = time.perf_counter()
        try:
            get_worker_stub(address).Predict(ml_worker_pb2.PredictRequest(text=BENCHMARK_TEXT), timeout=10)
            return time.perf_counter() - start, address, None
        except grpc.RpcError as exc:
            return time.perf_counter() - start, address, _rpc_detail(exc)

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=body.concurrency) as pool:
        results = list(pool.map(one_call, range(body.requests)))
    total_seconds = time.perf_counter() - started

    latencies_ms = sorted(elapsed * 1000 for elapsed, _address, _error in results)
    errors = [r for r in results if r[2] is not None]
    per_pod_counts: dict[str, int] = {}
    for _elapsed, address, _error in results:
        per_pod_counts[address] = per_pod_counts.get(address, 0) + 1

    def percentile(p: float) -> float:
        idx = min(len(latencies_ms) - 1, int(len(latencies_ms) * p))
        return round(latencies_ms[idx], 2)

    return {
        "rpc": "Predict",
        "requests": body.requests,
        "concurrency": body.concurrency,
        "readyPods": len(endpoints),
        "totalTimeSeconds": round(total_seconds, 3),
        "throughputRps": round(body.requests / total_seconds, 1) if total_seconds > 0 else 0.0,
        "latencyMsMin": round(latencies_ms[0], 2) if latencies_ms else 0.0,
        "latencyMsMean": round(statistics.mean(latencies_ms), 2) if latencies_ms else 0.0,
        "latencyMsP50": percentile(0.50),
        "latencyMsP95": percentile(0.95),
        "latencyMsP99": percentile(0.99),
        "latencyMsMax": round(latencies_ms[-1], 2) if latencies_ms else 0.0,
        "errorCount": len(errors),
        "perPodRequestCounts": per_pod_counts,
    }


@app.post("/pool/kill-one")
def kill_one(core_v1=Depends(get_core_v1)):
    """Real failure injection: deletes one live worker pod. The next
    /pool or /predict call re-discovers Ready pods from the k8s API, so a
    killed pod simply stops appearing -- no special-case code needed for
    the Coordinator to stop routing to it. Kubernetes' own Deployment
    controller replaces the pod on its own; polling /pool afterward shows
    it recover."""
    killed = kill_one_worker_pod(core_v1)
    if killed is None:
        raise HTTPException(status_code=503, detail="No Ready worker pod to kill")
    return {"killedPod": killed}


@app.post("/pool/scale")
def scale_pool(body: ScaleBody, core_v1=Depends(get_core_v1), apps_v1=Depends(get_apps_v1)):
    if not (MIN_REPLICAS <= body.replicas <= MAX_REPLICAS):
        raise HTTPException(
            status_code=422, detail=f"replicas must be between {MIN_REPLICAS} and {MAX_REPLICAS}"
        )
    scale_worker_deployment(apps_v1, body.replicas)
    ready = list_worker_endpoints(core_v1)
    return {"requestedReplicas": body.replicas, "readyReplicas": len(ready)}
