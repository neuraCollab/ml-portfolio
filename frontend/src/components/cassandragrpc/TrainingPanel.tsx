// frontend/src/components/cassandragrpc/TrainingPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { CassandraGrpcTrainJobStatus } from '../../types';
import { startCassandraGrpcTraining, getCassandraGrpcTrainStatus } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { ConfusionMatrixTable } from './ConfusionMatrixTable';
import { Target, Play, Loader2 } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

export const TrainingPanel: React.FC<{ onTrainingComplete?: () => void }> = ({ onTrainingComplete }) => {
  const { t } = useTranslation();
  const [sampleSize, setSampleSize] = useState(40000);
  const [job, setJob] = useState<CassandraGrpcTrainJobStatus | null>(null);
  const [hasStartError, setHasStartError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getCassandraGrpcTrainStatus().then((status) => {
      setJob(status);
      if (status.status === 'running') {
        startPolling();
      } else {
        onTrainingComplete?.();
      }
    }).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const status = await getCassandraGrpcTrainStatus();
      setJob(status);
      if (status.status !== 'running' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        onTrainingComplete?.();
      }
    }, 5000);
  };

  const handleTrain = async () => {
    setHasStartError(false);
    try {
      const status = await startCassandraGrpcTraining(sampleSize);
      setJob(status);
      startPolling();
    } catch (err) {
      setHasStartError(true);
    }
  };

  const running = job?.status === 'running';
  const statusText = job ? t(`cassandraGrpc.training.statusValues.${job.status}`) : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">{t('cassandraGrpc.training.title')}</h2>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400 font-mono">
          {t('cassandraGrpc.training.sampleSizeLabel')}
          <input
            type="number"
            min={100}
            max={373657}
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            className="ml-2 w-28 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
            disabled={running}
          />
        </label>
        <button
          onClick={handleTrain}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span>{running ? t('cassandraGrpc.training.trainButtonRunning') : t('cassandraGrpc.training.trainButtonIdle')}</span>
        </button>
        {job && <span className="text-xs text-slate-500 font-mono">{t('cassandraGrpc.training.statusLine', { status: statusText! })}</span>}
      </div>

      {hasStartError && <p className="text-xs text-red-400">{t('cassandraGrpc.training.startErrorFallback')}</p>}
      {job?.status === 'failed' && <p className="text-xs text-red-400">{job.error}</p>}

      {job?.result && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label={t('cassandraGrpc.training.accuracyLabel')} value={`${(job.result.accuracy * 100).toFixed(1)}%`} icon={Target} color="text-cyan-300" />
            <MetricCard label={t('cassandraGrpc.training.macroF1Label')} value={job.result.macroF1.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label={t('cassandraGrpc.training.microF1Label')} value={job.result.microF1.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard
              label={t('cassandraGrpc.training.trainingTimeLabel')}
              value={`${job.result.trainingTimeSeconds.toFixed(1)}s @ ${job.result.trainRows.toLocaleString()} rows`}
              icon={Target}
              color="text-cyan-300"
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">
              {t('cassandraGrpc.training.confusionMatrixHeading', { shown: job.result.topClasses.length, total: job.result.numClasses })}
            </h3>
            <ConfusionMatrixTable topClasses={job.result.topClasses} confusionMatrix={job.result.confusionMatrix} />
          </div>
        </div>
      )}
    </div>
  );
};
