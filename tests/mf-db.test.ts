// Integration test: real MySQL/MariaDB chhe tyare j chale (DB_TEST_HOST set). AMFI/mfapi ne fixtures thi fake karya chhe (offline).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const HOST = process.env.DB_TEST_HOST;
const skip = !HOST;
let jobs: typeof import('../lib/mf/jobs.ts');
let dbm: typeof import('../lib/mf/db.ts');

const file = (date: string, navs: Record<number, number | string>) => `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Large Cap Fund)

Alpha Mutual Fund

100001;INF000A01011;-;Alpha Large Cap Fund - Regular Plan - Growth;${navs[100001]};${date}
100002;INF000A01029;-;Alpha Large Cap Fund - Regular Plan - IDCW;${navs[100002]};${date}
100003;INF000A01037;-;Alpha Large Cap Fund - Direct Plan - Growth;${navs[100003]};${date}
100004;INF000A01045;-;Alpha Large Cap Fund - Regular Plan - Growth Option B;${navs[100004]};${date}

Open Ended Schemes(Debt Scheme - Liquid Fund)

Beta Mutual Fund

200001;INF000B01011;-;Beta Liquid Fund - Regular Plan - Growth;${navs[200001]};${date}
`;

before(async () => {
  if (skip) return;
  Object.assign(process.env, { DB_HOST: HOST, DB_PORT: process.env.DB_TEST_PORT ?? '3307', DB_USER: process.env.DB_TEST_USER ?? 'kmfi', DB_PASSWORD: process.env.DB_TEST_PASSWORD ?? '', DB_NAME: process.env.DB_TEST_NAME ?? 'kmfi', MIN_NAV_ROWS: '3', BACKFILL_DELAY_MS: '0', DISABLE_AUTO_METRICS: '1' });
  dbm = await import('../lib/mf/db.ts');
  jobs = await import('../lib/mf/jobs.ts');
  await dbm.ready();
  for (const t of ['schemes', 'nav_history', 'nav_latest', 'category_summary', 'job_runs', 'job_locks', 'data_status', 'nav_review', 'backfill_state']) await dbm.exec(`DELETE FROM ${t}`);
});
after(async () => { if (!skip) await dbm.db().end(); });

test('db: Friday load -> weekend gap -> Monday 1D uses Friday; >20% queued; Direct excluded from category summary', { skip }, async () => {
  const fri = await jobs.runNavFetch({ trigger: 'manual', text: file('17-Oct-2025', { 100001: 100, 100002: 50, 100003: 120, 100004: 10, 200001: 1000 }) });
  assert.equal(fri.status, 'ok');
  const mon = await jobs.runNavFetch({ trigger: 'manual', text: file('20-Oct-2025', { 100001: 102, 100002: 49.5, 100003: 121, 100004: 13, 200001: 1000.5 }) });
  assert.equal(mon.status, 'ok'); assert.equal(mon.stats!.queuedForReview, 1); // 100004: 10 -> 13 (+30%)
  const rows = await dbm.q<any>('SELECT * FROM nav_latest ORDER BY scheme_code');
  const a = rows.find((r) => r.scheme_code === 100001);
  assert.equal(a.nav_date, '2025-10-20'); assert.equal(a.prev_date, '2025-10-17'); assert.ok(Math.abs(a.chg_pct - 2) < 1e-6); assert.ok(Math.abs(a.chg - 2) < 1e-9);
  const held = rows.find((r) => r.scheme_code === 100004);
  assert.equal(held.nav_date, '2025-10-17'); assert.equal(held.nav, 10); // suspicious NAV published nathi
  const review = await dbm.q<any>("SELECT * FROM nav_review WHERE status='pending'");
  assert.equal(review.length, 1); assert.equal(review[0].scheme_code, 100004);
  // category summary: Regular Growth only (100001 + 100004 are Regular Growth, 100002 IDCW and 100003 Direct excluded), same NAV date only
  const [cat] = await dbm.q<any>("SELECT * FROM category_summary WHERE category_slug='equity-scheme-large-cap-fund'");
  assert.equal(cat.nav_date, '2025-10-20'); assert.equal(cat.scheme_count, 1); assert.ok(Math.abs(cat.avg_1d - 2) < 1e-6);
  const status = (await dbm.q<any>("SELECT * FROM data_status WHERE source='amfi_nav'"))[0];
  assert.equal(status.data_as_of, '2025-10-20'); assert.equal(status.last_error, null); assert.ok(status.last_success_at);
});

