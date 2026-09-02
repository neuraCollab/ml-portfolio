export const autopilot = {
  banner: {
    eyebrow: 'RL & Computer Vision Car Autopilot',
    title: 'KITTI Sensor Fusion & SAC/DDPG Autopilot Policy',
    descriptionPrefix:
      'Processes 60 FPS camera streams, Velodyne 3D LiDAR point clouds, OXTS GPS/IMU telemetry, and tracklets into a custom Gym Environment (',
    descriptionSuffix: ').',
    illustrativeNote:
      'The drive sequence, telemetry and reward curve below are illustrative example data (the raw KITTI dataset isn\'t bundled in this repo) -- see "Live Backend Demo" for real project code running against a bundled sample frame and the actual pretrained policy.',
    pauseStreamButton: 'Pause KITTI Stream',
    streamDriveButton: 'Stream KITTI Drive',
    lensUndistorted: 'Lens: Undistorted',
    lensRaw: 'Lens: Raw Distortion',
  },
  timeline: {
    sequenceLabel: 'Sequence:',
    frameCounter: 'Frame #{{frameId}} / {{total}}',
  },
  cameraView: {
    heading: 'Front Camera 00 (RGB)',
    subheading: 'P_rect_00 Projected',
    hudCamLabel: 'KITTI CAM 00 | FR #{{frameId}}',
    hudSpeedLabel: 'SPEED (vf): {{value}} m/s',
    hudYawRateLabel: 'YAW RATE: {{value}} rad/s',
    hudLensLabel: 'LENS: {{state}}',
    hudLensUndistorted: 'UNDISTORTED',
    hudLensDistorted: 'DISTORTED (RAW)',
  },
  lidarView: {
    heading: 'Velodyne LiDAR BEV (3D Cloud)',
    pointsCount: '{{count}} pts',
  },
  telemetry: {
    vehicleSpeedLabel: 'Vehicle Speed (vf)',
    vehicleSpeedCaption: '{{value}} m/s (OXTS)',
    yawRateLabel: 'Yaw Rate (ω)',
    yawRateCaption: 'Angular velocity',
    nearestObstacleLabel: 'Nearest Obstacle',
    nearestObstacleCaption: 'Preceding vehicle headway',
    gymStepRewardLabel: 'Gym Step Reward',
    cumulativeCaption: 'Cumulative: {{value}}',
  },
  rewardChart: {
    heading: 'RL Agent Step Reward & Headway Distance',
    subheading: 'Calculated by KITTICarEnv.calculate_reward() in real time',
    rewardSeriesName: 'Reward',
    obstacleHeadwaySeriesName: 'Obstacle Headway (m)',
  },
  policyPanel: {
    heading: 'Policy & Action Space',
    sacPretrainedButton: 'SAC Pretrained',
    manualOverrideButton: 'Manual Override',
    steeringRangeLabel: 'Steering (-1..1):',
    throttleRangeLabel: 'Throttle (0..1):',
    brakeRangeLabel: 'Brake (0..1):',
    manualSteeringLabel: 'Manual Steering: {{value}}',
    manualThrottleLabel: 'Manual Throttle: {{value}}',
  },
  calibration: {
    heading: 'Camera Calibration (K_00, D_00)',
    instructions:
      "Adjust these, then use the live backend demo below to run the project's real undistort/projection code with them.",
    resetButton: 'Reset to KITTI defaults',
  },
  safetyLog: {
    heading: 'Penalty & Safety Event Log',
    eventsCount: '{{count}} events',
    noticeDescription:
      'Real Euclidean distance from the synthetic LiDAR point cloud\'s own sensor-frame coordinates to the nearest point that projects into the visible camera frame (warning threshold: {{threshold}} m, from "Live Backend Demo" below).',
    emptyState: 'No safety penalties triggered. Smooth drive!',
    feedEntry: '[Frame #{{frameId}}] {{message}}',
    penalty: {
      harshSteering: 'Harsh steering penalty (-{{magnitude}})',
      overspeed: 'Overspeed penalty (-0.010)',
      overspeedSuffix: '+ Overspeed',
      collision: 'CRITICAL COLLISION HAZARD! Obstacle at {{distance}}m (-10.000)',
      highYaw: 'High yaw rate penalty',
      highYawSuffix: '+ High Yaw',
    },
  },
  warnings: {
    objectDetected: 'WARNING: Object detected at {{distance}} m',
    clear: 'Clear: nearest object at {{distance}} m',
  },
  liveDemo: {
    heading: 'Live Backend Demo',
    descriptionPrefix:
      "The dual displays above are a client-side visualization (the raw KITTI dataset isn't bundled in this repo). Everything below instead calls the real backend, which runs the project's actual OpenCV / pretrained-policy code from ",
    descriptionSuffix: ' on a bundled sample frame.',
  },
  cvColumn: {
    heading: 'Computer Vision',
    runUndistortButton: 'Run Undistort',
    runLidarButton: 'Run LiDAR',
    undistortErrorFallback: 'Undistort request failed.',
    lidarErrorFallback: 'LiDAR overlay request failed.',
    emptyState: 'Click "Run Undistort" to load the sample frame from the backend.',
    originalFrameAlt: 'Original sample frame',
    undistortedFrameAlt: 'Undistorted sample frame',
    badgeUndistortedLidar: 'undistorted + LiDAR',
    badgeUndistorted: 'undistorted',
    badgeOriginal: 'original',
    compareLabel: 'Compare: original ↔ undistorted',
    zoomLabel: 'Zoom',
    showLidarOverlayLabel: 'Show LiDAR overlay',
    lidarPointsLabel: 'LiDAR points',
    pointSizeLabel: 'Point size',
  },
  policyColumn: {
    heading: 'Autonomous Policy',
    queryButton: 'Query Policy (current frame)',
    policyErrorFallback: 'Policy prediction request failed.',
    emptyState: 'Click "Query Policy" to run a real forward pass through the pretrained SAC weights.',
    sourceLabel: 'Source',
    atBoundTitle: 'Value is at (or within epsilon of) the action-space bound',
    atBoundBadge: 'at bound',
    observationLabel: 'observation: {{shape}}',
    modelHeuristic: 'Heuristic',
  },
  actionLabels: {
    steering: 'Steering',
    throttle: 'Throttle',
    brake: 'Brake',
  },
  metrics: {
    frameSizeLabel: 'Frame Size',
    frameSizeTooltip: 'Actual pixel dimensions of the bundled sample frame.',
    undistortTimeLabel: 'Undistort Time',
    undistortTimeTooltipLive:
      'Wall-clock time for cv2.getOptimalNewCameraMatrix + cv2.undistort on this frame, measured server-side.',
    undistortTimeTooltipStatic:
      'Wall-clock time for cv2.getOptimalNewCameraMatrix + cv2.undistort, measured server-side.',
    pointsGeneratedLabel: 'Points Generated',
    pointsGeneratedTooltip:
      "Size of the synthetic LiDAR point cloud generated for this request (real point cloud data isn't bundled).",
    pointsInFrameLabel: 'Points In Frame',
    pointsInFrameTooltip:
      'Of the generated points, how many projected to valid pixel coordinates inside the image after velo_to_cam() + project_to_image().',
    nearestDistanceLabel: 'Nearest Distance',
    nearestDistanceTooltipLive:
      "Real Euclidean distance to the closest in-frame LiDAR point, from the synthetic point cloud's own sensor-frame coordinates.",
    nearestDistanceTooltipStatic:
      'Real Euclidean distance from the LiDAR sensor frame to the closest in-frame point.',
    lidarTimeLabel: 'LiDAR Time',
    lidarTimeTooltip: 'Wall-clock time for the projection + overlay drawing, measured server-side.',
    inferenceTimeLabel: 'Inference Time',
    inferenceTimeTooltip:
      'Wall-clock time for the model forward pass (or heuristic calculation), measured server-side.',
    modelLabel: 'Model',
    lidarPointsLabel: 'LiDAR Points',
    lidarPointsDetail: '{{count}} in frame',
    lidarPointsTooltip:
      'Size of the synthetic point cloud projected through the real velo_to_cam()/project_to_image() pipeline, and how many landed inside the visible image.',
    policyInferenceLabel: 'Policy Inference',
    policyInferenceTooltip:
      'Real forward-pass latency through the model that actually produced the action below.',
    policyInferenceDetailPretrained: 'Pretrained SAC',
    policyInferenceDetailHeuristic: 'Heuristic fallback',
  },
  staticResults: {
    eyebrow: 'Results',
    title: 'Real Pipeline Results',
    description:
      'A saved, real run of the backend pipeline (same code as the live demo above) -- generated once from the actual OpenCV undistortion, LiDAR projection, and pretrained SAC policy, so the results below are visible immediately without executing anything.',
    originalFrameLabel: 'Original KITTI frame',
    originalFrameCaption: 'Bundled sample camera frame, before any processing.',
    undistortedLabel: 'Undistorted',
    undistortedCaption: 'cv2.undistort() with the calibration below ({{ms}} ms).',
    lidarOverlayLabel: 'LiDAR overlay',
    lidarOverlayCaption: 'velo_to_cam() + project_to_image(), {{inFrame}} of {{generated}} points in frame.',
    warningDescription:
      'Real Euclidean distance to the nearest LiDAR point projected into frame (seed={{seed}}, threshold {{threshold}} m).',
    policyActionHeading: 'Policy Action ({{modelName}})',
    inputStateCaption:
      'Example input state: speed={{speed}} m/s, yaw_rate={{yawRate}} rad/s, nearest_obstacle_dist={{dist}} m, lane_offset={{offset}} m -- {{note}}',
    demonstratesLabel: 'What this demonstrates:',
    demonstratesBodyPrefix:
      " the full computer-vision + control stack runs end-to-end on real code -- OpenCV lens undistortion with real KITTI-style calibration, a real synthetic LiDAR point cloud projected through the project's actual camera-projection math (with a working <10m proximity warning), and a real forward pass through the pretrained SAC policy network. Every number above came from one real run of",
    demonstratesBodyMiddle: ', and',
    demonstratesBodySuffix: ' -- try the interactive demo above to run it again with your own parameters.',
  },
};
