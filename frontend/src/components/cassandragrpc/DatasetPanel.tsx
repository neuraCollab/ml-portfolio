// frontend/src/components/cassandragrpc/DatasetPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcDatasetInfo } from '../../types';
import { getCassandraGrpcDatasetInfo } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { Database, Layers, ListTree } from 'lucide-react';

export const DatasetPanel: React.FC = () => {
  const [info, setInfo] = useState<CassandraGrpcDatasetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCassandraGrpcDatasetInfo()
      .then(setInfo)
      .catch(() => setError('Could not load dataset info -- ingestion may still be running on first startup.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState title="Loading dataset info" detail="First call triggers ingestion into Cassandra..." accent="indigo" />;
  if (error) return <ErrorState message={error} />;
  if (!info) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Dataset</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Ingested Rows" value={info.ingestedRows.toLocaleString()} icon={Database} color="text-cyan-300" />
        <MetricCard label="Train / Test" value={`${info.trainRows.toLocaleString()} / ${info.testRows.toLocaleString()}`} icon={Layers} color="text-cyan-300" />
        <MetricCard label="Classes" value={info.numClasses} icon={ListTree} color="text-cyan-300" />
        <MetricCard label="Sample Size Cap" value={info.sampleSize.toLocaleString()} icon={Database} color="text-cyan-300" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Top 10 topics by row count</h3>
        <div className="space-y-1.5">
          {info.topicDistribution.slice(0, 10).map((t) => {
            const pct = (t.count / info.ingestedRows) * 100;
            return (
              <div key={t.topicId} className="flex items-center gap-2 text-xs">
                <span className="text-slate-300 font-mono w-56 truncate">{t.topicName}</span>
                <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-slate-500 w-14 text-right">{t.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3">{info.note}</p>
    </div>
  );
};
