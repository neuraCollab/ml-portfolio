# cassandra-grpc-ml/worker/server.py
import logging
import os
import random
import time
from concurrent import futures
from pathlib import Path

import grpc
import psutil
from cassandra.cluster import Cluster

import ml_worker_pb2
import ml_worker_pb2_grpc
from ml_core import predict_one, train_and_evaluate
from model_store import (
    load_model, load_latest_model_from_cassandra, save_model, save_model_to_cassandra,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

CASSANDRA_HOST = os.environ.get("CASSANDRA_HOST", "cassandra")
GRPC_PORT = int(os.environ.get("GRPC_PORT", "50061"))
MODEL_STORE_DIR = Path(os.environ.get("MODEL_STORE_DIR", "/app/model_store"))
KEYSPACE = "cassandra_grpc_ml"
MODEL_PERSISTENCE = os.environ.get("MODEL_PERSISTENCE", "local")  # "local" | "cassandra"
_MODEL_REFRESH_INTERVAL_SECONDS = 30


def _cassandra_session():
    cluster = Cluster([CASSANDRA_HOST])
    try:
        session = cluster.connect(KEYSPACE)
    except Exception:
        cluster.shutdown()
        raise
    return cluster, session


class MLWorkerServicer(ml_worker_pb2_grpc.MLWorkerServicer):
    def __init__(self):
        self._last_refresh_check = 0.0
        if MODEL_PERSISTENCE == "cassandra":
            self._model = self._load_from_cassandra()
        else:
            self._model = load_model(MODEL_STORE_DIR)
        if self._model:
            logger.info(f"Loaded persisted model trained at {self._model.trained_at} ({len(self._model.class_labels)} classes)")
        else:
            logger.info("No persisted model found -- waiting for a Train call.")
        self._process = psutil.Process()
        # First cpu_percent() call always returns 0.0 (no prior sample to
        # diff against) -- prime it once at startup so GetStatus's own call
        # returns a real, non-degenerate reading.
        self._process.cpu_percent(interval=None)

    def _load_from_cassandra(self):
        try:
            cluster, session = _cassandra_session()
            try:
                return load_latest_model_from_cassandra(session)
            finally:
                cluster.shutdown()
        except Exception:
            logger.exception("Could not load model from Cassandra")
            return None

    def _maybe_refresh_model(self):
        """Real, lazy re-check against Cassandra -- at most once per
        _MODEL_REFRESH_INTERVAL_SECONDS -- so a Train on a different pod
        eventually reaches this one too, without a background thread."""
        if MODEL_PERSISTENCE != "cassandra":
            return
        now = time.time()
        if now - self._last_refresh_check < _MODEL_REFRESH_INTERVAL_SECONDS:
            return
        self._last_refresh_check = now
        latest = self._load_from_cassandra()
        if latest is not None and (self._model is None or latest.trained_at > self._model.trained_at):
            logger.info(f"Refreshed model from Cassandra (trained_at={latest.trained_at})")
            self._model = latest

    def GetStatus(self, request, context):
        self._maybe_refresh_model()
        # interval=0.1 blocks briefly to measure real CPU usage over that
        # window -- acceptable here since GetStatus is a low-frequency
        # polling call (every 8s from the frontend), not on the hot path.
        cpu_percent = self._process.cpu_percent(interval=0.1)
        memory_mb = self._process.memory_info().rss / (1024 * 1024)
        uptime_seconds = time.time() - self._process.create_time()
        return ml_worker_pb2.StatusResponse(
            model_loaded=self._model is not None,
            num_classes=len(self._model.class_labels) if self._model else 0,
            trained_at=self._model.trained_at if self._model else "",
            cpu_percent=round(cpu_percent, 1),
            memory_mb=round(memory_mb, 1),
            uptime_seconds=round(uptime_seconds, 1),
        )

    def Predict(self, request, context):
        self._maybe_refresh_model()
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
        except Exception as exc:
            logger.exception("Could not read training data from Cassandra")
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details(f"Could not read training data from Cassandra (has ingestion run yet?): {exc}")
            return ml_worker_pb2.TrainResponse(success=False, message=str(exc))
        finally:
            cluster.shutdown()

        if not rows:
            context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
            context.set_details("No ingested rows found in Cassandra -- has the backend run ingestion yet?")
            return ml_worker_pb2.TrainResponse(success=False, message="No data ingested yet")

        if 0 < request.sample_size < len(rows):
            rows = random.Random(42).sample(rows, request.sample_size)

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

        persistence_error = None
        if MODEL_PERSISTENCE == "cassandra":
            try:
                save_cluster, save_session = _cassandra_session()
                try:
                    save_model_to_cassandra(model, save_session)
                finally:
                    save_cluster.shutdown()
            except Exception as exc:
                # Deliberately non-fatal: this pod already has a working
                # in-memory model (self._model is set below regardless), so
                # failing the whole RPC here would turn a real training
                # success into a reported failure. This is not purely a
                # hypothetical edge case: gzip compression (see
                # model_store.py::save_model_to_cassandra) is real and
                # helps, but does not guarantee staying under Cassandra's
                # 16MB native-protocol message-size limit at this project's
                # real default training size. A small sample (sampleSize
                # 2,000, ~1,825 rows) compresses to ~12.18MB and persists
                # fine, but the actual UI default (sampleSize 40,000)
                # compresses to ~18.9MB -- the compression ratio degrades on
                # a fuller, more realistic model (~1.86x on the small sample
                # vs. only ~1.18x at the real default) -- and that still
                # exceeds the limit. This is a real, currently-open
                # limitation, not something fixed by a config change: this
                # except block is the intentional, graceful handling of it.
                # Its message is surfaced in the response (in addition to
                # the log) so it isn't silently invisible to callers -- the
                # pod that trained keeps serving correctly from its own
                # in-memory copy, but other pods will NOT see this model
                # until a smaller sample size is used or this limitation is
                # otherwise addressed.
                logger.exception("Could not save model to Cassandra -- other worker pods will NOT see this model")
                persistence_error = str(exc)
        else:
            save_model(model, MODEL_STORE_DIR)
        self._model = model
        logger.info(f"Trained on {metrics.train_rows} rows, evaluated on {metrics.test_rows} rows, accuracy={metrics.accuracy:.3f}")

        message = f"Trained on {metrics.train_rows} rows, evaluated on {metrics.test_rows} rows."
        if persistence_error:
            message += (
                f" WARNING: trained model could NOT be persisted to Cassandra, so other "
                f"worker pods will not see it ({persistence_error})."
            )

        return ml_worker_pb2.TrainResponse(
            success=True,
            message=message,
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
