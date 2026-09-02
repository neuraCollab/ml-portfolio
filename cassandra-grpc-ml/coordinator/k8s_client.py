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
