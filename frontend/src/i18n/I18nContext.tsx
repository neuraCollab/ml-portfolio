import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Language, Paths } from './types';
import { en } from './locales/en';
import { ru } from './locales/ru';

export type TranslationKey = Paths<typeof en>;

const STORAGE_KEY = 'ml-portfolio-language';
const DICTS: Record<Language, typeof en> = { en, ru };

function isValidLanguage(value: string | null): value is Language {
  return value === 'en' || value === 'ru';
}

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function resolveKey(dict: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`
  );
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  needsLanguageSelection: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = readStoredLanguage();
    return isValidLanguage(stored) ? stored : 'en';
  });
  const [needsLanguageSelection, setNeedsLanguageSelection] = useState<boolean>(
    () => !isValidLanguage(readStoredLanguage())
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setNeedsLanguageSelection(false);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable (private browsing, disabled cookies) --
      // the chosen language still applies for this session, it just won't persist.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const dict = DICTS[language];
      const value = resolveKey(dict, key) ?? resolveKey(en, key) ?? key;
      return interpolate(value, vars);
    },
    [language]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, needsLanguageSelection, t }),
    [language, setLanguage, needsLanguageSelection, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return ctx;
}
