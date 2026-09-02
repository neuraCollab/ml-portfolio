// frontend/src/components/cassandragrpc/StaticResultsSection.tsx
import React from 'react';
import cassandraGrpcResults from '../../data/staticResults/cassandraGrpcResults.json';
import { MetricCard } from '../shared/MetricCard';
import { ConfusionMatrixTable } from './ConfusionMatrixTable';
import { ClipboardCheck, Target } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface StaticResults {
  available: boolean;
  datasetSize?: number;
  modelType?: string;
  trainingTimeSeconds?: number;
  grpcRoundtripMs?: number;
  accuracy?: number;
  macroPrecision?: number;
  macroRecall?: number;
  macroF1?: number;
  topClasses?: { topicId: number; topicName: string; support: number }[];
  confusionMatrix?: { trueTopicId: number; predictedTopicId: number; count: number }[];
  examplePrediction?: { inputText: string; topicName: string; confidence: number };
  note: string;
}

const data = cassandraGrpcResults as unknown as StaticResults;

export const StaticResultsSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
        <ClipboardCheck className="w-4 h-4" />
        <span>{t('cassandraGrpc.staticResults.eyebrow')}</span>
      </div>
      <h2 className="text-xl font-bold text-white tracking-tight">{t('cassandraGrpc.staticResults.title')}</h2>
      <p className="text-xs text-slate-400 max-w-3xl">{t('cassandraGrpc.staticResults.distributedNote')}</p>

      {!data.available ? (
        <p className="text-sm text-slate-500">
          {t('cassandraGrpc.staticResults.notAvailablePrefix')}{' '}
          <code className="text-slate-400">backend/scripts/generate_static_results.py</code>{' '}
          {t('cassandraGrpc.staticResults.notAvailableSuffix')} {data.note}
        </p>
      ) : (
        <>
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">{t('cassandraGrpc.staticResults.workloadIdentityHeading')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard label={t('cassandraGrpc.staticResults.datasetSizeLabel')} value={data.datasetSize!.toLocaleString()} icon={Target} color="text-cyan-300" />
              <MetricCard label={t('cassandraGrpc.staticResults.modelLabel')} value={data.modelType!} icon={Target} color="text-cyan-300" />
              <MetricCard
                label={t('cassandraGrpc.staticResults.trainingTimeLabel')}
                value={`${data.trainingTimeSeconds!.toFixed(1)}s @ ${data.datasetSize!.toLocaleString()} rows`}
                icon={Target}
                color="text-cyan-300"
              />
              <MetricCard label={t('cassandraGrpc.staticResults.grpcRoundtripLabel')} value={`${data.grpcRoundtripMs!.toFixed(1)}ms`} icon={Target} color="text-cyan-300" />
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{t('cassandraGrpc.staticResults.workloadQualityHeading')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 opacity-80">
              <MetricCard label={t('cassandraGrpc.staticResults.accuracyLabel')} value={`${(data.accuracy! * 100).toFixed(1)}%`} icon={Target} color="text-slate-300" />
              <MetricCard label={t('cassandraGrpc.staticResults.macroPrecisionLabel')} value={data.macroPrecision!.toFixed(3)} icon={Target} color="text-slate-300" />
              <MetricCard label={t('cassandraGrpc.staticResults.macroRecallLabel')} value={data.macroRecall!.toFixed(3)} icon={Target} color="text-slate-300" />
              <MetricCard label={t('cassandraGrpc.staticResults.macroF1Label')} value={data.macroF1!.toFixed(3)} icon={Target} color="text-slate-300" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-100 mb-2">{t('cassandraGrpc.staticResults.confusionMatrixHeading')}</h3>
            <ConfusionMatrixTable topClasses={data.topClasses!} confusionMatrix={data.confusionMatrix!} />
          </div>
          {data.examplePrediction && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
              <div className="text-[10px] text-slate-500 font-mono uppercase">{t('cassandraGrpc.staticResults.examplePredictionLabel')}</div>
              <p className="text-sm text-slate-300 italic">"{data.examplePrediction.inputText}"</p>
              <p className="text-sm text-cyan-300 font-bold mt-1">
                {data.examplePrediction.topicName} ({(data.examplePrediction.confidence * 100).toFixed(1)}%)
              </p>
            </div>
          )}
          <p className="text-xs text-slate-400 border-t border-slate-800 pt-4">{data.note}</p>
        </>
      )}
    </div>
  );
};
