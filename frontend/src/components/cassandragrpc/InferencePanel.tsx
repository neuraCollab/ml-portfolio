// frontend/src/components/cassandragrpc/InferencePanel.tsx
import React, { useState } from 'react';
import { CassandraGrpcPredictResult } from '../../types';
import { predictCassandraGrpc, ApiError } from '../../api/client';
import { GrpcLogStream } from './GrpcLogStream';
import { Send, Loader2 } from 'lucide-react';

export const InferencePanel: React.FC = () => {
  const [text, setText] = useState('Подбери синонимы к слову веселый');
  const [result, setResult] = useState<CassandraGrpcPredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await predictCassandraGrpc(text);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prediction request failed.');
    } finally {
      setLoading(false);
      setLogRefreshKey((k) => k + 1);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-lg font-bold text-white">Inference</h2>
      <p className="text-xs text-slate-400">
        input → preprocessing → gRPC request → grpc-worker → model prediction → confidence → result
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
        placeholder="Enter a Russian request to classify..."
      />
      <button
        onClick={handlePredict}
        disabled={loading || !text.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-700 text-white text-sm font-medium disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        <span>Predict</span>
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-500 font-mono uppercase">Predicted topic</div>
            <div className="text-base font-bold text-cyan-300">{result.topicName}</div>
            <div className="text-[10px] text-slate-500">topic_id {result.topicId}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold font-mono text-cyan-400">{(result.confidence * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-slate-500">
              preprocessing {result.preprocessingTimeMs.toFixed(2)}ms · gRPC {result.grpcRoundtripMs.toFixed(1)}ms
            </div>
          </div>
        </div>
      )}

      <GrpcLogStream refreshKey={logRefreshKey} />
    </div>
  );
};
