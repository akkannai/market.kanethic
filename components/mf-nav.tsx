'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Download, GitCompare, Search } from 'lucide-react';
import { useT } from './lang';
import { Empty, Panel, Skel } from './ui';
import { PageHead } from './sections';
import { CtaBand } from './cta';
import { Amt, Num, Ratio, DataBar, DbError, IdcwNote, NoteBox, Pct, SchemeCell, SortTh, dateText, nfx, useJson, useUrlState, type MfStatus, type Row } from './mf-ui';

// ------------------------------------------------------------------ NAV Today
type Filters = { options: { amcs: string[]; mains: string[]; categories: { slug: string; category: string; main: string; sub: string; n: number }[] } };
const DEFAULTS = { q: '', amc: '', main: '', cat: '', plan: 'Regular', opt: 'Growth', move: '', sort: 'name', dir: 'asc', page: '1' };

export function NavTodayPage() {
  const t = useT();
  const [f, set, ready] = useUrlState(DEFAULTS);
  const [picked, setPicked] = useState<number[]>([]);
  const mv = useJson<{ date: string | null; gainers: Row[]; losers: Row[]; status: MfStatus }>('/api/mf/nav-today');
  const opts = useJson<Filters['options']>('/api/mf/filters');
  const qs = useMemo(() => {
    const sp = new URLSearchParams({ plan: f.plan || 'all', opt: f.opt || 'all', sort: f.sort, dir: f.dir, page: f.page, pageSize: '50' });
    for (const k of ['q', 'amc', 'main', 'cat', 'move'] as const) if (f[k]) sp.set(k, f[k]);
    return sp.toString();
  }, [f]);
  const list = useJson<{ rows: Row[]; total: number; page: number; pageSize: number }>(ready.current ? `/api/mf/schemes?${qs}` : null);
  const cats = (opts.data?.categories ?? []).filter((c) => !f.main || c.main === f.main);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const onSort = (k: string) => set({ sort: k, dir: f.sort === k && f.dir === 'asc' ? 'desc' : f.sort === k ? 'asc' : k === 'name' ? 'asc' : 'desc', page: '1' });
  const toggle = (c: number) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length < 5 ? [...p, c] : p));
  const hasIdcw = f.opt === 'IDCW' || f.opt === '' || list.data?.rows.some((r) => r.opt === 'IDCW');
  const err = mv.error || opts.error;
  const sel = (label: string, key: keyof typeof DEFAULTS, items: { v: string; l: string }[]) => (
    <label>{t(label)}<select value={f[key]} onChange={(e) => set({ [key]: e.target.value, page: '1', ...(key === 'main' ? { cat: '' } : {}) } as never)}>{items.map((i) => <option key={i.v} value={i.v}>{i.l}</option>)}</select></label>
  );

  return (
    <>
      <PageHead title="NAV Today" sub="Latest NAV of every mutual fund scheme from AMFI — with 1-day change, returns and filters." />
      {err && !mv.data ? <DbError message={err} /> : (
        <>
          <DataBar status={mv.data?.status} />
          <div className="grid-2">
            {([['Top 10 gainers', mv.data?.gainers], ['Top 10 losers', mv.data?.losers]] as [string, Row[] | undefined][]).map(([title, rows]) => (
              <Panel key={title} title={title} sub={t('Regular Growth plans · NAV date {d} · calculated summary', { d: dateText(mv.data?.date ?? null) })}>
                {!rows ? <div className="stack pad"><Skel h={20} /><Skel h={20} /><Skel h={20} /></div> : !rows.length ? <Empty>{t('Nothing to show.')}</Empty> : (
                  <ul className="rows mf-movers">
                    {rows.map((r) => (
                      <li key={r.code}><Link href={`/fund/${r.code}`}><b>{r.name}</b><span className="muted small">{r.amc}</span></Link><div className="r"><span className="num">₹{nfx(r.nav ?? 0, 4)}</span><Pct v={r.chgPct} /></div></li>
                    ))}
                  </ul>
                )}
              </Panel>
            ))}
          </div>

          <Panel title="All schemes" sub={list.data ? t('{n} schemes', { n: list.data.total.toLocaleString('en-IN') }) : undefined}
            action={picked.length > 1 ? <Link className="btn primary" href={`/compare?codes=${picked.join(',')}`}><GitCompare size={14} aria-hidden /> {t('Compare')} ({picked.length})</Link> : <span className="muted small">{t('Tick up to 5 schemes to compare')}</span>}>
            <div className="mf-search"><Search size={18} aria-hidden /><input value={f.q} onChange={(e) => set({ q: e.target.value, page: '1' })} placeholder={t('Search scheme, AMC or ISIN')} aria-label={t('Search scheme, AMC or ISIN')} /></div>
            <div className="mf-grid-filters">
              {sel('AMC', 'amc', [{ v: '', l: t('All AMCs') }, ...(opts.data?.amcs ?? []).map((a) => ({ v: a, l: a }))])}
              {sel('Category', 'main', [{ v: '', l: t('All categories') }, ...(opts.data?.mains ?? []).map((m) => ({ v: m, l: m }))])}
              {sel('Sub-category', 'cat', [{ v: '', l: t('All sub-categories') }, ...cats.map((c) => ({ v: c.slug, l: `${c.sub} (${c.n})` }))])}
              {sel('Plan', 'plan', [{ v: 'Regular', l: 'Regular' }, { v: 'Direct', l: 'Direct' }, { v: '', l: t('All plans') }])}
              {sel('Option', 'opt', [{ v: 'Growth', l: 'Growth' }, { v: 'IDCW', l: 'IDCW' }, { v: 'Bonus', l: 'Bonus' }, { v: '', l: t('All options') }])}
              {sel('Movement', 'move', [{ v: '', l: t('All') }, { v: 'up', l: '▲ ' + t('Gainers (+)') }, { v: 'down', l: '▼ ' + t('Losers (−)') }])}
            </div>
            <div className="table-wrap">
              <table className="tbl mf-tbl with-cb">
                <thead><tr>
                  <th aria-label="Compare" />
                  <SortTh label={t('Scheme')} k="name" sort={f.sort} dir={f.dir} onSort={onSort} />
                  <SortTh label="NAV (₹)" k="nav" sort={f.sort} dir={f.dir} onSort={onSort} cls="r" />
                  <SortTh label="1D ₹" k="chg" sort={f.sort} dir={f.dir} onSort={onSort} cls="r hide-sm" />
                  <SortTh label="1D %" k="chgPct" sort={f.sort} dir={f.dir} onSort={onSort} cls="r" />
                  <SortTh label="1M %" k="r1m" sort={f.sort} dir={f.dir} onSort={onSort} cls="r hide-sm" />
                  <SortTh label="1Y %" k="r1y" sort={f.sort} dir={f.dir} onSort={onSort} cls="r" />
                </tr></thead>
                <tbody>
                  {list.loading && !list.data ? Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={7}><Skel h={22} /></td></tr>) : list.data?.rows.map((r) => (
                    <tr key={r.code}>
                      <td><input type="checkbox" checked={picked.includes(r.code)} onChange={() => toggle(r.code)} aria-label={`${t('Compare')} ${r.name}`} /></td>
                      <SchemeCell r={r} showCat />
                      <td className="r"><strong className="num">{r.nav === null ? '—' : nfx(r.nav, 4)}</strong><span className="sub r">{dateText(r.navDate)}{r.prevDate ? ` ← ${dateText(r.prevDate)}` : ''}</span></td>
                      <td className="r hide-sm"><Amt v={r.chg} /></td><td className="r"><Pct v={r.chgPct} /></td>
                      <td className="r hide-sm"><Pct v={r.r1m} /></td><td className="r"><Pct v={r.r1y} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.data && list.data.rows.length === 0 && <Empty>{t('No scheme matched your filters.')}</Empty>}
            {list.error && <Empty>{list.error}</Empty>}
            <div className="pager">
              <button className="btn" disabled={+f.page <= 1} onClick={() => set({ page: String(+f.page - 1) })}>‹ {t('Previous')}</button>
              <span className="muted small">{t('Page')} {f.page} / {pages}</span>
              <button className="btn" disabled={+f.page >= pages} onClick={() => set({ page: String(+f.page + 1) })}>{t('Next')} ›</button>
            </div>
          </Panel>
          {hasIdcw && <IdcwNote />}
          <NoteBox>{t('1D change compares the latest NAV with the previous available NAV of the same scheme (weekends and holidays are skipped); both dates are shown. Returns: 1M/3M/6M/1Y are absolute, 3Y/5Y are CAGR, shown only where NAV history exists. NAV is published by AMFI after market hours and is not a live price.')}</NoteBox>
        </>
      )}
      <CtaBand />
    </>
  );
}

