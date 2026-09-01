// frontend/src/components/cassandragrpc/GrpcLogStream.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcLogEntry } from '../../types';
import { getCassandraGrpcLog } from '../../api/client';
import { Radio } from 'lucide-react';

export const GrpcLogStream: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [entries, setEntries] = useState<CassandraGrpcLogEntry[]>([]);

  useEffect(() => {
    getCassandraGrpcLog().then(setEntries).catch(() => {});
  }, [refreshKey]);

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-2">
        <Radio className="w-3.5 h-3.5 text-cyan-400" />
        <span>Recent gRPC calls</span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/60">
        {entries.length === 0 && <div className="p-3 text-xs text-slate-500">No gRPC calls logged yet.</div>}
        {entries.map((e) => (
          <div key={e.id} className="p-2 text-[11px] font-mono flex items-center gap-2">
            <span className={e.status === 'OK' ? 'text-emerald-400' : 'text-red-400'}>{e.status}</span>
            <span className="text-slate-300">{e.method}</span>
            <span className="text-slate-500">{e.latencyMs.toFixed(1)}ms</span>
            <span className="text-slate-600 truncate flex-1">{e.detail}</span>
            <span className="text-slate-600">{new Date(e.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
