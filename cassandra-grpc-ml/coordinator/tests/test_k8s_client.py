import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from k8s_client import (
    WORKER_DEPLOYMENT_NAME, WORKER_GRPC_PORT, WORKER_NAMESPACE,
    list_worker_endpoints, scale_worker_deployment,
)


def _endpoints(ready_ips, not_ready_ips=None):
    subset = SimpleNamespace(
        addresses=[SimpleNamespace(ip=ip) for ip in ready_ips],
        not_ready_addresses=[SimpleNamespace(ip=ip) for ip in (not_ready_ips or [])],
    )
    return SimpleNamespace(subsets=[subset])


class FakeCoreV1:
    def __init__(self, endpoints):
        self._endpoints = endpoints

    def read_namespaced_endpoints(self, name, namespace):
        return self._endpoints


def test_list_worker_endpoints_returns_ready_pods_only():
    core_v1 = FakeCoreV1(_endpoints(ready_ips=["10.0.0.1", "10.0.0.2"], not_ready_ips=["10.0.0.3"]))
    result = list_worker_endpoints(core_v1)
    assert result == [f"10.0.0.1:{WORKER_GRPC_PORT}", f"10.0.0.2:{WORKER_GRPC_PORT}"]


def test_list_worker_endpoints_returns_empty_list_when_no_subsets():
    core_v1 = FakeCoreV1(SimpleNamespace(subsets=None))
    assert list_worker_endpoints(core_v1) == []


def test_list_worker_endpoints_returns_empty_list_on_api_error():
    class ErroringCoreV1:
        def read_namespaced_endpoints(self, name, namespace):
            raise RuntimeError("connection refused")

    assert list_worker_endpoints(ErroringCoreV1()) == []


class FakeAppsV1:
    def __init__(self):
        self.calls = []

    def patch_namespaced_deployment_scale(self, name, namespace, body):
        self.calls.append((name, namespace, body))


def test_scale_worker_deployment_patches_replica_count():
    apps_v1 = FakeAppsV1()
    scale_worker_deployment(apps_v1, 3)
    assert apps_v1.calls == [(WORKER_DEPLOYMENT_NAME, WORKER_NAMESPACE, {"spec": {"replicas": 3}})]
