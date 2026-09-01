# cassandra-grpc-ml/worker/server.py
import logging
import os
import time
from concurrent import futures
from pathlib import Path

import grpc
from cassandra.cluster import Cluster

import ml_worker_pb2
import ml_worker_pb2_grpc
from ml_core import predict_one, train_and_evaluate
from model_store import load_model, save_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

CASSANDRA_HOST = os.environ.get("CASSANDRA_HOST", "cassandra")
GRPC_PORT = int(os.environ.get("GRPC_PORT", "50061"))
MODEL_STORE_DIR = Path(os.environ.get("MODEL_STORE_DIR", "/app/model_store"))
KEYSPACE = "cassandra_grpc_ml"


def _cassandra_session():
    cluster = Cluster([CASSANDRA_HOST])
    session = cluster.connect(KEYSPACE)
    return cluster, session


class MLWorkerServicer(ml_worker_pb2_grpc.MLWorkerServicer):
    def __init__(self):
        self._model = load_model(MODEL_STORE_DIR)
        if self._model:
            logger.info(f"Loaded persisted model trained at {self._model.trained_at} ({len(self._model.class_labels)} classes)")
        else:
            logger.info("No persisted model found -- waiting for a Train call.")

    def GetStatus(self, request, context):
        return ml_worker_pb2.StatusResponse(
            model_loaded=self._model is not None,
            num_classes=len(self._model.class_labels) if self._model else 0,
            trained_at=self._model.trained_at if self._model else "",
        )

    def Predict(self, request, context):
        if self._model is None:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details("No trained model available -- call Train first.")
            return ml_worker_pb2.PredictResponse()
        start = time.time()
        topic_id, topic_name, confidence = predict_one(self._model, request.text)
        latency_ms = (time.time() - start) * 1000
        return ml_worker_pb2.PredictResponse(
            topic_id=topic_id, topic_name=topic_name, confidence=confidence, latency_ms=latency_ms,
        )

    def Train(self, request, context):
        try:
            cluster, session = _cassandra_session()
        except Exception as exc:
            logger.exception("Could not connect to Cassandra for training")
            context.set_code(grpc.StatusCode.UNAVAILABLE)
            context.set_details(f"Could not connect to Cassandra: {exc}")
            return ml_worker_pb2.TrainResponse(success=False, message=str(exc))

        try:
            rows = list(session.execute("SELECT cleaned_text, topic_id, topic_name, split FROM requests"))
        finally:
            cluster.shutdown()

        if not rows:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details("No ingested rows found in Cassandra -- has the backend run ingestion yet?")
            return ml_worker_pb2.TrainResponse(success=False, message="No data ingested yet")

        train_texts, train_labels, test_texts, test_labels = [], [], [], []
        label_names: dict[int, str] = {}
        for row in rows:
            label_names[row.topic_id] = row.topic_name
            if row.split == "train":
                train_texts.append(row.cleaned_text)
                train_labels.append(row.topic_id)
            else:
                test_texts.append(row.cleaned_text)
                test_labels.append(row.topic_id)

        try:
            model, metrics = train_and_evaluate(train_texts, train_labels, test_texts, test_labels, label_names)
        except ValueError as exc:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details(str(exc))
            return ml_worker_pb2.TrainResponse(success=False, message=str(exc))

        save_model(model, MODEL_STORE_DIR)
        self._model = model
        logger.info(f"Trained on {metrics.train_rows} rows, evaluated on {metrics.test_rows} rows, accuracy={metrics.accuracy:.3f}")

        return ml_worker_pb2.TrainResponse(
            success=True,
            message=f"Trained on {metrics.train_rows} rows, evaluated on {metrics.test_rows} rows.",
            num_classes=metrics.num_classes,
            train_rows=metrics.train_rows,
            test_rows=metrics.test_rows,
            accuracy=metrics.accuracy,
            macro_precision=metrics.macro_precision,
            macro_recall=metrics.macro_recall,
            macro_f1=metrics.macro_f1,
            micro_precision=metrics.micro_precision,
            micro_recall=metrics.micro_recall,
            micro_f1=metrics.micro_f1,
            training_time_seconds=metrics.training_time_seconds,
            top_classes=[
                ml_worker_pb2.ClassSupport(topic_id=c["topicId"], topic_name=c["topicName"], support=c["support"])
                for c in metrics.top_classes
            ],
            confusion_matrix=[
                ml_worker_pb2.ConfusionMatrixEntry(
                    true_topic_id=e["trueTopicId"], predicted_topic_id=e["predictedTopicId"], count=e["count"]
                )
                for e in metrics.confusion_matrix
            ],
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    ml_worker_pb2_grpc.add_MLWorkerServicer_to_server(MLWorkerServicer(), server)
    server.add_insecure_port(f"[::]:{GRPC_PORT}")
    server.start()
    logger.info(f"MLWorker gRPC server listening on :{GRPC_PORT}")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
