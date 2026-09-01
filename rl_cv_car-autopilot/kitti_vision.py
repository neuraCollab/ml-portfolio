"""Reusable computer-vision functions extracted from anomaly_detection.py.

anomaly_detection.py is a notebook-style script: cell-by-cell exploration of
a raw KITTI drive sequence (camera images, Velodyne LiDAR, OXTS, tracklets),
ending in Gym env + SAC training. It is not structured for reuse -- data
loading, environment, training and rendering are all tangled together at
module level, and it assumes the full raw KITTI dataset sits on disk (this
repo does not bundle it; see README).

This module lifts the handful of pure, input->output functions out of that
script unchanged, so a caller (the FastAPI backend) can run the *real*
undistortion and LiDAR-projection math from the project on a sample image,
without needing the raw dataset or the Gym/SB3 training machinery.
"""
import numpy as np
import cv2


def undistort(img: np.ndarray, K: np.ndarray, D: np.ndarray) -> np.ndarray:
    """Same algorithm as `undistort_image()` in anomaly_detection.py, taking
    the camera matrix / distortion coefficients directly instead of reading
    them from a KITTI calib_cam_to_cam.txt file."""
    h, w = img.shape[:2]
    new_K = cv2.getOptimalNewCameraMatrix(K, D, (w, h), 1, (w, h))[0]
    return cv2.undistort(img, K, D, None, new_K)


def velo_to_cam(points_velo: np.ndarray, Tr: np.ndarray) -> np.ndarray:
    """Verbatim from anomaly_detection.py: LiDAR points -> camera coordinates."""
    points_homogeneous = np.hstack([points_velo, np.ones((points_velo.shape[0], 1))])
    points_cam = (Tr @ points_homogeneous.T).T
    return points_cam[:, :3]


def project_to_image(points_cam: np.ndarray, P_rect: np.ndarray) -> np.ndarray:
    """Verbatim from anomaly_detection.py: camera-frame 3D points -> 2D pixels."""
    points_homogeneous = np.hstack([points_cam, np.ones((points_cam.shape[0], 1))])
    points_2d_homogeneous = (P_rect @ points_homogeneous.T).T
    points_2d = points_2d_homogeneous[:, :2] / points_2d_homogeneous[:, 2, None]
    return points_2d


def camera_matrices(fx: float, fy: float, cx: float, cy: float,
                     k1: float, k2: float, p1: float, p2: float) -> tuple[np.ndarray, np.ndarray]:
    """Build the K / D matrices `undistort()` expects from the flat
    calibration fields the frontend's CameraCalibration type already uses."""
    K = np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]], dtype=np.float32)
    D = np.array([k1, k2, p1, p2, 0.0], dtype=np.float32)
    return K, D


def default_extrinsics() -> tuple[np.ndarray, np.ndarray]:
    """A plausible LiDAR->camera transform and rectified projection matrix in
    the same shape KITTI's calib_velo_to_cam.txt / calib_cam_to_cam.txt would
    produce (parse_calib_velo_to_cam / parse_calib_file in anomaly_detection.py).
    Used only because the raw KITTI calibration files are not bundled in this
    repo -- see README for how to plug in real ones.
    """
    R = np.array([
        [7.533745e-03, -9.999714e-01, -6.166020e-04],
        [1.480249e-02, 7.280733e-04, -9.998902e-01],
        [9.998621e-01, 7.523790e-03, 1.480755e-02],
    ], dtype=np.float32)
    T = np.array([[-4.069766e-03], [-7.631618e-02], [-2.717806e-01]], dtype=np.float32)
    Tr = np.vstack([np.hstack([R, T]), [0, 0, 0, 1]]).astype(np.float32)
    return Tr, R


def synthetic_point_cloud(num_points: int, seed: int | None = None) -> np.ndarray:
    """A synthetic stand-in for a Velodyne scan in the sensor's own frame
    (x forward, y left/right, z up -- the convention anomaly_detection.py's
    own `plot_bev()` uses), used only because raw LiDAR .bin files are not
    bundled in this repo. Roughly mimics a road scene: a spread of points
    ahead of the car at plausible KITTI ranges."""
    rng = np.random.default_rng(seed)
    x_forward = rng.uniform(5, 40, num_points)
    y_left_right = rng.uniform(-8, 8, num_points)
    z_height = rng.uniform(-2.0, 0.5, num_points)
    return np.stack([x_forward, y_left_right, z_height], axis=1).astype(np.float32)
