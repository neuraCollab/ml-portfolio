import React, { useState } from 'react';
import { EcgEvaluationResult } from '../../types';
import { evaluateEcgDataset, evaluateEcgBundledDataset, ApiError } from '../../api/client';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { MetricCard } from '../shared/MetricCard';
import { FlaskConical, Upload, Target, Database } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export const EvaluationPanel: React.FC = () => {
  const { t } = useTranslation();
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
      setError(err instanceof ApiError ? err.message : t('ecg.evaluation.datasetErrorFallback'));
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
      setError(err instanceof ApiError ? err.message : t('ecg.evaluation.bundledDatasetErrorFallback'));
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
            {t('ecg.evaluation.bundledDatasetDescription')}
          </p>
        </div>
      </div>

      <button
        onClick={handleRunBundled}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium rounded-xl transition"
      >
        <Database className="w-3.5 h-3.5" />
        <span>{t('ecg.evaluation.runBundledButton')}</span>
      </button>

      <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-3">
        <Target className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p>
            {t('ecg.evaluation.uploadPrefix')}<span className="font-mono text-slate-300">.npz</span>{t('ecg.evaluation.uploadArraysConnector')}
            <span className="font-mono text-slate-300">X</span>{t('ecg.evaluation.uploadShapeConnector')}<span className="font-mono">(N, 1000, 6)</span>{t('ecg.evaluation.uploadShapeOrConnector')}
            <span className="font-mono">(N, 6, 1000)</span>{t('ecg.evaluation.uploadRawSignalsConnector')}
            <span className="font-mono text-slate-300">y</span>{t('ecg.evaluation.uploadShapeConnector')}<span className="font-mono">(N, 19)</span>{t('ecg.evaluation.uploadGroundTruthSuffix')}
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
          <span>{t('ecg.evaluation.evaluateButton')}</span>
        </button>
      </div>

      {loading && <LoadingState title={t('ecg.evaluation.runningDatasetLoadingTitle')} detail={t('ecg.evaluation.runningDatasetLoadingDetail')} accent="indigo" />}
      {error && <ErrorState message={error} compact />}

      {result && (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
            {t('ecg.evaluation.coverageNote', { evaluated: result.numEvaluatedClasses, total: result.numClasses })}
          </p>

          {/* Macro/Micro F1 first and larger -- these are the primary quality
              signal, not Hamming accuracy (misleadingly high on a 19-way
              multi-label problem where most labels are true-negative). */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label={t('ecg.evaluation.macroF1Label')}
              value={result.macroF1.toFixed(3)}
              icon={Target}
              color="text-rose-300"
              tooltip={t('ecg.evaluation.macroF1Tooltip')}
            />
            <MetricCard
              label={t('ecg.evaluation.microF1Label')}
              value={result.microF1.toFixed(3)}
              icon={Target}
              color="text-rose-300"
              tooltip={t('ecg.evaluation.microF1Tooltip')}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label={t('ecg.evaluation.macroPrecisionLabel')} value={result.macroPrecision.toFixed(3)} icon={Target} color="text-rose-300" tooltip={t('ecg.evaluation.macroPrecisionTooltip')} />
            <MetricCard label={t('ecg.evaluation.macroRecallLabel')} value={result.macroRecall.toFixed(3)} icon={Target} color="text-rose-300" tooltip={t('ecg.evaluation.macroRecallTooltip')} />
            <MetricCard label={t('ecg.evaluation.microPrecisionLabel')} value={`${(result.microPrecision * 100).toFixed(1)}%`} icon={Target} color="text-rose-300" tooltip={t('ecg.evaluation.microPrecisionTooltip')} />
            <MetricCard label={t('ecg.evaluation.microRecallLabel')} value={`${(result.microRecall * 100).toFixed(1)}%`} icon={Target} color="text-rose-300" tooltip={t('ecg.evaluation.microRecallTooltip')} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label={t('ecg.evaluation.prAucMacroLabel')}
              value={result.prAucMacro != null ? result.prAucMacro.toFixed(3) : t('common.shared.notAvailable')}
              icon={Target}
              color="text-indigo-300"
              tooltip={t('ecg.evaluation.prAucMacroTooltip')}
            />
            <MetricCard
              label={t('ecg.evaluation.prAucMicroLabel')}
              value={result.prAucMicro != null ? result.prAucMicro.toFixed(3) : t('common.shared.notAvailable')}
              icon={Target}
              color="text-indigo-300"
              tooltip={t('ecg.evaluation.prAucMicroTooltip')}
            />
            {/* Subset/Hamming shown last, muted -- secondary indicators, not
                the headline quality metric on this multi-label problem. */}
            <MetricCard
              label={t('ecg.evaluation.subsetAccuracyLabel')}
              value={`${(result.subsetAccuracy * 100).toFixed(1)}%`}
              icon={FlaskConical}
              color="text-slate-400"
              tooltip={t('ecg.evaluation.subsetAccuracyTooltip')}
            />
            <MetricCard
              label={t('ecg.evaluation.hammingAccuracyLabel')}
              value={`${(result.hammingAccuracy * 100).toFixed(1)}%`}
              icon={FlaskConical}
              color="text-slate-400"
              tooltip={t('ecg.evaluation.hammingAccuracyTooltip')}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-[11px] text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableClassHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableSupportHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableTpHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableFpHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableFnHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableTnHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tablePrecisionHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableRecallHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableF1Header')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tablePrAucHeader')}</th>
                  <th className="py-2 px-3">{t('ecg.evaluation.tableThresholdHeader')}</th>
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
                    <td className="py-1.5 px-3">{c.precision != null ? c.precision.toFixed(2) : t('common.shared.notAvailable')}</td>
                    <td className="py-1.5 px-3">{c.recall != null ? c.recall.toFixed(2) : t('common.shared.notAvailable')}</td>
                    <td className="py-1.5 px-3">{c.f1 != null ? c.f1.toFixed(2) : t('common.shared.notAvailable')}</td>
                    <td className="py-1.5 px-3">{c.prAuc != null ? c.prAuc.toFixed(2) : t('common.shared.notAvailable')}</td>
                    <td className="py-1.5 px-3">{c.threshold.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-slate-500">{result.thresholdCalibrationNote}</p>
          <p className="text-[10px] text-slate-500">{result.note}</p>
        </div>
      )}
    </div>
  );
};
