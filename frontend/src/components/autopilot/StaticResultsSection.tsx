import React from 'react';
import autopilotResults from '../../data/staticResults/autopilotResults.json';
import { MetricCard } from '../shared/MetricCard';
import {
  ClipboardCheck, Zap, Radar, AlertTriangle, CheckCircle, Gauge, BrainCircuit, Camera,
} from 'lucide-react';

interface AutopilotStaticResults {
  undistort: { imageWidth: number; imageHeight: number; processingTimeMs: number; note: string };
  lidar: {
    pointsGenerated: number; pointsInFrame: number; nearestDistanceM: number | null;
    warningActive: boolean; warningThresholdM: number; processingTimeMs: number;
    seed: number; numPointsRequested: number; note: string;
  };
  policy: {
    inputState: { speed: number; yawRate: number; nearestObstacleDist: number; laneOffset: number };
    action: { steering: number; throttle: number; brake: number };
    modelSource: string; modelName: string; observationShape: string;
    clipped: { steering: boolean; throttle: boolean; brake: boolean };
    inferenceTimeMs: number; note: string;
  };
  calibration: { fx: number; fy: number; cx: number; cy: number; k1: number; k2: number; p1: number; p2: number };
}

const data = autopilotResults as AutopilotStaticResults;

const ImageCard: React.FC<{ src: string; label: string; caption: string }> = ({ src, label, caption }) => (
  <div className="space-y-2">
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-black">
      <img src={src} alt={label} className="w-full h-auto block" loading="lazy" />
    </div>
    <div>
      <div className="text-xs font-semibold text-slate-300">{label}</div>
      <div className="text-[10px] text-slate-500">{caption}</div>
    </div>
  </div>
);

