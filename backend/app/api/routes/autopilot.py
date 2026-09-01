import logging

from fastapi import APIRouter, HTTPException

from app.schemas.autopilot import (
    LidarOverlayRequest,
    LidarOverlayResponse,
    PredictActionRequest,
    PredictActionResponse,
    UndistortRequest,
    UndistortResponse,
)
from app.services import autopilot_service
from app.services.autopilot_service import AutopilotError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])


@router.post("/undistort", response_model=UndistortResponse)
def undistort(request: UndistortRequest):
    try:
        return UndistortResponse(**autopilot_service.run_undistort(request.calibration))
    except AutopilotError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Undistort demo failed")
        raise HTTPException(status_code=500, detail="Undistort demo failed unexpectedly. See server logs.")


@router.post("/lidar-overlay", response_model=LidarOverlayResponse)
def lidar_overlay(request: LidarOverlayRequest):
    try:
        return LidarOverlayResponse(
            **autopilot_service.run_lidar_overlay(
                request.calibration, request.numPoints, request.pointSize, request.seed
            )
        )
    except AutopilotError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("LiDAR overlay demo failed")
        raise HTTPException(status_code=500, detail="LiDAR overlay demo failed unexpectedly. See server logs.")


@router.post("/predict", response_model=PredictActionResponse)
def predict(request: PredictActionRequest):
    try:
        return PredictActionResponse(
            **autopilot_service.predict_action(
                request.state.speed,
                request.state.yawRate,
                request.state.nearestObstacleDist,
                request.state.laneOffset,
            )
        )
    except Exception:
        logger.exception("Policy prediction failed")
        raise HTTPException(status_code=500, detail="Policy prediction failed unexpectedly. See server logs.")
