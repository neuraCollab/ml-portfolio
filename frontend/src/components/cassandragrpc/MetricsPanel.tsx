// frontend/src/components/cassandragrpc/MetricsPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcTrainMetrics } from '../../types';
import { getCassandraGrpcMetrics } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { Target } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export const MetricsPanel: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<CassandraGrpcTrainMetrics | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getCassandraGrpcMetrics()
      .then(setMetrics)
      .finally(() => setChecked(true));
  }, [refreshKey]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">{t('cassandraGrpc.metrics.title')}</h2>
      <p className="text-xs text-slate-500">{t('cassandraGrpc.metrics.secondaryNote')}</p>
      {!checked ? (
        <p className="text-xs text-slate-500">{t('cassandraGrpc.metrics.loading')}</p>
      ) : !metrics ? (
        <p className="text-sm text-slate-500">{t('cassandraGrpc.metrics.notAvailable')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 opacity-80">
          <MetricCard label={t('cassandraGrpc.metrics.accuracyLabel')} value={`${(metrics.accuracy * 100).toFixed(1)}%`} icon={Target} color="text-slate-300" />
          <MetricCard label={t('cassandraGrpc.metrics.macroPrecisionLabel')} value={metrics.macroPrecision.toFixed(3)} icon={Target} color="text-slate-300" />
          <MetricCard label={t('cassandraGrpc.metrics.macroRecallLabel')} value={metrics.macroRecall.toFixed(3)} icon={Target} color="text-slate-300" />
          <MetricCard label={t('cassandraGrpc.metrics.macroF1Label')} value={metrics.macroF1.toFixed(3)} icon={Target} color="text-slate-300" />
          <MetricCard label={t('cassandraGrpc.metrics.microF1Label')} value={metrics.microF1.toFixed(3)} icon={Target} color="text-slate-300" />
          <MetricCard label={t('cassandraGrpc.metrics.trainedAtLabel')} value={new Date(metrics.trainedAt).toLocaleString()} icon={Target} color="text-cyan-300" />
        </div>
      )}
    </div>
  );
};
