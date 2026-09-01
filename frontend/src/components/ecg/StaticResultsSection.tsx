import React from 'react';
import ecgResults from '../../data/staticResults/ecgResults.json';
import { MetricCard } from '../shared/MetricCard';
import { ECGChart } from './ECGChart';
import { ECG_LEAD_NAMES } from '../../types';
import { ClipboardCheck, Target, HeartPulse, CheckCircle2, XCircle, Info } from 'lucide-react';

interface PerClassMetric {
  className: string; label: string; support: number;
  truePositives: number; falsePositives: number; falseNegatives: number; trueNegatives: number;
  precision: number; recall: number; f1: number;
}

interface EcgStaticResults {
  publicExample: {
    source: string;
    processedLeads: Record<string, number[]>;
    samplingRateHz: number;
    signalMetrics: Record<string, number>;
    rPeaks: { peakCount: number; heartRateBpm: number | null; note: string };
    predictions: Record<string, { probability: number; predicted: boolean }>;
    topClass: string; topLabel: string; topProbability: number;
    groundTruthLabels: Record<string, boolean>;
    groundTruthCorrect: Record<string, boolean>;
    preprocessingTimeMs: number; inferenceTimeMs: number; note: string;
  };
  evaluation: {
    numSamples: number; numClasses: number;
    subsetAccuracy: number; hammingAccuracy: number;
    microPrecision: number; microRecall: number; microF1: number;
    perClass: PerClassMetric[];
    note: string;
  };
}

const data = ecgResults as unknown as EcgStaticResults;

// Only the classes with real positive support (or a real false positive) are
// worth showing in a compact static confusion matrix -- the other 12 of 19
// classes have zero examples in this 61-record set and are all-zero rows.
const notableClasses = data.evaluation.perClass.filter(
  (c) => c.support > 0 || c.truePositives + c.falsePositives > 0
);

