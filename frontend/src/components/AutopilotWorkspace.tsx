import React, { useState, useEffect, useRef } from 'react';
import {
  KittiFrame,
  RLAction,
  RLLogStep,
  RLPenaltyPart,
  CameraCalibration,
} from '../types';
import {
  KITTI_FRAMES_DATA,
  DEFAULT_KITTI_CALIBRATION,
  stepKittiEnv,
  predictPolicyAction,
} from '../data/autopilotData';
import { runUndistort, runLidarOverlay, predictAction, ApiError, UndistortResponse, LidarOverlayResponse, PredictActionResponse } from '../api/client';
import { MetricCard } from './shared/MetricCard';
import { StaticResultsSection } from './autopilot/StaticResultsSection';
import { useTranslation, TranslationKey } from '../i18n/I18nContext';
import {
  Car,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  ShieldAlert,
  Activity,
  Maximize2,
  CheckCircle,
  Eye,
  Zap,
  Gauge,
  Compass,
  Radio,
  SlidersHorizontal,
  ServerCog,
  Camera,
  Radar,
  BrainCircuit,
  AlertTriangle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  steering: 'autopilot.actionLabels.steering',
  throttle: 'autopilot.actionLabels.throttle',
  brake: 'autopilot.actionLabels.brake',
};

// Renders a penalty event's structured parts into display text at call time,
// so it always reflects the current language (see RLPenaltyPart in types.ts).
const formatPenalty = (t: ReturnType<typeof useTranslation>['t'], parts: RLPenaltyPart[]): string =>
  parts
    .map((part) => {
      switch (part.kind) {
        case 'harshSteeringFull':
          return t('autopilot.safetyLog.penalty.harshSteering', { magnitude: part.magnitude.toFixed(3) });
        case 'overspeedFull':
          return t('autopilot.safetyLog.penalty.overspeed');
        case 'overspeedSuffix':
          return t('autopilot.safetyLog.penalty.overspeedSuffix');
        case 'collision':
          return t('autopilot.safetyLog.penalty.collision', { distance: part.distance });
        case 'highYawFull':
          return t('autopilot.safetyLog.penalty.highYaw');
        case 'highYawSuffix':
          return t('autopilot.safetyLog.penalty.highYawSuffix');
        default:
          return '';
      }
    })
    .join(' ');

