'use client';
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import Link from 'next/link';
import type { Analytics, RollingStats, WindowStats } from '@/lib/mf/analytics';
import { useT } from './lang';
import { Empty, Panel, Skel } from './ui';
import { NoteBox, Pct, dateText, nfx, tone, useJson } from './mf-ui';

export type RiskFree = { pct: number | null; asOf: string | null; note: string };
type PeerMetric = { mine: number | null; total: number; rank: number | null; quartile: number | null; avg: number | null; median: number | null };
type Peers = { group: { category: string; plan: string; option: string; schemes: number }; r1y: PeerMetric; r3y: PeerMetric; r5y: PeerMetric; vol3y: PeerMetric; sharpe3y: PeerMetric; mdd3y: PeerMetric };
export type AnalyticsPayload = { analytics: Analytics | null; riskFree: RiskFree; lumpsum: { years: number; from: string; value: number }[]; peers: Peers };

const tip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const ratio = (v: number | null | undefined, dp = 2) => (v == null ? <span className="muted">—</span> : <span className={`num ${tone(v)}`}>{v > 0 ? '+' : v < 0 ? '−' : ''}{nfx(Math.abs(v), dp)}</span>);
const plain = (v: number | null | undefined, dp = 2, suffix = '%') => (v == null ? <span className="muted">—</span> : <span className="num">{nfx(v, dp)}{suffix}</span>);
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function RiskFreeNote({ rf }: { rf: RiskFree }) {
  const t = useT();
  return rf.pct === null
    ? <span className="badge stale">⚠ {t('Risk-free rate not set — Sharpe and Sortino are hidden')}</span>
    : <span className="muted small">{t('Risk-free rate')}: {rf.note} <b>{nfx(rf.pct, 2)}%</b> {rf.asOf ? `(${t('as of')} ${dateText(rf.asOf)})` : ''}</span>;
}

