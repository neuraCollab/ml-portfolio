// frontend/src/components/cassandragrpc/WorkerPool.tsx
import React, { useState } from 'react';
import { CassandraGrpcStatus } from '../../types';
import { scaleCassandraGrpcPool, killOneCassandraGrpcWorker, getCassandraGrpcStatus, ApiError } from '../../api/client';
import { Minus, Plus, RefreshCw, Server, Skull } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

const MIN_REPLICAS = 1;
const MAX_REPLICAS = 5;
const PRESETS = [1, 3, 5];

interface WorkerPoolProps {
  status: CassandraGrpcStatus | null;
  onStatusChange: (status: CassandraGrpcStatus) => void;
}

/** Real: scale/kill-one call the backend's /pool/scale and /pool/kill-one
 * routes, which patch or delete real objects via the Coordinator's k8s API
 * access. The pod list shown is the real GET /pool result. */
export const WorkerPool: React.FC<WorkerPoolProps> = ({ status, onStatusChange }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [killMessage, setKillMessage] = useState<string | null>(null);
  // Tracks the last replica count we explicitly requested via /pool/scale, so
  // the controls don't regress a scale-up that's still rolling out. The
  // Coordinator's /pool endpoint only lists Ready pods, so status?.pods.length
  // reads low (e.g. 1) while new pods are still starting up after a request
  // for a higher count (e.g. 3) -- using that alone would let a second click
  // compute currentReplicas + 1 = 2 and PATCH the Deployment back down mid-rollout.
  const [lastRequestedReplicas, setLastRequestedReplicas] = useState(0);

  const readyReplicas = status?.pods.length ?? 0;
  // Basis for the +/-/preset target computation: the higher of what's
  // actually Ready and what we last asked for, so a click during an
  // in-flight scale-up moves relative to the requested count, not the
  // not-yet-caught-up Ready count.
  const requestedReplicas = Math.max(lastRequestedReplicas, readyReplicas);
  const isScaling = readyReplicas !== requestedReplicas;

  const handleScale = async (replicas: number) => {
    setLoading(true);
    setError(null);
    setKillMessage(null);
    try {
      const result = await scaleCassandraGrpcPool(replicas);
      setLastRequestedReplicas(result.requestedReplicas);
      onStatusChange(await getCassandraGrpcStatus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('cassandraGrpc.workerPool.scaleErrorFallback'));
    } finally {
      setLoading(false);
    }
  };

  const handleKillOne = async () => {
    setLoading(true);
    setError(null);
    setKillMessage(null);
    try {
      const result = await killOneCassandraGrpcWorker();
      setKillMessage(t('cassandraGrpc.workerPool.killedPodMessage', { pod: result.killedPod }));
      onStatusChange(await getCassandraGrpcStatus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('cassandraGrpc.workerPool.killErrorFallback'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
        <span>{t('cassandraGrpc.workerPool.deploymentLabel')}</span>
        <span className="text-slate-300">cassandra-grpc-ml-worker</span>
      </div>

      {/* Ready-vs-requested: visually obvious even mid-rollout. */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full rounded-full transition-all ${isScaling ? 'bg-amber-500/70' : 'bg-cyan-500/70'}`}
            style={{ width: `${(readyReplicas / MAX_REPLICAS) * 100}%` }}
          />
        </div>
        <span className="text-sm font-mono text-slate-200 shrink-0">
          {t('cassandraGrpc.workerPool.readyOfRequested', { ready: readyReplicas, requested: requestedReplicas })}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => handleScale(n)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition disabled:opacity-40 ${
                requestedReplicas === n
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleScale(Math.max(MIN_REPLICAS, requestedReplicas - 1))}
            disabled={loading || requestedReplicas <= MIN_REPLICAS}
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-30"
            title={t('cassandraGrpc.workerPool.removeButtonTitle')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleScale(Math.min(MAX_REPLICAS, requestedReplicas + 1))}
            disabled={loading || requestedReplicas >= MAX_REPLICAS}
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

      {/* Failure-handling demo: a real pod delete, not a scale-down. The
          Coordinator naturally excludes it (pod discovery re-queries Ready
          pods on every call), and Kubernetes' own Deployment controller
          replaces it -- no extra code for either half. */}
      <div className="border-t border-slate-800 pt-3 space-y-2">
        <button
          onClick={handleKillOne}
          disabled={loading || readyReplicas === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium hover:bg-red-500/20 disabled:opacity-40 transition"
        >
          <Skull className="w-3.5 h-3.5" />
          <span>{t('cassandraGrpc.workerPool.killOneButton')}</span>
        </button>
        {killMessage && <p className="text-xs text-amber-300">{killMessage}</p>}
        <p className="text-[10px] text-slate-500">{t('cassandraGrpc.workerPool.killOneNote')}</p>
      </div>

      <p className="text-[10px] text-slate-500">{t('cassandraGrpc.workerPool.realNote')}</p>
    </div>
  );
};
