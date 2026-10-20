'use client';
import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Fund } from '@/lib/amfi';
import type { Returns } from '@/lib/mfmath';
import { nf } from '@/lib/format';
import { useT } from './lang';
import { CtaBand } from './cta';
import { Empty, Panel, Skel } from './ui';
import { PageHead } from './sections';

const QUICK = ['Flexi Cap', 'ELSS', 'Liquid', 'Small Cap', 'Hybrid', 'Large Cap'];
const PAGE = 30;
const dateText = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

type Metric = { navDate: string; nav: number; prevNav: number | null; change: number | null; changePct: number | null; y1: number | null } | null;
const tone = (n: number | null | undefined) => (n == null || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');
const sgn = (n: number, dp = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export function MutualFundsPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null); // null = haju default nakki nathi
  const [cats, setCats] = useState<{ name: string; count: number }[]>([]);
  const [option, setOption] = useState('growth');
  const [res, setRes] = useState<{ results: Fund[]; latest: string; total: number | null; source?: string; fallback?: boolean } | null>(null);
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('loading');
  const [shown, setShown] = useState(PAGE);
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});

  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get('q');
    if (init) setQ(init);
  }, []);

  // Categories (AMFI); default = Flexi Cap
  useEffect(() => {
    fetch(`/api/mf/categories?option=${option}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setCats(j.categories);
        setCategory((cur) => cur ?? (j.categories.find((c: { name: string }) => /flexi cap/i.test(c.name))?.name ?? j.categories[0]?.name ?? ''));
      })
      .catch(() => setCategory((cur) => cur ?? ''));
  }, [option]);

  // List: search text -> search (all categories); else category browse
  useEffect(() => {
    const text = q.trim();
    if (category === null) return;
    if (text.length < 2 && !category) { setRes(null); setState('idle'); return; }
    setState('loading');
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const qs = text.length >= 2 ? `q=${encodeURIComponent(text)}` : `category=${encodeURIComponent(category)}`;
      fetch(`/api/mf/search?${qs}&option=${option}`, { signal: ctl.signal })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) { setDetail(j.detail ?? ''); throw new Error('x'); } return j; })
        .then((j) => { setRes(j); setDetail(''); setShown(PAGE); setState('idle'); })
        .catch((e) => { if (e?.name !== 'AbortError') setState('error'); });
    }, text.length >= 2 ? 300 : 0);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q, category, option]);

  // 1D / 1Y metrics fakt dekhata rows mate
  const visible = useMemo(() => (res?.results ?? []).slice(0, shown), [res, shown]);
  useEffect(() => {
    const need = visible.map((f) => f.code).filter((c) => !(c in metrics));
    if (!need.length) return;
    let off = false;
    for (let i = 0; i < need.length; i += 30) {
      const batch = need.slice(i, i + 30);
      fetch(`/api/mf/metrics?codes=${batch.join(',')}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => { if (!off) setMetrics((m) => ({ ...m, ...j.metrics })); })
        .catch(() => { if (!off) setMetrics((m) => ({ ...m, ...Object.fromEntries(batch.map((c) => [c, null])) })); });
    }
    return () => { off = true; };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const searching = q.trim().length >= 2;
  const title = searching ? t('{n} schemes', { n: res?.results.length ?? 0 }) : category ? `${category.replace(/^.*?- /, '')} · ${t('{n} schemes', { n: res?.results.length ?? 0 })}` : '';

  return (
    <>
      <PageHead title="Mutual funds" sub="Latest NAV from AMFI with 1-day change and 1-year return. Search any scheme or browse by category." />
      <Panel title="">
        <div className="mf-search">
          <Search size={18} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Type a fund or AMC name, e.g. “flexi cap”')} aria-label={t('Search mutual funds')} />
        </div>
        <div className="mf-filters">
          {cats.length > 0 && (
            <label>{t('Category')}
              <select value={category ?? ''} onChange={(e) => { setCategory(e.target.value); setQ(''); setShown(PAGE); }} disabled={searching}>
                {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
              </select>
            </label>
          )}
          <div className="chips tight">
            <span className="badge closed">{t('Regular plans')}</span>
            {[['growth', 'Growth'], ['idcw', 'IDCW']].map(([v, l]) => (
              <button key={v} className={option === v ? 'on' : ''} aria-pressed={option === v} onClick={() => { setOption(v); setMetrics({}); }}>{t(l)}</button>
            ))}
          </div>
        </div>
        {!searching && <div className="chips"><span className="muted small">{t('Quick searches')}:</span>{QUICK.map((x) => <button key={x} onClick={() => setQ(x)}>{x}</button>)}</div>}
      </Panel>

      {state === 'loading' && !res ? <Panel title=""><div className="stack pad"><Skel h={22} /><Skel h={22} /><Skel h={22} /></div></Panel> : state === 'error' ? (
        <Panel title=""><Empty>{t('Mutual fund data is unavailable right now.')}{detail && <span className="muted small block">{detail}</span>}</Empty></Panel>
      ) : res ? (
        <Panel title={title} sub={`${t('NAV date')}: ${res.latest ? dateText(res.latest) : '—'} · ${t('Source')}: ${res.source ?? 'AMFI'}`}>
          {res.results.length === 0 ? <Empty>{t('No scheme matched your search.')}</Empty> : (
            <>
              <div className="table-wrap">
                <table className="tbl mf-tbl">
                  <thead><tr><th>{t('Scheme')}</th><th className="r">NAV (₹)</th><th className="r hide-sm">{t('1-day change')} (₹)</th><th className="r">{t('1-day change')} %</th><th className="r">{t('1-year return')}</th></tr></thead>
                  <tbody>
                    {visible.map((f) => {
                      const m = metrics[f.code];
                      const loadingM = !(f.code in metrics);
                      const cell = (v: number | null | undefined, fmt: (n: number) => string) => loadingM ? <Skel w={56} /> : v == null ? <span className="muted">—</span> : <span className={`${tone(v)} num`}>{fmt(v)}</span>;
                      return (
                        <tr key={f.code}>
                          <td><Link href={`/fund/${f.code}`} className="name">{f.name}</Link><span className="sub">{f.amc}{searching && f.category ? ` · ${f.category.replace(/^.*?- /, '')}` : ''}</span></td>
                          <td className="r"><strong className="num">{nf(f.nav, 4)}</strong><span className="sub r">{dateText(f.date)}</span></td>
                          <td className="r hide-sm">{cell(m?.change, (n) => sgn(n, 4))}</td>
                          <td className="r">{cell(m?.changePct, (n) => `${sgn(n)}%`)}</td>
                          <td className="r">{cell(m?.y1, (n) => `${sgn(n)}%`)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {shown < res.results.length && <div className="pad"><button className="btn" onClick={() => setShown((n) => n + PAGE)}>{t('Show more')} ({res.results.length - shown})</button></div>}
            </>
          )}
        </Panel>
      ) : null}
      <p className="note"><span>{t('NAV is published by AMFI after market hours and is not a live price. Showing active schemes only. This is information, not a recommendation to buy or sell.')} {t('1-year return is the change in NAV over 12 months (IDCW payouts, taxes and exit load are not included). Past performance may or may not be sustained in the future.')}</span></p>
    </>
  );
}

const RANGES = [['1y', 1], ['3y', 3], ['5y', 5], ['10y', 10], ['all', 100]] as const;

export function FundView({ code }: { code: string }) {
  const t = useT();
  const [data, setData] = useState<{ fund: Fund; returns: Returns | null; points: [number, number][] | null } | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'notfound'>('loading');
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('3y');

  useEffect(() => {
    let off = false;
    fetch(`/api/mf/${code}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => !off && setData(j))
      .catch((s) => !off && setState(s === 404 ? 'notfound' : 'error'));
    return () => { off = true; };
  }, [code]);

  const pts = useMemo(() => {
    if (!data?.points) return null;
    const years = RANGES.find((r) => r[0] === range)![1];
    const cut = data.points[data.points.length - 1][0] - years * 365.25 * 86400_000;
    return data.points.filter((p) => p[0] >= cut).map(([ti, v]) => ({ t: ti, v }));
  }, [data, range]);

  if (!data) return (
    <>
      <Link href="/mutual-funds" className="back"><ArrowLeft size={15} aria-hidden /> {t('Mutual funds')}</Link>
      {state === 'loading' ? <Skel h={240} /> : <Panel title=""><Empty>{state === 'notfound' ? t('Scheme not found.') : t('Mutual fund data is unavailable right now.')}</Empty></Panel>}
    </>
  );

  const { fund, returns } = data;
  const rows: [string, number | null][] = returns ? [['1 month', returns.m1], ['6 months', returns.m6], ['1 year', returns.y1], ['3 years', returns.y3], ['5 years', returns.y5]] : [];
  const suggestRate = returns?.y3 ?? returns?.y1 ?? null;

  return (
    <>
      <Link href="/mutual-funds" className="back"><ArrowLeft size={15} aria-hidden /> {t('Mutual funds')}</Link>
      <div className="inst-head"><div><h1>{fund.name}</h1><p className="muted">{fund.amc}{fund.category ? ` · ${fund.category}` : ''} · {t('Scheme code')} {fund.code}</p></div></div>
      <Panel title="" className="inst-panel">
        <div className="inst-price"><strong className="num big">₹{nf(fund.nav, 4)}</strong><span className="badge closed">NAV · {dateText(fund.date)}</span></div>
        {pts && (
          <>
            <div className="range-bar"><div className="seg">{RANGES.map(([k]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{k === 'all' ? t('All') : k.toUpperCase()}</button>)}</div></div>
            <div className="chart">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={pts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--brand)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(x) => new Date(x).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={48} />
                  <YAxis domain={['auto', 'auto']} orientation="right" width={64} tickFormatter={(v) => nf(v, 0)} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }} labelFormatter={(x) => new Date(x as number).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })} formatter={(v) => [`₹${nf(Number(v), 4)}`, 'NAV']} />
                  <Area type="monotone" dataKey="v" stroke="var(--brand)" strokeWidth={2} fill="url(#gf)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        {pts && <p className="chart-note muted small">{t('NAV history from')} {dateText(new Date(data.points![0][0]).toISOString().slice(0, 10))} ({t('since launch')})</p>}
        {returns && (
          <dl className="stats">
            {rows.map(([k, v]) => (
              <div key={k}><dt>{t(k)}{k.startsWith('1 month') || k.startsWith('6') ? ` (${t('absolute')})` : ` (${t('CAGR')})`}</dt><dd className={`num ${v === null ? '' : v >= 0 ? 'up' : 'down'}`}>{v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}</dd></div>
            ))}
            {returns.inception !== null && <div><dt>{t('Since launch')} ({t('CAGR')})</dt><dd className="num">{returns.inception.toFixed(2)}%</dd></div>}
          </dl>
        )}
        {!pts && <Empty>{t('NAV history is unavailable right now.')}</Empty>}
      </Panel>
      <p className="note"><span>{t('Returns are computed from NAV history; they ignore taxes, exit load and any IDCW payouts. Past performance may or may not be sustained in the future. This is information, not a recommendation. Mutual fund investments are subject to market risks; read all scheme related documents carefully.')}</span></p>
      {suggestRate !== null && suggestRate > 0 && (
        <p className="note"><span><Link href={`/calculators?r=${suggestRate.toFixed(1)}`} className="more">{t('Open the SIP calculator with this fund’s past {r}% CAGR', { r: suggestRate.toFixed(1) })}</Link> — {t('illustration only; future returns will differ.')}</span></p>
      )}
      <CtaBand message={`Hello Kanethic, I would like to know more about ${fund.name} (scheme code ${fund.code}).`} />
    </>
  );
}
