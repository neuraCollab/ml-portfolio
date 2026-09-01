import React from 'react';
import { ECG_LEAD_NAMES, EcgLeadName } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface LeadSelectorProps {
  selected: EcgLeadName | 'all';
  onSelect: (lead: EcgLeadName | 'all') => void;
}

export const LeadSelector: React.FC<LeadSelectorProps> = ({ selected, onSelect }) => {
  const { t } = useTranslation();
  return (
  <div className="flex flex-wrap gap-2">
    <button
      onClick={() => onSelect('all')}
      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
        selected === 'all'
          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
      }`}
    >
      {t('ecg.leadSelector.allLeadsLabel')}
    </button>
    {ECG_LEAD_NAMES.map((lead) => (
      <button
        key={lead}
        onClick={() => onSelect(lead)}
        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition font-mono ${
          selected === lead
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
        }`}
      >
        {lead}
      </button>
    ))}
  </div>
  );
};