test('db: same file again = nochange; failed fetch keeps data and records error', { skip }, async () => {
  const again = await jobs.runNavFetch({ trigger: 'manual', text: file('20-Oct-2025', { 100001: 102, 100002: 49.5, 100003: 121, 100004: 13, 200001: 1000.5 }) });
  assert.equal(again.status, 'nochange');
  const before = await dbm.q<any>('SELECT COUNT(*) n, MAX(nav_date) d FROM nav_history');
  const bad = await jobs.runNavFetch({ trigger: 'manual', text: '<html>Service unavailable</html>' });
  assert.equal(bad.status, 'failed');
  const after = await dbm.q<any>('SELECT COUNT(*) n, MAX(nav_date) d FROM nav_history');
  assert.deepEqual(after, before);
  const st = (await dbm.q<any>("SELECT * FROM data_status WHERE source='amfi_nav'"))[0];
  assert.match(st.last_error, /incomplete/); assert.equal(st.data_as_of, '2025-10-20');
});

test('db: approve review publishes NAV; reject discards', { skip }, async () => {
  const [r] = await dbm.q<any>("SELECT id FROM nav_review WHERE status='pending'");
  assert.equal(await jobs.reviewAction(r.id, 'approve'), true);
  const [n] = await dbm.q<any>('SELECT * FROM nav_latest WHERE scheme_code=100004');
  assert.equal(n.nav_date, '2025-10-20'); assert.equal(n.prev_date, '2025-10-17'); assert.ok(Math.abs(n.chg_pct - 30) < 1e-6);
  assert.equal(await jobs.reviewAction(r.id, 'reject'), false); // already reviewed
});

test('db: backfill loads history, computes returns, marks states, is resumable', { skip }, async () => {
  const mk = (code: number) => {
    const data: { date: string; nav: string }[] = [];
    const end = Date.UTC(2025, 9, 20);
    for (let d = 0; d <= 365 * 6; d++) { const t = new Date(end - d * 86400_000); if (t.getUTCDay() % 6 === 0) continue; data.push({ date: `${String(t.getUTCDate()).padStart(2, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${t.getUTCFullYear()}`, nav: (102 * 1.1 ** (-d / 365)).toFixed(4) }); } // AMFI Monday NAV (102) sathe consistent
    return { meta: { scheme_name: `S${code}` }, data };
  };
  const fetchJson = async (code: number) => { if (code === 100002) throw new Error('HTTP 503'); if (code === 200001) return { meta: {}, data: [] }; return mk(code); };
  const res = await jobs.runBackfill({ trigger: 'manual', fetchJson, concurrency: 2, maxMs: 60_000 });
  assert.ok(['ok', 'failed'].includes(res.status));
  const st = await dbm.q<any>('SELECT scheme_code, status FROM backfill_state ORDER BY scheme_code');
  const by = Object.fromEntries(st.map((s) => [s.scheme_code, s.status]));
  assert.equal(by[100001], 'done'); assert.equal(by[100002], 'failed'); assert.equal(by[200001], 'na');
  const [n] = await dbm.q<any>('SELECT * FROM nav_latest WHERE scheme_code=100001');
  assert.ok(Math.abs(n.r1y - 10) < 0.3); assert.ok(Math.abs(n.r3y - 10) < 0.3); assert.ok(Math.abs(n.r5y - 10) < 0.3); assert.ok(n.r1m > 0.5 && n.r1m < 1.2);
  assert.equal(n.nav_date, '2025-10-20'); // AMFI ni latest NAV tuti nathi
  const [h] = await dbm.q<any>('SELECT MIN(nav_date) mn, COUNT(*) n FROM nav_history WHERE scheme_code=100001');
  assert.ok(h.mn <= '2020-10-01' && h.mn >= '2020-09-01', h.mn); assert.ok(h.n > 1000);
  // retry: failed one is not retried within 10 minutes (resumable, no hammering)
  const again = await jobs.runBackfill({ trigger: 'manual', fetchJson, maxMs: 5_000 });
  assert.equal(again.status, 'nochange');
});

