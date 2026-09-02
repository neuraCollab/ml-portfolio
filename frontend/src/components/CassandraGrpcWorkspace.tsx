import React, { useState } from 'react';
import { Database } from 'lucide-react';
import { OverviewPanel } from './cassandragrpc/OverviewPanel';
import { DatasetPanel } from './cassandragrpc/DatasetPanel';
import { TrainingPanel } from './cassandragrpc/TrainingPanel';
import { InferencePanel } from './cassandragrpc/InferencePanel';
import { MetricsPanel } from './cassandragrpc/MetricsPanel';
import { StaticResultsSection } from './cassandragrpc/StaticResultsSection';
import { useTranslation } from '../i18n/I18nContext';

export const CassandraGrpcWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);

  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
          <Database className="w-4 h-4" />
          <span>{t('cassandraGrpc.workspace.categoryLabel')}</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">{t('cassandraGrpc.workspace.title')}</h1>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          {t('cassandraGrpc.workspace.description')}
        </p>
      </div>
      <OverviewPanel />
      <DatasetPanel />
      <TrainingPanel onTrainingComplete={() => setMetricsRefreshKey((k) => k + 1)} />
      <InferencePanel />
      <MetricsPanel refreshKey={metricsRefreshKey} />
      <StaticResultsSection />
    </div>
  );
};
