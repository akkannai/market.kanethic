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
  Object.assign(process.env, { DB_HOST: HOST, DB_PORT: process.env.DB_TEST_PORT ?? '3307', DB_USER: process.env.DB_TEST_USER ?? 'kmfi', DB_PASSWORD: process.env.DB_TEST_PASSWORD ?? '', DB_NAME: process.env.DB_TEST_NAME ?? 'kmfi', MIN_NAV_ROWS: '3', BACKFILL_DELAY_MS: '0' });
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
