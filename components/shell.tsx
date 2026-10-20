'use client';
import { Bell, Moon, RefreshCw, Search, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { catalog, sections } from '@/lib/instruments';
import { istTime, nf, pctText } from '@/lib/format';
import { dir } from './ui';
import { useAlerts, useQuotes } from './providers';
import { useLang, useT } from './lang';
import { TalkToUs } from './cta';

function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => setTheme((document.documentElement.dataset.theme as 'light' | 'dark') || 'light'), []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kmh-theme', next); } catch {}
  };
  return (
    <button className="icon-btn on-dark" onClick={flip} aria-label={theme === 'dark' ? t('Switch to light theme') : t('Switch to dark theme')}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>EN</button>
      <button className={lang === 'gu' ? 'on' : ''} onClick={() => setLang('gu')} aria-pressed={lang === 'gu'} lang="gu">ગુ</button>
    </div>
  );
}

function SearchBox() {
  const t = useT();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((i) => i.name.toLowerCase().includes(q) || t(i.name).toLowerCase().includes(q) || i.id.includes(q) || i.symbol?.toLowerCase().includes(q)).slice(0, 7);
  }, [text, t]);
  const go = (path: string) => { setText(''); setOpen(false); router.push(path); };
  const [funds, setFunds] = useState<{ code: string; name: string; nav: number }[]>([]);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 3) { setFunds([]); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/mf/search?q=${encodeURIComponent(q)}&option=growth`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => setFunds((j.results ?? []).slice(0, 5)))
        .catch(() => {});
    }, 300);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [text]);
  return (
    <div className="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <Search size={16} aria-hidden />
      <input
        value={text}
        placeholder={t('Search Nifty, gold, USD/INR…')}
        aria-label={t('Search instruments')}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) go(`/instrument/${matches[0].id}`); if (e.key === 'Escape') setOpen(false); }}
      />
      {open && text.trim() && (
        <ul className="search-pop">
          {matches.map((m) => (
            <li key={m.id}><button onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/instrument/${m.id}`)}>{t(m.name)}<span>{t(m.kind)}</span></button></li>
          ))}
          {funds.map((f) => (
            <li key={f.code}><button onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/fund/${f.code}`)}><span className="fund-name">{f.name}</span><span>₹{nf(f.nav, 2)}</span></button></li>
          ))}
          <li><button onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/mutual-funds?q=${encodeURIComponent(text.trim())}`)}>{t('Search mutual funds for')} “{text.trim()}”<span>AMFI</span></button></li>
        </ul>
      )}
    </div>
  );
}

function LiveClock() {
  const t = useT();
  const { updated, error, stale, refresh, loading } = useQuotes();
  const [spin, setSpin] = useState(false);
  const bad = error || stale;
  return (
    <div className="live-clock" title={bad ? t('Showing last successful data') : t('Auto-refreshes every 30 seconds')}>
      <span className={`dot ${bad ? 'warn' : 'ok'}`} aria-hidden />
      <span className="hide-sm">{loading && !updated ? t('Connecting…') : bad ? `${t('Delayed')} · ` : `${t('Updated')} `}{updated ? `${istTime(updated)} IST` : ''}</span>
      <button className="icon-btn on-dark" aria-label={t('Refresh now')} onClick={async () => { setSpin(true); await refresh(); setSpin(false); }}>
        <RefreshCw size={16} className={spin ? 'spin' : ''} />
      </button>
    </div>
  );
}

function Ticker() {
  const t = useT();
  const { quotes } = useQuotes();
  const items = catalog.filter((i) => i.hot && quotes[i.id]);
  if (!items.length) return <div className="ticker" aria-hidden><span className="ticker-empty">{t('Loading market data…')}</span></div>;
  const row = (suffix: string) => items.map((i) => {
    const q = quotes[i.id];
    return (
      <Link key={i.id + suffix} href={`/instrument/${i.id}`} className="tick" tabIndex={suffix ? -1 : 0} aria-hidden={suffix ? true : undefined}>
        <b>{t(i.name.replace(' (India, indicative)', '').replace(' (COMEX futures)', '').replace(' (front month)', ''))}</b>
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

function AlertToasts() {
  const t = useT();
  const { toasts, dismiss } = useAlerts();
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className="toast">
          <Bell size={16} aria-hidden />
          <div><b>{t('Price alert triggered')}</b><span>{x.text}</span></div>
          <Link href="/watchlist" onClick={() => dismiss(x.id)} className="more">{t('View')}</Link>
          <button className="icon-btn" aria-label={t('Dismiss')} onClick={() => dismiss(x.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const path = usePathname();
  const seg = path.split('/')[1];
  const active = path === '/' ? 'overview' : seg === 'instrument' ? '' : seg === 'fund' ? 'mutual-funds' : seg;
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand" aria-label="Kanethic Market Hub home">
            <span className="brand-mark"><img src="/logo-icon.png" alt="" width={40} height={34} /></span>
            <span className="brand-text"><b>Kanethic</b><small>Market Hub</small></span>
          </Link>
          <div className="actions"><SearchBox /><LiveClock /><LangToggle /><ThemeToggle /><TalkToUs compact /></div>
        </div>
        <nav className="nav-row" aria-label="Sections">
          <div className="nav">
            {sections.filter((s) => s.nav !== false).map((s) => (
              <Link key={s.slug} href={s.slug === 'overview' ? '/' : `/${s.slug}`} className={active === s.slug ? 'active' : ''} aria-current={active === s.slug ? 'page' : undefined}>{t(s.label)}</Link>
            ))}
          </div>
        </nav>
        <Ticker />
      </header>
      <main className="page">{children}</main>
      <AlertToasts />
      <footer className="foot">
        <img src="/logo.png" alt="Kanethic — Invest With Discipline" className="foot-logo" width={120} height={120} />
        <div>
          <b>Kanethic Private Limited</b> · Invest With Discipline. · AMFI-registered Mutual Fund Distributor | ARN-254247 · <Link href="/sources" className="more">{t('Data & sources')}</Link>
        </div>
        <p>
          {t('Market data is sourced from third-party public feeds and may be delayed by up to 15–20 minutes. It is provided for information only and is not investment advice or an offer to buy or sell any security.')}{' '}
          {t('Mutual fund investments are subject to market risks; read all scheme related documents carefully. Past performance may or may not be sustained in the future.')}
        </p>
      </footer>
    </>
  );
}
