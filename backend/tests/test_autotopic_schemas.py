import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from app.schemas.autotopic import (
    AnalyzeDatasetRequest, AutoTopicConfig, AutoTopicMetrics, AutoTopicResults,
    DatasetInfo, FullPipelineStatus, LogDocument,
)


def test_autotopic_config_defaults_match_documented_pipeline():
    config = AutoTopicConfig()
    assert config.languageMode == "mixed"
    assert config.nGramRange == (1, 2)
    assert config.removeHtml is True
    assert config.removeLlmPrefix is True


def test_autotopic_config_rejects_out_of_range_min_topic_size():
    with pytest.raises(ValidationError):
        AutoTopicConfig(minTopicSize=1)


def test_autotopic_config_rejects_invalid_language_mode():
    with pytest.raises(ValidationError):
        AutoTopicConfig(languageMode="fr")


def test_analyze_dataset_request_defaults_to_300_sample_rows():
    req = AnalyzeDatasetRequest(config=AutoTopicConfig())
    assert req.sampleSize == 300
    assert req.seed == 42


def test_analyze_dataset_request_rejects_sample_size_above_1000():
    with pytest.raises(ValidationError):
        AnalyzeDatasetRequest(config=AutoTopicConfig(), sampleSize=5000)


def test_dataset_info_round_trips_through_json():
    info = DatasetInfo(
        configuredLocation="data/raw/labeled_requests.parquet",
        resolvedPath="/app/AutoTopic/data/raw/labeled_requests.parquet",
        isUrl=False, exists=True, totalRows=373657, sampledRows=236495,
    )
    restored = DatasetInfo.model_validate_json(info.model_dump_json())
    assert restored == info


def test_autotopic_metrics_round_trips_real_full_pipeline_numbers():
    # Values match the checked-in static snapshot (frontend/public/static-results/
    # autotopic/full_pipeline_results.json) -- a real run, not invented.
    metrics = AutoTopicMetrics(
        documentsAnalyzed=236495, nTopics=59, outlierCount=188065, outlierPercentage=79.5,
        coherenceUci=-5.335, coherenceUmass=-11.468, diversity=0.966, compositeScore=-5.142,
    )
    restored = AutoTopicMetrics.model_validate_json(metrics.model_dump_json())
    assert restored == metrics


def test_autotopic_results_defaults_have_no_dataset_info():
    results = AutoTopicResults(
        metrics=AutoTopicMetrics(
            documentsAnalyzed=0, nTopics=0, outlierCount=0, outlierPercentage=0,
            coherenceUci=0, coherenceUmass=0, diversity=0, compositeScore=0,
        ),
        topics=[], documents=[],
    )
    assert results.datasetInfo is None
    assert results.trials == []


def test_full_pipeline_status_idle_has_no_result_or_error():
    status = FullPipelineStatus(status="idle")
    assert status.result is None
    assert status.error is None
    assert status.stage is None


def test_full_pipeline_status_rejects_unknown_status_value():
    with pytest.raises(ValidationError):
        FullPipelineStatus(status="paused")


def test_log_document_defaults_to_no_2d_projection():
    doc = LogDocument(id="doc_1", text="raw", cleanedText="clean", language="ru", topicId=-1, confidence=1.0)
    assert doc.x is None
    assert doc.y is None


def test_log_document_round_trips_2d_projection_coordinates():
    doc = LogDocument(
        id="doc_1", text="raw", cleanedText="clean", language="en", topicId=3, confidence=0.87,
        x=-4.213, y=8.907,
    )
    restored = LogDocument.model_validate_json(doc.model_dump_json())
    assert restored == doc
