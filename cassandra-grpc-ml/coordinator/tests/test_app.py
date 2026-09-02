# cassandra-grpc-ml/coordinator/tests/test_app.py
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import grpc
import pytest
from fastapi.testclient import TestClient

import ml_worker_pb2
from app import app, get_apps_v1, get_core_v1


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.clear()


def _fake_core_v1_with_pods(bare_ips):
    subset = SimpleNamespace(
        addresses=[SimpleNamespace(ip=ip) for ip in bare_ips],
        not_ready_addresses=[],
    )
    core_v1 = MagicMock()
    core_v1.read_namespaced_endpoints.return_value = SimpleNamespace(subsets=[subset])
    return core_v1


def test_pool_status_returns_empty_list_when_no_pods_ready():
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods([])
    client = TestClient(app)
    resp = client.get("/pool")
    assert resp.status_code == 200
    assert resp.json() == {"pods": [], "replicas": 0}


def test_scale_pool_rejects_replicas_above_max():
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods(["10.0.0.1"])
    app.dependency_overrides[get_apps_v1] = lambda: MagicMock()
    client = TestClient(app)
    resp = client.post("/pool/scale", json={"replicas": 6})
    assert resp.status_code == 422


def test_scale_pool_rejects_replicas_below_min():
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods(["10.0.0.1"])
    app.dependency_overrides[get_apps_v1] = lambda: MagicMock()
    client = TestClient(app)
    resp = client.post("/pool/scale", json={"replicas": 0})
    assert resp.status_code == 422


def test_scale_pool_patches_deployment_and_reports_ready_count():
    fake_apps_v1 = MagicMock()
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods(["10.0.0.1", "10.0.0.2"])
    app.dependency_overrides[get_apps_v1] = lambda: fake_apps_v1
    client = TestClient(app)
    resp = client.post("/pool/scale", json={"replicas": 3})
    assert resp.status_code == 200
    assert resp.json() == {"requestedReplicas": 3, "readyReplicas": 2}
    fake_apps_v1.patch_namespaced_deployment_scale.assert_called_once_with(
        "cassandra-grpc-ml-worker", "default", body={"spec": {"replicas": 3}}
    )


def test_predict_returns_503_when_no_pods_ready():
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods([])
    client = TestClient(app)
    resp = client.post("/predict", json={"text": "hello"})
    assert resp.status_code == 503


def test_predict_retries_a_different_pod_on_rpc_error(monkeypatch):
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods(["10.0.0.1", "10.0.0.2"])
    call_log = []

    def fake_get_worker_stub(address):
        call_log.append(address)
        stub = MagicMock()
        if address == "10.0.0.1:50061":
            error = grpc.RpcError()
            error.details = lambda: "pod unreachable"
            stub.Predict.side_effect = error
        else:
            stub.Predict.return_value = ml_worker_pb2.PredictResponse(
                topic_id=5, topic_name="Test Topic", confidence=0.9, latency_ms=12.3,
            )
        return stub

    monkeypatch.setattr("app.get_worker_stub", fake_get_worker_stub)
    client = TestClient(app)
    resp = client.post("/predict", json={"text": "hello"})
    assert resp.status_code == 200
    assert resp.json() == {"topicId": 5, "topicName": "Test Topic", "confidence": 0.9, "latencyMs": 12.3}
    assert call_log == ["10.0.0.1:50061", "10.0.0.2:50061"]


def test_pool_status_reports_per_pod_error_without_failing_the_whole_call(monkeypatch):
    app.dependency_overrides[get_core_v1] = lambda: _fake_core_v1_with_pods(["10.0.0.1"])

    def fake_get_worker_stub(address):
        stub = MagicMock()
        error = grpc.RpcError()
        error.details = lambda: "unreachable"
        stub.GetStatus.side_effect = error
        return stub

    monkeypatch.setattr("app.get_worker_stub", fake_get_worker_stub)
    client = TestClient(app)
    resp = client.get("/pool")
    assert resp.status_code == 200
    body = resp.json()
    assert body["replicas"] == 1
    assert body["pods"][0]["error"] == "unreachable"
    assert body["pods"][0]["modelLoaded"] is False
