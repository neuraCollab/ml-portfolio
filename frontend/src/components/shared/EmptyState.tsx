import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  detail?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, detail }) => (
  <div className="bg-slate-900 border border-dashed border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
    <Icon className="w-8 h-8 text-slate-600" />
    <h3 className="text-slate-300 font-semibold">{title}</h3>
    {detail && <p className="text-xs text-slate-500 max-w-sm">{detail}</p>}
  </div>
);
