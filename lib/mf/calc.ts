// Pure calculations (tests ma verify). Dates: 'YYYY-MM-DD' strings, Asia/Kolkata.
export type NavRow = { date: string; nav: number };

const DAY = 86400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** IST calendar date */
export const istDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
const istHour = (now = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(now)) % 24;

export function subtractMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) - months;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Latest row with date <= target, but only if it is within tolDays (holiday gaps). rows ascending. */
export function navAtOrBefore(rows: NavRow[], target: string, tolDays = 7): NavRow | null {
  const t = ms(target);
  let lo = 0, hi = rows.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ms(rows[mid].date) <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && t - ms(rows[ans].date) <= tolDays * DAY ? rows[ans] : null;
}

export type Returns = { r1m: number | null; r3m: number | null; r6m: number | null; r1y: number | null; r3y: number | null; r5y: number | null };

/** 1M/3M/6M/1Y = absolute %, 3Y/5Y = CAGR %. Data na hoy to null (kadi guess nahi). */
export function computeReturns(rows: NavRow[]): Returns {
  const none: Returns = { r1m: null, r3m: null, r6m: null, r1y: null, r3y: null, r5y: null };
  if (rows.length < 2) return none;
  const last = rows[rows.length - 1];
  const base = (months: number) => navAtOrBefore(rows, subtractMonths(last.date, months));
  const abs = (m: number) => { const b = base(m); return b ? (last.nav / b.nav - 1) * 100 : null; };
  const cagr = (m: number) => { const b = base(m); return b ? ((last.nav / b.nav) ** (12 / m) - 1) * 100 : null; };
  return { r1m: abs(1), r3m: abs(3), r6m: abs(6), r1y: abs(12), r3y: cagr(36), r5y: cagr(60) };
}

/** 1D change: latest NAV vs previous AVAILABLE NAV of same scheme (weekend/holiday safe). */
export function oneDay(rows: NavRow[]) {
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  return { date: last.date, nav: last.nav, prevDate: prev.date, prevNav: prev.nav, chg: last.nav - prev.nav, pct: (last.nav / prev.nav - 1) * 100 };
}

export const pctChange = (nav: number, prev: number) => (nav / prev - 1) * 100;

export function validateChange(nav: number, prev: number | null, limitPct = 20): 'ok' | 'review' {
  if (prev === null || prev <= 0) return 'ok';
  return Math.abs(pctChange(nav, prev)) > limitPct ? 'review' : 'ok';
}

export const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export function median(a: number[]) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function summarize(changes: number[]) {
  return { count: changes.length, avg: mean(changes), median: median(changes), gainers: changes.filter((c) => c > 0).length, losers: changes.filter((c) => c < 0).length, unchanged: changes.filter((c) => c === 0).length };
}

/**
 * Kayi NAV date aavi javi joie (IST). 22:00 pachhi = aaj ni; baki = gai kal ni; pachhi chhelo weekday (holiday khabar nathi).
 */
export function expectedNavDate(now = new Date()): string {
  let d = ms(istDate(now)) - (istHour(now) >= 22 ? 0 : DAY);
  while ([0, 6].includes(new Date(d).getUTCDay())) d -= DAY;
  return iso(d);
}

export const SLOTS = { '23:00': false, '23:45': false, '07:00': false, '10:00': true } as const; // true = chhello retry
export type Slot = keyof typeof SLOTS;

export function isStale(o: { lastSuccessAt: number | null; lastJobFailed: boolean }, now = Date.now(), maxAgeH = 36) {
  return o.lastJobFailed || o.lastSuccessAt === null || now - o.lastSuccessAt > maxAgeH * 3600_000;
}
