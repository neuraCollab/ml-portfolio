// frontend/src/components/cassandragrpc/TrainingPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import { CassandraGrpcTrainJobStatus } from '../../types';
import { startCassandraGrpcTraining, getCassandraGrpcTrainStatus } from '../../api/client';
import { MetricCard } from '../shared/MetricCard';
import { ConfusionMatrixTable } from './ConfusionMatrixTable';
import { Target, Play, Loader2 } from 'lucide-react';

export const TrainingPanel: React.FC = () => {
  const [sampleSize, setSampleSize] = useState(40000);
  const [job, setJob] = useState<CassandraGrpcTrainJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getCassandraGrpcTrainStatus().then((status) => {
      setJob(status);
      if (status.status === 'running') {
        startPolling();
      }
    }).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const status = await getCassandraGrpcTrainStatus();
      setJob(status);
      if (status.status !== 'running' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 5000);
  };

  const handleTrain = async () => {
    setError(null);
    try {
      const status = await startCassandraGrpcTraining(sampleSize);
      setJob(status);
      startPolling();
    } catch (err) {
      setError('Could not start training -- see the Overview panel for backend/worker status.');
    }
  };

  const running = job?.status === 'running';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Training</h2>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400 font-mono">
          Sample size
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
          <span>{running ? 'Training...' : 'Train Model'}</span>
        </button>
        {job && <span className="text-xs text-slate-500 font-mono">status: {job.status}</span>}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {job?.status === 'failed' && <p className="text-xs text-red-400">{job.error}</p>}

      {job?.result && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Accuracy" value={`${(job.result.accuracy * 100).toFixed(1)}%`} icon={Target} color="text-cyan-300" />
            <MetricCard label="Macro F1" value={job.result.macroF1.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label="Micro F1" value={job.result.microF1.toFixed(3)} icon={Target} color="text-cyan-300" />
            <MetricCard label="Training Time" value={`${job.result.trainingTimeSeconds.toFixed(1)}s`} icon={Target} color="text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">
              Confusion matrix (top {job.result.topClasses.length} classes by test support, of {job.result.numClasses} total)
            </h3>
            <ConfusionMatrixTable topClasses={job.result.topClasses} confusionMatrix={job.result.confusionMatrix} />
          </div>
        </div>
      )}
    </div>
  );
};
