from typing import Literal

from pydantic import BaseModel, Field


class EcgClassPrediction(BaseModel):
    probability: float
    predicted: bool


class SignalMetrics(BaseModel):
    numSamples: int
    samplingRateHz: int
    durationSeconds: float
    minAmplitude: float
    maxAmplitude: float
    meanAmplitude: float
    stdAmplitude: float
    amplitudeRange: float


class RPeakInfo(BaseModel):
    peakCount: int
    peakIndices: list[int]
    heartRateBpm: float | None
    note: str


class EcgAnalysisResponse(BaseModel):
    leads: dict[str, list[float]]
    filteredLeads: dict[str, list[float]]
    processedLeads: dict[str, list[float]]
    samplingRateHz: int
    signalMetrics: SignalMetrics
    rPeaks: RPeakInfo
    predictions: dict[str, EcgClassPrediction]
    topClass: str
    topLabel: str
    topProbability: float
    preprocessingTimeMs: float
    inferenceTimeMs: float
    source: Literal["synthetic", "sample", "upload", "public"]
    groundTruthAvailable: bool
    groundTruthLabels: dict[str, bool] | None = None
    groundTruthCorrect: dict[str, bool] | None = None
    note: str


class DemoRequest(BaseModel):
    source: Literal["synthetic", "sample", "public"] = "sample"
    heartRate: float = Field(72.0, ge=30, le=220)
    seed: int | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    modelLoaded: bool
    modelLoadError: str | None = None


class PerClassMetric(BaseModel):
    className: str
    label: str
    support: int
    truePositives: int
    falsePositives: int
    falseNegatives: int
    trueNegatives: int
    precision: float
    recall: float
    f1: float


class EcgEvaluationResponse(BaseModel):
    numSamples: int
    numClasses: int
    subsetAccuracy: float
    hammingAccuracy: float
    microPrecision: float
    microRecall: float
    microF1: float
    perClass: list[PerClassMetric]
    note: str
