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


class SignalQualityMetrics(BaseModel):
    globalStd: float
    uniqueValueFraction: float
    clippedFraction: float
    noiseRatio: float
    baselineInstabilityRatio: float
    peakCount: int
    expectedMinPeaks: int


class SignalQuality(BaseModel):
    status: Literal["GOOD", "WARNING", "POOR"]
    issues: list[str]
    metrics: SignalQualityMetrics
    note: str


class EcgAnalysisResponse(BaseModel):
    leads: dict[str, list[float]]
    filteredLeads: dict[str, list[float]]
    processedLeads: dict[str, list[float]]
    samplingRateHz: int
    signalMetrics: SignalMetrics
    rPeaks: RPeakInfo
    signalQuality: SignalQuality
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


class RuntimeInfo(BaseModel):
    cpuPercent: float | None
    memoryUsedMb: float | None
    memoryTotalMb: float | None
    cpuTemperatureCelsius: float | None
    samplingRateHz: int
    lastInferenceTimeMs: float | None
    lastPreprocessingTimeMs: float | None
    platform: str
    note: str


class LatencyPercentiles(BaseModel):
    p50: float
    p95: float
    p99: float
    mean: float


class BenchmarkResponse(BaseModel):
    iterations: int
    preprocessing: LatencyPercentiles
    inference: LatencyPercentiles
    total: LatencyPercentiles
    platform: str
    note: str


class PerClassMetric(BaseModel):
    className: str
    label: str
    support: int
    truePositives: int
    falsePositives: int
    falseNegatives: int
    trueNegatives: int
    # None ("N/A") for classes with zero positive support in this evaluation
    # set -- sklearn's zero_division=0 would otherwise report a misleading
    # 0.0 that looks like a measured failure rather than "never evaluated".
    precision: float | None
    recall: float | None
    f1: float | None
    prAuc: float | None
    threshold: float


class ThresholdInfo(BaseModel):
    className: str
    label: str
    threshold: float
    isCalibrated: bool


class EcgEvaluationResponse(BaseModel):
    numSamples: int
    numClasses: int
    numEvaluatedClasses: int
    subsetAccuracy: float
    hammingAccuracy: float
    microPrecision: float
    microRecall: float
    microF1: float
    macroPrecision: float
    macroRecall: float
    macroF1: float
    prAucMicro: float | None
    prAucMacro: float | None
    perClass: list[PerClassMetric]
    thresholds: list[ThresholdInfo]
    thresholdCalibrationNote: str
    note: str
