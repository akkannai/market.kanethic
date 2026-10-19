'use client';
import { ArrowRight, ExternalLink, Info, Star } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { byId, catalog, converterCurrencies, ofGroup, type Instrument } from '@/lib/instruments';
import type { Mover } from '@/lib/movers';
import type { NewsItem } from '@/lib/rss';
import type { CalEvent } from '@/lib/calendar';
import { ago, istTime, nf, pctText } from '@/lib/format';
import { usePoll, useQuotes, useWatchlist } from './providers';
import { useT } from './lang';
import { CtaBand } from './cta';
import { AlertsPanel } from './alerts-ui';
import { Delta, Empty, InstrumentTable, Panel, Price, Skel, Spark, StateBadge, dir } from './ui';

function PageHead({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="page-head">
      <div>
        <h1>{t(title)}</h1>
        <p className="muted">{t(sub)}</p>
      </div>
      {children}
    </div>
  );
}
export { PageHead };

function More({ href, label = 'View all' }: { href: string; label?: string }) {
  const t = useT();
  return <Link href={href} className="more">{t(label)} <ArrowRight size={14} aria-hidden /></Link>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="note"><Info size={15} aria-hidden /> <span>{children}</span></p>;
}

function HeroCard({ id }: { id: string }) {
  const t = useT();
  const { quotes, loading } = useQuotes();
  const inst = byId.get(id) as Instrument;
  const q = quotes[id];
  return (
    <Link href={`/instrument/${id}`} className="hero-card">
      <div className="hero-top"><span>{t(inst.name)}</span><StateBadge q={q} /></div>
      {q ? (
        <>
          <strong className="hero-price num"><Price inst={inst} q={q} /></strong>
          <Delta inst={inst} q={q} />
          <div className="hero-spark"><Spark data={q.spark} tone={dir(q.change)} w={260} h={46} fill /></div>
          <div className="hero-foot muted small">
            <span>{t('H')} {q.high !== null ? nf(q.high, inst.dp) : '—'}</span><span>{t('L')} {q.low !== null ? nf(q.low, inst.dp) : '—'}</span><span>{istTime(q.time, true)}</span>
          </div>
        </>
      ) : loading ? (
        <><Skel h={34} w="60%" /><Skel h={16} w="40%" /><Skel h={46} /></>
      ) : <p className="muted small">{t('Data unavailable right now.')}</p>}
    </Link>
  );
}