test('db: job lock prevents overlapping runs', { skip }, async () => {
  await dbm.exec("INSERT INTO job_locks (name, locked_until) VALUES ('nav-fetch', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE locked_until=VALUES(locked_until)");
  const r = await jobs.runNavFetch({ trigger: 'manual', text: 'x' });
  assert.equal(r.status, 'skipped');
  await dbm.exec("UPDATE job_locks SET locked_until='1970-01-01 00:00:01' WHERE name='nav-fetch'");
});

// ---- failure email: real SMTP conversation against a tiny in-process SMTP server
test('alert: failed NAV fetch sends an email to ALERT_EMAIL (SMTP dialogue)', { skip }, async () => {
  const net = await import('node:net');
  const received: string[] = [];
  const server = net.createServer((sock) => {
    let data = false, buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === '.') { data = false; sock.write('250 queued\r\n'); } else received.push(line); continue; }
        const u = line.toUpperCase();
        if (u.startsWith('EHLO')) sock.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (u.startsWith('AUTH')) sock.write('235 ok\r\n');
        else if (u.startsWith('MAIL') || u.startsWith('RCPT')) { received.push(line); sock.write('250 ok\r\n'); }
        else if (u === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (u === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as import('node:net').AddressInfo).port;
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'noreply@kanethic.com' });
  delete process.env.ALERT_EMAIL;
  await dbm.exec("DELETE FROM data_status WHERE source LIKE 'alert:%'");
  const res = await jobs.runNavFetch({ trigger: 'manual', text: 'service unavailable' });
  assert.equal(res.status, 'failed');
  const mail = received.join('\n');
  assert.match(mail, /RCPT TO:<alpesh@kanethic\.com>/i); assert.match(mail, /NAV fetch FAILED/); assert.match(mail, /stale/i);
  // throttled: a second failure within 3h does not send another email
  const before = received.length;
  await jobs.runNavFetch({ trigger: 'manual', text: 'still down' });
  assert.equal(received.length, before);
  server.close();
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[k];
});

test('db: recompute rebuilds missing nav_latest rows from history', { skip }, async () => {
  const [before] = await dbm.q<any>('SELECT COUNT(*) n FROM nav_latest');
  await dbm.exec('DELETE FROM nav_latest WHERE scheme_code IN (100001, 200001)');
  const r = await jobs.runRecompute({ trigger: 'manual', onlyMissing: true });
  assert.equal(r.status, 'ok');
  const [after] = await dbm.q<any>('SELECT COUNT(*) n FROM nav_latest');
  assert.equal(after.n, before.n);
  const [n] = await dbm.q<any>('SELECT * FROM nav_latest WHERE scheme_code=100001');
  assert.ok(n.prev_date && n.chg_pct !== null);
});

test('db: stale/closed scheme (very old last NAV) still gets nav_latest, but is inactive', { skip }, async () => {
  await dbm.exec("INSERT INTO schemes (scheme_code, name, amc, scheme_type, main_category, sub_category, category, category_slug, plan, opt, first_seen, last_seen) VALUES (300001,'Old FMP - Regular - Growth','Beta Mutual Fund','Close Ended','Debt Scheme','Fixed Term Plan','Debt Scheme - Fixed Term Plan','debt-scheme-fixed-term-plan','Regular','Growth','2019-01-01','2025-10-20')");
  await dbm.exec("INSERT INTO nav_history (scheme_code, nav_date, nav, source) VALUES (300001,'2019-03-01',10,'amfi'),(300001,'2019-03-04',10.1,'amfi'),(300001,'2019-03-05',10.2,'amfi')");
  const r = await jobs.runRecompute({ trigger: 'manual', onlyMissing: true });
  assert.equal(r.status, 'ok');
  const [n] = await dbm.q<any>('SELECT * FROM nav_latest WHERE scheme_code=300001');
  assert.equal(n.nav_date, '2019-03-05'); assert.equal(n.prev_date, '2019-03-04');
  const [s] = await dbm.q<any>('SELECT active FROM schemes WHERE scheme_code=300001');
  assert.equal(s.active, 0);
  const [live] = await dbm.q<any>('SELECT active FROM schemes WHERE scheme_code=100001');
  assert.equal(live.active, 1);
});

