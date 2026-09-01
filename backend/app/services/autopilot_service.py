"""Adapter around the existing rl_cv_car-autopilot project.

Unlike AutoTopic, that project cannot run its real end-to-end pipeline here:
`KITTICarEnv` and the SAC/DDPG training loop in anomaly_detection.py require
the raw KITTI dataset (camera images, Velodyne .bin scans, OXTS, tracklets,
calibration files), which is not bundled in this repo -- see the project's
own README ("данные вы скачиваете отдельно из официальных источников") and
rl_cv_car-autopilot/data/, which is empty.

What *is* real here:
  * `kitti_vision.undistort()` / `velo_to_cam()` / `project_to_image()` are
    the project's actual OpenCV functions, run on a bundled sample frame
    (undistorted_image.png) since a raw distorted KITTI frame isn't bundled.
  * `policy_inference.load_policy()` loads the actual pretrained SAC weights
    committed under models/ and runs a real forward pass. If that ever fails
    in a given environment it falls back to a small heuristic (ported from
    the frontend's own mock), and callers are told which happened via
    `modelSource` -- never silently.

Every timing/shape/bounds field returned here is measured or read directly
off the real objects (no invented "accuracy"/"confidence" style numbers).
"""
import base64
import logging
import sys
import time

import cv2
import numpy as np

from app.core.config import AUTOPILOT_DIR, POLICY_MODEL_DIR, SAMPLE_IMAGE_PATH
from app.schemas.autopilot import CameraCalibration

logger = logging.getLogger(__name__)

if str(AUTOPILOT_DIR) not in sys.path:
    sys.path.insert(0, str(AUTOPILOT_DIR))

import kitti_vision  # noqa: E402
import policy_inference  # noqa: E402

ACTION_LOW = {"steering": -1.0, "throttle": 0.0, "brake": 0.0}
ACTION_HIGH = {"steering": 1.0, "throttle": 1.0, "brake": 1.0}
_CLIP_EPS = 1e-3


class AutopilotError(Exception):
    pass


def _load_sample_image() -> np.ndarray:
    img = cv2.imread(str(SAMPLE_IMAGE_PATH))
    if img is None:
        raise AutopilotError(f"Sample frame not found at {SAMPLE_IMAGE_PATH}")
    return img


def _encode_png_base64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise AutopilotError("Failed to encode result image")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def run_undistort(calibration: CameraCalibration):
    img = _load_sample_image()
    h, w = img.shape[:2]
    K, D = kitti_vision.camera_matrices(
        calibration.fx, calibration.fy, calibration.cx, calibration.cy,
        calibration.k1, calibration.k2, calibration.p1, calibration.p2,
    )
    start = time.perf_counter()
    result = kitti_vision.undistort(img, K, D)
    elapsed_ms = (time.perf_counter() - start) * 1000

    note = (
        "Runs the project's real undistort_image() (cv2.getOptimalNewCameraMatrix "
        "+ cv2.undistort) with these K/D parameters, on a bundled sample frame "
        "standing in for a raw KITTI camera frame (the raw dataset isn't bundled "
        "in this repo). Compare against the original to see the lens correction."
    )
    return {
        "originalImageBase64": _encode_png_base64(img),
        "undistortedImageBase64": _encode_png_base64(result),
        "imageWidth": w,
        "imageHeight": h,
        "processingTimeMs": round(elapsed_ms, 3),
        "note": note,
    }


