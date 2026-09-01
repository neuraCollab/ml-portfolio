import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingStateProps {
  title: string;
  detail?: string;
  accent?: 'indigo' | 'emerald' | 'purple';
}

const ACCENT_CLASSES: Record<string, string> = {
  indigo: 'border-indigo-500/30 text-indigo-400',
  emerald: 'border-emerald-500/30 text-emerald-400',
  purple: 'border-purple-500/30 text-purple-400',
};

export const LoadingState: React.FC<LoadingStateProps> = ({ title, detail, accent = 'indigo' }) => (
  <div className={`bg-slate-900 border border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3 ${ACCENT_CLASSES[accent]}`}>
    <RefreshCw className="w-8 h-8 animate-spin" />
    <h3 className="text-slate-200 font-semibold">{title}</h3>
    {detail && <p className="text-xs text-slate-500 max-w-sm">{detail}</p>}
  </div>
);
