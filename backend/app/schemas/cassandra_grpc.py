from typing import Literal, Optional

from pydantic import BaseModel, Field


class ServiceSelfStats(BaseModel):
    """Real self-reported process stats (psutil), not a Docker-API
    container-level reading -- see cassandra-grpc-ml/README.md."""

    cpuPercent: float
    memoryMb: float
    uptimeSeconds: float


class CassandraSystemInfo(BaseModel):
    """Real fields read from a live `SELECT * FROM system.local` query --
    Cassandra has no built-in queryable process-uptime metric, so this
    reports identity/version info instead of fabricating one."""

    releaseVersion: str
    clusterName: str
    hostId: str


class PodStatus(BaseModel):
    address: str
    modelLoaded: bool
    numClasses: int
    trainedAt: Optional[str] = None
    stats: Optional[ServiceSelfStats] = None
    error: Optional[str] = None


class CassandraGrpcStatus(BaseModel):
    cassandra: Literal["connected", "unreachable"]
    coordinator: Literal["connected", "unreachable"]
    modelLoaded: bool
    numClasses: int
    trainedAt: Optional[str] = None
    backendStats: Optional[ServiceSelfStats] = None
    pods: list[PodStatus] = []
    cassandraInfo: Optional[CassandraSystemInfo] = None


class PoolScaleRequest(BaseModel):
    replicas: int = Field(..., ge=1, le=5)


class PoolScaleResult(BaseModel):
    requestedReplicas: int
    readyReplicas: int


class KillOneResult(BaseModel):
    killedPod: str


class ClassDistributionEntry(BaseModel):
    topicId: int
    topicName: str
    count: int


class DatasetInfo(BaseModel):
    ingestedRows: int
    trainRows: int
    testRows: int
    numClasses: int
    sampleSize: int
    topicDistribution: list[ClassDistributionEntry]
    note: str


class TrainRequestBody(BaseModel):
    sampleSize: int = Field(40000, ge=100, le=373657)


class ClassSupport(BaseModel):
    topicId: int
    topicName: str
    support: int


class ConfusionMatrixEntry(BaseModel):
    trueTopicId: int
    predictedTopicId: int
    count: int


class TrainMetrics(BaseModel):
    numClasses: int
    trainRows: int
    testRows: int
    accuracy: float
    macroPrecision: float
    macroRecall: float
    macroF1: float
    microPrecision: float
    microRecall: float
    microF1: float
    trainingTimeSeconds: float
    topClasses: list[ClassSupport]
    confusionMatrix: list[ConfusionMatrixEntry]
    trainedAt: str


class TrainJobStatus(BaseModel):
    status: Literal["idle", "running", "completed", "failed"]
    startedAt: Optional[float] = None
    finishedAt: Optional[float] = None
    error: Optional[str] = None
    result: Optional[TrainMetrics] = None


class PredictRequestBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class PredictResult(BaseModel):
    topicId: int
    topicName: str
    confidence: float
    preprocessingTimeMs: float
    grpcRoundtripMs: float
    note: str


class BenchmarkRequestBody(BaseModel):
    requests: int = Field(200, ge=1, le=15000)
    concurrency: int = Field(20, ge=1, le=100)


class BenchmarkResult(BaseModel):
    rpc: Literal["Predict"]
    requests: int
    concurrency: int
    readyPods: int
    totalTimeSeconds: float
    throughputRps: float
    latencyMsMin: float
    latencyMsMean: float
    latencyMsP50: float
    latencyMsP95: float
    latencyMsP99: float
    latencyMsMax: float
    errorCount: int
    perPodRequestCounts: dict[str, int]


class GrpcLogEntry(BaseModel):
    id: str
    timestamp: str
    method: Literal["Predict", "Train", "GetStatus"]
    status: Literal["OK", "UNAVAILABLE", "FAILED_PRECONDITION", "INTERNAL"]
    latencyMs: float
    detail: str
