'use client';
import { Moon, RefreshCw, Search, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { catalog, sections } from '@/lib/instruments';
import { istTime, nf, pctText } from '@/lib/format';
import { dir } from './ui';
import { useQuotes } from './providers';

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => setTheme((document.documentElement.dataset.theme as 'light' | 'dark') || 'light'), []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kmh-theme', next); } catch {}
  };
  return (
    <button className="icon-btn on-dark" onClick={flip} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function SearchBox() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const matches = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    return catalog.filter((i) => i.name.toLowerCase().includes(t) || i.id.includes(t) || i.symbol?.toLowerCase().includes(t)).slice(0, 7);
  }, [text]);
  const go = (id: string) => { setText(''); setOpen(false); router.push(`/instrument/${id}`); };
  return (
    <div className="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <Search size={16} aria-hidden />
      <input
        value={text}
        placeholder="Search Nifty, gold, USD/INR…"
        aria-label="Search instruments"
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) go(matches[0].id); if (e.key === 'Escape') setOpen(false); }}
      />
      {open && text.trim() && (
        <ul className="search-pop">
          {matches.length ? matches.map((m) => (
            <li key={m.id}><button onMouseDown={(e) => e.preventDefault()} onClick={() => go(m.id)}>{m.name}<span>{m.kind}</span></button></li>
          )) : <li className="muted small pad">No match</li>}
        </ul>
      )}
    </div>
  );
}

function LiveClock() {
  const { updated, error, stale, refresh, loading } = useQuotes();
  const [spin, setSpin] = useState(false);
  const bad = error || stale;
  return (
    <div className="live-clock" title={bad ? 'Showing last successful data' : 'Auto-refreshes every 30 seconds'}>
      <span className={`dot ${bad ? 'warn' : 'ok'}`} aria-hidden />
      <span className="hide-sm">{loading && !updated ? 'Connecting…' : bad ? 'Delayed · ' : 'Updated '}{updated ? `${istTime(updated)} IST` : ''}</span>
      <button className="icon-btn on-dark" aria-label="Refresh now" onClick={async () => { setSpin(true); await refresh(); setSpin(false); }}>
        <RefreshCw size={16} className={spin ? 'spin' : ''} />
      </button>
    </div>
  );
}

function Ticker() {
  const { quotes } = useQuotes();
  const items = catalog.filter((i) => i.hot && quotes[i.id]);
  if (!items.length) return <div className="ticker" aria-hidden><span className="ticker-empty">Loading market data…</span></div>;
  const row = (suffix: string) => items.map((i) => {
    const q = quotes[i.id];
    return (
      <Link key={i.id + suffix} href={`/instrument/${i.id}`} className="tick" tabIndex={suffix ? -1 : 0} aria-hidden={suffix ? true : undefined}>
        <b>{i.name.replace(' (India, indicative)', '').replace(' (COMEX futures)', '').replace(' (front month)', '')}</b>
        <span className="num">{nf(q.price, i.dp)}</span>
        <span className={`${dir(q.change)} num`}>{i.yield ? (q.change === null ? '' : `${q.change > 0 ? '+' : ''}${q.change.toFixed(1)} bps`) : q.pct === null ? '' : pctText(q.pct)}</span>
      </Link>
    );
  });
  return (
    <div className="ticker" role="region" aria-label="Market ticker">
      <div className="ticker-track">{row('')}{row('-dup')}</div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = path === '/' ? 'overview' : path.split('/')[1] === 'instrument' ? '' : path.split('/')[1];
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand" aria-label="Kanethic Market Hub home">
            <span className="brand-mark">K</span>
            <span className="brand-text"><b>Kanethic</b><small>Market Hub</small></span>
          </Link>
          <nav className="nav" aria-label="Sections">
            {sections.map((s) => (
              <Link key={s.slug} href={s.slug === 'overview' ? '/' : `/${s.slug}`} className={active === s.slug ? 'active' : ''} aria-current={active === s.slug ? 'page' : undefined}>{s.label}</Link>
            ))}
          </nav>
          <div className="actions"><SearchBox /><LiveClock /><ThemeToggle /></div>
        </div>
        <Ticker />
      </header>
      <main className="page">{children}</main>
      <footer className="foot">
        <div>
          <b>Kanethic Private Limited</b> · Invest With Discipline. · AMFI-registered Mutual Fund Distributor | ARN-254247
        </div>
        <p>
          Market data is sourced from third-party public feeds and may be delayed by up to 15–20 minutes. It is provided for information only and is not investment advice
          or an offer to buy or sell any security. Mutual fund investments are subject to market risks; read all scheme related documents carefully.
        </p>
      </footer>
    </>
  );
}
