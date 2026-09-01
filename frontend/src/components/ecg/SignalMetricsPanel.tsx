import React from 'react';
import { EcgAnalysisResult } from '../../types';
import { MetricCard } from '../shared/MetricCard';
import { Timer, Gauge, Ruler, ArrowUpDown, Activity, HeartCrack } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface SignalMetricsPanelProps {
  result: EcgAnalysisResult;
}

export const SignalMetricsPanel: React.FC<SignalMetricsPanelProps> = ({ result }) => {
  const { signalMetrics: m, rPeaks } = result;
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard label={t('ecg.signalMetrics.durationLabel')} value={m.durationSeconds} unit="s" icon={Timer} color="text-rose-300" tooltip={t('ecg.signalMetrics.durationTooltip')} />
        <MetricCard label={t('ecg.signalMetrics.samplingRateLabel')} value={m.samplingRateHz} unit="Hz" icon={Gauge} color="text-rose-300" tooltip={t('ecg.signalMetrics.samplingRateTooltip')} />
        <MetricCard label={t('ecg.signalMetrics.samplesLabel')} value={m.numSamples} icon={Ruler} color="text-rose-300" />
        <MetricCard label={t('ecg.signalMetrics.amplitudeRangeLabel')} value={m.amplitudeRange} icon={ArrowUpDown} color="text-rose-300" tooltip={t('ecg.signalMetrics.amplitudeRangeTooltip', { min: m.minAmplitude, max: m.maxAmplitude, mean: m.meanAmplitude, std: m.stdAmplitude })} />
        <MetricCard
          label={t('ecg.signalMetrics.rPeaksLabel')}
          value={rPeaks.peakCount}
          icon={Activity}
          color="text-rose-300"
          tooltip={rPeaks.note}
        />
        <MetricCard
          label={t('ecg.signalMetrics.heartRateLabel')}
          value={rPeaks.heartRateBpm ?? '--'}
          unit={rPeaks.heartRateBpm !== null ? 'bpm' : undefined}
          icon={HeartCrack}
          color="text-rose-300"
          tooltip={rPeaks.heartRateBpm !== null
            ? `${rPeaks.note}${t('ecg.signalMetrics.heartRateEstimateSuffix', { count: rPeaks.peakCount })}`
            : t('ecg.signalMetrics.heartRateUnavailableTooltip')}
        />
        <MetricCard label={t('ecg.signalMetrics.preprocessingTimeLabel')} value={result.preprocessingTimeMs} unit="ms" icon={Timer} color="text-rose-300" tooltip={t('ecg.signalMetrics.preprocessingTimeTooltip')} />
        <MetricCard label={t('ecg.signalMetrics.inferenceTimeLabel')} value={result.inferenceTimeMs} unit="ms" icon={Timer} color="text-rose-300" tooltip={t('ecg.signalMetrics.inferenceTimeTooltip')} />
      </div>
      <p className="text-[10px] text-slate-500">
        {t('ecg.signalMetrics.footerNote')}
      </p>
    </div>
  );
};
