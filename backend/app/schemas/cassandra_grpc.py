from typing import Literal, Optional

from pydantic import BaseModel, Field


class CassandraGrpcStatus(BaseModel):
    cassandra: Literal["connected", "unreachable"]
    worker: Literal["connected", "unreachable"]
    modelLoaded: bool
    numClasses: int
    trainedAt: Optional[str] = None


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


class GrpcLogEntry(BaseModel):
    id: str
    timestamp: str
    method: Literal["Predict", "Train", "GetStatus"]
    status: Literal["OK", "UNAVAILABLE", "FAILED_PRECONDITION", "INTERNAL"]
    latencyMs: float
    detail: str