function Kpi({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="kpi" title={hint}><span>{label}</span><strong>{children}</strong></div>;
}

function ddText(w: WindowStats | null, t: (s: string) => string) {
  const d = w?.mdd;
  if (!d) return '—';
  return `${dateText(d.peak)} → ${dateText(d.trough)} · ${d.recovery ? `${t('recovered')} ${dateText(d.recovery)}` : t('not yet recovered')}`;
}

export function RiskPanel({ a, rf }: { a: Analytics; rf: RiskFree }) {
  const t = useT();
  const w3 = a.windows['3y'];
  const rows: [string, WindowStats | null][] = [['1 year', a.windows['1y']], ['3 years', a.windows['3y']], ['5 years', a.windows['5y']]];
  return (
    <Panel title="Risk & ratios" sub={t('From daily NAV history. Past performance may or may not be sustained in the future.')} action={<RiskFreeNote rf={rf} />}>
      <div className="kpis risk-kpis">
        <Kpi label={t('Std deviation (3Y)')} hint="Annualised volatility of daily returns">{plain(w3?.vol, 2)}</Kpi>
        <Kpi label={t('Sharpe ratio (3Y)')} hint="(CAGR − risk-free) ÷ std deviation">{ratio(w3?.sharpe)}</Kpi>
        <Kpi label={t('Sortino ratio (3Y)')} hint="(CAGR − risk-free) ÷ downside deviation">{ratio(w3?.sortino)}</Kpi>
        <Kpi label={t('Max drawdown (3Y)')} hint="Worst peak-to-trough fall in the last 3 years">{w3?.mdd ? <span className="num down">{nfx(w3.mdd.pct, 2)}%</span> : '—'}</Kpi>
        <Kpi label={t('Current drawdown')} hint="Latest NAV vs its highest NAV in the history">{a.all.current ? <span className={`num ${a.all.current.pct < 0 ? 'down' : 'flat'}`}>{nfx(a.all.current.pct, 2)}%</span> : '—'}</Kpi>
        <Kpi label={t('Calmar ratio (3Y)')} hint="3Y CAGR ÷ |3Y max drawdown|">{ratio(a.calmar3y)}</Kpi>
      </div>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Period')}</th><th className="r">CAGR %</th><th className="r">{t('Std dev')} %</th><th className="r">Sharpe</th><th className="r">Sortino</th><th className="r">{t('Max drawdown')} %</th><th className="hide-sm">{t('Worst fall (peak → trough)')}</th></tr></thead>
        <tbody>{rows.map(([label, w]) => (
          <tr key={label}><td><b>{t(label)}</b></td>
            {w ? (<><td className="r"><Pct v={w.cagr} /></td><td className="r">{plain(w.vol, 2, '')}</td><td className="r">{ratio(w.sharpe)}</td><td className="r">{ratio(w.sortino)}</td>
              <td className="r">{w.mdd ? <span className="num down">{nfx(w.mdd.pct, 2)}</span> : '—'}</td><td className="hide-sm muted small">{ddText(w, t)}</td></>)
              : <td colSpan={6} className="muted">{t('Not enough NAV history')}</td>}</tr>))}</tbody></table></div>
      <details className="how"><summary>{t('How these are calculated')}</summary>
        <ul>
          <li>{t('Std deviation: standard deviation of daily NAV returns × √(trading days per year). Higher = bumpier ride.')}</li>
          <li>{t('Sharpe = (CAGR − risk-free rate) ÷ std deviation. Sortino uses only downside moves. Risk-free = 91-day T-bill, a single current rate for the whole window.')}</li>
          <li>{t('Max drawdown = worst fall from a peak NAV to a later low within the window. Calmar = 3Y CAGR ÷ |3Y max drawdown|.')}</li>
        </ul>
      </details>
    </Panel>
  );
}

function RollingRow({ label, s, t }: { label: string; s: RollingStats | null; t: (x: string) => string }) {
  return (
    <tr><td><b>{label}</b></td>
      {s ? (<><td className="r"><Pct v={s.min} /></td><td className="r"><Pct v={s.median} /></td><td className="r"><Pct v={s.max} /></td>
        <td className="r">{plain(s.posPct, 0, '%')}</td><td className="r hide-sm">{plain(s.ge10Pct, 0, '%')}</td><td className="r hide-sm num">{s.n.toLocaleString('en-IN')}</td></>)
        : <td colSpan={6} className="muted">{t('Not enough NAV history')}</td>}</tr>
  );
}

export function RollingPanel({ a }: { a: Analytics }) {
  const t = useT();
  return (
    <Panel title="Rolling returns" sub={t('Return of every possible window ending on each NAV date (last 5 years of history). Shows consistency, not just one start date.')}>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Window')}</th><th className="r">{t('Worst')}</th><th className="r">{t('Median')}</th><th className="r">{t('Best')}</th><th className="r">{t('% of times positive')}</th><th className="r hide-sm">{t('% of times ≥ 10%')}</th><th className="r hide-sm">{t('Windows')}</th></tr></thead>
        <tbody><RollingRow label={`1 ${t('year')} (${t('absolute')})`} s={a.rolling['1y']} t={t} /><RollingRow label={`3 ${t('years')} (CAGR)`} s={a.rolling['3y']} t={t} /></tbody></table></div>
      {a.rollingSeries1y.length > 10 && (
        <div className="chart compact">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={a.rollingSeries1y.map(([x, v]) => ({ x, v }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0071BB" stopOpacity={0.25} /><stop offset="100%" stopColor="#0071BB" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="x" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(x) => new Date(x).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis orientation="right" width={48} tickFormatter={(v) => `${v}%`} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 4" />
              <Tooltip contentStyle={tip} labelFormatter={(x) => dateText(new Date(x as number).toISOString().slice(0, 10))} formatter={(v) => [`${nfx(Number(v), 2)}%`, t('1-year return')]} />
              <Area type="monotone" dataKey="v" stroke="#0071BB" strokeWidth={2} fill="url(#gr)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="chart-note muted small">{t('1-year rolling return, by end date')}</p>
        </div>)}
    </Panel>
  );
}

export function CalendarPanel({ a }: { a: Analytics }) {
  const t = useT();
  const data = a.calendar.map((c) => ({ label: `${c.year}${c.ytd ? ' YTD' : c.partial ? '*' : ''}`, ret: Number(c.ret.toFixed(2)) }));
  return (
    <Panel title="Calendar-year returns" sub={t('YTD = year to date. * = partial first year (since NAV history begins).')}>
      {!data.length ? <Empty>{t('Not enough NAV history')}</Empty> : (
        <div className="chart compact"><ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis orientation="right" width={48} tickFormatter={(v) => `${v}%`} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke="var(--muted)" />
            <Tooltip contentStyle={tip} formatter={(v) => [`${nfx(Number(v), 2)}%`, t('Return')]} />
            <Bar dataKey="ret" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: 'var(--muted)', formatter: (v: unknown) => `${Number(v).toFixed(1)}%` }}>
              {data.map((d, i) => <Cell key={i} fill={d.ret >= 0 ? 'var(--up)' : 'var(--down)'} />)}
            </Bar>
          </BarChart></ResponsiveContainer></div>)}
      {a.months && (
        <div className="kpis risk-kpis">
          <Kpi label={t('Best month')}><span className="up num">+{nfx(a.months.best.ret, 2)}%</span><em> {monthName(a.months.best.m)}</em></Kpi>
          <Kpi label={t('Worst month')}><span className="down num">−{nfx(Math.abs(a.months.worst.ret), 2)}%</span><em> {monthName(a.months.worst.m)}</em></Kpi>
          <Kpi label={t('Positive months')}>{plain(a.months.posPct, 0, '%')}<em> {t('of')} {a.months.n}</em></Kpi>
        </div>)}
    </Panel>
  );
}

export function PeersPanel({ p }: { p: Peers }) {
  const t = useT();
  const rows: [string, PeerMetric, (v: number | null) => React.ReactNode][] = [
    ['1Y return', p.r1y, (v) => <Pct v={v} />], ['3Y return (CAGR)', p.r3y, (v) => <Pct v={v} />], ['5Y return (CAGR)', p.r5y, (v) => <Pct v={v} />],
    ['Std deviation 3Y', p.vol3y, (v) => plain(v, 2)], ['Sharpe 3Y', p.sharpe3y, (v) => ratio(v)], ['Max drawdown 3Y', p.mdd3y, (v) => (v == null ? '—' : <span className="num down">{nfx(v, 2)}%</span>)],
  ];
  return (
    <Panel title="Category comparison" sub={`${p.group.category} · ${p.group.plan} · ${p.group.option} · ${t('{n} schemes in this peer group', { n: p.group.schemes })}`}>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Measure')}</th><th className="r">{t('This fund')}</th><th className="r">{t('Category average')}</th><th className="r hide-sm">{t('Category median')}</th><th className="r">{t('Rank')}</th><th className="r hide-sm">{t('Quartile')}</th></tr></thead>
        <tbody>{rows.map(([label, m, f]) => (
          <tr key={label}><td><b>{t(label)}</b></td><td className="r">{f(m.mine)}</td>
            {m.rank ? (<><td className="r">{f(m.avg)}</td><td className="r hide-sm">{f(m.median)}</td><td className="r num">{m.rank} / {m.total}</td><td className="r hide-sm"><span className={`badge ${m.quartile === 1 ? 'live' : 'closed'}`}>Q{m.quartile}</span></td></>)
              : <td colSpan={4} className="muted small">{m.mine === null ? t('No data for this period') : t('Too few peers for a fair comparison')}</td>}</tr>))}</tbody></table></div>
      <p className="panel-foot small muted">{t('Rank 1 = best in the group (for risk measures, lowest risk). Q1 = top 25%. Peers are active schemes of the same category, plan and option. Information only — not a recommendation to buy or sell.')}</p>
    </Panel>
  );
}

export function SipPanel({ a, lumpsum }: { a: Analytics; lumpsum: AnalyticsPayload['lumpsum'] }) {
  const t = useT();
  const keys = ['1y', '3y', '5y'] as const;
  return (
    <Panel title="SIP & lumpsum illustration" sub={t('What ₹10,000 a month (SIP, first NAV date of each month) or ₹1,00,000 invested once would have become. Illustration only.')}>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Period')}</th><th className="r">{t('SIP invested')}</th><th className="r">{t('SIP value today')}</th><th className="r">SIP XIRR</th><th className="r">{t('₹1 lakh invested then → today')}</th></tr></thead>
        <tbody>{keys.map((k, i) => {
          const s = a.sip[k]; const l = lumpsum.find((x) => x.years === [1, 3, 5][i]);
          return (<tr key={k}><td><b>{[1, 3, 5][i]} {t(i ? 'years' : 'year')}</b></td>
            {s ? (<><td className="r num">{inr(s.invested)}</td><td className="r num">{inr(s.value)}</td><td className="r"><Pct v={s.xirr} /></td></>) : <td colSpan={3} className="muted">{t('Not enough NAV history')}</td>}
            <td className="r num">{l ? <>{inr(l.value)} <span className={`small ${l.value >= 100000 ? 'up' : 'down'}`}>({l.value >= 100000 ? '+' : '−'}{nfx(Math.abs(l.value / 1000 - 100), 1)}%)</span></> : '—'}</td></tr>);
        })}</tbody></table></div>
    </Panel>
  );
}

/** Scheme page: lazy-loaded analytics sections */
export function SchemeAnalytics({ code }: { code: string }) {
  const t = useT();
  const { data, error, loading } = useJson<AnalyticsPayload>(`/api/mf/scheme/${code}/analytics`);
  if (loading && !data) return <><Skel h={180} /><div style={{ height: 14 }} /><Skel h={200} /></>;
  if (error || !data) return <Panel title="Risk & ratios"><Empty>{t('Ratios are unavailable right now.')}</Empty></Panel>;
  const a = data.analytics;
  return (
    <>
      {a ? <RiskPanel a={a} rf={data.riskFree} /> : <Panel title="Risk & ratios"><Empty>{t('Not enough NAV history (needs at least 1 year of data) for risk ratios.')}</Empty></Panel>}
      {a && <RollingPanel a={a} />}
      {a && <CalendarPanel a={a} />}
      <PeersPanel p={data.peers} />
      {a && <SipPanel a={a} lumpsum={data.lumpsum} />}
      <NoteBox>{t('Ratios are calculated by Kanethic from AMFI NAV history; they ignore taxes, exit load and IDCW payouts. Past performance may or may not be sustained in the future. This is information, not a recommendation.')} <Link className="more" href="/sources">{t('Data & sources')}</Link></NoteBox>
    </>
  );
}
