import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { EcgClassPrediction } from '../../types';
import { CLASS_LABELS } from '../../data/ecgLabels';
import { formatProbability } from '../../utils/formatProbability';

interface ProbabilityBarChartProps {
  predictions: Record<string, EcgClassPrediction>;
}

const TOP_N_DEFAULT = 8;
// The real sigmoid outputs are all far below 1 (typically 1e-6 to 1e-19 -- see
// raspberry-pi-ecg/data/README.md), so a linear 0-100% axis rounds every bar
// down to zero length. A log scale is the only way the real, genuine
// differences between classes (which span many orders of magnitude) show up
// as different bar lengths instead of a wall of identical "0%" bars. Values
// are floored here since log scale requires strictly positive numbers.
const MIN_PLOTTABLE = 1e-20;

export const ProbabilityBarChart: React.FC<ProbabilityBarChartProps> = ({ predictions }) => {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const all = Object.entries(predictions)
      .map(([className, v]) => ({
        className,
        label: CLASS_LABELS[className] ?? className,
        probability: v.probability,
        plotValue: Math.max(v.probability, MIN_PLOTTABLE),
        predicted: v.predicted,
      }))
      .sort((a, b) => b.probability - a.probability);
    return showAll ? all : all.slice(0, TOP_N_DEFAULT);
  }, [predictions, showAll]);

  const total = Object.keys(predictions).length;

  return (
    <div className="space-y-2">
      <div style={{ height: Math.max(200, rows.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <XAxis
              type="number"
              scale="log"
              domain={['auto', 'auto']}
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickFormatter={(v: number) => v.toExponential(0)}
            />
            <YAxis type="category" dataKey="label" width={170} stroke="#64748b" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
              formatter={(_value: number, _name: string, item: any) => [
                formatProbability(item.payload.probability),
                'Raw model probability',
              ]}
            />
            <Bar dataKey="plotValue" radius={[0, 4, 4, 0]}>
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
        are below it. Axis is log-scaled -- these are the real raw sigmoid outputs of the ECGNet
        model, which are all far below 1 and span many orders of magnitude, so a linear 0-100% axis
        would flatten every bar to zero. Thresholds are tuned per class on held-out data, not a flat
        0.5 (see raspberry-pi-ecg/data/README.md).
      </p>
    </div>
  );
};
