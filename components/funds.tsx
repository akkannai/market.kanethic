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
const dateText = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function MutualFundsPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [option, setOption] = useState('');
  const [res, setRes] = useState<{ results: Fund[]; latest: string; total: number | null; source?: string; fallback?: boolean } | null>(null);
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get('q');
    if (init) setQ(init);
  }, []);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setRes(null); setState('idle'); return; }
    setState('loading');
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/mf/search?q=${encodeURIComponent(text)}&option=${option}`, { signal: ctl.signal })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) { setDetail(j.detail ?? ''); throw new Error('x'); } return j; })
        .then((j) => { setRes(j); setDetail(''); setState('idle'); })
        .catch((e) => { if (e?.name !== 'AbortError') setState('error'); });
    }, 300);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q, option]);

  const chip = (cur: string, set: (v: string) => void, v: string, label: string) => (
    <button className={cur === v ? 'on' : ''} onClick={() => set(cur === v ? '' : v)} aria-pressed={cur === v}>{t(label)}</button>
  );

  return (
    <>
      <PageHead title="Mutual funds" sub="Search any scheme and see its latest NAV from AMFI, with NAV history and trailing returns." />
      <Panel title="">
        <div className="mf-search">
          <Search size={18} aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Type a fund or AMC name, e.g. “flexi cap”')} aria-label={t('Search mutual funds')} />
        </div>
        <div className="chips">
          <span className="badge closed">{t('Regular plans')}</span>
          <span className="chip-sep" />
          {chip(option, setOption, 'growth', 'Growth')}{chip(option, setOption, 'idcw', 'IDCW')}
        </div>
        {!q.trim() && (
          <div className="chips"><span className="muted small">{t('Quick searches')}:</span>{QUICK.map((s) => <button key={s} onClick={() => setQ(s)}>{s}</button>)}</div>
        )}
      </Panel>

      {state === 'loading' && !res ? <Panel title=""><div className="stack pad"><Skel h={22} /><Skel h={22} /><Skel h={22} /></div></Panel> : state === 'error' ? (
        <Panel title=""><Empty>{t('Mutual fund data is unavailable right now.')}{detail && <span className="muted small block">{detail}</span>}</Empty></Panel>
      ) : res ? (
        <Panel title={t('{n} schemes', { n: res.results.length })} sub={`${t('NAV date')}: ${res.latest ? dateText(res.latest) : '—'} · ${t('Source')}: ${res.source ?? 'AMFI'}`}>
          {res.results.length === 0 ? <Empty>{t('No scheme matched your search.')}</Empty> : (
            <ul className="rows mf-list">
              {res.results.map((f) => (
                <li key={f.code}>
                  <Link href={`/fund/${f.code}`}>
                    <b>{f.name}</b>
                    <span className="muted small">{f.amc}{f.category ? ` · ${f.category}` : ''}</span>
                  </Link>
                  <div className="r"><span className="num"><strong>₹{nf(f.nav, 4)}</strong></span><span className="muted small">{dateText(f.date)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
      <p className="note"><span>{t('NAV is published by AMFI after market hours and is not a live price. Showing active schemes only. This is information, not a recommendation to buy or sell.')}</span></p>
    </>
  );
}

const RANGES = [['1y', 1], ['3y', 3], ['5y', 5], ['all', 100]] as const;

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
