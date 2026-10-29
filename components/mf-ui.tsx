'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { useT } from './lang';

export type MfStatus = { source: string; dataAsOf: string | null; lastChecked: string | null; lastSuccess: string | null; lastError: string | null; stale: boolean; schemes: number; backfill: { total: number; done: number; failed: number; na: number; pending: number } };
export type Row = {
  code: number; name: string; amc: string; category: string; categorySlug: string; main: string; sub: string; plan: string; opt: string;
  nav: number | null; navDate: string | null; prevDate: string | null; prevNav: number | null; chg: number | null; chgPct: number | null;
  r1m: number | null; r3m: number | null; r6m: number | null; r1y: number | null; r3y: number | null; r5y: number | null;
  vol3y?: number | null; sharpe3y?: number | null; sortino3y?: number | null; mdd3y?: number | null; mddAll?: number | null; curDd?: number | null; calmar3y?: number | null; roll1yMed?: number | null; roll1yPos?: number | null; sip3y?: number | null; sip5y?: number | null;
};

export const nfx = (n: number, dp = 2) => n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const sgn = (n: number, dp = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${nfx(Math.abs(n), dp)}`;
export const tone = (n: number | null | undefined) => (n == null || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');
export const dateText = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export const istStamp = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })} IST` : '—');

export function Pct({ v, dp = 2, suffix = '%' }: { v: number | null | undefined; dp?: number; suffix?: string }) {
  return v == null ? <span className="muted">—</span> : <span className={`${tone(v)} num`}>{sgn(v, dp)}{suffix}</span>;
}
export function Amt({ v, dp = 4 }: { v: number | null | undefined; dp?: number }) {
  return v == null ? <span className="muted">—</span> : <span className={`${tone(v)} num`}>{sgn(v, dp)}</span>;
}

export function Num({ v, dp = 2, suffix = '%' }: { v: number | null | undefined; dp?: number; suffix?: string }) {
  return v == null ? <span className="muted">—</span> : <span className="num">{nfx(v, dp)}{suffix}</span>;
}
export function Ratio({ v, dp = 2 }: { v: number | null | undefined; dp?: number }) {
  return v == null ? <span className="muted">—</span> : <span className={`${tone(v)} num`}>{sgn(v, dp)}</span>;
}

/** Source / Data as of / Last checked / stale badge — dara MF page par. */
export function DataBar({ status, extra }: { status: MfStatus | null | undefined; extra?: string }) {
  const t = useT();
  if (!status) return null;
  return (
    <div className="databar" role="note">
      <span><b>{t('Source')}:</b> {status.source}</span>
      <span><b>{t('Data as of')}:</b> {dateText(status.dataAsOf)}</span>
      <span><b>{t('Last checked')}:</b> {istStamp(status.lastChecked)}</span>
      {extra && <span>{extra}</span>}
      {status.stale && <span className="badge stale" title={status.lastError ?? ''}>⚠ {t('Stale — showing last good data')}</span>}
    </div>
  );
}

export function NoteBox({ children }: { children: React.ReactNode }) {
  return <p className="note"><Info size={15} aria-hidden /> <span>{children}</span></p>;
}

export function IdcwNote() {
  const t = useT();
  return <NoteBox>{t('IDCW options: a fall in NAV may be due to a dividend (IDCW) payout, not a loss in value.')}</NoteBox>;
}

export function DbError({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="panel"><p className="empty">
      {message.includes('not configured') ? t('Database is not configured yet. Set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME and run the first NAV fetch.') : t('Mutual fund data is unavailable right now.')}
      <span className="muted small block">{message}</span>
    </p></div>
  );
}

export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!url) return;
    const ctl = new AbortController();
    setLoading(true);
    fetch(url, { signal: ctl.signal })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j; })
      .then((j) => { setData(j); setError(''); setLoading(false); })
      .catch((e) => { if (e?.name !== 'AbortError') { setError(e.message); setLoading(false); } });
    return () => ctl.abort();
  }, [url]);
  return { data, error, loading };
}

/** URL query ma state (shareable links). */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [s, setS] = useState<T>(defaults);
  const init = useRef(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    for (const k of Object.keys(defaults)) if (sp.has(k)) (next as Record<string, string>)[k] = sp.get(k) as string;
    setS(next);
    init.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!init.current) return;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(s)) if (v !== defaults[k]) sp.set(k, v);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, (patch: Partial<T>) => setS((cur) => ({ ...cur, ...patch })), init] as const;
}

export function SortTh({ label, k, sort, dir, onSort, cls = '' }: { label: string; k: string; sort: string; dir: string; onSort: (k: string) => void; cls?: string }) {
  return (
    <th className={`${cls} sortable`} aria-sort={sort === k ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => onSort(k)}>{label}{sort === k ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}</button>
    </th>
  );
}

export function SchemeCell({ r, showCat = false }: { r: Row; showCat?: boolean }) {
  return (
    <td>
      <Link href={`/fund/${r.code}`} className="name">{r.name}</Link>
      <span className="sub">{r.amc}{showCat ? ` · ${r.sub}` : ''}{r.opt === 'IDCW' ? ' · IDCW' : ''}</span>
    </td>
  );
}
