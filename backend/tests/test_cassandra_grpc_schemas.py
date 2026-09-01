import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from app.schemas.cassandra_grpc import (
    ClassSupport, ConfusionMatrixEntry, DatasetInfo, PredictRequestBody,
    TrainJobStatus, TrainMetrics, TrainRequestBody,
)


def test_train_request_body_defaults_to_40000():
    body = TrainRequestBody()
    assert body.sampleSize == 40000


def test_train_request_body_rejects_too_small_sample():
    with pytest.raises(ValidationError):
        TrainRequestBody(sampleSize=10)


def test_predict_request_body_rejects_empty_text():
    with pytest.raises(ValidationError):
        PredictRequestBody(text="")


def test_dataset_info_round_trips_through_json():
    info = DatasetInfo(
        ingestedRows=40000, trainRows=36000, testRows=4000, numClasses=59,
        sampleSize=40000, topicDistribution=[], note="test",
    )
    restored = DatasetInfo.model_validate_json(info.model_dump_json())
    assert restored == info


def test_train_job_status_idle_has_no_result():
    status = TrainJobStatus(status="idle")
    assert status.result is None
    assert status.error is None


def test_train_metrics_with_confusion_matrix_round_trips():
    metrics = TrainMetrics(
        numClasses=59, trainRows=36000, testRows=4000, accuracy=0.72,
        macroPrecision=0.6, macroRecall=0.58, macroF1=0.59,
        microPrecision=0.72, microRecall=0.72, microF1=0.72,
        trainingTimeSeconds=12.5,
        topClasses=[ClassSupport(topicId=1, topicName="Test Topic", support=200)],
        confusionMatrix=[ConfusionMatrixEntry(trueTopicId=1, predictedTopicId=1, count=180)],
        trainedAt="2026-09-01T00:00:00+00:00",
    )
    restored = TrainMetrics.model_validate_json(metrics.model_dump_json())
    assert restored == metrics