export function Movers({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { data, loading, error } = usePoll<{ gainers: Mover[]; losers: Mover[]; count: number; asOf: number; stale: boolean }>('/api/movers', 120_000);
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const rows = data ? data[tab] : [];
  return (
    <Panel
      title="Nifty 50 movers"
      sub={data ? t('{n} of 50 stocks · as of {time} IST', { n: data.count, time: istTime(data.asOf, true) }) : t('Top gainers and losers')}
      action={<div className="seg" role="tablist">{(['gainers', 'losers'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'gainers' ? t('Gainers') : t('Losers')}</button>)}</div>}
    >
      {loading ? <div className="stack pad"><Skel h={22} /><Skel h={22} /><Skel h={22} /></div> : error || !data ? <Empty>{t('Movers are unavailable right now.')}</Empty> : rows.length === 0 ? <Empty>{t('Nothing to show at the moment.')}</Empty> : (
        <ul className="rows">
          {rows.slice(0, compact ? 5 : 6).map((m) => (
            <li key={m.symbol}>
              <div><b>{m.name}</b><span className="muted small">{m.symbol}</span></div>
              <div className="r"><span className="num">{nf(m.price)}</span><span className={`${dir(m.change)} num small`}>{pctText(m.pct)}</span></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function NewsList({ limit, filterable = false }: { limit?: number; filterable?: boolean }) {
  const t = useT();
  const { data, loading, error } = usePoll<{ items: NewsItem[]; stale: boolean }>('/api/news', 5 * 60_000);
  const [source, setSource] = useState('all');
  const sources = useMemo(() => [...new Set((data?.items ?? []).map((n) => n.source))], [data]);
  const items = (data?.items ?? []).filter((n) => source === 'all' || n.source === source).slice(0, limit);
  return (
    <>
      {filterable && sources.length > 0 && (
        <div className="chips" role="group" aria-label={t('Filter by source')}>
          {['all', ...sources].map((s) => <button key={s} className={source === s ? 'on' : ''} onClick={() => setSource(s)}>{s === 'all' ? t('All sources') : s}</button>)}
        </div>
      )}
      {loading ? <div className="stack pad"><Skel h={20} /><Skel h={20} /><Skel h={20} /></div> : error || !data ? <Empty>{t('News feeds are unavailable right now.')}</Empty> : items.length === 0 ? <Empty>{t('No headlines.')}</Empty> : (
        <ul className="news">
          {items.map((n) => (
            <li key={n.link}>
              <a href={n.link} target="_blank" rel="noopener noreferrer">
                <span className="news-meta"><b>{n.source}</b> · {ago(n.time)}</span>
                <span className="news-title">{n.title}<ExternalLink size={13} aria-hidden /></span>
                {filterable && n.summary && <span className="muted small news-sum">{n.summary}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const flag: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳', AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿' };
const dayKey = (time: number) => new Date(time).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' });

export function CalendarList({ limit, upcomingOnly = false }: { limit?: number; upcomingOnly?: boolean }) {
  const t = useT();
  const { data, loading, error } = usePoll<{ events: CalEvent[] }>('/api/calendar', 30 * 60_000);
  const events = useMemo(() => {
    const now = Date.now();
    return (data?.events ?? []).filter((e) => !upcomingOnly || e.time > now - 2 * 3600_000).slice(0, limit);
  }, [data, limit, upcomingOnly]);
  if (loading) return <div className="stack pad"><Skel h={20} /><Skel h={20} /><Skel h={20} /></div>;
  if (error || !data) return <Empty>{t('Economic calendar is unavailable right now.')}</Empty>;
  if (!events.length) return <Empty>{t('No high or medium impact events in the current window.')}</Empty>;
  const groups = new Map<string, CalEvent[]>();
  events.forEach((e) => groups.set(dayKey(e.time), [...(groups.get(dayKey(e.time)) ?? []), e]));
  return (
    <div className="cal">
      {[...groups].map(([day, list]) => (
        <div key={day}>
          <h3 className="cal-day">{day}</h3>
          <ul className="rows">
            {list.map((e, i) => (
              <li key={i} className="cal-row">
                <span className="cal-time num">{new Date(e.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                <span className={`impact ${e.impact.toLowerCase()}`} title={`${e.impact} impact`} />
                <span className="cal-title"><span aria-hidden>{flag[e.country] ?? ''}</span> <b>{e.country}</b> {e.title}</span>
                <span className="cal-nums muted small">{e.forecast && <>{t('F')} {e.forecast}</>}{e.previous && <> · {t('P')} {e.previous}</>}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Converter() {
  const t = useT();
  const { quotes } = useQuotes();
  const codes = Object.keys(converterCurrencies);
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('INR');
  const inr = (c: string) => { const id = converterCurrencies[c]; return id === null ? 1 : quotes[id]?.price; };
  const a = inr(from), b = inr(to);
  const value = Number(amount.replace(/,/g, ''));
  const result = a && b && Number.isFinite(value) ? (value * a) / b : null;
  const rate = a && b ? a / b : null;
  return (
    <Panel title="Currency converter" sub="Cross rates are derived from live INR pairs">
      <div className="conv">
        <label>{t('Amount')}<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>{t('From')}<select value={from} onChange={(e) => setFrom(e.target.value)}>{codes.map((c) => <option key={c}>{c}</option>)}</select></label>
        <button className="swap" onClick={() => { setFrom(to); setTo(from); }} aria-label={t('Swap currencies')}>⇄</button>
        <label>{t('To')}<select value={to} onChange={(e) => setTo(e.target.value)}>{codes.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="conv-out">
        {result === null ? <span className="muted">{t('Waiting for rates…')}</span> : (
          <>
            <strong className="num">{nf(result, to === 'JPY' ? 0 : 2)} {to}</strong>
            <span className="muted small">1 {from} = {rate !== null ? nf(rate, rate < 1 ? 5 : 4) : '—'} {to}. {t('Indicative market rate — banks and remittance providers add a spread.')}</span>
          </>
        )}
      </div>
    </Panel>
  );
}

function StatusPills() {
  const t = useT();
  const { quotes } = useQuotes();
  const pills: [string, string][] = [['India', 'nifty50'], ['US', 'sp500'], ['Europe', 'dax'], ['Japan', 'nikkei']];
  return (
    <div className="pills">
      {pills.map(([label, id]) => {
        const q = quotes[id];
        return <span key={id} className={`pill ${q?.state === 'live' ? 'live' : ''}`}><i className={q?.state === 'live' ? 'pulse' : 'dot-off'} />{t(label)}: {q ? (q.state === 'live' ? t('trading') : t('closed')) : '…'}</span>;
      })}
    </div>
  );
}

export function Overview() {
  const t = useT();
  return (
    <>
      <PageHead title="Market pulse" sub="Indian and global markets at a glance — refreshed automatically every 30 seconds."><StatusPills /></PageHead>
      <div className="hero-grid">{['nifty50', 'sensex', 'banknifty', 'usdinr'].map((id) => <HeroCard key={id} id={id} />)}</div>
      <div className="grid-2">
        <Panel title="Indian indices" action={<More href="/india" />}><InstrumentTable items={ofGroup('india').slice(0, 6)} /></Panel>
        <Panel title="Global indices" action={<More href="/global" />}><InstrumentTable items={ofGroup('global').slice(0, 6)} /></Panel>
      </div>
      <div className="grid-3">
        <Movers compact />
        <Panel title="Commodities & rates" action={<More href="/commodities" />}><InstrumentTable items={[byId.get('gold-in'), byId.get('gold'), byId.get('brent'), byId.get('us10y')] as Instrument[]} showStar={false} /></Panel>
        <Panel title="Currencies" action={<More href="/currencies" />}><InstrumentTable items={ofGroup('fx').slice(0, 4)} showStar={false} /></Panel>
      </div>
      <div className="grid-2">
        <Panel title="Latest headlines" action={<More href="/news" />}><NewsList limit={7} /></Panel>
        <Panel title="Upcoming events" sub="Times in IST · high & medium impact" action={<More href="/calendar" />}><CalendarList limit={7} upcomingOnly /></Panel>
      </div>
      <div className="grid-2">
        <Panel title="Mutual funds" sub="Search any scheme and see its latest NAV from AMFI." action={<More href="/mutual-funds" label="Search funds" />}>
          <div className="pad"><Link href="/mutual-funds" className="btn">{t('Open mutual fund search')} <ArrowRight size={14} aria-hidden /></Link></div>
        </Panel>
        <Panel title="SIP & lumpsum calculators" sub="See how regular investing can grow over time." action={<More href="/calculators" label="Open calculators" />}>
          <div className="pad"><Link href="/calculators" className="btn">{t('Try the SIP calculator')} <ArrowRight size={14} aria-hidden /></Link></div>
        </Panel>
      </div>
      <CtaBand />
    </>
  );
}

export function GroupPage({ title, sub, groups, extra, note }: { title: string; sub: string; groups: Instrument['group'][]; extra?: ReactNode; note?: string }) {
  const t = useT();
  const items = catalog.filter((i) => groups.includes(i.group));
  return (
    <>
      <PageHead title={title} sub={sub} />
      <Panel title={title}><InstrumentTable items={items} /></Panel>
      {note && <Note>{t(note)}</Note>}
      {extra}
    </>
  );
}

export const IndiaPage = () => (
  <GroupPage title="Indian markets" sub="Benchmark and sectoral indices from NSE and BSE." groups={['india']} extra={<Movers />}
    note="Index levels come from a public data feed that can lag the exchange by a few minutes. India VIX is shown in points." />
);
export const GlobalPage = () => <GroupPage title="Global markets" sub="Major equity indices across the Americas, Europe and Asia-Pacific." groups={['global']} note="Each index follows its own exchange timezone and holidays. “Last close” means that market is closed." />;
export const CurrenciesPage = () => <GroupPage title="Currencies" sub="Rupee crosses and major pairs." groups={['fx']} extra={<Converter />} note="Interbank / reference-style quotes. Retail and remittance rates include a spread." />;
export const CommoditiesPage = () => (
  <GroupPage title="Commodities & rates" sub="Bullion, energy, metals, treasury yield and the dollar index." groups={['commodity', 'rates']}
    note="Indian gold and silver are indicative: international price × USD/INR plus an import-duty premium. GST, making charges and local dealer premiums are not included, so shop prices will differ. COMEX futures follow the front-month contract." />
);

export function NewsPage() {
  return (
    <>
      <PageHead title="Financial news" sub="Headlines from Indian business publishers, the RBI and the U.S. Federal Reserve. Links open the publisher's site." />
      <Panel title="Latest headlines"><NewsList filterable /></Panel>
    </>
  );
}
export function CalendarPage() {
  const t = useT();
  return (
    <>
      <PageHead title="Economic calendar" sub="High and medium impact releases, shown in Indian Standard Time. F = forecast, P = previous." />
      <Panel title="This and next week"><CalendarList upcomingOnly /></Panel>
      <Note>{t('The free calendar covers major global economies (US, Euro area, UK, Japan, China, Australia, Canada…). Indian data releases (CPI, GDP, RBI policy) are not included; RBI announcements appear under News.')}</Note>
    </>
  );
}

export function WatchlistPage() {
  const t = useT();
  const { ids, ready, toggle } = useWatchlist();
  const items = ids.map((id) => byId.get(id)).filter(Boolean) as Instrument[];
  return (
    <>
      <PageHead title="Watchlist & Alerts" sub="Saved on this device only. Tap the star on any instrument to add it." />
      {!ready ? <Skel h={120} /> : items.length ? (
        <Panel title={t('{n} saved', { n: items.length })}><InstrumentTable items={items} /></Panel>
      ) : (
        <Panel title="Nothing saved yet">
          <div className="pad">
            <Empty>{t('Start with a few popular instruments:')}</Empty>
            <div className="chips">{['nifty50', 'sensex', 'usdinr', 'gold-in', 'brent', 'sp500'].map((id) => <button key={id} onClick={() => toggle(id)}><Star size={13} aria-hidden /> {t(byId.get(id)?.name.replace(' (India, indicative)', '') ?? id)}</button>)}</div>
          </div>
        </Panel>
      )}
      <AlertsPanel />
    </>
  );
}

type Health = { now: number; sources: Record<string, { lastOk?: number; lastError?: string; lastErrorAt?: number; ok: number; fail: number }> };

const SOURCE_TABLE: [string, string, string][] = [
  ['Yahoo Finance (public chart endpoints)', 'Indices, FX, futures, yields, Nifty 50 stocks', 'Near-live; some exchanges delayed up to 15–20 min. Unofficial endpoint — suited to informational use, see note below.'],
  ['AMFI (amfiindia.com NAVAll)', 'Mutual fund NAV (all AMCs)', 'Official daily NAV file; refreshed every 3 hours. NAV is published after market hours.'],
  ['mfapi.in', 'Mutual fund NAV history', 'Free community API built on AMFI data; used for charts and trailing returns (computed here).'],
  ['Economic Times, Moneycontrol, Mint, Business Standard', 'Headlines (title, snippet, link)', 'Public RSS. Refreshed every 5 minutes. Each headline links to the publisher.'],
  ['RBI and U.S. Federal Reserve RSS', 'Official press releases', 'Public RSS.'],
  ['Faireconomy weekly calendar', 'Global economic calendar', 'Refreshed every 30 minutes. No Indian releases.'],
  ['Derived', 'Indian gold / silver, currency converter', 'Computed on the server from the feeds above; formula is shown on the instrument page.'],
];

export function SourcesPage() {
  const t = useT();
  const { data } = usePoll<Health>('/api/health', 30_000);
  const { failed, quotes } = useQuotes();
  const entries = Object.entries(data?.sources ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <PageHead title="Data & sources" sub="Where every number comes from, how fresh it is, and what is not covered." />
      <Panel title="Sources">
        <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Source')}</th><th>{t('Used for')}</th><th>{t('Freshness / notes')}</th></tr></thead>
          <tbody>{SOURCE_TABLE.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td className="muted">{c}</td></tr>)}</tbody></table></div>
      </Panel>
      <Panel title="Live feed health" sub="Since the server last started">
        {!entries.length ? <Empty>{t('No feed activity recorded yet.')}</Empty> : (
          <div className="table-wrap"><table className="tbl"><thead><tr><th>{t('Feed')}</th><th>{t('Last success')}</th><th className="r">{t('OK / Failed')}</th><th>{t('Last error')}</th></tr></thead>
            <tbody>{entries.map(([name, h]) => (
              <tr key={name}><td><b>{name}</b></td><td>{h.lastOk ? `${istTime(h.lastOk)} IST` : '—'}</td><td className="r num">{h.ok} / {h.fail}</td>
                <td className="muted small">{h.lastError ? `${h.lastError} (${ago(h.lastErrorAt as number)})` : '—'}</td></tr>
            ))}</tbody></table></div>
        )}
        <p className="panel-foot small muted">{t('{n} instruments loaded', { n: Object.keys(quotes).length })}{failed.length ? ` · ${t('unavailable now')}: ${failed.map((id) => byId.get(id)?.name ?? id).join(', ')}` : ` · ${t('none missing')}`}.</p>
      </Panel>
      <Note>{t('Values are market references for information. Before relying on prices for transactions, confirm with the exchange or your broker. If this site is published commercially, review each provider’s terms and consider a licensed market-data feed.')}</Note>
    </>
  );
}
