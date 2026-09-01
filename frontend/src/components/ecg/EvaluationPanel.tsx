import React, { useState } from 'react';
import { EcgEvaluationResult } from '../../types';
import { evaluateEcgDataset, evaluateEcgBundledDataset, ApiError } from '../../api/client';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { MetricCard } from '../shared/MetricCard';
import { FlaskConical, Upload, Target, Database } from 'lucide-react';

export const EvaluationPanel: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EcgEvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await evaluateEcgDataset(file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Dataset evaluation request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunBundled = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await evaluateEcgBundledDataset());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bundled dataset evaluation request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-3">
        <Database className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p>
            Evaluate against a bundled real, labeled dataset: 61 real PTB-XL records (PhysioNet,
            CC-BY 4.0) with real ground-truth labels -- see{' '}
            <span className="font-mono text-slate-300">raspberry-pi-ecg/data/README.md</span>.
          </p>
        </div>
      </div>

      <button
        onClick={handleRunBundled}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition"
      >
        <Database className="w-3.5 h-3.5" />
        <span>Evaluate on bundled PTB-XL dataset (61 records)</span>
      </button>

      <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-3">
        <Target className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p>
            Or upload your own <span className="font-mono text-slate-300">.npz</span> file with arrays{' '}
            <span className="font-mono text-slate-300">X</span> (shape <span className="font-mono">(N, 1000, 6)</span> or{' '}
            <span className="font-mono">(N, 6, 1000)</span>, raw signals) and{' '}
            <span className="font-mono text-slate-300">y</span> (shape <span className="font-mono">(N, 19)</span>, binary
            multi-label ground truth) to compute the same metrics on a different dataset.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".npz"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="flex-1 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs hover:file:bg-slate-700"
        />
        <button
          onClick={handleRun}
          disabled={!file || loading}
          className="flex items-center gap-1.5 py-2 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Evaluate</span>
        </button>
      </div>

      {loading && <LoadingState title="Running model on dataset..." detail="Preprocessing + inference on every sample, then computing metrics" accent="indigo" />}
      {error && <ErrorState message={error} compact />}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label="Samples" value={result.numSamples} icon={FlaskConical} color="text-rose-300" />
            <MetricCard
              label="Subset Accuracy"
              value={`${(result.subsetAccuracy * 100).toFixed(1)}%`}
              icon={Target}
              color="text-rose-300"
              tooltip="Fraction of samples where ALL 19 predicted labels exactly match the ground truth (strict, multi-label exact-match accuracy)."
            />
            <MetricCard
              label="Hamming Accuracy"
              value={`${(result.hammingAccuracy * 100).toFixed(1)}%`}
              icon={Target}
              color="text-rose-300"
              tooltip="Fraction of individual label predictions (across all samples x classes) that were correct -- more lenient than subset accuracy."
            />
            <MetricCard
              label="Micro Precision"
              value={`${(result.microPrecision * 100).toFixed(1)}%`}
              icon={Target}
              color="text-rose-300"
              tooltip="Precision computed by pooling true/false positives across all 19 classes (scikit-learn precision_recall_fscore_support, average='micro')."
            />
            <MetricCard
              label="Micro Recall"
              value={`${(result.microRecall * 100).toFixed(1)}%`}
              icon={Target}
              color="text-rose-300"
              tooltip="Recall computed by pooling true/false negatives across all 19 classes."
            />
            <MetricCard
              label="Micro F1"
              value={result.microF1.toFixed(3)}
              icon={Target}
              color="text-rose-300"
              tooltip="Harmonic mean of micro precision and micro recall."
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-[11px] text-slate-300">
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
                {result.perClass.map((c) => (
                  <tr key={c.className} className={c.support === 0 ? 'text-slate-600' : ''}>
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

          <p className="text-[10px] text-slate-500">{result.note}</p>
        </div>
      )}
    </div>
  );
};
