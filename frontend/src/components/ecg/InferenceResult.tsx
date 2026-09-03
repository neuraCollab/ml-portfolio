import React from 'react';
import { EcgAnalysisResult } from '../../types';
import { BrainCircuit, HelpCircle, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { ProbabilityBarChart } from './ProbabilityBarChart';
import { formatProbability } from '../../utils/formatProbability';
import { useTranslation } from '../../i18n/I18nContext';

interface InferenceResultProps {
  result: EcgAnalysisResult;
}

export const InferenceResult: React.FC<InferenceResultProps> = ({ result }) => {
  const { t } = useTranslation();
  const isPoorSignal = result.signalQuality?.status === 'POOR';
  return (
    <div className="space-y-4">
      {isPoorSignal && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('ecg.inferenceResult.abstentionWarning')}</span>
        </div>
      )}

      <div className={`p-4 rounded-xl bg-slate-950 border flex items-center justify-between ${isPoorSignal ? 'border-red-500/30 opacity-70' : 'border-slate-800'}`}>
        <div>
          <div className="text-[11px] text-slate-500 font-mono uppercase">{t('ecg.inferenceResult.topClassificationLabel')}</div>
          <div className="text-lg font-bold text-rose-300">{result.topLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono text-rose-400">{formatProbability(result.topProbability)}</div>
          <div className="text-[10px] text-slate-500">{t('ecg.inferenceResult.rawProbabilityLabel')}</div>
        </div>
      </div>

      {!result.groundTruthAvailable && (
        <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
          <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{t('ecg.inferenceResult.groundTruthUnavailableNote')}</span>
        </div>
      )}

      {result.groundTruthAvailable && result.groundTruthLabels && result.groundTruthCorrect && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
          <div className="text-[11px] text-slate-400 font-mono uppercase">{t('ecg.inferenceResult.groundTruthComparisonHeading')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Object.entries(result.groundTruthLabels)
              .filter(([name, isPositive]) => isPositive || !result.groundTruthCorrect?.[name])
              .map(([name, isPositive]) => {
                const correct = result.groundTruthCorrect![name];
                return (
                  <div key={name} className="flex items-center gap-1.5 text-xs">
                    {correct ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="text-slate-300 font-mono truncate">{name}</span>
                    <span className="text-slate-500">({isPositive ? t('ecg.inferenceResult.trueLabel') : t('ecg.inferenceResult.falseLabel')})</span>
                  </div>
                );
              })}
          </div>
          <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
            {t('ecg.inferenceResult.groundTruthLegendNote')}
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mb-2">
          <BrainCircuit className="w-3.5 h-3.5 text-rose-400" />
          <span>{t('ecg.inferenceResult.classProbabilitiesLabel')}</span>
        </div>
        <ProbabilityBarChart predictions={result.predictions} />
      </div>

      <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3">{result.note}</p>
    </div>
  );
};
