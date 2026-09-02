"""Pure ML logic for the Cassandra+gRPC topic classifier -- no Cassandra or
gRPC I/O here (see server.py for that), so this is unit-testable in
isolation. Distills AutoTopic's slow unsupervised BERTopic clustering into a
fast supervised classifier: TF-IDF + multinomial LogisticRegression trained
on real (text, topic_id) pairs from AutoTopic/data/raw/labeled_requests.parquet.
"""
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.multiclass import OneVsRestClassifier

# With 50 real topic classes, a full NxN confusion matrix is impractical to
# render -- restricting to the top-15 by test-set support matches the
# "notable classes" disclosure pattern already used in the ECG project's
# static results section (frontend/src/components/ecg/StaticResultsSection.tsx).
TOP_N_CONFUSION_CLASSES = 15


@dataclass
class TrainedModel:
    vectorizer: TfidfVectorizer
    classifier: LogisticRegression
    class_labels: dict[int, str]
    trained_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class TrainMetrics:
    num_classes: int
    train_rows: int
    test_rows: int
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    micro_precision: float
    micro_recall: float
    micro_f1: float
    training_time_seconds: float
    top_classes: list[dict]
    confusion_matrix: list[dict]


def train_and_evaluate(
    train_texts: list[str],
    train_labels: list[int],
    test_texts: list[str],
    test_labels: list[int],
    label_names: dict[int, str],
) -> tuple[TrainedModel, TrainMetrics]:
    if not train_texts or not test_texts:
        raise ValueError("train_texts and test_texts must both be non-empty")

    start = time.time()
    vectorizer = TfidfVectorizer(max_features=50000, ngram_range=(1, 2), min_df=1)
    X_train = vectorizer.fit_transform(train_texts)
    # n_jobs only parallelizes LogisticRegression across CPU cores when the
    # model is fit as One-vs-Rest: each class's binary sub-problem is then
    # independent and can run on its own core. A bare LogisticRegression
    # with solver='lbfgs' fits multinomial (softmax) loss for multi-class
    # instead -- one single joint optimization with nothing to parallelize,
    # so n_jobs is silently ignored there. Wrapping in OneVsRestClassifier
    # makes the parallelism real.
    classifier = OneVsRestClassifier(LogisticRegression(max_iter=200, solver='lbfgs'), n_jobs=-1)
    classifier.fit(X_train, train_labels)
    training_time = time.time() - start

    X_test = vectorizer.transform(test_texts)
    predictions = classifier.predict(X_test)

    accuracy = float(accuracy_score(test_labels, predictions))
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        test_labels, predictions, average="macro", zero_division=0
    )
    micro_p, micro_r, micro_f1, _ = precision_recall_fscore_support(
        test_labels, predictions, average="micro", zero_division=0
    )

    test_labels_arr = np.array(test_labels)
    unique, counts = np.unique(test_labels_arr, return_counts=True)
    support_by_label = dict(zip(unique.tolist(), counts.tolist()))
    top_label_ids = sorted(support_by_label, key=lambda l: support_by_label[l], reverse=True)[:TOP_N_CONFUSION_CLASSES]
    top_classes = [
        {"topicId": int(l), "topicName": label_names.get(int(l), str(l)), "support": int(support_by_label[l])}
        for l in top_label_ids
    ]

    mask = np.isin(test_labels_arr, top_label_ids)
    filtered_true = test_labels_arr[mask]
    filtered_pred = predictions[mask]
    cm = confusion_matrix(filtered_true, filtered_pred, labels=top_label_ids)
    confusion_entries = []
    for i, true_id in enumerate(top_label_ids):
        for j, pred_id in enumerate(top_label_ids):
            count = int(cm[i, j])
            if count > 0:
                confusion_entries.append({"trueTopicId": int(true_id), "predictedTopicId": int(pred_id), "count": count})

    metrics = TrainMetrics(
        num_classes=len(label_names),
        train_rows=len(train_texts),
        test_rows=len(test_texts),
        accuracy=accuracy,
        macro_precision=float(macro_p),
        macro_recall=float(macro_r),
        macro_f1=float(macro_f1),
        micro_precision=float(micro_p),
        micro_recall=float(micro_r),
        micro_f1=float(micro_f1),
        training_time_seconds=training_time,
        top_classes=top_classes,
        confusion_matrix=confusion_entries,
    )
    model = TrainedModel(vectorizer=vectorizer, classifier=classifier, class_labels=label_names)
    return model, metrics


def predict_one(model: TrainedModel, text: str) -> tuple[int, str, float]:
    X = model.vectorizer.transform([text])
    proba = model.classifier.predict_proba(X)[0]
    idx = int(np.argmax(proba))
    topic_id = int(model.classifier.classes_[idx])
    confidence = float(proba[idx])
    topic_name = model.class_labels.get(topic_id, str(topic_id))
    return topic_id, topic_name, confidence
