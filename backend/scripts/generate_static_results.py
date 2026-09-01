"""Generates the static "Results" section data shown at the bottom of the
Autopilot and ECG portfolio pages, from the REAL running backend -- every
number/image comes from one real API call, never hand-typed.

Usage (with the stack running via docker-compose, from the repo root):

    docker cp backend/scripts/generate_static_results.py portfolio-integration-backend-1:/tmp/generate_static_results.py
    docker exec portfolio-integration-backend-1 python /tmp/generate_static_results.py
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/autopilot/original.png     frontend/public/static-results/autopilot/original.png
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/autopilot/undistorted.png  frontend/public/static-results/autopilot/undistorted.png
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/autopilot/lidar_overlay.png frontend/public/static-results/autopilot/lidar_overlay.png
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/autopilot/results.json      frontend/src/data/staticResults/autopilotResults.json
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/ecg/results.json            frontend/src/data/staticResults/ecgResults.json
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/autotopic/full_pipeline_results.json frontend/src/data/staticResults/autotopicFullPipelineResults.json
    docker cp portfolio-integration-backend-1:/tmp/static_results_out/cassandra_grpc/results.json frontend/src/data/staticResults/cassandraGrpcResults.json

Re-run and re-copy whenever the underlying models/pipeline change and the
static portfolio numbers should be refreshed. The AutoTopic snapshot only
writes if a full-dataset run has already completed (see that section below).
"""
import base64
import json
import urllib.request
from pathlib import Path

BASE = "http://localhost:8000"
OUT = Path("/tmp/static_results_out")
(OUT / "autopilot").mkdir(parents=True, exist_ok=True)
(OUT / "ecg").mkdir(parents=True, exist_ok=True)


