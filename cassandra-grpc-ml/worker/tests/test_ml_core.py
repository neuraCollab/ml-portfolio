import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml_core import train_and_evaluate, predict_one, TOP_N_CONFUSION_CLASSES


def _synthetic_dataset():
    # 4 classes, 20 rows each, distinct vocabulary per class so a linear
    # classifier can separate them perfectly -- this test checks metric
    # plumbing/shapes, not model quality.
    label_names = {0: "cats", 1: "dogs", 2: "cars", 3: "boats"}
    words = {0: "cat meow feline kitten", 1: "dog bark canine puppy",
             2: "car engine wheel drive", 3: "boat sail ocean anchor"}
    train_texts, train_labels, test_texts, test_labels = [], [], [], []
    for label, phrase in words.items():
        for i in range(16):
            train_texts.append(f"{phrase} sample {i}")
            train_labels.append(label)
        for i in range(4):
            test_texts.append(f"{phrase} sample {i}")
            test_labels.append(label)
    return train_texts, train_labels, test_texts, test_labels, label_names


def test_train_and_evaluate_returns_correct_shapes_and_high_accuracy():
    train_texts, train_labels, test_texts, test_labels, label_names = _synthetic_dataset()
    model, metrics = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)

    assert metrics.num_classes == 4
    assert metrics.train_rows == 64
    assert metrics.test_rows == 16
    assert metrics.accuracy > 0.9  # trivially separable synthetic data
    assert 0.0 <= metrics.macro_f1 <= 1.0
    assert 0.0 <= metrics.micro_f1 <= 1.0
    assert len(metrics.top_classes) == 4  # fewer classes than TOP_N_CONFUSION_CLASSES
    assert all(c["support"] == 4 for c in metrics.top_classes)
    assert metrics.training_time_seconds >= 0.0
    assert model.class_labels == label_names


def test_train_and_evaluate_caps_confusion_matrix_to_top_n_classes():
    # 20 classes, 1 test row each -- top_classes must be capped at TOP_N_CONFUSION_CLASSES.
    label_names = {i: f"class_{i}" for i in range(20)}
    train_texts, train_labels, test_texts, test_labels = [], [], [], []
    for i in range(20):
        for _ in range(3):
            train_texts.append(f"word{i} filler token")
            train_labels.append(i)
        test_texts.append(f"word{i} filler token")
        test_labels.append(i)

    _, metrics = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)
    assert len(metrics.top_classes) == TOP_N_CONFUSION_CLASSES
    assert metrics.num_classes == 20
    seen_pairs = {(e["trueTopicId"], e["predictedTopicId"]) for e in metrics.confusion_matrix}
    top_ids = {c["topicId"] for c in metrics.top_classes}
    assert all(true_id in top_ids and pred_id in top_ids for true_id, pred_id in seen_pairs)


def test_train_and_evaluate_rejects_empty_splits():
    import pytest
    with pytest.raises(ValueError):
        train_and_evaluate([], [], ["x"], [0], {0: "a"})


def test_predict_one_returns_a_known_label():
    train_texts, train_labels, test_texts, test_labels, label_names = _synthetic_dataset()
    model, _ = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)

    topic_id, topic_name, confidence = predict_one(model, "cat meow feline kitten sample 99")
    assert topic_id == 0
    assert topic_name == "cats"
    assert 0.0 <= confidence <= 1.0