// ------------------------------------------------------------------ Categories
type Cat = { slug: string; category: string; main: string; sub: string; navDate: string | null; schemeCount: number; avg1d: number | null; median1d: number | null; gainers: number; losers: number; unchanged: number; total: number };

export function CategoriesPage() {
  const t = useT();
  const { data, error } = useJson<{ categories: Cat[]; status: MfStatus }>('/api/mf/categories');
  const groups = useMemo(() => { const m = new Map<string, Cat[]>(); for (const c of data?.categories ?? []) (m.get(c.main) ?? m.set(c.main, []).get(c.main)!).push(c); return [...m]; }, [data]);
  return (
    <>
      <PageHead title="Mutual fund categories" sub="All SEBI / AMFI scheme categories with scheme count and average 1-day change." />
      {error && !data ? <DbError message={error} /> : (
        <>
          <DataBar status={data?.status} />
          {!data ? <Skel h={240} /> : groups.map(([main, cats]) => (
            <Panel key={main} title={main} sub={t('Calculated summary · Regular Growth plans · same NAV date only')}>
              <div className="table-wrap"><table className="tbl"><thead><tr>
                <th>{t('Category')}</th><th className="r">{t('Schemes')}</th><th className="r">{t('Avg 1D %')}</th><th className="r hide-sm">{t('Median 1D %')}</th><th className="r hide-sm">▲ / ▼</th></tr></thead>
                <tbody>{cats.map((c) => (
                  <tr key={c.slug}>
                    <td><Link href={`/mutual-funds/categories/${c.slug}`} className="name">{c.sub}</Link><span className="sub">{c.total} {t('schemes in total (all plans)')}</span></td>
                    <td className="r num">{c.schemeCount}</td><td className="r"><Pct v={c.avg1d} /></td><td className="r hide-sm"><Pct v={c.median1d} /></td>
                    <td className="r hide-sm num"><span className="up">{c.gainers}</span> / <span className="down">{c.losers}</span></td>
                  </tr>))}</tbody></table></div>
            </Panel>
          ))}
          <NoteBox>{t('Summary = mean and median of 1-day % change of Regular Growth schemes whose latest NAV is for the same date. Categories come from AMFI’s own scheme list. This is a calculated summary, not an official index.')}</NoteBox>
        </>
      )}
      <CtaBand />
    </>
  );
}

