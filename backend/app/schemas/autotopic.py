from typing import Literal, Optional

from pydantic import BaseModel, Field


class AutoTopicConfig(BaseModel):
    """Mirrors src/types.ts AutoTopicConfig on the frontend."""

    removeHtml: bool = True
    removeEmojis: bool = True
    removeCode: bool = True
    removeLlmPrefix: bool = True
    minLen: int = Field(5, ge=1, le=100)
    maxLen: int = Field(200, ge=10, le=2000)
    minTopicSize: int = Field(3, ge=2, le=200)
    nrTopics: int = Field(5, ge=2, le=200)
    umapNeighbors: int = Field(15, ge=2, le=100)
    umapMinDist: float = Field(0.1, ge=0.0, le=0.99)
    vectorizerMinDf: int = Field(1, ge=1, le=100)
    vectorizerMaxDf: float = Field(0.9, ge=0.1, le=1.0)
    nGramRange: tuple[int, int] = (1, 2)
    topNWords: int = Field(8, ge=1, le=30)
    languageMode: Literal["ru", "en", "mixed"] = "mixed"


class AnalyzeTextsRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)
    config: AutoTopicConfig


class AnalyzeDatasetRequest(BaseModel):
    config: AutoTopicConfig
    sampleSize: int = Field(300, ge=10, le=1000)
    seed: int = 42


class DatasetInfo(BaseModel):
    configuredLocation: str
    resolvedPath: str
    isUrl: bool
    exists: bool
    totalRows: Optional[int] = None
    sampledRows: Optional[int] = None


class TopicKeyword(BaseModel):
    word: str
    weight: float


class TopicModel(BaseModel):
    id: int
    name: str
    count: int
    percentage: float
    keywords: list[TopicKeyword]
    color: str
    representativeDocs: list[str] = []


class LogDocument(BaseModel):
    id: str
    text: str
    cleanedText: str
    language: Literal["ru", "en"]
    topicId: int
    confidence: float


class OptunaTrial(BaseModel):
    trial: int
    minTopicSize: int
    nrTopics: int
    umapNeighbors: int
    coherenceUci: float
    diversity: float
    compositeScore: float
    nTopics: int
    status: Literal["COMPLETE", "PRUNED"]


class AutoTopicMetrics(BaseModel):
    documentsAnalyzed: int
    nTopics: int
    outlierCount: int
    outlierPercentage: float
    coherenceUci: float
    coherenceUmass: float
    diversity: float
    compositeScore: float


class AutoTopicResults(BaseModel):
    metrics: AutoTopicMetrics
    topics: list[TopicModel]
    documents: list[LogDocument]
    trials: list[OptunaTrial] = []
    note: Optional[str] = None
    datasetInfo: Optional[DatasetInfo] = None


class FullPipelineStartRequest(BaseModel):
    config: AutoTopicConfig


class FullPipelineStatus(BaseModel):
    """Single-slot background job status for the whole-dataset run (see
    autotopic_service.start_full_pipeline) -- only one such job can run at a
    time, polled via GET /api/autotopic/full-pipeline/status.
    """

    status: Literal["idle", "running", "completed", "failed"]
    stage: Optional[str] = None
    progressPercent: Optional[float] = None
    startedAt: Optional[float] = None
    finishedAt: Optional[float] = None
    elapsedSeconds: Optional[float] = None
    totalRows: Optional[int] = None
    survivingRows: Optional[int] = None
    error: Optional[str] = None
    result: Optional[AutoTopicResults] = None
