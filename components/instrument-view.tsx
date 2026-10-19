'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { byId, catalog } from '@/lib/instruments';
import { istTime, nf, pctText, signed } from '@/lib/format';
import { useQuotes } from './providers';
import { Delta, Empty, InstrumentTable, Panel, Skel, StarButton, StateBadge, dir } from './ui';

const RANGES = ['1d', '5d', '1m', '6m', '1y', '5y'] as const;
type Pts = [number, number][];

function useHistory(id: string, range: string) {
  const [points, setPoints] = useState<Pts | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    setPoints(null); setErr(false);
    fetch(`/api/history?id=${id}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => !off && setPoints(j.points))
      .catch(() => !off && setErr(true));
    return () => { off = true; };
  }, [id, range]);
  return { points, err };
}

const tickFmt = (range: string, t: number) =>
  new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...(range === '1d' ? { hour: '2-digit', minute: '2-digit', hour12: false } : range === '5d' ? { day: '2-digit', month: 'short' } : range === '5y' ? { month: 'short', year: '2-digit' } : { day: '2-digit', month: 'short' }) });

export function InstrumentView({ id }: { id: string }) {
  const inst = byId.get(id)!;
  const { quotes, loading } = useQuotes();
  const q = quotes[id];
  const [range, setRange] = useState<(typeof RANGES)[number]>('1d');
  const { points, err } = useHistory(id, range);
  const first = points?.[0]?.[1], last = points?.at(-1)?.[1];
  const rangeChange = first && last ? ((last - first) / first) * 100 : null;
  const tone = dir(rangeChange ?? q?.change);
  const color = tone === 'down' ? 'var(--down)' : 'var(--up)';
  const stats: [string, string][] = q
    ? [
        ['Open', q.open !== null ? nf(q.open, inst.dp) : '—'],
        ['Day high', q.high !== null ? nf(q.high, inst.dp) : '—'],
        ['Day low', q.low !== null ? nf(q.low, inst.dp) : '—'],
        ['Previous close', q.prev !== null ? nf(q.prev, inst.dp) : '—'],
        ['52-week high', q.w52h !== null ? nf(q.w52h, inst.dp) : '—'],
        ['52-week low', q.w52l !== null ? nf(q.w52l, inst.dp) : '—'],
        ['As of', `${istTime(q.time, true)} IST`],
        ['Source', q.source],
      ]
    : [];
  const peers = catalog.filter((i) => i.group === inst.group && i.id !== id).slice(0, 5);

  return (
    <>
      <Link href="/" className="back"><ArrowLeft size={15} aria-hidden /> Overview</Link>
      <div className="inst-head">
        <div>
          <h1>{inst.name}</h1>
          <p className="muted">{inst.kind} · {inst.region} · {inst.unit}</p>
        </div>
        <StarButton id={id} />
      </div>
      <Panel title="" className="inst-panel">
        <div className="inst-price">
          {q ? <><strong className="num big">{nf(q.price, inst.dp)}</strong><Delta inst={inst} q={q} size="lg" /><StateBadge q={q} /></> : loading ? <Skel h={44} w={240} /> : <span className="muted">Price unavailable right now.</span>}
        </div>
        <div className="range-bar">
          <div className="seg">{RANGES.map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r.toUpperCase()}</button>)}</div>
          {rangeChange !== null && range !== '1d' && <span className={`${dir(rangeChange)} small num`}>{range.toUpperCase()}: {pctText(rangeChange)}</span>}
        </div>
        <div className="chart">
          {err ? <Empty>Chart data is unavailable right now.</Empty> : !points ? <Skel h={320} /> : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={points.map(([t, v]) => ({ t, v }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => tickFmt(range, t)} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={48} />
                <YAxis domain={['auto', 'auto']} orientation="right" width={68} tickFormatter={(v) => nf(v, v > 1000 ? 0 : Math.min(inst.dp, 2))} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }}
                  labelFormatter={(t) => `${new Date(t as number).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })} IST`}
                  formatter={(v) => [nf(Number(v), inst.dp), inst.name]}
                />
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill="url(#g)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {stats.length > 0 && <dl className="stats">{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>}
      </Panel>
      {inst.note && <p className="note">ℹ {inst.note}</p>}
      {inst.yield && q?.change != null && <p className="note">ℹ Yield change is in basis points (1 bp = 0.01%): {signed(q.change, 1)} bps today.</p>}
      {peers.length > 0 && <Panel title="Related"><InstrumentTable items={peers} /></Panel>}
    </>
  );
}
