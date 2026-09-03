# backend/tests/test_cassandra_grpc_service.py
#
# Covers the cassandra_grpc_service functions that talk to the Coordinator's
# HTTP API -- get_status(), predict(), _run_training(), and scale_pool() --
# by monkeypatching svc.httpx.get/post (same dependency-injection-style
# pattern used by the Coordinator's own tests,
# cassandra-grpc-ml/coordinator/tests/test_app.py). No live Cassandra or
# Coordinator is required: get_status()/predict()/_run_training() also touch
# a Cassandra session (system-info lookup, prediction/training-run logging,
# dataset ingestion), so those are stubbed out too -- either via a harmless
# MagicMock-backed _connect_cassandra() (get_status, predict: the Cassandra
# calls there are read/log side effects the mapping logic under test doesn't
# depend on) or by monkeypatching the specific service functions that would
# otherwise open a session (_run_training's ingest_if_needed()/
# _record_training_run(), which are exercised by their own tests elsewhere
# and aren't part of this task's new Coordinator-HTTP logic).
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import pytest

from app.services import cassandra_grpc_service as svc


def _fake_response(status_code, json_body, text=""):
    return SimpleNamespace(status_code=status_code, json=lambda: json_body, text=text)


def _fake_get_response(status_code, json_body):
    def raise_for_status():
        if status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)

    return SimpleNamespace(status_code=status_code, json=lambda: json_body, raise_for_status=raise_for_status)


def _fake_cassandra(monkeypatch):
    """Makes _connect_cassandra() return a harmless MagicMock cluster/session
    instead of dialing a real Cassandra host. Callers of session.execute(...)
    get a MagicMock back (truthy, arbitrary attributes) -- fine for the
    functions under test here, which either discard the result
    (_log_prediction, _record_training_run's INSERT) or already tolerate a
    malformed row by returning None (_cassandra_system_info's try/except)."""
    fake_cluster, fake_session = MagicMock(), MagicMock()
    monkeypatch.setattr(svc, "_connect_cassandra", lambda: (fake_cluster, fake_session))
    return fake_cluster, fake_session


@pytest.fixture(autouse=True)
def _reset_train_state():
    original = dict(svc._train_state)
    yield
    svc._train_state.clear()
    svc._train_state.update(original)


def test_scale_pool_returns_result_on_success(monkeypatch):
    captured = {}

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        return _fake_response(200, {"requestedReplicas": 3, "readyReplicas": 2})

    monkeypatch.setattr(svc.httpx, "post", fake_post)
    result = svc.scale_pool(3)

    assert result.requestedReplicas == 3
    assert result.readyReplicas == 2
    assert captured["url"] == f"{svc.CASSANDRA_GRPC_COORDINATOR_URL}/pool/scale"
    assert captured["json"] == {"replicas": 3}


