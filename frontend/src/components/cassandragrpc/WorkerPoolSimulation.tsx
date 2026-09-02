// frontend/src/components/cassandragrpc/WorkerPoolSimulation.tsx
import React, { useState } from 'react';
import { AlertTriangle, Cpu, Minus, Plus, Server } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

// Real numbers from cassandra-grpc-ml/k8s/grpc-worker-hpa.yaml -- explicitly
// documented there as "UNVERIFIED: see grpc-worker-deployment.yaml" (never
// deployed against a real cluster during this integration). Reused here only
// as realistic reference values for an admittedly simulated visualization,
// not as evidence this scaling has ever actually run.
const MIN_REPLICAS = 1;
const MAX_REPLICAS = 5;
const CPU_TARGET_PERCENT = 50;

interface SimNode {
  id: number;
  cpuPercent: number;
  requestsHandled: number;
}

const seedNode = (id: number): SimNode => ({
  id,
  cpuPercent: 30 + Math.round(Math.random() * 30),
  requestsHandled: Math.round(Math.random() * 500),
});

export const WorkerPoolSimulation: React.FC = () => {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<SimNode[]>([seedNode(1)]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nextId, setNextId] = useState(2);

  const addNode = () => {
    if (nodes.length >= MAX_REPLICAS) return;
    setNodes((prev) => [...prev, seedNode(nextId)]);
    setNextId((n) => n + 1);
  };

  const removeNode = (id: number) => {
    if (nodes.length <= MIN_REPLICAS) return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">{t('cassandraGrpc.workerSim.badgeTitle')}</p>
          <p className="mt-0.5 text-amber-300/70">{t('cassandraGrpc.workerSim.badgeBody')}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{t('cassandraGrpc.workerSim.replicaCount', { count: nodes.length, min: MIN_REPLICAS, max: MAX_REPLICAS })}</span>
        <span className="font-mono">{t('cassandraGrpc.workerSim.cpuTarget', { target: CPU_TARGET_PERCENT })}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => setSelectedId(node.id === selectedId ? null : node.id)}
            className={`relative flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition ${
              selectedId === node.id
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Server className="w-5 h-5" />
            <span className="text-[10px] font-mono">worker-{node.id}</span>
            {nodes.length > MIN_REPLICAS && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-red-500/30 hover:border-red-500/50"
                title={t('cassandraGrpc.workerSim.removeButtonTitle')}
              >
                <Minus className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        ))}
        <button
          onClick={addNode}
          disabled={nodes.length >= MAX_REPLICAS}
          className="flex flex-col items-center justify-center gap-1 px-4 py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 disabled:opacity-30 disabled:hover:text-slate-500"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px] font-mono">{t('cassandraGrpc.workerSim.addButton')}</span>
        </button>
      </div>

      {selected && (
        <div className="bg-slate-950 border border-cyan-500/20 rounded-xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 font-mono text-cyan-300">
            <Cpu className="w-3.5 h-3.5" />
            worker-{selected.id}
          </div>
          <div className="flex justify-between text-slate-400"><span>{t('cassandraGrpc.workerSim.simCpuLabel')}</span><span className="font-mono text-slate-300">{selected.cpuPercent}%</span></div>
          <div className="flex justify-between text-slate-400"><span>{t('cassandraGrpc.workerSim.simRequestsLabel')}</span><span className="font-mono text-slate-300">{selected.requestsHandled}</span></div>
          <p className="text-[10px] text-amber-300/70 pt-1 border-t border-slate-800">{t('cassandraGrpc.workerSim.inspectSimNote')}</p>
        </div>
      )}
    </div>
  );
};
