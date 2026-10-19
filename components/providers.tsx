'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Quote } from '@/lib/quotes';
import { isTriggered, validAlert, type Alert, type Cond } from '@/lib/alerts';
import { byId } from '@/lib/instruments';
import { nf } from '@/lib/format';
import { LangProvider } from './lang';

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

type Toast = { id: string; text: string };
type AlertsCtx = {
  alerts: Alert[]; toasts: Toast[]; perm: NotificationPermission | 'unsupported';
  add: (inst: string, cond: Cond, value: number) => void; remove: (id: string) => void; rearm: (id: string) => void;
  dismiss: (id: string) => void; askPermission: () => Promise<void>;
};
const AlertsContext = createContext<AlertsCtx>({ alerts: [], toasts: [], perm: 'unsupported', add: () => {}, remove: () => {}, rearm: () => {}, dismiss: () => {}, askPermission: async () => {} });
export const useAlerts = () => useContext(AlertsContext);

const WL_KEY = 'kmh-watchlist';
const AL_KEY = 'kmh-alerts';

function AlertsProvider({ children }: { children: ReactNode }) {
  const { quotes } = useQuotes();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [perm, setPerm] = useState<AlertsCtx['perm']>('unsupported');
  const loaded = useRef(false);
  const ref = useRef<Alert[]>([]);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(AL_KEY) || '[]');
      if (Array.isArray(v)) setAlerts(v.filter(validAlert));
    } catch {}
    loaded.current = true;
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);

  const persist = useCallback((next: Alert[]) => {
    ref.current = next;
    setAlerts(next);
    try { localStorage.setItem(AL_KEY, JSON.stringify(next)); } catch {}
  }, []);
  useEffect(() => { ref.current = alerts; }, [alerts]);

  useEffect(() => {
    if (!loaded.current) return;
    const fired: Alert[] = [];
    const next = ref.current.map((a) => {
      if (a.triggeredAt) return a;
      const q = quotes[a.inst];
      if (!q || !isTriggered(a, q.price, q.pct)) return a;
      const hit = { ...a, triggeredAt: Date.now(), triggeredPrice: q.price };
      fired.push(hit);
      return hit;
    });
    if (!fired.length) return;
    persist(next);
    setToasts((cur) => [...cur, ...fired.map((a) => ({ id: a.id, text: `${byId.get(a.inst)?.name ?? a.inst}: ${nf(a.triggeredPrice as number, byId.get(a.inst)?.dp ?? 2)}` }))]);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      fired.forEach((a) => { try { new Notification('Kanethic Market Hub', { body: `${byId.get(a.inst)?.name ?? a.inst}: ${nf(a.triggeredPrice as number, byId.get(a.inst)?.dp ?? 2)}` }); } catch {} });
    }
  }, [quotes, alerts, persist]);

  const value = useMemo<AlertsCtx>(() => ({
    alerts, toasts, perm,
    add: (inst, cond, v) => persist([...ref.current, { id: Math.random().toString(36).slice(2, 10), inst, cond, value: v, created: Date.now() }]),
    remove: (id) => persist(ref.current.filter((a) => a.id !== id)),
    rearm: (id) => persist(ref.current.map((a) => (a.id === id ? { ...a, triggeredAt: undefined, triggeredPrice: undefined } : a))),
    dismiss: (id) => setToasts((cur) => cur.filter((t) => t.id !== id)),
    askPermission: async () => { if (typeof Notification !== 'undefined') setPerm(await Notification.requestPermission()); },
  }), [alerts, toasts, perm, persist]);
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

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
    <LangProvider>
      <QuotesContext.Provider value={quotesValue}>
        <WatchContext.Provider value={watchValue}>
          <AlertsProvider>{children}</AlertsProvider>
        </WatchContext.Provider>
      </QuotesContext.Provider>
    </LangProvider>
  );
}
