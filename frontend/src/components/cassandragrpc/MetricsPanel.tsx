// frontend/src/components/cassandragrpc/MetricsPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcTrainMetrics } from '../../types';
import { getCassandraGrpcMetrics } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { Target } from 'lucide-react';

export const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<CassandraGrpcTrainMetrics | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getCassandraGrpcMetrics()
      .then(setMetrics)
      .finally(() => setChecked(true));
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Metrics</h2>
      {!checked ? (
        <p className="text-xs text-slate-500">Loading...</p>
      ) : !metrics ? (
        <p className="text-sm text-slate-500">Not available -- no training run has completed yet this session.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`} icon={Target} color="text-cyan-300" />
          <MetricCard label="Macro Precision" value={metrics.macroPrecision.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Macro Recall" value={metrics.macroRecall.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Macro F1" value={metrics.macroF1.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Micro F1" value={metrics.microF1.toFixed(3)} icon={Target} color="text-cyan-300" />
          <MetricCard label="Trained At" value={new Date(metrics.trainedAt).toLocaleString()} icon={Target} color="text-cyan-300" />
        </div>
      )}
    </div>
  );
};
