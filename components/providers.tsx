'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Quote } from '@/lib/quotes';

/** Tab dekhato hoy tyare j poll kare; pachho aave tyare turant refresh. */
export function usePoll<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as T;
      if (!alive.current) return;
      setData(json);
      setError(false);
      setFetchedAt(Date.now());
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      if (document.visibilityState === 'visible') await load();
      if (alive.current) timer.current = setTimeout(tick, intervalMs);
    };
    tick();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer.current);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, intervalMs]);

  return { data, error, loading, fetchedAt, refresh: load };
}

type QuotesPayload = { quotes: Record<string, Quote>; failed: string[]; updated: number; stale: boolean };
type QuotesCtx = { quotes: Record<string, Quote>; failed: string[]; updated: number; stale: boolean; error: boolean; loading: boolean; refresh: () => Promise<void> };
const QuotesContext = createContext<QuotesCtx>({ quotes: {}, failed: [], updated: 0, stale: false, error: false, loading: true, refresh: async () => {} });
export const useQuotes = () => useContext(QuotesContext);

type WatchCtx = { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => void; ready: boolean };
const WatchContext = createContext<WatchCtx>({ ids: [], has: () => false, toggle: () => {}, ready: false });
export const useWatchlist = () => useContext(WatchContext);

const WL_KEY = 'kmh-watchlist';

export function AppProviders({ children }: { children: ReactNode }) {
  const { data, error, loading, refresh } = usePoll<QuotesPayload>('/api/quotes', 30_000);
  const quotesValue = useMemo<QuotesCtx>(
    () => ({ quotes: data?.quotes ?? {}, failed: data?.failed ?? [], updated: data?.updated ?? 0, stale: data?.stale ?? false, error, loading, refresh }),
    [data, error, loading, refresh],
  );

  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(WL_KEY) || '[]');
      if (Array.isArray(v)) setIds(v.filter((x) => typeof x === 'string'));
    } catch {}
    setReady(true);
  }, []);
  const toggle = useCallback((id: string) => {
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try { localStorage.setItem(WL_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const watchValue = useMemo<WatchCtx>(() => ({ ids, has: (id) => ids.includes(id), toggle, ready }), [ids, toggle, ready]);

  return (
    <QuotesContext.Provider value={quotesValue}>
      <WatchContext.Provider value={watchValue}>{children}</WatchContext.Provider>
    </QuotesContext.Provider>
  );
}
