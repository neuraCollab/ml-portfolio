import React from 'react';
import autopilotResults from '../../data/staticResults/autopilotResults.json';
import { MetricCard } from '../shared/MetricCard';
import { useTranslation } from '../../i18n/I18nContext';
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
  const { t } = useTranslation();
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-purple-400 text-xs font-mono font-semibold uppercase tracking-wider">
        <ClipboardCheck className="w-4 h-4" />
        <span>{t('autopilot.staticResults.eyebrow')}</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">{t('autopilot.staticResults.title')}</h2>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          {t('autopilot.staticResults.description')}
        </p>
      </div>

      {/* Static visual examples -- BASE_URL-prefixed so these still resolve
          when served from a GitHub Pages subpath (see vite.config.ts). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ImageCard
          src={`${(import.meta as any).env.BASE_URL}static-results/autopilot/original.png`}
          label={t('autopilot.staticResults.originalFrameLabel')}
          caption={t('autopilot.staticResults.originalFrameCaption')}
        />
        <ImageCard
          src={`${(import.meta as any).env.BASE_URL}static-results/autopilot/undistorted.png`}
          label={t('autopilot.staticResults.undistortedLabel')}
          caption={t('autopilot.staticResults.undistortedCaption', { ms: data.undistort.processingTimeMs })}
        />
        <ImageCard
          src={`${(import.meta as any).env.BASE_URL}static-results/autopilot/lidar_overlay.png`}
          label={t('autopilot.staticResults.lidarOverlayLabel')}
          caption={t('autopilot.staticResults.lidarOverlayCaption', { inFrame: data.lidar.pointsInFrame, generated: data.lidar.pointsGenerated })}
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
                ? t('autopilot.warnings.objectDetected', { distance: data.lidar.nearestDistanceM.toFixed(1) })
                : t('autopilot.warnings.clear', { distance: data.lidar.nearestDistanceM.toFixed(1) })}
            </div>
            <div className="text-[10px] text-slate-400">
              {t('autopilot.staticResults.warningDescription', { seed: data.lidar.seed, threshold: data.lidar.warningThresholdM })}
            </div>
          </div>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label={t('autopilot.metrics.undistortTimeLabel')}
          value={data.undistort.processingTimeMs}
          unit="ms"
          icon={Zap}
          color="text-purple-300"
          tooltip={t('autopilot.metrics.undistortTimeTooltipStatic')}
        />
        <MetricCard
          label={t('autopilot.metrics.lidarPointsLabel')}
          value={data.lidar.pointsGenerated}
          detail={t('autopilot.metrics.lidarPointsDetail', { count: data.lidar.pointsInFrame })}
          icon={Radar}
          color="text-purple-300"
          tooltip={t('autopilot.metrics.lidarPointsTooltip')}
        />
        <MetricCard
          label={t('autopilot.metrics.nearestDistanceLabel')}
          value={data.lidar.nearestDistanceM?.toFixed(2) ?? 'n/a'}
          unit="m"
          icon={data.lidar.warningActive ? AlertTriangle : Radar}
          color={data.lidar.warningActive ? 'text-red-300' : 'text-purple-300'}
          tooltip={t('autopilot.metrics.nearestDistanceTooltipStatic')}
        />
        <MetricCard
          label={t('autopilot.metrics.lidarTimeLabel')}
          value={data.lidar.processingTimeMs}
          unit="ms"
          icon={Zap}
          color="text-purple-300"
          tooltip={t('autopilot.metrics.lidarTimeTooltip')}
        />
        <MetricCard
          label={t('autopilot.metrics.policyInferenceLabel')}
          value={data.policy.inferenceTimeMs}
          unit="ms"
          icon={BrainCircuit}
          color={data.policy.modelSource === 'pretrained-sac' ? 'text-emerald-300' : 'text-amber-300'}
          detail={data.policy.modelSource === 'pretrained-sac' ? t('autopilot.metrics.policyInferenceDetailPretrained') : t('autopilot.metrics.policyInferenceDetailHeuristic')}
          tooltip={t('autopilot.metrics.policyInferenceTooltip')}
        />
        <MetricCard
          label={t('autopilot.metrics.frameSizeLabel')}
          value={`${data.undistort.imageWidth}×${data.undistort.imageHeight}`}
          icon={Camera}
          color="text-purple-300"
          tooltip={t('autopilot.metrics.frameSizeTooltip')}
        />
      </div>

      {/* Policy action */}
      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Gauge className="w-4 h-4 text-purple-400" />
          <span>{t('autopilot.staticResults.policyActionHeading', { modelName: data.policy.modelName })}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-mono font-bold text-purple-300">{data.policy.action.steering.toFixed(3)}</div>
            <div className="text-[10px] text-slate-500 uppercase">{t('autopilot.actionLabels.steering')}</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-purple-300">{data.policy.action.throttle.toFixed(3)}</div>
            <div className="text-[10px] text-slate-500 uppercase">{t('autopilot.actionLabels.throttle')}</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-purple-300">{data.policy.action.brake.toFixed(3)}</div>
            <div className="text-[10px] text-slate-500 uppercase">{t('autopilot.actionLabels.brake')}</div>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
          {t('autopilot.staticResults.inputStateCaption', {
            speed: data.policy.inputState.speed,
            yawRate: data.policy.inputState.yawRate,
            dist: data.policy.inputState.nearestObstacleDist,
            offset: data.policy.inputState.laneOffset,
            note: data.policy.note,
          })}
        </p>
      </div>

      <p className="text-xs text-slate-400 border-t border-slate-800 pt-4">
        <strong className="text-slate-300">{t('autopilot.staticResults.demonstratesLabel')}</strong>
        {t('autopilot.staticResults.demonstratesBodyPrefix')}
        <code className="text-slate-500"> POST /api/autopilot/undistort</code>,
        <code className="text-slate-500"> /lidar-overlay</code>{t('autopilot.staticResults.demonstratesBodyMiddle')}
        <code className="text-slate-500"> /predict</code>{t('autopilot.staticResults.demonstratesBodySuffix')}
      </p>
    </div>
  );
};