export const AutopilotWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const [frameIdx, setFrameIdx] = useState(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [isUndistorted, setIsUndistorted] = useState(true);
  const [calib, setCalib] = useState<CameraCalibration>(DEFAULT_KITTI_CALIBRATION);
  const [usePretrainedPolicy, setUsePretrainedPolicy] = useState(true);

  // Manual actions
  const [manualAction, setManualAction] = useState<RLAction>({
    steering: 0.0,
    throttle: 0.5,
    brake: 0.0,
  });

  // Gym Env Logs state
  const [currentReward, setCurrentReward] = useState(0.1);
  const [cumulativeReward, setCumulativeReward] = useState(0.1);
  const [rlLogs, setRlLogs] = useState<RLLogStep[]>([]);
  // Stores structured penalty parts + frameId (not pre-formatted text) so
  // entries already in the feed retranslate immediately on language switch
  // instead of getting stuck in whichever language was active when they fired.
  const [penaltyFeed, setPenaltyFeed] = useState<{ frameId: number; parts: RLPenaltyPart[] }[]>([]);

  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bevCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- Live backend demo state (real FastAPI calls, see backend/app/services/autopilot_service.py) ---
  const [undistortResult, setUndistortResult] = useState<UndistortResponse | null>(null);
  const [undistortLoading, setUndistortLoading] = useState(false);
  const [undistortError, setUndistortError] = useState<string | null>(null);
  const [compareSplit, setCompareSplit] = useState(50); // % of frame showing the undistorted side
  const [zoom, setZoom] = useState(1);

  const [lidarResult, setLidarResult] = useState<LidarOverlayResponse | null>(null);
  const [lidarLoading, setLidarLoading] = useState(false);
  const [lidarError, setLidarError] = useState<string | null>(null);
  const [numLidarPoints, setNumLidarPoints] = useState(400);
  const [lidarPointSize, setLidarPointSize] = useState(2);
  const [showLidarOverlay, setShowLidarOverlay] = useState(false);

  const [policyResult, setPolicyResult] = useState<PredictActionResponse | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const handleRunUndistort = async () => {
    setUndistortLoading(true);
    setUndistortError(null);
    try {
      setUndistortResult(await runUndistort(calib));
    } catch (err) {
      setUndistortError(err instanceof ApiError ? err.message : t('autopilot.cvColumn.undistortErrorFallback'));
    } finally {
      setUndistortLoading(false);
    }
  };

  const handleRunLidarOverlay = async () => {
    setLidarLoading(true);
    setLidarError(null);
    try {
      setLidarResult(await runLidarOverlay(calib, numLidarPoints, lidarPointSize));
      setShowLidarOverlay(true);
    } catch (err) {
      setLidarError(err instanceof ApiError ? err.message : t('autopilot.cvColumn.lidarErrorFallback'));
    } finally {
      setLidarLoading(false);
    }
  };

  const handleQueryPolicy = async () => {
    setPolicyLoading(true);
    setPolicyError(null);
    try {
      const leadCar = currentFrame.tracklets.find((t) => t.objectType === 'Car');
      const res = await predictAction({
        speed: currentFrame.vf,
        yawRate: currentFrame.yaw,
        nearestObstacleDist: Math.min(...currentFrame.tracklets.map((t) => t.distance)),
        laneOffset: leadCar ? leadCar.ty : 0,
      });
      setPolicyResult(res);
    } catch (err) {
      setPolicyError(err instanceof ApiError ? err.message : t('autopilot.policyColumn.policyErrorFallback'));
    } finally {
      setPolicyLoading(false);
    }
  };

  const currentFrame: KittiFrame = KITTI_FRAMES_DATA[frameIdx] || KITTI_FRAMES_DATA[0];

  // Active action determination
  const activeAction: RLAction = usePretrainedPolicy
    ? predictPolicyAction(currentFrame)
    : manualAction;

  // Auto sequence playback loop
  useEffect(() => {
    let timer: any = null;
    if (isPlayingSequence) {
      timer = setInterval(() => {
        setFrameIdx((prev) => (prev + 1) % KITTI_FRAMES_DATA.length);
      }, 250);
    }
    return () => clearInterval(timer);
  }, [isPlayingSequence]);

  // Execute step in KITTICarEnv whenever frame or action changes
  useEffect(() => {
    const stepLog = stepKittiEnv(rlLogs.length + 1, currentFrame, activeAction, cumulativeReward);
    setCurrentReward(stepLog.reward);
    setCumulativeReward(stepLog.cumulativeReward);

    setRlLogs((prev) => [...prev.slice(-30), stepLog]);

    if (stepLog.penalty) {
      setPenaltyFeed((prev) => [
        { frameId: currentFrame.frameId, parts: stepLog.penalty as RLPenaltyPart[] },
        ...prev.slice(0, 15),
      ]);
    }
  }, [frameIdx, activeAction.steering, activeAction.throttle, activeAction.brake]);

  // Render Camera View Canvas
  useEffect(() => {
    const canvas = cameraCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    // Render Sky & Horizon
    const horizonY = h * 0.45;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Ground / Road
    const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    roadGrad.addColorStop(0, '#334155');
    roadGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Perspective Lane Lines
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();

    // Center divider dash animation
    const dashOffset = (frameIdx * 8) % 30;
    ctx.setLineDash([15, 15]);
    ctx.lineDashOffset = -dashOffset;

    const vanishingX = w / 2 + (currentFrame.yaw * 150);
    ctx.moveTo(vanishingX, horizonY);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Outer lane lines (solid)
    ctx.setLineDash([]);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(vanishingX - 80, horizonY);
    ctx.lineTo(60, h);
    ctx.moveTo(vanishingX + 80, horizonY);
    ctx.lineTo(w - 60, h);
    ctx.stroke();

    // Lens distortion effect if NOT undistorted
    if (!isUndistorted) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Render 3D Tracklet Bounding Boxes (Cars, Pedestrians, Vans)
    currentFrame.tracklets.forEach((obj) => {
      // Perspective scale factor based on distance tx
      const scale = Math.max(0.15, Math.min(1.5, 18 / obj.tx));
      const boxW = obj.w * 50 * scale;
      const boxH = obj.h * 50 * scale;

      const objX = vanishingX + obj.ty * 40 * scale - boxW / 2;
      const objY = horizonY + (15 / obj.tx) * 120 - boxH / 2;

      // Color coding based on distance
      let strokeColor = '#10b981'; // safe green
      if (obj.distance < 7) strokeColor = '#ef4444'; // critical red
      else if (obj.distance < 15) strokeColor = '#f59e0b'; // warning yellow

      // 3D Box front face
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(objX, objY, boxW, boxH);

      // Label background
      ctx.fillStyle = strokeColor;
      ctx.fillRect(objX, objY - 18, boxW, 18);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${obj.objectType} ${obj.distance.toFixed(1)}m`, objX + 4, objY - 5);
    });

    // HUD Telemetry overlay
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(15, 15, 190, 75);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(15, 15, 190, 75);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(t('autopilot.cameraView.hudCamLabel', { frameId: currentFrame.frameId }), 25, 32);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(t('autopilot.cameraView.hudSpeedLabel', { value: currentFrame.vf.toFixed(1) }), 25, 48);
    ctx.fillStyle = '#a78bfa';
    ctx.fillText(t('autopilot.cameraView.hudYawRateLabel', { value: currentFrame.yaw.toFixed(3) }), 25, 64);
    ctx.fillStyle = isUndistorted ? '#34d399' : '#f87171';
    ctx.fillText(
      t('autopilot.cameraView.hudLensLabel', {
        state: isUndistorted
          ? t('autopilot.cameraView.hudLensUndistorted')
          : t('autopilot.cameraView.hudLensDistorted'),
      }),
      25,
      80
    );

  }, [frameIdx, isUndistorted, currentFrame, t]);

  // Render Bird's Eye View (BEV) LiDAR Canvas
  useEffect(() => {
    const canvas = bevCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark grid background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Distance Rings (10m, 20m, 30m, 40m)
    const egoX = w / 2;
    const egoY = h - 40;
    const metersToPixels = 5.5;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    for (let r = 10; r <= 50; r += 10) {
      ctx.beginPath();
      ctx.arc(egoX, egoY, r * metersToPixels, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '9px monospace';
      ctx.fillText(`${r}m`, egoX + 4, egoY - r * metersToPixels + 10);
    }

    // Grid radial lines
    ctx.beginPath();
    ctx.moveTo(egoX, 0);
    ctx.lineTo(egoX, h);
    ctx.moveTo(0, egoY);
    ctx.lineTo(w, egoY);
    ctx.stroke();

    // Render Simulated LiDAR Points Cloud (Viridis palette)
    const numPoints = 800;
    for (let i = 0; i < numPoints; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 0.85 - Math.PI / 2;
      const dist = 3 + Math.random() * 45;
      const pX = egoX + Math.cos(angle) * dist * metersToPixels;
      const pY = egoY + Math.sin(angle) * dist * metersToPixels;

      const intensity = Math.random();
      ctx.fillStyle = `hsl(${220 - intensity * 160}, 90%, ${40 + intensity * 30}%)`;
      ctx.fillRect(pX, pY, 1.5, 1.5);
    }

    // Render Ego Vehicle Footprint
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(egoX - 8, egoY - 14, 16, 28);
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    ctx.strokeRect(egoX - 8, egoY - 14, 16, 28);

    // Render Tracklet Obstacles in BEV space
    currentFrame.tracklets.forEach((obj) => {
      const oX = egoX + obj.ty * metersToPixels;
      const oY = egoY - obj.tx * metersToPixels;

      ctx.fillStyle = obj.distance < 7 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)';
      ctx.strokeStyle = obj.distance < 7 ? '#ef4444' : '#10b981';
      ctx.lineWidth = 1.5;

      const wPix = obj.w * metersToPixels;
      const lPix = obj.l * metersToPixels;

      ctx.fillRect(oX - wPix / 2, oY - lPix / 2, wPix, lPix);
      ctx.strokeRect(oX - wPix / 2, oY - lPix / 2, wPix, lPix);
    });

  }, [frameIdx, currentFrame]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/60 to-slate-900 rounded-2xl p-6 border border-emerald-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-emerald-500/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
              <Car className="w-4 h-4" />
              <span>{t('autopilot.banner.eyebrow')}</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t('autopilot.banner.title')}
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              {t('autopilot.banner.descriptionPrefix')}<span className="font-mono text-emerald-400">KITTICarEnv</span>{t('autopilot.banner.descriptionSuffix')}
            </p>
            <p className="text-[11px] text-amber-300/80 mt-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              {t('autopilot.banner.illustrativeNote')}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsPlayingSequence(!isPlayingSequence)}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition cursor-pointer"
            >
              {isPlayingSequence ? (
                <>
                  <Pause className="w-4 h-4 fill-white" />
                  <span>{t('autopilot.banner.pauseStreamButton')}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>{t('autopilot.banner.streamDriveButton')}</span>
                </>
              )}
            </button>
            <button
              onClick={() => setIsUndistorted(!isUndistorted)}
              className={`flex items-center space-x-2 px-4 py-2.5 border rounded-xl transition text-sm font-medium ${
                isUndistorted
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{isUndistorted ? t('autopilot.banner.lensUndistorted') : t('autopilot.banner.lensRaw')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Frame Scrubber & Timeline Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-slate-400">{t('autopilot.timeline.sequenceLabel')}</span>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
            2011_09_26_drive_0001_sync
          </span>
          <span className="text-xs font-mono text-slate-500">
            {t('autopilot.timeline.frameCounter', { frameId: currentFrame.frameId, total: KITTI_FRAMES_DATA.length - 1 })}
          </span>
        </div>

        <div className="flex-1 flex items-center space-x-3">
          <input
            type="range"
            min="0"
            max={KITTI_FRAMES_DATA.length - 1}
            value={frameIdx}
            onChange={(e) => setFrameIdx(Number(e.target.value))}
            className="w-full accent-emerald-500 bg-slate-800"
          />
        </div>
      </div>

      {/* Main Grid: Sensor Fusion Dual Displays (8 cols) & Control Panel (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Dual Canvases Camera + BEV (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Dual Display Canvas Container */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Camera View Canvas */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                <span className="flex items-center space-x-1.5 text-slate-200 font-semibold">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('autopilot.cameraView.heading')}</span>
                </span>
                <span className="text-[10px] text-slate-500">{t('autopilot.cameraView.subheading')}</span>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[4/3]">
                <canvas
                  ref={cameraCanvasRef}
                  width={400}
                  height={300}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Velodyne LiDAR BEV Canvas */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                <span className="flex items-center space-x-1.5 text-slate-200 font-semibold">
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('autopilot.lidarView.heading')}</span>
                </span>
                <span className="text-[10px] text-slate-500">{t('autopilot.lidarView.pointsCount', { count: currentFrame.lidarPointsCount })}</span>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[4/3]">
                <canvas
                  ref={bevCanvasRef}
                  width={400}
                  height={300}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

          </div>

          {/* Live Telemetry Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{t('autopilot.telemetry.vehicleSpeedLabel')}</span>
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {(currentFrame.vf * 3.6).toFixed(1)} <span className="text-xs text-slate-500">km/h</span>
              </div>
              <p className="text-[10px] text-slate-500">{t('autopilot.telemetry.vehicleSpeedCaption', { value: currentFrame.vf.toFixed(1) })}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{t('autopilot.telemetry.yawRateLabel')}</span>
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-indigo-400">
                {currentFrame.yaw.toFixed(3)} <span className="text-xs text-slate-500">rad/s</span>
              </div>
              <p className="text-[10px] text-slate-500">{t('autopilot.telemetry.yawRateCaption')}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{t('autopilot.telemetry.nearestObstacleLabel')}</span>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {Math.min(...currentFrame.tracklets.map((t) => t.distance)).toFixed(1)} <span className="text-xs text-slate-500">m</span>
              </div>
              <p className="text-[10px] text-slate-500">{t('autopilot.telemetry.nearestObstacleCaption')}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{t('autopilot.telemetry.gymStepRewardLabel')}</span>
                <Zap className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-teal-400">
                {currentReward.toFixed(3)}
              </div>
              <p className="text-[10px] text-slate-500">{t('autopilot.telemetry.cumulativeCaption', { value: cumulativeReward.toFixed(2) })}</p>
            </div>
          </div>

          {/* RL Reward History Curve Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>{t('autopilot.rewardChart.heading')}</span>
                </h3>
                <p className="text-xs text-slate-400">{t('autopilot.rewardChart.subheading')}</p>
              </div>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rlLogs} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="step" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                  <Line type="monotone" dataKey="reward" stroke="#10b981" strokeWidth={2} dot={false} name={t('autopilot.rewardChart.rewardSeriesName')} />
                  <Line type="monotone" dataKey="nearestObstacleDist" stroke="#f59e0b" strokeWidth={1.5} dot={false} name={t('autopilot.rewardChart.obstacleHeadwaySeriesName')} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Right Column: RL Agent Controls & Calibration Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Policy Selector & Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <span>{t('autopilot.policyPanel.heading')}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">SAC / DDPG</span>
            </div>

            {/* Policy Toggle */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setUsePretrainedPolicy(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center space-x-1.5 ${
                    usePretrainedPolicy
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{t('autopilot.policyPanel.sacPretrainedButton')}</span>
                </button>

                <button
                  onClick={() => setUsePretrainedPolicy(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center space-x-1.5 ${
                    !usePretrainedPolicy
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{t('autopilot.policyPanel.manualOverrideButton')}</span>
                </button>
              </div>

              {/* Action Values Gauge */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('autopilot.policyPanel.steeringRangeLabel')}</span>
                  <span className="text-emerald-400 font-bold">{activeAction.steering}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${((activeAction.steering + 1) / 2) * 100}%` }}
                  />
                </div>

                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">{t('autopilot.policyPanel.throttleRangeLabel')}</span>
                  <span className="text-teal-400 font-bold">{activeAction.throttle}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-500 h-full transition-all"
                    style={{ width: `${activeAction.throttle * 100}%` }}
                  />
                </div>

                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">{t('autopilot.policyPanel.brakeRangeLabel')}</span>
                  <span className="text-red-400 font-bold">{activeAction.brake}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-red-500 h-full transition-all"
                    style={{ width: `${activeAction.brake * 100}%` }}
                  />
                </div>
              </div>

              {/* Manual Override Sliders if enabled */}
              {!usePretrainedPolicy && (
                <div className="space-y-3 pt-2 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">{t('autopilot.policyPanel.manualSteeringLabel', { value: manualAction.steering })}</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={manualAction.steering}
                      onChange={(e) => setManualAction({ ...manualAction, steering: Number(e.target.value) })}
                      className="w-full accent-emerald-500 bg-slate-800"
                    />
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">{t('autopilot.policyPanel.manualThrottleLabel', { value: manualAction.throttle })}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={manualAction.throttle}
                      onChange={(e) => setManualAction({ ...manualAction, throttle: Number(e.target.value) })}
                      className="w-full accent-teal-500 bg-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Camera Calibration Parameters ($K_{00}, D_{00}$) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <Sliders className="w-4 h-4 text-purple-400" />
                <span>{t('autopilot.calibration.heading')}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">calib_cam_to_cam.txt</span>
            </div>

            <p className="text-[11px] text-slate-500">
              {t('autopilot.calibration.instructions')}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {(['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'] as const).map((key) => (
                <label key={key} className="flex items-center justify-between bg-slate-950 rounded-lg border border-slate-800 px-2 py-1.5">
                  <span className="text-slate-500">{key}</span>
                  <input
                    type="number"
                    step="0.001"
                    value={calib[key]}
                    onChange={(e) => setCalib({ ...calib, [key]: Number(e.target.value) })}
                    className="w-16 bg-transparent text-right text-indigo-300 focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <button
              onClick={() => setCalib(DEFAULT_KITTI_CALIBRATION)}
              className="text-[11px] text-slate-500 hover:text-slate-300 underline"
            >
              {t('autopilot.calibration.resetButton')}
            </button>
          </div>

          {/* Safety Violation & Penalty Event Feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>{t('autopilot.safetyLog.heading')}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">{t('autopilot.safetyLog.eventsCount', { count: penaltyFeed.length })}</span>
            </div>

            {/* Real LiDAR proximity warning (from "Live Backend Demo" -> Run
                LiDAR below) -- lives here so all safety-relevant signals are
                in one place. Only appears once that real backend call has run. */}
            {lidarResult && lidarResult.nearestDistanceM !== null && (
              <div
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                  lidarResult.warningActive
                    ? 'bg-red-500/10 border-red-500/40 animate-pulse'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                {lidarResult.warningActive ? (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                )}
                <div className="flex-1">
                  <div className={`text-sm font-bold ${lidarResult.warningActive ? 'text-red-300' : 'text-emerald-300'}`}>
                    {lidarResult.warningActive
                      ? t('autopilot.warnings.objectDetected', { distance: lidarResult.nearestDistanceM.toFixed(1) })
                      : t('autopilot.warnings.clear', { distance: lidarResult.nearestDistanceM.toFixed(1) })}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t('autopilot.safetyLog.noticeDescription', { threshold: lidarResult.warningThresholdM })}
                  </div>
                </div>
              </div>
            )}

            <div className="h-44 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
              {penaltyFeed.length === 0 ? (
                <div className="text-slate-500 text-center py-8">{t('autopilot.safetyLog.emptyState')}</div>
              ) : (
                penaltyFeed.map((entry, i) => (
                  <div key={i} className="p-2 rounded-lg bg-red-950/40 border border-red-500/20 text-red-300">
                    {t('autopilot.safetyLog.feedEntry', { frameId: entry.frameId, message: formatPenalty(t, entry.parts) })}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Live Backend Demo: real OpenCV + pretrained SAC code, run via FastAPI -- full width so the
          image comparison / zoom controls have room to work with. */}
      <div className="bg-slate-900 border border-purple-500/20 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm">
              <ServerCog className="w-4 h-4 text-purple-400" />
              <span>{t('autopilot.liveDemo.heading')}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 max-w-2xl">
              {t('autopilot.liveDemo.descriptionPrefix')}
              <span className="font-mono">rl_cv_car-autopilot/</span>{t('autopilot.liveDemo.descriptionSuffix')}
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono shrink-0">FastAPI</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* --- Computer Vision column --- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-purple-400" />
                {t('autopilot.cvColumn.heading')}
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={handleRunUndistort}
                  disabled={undistortLoading}
                  className="flex items-center gap-1.5 py-1.5 px-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium rounded-lg transition disabled:opacity-50"
                >
                  {undistortLoading ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  <span>{t('autopilot.cvColumn.runUndistortButton')}</span>
                </button>
                <button
                  onClick={handleRunLidarOverlay}
                  disabled={lidarLoading}
                  className="flex items-center gap-1.5 py-1.5 px-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium rounded-lg transition disabled:opacity-50"
                >
                  {lidarLoading ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
                  <span>{t('autopilot.cvColumn.runLidarButton')}</span>
                </button>
              </div>
            </div>

            {undistortError && <div className="flex items-center space-x-2 text-xs text-red-300"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>{undistortError}</span></div>}
            {lidarError && <div className="flex items-center space-x-2 text-xs text-red-300"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>{lidarError}</span></div>}

            {!undistortResult ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                {t('autopilot.cvColumn.emptyState')}
              </div>
            ) : (
              <>
                <div
                  className="relative rounded-xl overflow-hidden border border-slate-800 bg-black"
                  style={{ aspectRatio: `${undistortResult.imageWidth} / ${undistortResult.imageHeight}` }}
                >
                  <div className="w-full h-full overflow-hidden" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
                    <img
                      src={`data:image/png;base64,${undistortResult.originalImageBase64}`}
                      alt={t('autopilot.cvColumn.originalFrameAlt')}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{ clipPath: `polygon(0 0, ${compareSplit}% 0, ${compareSplit}% 100%, 0 100%)` }}
                    >
                      <img
                        src={`data:image/png;base64,${
                          showLidarOverlay && lidarResult ? lidarResult.imageBase64 : undistortResult.undistortedImageBase64
                        }`}
                        alt={t('autopilot.cvColumn.undistortedFrameAlt')}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-purple-400/80 pointer-events-none"
                      style={{ left: `${compareSplit}%` }}
                    />
                  </div>
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-mono bg-black/60 px-1.5 py-0.5 rounded text-purple-300">
                    {showLidarOverlay && lidarResult ? t('autopilot.cvColumn.badgeUndistortedLidar') : t('autopilot.cvColumn.badgeUndistorted')}
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono bg-black/60 px-1.5 py-0.5 rounded text-slate-400">
                    {t('autopilot.cvColumn.badgeOriginal')}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between mb-1 text-slate-400">
                      <span>{t('autopilot.cvColumn.compareLabel')}</span>
                      <span className="font-mono text-purple-300">{compareSplit}%</span>
                    </div>
                    <input type="range" min={0} max={100} value={compareSplit} onChange={(e) => setCompareSplit(Number(e.target.value))} className="w-full accent-purple-500" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-slate-400">
                      <span>{t('autopilot.cvColumn.zoomLabel')}</span>
                      <span className="font-mono text-purple-300">{zoom.toFixed(1)}x</span>
                    </div>
                    <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-purple-500" />
                  </div>
                  {lidarResult && (
                    <label className="flex items-center justify-between cursor-pointer pt-1">
                      <span className="text-slate-400">{t('autopilot.cvColumn.showLidarOverlayLabel')}</span>
                      <input type="checkbox" checked={showLidarOverlay} onChange={(e) => setShowLidarOverlay(e.target.checked)} className="rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-purple-500" />
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="flex justify-between mb-1 text-slate-400">
                        <span>{t('autopilot.cvColumn.lidarPointsLabel')}</span>
                        <span className="font-mono text-purple-300">{numLidarPoints}</span>
                      </div>
                      <input type="range" min={50} max={2000} step={50} value={numLidarPoints} onChange={(e) => setNumLidarPoints(Number(e.target.value))} className="w-full accent-purple-500" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1 text-slate-400">
                        <span>{t('autopilot.cvColumn.pointSizeLabel')}</span>
                        <span className="font-mono text-purple-300">{lidarPointSize}px</span>
                      </div>
                      <input type="range" min={1} max={8} value={lidarPointSize} onChange={(e) => setLidarPointSize(Number(e.target.value))} className="w-full accent-purple-500" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <MetricCard label={t('autopilot.metrics.frameSizeLabel')} value={`${undistortResult.imageWidth}×${undistortResult.imageHeight}`} icon={Maximize2} color="text-purple-300" tooltip={t('autopilot.metrics.frameSizeTooltip')} />
                  <MetricCard label={t('autopilot.metrics.undistortTimeLabel')} value={undistortResult.processingTimeMs} unit="ms" icon={Zap} color="text-purple-300" tooltip={t('autopilot.metrics.undistortTimeTooltipLive')} />
                  {lidarResult && (
                    <>
                      <MetricCard label={t('autopilot.metrics.pointsGeneratedLabel')} value={lidarResult.pointsGenerated} icon={Radar} color="text-purple-300" tooltip={t('autopilot.metrics.pointsGeneratedTooltip')} />
                      <MetricCard label={t('autopilot.metrics.pointsInFrameLabel')} value={lidarResult.pointsInFrame} icon={CheckCircle} color="text-purple-300" tooltip={t('autopilot.metrics.pointsInFrameTooltip')} />
                      {lidarResult.nearestDistanceM !== null && (
                        <MetricCard
                          label={t('autopilot.metrics.nearestDistanceLabel')}
                          value={lidarResult.nearestDistanceM}
                          unit="m"
                          icon={lidarResult.warningActive ? AlertTriangle : Radar}
                          color={lidarResult.warningActive ? 'text-red-300' : 'text-purple-300'}
                          tooltip={t('autopilot.metrics.nearestDistanceTooltipLive')}
                        />
                      )}
                      <MetricCard label={t('autopilot.metrics.lidarTimeLabel')} value={lidarResult.processingTimeMs} unit="ms" icon={Zap} color="text-purple-300" tooltip={t('autopilot.metrics.lidarTimeTooltip')} />
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* --- Autonomous Policy column --- */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-emerald-400" />
                {t('autopilot.policyColumn.heading')}
              </h4>
              <button
                onClick={handleQueryPolicy}
                disabled={policyLoading}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg transition disabled:opacity-50"
              >
                {policyLoading ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5" />}
                <span>{t('autopilot.policyColumn.queryButton')}</span>
              </button>
            </div>

            {policyError && <div className="flex items-center space-x-2 text-xs text-red-300"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>{policyError}</span></div>}

            {!policyResult ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                {t('autopilot.policyColumn.emptyState')}
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t('autopilot.policyColumn.sourceLabel')}</span>
                    <span className={`font-mono font-semibold ${policyResult.modelSource === 'pretrained-sac' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {policyResult.modelSource}
                    </span>
                  </div>
                  {([
                    ['steering', policyResult.action.steering, policyResult.actionSpace.low.steering, policyResult.actionSpace.high.steering, policyResult.clipped.steering],
                    ['throttle', policyResult.action.throttle, policyResult.actionSpace.low.throttle, policyResult.actionSpace.high.throttle, policyResult.clipped.throttle],
                    ['brake', policyResult.action.brake, policyResult.actionSpace.low.brake, policyResult.actionSpace.high.brake, policyResult.clipped.brake],
                  ] as [string, number, number, number, boolean][]).map(([name, value, low, high, clipped]) => (
                    <div key={name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400 capitalize">{t(ACTION_LABEL_KEYS[name])}</span>
                        <span className="font-mono text-emerald-300">
                          {value.toFixed(3)} <span className="text-slate-600">[{low}, {high}]</span>
                          {clipped && <span className="ml-1 text-amber-400" title={t('autopilot.policyColumn.atBoundTitle')}>{t('autopilot.policyColumn.atBoundBadge')}</span>}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${((value - low) / (high - low)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <MetricCard label={t('autopilot.metrics.inferenceTimeLabel')} value={policyResult.inferenceTimeMs} unit="ms" icon={Zap} color="text-emerald-300" tooltip={t('autopilot.metrics.inferenceTimeTooltip')} />
                  <MetricCard label={t('autopilot.metrics.modelLabel')} value={<span className="text-sm">{policyResult.modelSource === 'pretrained-sac' ? 'SAC' : t('autopilot.policyColumn.modelHeuristic')}</span>} icon={BrainCircuit} color="text-emerald-300" tooltip={policyResult.modelName} />
                </div>
                <div className="text-[11px] text-slate-500 font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                  {t('autopilot.policyColumn.observationLabel', { shape: policyResult.observationShape })}
                </div>
                <p className="text-[11px] text-slate-500">{policyResult.note}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <StaticResultsSection />
    </div>
  );
};
