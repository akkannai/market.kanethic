import { bulk, exec, q, utcNow } from './db.ts';
import { parseNavAllFull, resolveOption, resolvePlan, type ParsedRow } from './classify.ts';
import { computeReturns, expectedNavDate, istDate, median, mean, oneDay, SLOTS, validateChange, pctChange, type NavRow, type Slot } from './calc.ts';
import { parseMfapi } from '../mfmath.ts';
import { alert } from './mail.ts';

const AMFI_URLS = ['https://www.amfiindia.com/spages/NAVAll.txt', 'https://portal.amfiindia.com/spages/NAVAll.txt'];
const HIST_YEARS = () => Number(process.env.BACKFILL_YEARS) || 5;
const MIN_ROWS = () => Number(process.env.MIN_NAV_ROWS) || 1000;
const DAY = 86400_000;

export type JobResult = { status: 'ok' | 'nochange' | 'waiting' | 'failed' | 'skipped'; message: string; stats?: Record<string, number | string> };

// ------------------------------------------------------------------ run log + lock
async function startRun(job: string, slot: string | null, trigger: 'cron' | 'manual') {
  const r = await exec("INSERT INTO job_runs (job, slot, trigger_by, started_at, status) VALUES (?,?,?,?, 'running')", [job, slot, trigger, utcNow()]);
  return r.insertId;
}
async function finishRun(id: number, res: JobResult) {
  await exec('UPDATE job_runs SET finished_at=?, status=?, message=?, stats=? WHERE id=?', [utcNow(), res.status, res.message.slice(0, 2000), res.stats ? JSON.stringify(res.stats) : null, id]);
}
async function acquire(name: string, ttlMs: number): Promise<boolean> {
  const until = new Date(Date.now() + ttlMs).toISOString().slice(0, 19).replace('T', ' ');
  await exec('INSERT IGNORE INTO job_locks (name, locked_until) VALUES (?,?)', [name, '1970-01-01 00:00:01']);
  const r = await exec('UPDATE job_locks SET locked_until=? WHERE name=? AND locked_until < UTC_TIMESTAMP()', [until, name]);
  return r.affectedRows === 1;
}
const release = (name: string) => exec("UPDATE job_locks SET locked_until='1970-01-01 00:00:01' WHERE name=?", [name]);

async function markStatus(p: { asOf?: string | null; checked?: boolean; success?: boolean; error?: string | null }) {
  const now = utcNow();
  await exec(
    `INSERT INTO data_status (source, data_as_of, last_checked_at, last_success_at, last_error) VALUES ('amfi_nav', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE data_as_of=COALESCE(VALUES(data_as_of), data_as_of), last_checked_at=VALUES(last_checked_at),
       last_success_at=IF(?, VALUES(last_success_at), last_success_at), last_error=VALUES(last_error)`,
    [p.asOf ?? null, p.checked === false ? null : now, p.success ? now : null, p.error ?? null, p.success ? 1 : 0],
  );
}

// ------------------------------------------------------------------ latest/returns recompute
export async function recomputeLatest(codes: number[]) {
  if (!codes.length) return;
  for (let i = 0; i < codes.length; i += 250) {
    const part = codes.slice(i, i + 250);
    const [{ d: maxD }] = await q<{ d: string | null }>('SELECT MAX(nav_date) d FROM nav_history WHERE scheme_code IN (?)', [part]);
    if (!maxD) continue;
    const since = new Date(Date.parse(maxD) - (6 * 366 + 10) * DAY).toISOString().slice(0, 10); // series ni latest date thi (aaj thi nahi)
    const rows = await q<{ scheme_code: number; nav_date: string; nav: number }>(
      'SELECT scheme_code, nav_date, nav FROM nav_history WHERE scheme_code IN (?) AND nav_date >= ? ORDER BY scheme_code, nav_date', [part, since]);
    const by = new Map<number, NavRow[]>();
    for (const r of rows) (by.get(r.scheme_code) ?? by.set(r.scheme_code, []).get(r.scheme_code)!).push({ date: r.nav_date, nav: r.nav });
    const out: any[][] = [];
    for (const [code, series] of by) {
      const d = oneDay(series);
      const last = series[series.length - 1];
      const r = computeReturns(series);
      out.push([code, last.date, last.nav, d?.prevDate ?? null, d?.prevNav ?? null, d?.chg ?? null, d?.pct ?? null, r.r1m, r.r3m, r.r6m, r.r1y, r.r3y, r.r5y]);
    }
    await bulk(
      `INSERT INTO nav_latest (scheme_code, nav_date, nav, prev_date, prev_nav, chg, chg_pct, r1m, r3m, r6m, r1y, r3y, r5y) VALUES ?
       ON DUPLICATE KEY UPDATE nav_date=VALUES(nav_date), nav=VALUES(nav), prev_date=VALUES(prev_date), prev_nav=VALUES(prev_nav), chg=VALUES(chg), chg_pct=VALUES(chg_pct),
         r1m=VALUES(r1m), r3m=VALUES(r3m), r6m=VALUES(r6m), r1y=VALUES(r1y), r3y=VALUES(r3y), r5y=VALUES(r5y)`, out, 500);
  }
}

