import { cached, pool } from './cache.ts';
import { recordError, recordOk } from './health.ts';
import { parseMfapi } from './mfmath.ts';

export const isSchemeCode = (s: string) => /^\d{3,8}$/.test(s);

export async function getNavHistory(code: string) {
  const { value } = await cached(`mfapi:${code}`, 3 * 3600_000, async () => {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${code}`, { signal: AbortSignal.timeout(15_000), cache: 'no-store', headers: { 'user-agent': 'KanethicMarketHub/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = parseMfapi(await res.json());
      recordOk('mfapi.in NAV history');
      return out;
    } catch (e) {
      recordError('mfapi.in NAV history', e);
      throw e;
    }
  });
  return value;
}

const H = { 'user-agent': 'KanethicMarketHub/1.0', accept: 'application/json' };
const MONTH_MS = 86400_000;

export type FallbackFund = { code: string; name: string; nav: number; date: string; category: string; amc: string };

/** AMFI file na male tyare: mfapi.in search + dar scheme no latest NAV. Ochha result (slow) pan chale. */
export async function searchViaMfapi(query: string, regularOnly: boolean, limit = 15): Promise<{ results: FallbackFund[]; latest: string }> {
  const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`, { headers: H, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`mfapi search HTTP ${res.status}`);
  const list: { schemeCode: number; schemeName: string }[] = await res.json();
  if (!Array.isArray(list)) throw new Error('mfapi search: unexpected format');
  const wanted = list.filter((f) => !regularOnly || !/direct/i.test(f.schemeName)).slice(0, 40);
  const rows = await pool(wanted, 8, async (f) => {
    const r = await fetch(`https://api.mfapi.in/mf/${f.schemeCode}/latest`, { headers: H, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const d = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(j?.data?.[0]?.date));
    const nav = Number(j?.data?.[0]?.nav);
    if (!d || !Number.isFinite(nav) || nav <= 0) throw new Error('bad latest');
    return { code: String(f.schemeCode), name: f.schemeName, nav, date: `${d[3]}-${d[2]}-${d[1]}`, category: String(j?.meta?.scheme_category ?? ''), amc: String(j?.meta?.fund_house ?? '') } as FallbackFund;
  });
  const ok = rows.filter((x): x is FallbackFund => !!x);
  if (!ok.length && wanted.length) { recordError('mfapi.in NAV history', new Error('latest NAV fetch failed for all results')); throw new Error('mfapi latest failed'); }
  recordOk('mfapi.in NAV history');
  const latest = ok.reduce((m, f) => (f.date > m ? f.date : m), '');
  const cutoff = latest ? new Date(Date.parse(latest) - 10 * MONTH_MS).toISOString().slice(0, 10) : '';
  return { results: ok.filter((f) => f.date >= cutoff).slice(0, limit), latest };
}
