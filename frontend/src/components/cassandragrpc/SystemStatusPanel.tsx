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

/** Self-contained -- polls the same real GET /api/cassandra-grpc/status
 * endpoint OverviewPanel already uses (its own independent request, no
 * shared state), and renders the real self-reported process stats
 * (backendStats/workerStats via psutil, cassandraInfo via a real
 * system.local query) that endpoint now also returns. */
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

  const cards = [
    {
      key: 'backend',
      icon: Server,
      label: t('cassandraGrpc.systemStatus.backendLabel'),
      connected: true, // if this request succeeded, the backend answered
      stats: status?.backendStats,
    },
    {
      key: 'worker',
      icon: Cpu,
      label: t('cassandraGrpc.systemStatus.workerLabel'),
      connected: status?.worker === 'connected',
      stats: status?.workerStats,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ key, icon: Icon, label, connected, stats }) => (
          <div key={key} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-cyan-400" />
                {label}
              </h3>
              {connected ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            </div>
            {stats ? (
              <dl className="text-xs space-y-1.5 font-mono">
                <div className="flex justify-between items-center">
                  <dt className="text-slate-400 flex items-center gap-1"><Cpu className="w-3 h-3" />{t('cassandraGrpc.systemStatus.cpuLabel')}</dt>
                  <dd className="text-cyan-300">{stats.cpuPercent.toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-slate-400 flex items-center gap-1"><MemoryStick className="w-3 h-3" />{t('cassandraGrpc.systemStatus.memoryLabel')}</dt>
                  <dd className="text-cyan-300">{stats.memoryMb.toFixed(0)} MB</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{t('cassandraGrpc.systemStatus.uptimeLabel')}</dt>
                  <dd className="text-cyan-300">{formatUptime(stats.uptimeSeconds)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-slate-500">{t('common.shared.notAvailable')}</p>
            )}
          </div>
        ))}

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 sm:col-span-2">
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
          <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">{t('cassandraGrpc.systemStatus.cassandraUptimeNote')}</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">{t('cassandraGrpc.systemStatus.selfReportNote')}</p>
    </div>
  );
};
