import React, { useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { EcgAnalysisResult } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface SignalStatusProps {
  result: EcgAnalysisResult;
}

const STATUS_STYLES: Record<string, { icon: React.ElementType; className: string }> = {
  GOOD: { icon: CheckCircle2, className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  WARNING: { icon: AlertTriangle, className: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  POOR: { icon: XCircle, className: 'bg-red-500/10 border-red-500/30 text-red-300' },
};

export const SignalStatus: React.FC<SignalStatusProps> = ({ result }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const SOURCE_LABEL: Record<string, string> = {
    synthetic: t('ecg.signalStatus.sourceSynthetic'),
    sample: t('ecg.signalStatus.sourceSample'),
    upload: t('ecg.signalStatus.sourceUpload'),
  };
  const quality = result.signalQuality;
  const style = STATUS_STYLES[quality?.status] ?? STATUS_STYLES.GOOD;
  const StatusIcon = style.icon;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
        <Activity className="w-3.5 h-3.5 text-rose-400" />
        <span className="text-slate-500">{t('ecg.signalStatus.sourceLabel')}</span>
        <span className="text-slate-200">{SOURCE_LABEL[result.source] ?? result.source}</span>
      </div>

      {quality && (
        <div className="relative">
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition ${style.className}`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            <span className="font-semibold">{t(`ecg.signalStatus.quality.status${quality.status}` as any)}</span>
            {quality.issues.length > 0 && (
              expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {expanded && (
            <div className="absolute right-0 z-20 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl space-y-2">
              <p className="text-[11px] text-slate-400">{quality.note}</p>
              {quality.issues.length > 0 && (
                <ul className="space-y-1">
                  {quality.issues.map((issue) => (
                    <li key={issue} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                      {t(`ecg.signalStatus.quality.issue.${issue}` as any)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">{t('ecg.signalStatus.quality.notDiagnosisNote')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