def post(path, body):
    req = urllib.request.Request(
        f"{BASE}{path}", data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Autopilot: real undistort + real LiDAR overlay (real synthetic point cloud,
# real velo_to_cam/project_to_image) + real pretrained-policy forward pass.
# ---------------------------------------------------------------------------
CALIBRATION = {"fx": 959.7, "fy": 956.9, "cx": 696.0, "cy": 224.2, "k1": -0.369, "k2": 0.196, "p1": 0.0001, "p2": 0.0002}

undistort = post("/api/autopilot/undistort", {"calibration": CALIBRATION})
lidar = post("/api/autopilot/lidar-overlay", {
    "calibration": CALIBRATION, "numPoints": 400, "pointSize": 2, "seed": 7,
})
policy = post("/api/autopilot/predict", {
    "state": {"speed": 15.0, "yawRate": 0.0, "nearestObstacleDist": 25.0, "laneOffset": 0.0}
})

(OUT / "autopilot" / "original.png").write_bytes(base64.b64decode(undistort["originalImageBase64"]))
(OUT / "autopilot" / "undistorted.png").write_bytes(base64.b64decode(undistort["undistortedImageBase64"]))
(OUT / "autopilot" / "lidar_overlay.png").write_bytes(base64.b64decode(lidar["imageBase64"]))

autopilot_results = {
    "undistort": {
        "imageWidth": undistort["imageWidth"],
        "imageHeight": undistort["imageHeight"],
        "processingTimeMs": undistort["processingTimeMs"],
        "note": undistort["note"],
    },
    "lidar": {
        "pointsGenerated": lidar["pointsGenerated"],
        "pointsInFrame": lidar["pointsInFrame"],
        "nearestDistanceM": lidar["nearestDistanceM"],
        "warningActive": lidar["warningActive"],
        "warningThresholdM": lidar["warningThresholdM"],
        "processingTimeMs": lidar["processingTimeMs"],
        "seed": 7,
        "numPointsRequested": 400,
        "note": lidar["note"],
    },
    "policy": {
        "inputState": {"speed": 15.0, "yawRate": 0.0, "nearestObstacleDist": 25.0, "laneOffset": 0.0},
        "action": policy["action"],
        "modelSource": policy["modelSource"],
        "modelName": policy["modelName"],
        "observationShape": policy["observationShape"],
        "clipped": policy["clipped"],
        "inferenceTimeMs": policy["inferenceTimeMs"],
        "note": policy["note"],
    },
    "calibration": CALIBRATION,
}
(OUT / "autopilot" / "results.json").write_text(json.dumps(autopilot_results, ensure_ascii=False, indent=2))
print("Autopilot done:", json.dumps(autopilot_results, ensure_ascii=False)[:300])


# ---------------------------------------------------------------------------
# ECG: real public PTB-XL example (real ground truth + real prediction) and
# real evaluation on the bundled 61-record labeled dataset. Only the fields
# the static UI actually renders are kept -- e.g. processedLeads (what the
# model sees / what the static waveform chart shows), not the raw+filtered
# variants too, to avoid tripling the size of the bundled waveform data.
# ---------------------------------------------------------------------------
public_demo = post("/api/ecg/demo", {"source": "public", "heartRate": 72, "seed": None})
evaluation = post("/api/ecg/evaluate-bundled", {})

ecg_results = {
    "publicExample": {
        "source": public_demo["source"],
        "processedLeads": public_demo["processedLeads"],
        "samplingRateHz": public_demo["samplingRateHz"],
        "signalMetrics": public_demo["signalMetrics"],
        "rPeaks": {k: v for k, v in public_demo["rPeaks"].items() if k != "peakIndices"},
        "predictions": public_demo["predictions"],
        "topClass": public_demo["topClass"],
        "topLabel": public_demo["topLabel"],
        "topProbability": public_demo["topProbability"],
        "groundTruthLabels": public_demo["groundTruthLabels"],
        "groundTruthCorrect": public_demo["groundTruthCorrect"],
        "preprocessingTimeMs": public_demo["preprocessingTimeMs"],
        "inferenceTimeMs": public_demo["inferenceTimeMs"],
        "note": public_demo["note"],
    },
    "evaluation": {
        "numSamples": evaluation["numSamples"],
        "numClasses": evaluation["numClasses"],
        "subsetAccuracy": evaluation["subsetAccuracy"],
        "hammingAccuracy": evaluation["hammingAccuracy"],
        "microPrecision": evaluation["microPrecision"],
        "microRecall": evaluation["microRecall"],
        "microF1": evaluation["microF1"],
        "perClass": evaluation["perClass"],
        "note": evaluation["note"],
    },
}
(OUT / "ecg" / "results.json").write_text(json.dumps(ecg_results, ensure_ascii=False, indent=2))
print("ECG done. microF1:", evaluation["microF1"], "topClass:", public_demo["topClass"])


# ---------------------------------------------------------------------------
# AutoTopic: a snapshot of the real full-dataset background job (see
# POST /api/autotopic/full-pipeline/start), for a permanent "Results" section
# at the bottom of the AutoTopic page that doesn't depend on that job's
# in-memory state surviving a backend restart. This does NOT start the job --
# it only reads whatever the last completed run left behind, so run
# POST /api/autotopic/full-pipeline/start yourself first (it takes ~45-70
# minutes on the full ~370k-row dataset) if there's no completed run yet.
# ---------------------------------------------------------------------------
def get(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


(OUT / "autotopic").mkdir(parents=True, exist_ok=True)
full_pipeline_status = get("/api/autotopic/full-pipeline/status")
if full_pipeline_status["status"] == "completed" and full_pipeline_status.get("result"):
    (OUT / "autotopic" / "full_pipeline_results.json").write_text(
        json.dumps(full_pipeline_status["result"], ensure_ascii=False)
    )
    print(
        "AutoTopic full-pipeline snapshot done. documentsAnalyzed:",
        full_pipeline_status["result"]["metrics"]["documentsAnalyzed"],
        "nTopics:", full_pipeline_status["result"]["metrics"]["nTopics"],
    )
else:
    print(
        f"AutoTopic full-pipeline status is '{full_pipeline_status['status']}', not 'completed' -- "
        "skipping the snapshot. Run POST /api/autotopic/full-pipeline/start and wait for it to "
        "finish, then re-run this script."
    )


# ---------------------------------------------------------------------------
# Cassandra + gRPC ML: reads whatever the last completed training run left
# in the backend's in-memory job state (GET /api/cassandra-grpc/metrics),
# plus one real example prediction. Does NOT trigger training itself -- run
# POST /api/cassandra-grpc/train yourself first if metrics is null.
# ---------------------------------------------------------------------------
(OUT / "cassandra_grpc").mkdir(parents=True, exist_ok=True)
cg_metrics = get("/api/cassandra-grpc/metrics")

if cg_metrics:
    cg_dataset = get("/api/cassandra-grpc/dataset-info")
    example_text = "Подбери синонимы к слову веселый"
    example = post("/api/cassandra-grpc/predict", {"text": example_text})
    cassandra_grpc_results = {
        "available": True,
        "datasetSize": cg_dataset["ingestedRows"],
        "modelType": "TF-IDF + Logistic Regression (multinomial)",
        "trainingTimeSeconds": cg_metrics["trainingTimeSeconds"],
        "inferenceLatencyMs": example["grpcRoundtripMs"],
        "accuracy": cg_metrics["accuracy"],
        "macroPrecision": cg_metrics["macroPrecision"],
        "macroRecall": cg_metrics["macroRecall"],
        "macroF1": cg_metrics["macroF1"],
        "topClasses": cg_metrics["topClasses"],
        "confusionMatrix": cg_metrics["confusionMatrix"],
        "examplePrediction": {
            "inputText": example_text,
            "topicName": example["topicName"],
            "confidence": example["confidence"],
        },
        "note": (
            f"Real training run on {cg_dataset['ingestedRows']:,} ingested rows "
            f"({cg_metrics['numClasses']} classes), evaluated on a real held-out test split. "
            "Confusion matrix limited to the top classes by test support -- see cassandra-grpc-ml/README.md."
        ),
    }
    print("Cassandra+gRPC ML done. accuracy:", cg_metrics["accuracy"], "macroF1:", cg_metrics["macroF1"])
else:
    cassandra_grpc_results = {
        "available": False,
        "note": "No training run has completed yet -- run POST /api/cassandra-grpc/train and wait for it to finish, then re-run this script.",
    }
    print("Cassandra+gRPC ML metrics not available yet -- skipping the snapshot.")

(OUT / "cassandra_grpc" / "results.json").write_text(json.dumps(cassandra_grpc_results, ensure_ascii=False, indent=2))

print("\nAll static results written to", OUT)
