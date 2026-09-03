import { KittiFrame, TrackletObject, RLAction, RLLogStep, RLPenaltyPart, CameraCalibration } from '../types';

export const DEFAULT_KITTI_CALIBRATION: CameraCalibration = {
  fx: 959.7,
  fy: 956.9,
  cx: 696.0,
  cy: 224.2,
  k1: -0.369,
  k2: 0.196,
  p1: 0.0001,
  p2: 0.0002,
};

export const KITTI_FRAMES_DATA: KittiFrame[] = Array.from({ length: 40 }, (_, idx) => {
  const frameId = idx;
  const t = idx * 0.1;
  const speed = Number((15 + Math.sin(t * 0.5) * 8 + Math.cos(t * 0.2) * 4).toFixed(2)); // m/s (~54 km/h)
  const yaw = Number((Math.sin(t * 0.8) * 0.15).toFixed(3)); // rad/s

  // Dynamic distance to preceding car
  const distCar1 = Number(Math.max(4.2, 28.5 - idx * 0.45 + Math.sin(idx) * 2).toFixed(2));
  const distPedestrian = Number((18.0 + Math.cos(idx * 0.3) * 12).toFixed(2));

  const tracklets: TrackletObject[] = [
    {
      id: `car_1`,
      objectType: 'Car',
      tx: distCar1,
      ty: Number((0.4 + Math.sin(idx * 0.2) * 0.8).toFixed(2)),
      tz: -0.2,
      h: 1.52,
      w: 1.68,
      l: 4.25,
      distance: distCar1,
      truncation: 0,
      occlusion: 0,
    },
    {
      id: `pedestrian_1`,
      objectType: 'Pedestrian',
      tx: distPedestrian,
      ty: Number((-3.2 + Math.sin(idx * 0.5) * 1.5).toFixed(2)),
      tz: 0.1,
      h: 1.75,
      w: 0.60,
      l: 0.55,
      distance: distPedestrian,
      truncation: 0,
      occlusion: 1,
    },
    {
      id: `van_1`,
      objectType: 'Van',
      tx: Number((distCar1 + 14.2).toFixed(2)),
      ty: -4.5,
      tz: -0.1,
      h: 2.10,
      w: 1.95,
      l: 5.40,
      distance: Number((distCar1 + 14.2).toFixed(2)),
      truncation: 0,
      occlusion: 0,
    },
  ];

  return {
    frameId,
    timestamp: `2011-09-26 13:02:${(10 + idx * 0.1).toFixed(1)}`,
    vf: speed,
    yaw,
    tracklets,
    lidarPointsCount: 124500 + Math.floor(Math.sin(idx) * 3500),
  };
});

// Simulate 1 step in KITTICarEnv
export function stepKittiEnv(
  currentStep: number,
  frame: KittiFrame,
  action: RLAction,
  prevCumulativeReward: number
): RLLogStep {
  let reward = 0.1; // base survival reward
  // Built as structured parts (not formatted text) so the UI can translate
  // them at render time rather than baking English text into state -- see
  // RLPenaltyPart in types.ts.
  let penaltyParts: RLPenaltyPart[] = [];

  // Steering penalty if steering is too harsh (> 0.7)
  if (Math.abs(action.steering) > 0.7) {
    const p = 0.05 * Math.abs(action.steering);
    reward -= p;
    penaltyParts = [{ kind: 'harshSteeringFull', magnitude: p }];
  }

  // Speed reward (10 to 40 m/s is optimal)
  if (frame.vf >= 10 && frame.vf <= 40) {
    reward += 0.05;
  } else if (frame.vf > 40) {
    reward -= 0.01;
    penaltyParts = penaltyParts.length
      ? [...penaltyParts, { kind: 'overspeedSuffix' }]
      : [{ kind: 'overspeedFull' }];
  }

  // Nearest obstacle check -- a collision hazard overrides/replaces any
  // steering/overspeed penalty above (matches the original combined logic).
  const nearestObstacleDist = Math.min(...frame.tracklets.map((t) => t.distance));
  if (nearestObstacleDist < 5.0) {
    reward -= 10.0;
    penaltyParts = [{ kind: 'collision', distance: nearestObstacleDist }];
  }

  // Yaw rate penalty
  if (Math.abs(frame.yaw) > 0.5) {
    reward -= 0.02 * Math.abs(frame.yaw);
    penaltyParts = penaltyParts.length
      ? [...penaltyParts, { kind: 'highYawSuffix' }]
      : [{ kind: 'highYawFull' }];
  }

  const penalty = penaltyParts.length ? penaltyParts : null;

  const cumulativeReward = Number((prevCumulativeReward + reward).toFixed(3));

  return {
    step: currentStep,
    frameId: frame.frameId,
    action,
    speed: frame.vf,
    yawRate: frame.yaw,
    nearestObstacleDist,
    reward: Number(reward.toFixed(3)),
    cumulativeReward,
    penalty,
  };
}

// Predict action using pretrained SAC model policy
export function predictPolicyAction(frame: KittiFrame): RLAction {
  const nearestDist = Math.min(...frame.tracklets.map((t) => t.distance));
  const leadCar = frame.tracklets.find((t) => t.objectType === 'Car');
  const targetOffset = leadCar ? leadCar.ty : 0;

  // Steering adjusts proportional to target offset to center lane
  let steering = -targetOffset * 0.35 + Math.sin(frame.frameId * 0.4) * 0.08;
  steering = Math.max(-1, Math.min(1, steering));

  // Throttle & Brake policy logic
  let throttle = 0.65;
  let brake = 0.0;

  if (nearestDist < 7.0) {
    throttle = 0.0;
    brake = 0.85;
  } else if (nearestDist < 15.0) {
    throttle = 0.2;
    brake = 0.3;
  } else if (frame.vf > 25) {
    throttle = 0.4;
  }

  return {
    steering: Number(steering.toFixed(2)),
    throttle: Number(throttle.toFixed(2)),
    brake: Number(brake.toFixed(2)),
  };
}
