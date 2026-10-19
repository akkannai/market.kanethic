'use client';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { lumpsumSchedule, sipForGoal, sipSchedule } from '@/lib/calc';
import { useT } from './lang';
import { CtaBand } from './cta';
import { Panel } from './ui';
import { PageHead } from './sections';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const short = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` : Math.round(n).toLocaleString('en-IN'));

function Field({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step: number; suffix?: string }) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        <span className="field-in"><input inputMode="decimal" value={Number.isFinite(value) ? value : ''} onChange={(e) => { const n = Number(e.target.value.replace(/,/g, '')); onChange(Number.isFinite(n) ? n : 0); }} />{suffix && <em>{suffix}</em>}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </div>
  );
}

type Tab = 'sip' | 'lumpsum' | 'goal';

export function CalculatorsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('sip');
  const [amount, setAmount] = useState(10000);
  const [lump, setLump] = useState(500000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(10);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(10000000);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const r = Number(sp.get('r'));
    if (r > 0 && r <= 30) setRate(Math.round(r * 10) / 10);
  }, []);

  const safeYears = Math.min(50, Math.max(1, Math.round(years) || 1));
  const rows = useMemo(
    () => (tab === 'sip' ? sipSchedule(amount, rate, safeYears, step) : tab === 'lumpsum' ? lumpsumSchedule(lump, rate, safeYears) : sipSchedule(sipForGoal(target, rate, safeYears), rate, safeYears)),
    [tab, amount, lump, rate, safeYears, step, target],
  );
  const last = rows[rows.length - 1];
  const gain = last ? last.value - last.invested : 0;
  const goalSip = tab === 'goal' ? sipForGoal(target, rate, safeYears) : 0;

  return (
    <>
      <PageHead title="SIP & lumpsum calculators" sub="See how regular investing can grow over time. Figures are illustrative." />
      <div className="calc-grid">
        <Panel title="">
          <div className="seg calc-tabs" role="tablist">
            {([['sip', 'SIP'], ['lumpsum', 'Lumpsum'], ['goal', 'Goal']] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(label)}</button>
            ))}
          </div>
          <div className="calc-form">
            {tab === 'sip' && <Field label={t('Monthly SIP amount')} value={amount} onChange={setAmount} min={500} max={500000} step={500} suffix="₹" />}
            {tab === 'lumpsum' && <Field label={t('Lumpsum amount')} value={lump} onChange={setLump} min={5000} max={50000000} step={5000} suffix="₹" />}
            {tab === 'goal' && <Field label={t('Target amount')} value={target} onChange={setTarget} min={100000} max={500000000} step={100000} suffix="₹" />}
            <Field label={t('Expected return (p.a.)')} value={rate} onChange={setRate} min={1} max={30} step={0.5} suffix="%" />
            <Field label={t('Time period')} value={years} onChange={setYears} min={1} max={40} step={1} suffix={t('years')} />
            {tab === 'sip' && <Field label={t('Annual step-up in SIP')} value={step} onChange={setStep} min={0} max={25} step={1} suffix="%" />}
          </div>
        </Panel>

        <Panel title="Result">
          <div className="calc-result">
            {tab === 'goal' ? (
              <div className="kpi big-kpi"><span>{t('Monthly SIP needed')}</span><strong className="num">{inr(goalSip)}</strong></div>
            ) : null}
            <div className="kpis">
              <div className="kpi"><span>{t('Amount invested')}</span><strong className="num">{last ? inr(last.invested) : '—'}</strong></div>
              <div className="kpi"><span>{t('Estimated returns')}</span><strong className="num up">{last ? inr(gain) : '—'}</strong></div>
              <div className="kpi"><span>{t('Estimated value')}</span><strong className="num">{last ? inr(last.value) : '—'}</strong></div>
            </div>
          </div>
          <div className="chart calc-chart">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={[{ year: 0, invested: tab === 'lumpsum' ? lump : 0, value: tab === 'lumpsum' ? lump : 0 }, ...rows]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--brand)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(y) => `${y}${t('y')}`} />
                <YAxis orientation="right" width={64} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={short} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }} labelFormatter={(y) => `${t('Year')} ${y}`} formatter={(v, name) => [inr(Number(v)), name === 'value' ? t('Estimated value') : t('Amount invested')]} />
                <Area type="monotone" dataKey="invested" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={2} fill="url(#gv)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <p className="note"><span>{t('This calculator is for illustration only. Returns are not guaranteed; actual returns depend on market movements and will vary. Taxes, exit load and expense ratio are not considered. Mutual fund investments are subject to market risks; read all scheme related documents carefully.')}</span></p>
      <CtaBand message="Hello Kanethic, I tried the SIP calculator and would like to know more about starting a SIP." />
    </>
  );
}
