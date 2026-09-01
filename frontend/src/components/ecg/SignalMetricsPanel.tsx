import React from 'react';
import { EcgAnalysisResult } from '../../types';
import { MetricCard } from '../shared/MetricCard';
import { Timer, Gauge, Ruler, ArrowUpDown, Activity, HeartCrack } from 'lucide-react';

interface SignalMetricsPanelProps {
  result: EcgAnalysisResult;
}

export const SignalMetricsPanel: React.FC<SignalMetricsPanelProps> = ({ result }) => {
  const { signalMetrics: m, rPeaks } = result;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard label="Duration" value={m.durationSeconds} unit="s" icon={Timer} color="text-rose-300" tooltip="numSamples / samplingRateHz" />
        <MetricCard label="Sampling Rate" value={m.samplingRateHz} unit="Hz" icon={Gauge} color="text-rose-300" tooltip="Fixed by the original project's ADC read rate (see rp/main.py)." />
        <MetricCard label="Samples" value={m.numSamples} icon={Ruler} color="text-rose-300" />
        <MetricCard label="Amplitude Range" value={m.amplitudeRange} icon={ArrowUpDown} color="text-rose-300" tooltip={`min ${m.minAmplitude} / max ${m.maxAmplitude} / mean ${m.meanAmplitude} / std ${m.stdAmplitude}, computed across all 6 raw leads.`} />
        <MetricCard
          label="R-Peaks Detected"
          value={rPeaks.peakCount}
          icon={Activity}
          color="text-rose-300"
          tooltip={rPeaks.note}
        />
        <MetricCard
          label="Est. Heart Rate"
          value={rPeaks.heartRateBpm ?? '--'}
          unit={rPeaks.heartRateBpm !== null ? 'bpm' : undefined}
          icon={HeartCrack}
          color="text-rose-300"
          tooltip={rPeaks.heartRateBpm !== null
            ? `${rPeaks.note} Estimated as 60 / mean R-R interval from ${rPeaks.peakCount} detected peaks.`
            : 'Fewer than 2 R-peaks were detected on this signal, so no rate can be computed.'}
        />
        <MetricCard label="Preprocessing Time" value={result.preprocessingTimeMs} unit="ms" icon={Timer} color="text-rose-300" tooltip="Bandpass filter + z-score + R-peak detection, measured server-side." />
        <MetricCard label="Inference Time" value={result.inferenceTimeMs} unit="ms" icon={Timer} color="text-rose-300" tooltip="ECGNet forward pass on CPU, measured server-side." />
      </div>
      <p className="text-[10px] text-slate-500">
        "Signal metrics" above are computed directly from the actual waveform (amplitude stats, R-peak
        detection). They are separate from the model's classification below -- a valid signal can still
        get a low-confidence or "no significant pattern" prediction.
      </p>
    </div>
  );
};
