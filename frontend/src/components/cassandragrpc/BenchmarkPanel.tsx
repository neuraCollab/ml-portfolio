// frontend/src/components/cassandragrpc/BenchmarkPanel.tsx
import React, { useState } from 'react';
import { CassandraGrpcBenchmarkResult } from '../../types';
import { runCassandraGrpcBenchmark, ApiError } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { Zap, Loader2, Gauge, Timer, ShieldCheck, Network, Info } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

const MIN_REQUESTS = 1;
const MAX_REQUESTS = 15000;
const CONCURRENCY = 30;

export const BenchmarkPanel: React.FC = () => {
  const { t } = useTranslation();
  const [requestsCount, setRequestsCount] = useState(300);
  const [result, setResult] = useState<CassandraGrpcBenchmarkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runCassandraGrpcBenchmark(requestsCount, CONCURRENCY);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('cassandraGrpc.benchmark.errorFallback'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          {t('cassandraGrpc.benchmark.title')}
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          {t('cassandraGrpc.benchmark.description', { concurrency: CONCURRENCY })}
        </p>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-slate-500 max-w-2xl">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-600" />
        <span>{t('cassandraGrpc.benchmark.whatIsACallNote')}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400 font-mono">
          {t('cassandraGrpc.benchmark.requestsLabel')}
          <input
            type="number"
            min={MIN_REQUESTS}
            max={MAX_REQUESTS}
            value={requestsCount}
            onChange={(e) =>
              setRequestsCount(Math.max(MIN_REQUESTS, Math.min(MAX_REQUESTS, Number(e.target.value))))
            }
            className="ml-2 w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
            disabled={loading}
          />
        </label>
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          <span>{loading ? t('cassandraGrpc.benchmark.runningLabel') : t('cassandraGrpc.benchmark.runButtonLabel')}</span>
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label={t('cassandraGrpc.benchmark.throughputLabel')} value={`${result.throughputRps} req/s`} icon={Gauge} color="text-cyan-300" />
            <MetricCard label={t('cassandraGrpc.benchmark.p50Label')} value={`${result.latencyMsP50}ms`} icon={Timer} color="text-cyan-300" />
            <MetricCard label={t('cassandraGrpc.benchmark.p99Label')} value={`${result.latencyMsP99}ms`} icon={Timer} color="text-cyan-300" />
            <MetricCard
              label={t('cassandraGrpc.benchmark.errorsLabel')}
              value={`${result.errorCount} / ${result.requests}`}
              icon={ShieldCheck}
              color={result.errorCount === 0 ? 'text-emerald-300' : 'text-red-300'}
            />
          </div>
          {result.errorCount > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{t('cassandraGrpc.benchmark.errorsExplainerNote')}</span>
            </p>
          )}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
              {t('cassandraGrpc.benchmark.distributionHeading', { count: result.readyPods })}
            </h3>
            <div className="flex flex-col gap-1.5">
              {Object.entries(result.perPodRequestCounts).map(([address, count]) => (
                <div key={address} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-slate-500 w-36 truncate">{address}</span>
                  <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-cyan-500/70"
                      style={{ width: `${(count / result.requests) * 100}%` }}
                    />
                  </div>
                  <span className="text-slate-400 w-10 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
