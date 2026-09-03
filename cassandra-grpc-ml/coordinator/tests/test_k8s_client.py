import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from k8s_client import (
    WORKER_DEPLOYMENT_NAME, WORKER_GRPC_PORT, WORKER_NAMESPACE,
    kill_one_worker_pod, list_worker_endpoints, scale_worker_deployment,
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


def _pod(name, ready=True, phase="Running"):
    return SimpleNamespace(
        metadata=SimpleNamespace(name=name),
        status=SimpleNamespace(
            phase=phase,
            conditions=[SimpleNamespace(type="Ready", status="True" if ready else "False")],
        ),
    )


class FakeCoreV1WithPods:
    def __init__(self, pods):
        self._pods = pods
        self.deleted = []

    def list_namespaced_pod(self, namespace, label_selector):
        return SimpleNamespace(items=self._pods)

    def delete_namespaced_pod(self, name, namespace):
        self.deleted.append((name, namespace))


def test_kill_one_worker_pod_deletes_the_first_ready_pod():
    core_v1 = FakeCoreV1WithPods([_pod("worker-a", ready=False), _pod("worker-b", ready=True), _pod("worker-c", ready=True)])
    killed = kill_one_worker_pod(core_v1)
    assert killed == "worker-b"
    assert core_v1.deleted == [("worker-b", WORKER_NAMESPACE)]


def test_kill_one_worker_pod_returns_none_when_no_pod_is_ready():
    core_v1 = FakeCoreV1WithPods([_pod("worker-a", ready=False)])
    assert kill_one_worker_pod(core_v1) is None
    assert core_v1.deleted == []
