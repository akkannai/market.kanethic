'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, GitCompare, Search, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useT } from './lang';
import { Empty, Panel, Skel } from './ui';
import { PageHead } from './sections';
import { CtaBand } from './cta';
import { Amt, DataBar, DbError, IdcwNote, NoteBox, Pct, dateText, nfx, useJson, useUrlState, type MfStatus, type Row } from './mf-ui';

const RANGES = ['1m', '6m', '1y', '3y', '5y', 'max'] as const;
const COLORS = ['#0071BB', '#FAAF3B', '#2E9E6B', '#8E5BD6', '#D1304C'];
const axisDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const tipDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const tipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' };

function RangeBar({ value, onChange }: { value: string; onChange: (r: string) => void }) {
  const t = useT();
  return <div className="seg">{RANGES.map((r) => <button key={r} className={value === r ? 'on' : ''} onClick={() => onChange(r)}>{r === 'max' ? t('Max') : r.toUpperCase()}</button>)}</div>;
}

export function ReturnsTable({ rows }: { rows: Row[] }) {
  const t = useT();
  return (
    <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Scheme')}</th><th className="r">1D %</th><th className="r">1M %</th><th className="r">3M %</th><th className="r">6M %</th><th className="r">1Y %</th><th className="r">3Y % <em>CAGR</em></th><th className="r">5Y % <em>CAGR</em></th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.code}><td><span className="dot-key" style={{ background: COLORS[i % 5] }} /><Link href={`/fund/${r.code}`} className="name inline">{r.name}</Link></td>
          <td className="r"><Pct v={r.chgPct} /></td><td className="r"><Pct v={r.r1m} /></td><td className="r"><Pct v={r.r3m} /></td><td className="r"><Pct v={r.r6m} /></td><td className="r"><Pct v={r.r1y} /></td><td className="r"><Pct v={r.r3y} /></td><td className="r"><Pct v={r.r5y} /></td></tr>))}</tbody></table></div>
  );
}

