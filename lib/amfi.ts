import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';

export type Fund = { code: string; name: string; nav: number; date: string; category: string; amc: string };

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

export function amfiDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  const mm = m && MONTHS[m[2].toLowerCase()];
  return m && mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

/** AMFI NAVAll.txt: category header, AMC naam, pachhi `code;isin;isin;name;nav;date` lines. */
export function parseNavAll(text: string): Fund[] {
  const funds: Fund[] = [];
  let category = '', amc = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('Scheme Code')) continue;
    if (!line.includes(';')) {
      if (/^(Open Ended|Close Ended|Interval Fund)/i.test(line)) category = line.replace(/^[^(]*\(/, '').replace(/\)\s*$/, '').trim();
      else amc = line;
      continue;
    }
    const f = line.split(';');
    if (f.length < 6 || !/^\d+$/.test(f[0])) continue;
    const nav = Number(f[4]);
    const date = amfiDate(f[5]);
    if (!Number.isFinite(nav) || nav <= 0 || !date) continue; // "N.A." skip
    funds.push({ code: f[0], name: f[3].trim(), nav, date, category, amc });
  }
  return funds;
}

const URLS = ['https://www.amfiindia.com/spages/NAVAll.txt', 'https://portal.amfiindia.com/spages/NAVAll.txt'];

export async function getFunds(): Promise<{ funds: Fund[]; latest: string; at: number }> {
  const { value, at } = await cached('amfi', 3 * 3600_000, async () => {
    let last: unknown;
    for (const url of URLS) {
      try {
        const res = await fetch(url, {
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            accept: 'text/plain,text/html;q=0.9,*/*;q=0.8',
            'accept-language': 'en-IN,en;q=0.9',
            referer: 'https://www.amfiindia.com/',
          },
          signal: AbortSignal.timeout(30_000),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const funds = parseNavAll(await res.text());
        if (funds.length < 100) throw new Error('AMFI file looks incomplete');
        recordOk('AMFI NAV');
        return { funds, latest: funds.reduce((m, f) => (f.date > m ? f.date : m), '') };
      } catch (e) {
        last = e;
      }
    }
    recordError('AMFI NAV', last);
    throw last;
  });
  return { ...value, at };
}

export type SearchOpts = { plan?: 'direct' | 'regular' | 'any'; option?: 'growth' | 'idcw'; limit?: number; includeInactive?: boolean };

export function searchFunds(funds: Fund[], latest: string, query: string, opts: SearchOpts = {}): Fund[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const cutoff = new Date(Date.parse(latest) - 10 * 86400_000).toISOString().slice(0, 10);
  const scored: [number, Fund][] = [];
  for (const f of funds) {
    if (!opts.includeInactive && f.date < cutoff) continue;
    const n = f.name.toLowerCase();
    if (!tokens.every((t) => n.includes(t) || f.amc.toLowerCase().includes(t))) continue;
    const isDirect = n.includes('direct'), isIdcw = /idcw|dividend/.test(n);
    if (opts.plan === 'direct' && !isDirect) continue;
    if (opts.plan === 'regular' && isDirect) continue;
    if (opts.option === 'growth' && (isIdcw || !n.includes('growth'))) continue;
    if (opts.option === 'idcw' && !isIdcw) continue;
    scored.push([n.startsWith(tokens[0]) ? 1 : 0, f]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, opts.limit ?? 30).map(([, f]) => f);
}
