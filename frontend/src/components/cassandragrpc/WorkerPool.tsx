// frontend/src/components/cassandragrpc/WorkerPool.tsx
import React, { useState } from 'react';
import { CassandraGrpcStatus } from '../../types';
import { scaleCassandraGrpcPool, getCassandraGrpcStatus, ApiError } from '../../api/client';
import { Minus, Plus, RefreshCw, Server } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

const MIN_REPLICAS = 1;
const MAX_REPLICAS = 5;

interface WorkerPoolProps {
  status: CassandraGrpcStatus | null;
  onStatusChange: (status: CassandraGrpcStatus) => void;
}

/** Real: add/remove calls the backend's /pool/scale route, which patches
 * the real worker Deployment's replica count via the Coordinator. The pod
 * list shown is the real GET /pool result, not client-generated numbers. */
export const WorkerPool: React.FC<WorkerPoolProps> = ({ status, onStatusChange }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentReplicas = status?.pods.length ?? 0;

  const handleScale = async (replicas: number) => {
    setLoading(true);
    setError(null);
    try {
      await scaleCassandraGrpcPool(replicas);
      onStatusChange(await getCassandraGrpcStatus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('cassandraGrpc.workerPool.scaleErrorFallback'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{t('cassandraGrpc.workerPool.replicaCount', { count: currentReplicas, min: MIN_REPLICAS, max: MAX_REPLICAS })}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleScale(Math.max(MIN_REPLICAS, currentReplicas - 1))}
            disabled={loading || currentReplicas <= MIN_REPLICAS}
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-30"
            title={t('cassandraGrpc.workerPool.removeButtonTitle')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleScale(Math.min(MAX_REPLICAS, currentReplicas + 1))}
            disabled={loading || currentReplicas >= MAX_REPLICAS}
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-30"
            title={t('cassandraGrpc.workerPool.addButtonTitle')}
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {status?.pods.map((pod) => (
          <div
            key={pod.address}
            className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border ${
              pod.error ? 'bg-red-500/5 border-red-500/30 text-red-300' : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            <Server className="w-5 h-5" />
            <span className="text-[10px] font-mono">{pod.address}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">{t('cassandraGrpc.workerPool.realNote')}</p>
    </div>
  );
};
