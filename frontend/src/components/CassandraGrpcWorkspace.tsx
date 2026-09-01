import React from 'react';
import { Database } from 'lucide-react';
import { OverviewPanel } from './cassandragrpc/OverviewPanel';
import { DatasetPanel } from './cassandragrpc/DatasetPanel';

export const CassandraGrpcWorkspace: React.FC = () => {
  return (
    <div className="space-y-6 pb-10">
      <div>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold uppercase tracking-wider">
          <Database className="w-4 h-4" />
          <span>Distributed ML</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mt-1">Cassandra + gRPC ML</h1>
        <p className="text-sm text-slate-400 max-w-3xl mt-1">
          A distilled topic classifier: AutoTopic discovers ~60 topics in a large Russian request
          corpus via slow unsupervised BERTopic clustering; this project stores a labeled sample of
          that corpus in Apache Cassandra and trains a fast TF-IDF + Logistic Regression classifier,
          served over a real gRPC call to a separate worker container for low-latency inference.
        </p>
      </div>
      <OverviewPanel />
      <DatasetPanel />
    </div>
  );
};
