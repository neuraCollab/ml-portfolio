import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Brush } from 'recharts';
import { RotateCcw } from 'lucide-react';
import { ECG_LEAD_NAMES, EcgLeadName } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface ECGChartProps {
  leads: Record<string, number[]>;
  samplingRateHz: number;
  selectedLead: EcgLeadName | 'all';
}

const LEAD_COLORS: Record<string, string> = {
  I: '#f43f5e', II: '#f59e0b', III: '#10b981',
  aVR: '#6366f1', aVL: '#a78bfa', aVF: '#22d3ee',
};

// Downsample for chart rendering only -- the backend already ran inference
// on the full-resolution signal, this is purely a visualization concern.
function downsample(values: number[], samplingRateHz: number, maxPoints = 300) {
  const stride = Math.max(1, Math.floor(values.length / maxPoints));
  const out: { t: number; v: number }[] = [];
  for (let i = 0; i < values.length; i += stride) {
    out.push({ t: Number((i / samplingRateHz).toFixed(2)), v: values[i] });
  }
  return out;
}

const SingleLead: React.FC<{
  name: string; data: { t: number; v: number }[]; height: number; showAxis: boolean; zoomable?: boolean;
}> = ({ name, data, height, showAxis, zoomable }) => {
  const [brushKey, setBrushKey] = useState(0);
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LEAD_COLORS[name] }} />
          {t('ecg.chart.leadLabel', { name })}
        </span>
        {zoomable && (
          <button
            onClick={() => setBrushKey((k) => k + 1)}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
            title={t('ecg.chart.resetZoomTitle')}
          >
            <RotateCcw className="w-3 h-3" /> {t('ecg.chart.resetViewButton')}
          </button>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: showAxis ? 0 : -30, bottom: 0 }}>
            <XAxis dataKey="t" stroke="#64748b" tick={showAxis ? { fill: '#94a3b8', fontSize: 10 } : false} height={showAxis ? 20 : 4} label={showAxis ? { value: t('ecg.chart.secondsAxisLabel'), position: 'insideBottomRight', fill: '#64748b', fontSize: 10, offset: -2 } : undefined} />
            <YAxis stroke="#64748b" tick={showAxis ? { fill: '#94a3b8', fontSize: 10 } : false} width={showAxis ? 36 : 4} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} labelFormatter={(v) => `${v}s`} />
            <Line type="monotone" dataKey="v" stroke={LEAD_COLORS[name]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            {zoomable && (
              <Brush
                key={brushKey}
                dataKey="t"
                height={20}
                stroke={LEAD_COLORS[name]}
                fill="#0f172a"
                travellerWidth={8}
                tickFormatter={(v) => `${v}s`}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const ECGChart: React.FC<ECGChartProps> = ({ leads, samplingRateHz, selectedLead }) => {
  const series = useMemo(() => {
    const out: Record<string, { t: number; v: number }[]> = {};
    for (const name of ECG_LEAD_NAMES) {
      out[name] = downsample(leads[name] ?? [], samplingRateHz);
    }
    return out;
  }, [leads, samplingRateHz]);

  if (selectedLead !== 'all') {
    return <SingleLead name={selectedLead} data={series[selectedLead]} height={280} showAxis zoomable />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ECG_LEAD_NAMES.map((name) => (
        <SingleLead key={name} name={name} data={series[name]} height={130} showAxis={false} />
      ))}
    </div>
  );
};
