import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { EcgClassPrediction } from '../../types';
import { CLASS_LABELS } from '../../data/ecgLabels';

interface ProbabilityBarChartProps {
  predictions: Record<string, EcgClassPrediction>;
}

const TOP_N_DEFAULT = 8;

export const ProbabilityBarChart: React.FC<ProbabilityBarChartProps> = ({ predictions }) => {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const all = Object.entries(predictions)
      .map(([className, v]) => ({
        className,
        label: CLASS_LABELS[className] ?? className,
        probabilityPct: Number((v.probability * 100).toFixed(1)),
        predicted: v.predicted,
      }))
      .sort((a, b) => b.probabilityPct - a.probabilityPct);
    return showAll ? all : all.slice(0, TOP_N_DEFAULT);
  }, [predictions, showAll]);

  const total = Object.keys(predictions).length;

  return (
    <div className="space-y-2">
      <div style={{ height: Math.max(200, rows.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="label" width={170} stroke="#64748b" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
              formatter={(value: number) => [`${value}%`, 'Model probability']}
            />
            <Bar dataKey="probabilityPct" radius={[0, 4, 4, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.predicted ? '#f43f5e' : '#475569'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {total > TOP_N_DEFAULT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] text-rose-400 hover:text-rose-300"
        >
          {showAll ? `Show top ${TOP_N_DEFAULT} only` : `Show all ${total} classes`}
        </button>
      )}
      <p className="text-[10px] text-slate-500">
        Red bars are "predicted" (above that class's own calibrated decision threshold); grey bars
        are below it. Values are the raw sigmoid outputs of the real ECGNet model -- thresholds are
        tuned per class on held-out data, not a flat 0.5 (see raspberry-pi-ecg/data/README.md).
      </p>
    </div>
  );
};
