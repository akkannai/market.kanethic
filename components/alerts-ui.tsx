'use client';
import { Bell, BellOff, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { catalog, byId } from '@/lib/instruments';
import type { Cond } from '@/lib/alerts';
import { istTime, nf } from '@/lib/format';
import { useAlerts, useQuotes } from './providers';
import { useT } from './lang';
import { Empty, Panel } from './ui';

const CONDS: { key: Cond; label: string }[] = [
  { key: 'above', label: 'Price rises to or above' },
  { key: 'below', label: 'Price falls to or below' },
  { key: 'pct_up', label: 'Day change is up by at least (%)' },
  { key: 'pct_down', label: 'Day change is down by at least (%)' },
];

export function AlertsPanel() {
  const t = useT();
  const { alerts, add, remove, rearm, perm, askPermission } = useAlerts();
  const { quotes } = useQuotes();
  const [inst, setInst] = useState('nifty50');
  const [cond, setCond] = useState<Cond>('above');
  const [value, setValue] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('alert');
    if (id && byId.has(id)) setInst(id);
  }, []);

  const i = byId.get(inst)!;
  const q = quotes[inst];
  const num = Number(value.replace(/,/g, ''));
  const valid = Number.isFinite(num) && num > 0;
  const active = alerts.filter((a) => !a.triggeredAt);
  const done = alerts.filter((a) => a.triggeredAt);
  const describe = (a: (typeof alerts)[number]) => {
    const name = t(byId.get(a.inst)?.name ?? a.inst);
    const c = a.cond === 'above' ? `≥ ${nf(a.value, byId.get(a.inst)?.dp ?? 2)}` : a.cond === 'below' ? `≤ ${nf(a.value, byId.get(a.inst)?.dp ?? 2)}` : a.cond === 'pct_up' ? `▲ ${a.value}%` : `▼ ${a.value}%`;
    return `${name} ${c}`;
  };

  return (
    <Panel title="Price alerts" sub="Checked in your browser every 30 seconds while this site is open. No SMS or email is sent.">
      <form className="alert-form" onSubmit={(e) => { e.preventDefault(); if (valid) { add(inst, cond, num); setValue(''); } }}>
        <label>{t('Instrument')}
          <select value={inst} onChange={(e) => setInst(e.target.value)}>{catalog.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}</select>
        </label>
        <label>{t('When')}
          <select value={cond} onChange={(e) => setCond(e.target.value as Cond)}>{CONDS.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}</select>
        </label>
        <label>{t('Value')}
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={q ? nf(q.price, i.dp) : ''} />
        </label>
        <button className="btn primary" type="submit" disabled={!valid}><Bell size={15} aria-hidden /> {t('Add alert')}</button>
      </form>
      <p className="muted small pad-x">{q ? `${t('Current')}: ${nf(q.price, i.dp)} ${t(i.unit)}` : ''}</p>

      <div className="pad-x">
        {perm === 'default' && <button className="btn" onClick={askPermission}><Bell size={14} aria-hidden /> {t('Allow browser notifications')}</button>}
        {perm === 'denied' && <p className="muted small"><BellOff size={13} aria-hidden /> {t('Notifications are blocked in this browser; alerts will still show on this page.')}</p>}
        {perm === 'granted' && <p className="muted small">✓ {t('Browser notifications are on.')}</p>}
      </div>

      <h3 className="sub-head">{t('Active alerts')}</h3>
      {active.length === 0 ? <Empty>{t('No active alerts.')}</Empty> : (
        <ul className="rows">{active.map((a) => (
          <li key={a.id}><span>{describe(a)}</span><button className="icon-btn" aria-label={t('Delete alert')} onClick={() => remove(a.id)}><Trash2 size={15} /></button></li>
        ))}</ul>
      )}
      {done.length > 0 && (
        <>
          <h3 className="sub-head">{t('Triggered')}</h3>
          <ul className="rows">{done.map((a) => (
            <li key={a.id}>
              <span>{describe(a)}<span className="muted small block">{t('Triggered')} {istTime(a.triggeredAt as number, true)} IST · {nf(a.triggeredPrice as number, byId.get(a.inst)?.dp ?? 2)}</span></span>
              <span className="row-actions">
                <button className="icon-btn" aria-label={t('Re-arm alert')} title={t('Re-arm alert')} onClick={() => rearm(a.id)}><RotateCcw size={15} /></button>
                <button className="icon-btn" aria-label={t('Delete alert')} onClick={() => remove(a.id)}><Trash2 size={15} /></button>
              </span>
            </li>
          ))}</ul>
        </>
      )}
    </Panel>
  );
}