export const StaticResultsSection: React.FC = () => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-purple-400 text-xs font-mono font-semibold uppercase tracking-wider">
        <ClipboardCheck className="w-4 h-4" />
        <span>Results</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Real Pipeline Results</h2>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          A saved, real run of the backend pipeline (same code as the live demo above) -- generated once
          from the actual OpenCV undistortion, LiDAR projection, and pretrained SAC policy, so the results
          below are visible immediately without executing anything.
        </p>
      </div>

      {/* Static visual examples -- BASE_URL-prefixed so these still resolve
          when served from a GitHub Pages subpath (see vite.config.ts). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ImageCard
          src={`${(import.meta as any).env.BASE_URL}static-results/autopilot/original.png`}
          label="Original KITTI frame"
          caption="Bundled sample camera frame, before any processing."
        />
        <ImageCard
          src={`${(import.meta as any).env.BASE_URL}static-results/autopilot/undistorted.png`}
          label="Undistorted"
          caption={`cv2.undistort() with the calibration below (${data.undistort.processingTimeMs} ms).`}
        />
        <ImageCard
          src={`${(import.meta as any).env.BASE_URL}static-results/autopilot/lidar_overlay.png`}
          label="LiDAR overlay"
          caption={`velo_to_cam() + project_to_image(), ${data.lidar.pointsInFrame} of ${data.lidar.pointsGenerated} points in frame.`}
        />
      </div>

      {/* Warning banner, matching the live demo's styling */}
      {data.lidar.nearestDistanceM !== null && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
            data.lidar.warningActive ? 'bg-red-500/10 border-red-500/40' : 'bg-emerald-500/10 border-emerald-500/30'
          }`}
        >
          {data.lidar.warningActive ? (
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          ) : (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <div className="flex-1">
            <div className={`text-sm font-bold ${data.lidar.warningActive ? 'text-red-300' : 'text-emerald-300'}`}>
              {data.lidar.warningActive
                ? `WARNING: Object detected at ${data.lidar.nearestDistanceM.toFixed(1)} m`
                : `Clear: nearest object at ${data.lidar.nearestDistanceM.toFixed(1)} m`}
            </div>
            <div className="text-[10px] text-slate-400">
              Real Euclidean distance to the nearest LiDAR point projected into frame (seed={data.lidar.seed},
              threshold {data.lidar.warningThresholdM} m).
            </div>
          </div>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Undistort Time"
          value={data.undistort.processingTimeMs}
          unit="ms"
          icon={Zap}
          color="text-purple-300"
          tooltip="Wall-clock time for cv2.getOptimalNewCameraMatrix + cv2.undistort, measured server-side."
        />
        <MetricCard
          label="LiDAR Points"
          value={data.lidar.pointsGenerated}
          detail={`${data.lidar.pointsInFrame} in frame`}
          icon={Radar}
          color="text-purple-300"
          tooltip="Size of the synthetic point cloud projected through the real velo_to_cam()/project_to_image() pipeline, and how many landed inside the visible image."
        />
        <MetricCard
          label="Nearest Distance"
          value={data.lidar.nearestDistanceM?.toFixed(2) ?? 'n/a'}
          unit="m"
          icon={data.lidar.warningActive ? AlertTriangle : Radar}
          color={data.lidar.warningActive ? 'text-red-300' : 'text-purple-300'}
          tooltip="Real Euclidean distance from the LiDAR sensor frame to the closest in-frame point."
        />
        <MetricCard
          label="LiDAR Time"
          value={data.lidar.processingTimeMs}
          unit="ms"
          icon={Zap}
          color="text-purple-300"
          tooltip="Wall-clock time for the projection + overlay drawing, measured server-side."
        />
        <MetricCard
          label="Policy Inference"
          value={data.policy.inferenceTimeMs}
          unit="ms"
          icon={BrainCircuit}
          color={data.policy.modelSource === 'pretrained-sac' ? 'text-emerald-300' : 'text-amber-300'}
          detail={data.policy.modelSource === 'pretrained-sac' ? 'Pretrained SAC' : 'Heuristic fallback'}
          tooltip="Real forward-pass latency through the model that actually produced the action below."
        />
        <MetricCard
          label="Frame Size"
          value={`${data.undistort.imageWidth}×${data.undistort.imageHeight}`}
          icon={Camera}
          color="text-purple-300"
          tooltip="Actual pixel dimensions of the bundled sample frame."
        />
      </div>

      {/* Policy action */}
      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Gauge className="w-4 h-4 text-purple-400" />
          <span>Policy Action ({data.policy.modelName})</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-mono font-bold text-purple-300">{data.policy.action.steering.toFixed(3)}</div>
            <div className="text-[10px] text-slate-500 uppercase">Steering</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-purple-300">{data.policy.action.throttle.toFixed(3)}</div>
            <div className="text-[10px] text-slate-500 uppercase">Throttle</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-purple-300">{data.policy.action.brake.toFixed(3)}</div>
            <div className="text-[10px] text-slate-500 uppercase">Brake</div>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
          Example input state: speed={data.policy.inputState.speed} m/s, yaw_rate={data.policy.inputState.yawRate} rad/s,
          nearest_obstacle_dist={data.policy.inputState.nearestObstacleDist} m, lane_offset={data.policy.inputState.laneOffset} m
          -- {data.policy.note}
        </p>
      </div>

      <p className="text-xs text-slate-400 border-t border-slate-800 pt-4">
        <strong className="text-slate-300">What this demonstrates:</strong> the full computer-vision +
        control stack runs end-to-end on real code -- OpenCV lens undistortion with real KITTI-style
        calibration, a real synthetic LiDAR point cloud projected through the project's actual
        camera-projection math (with a working &lt;10m proximity warning), and a real forward pass
        through the pretrained SAC policy network. Every number above came from one real run of
        <code className="text-slate-500"> POST /api/autopilot/undistort</code>,
        <code className="text-slate-500"> /lidar-overlay</code>, and
        <code className="text-slate-500"> /predict</code> -- try the interactive demo above to run it again
        with your own parameters.
      </p>
    </div>
  );
};