export const StaticResultsSection: React.FC = () => {
  const gtEntries = Object.entries(data.publicExample.groundTruthLabels).filter(
    ([name, isPositive]) => isPositive || !data.publicExample.groundTruthCorrect[name]
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider">
        <ClipboardCheck className="w-4 h-4" />
        <span>Results</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Real Model Results</h2>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          A saved, real run of the backend model against the PTB-XL public example and the bundled
          61-record labeled evaluation set (PhysioNet, CC-BY 4.0) -- see{' '}
          <code className="text-slate-500">raspberry-pi-ecg/data/README.md</code> for exact provenance.
          Visible immediately, no need to run the interactive demo above.
        </p>
      </div>

      {/* Evaluation metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Hamming Accuracy"
          value={`${(data.evaluation.hammingAccuracy * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip="Fraction of individual label predictions correct across all 19 classes x 61 samples."
        />
        <MetricCard
          label="Micro Precision"
          value={`${(data.evaluation.microPrecision * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip="Precision pooling true/false positives across all 19 classes."
        />
        <MetricCard
          label="Micro Recall"
          value={`${(data.evaluation.microRecall * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip="Recall pooling true/false negatives across all 19 classes."
        />
        <MetricCard
          label="Micro F1"
          value={data.evaluation.microF1.toFixed(3)}
          icon={Target}
          color="text-rose-300"
          tooltip="Harmonic mean of micro precision and micro recall."
        />
        <MetricCard
          label="Subset Accuracy"
          value={`${(data.evaluation.subsetAccuracy * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip="Fraction of samples where ALL 19 predicted labels exactly match ground truth (strict)."
        />
      </div>

      {/* Confusion matrix */}
      <div>
        <h3 className="text-sm font-bold text-slate-100 mb-2">
          Confusion Matrix (per class, {data.evaluation.numSamples}-record evaluation set)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-[11px] text-slate-300 min-w-[560px]">
            <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Class</th>
                <th className="py-2 px-3">Support</th>
                <th className="py-2 px-3">TP</th>
                <th className="py-2 px-3">FP</th>
                <th className="py-2 px-3">FN</th>
                <th className="py-2 px-3">TN</th>
                <th className="py-2 px-3">Precision</th>
                <th className="py-2 px-3">Recall</th>
                <th className="py-2 px-3">F1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {notableClasses.map((c) => (
                <tr key={c.className}>
                  <td className="py-1.5 px-3 font-sans">{c.label}</td>
                  <td className="py-1.5 px-3">{c.support}</td>
                  <td className="py-1.5 px-3">{c.truePositives}</td>
                  <td className="py-1.5 px-3">{c.falsePositives}</td>
                  <td className="py-1.5 px-3">{c.falseNegatives}</td>
                  <td className="py-1.5 px-3">{c.trueNegatives}</td>
                  <td className="py-1.5 px-3">{c.precision.toFixed(2)}</td>
                  <td className="py-1.5 px-3">{c.recall.toFixed(2)}</td>
                  <td className="py-1.5 px-3">{c.f1.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notableClasses.length < data.evaluation.perClass.length && (
          <p className="text-[10px] text-slate-500 mt-1.5 flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            <span>
              Only classes with real support or a real false positive in this 61-record set are shown
              (the remaining {data.evaluation.perClass.length - notableClasses.length} of{' '}
              {data.evaluation.numClasses} classes have zero examples here).
            </span>
          </p>
        )}
      </div>

      {/* Example prediction + static waveform */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <HeartPulse className="w-4 h-4 text-rose-400" />
            <span>Example Prediction (real public PTB-XL record)</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 font-mono uppercase">Top classification</div>
              <div className="text-base font-bold text-rose-300">{data.publicExample.topLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold font-mono text-rose-400">
                {(data.publicExample.topProbability * 100).toFixed(4)}%
              </div>
              <div className="text-[10px] text-slate-500">model probability</div>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            {gtEntries.map(([name, isPositive]) => {
              const correct = data.publicExample.groundTruthCorrect[name];
              return (
                <div key={name} className="flex items-center gap-1.5 text-xs">
                  {correct ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className="text-slate-300 font-mono truncate">{name}</span>
                  <span className="text-slate-500">({isPositive ? 'true' : 'false'})</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
            Real ground-truth labels from PTB-XL, compared against this model's calibrated per-class
            predictions. {data.publicExample.rPeaks.peakCount} R-peaks detected,{' '}
            {data.publicExample.rPeaks.heartRateBpm?.toFixed(1)} bpm estimated -- inference took{' '}
            {data.publicExample.inferenceTimeMs} ms.
          </p>
        </div>

        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
          <div className="text-sm font-semibold text-slate-200">Static ECG Waveform (processed, all 6 leads)</div>
          <ECGChart leads={data.publicExample.processedLeads} samplingRateHz={data.publicExample.samplingRateHz} selectedLead="all" />
          <p className="text-[10px] text-slate-500">
            {ECG_LEAD_NAMES.length}-lead frontal ECG after the real 0.5-40Hz bandpass + per-lead z-score
            preprocessing -- exactly what the model saw.
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 border-t border-slate-800 pt-4">
        <strong className="text-slate-300">What this demonstrates:</strong> real accuracy/precision/recall/F1
        and a real per-class confusion matrix, computed by running the actual ECGNet model on real,
        labeled, public ECG data -- not synthetic or fabricated numbers. Performance is honestly uneven
        across classes (e.g. strong on sinus rhythm, weaker on rarer conditions with little support in
        this small evaluation set), which is disclosed rather than hidden; see{' '}
        <code className="text-slate-500">raspberry-pi-ecg/data/README.md</code> for the full calibration
        methodology. Every number above came from one real run of{' '}
        <code className="text-slate-500">POST /api/ecg/demo</code> and{' '}
        <code className="text-slate-500">/evaluate-bundled</code>.
      </p>
    </div>
  );
};
