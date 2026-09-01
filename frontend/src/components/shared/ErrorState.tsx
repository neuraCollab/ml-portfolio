import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, compact }) => {
  if (compact) {
    return (
      <div className="flex items-center space-x-2 text-xs text-red-300">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{message}</span>
      </div>
    );
  }
  return (
    <div className="bg-slate-900 border border-dashed border-red-500/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3">
      <AlertTriangle className="w-8 h-8 text-red-400" />
      <p className="text-sm text-red-300 max-w-sm">{message}</p>
    </div>
  );
};
