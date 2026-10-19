'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { gu } from '@/lib/i18n';

export type Lang = 'en' | 'gu';
type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    try {
      const v = localStorage.getItem('kmh-lang');
      if (v === 'gu' || v === 'en') setLangState(v);
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang === 'gu' ? 'gu' : 'en'; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('kmh-lang', l); } catch {}
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

const pair = (s: string) => s.replace(/^([A-Z]{3}) per ([A-Z]{3})$/, '$1 પ્રતિ $2');

export const useLang = () => useContext(LangContext);

/** t('English text', {n: 5}) -> Gujarati jo lang=gu ane translation hoy, nahi to English. {n} placeholders. */
export function useT() {
  const { lang } = useContext(LangContext);
  return useCallback(
    (s: string, vars?: Record<string, string | number>) => {
      let out = lang === 'gu' ? gu[s] ?? pair(s) : s;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    },
    [lang],
  );
}