// ------------------------------------------------------------------ Category detail
export function CategoryDetailPage({ slug }: { slug: string }) {
  const t = useT();
  const [f, set] = useUrlState({ plan: 'Regular', opt: 'Growth', sort: 'name', dir: 'asc', view: 'returns' });
  const url = `/api/mf/categories/${slug}?plan=${f.plan}&opt=${f.opt}`;
  const { data, error } = useJson<{ summary: Cat & { avg1d: number | null }; rows: Row[]; status: MfStatus }>(url);
  const rows = useMemo(() => {
    const k = f.sort as keyof Row;
    const dir = f.dir === 'desc' ? -1 : 1;
    return [...(data?.rows ?? [])].sort((a, b) => {
      const x = a[k], y = b[k];
      if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1;
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * dir;
    });
  }, [data, f.sort, f.dir]);
  const onSort = (k: string) => set({ sort: k, dir: f.sort === k && f.dir === 'asc' ? 'desc' : f.sort === k ? 'asc' : k === 'name' ? 'asc' : 'desc' });
  const th = (label: string, k: string, cls = 'r') => <SortTh label={label} k={k} sort={f.sort} dir={f.dir} onSort={onSort} cls={cls} />;
  return (
    <>
      <Link href="/mutual-funds/categories" className="back"><ArrowLeft size={15} aria-hidden /> {t('Categories')}</Link>
      {error && !data ? <DbError message={error} /> : !data ? <Skel h={300} /> : (
        <>
          <PageHead title={data.summary.sub} sub={`${data.summary.main} · ${t('{n} schemes', { n: data.rows.length })}`}>
            <a className="btn" href={`${url}&format=csv`} download><Download size={14} aria-hidden /> CSV</a>
          </PageHead>
          <DataBar status={data.status} />
          <div className="chips">
            {[['Regular', 'Regular'], ['Direct', 'Direct']].map(([v, l]) => <button key={v} className={f.plan === v ? 'on' : ''} onClick={() => set({ plan: v })}>{l}</button>)}
            <span className="chip-sep" />
            {[['Growth', 'Growth'], ['IDCW', 'IDCW'], ['Bonus', 'Bonus']].map(([v, l]) => <button key={v} className={f.opt === v ? 'on' : ''} onClick={() => set({ opt: v })}>{l}</button>)}
          </div>
          <div className="kpis cat-kpis">
            <div className="kpi"><span>{t('Avg 1D %')} <em>({t('Regular Growth')})</em></span><strong><Pct v={data.summary.avg1d} /></strong></div>
            <div className="kpi"><span>{t('Median 1D %')}</span><strong><Pct v={data.summary.median1d} /></strong></div>
            <div className="kpi"><span>{t('Gainers / Losers')}</span><strong className="num"><span className="up">{data.summary.gainers}</span> / <span className="down">{data.summary.losers}</span></strong></div>
          </div>
          <div className="seg view-tabs" role="tablist">{[['returns', t('Returns')], ['risk', t('Risk & ratios')]].map(([v, l]) => <button key={v} role="tab" aria-selected={f.view === v} className={f.view === v ? 'on' : ''} onClick={() => set({ view: v, sort: 'name', dir: 'asc' })}>{l}</button>)}</div>
          <Panel title="" className="cat-table">
            <div className="table-wrap">{f.view === 'risk' ? (
              <table className="tbl mf-tbl">
                <thead><tr>{th(t('Scheme'), 'name', '')}{th(t('Std dev 3Y %'), 'vol3y')}{th('Sharpe 3Y', 'sharpe3y')}{th('Sortino 3Y', 'sortino3y', 'r hide-sm')}{th(t('Max DD 3Y %'), 'mdd3y')}{th(t('Current DD %'), 'curDd', 'r hide-sm')}{th('Calmar 3Y', 'calmar3y', 'r hide-sm')}{th(t('Rolling 1Y median %'), 'roll1yMed', 'r hide-sm')}{th('SIP XIRR 3Y %', 'sip3y', 'r hide-sm')}</tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.code}><SchemeCell r={r} />
                    <td className="r"><Num v={r.vol3y} dp={2} /></td><td className="r"><Ratio v={r.sharpe3y} /></td><td className="r hide-sm"><Ratio v={r.sortino3y} /></td>
                    <td className="r"><Pct v={r.mdd3y} /></td><td className="r hide-sm"><Pct v={r.curDd} /></td><td className="r hide-sm"><Ratio v={r.calmar3y} /></td><td className="r hide-sm"><Pct v={r.roll1yMed} /></td><td className="r hide-sm"><Pct v={r.sip3y} /></td></tr>))}</tbody>
              </table>) : (
              <table className="tbl mf-tbl">
                <thead><tr>{th(t('Scheme'), 'name', '')}{th('NAV (₹)', 'nav')}{th('1D %', 'chgPct')}{th('1M %', 'r1m', 'r hide-sm')}{th('3M %', 'r3m', 'r hide-sm')}{th('6M %', 'r6m', 'r hide-sm')}{th('1Y %', 'r1y')}{th('3Y % CAGR', 'r3y', 'r hide-sm')}{th('5Y % CAGR', 'r5y', 'r hide-sm')}</tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.code}><SchemeCell r={r} />
                    <td className="r"><strong className="num">{r.nav === null ? '—' : nfx(r.nav, 4)}</strong><span className="sub r">{dateText(r.navDate)}</span></td>
                    <td className="r"><Pct v={r.chgPct} /></td><td className="r hide-sm"><Pct v={r.r1m} /></td><td className="r hide-sm"><Pct v={r.r3m} /></td><td className="r hide-sm"><Pct v={r.r6m} /></td>
                    <td className="r"><Pct v={r.r1y} /></td><td className="r hide-sm"><Pct v={r.r3y} /></td><td className="r hide-sm"><Pct v={r.r5y} /></td></tr>))}</tbody>
              </table>)}</div>
            {!rows.length && <Empty>{t('No schemes for this selection.')}</Empty>}
          </Panel>
          {(f.opt === 'IDCW') && <IdcwNote />}
          {f.view === 'risk' && <NoteBox>{t('Risk ratios are calculated from daily NAV history with the 91-day T-bill as risk-free rate (set by Kanethic admin). Std dev, Sharpe, Sortino and Max drawdown (DD) use the last 3 years; empty where history is shorter. Sorting is by the clicked column; a high Sharpe is not a recommendation.')}</NoteBox>}
          <NoteBox>{t('Returns shown only where NAV history exists (1M/3M/6M/1Y absolute, 3Y/5Y CAGR). Past performance may or may not be sustained in the future.')}</NoteBox>
        </>
      )}
      <CtaBand />
    </>
  );
}
