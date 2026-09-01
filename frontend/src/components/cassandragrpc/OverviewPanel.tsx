// frontend/src/components/cassandragrpc/OverviewPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcStatus } from '../../types';
import { getCassandraGrpcStatus } from '../../api/client';
import { ArrowDown, CheckCircle2, XCircle, Server } from 'lucide-react';

const STAGES = ['Client (browser)', 'FastAPI backend (coordinator)', 'gRPC call', 'grpc-worker container', 'Cassandra / scikit-learn model', 'Prediction'];

export const OverviewPanel: React.FC = () => {
  const [status, setStatus] = useState<CassandraGrpcStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setStatus(await getCassandraGrpcStatus());
      setError(null);
    } catch (err) {
      setError('Could not reach the backend status endpoint.');
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Architecture</h2>

      <div className="flex flex-col items-center gap-1.5 py-2">
        {STAGES.map((stage, i) => (
          <React.Fragment key={stage}>
            <div className="px-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 font-mono text-center min-w-[220px]">
              {stage}
            </div>
            {i < STAGES.length - 1 && <ArrowDown className="w-4 h-4 text-slate-600" />}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
        <StatusBadge label="Cassandra" ok={status?.cassandra === 'connected'} />
        <StatusBadge label="gRPC worker" ok={status?.worker === 'connected'} />
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
          <Server className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-slate-300">
            Model: {status?.modelLoaded ? `${status.numClasses} classes` : 'not trained yet'}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-xs text-slate-400 font-mono truncate">
            {status?.trainedAt ? new Date(status.trainedAt).toLocaleString() : 'Never trained'}
          </span>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

const StatusBadge: React.FC<{ label: string; ok?: boolean }> = ({ label, ok }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
    {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
    <span className="text-xs text-slate-300">{label}</span>
  </div>
);