def test_scale_pool_raises_when_coordinator_unreachable(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(svc.httpx, "post", fake_post)

    with pytest.raises(svc.CassandraGrpcError, match="Coordinator unreachable"):
        svc.scale_pool(3)


def test_scale_pool_raises_with_detail_on_non_200(monkeypatch):
    def fake_post(url, json, timeout):
        return _fake_response(422, {"detail": "replicas must be between 1 and 5"})

    monkeypatch.setattr(svc.httpx, "post", fake_post)

    with pytest.raises(svc.CassandraGrpcError, match="replicas must be between 1 and 5"):
        svc.scale_pool(9)


def test_kill_one_worker_returns_result_on_success(monkeypatch):
    captured = {}

    def fake_post(url, timeout):
        captured["url"] = url
        captured["timeout"] = timeout
        return _fake_response(200, {"killedPod": "cassandra-grpc-ml-worker-abc123"})

    monkeypatch.setattr(svc.httpx, "post", fake_post)
    result = svc.kill_one_worker()

    assert result.killedPod == "cassandra-grpc-ml-worker-abc123"
    assert captured["url"] == f"{svc.CASSANDRA_GRPC_COORDINATOR_URL}/pool/kill-one"


def test_kill_one_worker_raises_when_coordinator_unreachable(monkeypatch):
    def fake_post(url, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(svc.httpx, "post", fake_post)

    with pytest.raises(svc.CassandraGrpcError, match="Coordinator unreachable"):
        svc.kill_one_worker()


def test_kill_one_worker_raises_with_detail_on_non_200(monkeypatch):
    def fake_post(url, timeout):
        return _fake_response(503, {"detail": "No Ready worker pod to kill"})

    monkeypatch.setattr(svc.httpx, "post", fake_post)

    with pytest.raises(svc.CassandraGrpcError, match="No Ready worker pod to kill"):
        svc.kill_one_worker()


# ---------------------------------------------------------------------------
# get_status() -- maps GET {COORDINATOR_URL}/pool into pods/coordinator/
# modelLoaded/numClasses/trainedAt (the healthy_pods/latest_pod derivation).
# ---------------------------------------------------------------------------
_POOL_BODY = {
    "pods": [
        {
            "address": "10.0.0.1:50061", "modelLoaded": True, "numClasses": 10,
            "trainedAt": "2026-09-01T00:00:00+00:00",
            "cpuPercent": 5.0, "memoryMb": 100.0, "uptimeSeconds": 50.0, "error": None,
        },
        {
            # Newer trainedAt than pod 1 -> should be the one get_status()
            # reports numClasses/trainedAt from.
            "address": "10.0.0.2:50061", "modelLoaded": True, "numClasses": 12,
            "trainedAt": "2026-09-02T00:00:00+00:00",
            "cpuPercent": 6.0, "memoryMb": 110.0, "uptimeSeconds": 60.0, "error": None,
        },
        {
            # Errored pod -- excluded from healthy_pods/latest_pod, stats
            # must be None, error must be carried through.
            "address": "10.0.0.3:50061", "modelLoaded": False, "numClasses": 0,
            "trainedAt": None, "cpuPercent": 0.0, "memoryMb": 0.0, "uptimeSeconds": 0.0,
            "error": "connection refused",
        },
    ],
    "replicas": 3,
}


def test_get_status_maps_pods_and_picks_latest_trained_healthy_pod(monkeypatch):
    _fake_cassandra(monkeypatch)

    def fake_get(url, timeout):
        assert url == f"{svc.CASSANDRA_GRPC_COORDINATOR_URL}/pool"
        return _fake_get_response(200, _POOL_BODY)

    monkeypatch.setattr(svc.httpx, "get", fake_get)
    status = svc.get_status()

    assert status.coordinator == "connected"
    assert status.cassandra == "connected"
    assert len(status.pods) == 3
    assert status.pods[0].address == "10.0.0.1:50061"
    assert status.pods[0].stats.cpuPercent == 5.0
    assert status.pods[2].error == "connection refused"
    assert status.pods[2].stats is None
    # modelLoaded: True if ANY healthy pod has it loaded.
    assert status.modelLoaded is True
    # numClasses/trainedAt come from the healthy pod with the latest trainedAt (pod 2, not pod 1 or the errored pod 3).
    assert status.numClasses == 12
    assert status.trainedAt == "2026-09-02T00:00:00+00:00"


def test_get_status_reports_coordinator_unreachable_when_pool_call_fails(monkeypatch):
    _fake_cassandra(monkeypatch)

    def fake_get(url, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(svc.httpx, "get", fake_get)
    status = svc.get_status()

    assert status.coordinator == "unreachable"
    assert status.pods == []
    assert status.modelLoaded is False
    assert status.numClasses == 0
    assert status.trainedAt is None


# ---------------------------------------------------------------------------
# predict() -- maps POST {COORDINATOR_URL}/predict into PredictResult, and
# maps a non-200 response's `detail` into a CassandraGrpcError.
# ---------------------------------------------------------------------------
def test_predict_returns_mapped_result_and_logs_it_on_success(monkeypatch):
    fake_cluster, fake_session = _fake_cassandra(monkeypatch)

    def fake_post(url, json, timeout):
        assert url == f"{svc.CASSANDRA_GRPC_COORDINATOR_URL}/predict"
        assert json == {"text": "hello world"}
        return _fake_response(200, {"topicId": 5, "topicName": "Sports", "confidence": 0.87})

    monkeypatch.setattr(svc.httpx, "post", fake_post)
    result = svc.predict("  hello world  ")

    assert result.topicId == 5
    assert result.topicName == "Sports"
    assert result.confidence == 0.87
    assert result.note == (
        "Served by a real worker pod (via the Coordinator's real k8s-backed routing) over a real gRPC call."
    )
    # _log_prediction() should have written the mapped fields to Cassandra.
    fake_session.execute.assert_called_once()
    params = fake_session.execute.call_args[0][1]
    assert params[0] == "hello world"
    assert params[1:4] == (5, "Sports", 0.87)


def test_predict_raises_with_coordinator_detail_on_non_200(monkeypatch):
    def fake_post(url, json, timeout):
        return _fake_response(422, {"detail": "No trained model available yet"})

    monkeypatch.setattr(svc.httpx, "post", fake_post)

    with pytest.raises(svc.CassandraGrpcError, match="No trained model available yet"):
        svc.predict("hello")


def test_predict_raises_when_coordinator_unreachable(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(svc.httpx, "post", fake_post)

    with pytest.raises(svc.CassandraGrpcError, match="Coordinator unreachable"):
        svc.predict("hello")


# ---------------------------------------------------------------------------
# _run_training() -- maps POST {COORDINATOR_URL}/train into TrainMetrics and
# updates _train_state; ingest_if_needed()/_record_training_run() (both
# Cassandra-backed, both exercised by other tests already) are stubbed out
# so only the new Coordinator-HTTP mapping logic is under test here.
# ---------------------------------------------------------------------------
_TRAIN_BODY = {
    "numClasses": 3, "trainRows": 800, "testRows": 200, "accuracy": 0.91,
    "macroPrecision": 0.9, "macroRecall": 0.88, "macroF1": 0.89,
    "microPrecision": 0.91, "microRecall": 0.91, "microF1": 0.91,
    "trainingTimeSeconds": 42.5,
    "topClasses": [{"topicId": 1, "topicName": "Sports", "support": 300}],
    "confusionMatrix": [{"trueTopicId": 1, "predictedTopicId": 1, "count": 280}],
}


def test_run_training_completes_and_records_metrics_on_success(monkeypatch):
    monkeypatch.setattr(svc, "ingest_if_needed", lambda: None)
    recorded = {}
    monkeypatch.setattr(
        svc, "_record_training_run", lambda sample_size, metrics: recorded.update(sample_size=sample_size, metrics=metrics)
    )

    def fake_post(url, json, timeout):
        assert url == f"{svc.CASSANDRA_GRPC_COORDINATOR_URL}/train"
        assert json == {"sampleSize": 1000}
        return _fake_response(200, _TRAIN_BODY)

    monkeypatch.setattr(svc.httpx, "post", fake_post)
    svc._run_training(1000)

    assert svc._train_state["status"] == "completed"
    assert svc._train_state["error"] is None
    result = svc._train_state["result"]
    assert result.numClasses == 3
    assert result.accuracy == 0.91
    assert result.topClasses[0].topicName == "Sports"
    assert result.confusionMatrix[0].count == 280
    assert recorded["sample_size"] == 1000
    assert recorded["metrics"] is result


def test_run_training_marks_failed_with_coordinator_detail_on_non_200(monkeypatch):
    monkeypatch.setattr(svc, "ingest_if_needed", lambda: None)

    def fake_post(url, json, timeout):
        return _fake_response(422, {"detail": "not enough rows"})

    monkeypatch.setattr(svc.httpx, "post", fake_post)
    svc._run_training(5)

    assert svc._train_state["status"] == "failed"
    assert svc._train_state["error"] == "not enough rows"
    assert svc._train_state["result"] is None


def test_run_training_marks_failed_when_coordinator_unreachable(monkeypatch):
    monkeypatch.setattr(svc, "ingest_if_needed", lambda: None)

    def fake_post(url, json, timeout):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(svc.httpx, "post", fake_post)
    svc._run_training(5)

    assert svc._train_state["status"] == "failed"
    assert "Coordinator unreachable" in svc._train_state["error"]
