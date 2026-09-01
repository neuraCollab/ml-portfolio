import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from app.services.cassandra_grpc_ingestion import stratified_sample


def _synthetic_df(rows_per_class=100, n_classes=5):
    rows = []
    for cls in range(n_classes):
        for i in range(rows_per_class):
            rows.append({"cleaned_text": f"text {cls} {i}", "topic_id": cls, "topic_name": f"Topic {cls}"})
    return pd.DataFrame(rows)


def test_returns_all_rows_when_sample_size_exceeds_dataset():
    df = _synthetic_df(rows_per_class=10, n_classes=3)  # 30 rows total
    sampled = stratified_sample(df, sample_size=1000)
    assert len(sampled) == 30
    assert "split" in sampled.columns


def test_caps_at_sample_size_and_stays_proportional():
    df = _synthetic_df(rows_per_class=100, n_classes=5)  # 500 rows, balanced
    sampled = stratified_sample(df, sample_size=100, seed=42)
    assert len(sampled) <= 100
    counts = sampled["topic_id"].value_counts()
    # balanced input -> roughly balanced sample (each class within a few rows of the mean)
    assert counts.max() - counts.min() <= 5


def test_assigns_both_train_and_test_rows_per_class():
    df = _synthetic_df(rows_per_class=20, n_classes=2)
    sampled = stratified_sample(df, sample_size=40, seed=1)
    for cls in [0, 1]:
        class_rows = sampled[sampled["topic_id"] == cls]
        assert (class_rows["split"] == "train").sum() > 0
        assert (class_rows["split"] == "test").sum() > 0


def test_is_deterministic_given_same_seed():
    df = _synthetic_df(rows_per_class=50, n_classes=4)
    a = stratified_sample(df, sample_size=80, seed=7)
    b = stratified_sample(df, sample_size=80, seed=7)
    assert sorted(a["cleaned_text"].tolist()) == sorted(b["cleaned_text"].tolist())