test('db: admin overview reports cron health (last cron run, rejected calls, expected date)', { skip }, async () => {
  const qs = await import('../lib/mf/queries.ts');
  await dbm.exec("DELETE FROM job_runs");
  let o: any = await qs.adminOverview();
  assert.equal(o.cron.lastNavFetch, null); assert.equal(o.cron.rejected24h, 0); assert.match(o.cron.expectedNavDate, /^\d{4}-\d{2}-\d{2}$/);
  await dbm.exec("INSERT INTO job_runs (job, trigger_by, started_at, finished_at, status, message) VALUES ('nav-fetch','cron',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'ok','x'), ('cron-auth','cron',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'failed','bad secret')");
  o = await qs.adminOverview();
  assert.ok(o.cron.lastNavFetch); assert.equal(o.cron.rejected24h, 1);
});

test('db: retry slot is NOT skipped while AMFI has published only part of the day (coverage < 97%)', { skip }, async () => {
  for (const t of ['schemes', 'nav_history', 'nav_latest', 'category_summary', 'nav_review', 'backfill_state', 'job_runs']) await dbm.exec(`DELETE FROM ${t}`);
  const night = new Date('2025-10-20T18:30:00Z'); // Mon 23:30 IST -> expected 2025-10-20
  const all = (d: string, n: Record<number, number>) => file(d, n);
  await jobs.runNavFetch({ trigger: 'cron', slot: '23:00', now: night, text: all('17-Oct-2025', { 100001: 100, 100002: 50, 100003: 120, 100004: 10, 200001: 1000 }) });
  // Monday: only one AMC has published so far (others still show Friday)
  const partial = file('20-Oct-2025', { 100001: 101, 100002: 50, 100003: 120, 100004: 10, 200001: 1000 }).replace(/100002;[^\n]*20-Oct-2025/, (m) => m.replace('20-Oct-2025', '17-Oct-2025')).replace(/100003;[^\n]*20-Oct-2025/, (m) => m.replace('20-Oct-2025', '17-Oct-2025')).replace(/100004;[^\n]*20-Oct-2025/, (m) => m.replace('20-Oct-2025', '17-Oct-2025')).replace(/200001;[^\n]*20-Oct-2025/, (m) => m.replace('20-Oct-2025', '17-Oct-2025'));
  const r1 = await jobs.runNavFetch({ trigger: 'cron', slot: '23:00', now: night, text: partial });
  assert.equal(r1.status, 'ok'); assert.equal(r1.stats!.newNavs, 1);
  const r2 = await jobs.runNavFetch({ trigger: 'cron', slot: '23:45', now: night, text: file('20-Oct-2025', { 100001: 101, 100002: 50.5, 100003: 121, 100004: 10.2, 200001: 1000.1 }) });
  assert.equal(r2.status, 'ok'); assert.equal(r2.stats!.newNavs, 4); // retry ran and loaded the rest
  const r3 = await jobs.runNavFetch({ trigger: 'cron', slot: '07:00', now: night, text: 'x' }); // ab 100% -> skip (file ni jarur nathi)
  assert.equal(r3.status, 'skipped');
});

