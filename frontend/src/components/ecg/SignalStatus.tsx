import React from 'react';
import { Activity } from 'lucide-react';
import { EcgAnalysisResult } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface SignalStatusProps {
  result: EcgAnalysisResult;
}

export const SignalStatus: React.FC<SignalStatusProps> = ({ result }) => {
  const { t } = useTranslation();
  const SOURCE_LABEL: Record<string, string> = {
    synthetic: t('ecg.signalStatus.sourceSynthetic'),
    sample: t('ecg.signalStatus.sourceSample'),
    upload: t('ecg.signalStatus.sourceUpload'),
  };
  return (
    <div className="flex items-center gap-2 text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
      <Activity className="w-3.5 h-3.5 text-rose-400" />
      <span className="text-slate-500">{t('ecg.signalStatus.sourceLabel')}</span>
      <span className="text-slate-200">{SOURCE_LABEL[result.source] ?? result.source}</span>
    </div>
  );
};