// ------------------------------------------------------------------ category summary (Regular Growth only, same NAV date only)
export async function computeCategorySummary() {
  const [ref] = await q<{ d: string | null }>('SELECT MAX(nav_date) d FROM nav_latest');
  const refDate = ref?.d ?? null;
  const rows = await q<{ category_slug: string; category: string; main_category: string; sub_category: string; nav_date: string | null; chg_pct: number | null }>(
    `SELECT s.category_slug, s.category, s.main_category, s.sub_category, n.nav_date, n.chg_pct
       FROM schemes s LEFT JOIN nav_latest n ON n.scheme_code = s.scheme_code
      WHERE s.plan='Regular' AND s.opt='Growth' AND s.active=1`);
  const cats = new Map<string, { category: string; main: string; sub: string; changes: number[]; count: number }>();
  for (const r of rows) {
    const c = cats.get(r.category_slug) ?? cats.set(r.category_slug, { category: r.category, main: r.main_category, sub: r.sub_category, changes: [], count: 0 }).get(r.category_slug)!;
    if (r.nav_date === refDate && r.chg_pct !== null) { c.count++; c.changes.push(Number(r.chg_pct)); }
  }
  const now = utcNow();
  const out = [...cats].map(([slug, c]) => {
    const g = c.changes.filter((x) => x > 0).length, l = c.changes.filter((x) => x < 0).length;
    return [slug, c.category, c.main, c.sub, refDate, c.count, mean(c.changes), median(c.changes), g, l, c.changes.length - g - l, now];
  });
  await exec('DELETE FROM category_summary');
  await bulk('INSERT INTO category_summary (category_slug, category, main_category, sub_category, nav_date, scheme_count, avg_1d, median_1d, gainers, losers, unchanged, computed_at) VALUES ?', out, 500);
  return out.length;
}