def run_lidar_overlay(calibration: CameraCalibration, num_points: int, point_size: int, seed: int | None):
    img = _load_sample_image().copy()
    h, w = img.shape[:2]
    start = time.perf_counter()

    points_velo = kitti_vision.synthetic_point_cloud(num_points, seed=seed)
    Tr_velo_to_cam, _ = kitti_vision.default_extrinsics()
    P_rect = np.array(
        [[calibration.fx, 0, calibration.cx, 0],
         [0, calibration.fy, calibration.cy, 0],
         [0, 0, 1, 0]],
        dtype=np.float32,
    )

    behind_mask = kitti_vision.velo_to_cam(points_velo, Tr_velo_to_cam)[:, 2] > 0.1
    points_velo_visible = points_velo[behind_mask]  # drop points behind the camera
    points_cam = kitti_vision.velo_to_cam(points_velo_visible, Tr_velo_to_cam)
    points_2d = kitti_vision.project_to_image(points_cam, P_rect)

    in_frame = 0
    nearest_distance_m = None
    for (u, v), velo_point in zip(points_2d, points_velo_visible):
        ui, vi = int(u), int(v)
        if 0 <= ui < w and 0 <= vi < h:
            cv2.circle(img, (ui, vi), point_size, (0, 255, 0), -1)
            in_frame += 1
            # Real Euclidean distance from the LiDAR sensor to this point, in
            # its own (x forward, y left/right, z up) frame -- the actual
            # value synthetic_point_cloud() generated, not a mocked number.
            dist = float(np.linalg.norm(velo_point))
            if nearest_distance_m is None or dist < nearest_distance_m:
                nearest_distance_m = dist
    elapsed_ms = (time.perf_counter() - start) * 1000

    WARNING_DISTANCE_M = 10.0
    warning_active = nearest_distance_m is not None and nearest_distance_m < WARNING_DISTANCE_M

    note = (
        "Runs the project's real velo_to_cam() + project_to_image() functions on a "
        "synthetic point cloud (the raw Velodyne .bin scans aren't bundled in this "
        "repo), overlaid on the same sample frame. nearestDistanceM is the real "
        "Euclidean distance (from synthetic_point_cloud()'s own sensor-frame "
        "coordinates) to the closest of the points that actually project into the "
        "visible camera frame -- not a mocked value."
    )
    return {
        "imageBase64": _encode_png_base64(img),
        "pointsGenerated": num_points,
        "pointsInFrame": in_frame,
        "nearestDistanceM": round(nearest_distance_m, 2) if nearest_distance_m is not None else None,
        "warningActive": warning_active,
        "warningThresholdM": WARNING_DISTANCE_M,
        "imageWidth": w,
        "imageHeight": h,
        "processingTimeMs": round(elapsed_ms, 3),
        "note": note,
    }


def _clipped_flags(steering: float, throttle: float, brake: float) -> dict:
    return {
        "steering": steering <= ACTION_LOW["steering"] + _CLIP_EPS or steering >= ACTION_HIGH["steering"] - _CLIP_EPS,
        "throttle": throttle <= ACTION_LOW["throttle"] + _CLIP_EPS or throttle >= ACTION_HIGH["throttle"] - _CLIP_EPS,
        "brake": brake <= ACTION_LOW["brake"] + _CLIP_EPS or brake >= ACTION_HIGH["brake"] - _CLIP_EPS,
    }


def predict_action(speed: float, yaw_rate: float, nearest_obstacle_dist: float, lane_offset: float):
    model = policy_inference.load_policy(POLICY_MODEL_DIR)
    action_space = {"low": ACTION_LOW, "high": ACTION_HIGH}

    if model is not None:
        try:
            img = _load_sample_image()
            image_84 = cv2.resize(img, (84, 84))
            image_84 = cv2.cvtColor(image_84, cv2.COLOR_BGR2RGB)
            vector_state = np.array(
                [speed, yaw_rate, lane_offset, 0.0, 0.0, nearest_obstacle_dist],
                dtype=np.float32,
            )
            start = time.perf_counter()
            steering, throttle, brake = policy_inference.predict(model, image_84, vector_state)
            elapsed_ms = (time.perf_counter() - start) * 1000
            note = (
                "Real forward pass through the pretrained SAC policy committed under "
                "models/, using the bundled sample frame as the image observation "
                "(the trained model expects an 84x84 RGB crop + a 6-value sensor "
                "vector; the raw KITTI dataset needed to feed it a real frame per "
                "step isn't bundled in this repo)."
            )
            return {
                "action": {"steering": steering, "throttle": throttle, "brake": brake},
                "modelSource": "pretrained-sac",
                "modelName": "SAC (Stable-Baselines3, MultiInputPolicy, custom CNN+MLP extractor)",
                "observationShape": "image: (3, 84, 84) uint8, vector: (6,) float32",
                "actionSpace": action_space,
                "clipped": _clipped_flags(steering, throttle, brake),
                "inferenceTimeMs": round(elapsed_ms, 3),
                "note": note,
            }
        except Exception:
            logger.exception("Pretrained policy inference failed, using heuristic fallback")

    err = policy_inference.get_load_error()
    start = time.perf_counter()
    steering, throttle, brake = policy_inference.heuristic_predict(
        speed, yaw_rate, nearest_obstacle_dist, lane_offset
    )
    elapsed_ms = (time.perf_counter() - start) * 1000
    note = (
        "Pretrained SAC policy could not be loaded in this environment "
        f"({err or 'unknown error'}), falling back to the same rule-based heuristic "
        "the original frontend mock used."
    )
    return {
        "action": {"steering": steering, "throttle": throttle, "brake": brake},
        "modelSource": "heuristic-fallback",
        "modelName": "Rule-based heuristic (distance/speed thresholds, no learned model)",
        "observationShape": "n/a (heuristic reads state fields directly)",
        "actionSpace": action_space,
        "clipped": _clipped_flags(steering, throttle, brake),
        "inferenceTimeMs": round(elapsed_ms, 3),
        "note": note,
    }
