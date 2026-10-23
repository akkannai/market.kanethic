import { q } from './db.ts';
import { isStale } from './calc.ts';
import { downsample } from '../mfmath.ts';

export type SchemeRow = {
  code: number; name: string; amc: string; category: string; categorySlug: string; main: string; sub: string; plan: string; opt: string;
  nav: number | null; navDate: string | null; prevDate: string | null; prevNav: number | null; chg: number | null; chgPct: number | null;
  r1m: number | null; r3m: number | null; r6m: number | null; r1y: number | null; r3y: number | null; r5y: number | null;
};

const SELECT = `s.scheme_code AS code, s.name, s.amc, s.category, s.category_slug AS categorySlug, s.main_category AS main, s.sub_category AS sub, s.plan, s.opt,
  n.nav, n.nav_date AS navDate, n.prev_date AS prevDate, n.prev_nav AS prevNav, n.chg, n.chg_pct AS chgPct, n.r1m, n.r3m, n.r6m, n.r1y, n.r3y, n.r5y`;
const FROM = 'FROM schemes s JOIN nav_latest n ON n.scheme_code = s.scheme_code';

export type Filters = { q?: string; amc?: string; main?: string; cat?: string; plan?: string; opt?: string; move?: string; sort?: string; dir?: string; page?: number; pageSize?: number };
const SORTS: Record<string, string> = { name: 's.name', amc: 's.amc', nav: 'n.nav', chg: 'n.chg', chgPct: 'n.chg_pct', r1m: 'n.r1m', r3m: 'n.r3m', r6m: 'n.r6m', r1y: 'n.r1y', r3y: 'n.r3y', r5y: 'n.r5y' };
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function where(f: Filters, refDate?: string | null) {
  const w: string[] = ['s.active=1'], p: any[] = [];
  const plan = f.plan === 'Direct' || f.plan === 'Regular' ? f.plan : null;
  if (plan) { w.push('s.plan=?'); p.push(plan); }
  if (['Growth', 'IDCW', 'Bonus', 'Other'].includes(f.opt ?? '')) { w.push('s.opt=?'); p.push(f.opt); }
  if (f.amc) { w.push('s.amc=?'); p.push(f.amc); }
  if (f.main) { w.push('s.main_category=?'); p.push(f.main); }
  if (f.cat) { w.push('s.category_slug=?'); p.push(f.cat); }
  if (f.move === 'up') w.push('n.chg_pct > 0');
  if (f.move === 'down') w.push('n.chg_pct < 0');
  if (refDate) { w.push('n.nav_date=?'); p.push(refDate); }
  for (const t of (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) { w.push('(s.name LIKE ? OR s.amc LIKE ? OR s.isin_a = ?)'); p.push(like(t), like(t), t.toUpperCase()); }
  return { sql: w.join(' AND '), p };
}

export async function refDate(): Promise<string | null> {
  const [r] = await q<{ d: string | null }>('SELECT MAX(nav_date) d FROM nav_latest');
  return r?.d ?? null;
}

export async function listSchemes(f: Filters): Promise<{ rows: SchemeRow[]; total: number }> {
  const w = where(f);
  const sort = SORTS[f.sort ?? ''] ?? 's.name';
  const dir = f.dir === 'desc' ? 'DESC' : 'ASC';
  const size = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const off = (Math.max(1, f.page ?? 1) - 1) * size;
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*) n ${FROM} WHERE ${w.sql}`, w.p);
  const rows = await q<SchemeRow>(`SELECT ${SELECT} ${FROM} WHERE ${w.sql} ORDER BY (${sort} IS NULL), ${sort} ${dir}, s.name LIMIT ${size} OFFSET ${off}`, w.p);
  return { rows, total: n };
}

/** Top 10 gainers / losers: Regular Growth, same (latest) NAV date only */
export async function movers() {
  const d = await refDate();
  if (!d) return { date: null, gainers: [], losers: [] };
  const base = `SELECT ${SELECT} ${FROM} WHERE s.active=1 AND s.plan='Regular' AND s.opt='Growth' AND n.nav_date=? AND n.chg_pct IS NOT NULL`;
  const [gainers, losers] = await Promise.all([
    q<SchemeRow>(`${base} AND n.chg_pct > 0 ORDER BY n.chg_pct DESC LIMIT 10`, [d]),
    q<SchemeRow>(`${base} AND n.chg_pct < 0 ORDER BY n.chg_pct ASC LIMIT 10`, [d]),
  ]);
  return { date: d, gainers, losers };
}

export async function filterOptions() {
  const [amcs, cats] = await Promise.all([
    q<{ amc: string }>('SELECT DISTINCT amc FROM schemes WHERE active=1 ORDER BY amc'),
    q<{ slug: string; category: string; main: string; sub: string; n: number }>(
      'SELECT category_slug slug, category, main_category main, sub_category sub, COUNT(*) n FROM schemes WHERE active=1 GROUP BY category_slug, category, main_category, sub_category ORDER BY main_category, sub_category'),
  ]);
  return { amcs: amcs.map((a) => a.amc), categories: cats, mains: [...new Set(cats.map((c) => c.main))] };
}

export async function categoriesList() {
  return q<{ slug: string; category: string; main: string; sub: string; navDate: string | null; schemeCount: number; avg1d: number | null; median1d: number | null; gainers: number; losers: number; unchanged: number; computedAt: string; total: number }>(
    `SELECT c.category_slug slug, c.category, c.main_category main, c.sub_category sub, c.nav_date navDate, c.scheme_count schemeCount, c.avg_1d avg1d, c.median_1d median1d,
            c.gainers, c.losers, c.unchanged, c.computed_at computedAt,
            (SELECT COUNT(*) FROM schemes s WHERE s.category_slug=c.category_slug AND s.active=1) total
       FROM category_summary c ORDER BY c.main_category, c.sub_category`);
}

export async function categoryDetail(slug: string, plan = 'Regular', opt = 'Growth') {
  const [summary] = await q<any>('SELECT category_slug slug, category, main_category main, sub_category sub, nav_date navDate, scheme_count schemeCount, avg_1d avg1d, median_1d median1d, gainers, losers, unchanged, computed_at computedAt FROM category_summary WHERE category_slug=?', [slug]);
  if (!summary) return null;
  const { rows } = await listSchemes({ cat: slug, plan, opt, pageSize: 200, sort: 'name' });
  return { summary, rows };
}

export async function schemeDetail(code: number) {
  const [r] = await q<SchemeRow & { isinA: string | null; isinB: string | null; firstSeen: string; active: number }>(
    `SELECT ${SELECT}, s.isin_a AS isinA, s.isin_b AS isinB, s.first_seen AS firstSeen, s.active, s.scheme_type AS schemeType
       FROM schemes s LEFT JOIN nav_latest n ON n.scheme_code = s.scheme_code WHERE s.scheme_code=?`, [code]);
  return r ?? null;
}

const RANGE_MONTHS: Record<string, number | null> = { '1m': 1, '6m': 6, '1y': 12, '3y': 36, '5y': 60, max: null };
export const isRange = (r: string) => r in RANGE_MONTHS;

export async function history(code: number, range: string, max = 700): Promise<[number, number][]> {
  const m = RANGE_MONTHS[range];
  const params: any[] = [code];
  let cond = '';
  if (m) { cond = 'AND nav_date >= DATE_SUB((SELECT MAX(nav_date) FROM nav_history WHERE scheme_code=?), INTERVAL ? MONTH)'; params.push(code, m); }
  const rows = await q<{ d: string; nav: number }>(`SELECT nav_date d, nav FROM nav_history WHERE scheme_code=? ${cond} ORDER BY nav_date`, params);
  return downsample(rows.map((r) => [Date.parse(`${r.d}T00:00:00Z`), r.nav] as [number, number]), max);
}

export async function compare(codes: number[], range: string) {
  const uniq = [...new Set(codes)].slice(0, 5);
  const schemes: SchemeRow[] = [];
  for (const c of uniq) { const s = await schemeDetail(c); if (s && s.nav !== null) schemes.push(s); }
  const series = await Promise.all(schemes.map((s) => history(s.code, range, 2000)));
  const firsts = series.map((s) => s[0]?.[0]).filter((x): x is number => !!x);
  if (!firsts.length) return { schemes, rows: [] as any[], startDate: null as string | null };
  const start = Math.max(...firsts);
  const dates = [...new Set(series.flatMap((s) => s.map((p) => p[0]).filter((t) => t >= start)))].sort((a, b) => a - b);
  const idx = series.map(() => 0);
  const lastV: (number | null)[] = series.map(() => null);
  const base: (number | null)[] = series.map((s) => { let v: number | null = null; for (const p of s) { if (p[0] <= start) v = p[1]; else break; } return v; });
  const rows = dates.map((t) => {
    const row: Record<string, number | null> = { t };
    series.forEach((s, k) => {
      while (idx[k] < s.length && s[idx[k]][0] <= t) { lastV[k] = s[idx[k]][1]; idx[k]++; }
      row[`s${schemes[k].code}`] = lastV[k] !== null && base[k] ? Math.round((lastV[k]! / base[k]!) * 10000) / 100 : null;
    });
    return row;
  });
  const step = Math.ceil(rows.length / 500);
  return { schemes, rows: rows.filter((_, i) => i % step === 0 || i === rows.length - 1), startDate: new Date(start).toISOString().slice(0, 10) };
}

export async function search(qs: string, limit = 8) {
  const w = where({ q: qs, plan: 'Regular', opt: 'Growth' });
  return q<SchemeRow>(`SELECT ${SELECT} ${FROM} WHERE ${w.sql} ORDER BY s.name LIMIT ${Math.min(limit, 20)}`, w.p);
}

const iso = (s: string | null) => (s ? `${s.replace(' ', 'T')}Z` : null);

export async function status() {
  const [ds] = await q<{ data_as_of: string | null; last_checked_at: string | null; last_success_at: string | null; last_error: string | null }>("SELECT * FROM data_status WHERE source='amfi_nav'");
  const [last] = await q<{ status: string; finished_at: string | null; message: string }>("SELECT status, finished_at, message FROM job_runs WHERE job='nav-fetch' AND status<>'running' ORDER BY id DESC LIMIT 1");
  const [bf] = await q<{ total: number; done: number; failed: number; na: number; pending: number }>(
    "SELECT COUNT(*) total, SUM(status='done') done, SUM(status='failed') failed, SUM(status='na') na, SUM(status='pending') pending FROM backfill_state");
  const [cnt] = await q<{ n: number }>('SELECT COUNT(*) n FROM nav_latest');
  const lastSuccessAt = ds?.last_success_at ? Date.parse(iso(ds.last_success_at)!) : null;
  return {
    source: 'AMFI India — NAVAll.txt (amfiindia.com); history: mfapi.in',
    dataAsOf: ds?.data_as_of ?? null, lastChecked: iso(ds?.last_checked_at ?? null), lastSuccess: iso(ds?.last_success_at ?? null), lastError: ds?.last_error ?? null,
    stale: isStale({ lastSuccessAt, lastJobFailed: last?.status === 'failed' }), schemes: cnt?.n ?? 0,
    backfill: { total: bf?.total ?? 0, done: Number(bf?.done ?? 0), failed: Number(bf?.failed ?? 0), na: Number(bf?.na ?? 0), pending: Number(bf?.pending ?? 0) },
  };
}

export async function adminOverview() {
  const runs = await q<any>("SELECT id, job, slot, trigger_by trigger_by, started_at, finished_at, status, message FROM job_runs ORDER BY id DESC LIMIT 40");
  const lastByJob = await q<any>("SELECT j.job, j.status, j.started_at, j.finished_at, j.message FROM job_runs j JOIN (SELECT job, MAX(id) id FROM job_runs GROUP BY job) m ON m.id=j.id");
  const reviews = await q<any>("SELECT r.id, r.scheme_code code, s.name, r.nav_date, r.nav, r.prev_date, r.prev_nav, r.change_pct, r.created_at FROM nav_review r JOIN schemes s ON s.scheme_code=r.scheme_code WHERE r.status='pending' ORDER BY ABS(r.change_pct) DESC LIMIT 100");
  const failedBf = await q<any>("SELECT scheme_code code, attempts, last_error FROM backfill_state WHERE status='failed' ORDER BY updated_at DESC LIMIT 20");
  const [counts] = await q<{ schemes: number; active: number; withNav: number; history: number }>("SELECT (SELECT COUNT(*) FROM schemes) schemes, (SELECT COUNT(*) FROM schemes WHERE active=1) active, (SELECT COUNT(*) FROM nav_latest) withNav, (SELECT COUNT(*) FROM nav_history) history");
  const [missing] = await q<{ n: number }>('SELECT COUNT(DISTINCT s.scheme_code) n FROM schemes s JOIN nav_history h ON h.scheme_code=s.scheme_code LEFT JOIN nav_latest n ON n.scheme_code=s.scheme_code WHERE n.scheme_code IS NULL');
  return { counts: { ...counts, missingLatest: missing?.n ?? 0 }, runs: runs.map((r: any) => ({ ...r, started_at: iso(r.started_at), finished_at: iso(r.finished_at) })), lastByJob: lastByJob.map((r: any) => ({ ...r, started_at: iso(r.started_at), finished_at: iso(r.finished_at) })), reviews: reviews.map((r: any) => ({ ...r, created_at: iso(r.created_at) })), failedBackfill: failedBf, status: await status() };
}