// ---- Phase 2A: risk metrics job, risk-free setting, peer ranking, analytics from DB
test('db: risk-free validation + metrics job + peers + analytics (real history)', { skip }, async () => {
  const st = await import('../lib/mf/settings.ts');
  const qs = await import('../lib/mf/queries.ts');
  assert.equal(typeof st.validateRiskFree('abc', '2025-10-17', ''), 'string'); assert.equal(typeof st.validateRiskFree(20, '2025-10-17', ''), 'string'); assert.equal(typeof st.validateRiskFree(6, '2999-01-01', ''), 'string'); assert.equal(typeof st.validateRiskFree(6, '17-10-2025', ''), 'string');
  for (const t of ['schemes', 'nav_history', 'nav_latest', 'scheme_metrics', 'settings', 'job_locks', 'job_runs', 'backfill_state']) await dbm.exec(`DELETE FROM ${t}`);
  // 6 regular-growth schemes in one category, ~5.2y of daily NAV, different drifts
  const end = Date.UTC(2025, 9, 17);
  const hist: any[][] = [], sch: any[][] = [], codes = [510001, 510002, 510003, 510004, 510005, 510006];
  codes.forEach((code, k) => {
    sch.push([code, `Peer ${k} Fund - Regular Plan - Growth`, 'Alpha Mutual Fund', 'Open Ended', 'Equity Scheme', 'Large Cap Fund', 'Equity Scheme - Large Cap Fund', 'equity-scheme-large-cap-fund', 'Regular', 'Growth', '2020-01-01', '2025-10-17', 1]);
    let seed = code; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
    let nav = 100;
    for (let d = 365 * 5 + 60; d >= 0; d--) { const t = new Date(end - d * 86400_000); if (t.getUTCDay() % 6 === 0) continue; nav *= 1 + 0.0002 * (k + 1) + rnd() * 0.01; hist.push([code, t.toISOString().slice(0, 10), Number(nav.toFixed(4)), 'amfi']); }
  });
  await dbm.bulk('INSERT INTO schemes (scheme_code, name, amc, scheme_type, main_category, sub_category, category, category_slug, plan, opt, first_seen, last_seen, active) VALUES ?', sch);
  await dbm.bulk('INSERT INTO nav_history (scheme_code, nav_date, nav, source) VALUES ?', hist);
  await jobs.runRecompute({ trigger: 'manual' });
  // no risk-free yet -> Sharpe/Sortino null but volatility present
  let r = await jobs.runMetrics({ trigger: 'manual' });
  assert.equal(r.status, 'ok'); assert.match(r.message, /NOT SET/);
  let [m] = await dbm.q<any>('SELECT * FROM scheme_metrics WHERE scheme_code=510003');
  assert.ok(m.vol_3y > 3 && m.vol_3y < 30, String(m.vol_3y)); // uniform ±0.5%/day -> ~4.6% annual assert.equal(m.sharpe_3y, null); assert.ok(m.mdd_3y < 0); assert.ok(m.sip3y !== null);
  await st.setRiskFree({ pct: 6.2, asOf: '2025-10-15', note: 'x' });
  assert.equal((await st.getRiskFree()).pct, 6.2);
  r = await jobs.runMetrics({ trigger: 'manual' });
  [m] = await dbm.q<any>('SELECT * FROM scheme_metrics WHERE scheme_code=510003');
  assert.ok(m.sharpe_3y !== null && m.sortino_3y !== null); assert.equal(Number(m.rf_pct), 6.2);
  // peers: strongest drift (510006) should rank 1st on 3Y return, weakest (510001) last
  const best = await qs.peerCompare(510006), worst = await qs.peerCompare(510001);
  assert.equal(best!.group.schemes, 6); assert.equal(best!.r3y.rank, 1); assert.equal(best!.r3y.quartile, 1); assert.equal(worst!.r3y.rank, 6); assert.equal(worst!.r3y.quartile, 4);
  assert.ok(best!.r3y.avg !== null && best!.r3y.median !== null);
  // full analytics from DB history incl. rolling series, calendar years, lumpsum
  const a = await qs.schemeAnalytics(510003, { series: true });
  assert.ok(a.analytics!.rolling['1y'] && a.analytics!.calendar.length >= 5 && a.analytics!.rollingSeries1y.length > 50);
  assert.deepEqual(a.lumpsum.map((l) => l.years), [1, 3, 5]); assert.ok(a.lumpsum.every((l) => l.value > 0));
  // list with metrics joins correctly
  const list = await qs.listWithMetrics({ cat: 'equity-scheme-large-cap-fund', plan: 'Regular', opt: 'Growth' });
  assert.equal(list.length, 6); assert.ok(list.every((x) => x.sharpe3y !== null));
  assert.equal(await qs.peerCompare(999999), null);
});
