import { cached } from './cache.ts';
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
