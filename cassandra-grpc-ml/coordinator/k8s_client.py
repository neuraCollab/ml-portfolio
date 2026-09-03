"""Thin wrappers around the kubernetes Python client for real pod discovery
and real Deployment scaling. Functions take the API client objects as
parameters (dependency injection) so they're testable with simple fakes --
no live cluster needed to run their tests."""
import logging

logger = logging.getLogger(__name__)

WORKER_NAMESPACE = "default"
WORKER_SERVICE_NAME = "cassandra-grpc-ml-worker"
WORKER_DEPLOYMENT_NAME = "cassandra-grpc-ml-worker"
WORKER_GRPC_PORT = 50061


def list_worker_endpoints(core_v1) -> list[str]:
    """Real 'ip:port' strings for every currently-Ready worker pod, read
    from the Endpoints object Kubernetes maintains for the worker Service.
    Pods that exist but aren't Ready yet (still starting) are excluded --
    they're in `not_ready_addresses`, not `addresses`."""
    try:
        endpoints = core_v1.read_namespaced_endpoints(WORKER_SERVICE_NAME, WORKER_NAMESPACE)
    except Exception:
        logger.exception("Could not read worker Endpoints from the k8s API")
        return []
    addresses: list[str] = []
    for subset in endpoints.subsets or []:
        for address in subset.addresses or []:
            addresses.append(f"{address.ip}:{WORKER_GRPC_PORT}")
    return addresses


def scale_worker_deployment(apps_v1, replicas: int) -> None:
    """Patches the real Deployment's replica count. Does not wait for pods
    to become Ready -- callers should re-list endpoints afterward if they
    need the current Ready count."""
    apps_v1.patch_namespaced_deployment_scale(
        WORKER_DEPLOYMENT_NAME,
        WORKER_NAMESPACE,
        body={"spec": {"replicas": replicas}},
    )


def kill_one_worker_pod(core_v1) -> str | None:
    """Real failure-injection: deletes one Ready worker pod outright (not a
    graceful scale-down) so callers can observe the Coordinator's existing
    pod-discovery + retry behavior handle a mid-flight failure. The
    Deployment controller notices the missing replica and starts a
    replacement on its own -- no extra code needed for that self-healing
    half, it's stock Kubernetes. Returns the killed pod's name, or None if
    no Ready worker pod was found."""
    pods = core_v1.list_namespaced_pod(WORKER_NAMESPACE, label_selector=f"app={WORKER_DEPLOYMENT_NAME}")
    for pod in pods.items:
        is_ready = any(c.type == "Ready" and c.status == "True" for c in (pod.status.conditions or []))
        if pod.status.phase == "Running" and is_ready:
            core_v1.delete_namespaced_pod(pod.metadata.name, WORKER_NAMESPACE)
            return pod.metadata.name
    return None
