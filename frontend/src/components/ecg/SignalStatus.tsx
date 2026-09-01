import React from 'react';
import { Activity } from 'lucide-react';
import { EcgAnalysisResult } from '../../types';

interface SignalStatusProps {
  result: EcgAnalysisResult;
}

const SOURCE_LABEL: Record<string, string> = {
  synthetic: 'Synthetic (generated)',
  sample: 'Bundled recorded sample',
  upload: 'Uploaded .npy file',
};

export const SignalStatus: React.FC<SignalStatusProps> = ({ result }) => (
  <div className="flex items-center gap-2 text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
    <Activity className="w-3.5 h-3.5 text-rose-400" />
    <span className="text-slate-500">Source:</span>
    <span className="text-slate-200">{SOURCE_LABEL[result.source] ?? result.source}</span>
  </div>
);
