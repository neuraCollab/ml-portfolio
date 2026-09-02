# backend/tests/test_cassandra_grpc_service.py
#
# Covers scale_pool() -- the one cassandra_grpc_service function that talks
# only to the Coordinator's HTTP API and touches no Cassandra session, so it
# can be exercised in isolation by monkeypatching httpx.post (same
# dependency-injection-style pattern used by the Coordinator's own tests,
# cassandra-grpc-ml/coordinator/tests/test_app.py). No live cluster required.
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
import pytest

from app.services import cassandra_grpc_service as svc


def _fake_response(status_code, json_body, text=""):
    return SimpleNamespace(status_code=status_code, json=lambda: json_body, text=text)


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