// ------------------------------------------------------------------ Scheme page
export function SchemePage({ code }: { code: string }) {
  const t = useT();
  const [range, setRange] = useState<string>('3y');
  const { data, error, loading } = useJson<{ scheme: Row & { isinA: string | null; isinB: string | null; firstSeen: string; schemeType: string }; points: [number, number][]; status: MfStatus }>(`/api/mf/scheme/${code}?range=${range}`);
  const s = data?.scheme;
  const first = data?.points?.[0], last = data?.points?.[data.points.length - 1];
  const rangeRet = first && last ? (last[1] / first[1] - 1) * 100 : null;
  const calcRate = s ? (s.r3y ?? s.r1y) : null;
  return (
    <>
      <Link href="/mutual-funds" className="back"><ArrowLeft size={15} aria-hidden /> {t('Mutual funds')}</Link>
      {error && !data ? (error.includes('not found') ? <Panel title=""><Empty>{t('Scheme not found.')}</Empty></Panel> : <DbError message={error} />) : !s ? <Skel h={320} /> : (
        <>
          <div className="inst-head"><div><h1>{s.name}</h1><p className="muted">{s.amc} · {s.category} · {s.plan} · {s.opt}{s.isinA ? ` · ISIN ${s.isinA}` : ''} · {t('Scheme code')} {s.code}</p></div>
            <Link href={`/compare?codes=${s.code}`} className="btn"><GitCompare size={14} aria-hidden /> {t('Compare')}</Link></div>
          <DataBar status={data.status} />
          <Panel title="" className="inst-panel">
            <div className="inst-price">
              {s.nav === null ? <span className="muted">{t('NAV not available yet.')}</span> : (<>
                <strong className="num big">₹{nfx(s.nav, 4)}</strong>
                <span className={`delta lg ${s.chgPct == null ? 'flat' : s.chgPct > 0 ? 'up' : s.chgPct < 0 ? 'down' : 'flat'}`}><Amt v={s.chg} /> <Pct v={s.chgPct} /></span>
                <span className="badge closed">NAV · {dateText(s.navDate)}</span></>)}
            </div>
            {s.prevDate && <p className="chart-note muted small">{t('1D change compares {a} with the previous available NAV of {b}.', { a: dateText(s.navDate), b: dateText(s.prevDate) })}</p>}
            <div className="range-bar"><RangeBar value={range} onChange={setRange} />{rangeRet !== null && <span className={`${rangeRet >= 0 ? 'up' : 'down'} small num`}>{range === 'max' ? t('Max') : range.toUpperCase()}: {rangeRet >= 0 ? '+' : '−'}{Math.abs(rangeRet).toFixed(2)}%</span>}</div>
            <div className="chart">
              {loading && !data.points.length ? <Skel h={300} /> : !data.points.length ? <Empty>{t('NAV history is not available yet for this scheme (backfill pending).')}</Empty> : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.points.map(([t0, v]) => ({ t: t0, v }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0071BB" stopOpacity={0.28} /><stop offset="100%" stopColor="#0071BB" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={axisDate} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={48} />
                    <YAxis domain={['auto', 'auto']} orientation="right" width={64} tickFormatter={(v) => nfx(v, v > 100 ? 0 : 2)} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tipStyle} labelFormatter={(x) => tipDate(x as number)} formatter={(v) => [`₹${nfx(Number(v), 4)}`, 'NAV']} />
                    <Area type="monotone" dataKey="v" stroke="#0071BB" strokeWidth={2} fill="url(#gm)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>)}
            </div>
            {first && <p className="chart-note muted small">{t('NAV history from')} {tipDate(first[0])} · {t('Source')}: AMFI / mfapi.in</p>}
          </Panel>
          <Panel title="Returns" sub={t('1M / 3M / 6M / 1Y are absolute; 3Y / 5Y are CAGR. Shown only where NAV history exists.')}><ReturnsTable rows={[s]} /></Panel>
          {s.opt === 'IDCW' && <IdcwNote />}
          <NoteBox>{t('Returns are calculated from NAV history; they ignore taxes, exit load and any IDCW payouts. Past performance may or may not be sustained in the future. This is information, not a recommendation.')}</NoteBox>
          {calcRate !== null && calcRate > 0 && <NoteBox><Link href={`/calculators?r=${calcRate.toFixed(1)}`} className="more">{t('Open the SIP calculator with this fund’s past {r}% return', { r: calcRate.toFixed(1) })}</Link> — {t('illustration only; future returns will differ.')}</NoteBox>}
        </>
      )}
      <CtaBand message={s ? `Hello Kanethic, I would like to know more about ${s.name} (scheme code ${s.code}).` : undefined} />
    </>
  );
}

// ------------------------------------------------------------------ Compare
export function ComparePage() {
  const t = useT();
  const [f, set, ready] = useUrlState({ codes: '', range: '3y' });
  const codes = f.codes.split(',').filter((c) => /^\d{3,8}$/.test(c)).slice(0, 5);
  const { data, error, loading } = useJson<{ schemes: Row[]; rows: Record<string, number | null>[]; startDate: string | null; status: MfStatus }>(ready.current ? `/api/mf/compare?codes=${codes.join(',')}&range=${f.range}` : null);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Row[]>([]);
  useEffect(() => {
    if (text.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(() => fetch(`/api/mf/search?q=${encodeURIComponent(text.trim())}`, { signal: ctl.signal }).then((r) => r.json()).then((j) => setHits(j.results ?? [])).catch(() => {}), 250);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [text]);
  const add = (c: number) => { if (!codes.includes(String(c)) && codes.length < 5) set({ codes: [...codes, c].join(',') }); setText(''); setHits([]); };
  const remove = (c: number) => set({ codes: codes.filter((x) => x !== String(c)).join(',') });
  const schemes = data?.schemes ?? [];
  return (
    <>
      <PageHead title="Compare schemes" sub="Compare up to 5 schemes: returns table and an overlaid growth chart (rebased to 100)." />
      {error && !data ? <DbError message={error} /> : (
        <>
          <DataBar status={data?.status} />
          <Panel title="">
            <div className="mf-search"><Search size={18} aria-hidden /><input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Add a scheme: type name or AMC')} aria-label={t('Add a scheme')} disabled={codes.length >= 5} /></div>
            {hits.length > 0 && <ul className="rows hits">{hits.map((h) => <li key={h.code}><button onClick={() => add(h.code)}><b>{h.name}</b><span className="muted small">{h.amc}</span></button></li>)}</ul>}
            <div className="chips">{schemes.map((s, i) => <span key={s.code} className="pill chip-rm"><span className="dot-key" style={{ background: COLORS[i % 5] }} />{s.name}<button aria-label={`Remove ${s.name}`} onClick={() => remove(s.code)}><X size={13} /></button></span>)}
              {!codes.length && <span className="muted small">{t('No scheme selected yet.')}</span>}</div>
          </Panel>
          {schemes.length > 0 && (<>
            <Panel title="Returns"><ReturnsTable rows={schemes} /></Panel>
            <Panel title="Growth of 100" action={<div className="seg">{(['1y', '3y', '5y', 'max'] as const).map((r) => <button key={r} className={f.range === r ? 'on' : ''} onClick={() => set({ range: r })}>{r === 'max' ? t('Max') : r.toUpperCase()}</button>)}</div>}>
              <div className="chart">
                {loading && !data?.rows.length ? <Skel h={320} /> : !data?.rows.length ? <Empty>{t('Not enough NAV history to compare.')}</Empty> : (
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={data.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={axisDate} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={48} />
                      <YAxis domain={['auto', 'auto']} orientation="right" width={52} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tipStyle} labelFormatter={(x) => tipDate(x as number)} formatter={(v, n) => [nfx(Number(v), 2), schemes.find((s) => `s${s.code}` === n)?.name ?? n]} />
                      <Legend formatter={(n) => <span className="small">{(schemes.find((s) => `s${s.code}` === n)?.name ?? String(n)).slice(0, 38)}</span>} />
                      {schemes.map((s, i) => <Line key={s.code} type="monotone" dataKey={`s${s.code}`} stroke={COLORS[i % 5]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />)}
                    </LineChart>
                  </ResponsiveContainer>)}
              </div>
              {data?.startDate && <p className="chart-note muted small">{t('All lines start at 100 on {d} (the latest date all selected schemes have NAV).', { d: dateText(data.startDate) })}</p>}
            </Panel>
          </>)}
          <NoteBox>{t('Compare only schemes of the same type for a meaningful comparison. Past performance may or may not be sustained in the future. This is information, not a recommendation.')}</NoteBox>
        </>
      )}
      <CtaBand />
    </>
  );
}
