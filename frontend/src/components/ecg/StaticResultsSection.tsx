import React from 'react';
import ecgResults from '../../data/staticResults/ecgResults.json';
import { MetricCard } from '../shared/MetricCard';
import { ClipboardCheck, Target, HeartPulse, CheckCircle2, XCircle, Info } from 'lucide-react';
import { formatProbability } from '../../utils/formatProbability';
import { useTranslation } from '../../i18n/I18nContext';

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
  const { t } = useTranslation();
  const gtEntries = Object.entries(data.publicExample.groundTruthLabels).filter(
    ([name, isPositive]) => isPositive || !data.publicExample.groundTruthCorrect[name]
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-rose-400 text-xs font-mono font-semibold uppercase tracking-wider">
        <ClipboardCheck className="w-4 h-4" />
        <span>{t('ecg.staticResults.eyebrow')}</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">{t('ecg.staticResults.title')}</h2>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          {t('ecg.staticResults.descriptionPrefix')}
          <code className="text-slate-500">raspberry-pi-ecg/data/README.md</code>
          {t('ecg.staticResults.descriptionSuffix')}
        </p>
      </div>

      {/* Evaluation metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          label={t('ecg.staticResults.hammingAccuracyLabel')}
          value={`${(data.evaluation.hammingAccuracy * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip={t('ecg.staticResults.hammingAccuracyTooltip')}
        />
        <MetricCard
          label={t('ecg.staticResults.microPrecisionLabel')}
          value={`${(data.evaluation.microPrecision * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip={t('ecg.staticResults.microPrecisionTooltip')}
        />
        <MetricCard
          label={t('ecg.staticResults.microRecallLabel')}
          value={`${(data.evaluation.microRecall * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip={t('ecg.staticResults.microRecallTooltip')}
        />
        <MetricCard
          label={t('ecg.staticResults.microF1Label')}
          value={data.evaluation.microF1.toFixed(3)}
          icon={Target}
          color="text-rose-300"
          tooltip={t('ecg.staticResults.microF1Tooltip')}
        />
        <MetricCard
          label={t('ecg.staticResults.subsetAccuracyLabel')}
          value={`${(data.evaluation.subsetAccuracy * 100).toFixed(1)}%`}
          icon={Target}
          color="text-rose-300"
          tooltip={t('ecg.staticResults.subsetAccuracyTooltip')}
        />
      </div>

      {/* Confusion matrix */}
      <div>
        <h3 className="text-sm font-bold text-slate-100 mb-2">
          {t('ecg.staticResults.confusionMatrixHeading', { count: data.evaluation.numSamples })}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-[11px] text-slate-300 min-w-[560px]">
            <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">{t('ecg.staticResults.tableClassHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableSupportHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableTpHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableFpHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableFnHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableTnHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tablePrecisionHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableRecallHeader')}</th>
                <th className="py-2 px-3">{t('ecg.staticResults.tableF1Header')}</th>
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
              {t('ecg.staticResults.notableClassesNote', {
                remaining: data.evaluation.perClass.length - notableClasses.length,
                total: data.evaluation.numClasses,
              })}
            </span>
          </p>
        )}
      </div>

      {/* Example prediction */}
      <div className="max-w-md">
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <HeartPulse className="w-4 h-4 text-rose-400" />
            <span>{t('ecg.staticResults.examplePredictionHeading')}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 font-mono uppercase">{t('ecg.staticResults.topClassificationLabel')}</div>
              <div className="text-base font-bold text-rose-300">{data.publicExample.topLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold font-mono text-rose-400">
                {formatProbability(data.publicExample.topProbability)}
              </div>
              <div className="text-[10px] text-slate-500">{t('ecg.staticResults.rawProbabilityLabel')}</div>
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
                  <span className="text-slate-500">({isPositive ? t('ecg.staticResults.trueLabel') : t('ecg.staticResults.falseLabel')})</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
            {t('ecg.staticResults.groundTruthCaption', {
              peakCount: data.publicExample.rPeaks.peakCount,
              bpm: data.publicExample.rPeaks.heartRateBpm?.toFixed(1) ?? '--',
              ms: data.publicExample.inferenceTimeMs,
            })}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 border-t border-slate-800 pt-4">
        <strong className="text-slate-300">{t('ecg.staticResults.demonstratesLabel')}</strong>
        {t('ecg.staticResults.demonstratesBodyPrefix')}
        <code className="text-slate-500">raspberry-pi-ecg/data/README.md</code>
        {t('ecg.staticResults.demonstratesBodyMiddle')}
        <code className="text-slate-500">POST /api/ecg/demo</code>
        {t('ecg.staticResults.demonstratesBodyMiddle2')}
        <code className="text-slate-500">/evaluate-bundled</code>
        {t('ecg.staticResults.demonstratesBodySuffix')}
      </p>
    </div>
  );
};
