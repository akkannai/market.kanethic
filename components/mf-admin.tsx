'use client';
import { useCallback, useEffect, useState } from 'react';
import { Panel, Skel } from './ui';
import { PageHead } from './sections';
import { DataBar, dateText, istStamp, nfx, type MfStatus } from './mf-ui';

type Overview = {
  counts: { schemes: number; active: number; withNav: number; history: number; missingLatest: number };
  status: MfStatus; config: { mail: boolean; alertTo: string; cronSecret: boolean; tz: string };
  lastByJob: { job: string; status: string; started_at: string; finished_at: string | null; message: string }[];
  runs: { id: number; job: string; slot: string | null; trigger_by: string; started_at: string; finished_at: string | null; status: string; message: string }[];
  reviews: { id: number; code: number; name: string; nav_date: string; nav: number; prev_date: string | null; prev_nav: number | null; change_pct: number }[];
  failedBackfill: { code: number; attempts: number; last_error: string }[];
};

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }));

export function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [auth, setAuth] = useState<'loading' | 'in' | 'out' | 'unconfigured'>('loading');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ user: '', password: '' });

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/status', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return setAuth('out');
    if (r.status === 503 && /not configured/i.test(j.error ?? '') && !j.sources) { setErr(j.error); return setAuth(j.error?.startsWith('Admin') ? 'unconfigured' : 'in'); }
    if (!r.ok) { setErr(j.error ?? 'Error'); return setAuth('in'); }
    setData(j); setErr(''); setAuth('in');
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000); return () => clearInterval(t); }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await post('/api/admin/login', form);
    if (!r.ok) return setMsg(r.json.error ?? 'Login failed');
    setMsg(''); setForm({ user: '', password: '' }); load();
  };
  const act = async (url: string, body: unknown, ok: string) => { const r = await post(url, body); setMsg(r.ok ? ok : r.json.error ?? 'Failed'); setTimeout(load, 1500); return r; };

  if (auth === 'loading') return <Skel h={200} />;
  if (auth === 'unconfigured') return <Panel title="Admin"><p className="empty">Admin is not configured. Set ADMIN_USER, ADMIN_PASSWORD_HASH and SESSION_SECRET in the environment (see README).</p></Panel>;
  if (auth === 'out') return (
    <div className="login-box"><Panel title="Admin login">
      <form className="alert-form login" onSubmit={login}>
        <label>User<input value={form.user} autoComplete="username" onChange={(e) => setForm({ ...form, user: e.target.value })} /></label>
        <label>Password<input type="password" value={form.password} autoComplete="current-password" onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <button className="btn primary" type="submit">Login</button>
      </form>
      {msg && <p className="empty down">{msg}</p>}
    </Panel></div>
  );
  const d = data;
  const bf = d?.status.backfill;
  const pct = bf && bf.total ? Math.round(((bf.done + bf.na) / bf.total) * 100) : 0;
  return (
    <>
      <PageHead title="Admin — NAV jobs" sub="Job status, review queue and manual runs.">
        <button className="btn" onClick={async () => { await post('/api/admin/logout', {}); setData(null); setAuth('out'); }}>Logout</button>
      </PageHead>
      {err && <p className="note down">{err}</p>}
      {msg && <p className="note">{msg}</p>}
      {d && (<>
        <DataBar status={d.status} />
        <div className="kpis admin-kpis">
          <div className="kpi"><span>Schemes in DB / with latest NAV / NAV rows</span><strong className="num">{d.counts.schemes.toLocaleString('en-IN')} / {d.counts.withNav.toLocaleString('en-IN')} / {d.counts.history.toLocaleString('en-IN')}</strong>
            {d.counts.missingLatest > 0 && <span className="down small block">{d.counts.missingLatest.toLocaleString('en-IN')} schemes have history but no latest row — press “Rebuild latest”.</span>}</div>
          <div className="kpi"><span>Backfill ({bf?.done}/{bf?.total} done · {bf?.na} no history · {bf?.failed} failed · {bf?.pending} pending)</span><strong className="num">{pct}%</strong></div>
          <div className="kpi"><span>Failure email → {d.config.alertTo}</span><strong className={d.config.mail ? 'up' : 'down'}>{d.config.mail ? 'SMTP configured' : 'SMTP NOT configured'}</strong></div>
        </div>
        {!d.config.cronSecret && <p className="note down">CRON_SECRET is missing or shorter than 16 characters — cron URLs will be rejected.</p>}
        <Panel title="Jobs" sub={`Server timezone: ${d.config.tz}. All schedules are defined in IST (see README for cron lines).`}>
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Job</th><th>Last run</th><th>Status</th><th>Message</th><th /></tr></thead><tbody>
            {['nav-fetch', 'backfill', 'recompute'].map((job) => { const l = d.lastByJob.find((x) => x.job === job); return (
              <tr key={job}><td><b>{job}</b></td><td>{istStamp(l?.started_at ?? null)}</td><td><span className={`badge ${l?.status === 'failed' ? 'stale' : l?.status === 'ok' ? 'live' : 'closed'}`}>{l?.status ?? 'never'}</span></td><td className="muted small">{l?.message ?? '—'}</td>
                <td className="r"><button className="btn" onClick={() => act('/api/admin/run', { job }, `${job} started — refresh in a few seconds`)}>{job === 'recompute' ? 'Rebuild latest' : 'Run now'}</button></td></tr>); })}
          </tbody></table></div>
          <div className="pad-x"><button className="btn" onClick={async () => { const r = await post('/api/admin/test-email', {}); setMsg(r.json.sent ? `Test email sent to ${r.json.to}` : `Email not sent: ${r.json.reason ?? r.json.error}`); }}>Send test email</button></div>
        </Panel>
        <Panel title={`Review queue (${d.reviews.length})`} sub="NAV changes above ±20% — NOT published until approved.">
          {!d.reviews.length ? <p className="empty">Nothing waiting for review.</p> : (
            <div className="table-wrap"><table className="tbl"><thead><tr><th>Scheme</th><th className="r">Previous</th><th className="r">New</th><th className="r">Change</th><th /></tr></thead><tbody>
              {d.reviews.map((r) => (<tr key={r.id}><td><b>{r.name}</b><span className="sub">{r.code} · {dateText(r.nav_date)}</span></td>
                <td className="r num">{r.prev_nav === null ? '—' : nfx(r.prev_nav, 4)}<span className="sub r">{dateText(r.prev_date)}</span></td><td className="r num">{nfx(r.nav, 4)}</td>
                <td className={`r num ${r.change_pct > 0 ? 'up' : 'down'}`}>{r.change_pct > 0 ? '+' : '−'}{Math.abs(r.change_pct).toFixed(2)}%</td>
                <td className="r"><button className="btn primary" onClick={() => act('/api/admin/review', { id: r.id, action: 'approve' }, 'Approved and published')}>Approve</button> <button className="btn" onClick={() => act('/api/admin/review', { id: r.id, action: 'reject' }, 'Rejected')}>Reject</button></td></tr>))}
            </tbody></table></div>)}
        </Panel>
        {d.failedBackfill.length > 0 && <Panel title="Backfill failures (latest)"><ul className="rows">{d.failedBackfill.map((f) => <li key={f.code}><span>{f.code} · attempts {f.attempts}</span><span className="muted small">{f.last_error}</span></li>)}</ul></Panel>}
        <Panel title="Recent runs">
          <div className="table-wrap"><table className="tbl"><thead><tr><th>#</th><th>Job</th><th>Slot</th><th>By</th><th>Started</th><th>Status</th><th>Message</th></tr></thead><tbody>
            {d.runs.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.job}</td><td>{r.slot ?? '—'}</td><td>{r.trigger_by}</td><td>{istStamp(r.started_at)}</td><td><span className={`badge ${r.status === 'failed' ? 'stale' : r.status === 'ok' ? 'live' : 'closed'}`}>{r.status}</span></td><td className="muted small">{r.message}</td></tr>)}
          </tbody></table></div>
        </Panel>
      </>)}
    </>
  );
}
