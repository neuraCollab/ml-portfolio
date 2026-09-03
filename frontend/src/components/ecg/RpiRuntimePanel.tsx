import React, { useEffect, useState } from 'react';
import { EcgBenchmarkResult, EcgRuntimeInfo } from '../../types';
import { getEcgRuntimeInfo, runEcgBenchmark, ApiError } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { useTranslation } from '../../i18n/I18nContext';
import { Cpu, Thermometer, MemoryStick, Gauge, Zap, RefreshCw, Activity } from 'lucide-react';

export const RpiRuntimePanel: React.FC = () => {
  const { t } = useTranslation();
  const [runtime, setRuntime] = useState<EcgRuntimeInfo | null>(null);
  const [runtimeError, setRuntimeError] = useState(false);

  const [benchmark, setBenchmark] = useState<EcgBenchmarkResult | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  useEffect(() => {
    getEcgRuntimeInfo().then(setRuntime).catch(() => setRuntimeError(true));
  }, []);

  const handleRunBenchmark = async () => {
    setBenchmarkLoading(true);
    setBenchmarkError(null);
    try {
      setBenchmark(await runEcgBenchmark());
    } catch (err) {
      setBenchmarkError(err instanceof ApiError ? err.message : t('ecg.runtime.benchmarkErrorFallback'));
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const na = t('common.shared.notAvailable');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label={t('ecg.runtime.cpuLabel')}
          value={runtime?.cpuPercent != null ? `${runtime.cpuPercent.toFixed(1)}%` : na}
          icon={Cpu}
          color="text-rose-300"
          error={runtimeError ? na : undefined}
          loading={!runtime && !runtimeError}
        />
        <MetricCard
          label={t('ecg.runtime.memoryLabel')}
          value={
            runtime?.memoryUsedMb != null && runtime?.memoryTotalMb != null
              ? `${runtime.memoryUsedMb.toFixed(0)} / ${runtime.memoryTotalMb.toFixed(0)} MB`
              : na
          }
          icon={MemoryStick}
          color="text-rose-300"
          error={runtimeError ? na : undefined}
          loading={!runtime && !runtimeError}
        />
        <MetricCard
          label={t('ecg.runtime.temperatureLabel')}
          value={runtime?.cpuTemperatureCelsius != null ? `${runtime.cpuTemperatureCelsius.toFixed(1)}°C` : na}
          icon={Thermometer}
          color="text-rose-300"
          error={runtimeError ? na : undefined}
          loading={!runtime && !runtimeError}
          detail={runtime?.cpuTemperatureCelsius == null ? t('ecg.runtime.temperatureUnavailableDetail') : undefined}
        />
        <MetricCard
          label={t('ecg.runtime.samplingRateLabel')}
          value={runtime ? `${runtime.samplingRateHz} Hz` : na}
          icon={Gauge}
          color="text-rose-300"
          error={runtimeError ? na : undefined}
          loading={!runtime && !runtimeError}
        />
      </div>

      {runtime && (
        <p className="text-[11px] text-slate-500 font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          {runtime.platform}
        </p>
      )}
      {runtime && <p className="text-[10px] text-slate-500">{runtime.note}</p>}

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            <span>{t('ecg.runtime.benchmarkHeading')}</span>
          </div>
          <button
            onClick={handleRunBenchmark}
            disabled={benchmarkLoading}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition"
          >
            {benchmarkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            <span>{t('ecg.runtime.runBenchmarkButton')}</span>
          </button>
        </div>

        {benchmarkError && <p className="text-xs text-red-400">{benchmarkError}</p>}

        {benchmark && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">{t('ecg.runtime.tableStageHeader')}</th>
                    <th className="py-2 px-3">P50</th>
                    <th className="py-2 px-3">P95</th>
                    <th className="py-2 px-3">P99</th>
                    <th className="py-2 px-3">{t('ecg.runtime.tableMeanHeader')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {([
                    ['preprocessing', t('ecg.runtime.stagePreprocessing')],
                    ['inference', t('ecg.runtime.stageInference')],
                    ['total', t('ecg.runtime.stageTotal')],
                  ] as const).map(([key, label]) => (
                    <tr key={key}>
                      <td className="py-1.5 px-3 font-sans">{label}</td>
                      <td className="py-1.5 px-3">{benchmark[key].p50.toFixed(2)} ms</td>
                      <td className="py-1.5 px-3">{benchmark[key].p95.toFixed(2)} ms</td>
                      <td className="py-1.5 px-3">{benchmark[key].p99.toFixed(2)} ms</td>
                      <td className="py-1.5 px-3">{benchmark[key].mean.toFixed(2)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-500">{t('ecg.runtime.benchmarkIterationsNote', { count: benchmark.iterations })}</p>
            <p className="text-[10px] text-slate-500">{benchmark.note}</p>
          </div>
        )}
      </div>
    </div>
  );
};
