import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ar, type Key } from './ar';
import { en } from './en';

export type Lang = 'ar' | 'en';
export type { Key };

const DICTS: Record<Lang, Record<Key, string>> = { ar, en };

/** The phone's first preferred language decides: Arabic first gives Arabic, anything else English. */
export function detectLang(languages: readonly string[]): Lang {
  if (!languages.length) return 'ar';
  return languages[0].toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

type Ctx = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLang] = useState<Lang>(() => initial ?? detectLang(browserLanguages()));
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', dir);
  }, [lang, dir]);

  const t = useCallback(
    (key: Key, vars?: Record<string, string>) => {
      const text = DICTS[lang][key] ?? key;
      return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '') : text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, dir, setLang, t }) as Ctx, [lang, dir, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
