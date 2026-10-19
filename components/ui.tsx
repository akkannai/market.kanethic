'use client';
import { ArrowDownRight, ArrowUpRight, Minus, Star } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Instrument } from '@/lib/instruments';
import type { Quote } from '@/lib/quotes';
import { nf, pctText, signed } from '@/lib/format';
import { useT } from './lang';
import { useQuotes, useWatchlist } from './providers';

export const dir = (n: number | null | undefined) => (n == null || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');

export function Delta({ inst, q, size = 'md' }: { inst: Instrument; q?: Quote; size?: 'md' | 'lg' }) {
  if (!q || q.change === null) return <span className="muted">—</span>;
  const d = dir(q.change);
  const Icon = d === 'up' ? ArrowUpRight : d === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`delta ${d} ${size}`}>
      <Icon size={size === 'lg' ? 18 : 14} aria-hidden />
      {inst.yield ? `${signed(q.change, 1)} bps` : <><span className="abs">{signed(q.change, inst.dp)}</span><span>{pctText(q.pct ?? 0)}</span></>}
    </span>
  );
}

export function Price({ inst, q }: { inst: Instrument; q?: Quote }) {
  return <span className="num">{q ? nf(q.price, inst.dp) : '—'}</span>;
}

export function Spark({ data, tone, w = 96, h = 32, fill = false }: { data: number[]; tone: string; w?: number; h?: number; fill?: boolean }) {
  if (data.length < 2) return <span className="spark-empty" style={{ width: w, height: h }} aria-hidden />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
  return (
    <svg className={`spark ${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Intraday trend" preserveAspectRatio="none">
      {fill && <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} className="spark-fill" />}
      <polyline points={pts.join(' ')} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function StateBadge({ q }: { q?: Quote }) {
  const t = useT();
  if (!q) return null;
  return q.state === 'live' ? (
    <span className="badge live"><i className="pulse" />{t('Near-live')}</span>
  ) : (
    <span className="badge closed">{t('Last close')}</span>
  );
}

export function StarButton({ id }: { id: string }) {
  const t = useT();
  const { has, toggle } = useWatchlist();
  const on = has(id);
  const label = on ? t('Remove from watchlist') : t('Add to watchlist');
  return (
    <button className={`icon-btn star ${on ? 'on' : ''}`} onClick={() => toggle(id)} aria-pressed={on} aria-label={label} title={label}>
      <Star size={16} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

export function Panel({ title, sub, action, children, className = '' }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title && t(title)}</h2>
          {sub && <p className="muted small">{t(sub)}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export const Skel = ({ h = 16, w = '100%' }: { h?: number; w?: number | string }) => <span className="skel" style={{ height: h, width: w }} />;

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function InstrumentTable({ items, showStar = true }: { items: Instrument[]; showStar?: boolean }) {
  const t = useT();
  const { quotes, loading } = useQuotes();
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('Name')}</th><th className="r">{t('Last')}</th><th className="r">{t('Change')}</th><th className="hide-sm">{t('Trend')}</th>{showStar && <th aria-label="Watchlist" />}
          </tr>
        </thead>
        <tbody>
          {items.map((inst) => {
            const q = quotes[inst.id];
            const d = dir(q?.change);
            return (
              <tr key={inst.id}>
                <td>
                  <Link href={`/instrument/${inst.id}`} className="name">{t(inst.name)}</Link>
                  <span className="sub">{t(inst.unit)}{q && q.state === 'closed' ? ` · ${t('last close')}` : ''}</span>
                </td>
                <td className="r"><strong><Price inst={inst} q={q} /></strong></td>
                <td className="r">{q ? <Delta inst={inst} q={q} /> : loading ? <Skel w={70} /> : <span className="muted" title={t('Data unavailable')}>n/a</span>}</td>
                <td className="hide-sm">{q && <Spark data={q.spark} tone={d} />}</td>
                {showStar && <td className="star-cell"><StarButton id={inst.id} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
