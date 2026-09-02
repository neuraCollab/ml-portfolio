import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from app.schemas.ecg import (
    DemoRequest,
    HealthResponse,
    PerClassMetric,
    RPeakInfo,
    SignalMetrics,
    SignalQuality,
    SignalQualityMetrics,
    ThresholdInfo,
)


def test_demo_request_defaults_to_sample_source_and_72bpm():
    req = DemoRequest()
    assert req.source == "sample"
    assert req.heartRate == 72.0
    assert req.seed is None


def test_demo_request_rejects_heart_rate_out_of_range():
    with pytest.raises(ValidationError):
        DemoRequest(heartRate=5.0)
    with pytest.raises(ValidationError):
        DemoRequest(heartRate=500.0)


def test_demo_request_rejects_unknown_source():
    with pytest.raises(ValidationError):
        DemoRequest(source="hardware")


def test_health_response_round_trips_through_json():
    health = HealthResponse(status="ok", modelLoaded=True, modelLoadError=None)
    restored = HealthResponse.model_validate_json(health.model_dump_json())
    assert restored == health


def test_health_response_degraded_carries_load_error():
    health = HealthResponse(status="degraded", modelLoaded=False, modelLoadError="FileNotFoundError: ...")
    assert health.modelLoadError is not None


def test_r_peak_info_allows_null_heart_rate():
    info = RPeakInfo(peakCount=0, peakIndices=[], heartRateBpm=None, note="too few peaks")
    restored = RPeakInfo.model_validate_json(info.model_dump_json())
    assert restored.heartRateBpm is None


def test_per_class_metric_round_trips_real_reference_numbers():
    # Real numbers from running the bundled model against the bundled 61-record
    # PTB-XL evaluation set (matches raspberry-pi-ecg/data/README.md's documented
    # is_sinus_rhythm result: P=0.64/R=0.93/F1=0.76, to 2 decimal places).
    metric = PerClassMetric(
        className="is_sinus_rhythm", label="Sinus rhythm", support=40,
        truePositives=37, falsePositives=21, falseNegatives=3, trueNegatives=0,
        precision=0.6379, recall=0.925, f1=0.7551, prAuc=0.6095, threshold=0.0,
    )
    restored = PerClassMetric.model_validate_json(metric.model_dump_json())
    assert restored == metric


def test_per_class_metric_allows_null_metrics_for_unevaluated_classes():
    # A class with zero positive support in an evaluation set must report
    # precision/recall/F1/prAuc as null ("N/A"), not a misleading 0.0 that
    # looks like a measured failure -- see ecg_service._evaluate.
    metric = PerClassMetric(
        className="has_wpw", label="Wolff-Parkinson-White pattern", support=0,
        truePositives=0, falsePositives=0, falseNegatives=0, trueNegatives=61,
        precision=None, recall=None, f1=None, prAuc=None, threshold=0.5,
    )
    restored = PerClassMetric.model_validate_json(metric.model_dump_json())
    assert restored.precision is None
    assert restored.recall is None
    assert restored.f1 is None
    assert restored.prAuc is None


def test_threshold_info_round_trips():
    info = ThresholdInfo(className="is_afib", label="Atrial fibrillation", threshold=0.0, isCalibrated=True)
    restored = ThresholdInfo.model_validate_json(info.model_dump_json())
    assert restored == info


def test_signal_quality_round_trips_and_allows_no_issues():
    quality = SignalQuality(
        status="GOOD",
        issues=[],
        metrics=SignalQualityMetrics(
            globalStd=0.14, uniqueValueFraction=0.11, clippedFraction=0.0,
            noiseRatio=1.1, baselineInstabilityRatio=0.15, peakCount=13, expectedMinPeaks=6,
        ),
        note="Deterministic, rule-based heuristics -- not a medical diagnosis and not a second ML model.",
    )
    restored = SignalQuality.model_validate_json(quality.model_dump_json())
    assert restored == quality
    assert restored.issues == []


def test_signal_quality_rejects_unknown_status():
    with pytest.raises(ValidationError):
        SignalQuality(
            status="BAD",  # not one of GOOD/WARNING/POOR
            issues=[],
            metrics=SignalQualityMetrics(
                globalStd=0.0, uniqueValueFraction=0.0, clippedFraction=0.0,
                noiseRatio=0.0, baselineInstabilityRatio=0.0, peakCount=0, expectedMinPeaks=2,
            ),
            note="x",
        )


def test_signal_metrics_requires_all_fields():
    with pytest.raises(ValidationError):
        SignalMetrics(numSamples=1000, samplingRateHz=100)  # missing amplitude fields
