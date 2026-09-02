// frontend/src/components/cassandragrpc/DatasetPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcDatasetInfo } from '../../types';
import { getCassandraGrpcDatasetInfo } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { Database, Layers, ListTree } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export const DatasetPanel: React.FC = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<CassandraGrpcDatasetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    getCassandraGrpcDatasetInfo()
      .then(setInfo)
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState title={t('cassandraGrpc.dataset.loadingTitle')} detail={t('cassandraGrpc.dataset.loadingDetail')} accent="indigo" />;
  if (hasError) return <ErrorState message={t('cassandraGrpc.dataset.loadErrorFallback')} />;
  if (!info) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">{t('cassandraGrpc.dataset.title')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label={t('cassandraGrpc.dataset.ingestedRowsLabel')} value={info.ingestedRows.toLocaleString()} icon={Database} color="text-cyan-300" />
        <MetricCard label={t('cassandraGrpc.dataset.trainTestLabel')} value={`${info.trainRows.toLocaleString()} / ${info.testRows.toLocaleString()}`} icon={Layers} color="text-cyan-300" />
        <MetricCard label={t('cassandraGrpc.dataset.classesLabel')} value={info.numClasses} icon={ListTree} color="text-cyan-300" />
        <MetricCard label={t('cassandraGrpc.dataset.sampleSizeCapLabel')} value={info.sampleSize.toLocaleString()} icon={Database} color="text-cyan-300" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-2">{t('cassandraGrpc.dataset.topTopicsHeading')}</h3>
        <div className="space-y-1.5">
          {info.topicDistribution.slice(0, 10).map((topic) => {
            const pct = (topic.count / info.ingestedRows) * 100;
            return (
              <div key={topic.topicId} className="flex items-center gap-2 text-xs">
                <span className="text-slate-300 font-mono w-56 truncate">{topic.topicName}</span>
                <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-slate-500 w-14 text-right">{topic.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3">{info.note}</p>
    </div>
  );
};
