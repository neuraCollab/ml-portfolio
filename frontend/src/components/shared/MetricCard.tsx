import React, { useState } from 'react';
import { LucideIcon, Info, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: string;
  /** Longer explanation of what this metric means / how it's calculated.
   * Shown on hover (desktop, via native title) and tap (mobile, via a
   * click-to-expand line) so the meaning is never a mystery. */
  tooltip?: string;
  icon: LucideIcon;
  color?: string;
  loading?: boolean;
  error?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label, value, unit, detail, tooltip, icon: Icon, color = 'text-indigo-400', loading, error,
}) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
      <div
        className="flex items-center justify-between text-xs text-slate-400 font-mono"
        title={tooltip}
      >
        <span className="flex items-center gap-1">
          {label}
          {tooltip && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-600 hover:text-slate-300 transition"
              aria-label={t('common.shared.aboutLabel', { label })}
            >
              <Info className="w-3 h-3" />
            </button>
          )}
        </span>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>

      {loading ? (
        <div className="h-7 w-16 bg-slate-800 rounded animate-pulse" />
      ) : error ? (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{t('common.shared.notAvailable')}</span>
        </div>
      ) : (
        <div className={`text-2xl font-bold font-mono ${color}`}>
          {value}
          {unit && <span className="text-xs text-slate-500 ml-1 font-normal">{unit}</span>}
        </div>
      )}

      {detail && !error && <p className="text-[10px] text-slate-500">{detail}</p>}
      {expanded && tooltip && (
        <p className="text-[10px] text-slate-400 border-t border-slate-800 pt-1.5 mt-1.5">{tooltip}</p>
      )}
    </div>
  );
};
