// frontend/src/components/cassandragrpc/SystemStatusPanel.tsx
import React, { useEffect, useState } from 'react';
import { CassandraGrpcStatus } from '../../types';
import { getCassandraGrpcStatus } from '../../api/client';
import { Cpu, MemoryStick, Clock, Server, Database, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
};

/** Self-contained -- polls the real GET /api/cassandra-grpc/status endpoint,
 * which now aggregates real per-pod stats from the real Coordinator's
 * GET /pool instead of a single fixed worker. */
export const SystemStatusPanel: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CassandraGrpcStatus | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const refresh = () => {
      getCassandraGrpcStatus()
        .then((s) => { setStatus(s); setHasError(false); })
        .catch(() => setHasError(true));
    };
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, []);

  if (hasError) {
    return <p className="text-xs text-red-400">{t('cassandraGrpc.systemStatus.fetchError')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            {t('cassandraGrpc.systemStatus.backendLabel')}
          </h3>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        {status?.backendStats && (
          <dl className="text-xs space-y-1.5 font-mono">
            <div className="flex justify-between items-center">
              <dt className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3" />{t('cassandraGrpc.systemStatus.cpuLabel')}</dt>
              <dd className="text-cyan-300">{status.backendStats.cpuPercent.toFixed(1)}%</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-400 flex items-center gap-1"><MemoryStick className="w-3 h-3" />{t('cassandraGrpc.systemStatus.memoryLabel')}</dt>
              <dd className="text-cyan-300">{status.backendStats.memoryMb.toFixed(0)} MB</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{t('cassandraGrpc.systemStatus.uptimeLabel')}</dt>
              <dd className="text-cyan-300">{formatUptime(status.backendStats.uptimeSeconds)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5 mb-2">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          {t('cassandraGrpc.systemStatus.workerPodsLabel', { count: status?.pods.length ?? 0 })}
        </h3>
        {status && status.pods.length === 0 && (
          <p className="text-xs text-slate-500">{t('cassandraGrpc.systemStatus.noPodsReady')}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status?.pods.map((pod) => (
            <div key={pod.address} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-300 truncate">{pod.address}</span>
                {pod.error ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </div>
              {pod.stats ? (
                <dl className="text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between"><dt className="text-slate-500">{t('cassandraGrpc.systemStatus.cpuLabel')}</dt><dd className="text-cyan-300">{pod.stats.cpuPercent.toFixed(1)}%</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">{t('cassandraGrpc.systemStatus.memoryLabel')}</dt><dd className="text-cyan-300">{pod.stats.memoryMb.toFixed(0)} MB</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">{t('cassandraGrpc.systemStatus.uptimeLabel')}</dt><dd className="text-cyan-300">{formatUptime(pod.stats.uptimeSeconds)}</dd></div>
                </dl>
              ) : (
                <p className="text-[11px] text-red-400">{pod.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            {t('cassandraGrpc.systemStatus.cassandraLabel')}
          </h3>
          {status?.cassandra === 'connected' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
        </div>
        {status?.cassandraInfo ? (
          <dl className="text-xs space-y-1.5 font-mono">
            <div className="flex justify-between"><dt className="text-slate-400">{t('cassandraGrpc.systemStatus.releaseVersionLabel')}</dt><dd className="text-cyan-300">{status.cassandraInfo.releaseVersion}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">{t('cassandraGrpc.systemStatus.clusterNameLabel')}</dt><dd className="text-cyan-300">{status.cassandraInfo.clusterName}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">{t('cassandraGrpc.systemStatus.hostIdLabel')}</dt><dd className="text-cyan-300 truncate max-w-[60%]">{status.cassandraInfo.hostId}</dd></div>
          </dl>
        ) : (
          <p className="text-xs text-slate-500">{t('common.shared.notAvailable')}</p>
        )}
      </div>
      <p className="text-[10px] text-slate-500">{t('cassandraGrpc.systemStatus.selfReportNote')}</p>
    </div>
  );
};