// ------------------------------------------------------------------ NAV fetch job
export async function fetchAmfiText(): Promise<string> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of AMFI_URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', accept: 'text/plain,*/*', referer: 'https://www.amfiindia.com/' },
          signal: AbortSignal.timeout(60_000), cache: 'no-store',
        });
        if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
        const body = await res.text();
        // Parse na thay to kaaran dekhay e mate response no namuno (content-type, size, shuruat) saath ma
        (globalThis as any).__amfiSample = `${new URL(url).host} HTTP ${res.status} ${res.headers.get('content-type') ?? '?'} ${body.length} bytes: ${JSON.stringify(body.slice(0, 160))}`;
        return body;
      } catch (e) { last = e; }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const priorityOf = (plan: string, opt: string) => (plan === 'Regular' && opt === 'Growth' ? 0 : plan === 'Regular' ? 1 : opt === 'Growth' ? 2 : 3);

export async function runNavFetch(o: { slot?: Slot | null; trigger?: 'cron' | 'manual'; text?: string; now?: Date } = {}): Promise<JobResult> {
  const trigger = o.trigger ?? 'cron';
  const slot = o.slot ?? null;
  const runId = await startRun('nav-fetch', slot, trigger);
  if (!(await acquire('nav-fetch', 20 * 60_000))) {
    const res: JobResult = { status: 'skipped', message: 'Another nav-fetch run is in progress' };
    await finishRun(runId, res);
    return res;
  }
  try {
    const now = o.now ?? new Date();
    const expected = expectedNavDate(now);
    const [{ d: dbMax }] = await q<{ d: string | null }>('SELECT MAX(nav_date) d FROM nav_latest');
    if (slot && slot !== '23:00' && dbMax && dbMax >= expected) {
      await markStatus({ success: true });
      const res: JobResult = { status: 'skipped', message: `Already have NAV for ${dbMax} (expected ${expected})` };
      await finishRun(runId, res);
      return res;
    }
    await markStatus({ error: null, success: false });
    const text = o.text ?? (await fetchAmfiText());
    const { rows, skipped } = parseNavAllFull(text);
    if (rows.length < MIN_ROWS()) throw new Error(`AMFI file looks incomplete: only ${rows.length} schemes parsed (min ${MIN_ROWS()}; ${skipped} lines skipped). Response: ${(globalThis as any).__amfiSample ?? `${text.length} bytes ${JSON.stringify(text.slice(0, 160))}`}`);

    // Dedupe by scheme code (last wins)
    const byCode = new Map<number, ParsedRow>();
    for (const r of rows) byCode.set(r.code, r);
    const latest = new Map<number, { date: string; nav: number }>();
    for (const r of await q<{ scheme_code: number; nav_date: string; nav: number }>('SELECT scheme_code, nav_date, nav FROM nav_latest')) latest.set(r.scheme_code, { date: r.nav_date, nav: r.nav });
    const known = new Set((await q<{ scheme_code: number }>('SELECT scheme_code FROM schemes')).map((r) => r.scheme_code));

    const today = istDate(now);
    const schemeRows: any[][] = [], hist: any[][] = [], reviews: any[][] = [], accepted: number[] = [], gaps: number[] = [], fresh: number[] = [];
    let unchanged = 0;
    for (const r of byCode.values()) {
      const plan = resolvePlan(r.planCol, r.name), opt = resolveOption(r.optCol, r.name);
      schemeRows.push([r.code, r.isinA, r.isinB, r.name, r.amc, r.schemeType, r.main, r.sub, r.category, r.categorySlug, plan, opt, today, today]);
      if (!known.has(r.code)) fresh.push(r.code);
      const last = latest.get(r.code);
      if (last && r.date <= last.date) { unchanged++; continue; }
      if (validateChange(r.nav, last?.nav ?? null) === 'review') {
        reviews.push([r.code, r.date, r.nav, last!.date, last!.nav, pctChange(r.nav, last!.nav), utcNow()]);
        continue;
      }
      hist.push([r.code, r.date, r.nav, 'amfi']);
      accepted.push(r.code);
      if (last && (Date.parse(r.date) - Date.parse(last.date)) / DAY > 6) gaps.push(r.code);
    }

    await bulk(
      `INSERT INTO schemes (scheme_code, isin_a, isin_b, name, amc, scheme_type, main_category, sub_category, category, category_slug, plan, opt, first_seen, last_seen) VALUES ?
       ON DUPLICATE KEY UPDATE isin_a=VALUES(isin_a), isin_b=VALUES(isin_b), name=VALUES(name), amc=VALUES(amc), scheme_type=VALUES(scheme_type), main_category=VALUES(main_category),
         sub_category=VALUES(sub_category), category=VALUES(category), category_slug=VALUES(category_slug), plan=VALUES(plan), opt=VALUES(opt), last_seen=VALUES(last_seen), active=1`, schemeRows, 500);
    if (fresh.length) {
      const seed = fresh.map((c) => { const r = byCode.get(c)!; return [c, priorityOf(resolvePlan(r.planCol, r.name), resolveOption(r.optCol, r.name))]; });
      await bulk("INSERT IGNORE INTO backfill_state (scheme_code, priority) VALUES ?", seed, 1000);
    }
    await bulk('INSERT IGNORE INTO nav_history (scheme_code, nav_date, nav, source) VALUES ?', hist, 1000);
    await bulk('INSERT IGNORE INTO nav_review (scheme_code, nav_date, nav, prev_date, prev_nav, change_pct, created_at) VALUES ?', reviews, 500);
    await recomputeLatest(accepted);
    if (gaps.length) await exec("UPDATE backfill_state SET status='pending', attempts=0 WHERE scheme_code IN (?)", [gaps]); // gap repair
    await exec('UPDATE schemes SET active=0 WHERE last_seen < ?', [new Date(Date.parse(today) - 30 * DAY).toISOString().slice(0, 10)]);
    const cats = await computeCategorySummary();

    const [{ d: asOf }] = await q<{ d: string | null }>('SELECT MAX(nav_date) d FROM nav_latest');
    await markStatus({ asOf, success: true, error: null });
    const stats = { schemesInFile: byCode.size, parsedRows: rows.length, skippedLines: skipped, newNavs: accepted.length, unchanged, queuedForReview: reviews.length, newSchemes: fresh.length, gapRepairs: gaps.length, categories: cats, dataAsOf: asOf ?? '' };
    let res: JobResult;
    if (accepted.length) res = { status: 'ok', message: `Loaded ${accepted.length} new NAVs (data as of ${asOf}); ${reviews.length} queued for review`, stats };
    else if (!dbMax || dbMax < expected) res = { status: SLOTS[slot as Slot] === true || trigger === 'manual' ? 'nochange' : 'waiting', message: `No newer NAV than ${dbMax ?? 'none'} (expected ${expected}). ${SLOTS[slot as Slot] ? 'Market holiday or AMFI delay.' : 'Will retry.'}`, stats };
    else res = { status: 'nochange', message: `No new NAV; database already has ${dbMax}`, stats };
    await finishRun(runId, res);
    if (reviews.length) await alert('review', `${reviews.length} NAV change(s) above ±20% need review`, `${reviews.length} scheme NAV(s) moved more than ±20% vs the previous NAV and were NOT published. Review them in the admin panel.`);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markStatus({ error: msg, success: false }).catch(() => {});
    const res: JobResult = { status: 'failed', message: msg };
    await finishRun(runId, res).catch(() => {});
    await alert('nav-fetch', 'NAV fetch FAILED', `The nav-fetch job (slot ${slot ?? 'manual'}) failed at ${new Date().toISOString()}.\n\n${msg}\n\nThe website keeps showing the last good data with a "stale" badge.`).catch(() => {});
    return res;
  } finally {
    await release('nav-fetch').catch(() => {});
  }
}

// ------------------------------------------------------------------ review approve / reject
export async function reviewAction(id: number, action: 'approve' | 'reject') {
  const [r] = await q<{ scheme_code: number; nav_date: string; nav: number; status: string }>('SELECT scheme_code, nav_date, nav, status FROM nav_review WHERE id=?', [id]);
  if (!r || r.status !== 'pending') return false;
  if (action === 'approve') {
    await exec("INSERT IGNORE INTO nav_history (scheme_code, nav_date, nav, source) VALUES (?,?,?, 'manual')", [r.scheme_code, r.nav_date, r.nav]);
    await recomputeLatest([r.scheme_code]);
    await computeCategorySummary();
  }
  await exec('UPDATE nav_review SET status=?, reviewed_at=? WHERE id=?', [action === 'approve' ? 'approved' : 'rejected', utcNow(), id]);
  return true;
}

// ------------------------------------------------------------------ backfill (mfapi.in, 5 years)
export async function seedBackfill() {
  await exec(`INSERT IGNORE INTO backfill_state (scheme_code, priority)
    SELECT scheme_code, CASE WHEN plan='Regular' AND opt='Growth' THEN 0 WHEN plan='Regular' THEN 1 WHEN opt='Growth' THEN 2 ELSE 3 END FROM schemes`);
}

export async function fetchMfapi(code: number): Promise<any> {
  const res = await fetch(`https://api.mfapi.in/mf/${code}`, { headers: { 'user-agent': 'KanethicMFI/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(45_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function runBackfill(o: { trigger?: 'cron' | 'manual'; maxMs?: number; concurrency?: number; fetchJson?: (code: number) => Promise<any>; limit?: number } = {}): Promise<JobResult> {
  const trigger = o.trigger ?? 'cron';
  const maxMs = o.maxMs ?? 25 * 60_000;
  const runId = await startRun('backfill', null, trigger);
  if (!(await acquire('backfill', maxMs + 5 * 60_000))) {
    const res: JobResult = { status: 'skipped', message: 'Another backfill run is in progress' };
    await finishRun(runId, res);
    return res;
  }
  const started = Date.now();
  let done = 0, failed = 0, na = 0, rowsLoaded = 0;
  try {
    await seedBackfill();
    const getJson = o.fetchJson ?? fetchMfapi;
    const conc = o.concurrency ?? 3;
    while (Date.now() - started < maxMs && (o.limit === undefined || done + failed + na < o.limit)) {
      const batch = await q<{ scheme_code: number }>(
        `SELECT scheme_code FROM backfill_state WHERE status='pending' OR (status='failed' AND attempts<4 AND updated_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE)
         ORDER BY priority, scheme_code LIMIT ${Math.min(30, o.limit ?? 30)}`);
      if (!batch.length) break;
      const touched: number[] = [];
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(conc, batch.length) }, async () => {
        while (i < batch.length) {
          const code = batch[i++].scheme_code;
          try {
            const { points } = parseMfapi(await getJson(code));
            const cutoff = new Date(points[points.length - 1][0] - (HIST_YEARS() * 366 + 20) * DAY).toISOString().slice(0, 10); // series ni latest date thi 5 varsh (+buffer)
            const keep = points.filter((p) => new Date(p[0]).toISOString().slice(0, 10) >= cutoff);
            if (!keep.length) { await exec("UPDATE backfill_state SET status='na', last_error='No history in range' WHERE scheme_code=?", [code]); na++; continue; }
            await bulk("INSERT IGNORE INTO nav_history (scheme_code, nav_date, nav, source) VALUES ?", keep.map((p) => [code, new Date(p[0]).toISOString().slice(0, 10), p[1], 'mfapi']), 1000);
            await exec("UPDATE backfill_state SET status='done', last_error=NULL, history_from=?, rows_loaded=? WHERE scheme_code=?", [new Date(keep[0][0]).toISOString().slice(0, 10), keep.length, code]);
            rowsLoaded += keep.length; touched.push(code); done++;
          } catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 250);
            const noData = /No (NAV history|valid NAV)/.test(msg);
            await exec("UPDATE backfill_state SET status=?, attempts=attempts+1, last_error=? WHERE scheme_code=?", [noData ? 'na' : 'failed', msg, code]);
            if (noData) na++; else failed++;
          }
          await new Promise((r) => setTimeout(r, Number(process.env.BACKFILL_DELAY_MS ?? 150)));
        }
      }));
      await recomputeLatest(touched);
    }
    if (done) await computeCategorySummary();
    const [left] = await q<{ n: number }>("SELECT COUNT(*) n FROM backfill_state WHERE status='pending' OR (status='failed' AND attempts<4)");
    const res: JobResult = done + failed + na === 0
      ? { status: 'nochange', message: 'Nothing left to backfill', stats: { remaining: left.n } }
      : { status: failed && !done ? 'failed' : 'ok', message: `Backfilled ${done} schemes (${rowsLoaded} NAV rows), ${na} without history, ${failed} failed; ${left.n} remaining`, stats: { done, failed, na, rowsLoaded, remaining: left.n } };
    await finishRun(runId, res);
    if (res.status === 'failed') await alert('backfill', 'Backfill FAILED', res.message);
    return res;
  } catch (e) {
    const res: JobResult = { status: 'failed', message: e instanceof Error ? e.message : String(e) };
    await finishRun(runId, res).catch(() => {});
    await alert('backfill', 'Backfill FAILED', res.message).catch(() => {});
    return res;
  } finally {
    await release('backfill').catch(() => {});
  }
}

// ------------------------------------------------------------------ rebuild nav_latest / returns for every scheme that has history
export async function runRecompute(o: { trigger?: 'cron' | 'manual'; onlyMissing?: boolean } = {}): Promise<JobResult> {
  const runId = await startRun('recompute', null, o.trigger ?? 'manual');
  if (!(await acquire('recompute', 30 * 60_000))) {
    const res: JobResult = { status: 'skipped', message: 'Another recompute is running' };
    await finishRun(runId, res);
    return res;
  }
  try {
    const codes = (await q<{ scheme_code: number }>(
      o.onlyMissing
        ? 'SELECT DISTINCT h.scheme_code FROM nav_history h LEFT JOIN nav_latest n ON n.scheme_code=h.scheme_code WHERE n.scheme_code IS NULL'
        : 'SELECT DISTINCT scheme_code FROM nav_history')).map((r) => r.scheme_code);
    await recomputeLatest(codes);
    const cats = await computeCategorySummary();
    const [{ d: asOf }] = await q<{ d: string | null }>('SELECT MAX(nav_date) d FROM nav_latest');
    const [c] = await q<{ n: number }>('SELECT COUNT(*) n FROM nav_latest');
    const res: JobResult = { status: 'ok', message: `Recomputed ${codes.length} schemes; ${c.n} now have latest NAV (as of ${asOf}); ${cats} categories`, stats: { recomputed: codes.length, withLatest: c.n, categories: cats } };
    await finishRun(runId, res);
    return res;
  } catch (e) {
    const res: JobResult = { status: 'failed', message: e instanceof Error ? e.message : String(e) };
    await finishRun(runId, res).catch(() => {});
    return res;
  } finally {
    await release('recompute').catch(() => {});
  }
}
