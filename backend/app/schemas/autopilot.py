from typing import Literal, Optional

from pydantic import BaseModel, Field


class CameraCalibration(BaseModel):
    """Mirrors src/types.ts CameraCalibration on the frontend."""

    fx: float = Field(..., gt=0)
    fy: float = Field(..., gt=0)
    cx: float
    cy: float
    k1: float
    k2: float
    p1: float
    p2: float


class UndistortRequest(BaseModel):
    calibration: CameraCalibration


class UndistortResponse(BaseModel):
    originalImageBase64: str
    undistortedImageBase64: str
    imageWidth: int
    imageHeight: int
    processingTimeMs: float
    note: str


class LidarOverlayRequest(BaseModel):
    calibration: CameraCalibration
    numPoints: int = Field(400, ge=10, le=2000)
    pointSize: int = Field(2, ge=1, le=8)
    seed: Optional[int] = None


class LidarOverlayResponse(BaseModel):
    imageBase64: str
    pointsGenerated: int
    pointsInFrame: int
    nearestDistanceM: float | None = None
    warningActive: bool = False
    warningThresholdM: float = 10.0
    imageWidth: int
    imageHeight: int
    processingTimeMs: float
    note: str


class VehicleState(BaseModel):
    speed: float = Field(..., description="m/s, OXTS vf")
    yawRate: float = Field(..., description="rad/s")
    nearestObstacleDist: float = Field(..., ge=0)
    laneOffset: float = Field(0.0, description="lateral offset to lead object, meters")


class PredictActionRequest(BaseModel):
    state: VehicleState


class RLAction(BaseModel):
    steering: float
    throttle: float
    brake: float


class ActionBounds(BaseModel):
    low: RLAction
    high: RLAction


class ClippedFlags(BaseModel):
    steering: bool
    throttle: bool
    brake: bool


class PredictActionResponse(BaseModel):
    action: RLAction
    modelSource: Literal["pretrained-sac", "heuristic-fallback"]
    modelName: str
    observationShape: str
    actionSpace: ActionBounds
    clipped: ClippedFlags
    inferenceTimeMs: float
    note: str
