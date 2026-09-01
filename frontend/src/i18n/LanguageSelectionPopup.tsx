import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from './I18nContext';

export const LanguageSelectionPopup: React.FC = () => {
  const { t, setLanguage } = useTranslation();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div className="flex items-center gap-2 text-indigo-400">
          <Globe className="w-5 h-5" />
          <h2 className="text-sm font-semibold text-slate-100">{t('common.languagePopup.heading')}</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-500/25 hover:from-indigo-500 hover:to-indigo-600 transition-all"
          >
            {t('common.languagePopup.englishOption')}
          </button>
          <button
            type="button"
            onClick={() => setLanguage('ru')}
            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold hover:bg-slate-700 hover:border-slate-600 transition-all"
          >
            {t('common.languagePopup.russianOption')}
          </button>
        </div>
      </div>
    </div>
  );
};
