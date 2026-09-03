import React, { useState } from 'react';
import { EcgEvaluationResult } from '../../types';
import { evaluateEcgBundledDataset, ApiError } from '../../api/client';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { MetricCard } from '../shared/MetricCard';
import { GitCompare, Target, Brain } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

/** Self-contained -- calls evaluate-bundled independently of the Model
 * section's own EvaluationPanel (its own local state, its own request), so
 * this can render standalone in the Baseline section without touching that
 * component's existing wiring. Computes a trivial "always predict absent"
 * baseline's Hamming accuracy directly from the real per-class support
 * counts already returned by the same real endpoint -- no backend change,
 * no fabricated numbers. */
export const BaselineComparisonPanel: React.FC = () => {
  const { t } = useTranslation();
  const [result, setResult] = useState<EcgEvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await evaluateEcgBundledDataset());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ecg.baselineSection.errorFallback'));
    } finally {
      setLoading(false);
    }
  };

  const baselineHamming = result
    ? result.perClass.reduce((sum, c) => sum + (result.numSamples - c.support), 0) / (result.numSamples * result.numClasses)
    : null;

  return (
    <div className="space-y-4">
      <button
        onClick={handleRun}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition"
      >
        <GitCompare className="w-3.5 h-3.5" />
        <span>{loading ? t('ecg.baselineSection.runningLabel') : t('ecg.baselineSection.runButton')}</span>
      </button>

      {loading && <LoadingState title={t('ecg.baselineSection.runningLabel')} accent="indigo" />}
      {error && <ErrorState message={error} compact />}

      {result && baselineHamming !== null && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('ecg.baselineSection.baselineCardTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label={t('ecg.baselineSection.hammingLabel')} value={`${(baselineHamming * 100).toFixed(1)}%`} icon={Target} color="text-slate-400" />
                <MetricCard label={t('ecg.baselineSection.microF1Label')} value="0.000" icon={Target} color="text-slate-400" />
              </div>
            </div>
            <div className="bg-slate-950/60 border border-rose-500/20 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wide">{t('ecg.baselineSection.modelCardTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label={t('ecg.baselineSection.hammingLabel')} value={`${(result.hammingAccuracy * 100).toFixed(1)}%`} icon={Brain} color="text-rose-300" />
                <MetricCard label={t('ecg.baselineSection.microF1Label')} value={result.microF1.toFixed(3)} icon={Brain} color="text-rose-300" />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">{t('ecg.baselineSection.sourceNote')}</p>
        </div>
      )}
    </div>
  );
};
