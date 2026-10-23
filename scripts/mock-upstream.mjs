// DEV ONLY: `npm run dev:mock` — upstream hosts na fake jawab (offline UI testing mate).
// Production ma kadi vaparvu nahi. Aa data asli nathi.
const real = globalThis.fetch;
const base = { '^BSESN': 80500, '^NSEI': 24500, '^NSEBANK': 52000, '^GSPC': 6200, '^IXIC': 20500, '^DJI': 44000, 'GC=F': 3400, 'SI=F': 38, 'BZ=F': 68, 'CL=F': 65, 'USDINR=X': 87.5, '^TNX': 4.3, 'DX-Y.NYB': 99 };
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function chart(symbol, range, interval) {
  const h = hash(symbol);
  const b = base[symbol] ?? 100 + (h % 20000) / (h % 3 ? 1 : 10);
  const now = Math.floor(Date.now() / 1000);
  const step = { '5m': 300, '15m': 900, '1d': 86400, '1wk': 604800 }[interval];
  const n = { '1d': 78, '5d': 130, '1mo': 22, '6mo': 126, '1y': 252, '5y': 260 }[range];
  let v = b * (1 - 0.01 * ((h % 7) - 3));
  const ts = [], close = [], open = [], high = [], low = [];
  let seed = h;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
  for (let i = n - 1; i >= 0; i--) {
    const o = v; v = v * (1 + rnd() * 0.004);
    ts.push(now - i * step); open.push(o); close.push(v); high.push(Math.max(o, v) * 1.001); low.push(Math.min(o, v) * 0.999);
  }
  return { chart: { result: [{ meta: { regularMarketPrice: v, chartPreviousClose: b, regularMarketTime: now - (h % 5 === 0 ? 7200 : 30), regularMarketDayHigh: Math.max(...high), regularMarketDayLow: Math.min(...low), fiftyTwoWeekHigh: b * 1.15, fiftyTwoWeekLow: b * 0.8 }, timestamp: ts, indicators: { quote: [{ open, close, high, low }] } }], error: null } };
}
const rss = (name) => `<?xml version="1.0"?><rss><channel>${Array.from({ length: 8 }, (_, i) => `<item><title><![CDATA[${name}: Sample headline ${i + 1} &amp; markets]]></title><link>https://example.com/${name.replace(/\W/g, '')}/${i}</link><pubDate>${new Date(Date.now() - (i * 17 + hash(name) % 30) * 60000).toUTCString()}</pubDate><description>&lt;p&gt;Mock summary text for ${name}.&lt;/p&gt;</description></item>`).join('')}</channel></rss>`;
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
// ---- mock AMFI NAVAll + mfapi (consistent: mfapi history ends at the AMFI NAV)
const AMCS = ['Alpha Mutual Fund', 'Beta Mutual Fund', 'Gamma Mutual Fund', 'Delta Mutual Fund', 'Omega Mutual Fund'];
const CATS = ['Equity Scheme - Large Cap Fund', 'Equity Scheme - Mid Cap Fund', 'Equity Scheme - Flexi Cap Fund', 'Equity Scheme - ELSS', 'Debt Scheme - Liquid Fund', 'Other Scheme - Index Funds'];
const VARIANTS = [['Regular Plan', 'Growth'], ['Regular Plan', 'IDCW'], ['Direct Plan', 'Growth'], ['Direct Plan', 'IDCW']];
const lastWeekday = () => { const d = new Date(Date.now() + 5.5 * 3600e3); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1); return d; };
const ddMonYyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}-${d.getUTCFullYear()}`;
const schemes = []; { let code = 120000; for (const cat of CATS) for (const amc of AMCS) for (const [plan, opt] of VARIANTS) { code++; const short = cat.split(' - ')[1].replace(' Fund', ''); schemes.push({ code, amc, cat, name: `${amc.replace(' Mutual Fund', '')} ${short} Fund - ${plan} - ${opt === 'IDCW' ? 'IDCW' : 'Growth'}`, nav: 10 + (hash(String(code)) % 4000) / 10 }); } }
const amfi = () => { let out = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\r\n'; const date = ddMonYyyy(lastWeekday());
  for (const cat of CATS) { out += `\nOpen Ended Schemes(${cat})\n`; for (const amc of AMCS) { out += `\n${amc}\n\n`; for (const s of schemes.filter((x) => x.cat === cat && x.amc === amc)) out += `${s.code};INF${String(s.code).padStart(9, '0')}${s.code % 10};-;${s.name};${s.name.includes('Direct') ? 'Direct' : 'Regular'};${s.name.endsWith('IDCW') ? 'IDCW Payout' : 'Growth'};${s.nav.toFixed(4)};${date}\r\n`; } }
  return out; };
const mfapi = (code) => {
  const s = schemes.find((x) => x.code === Number(code)); if (!s) return { meta: {}, data: [] };
  const data = []; const end = lastWeekday(); let seed = (hash(String(code)) * 2654435761) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5); for (let i = 0; i < 7; i++) rnd();
  let v = s.nav; for (let d = 0; d <= 365 * 6; d++) { const t = new Date(end.getTime() - d * 86400e3); if (t.getUTCDay() % 6 === 0) continue; data.push({ date: `${String(t.getUTCDate()).padStart(2, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${t.getUTCFullYear()}`, nav: v.toFixed(4) }); v = v / (1 + 0.0004 + rnd() * 0.012); }
  return { meta: { scheme_name: s.name, fund_house: s.amc, scheme_category: s.cat }, data };
};
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname.includes('ibjarates.com')) return process.env.MOCK_IBJA_FAIL ? new Response('blocked', { status: 403 }) : new Response('<html><table><tr><td>Gold 999</td><td>1,11,900</td><td>1,12,000</td></tr><tr><td>Gold 995</td><td>1,11,500</td></tr><tr><td>Silver 999</td><td>1,40,100</td><td>1,40,500</td></tr></table></html>', { status: 200 });
  if (url.hostname.includes('frankfurter') && /\/v1\/\d{4}-\d{2}-\d{2}\.\./.test(url.pathname)) {
    const from = Date.parse(url.pathname.match(/(\d{4}-\d{2}-\d{2})\.\./)[1]); const rates = {}; const syms = (url.searchParams.get('symbols') || '').split(',');
    for (let t = Math.max(from, Date.UTC(2009, 0, 1)); t < Date.now(); t += 86400e3) { const dt = new Date(t); if (dt.getUTCDay() % 6 === 0) continue; const r = {}; syms.forEach((c, i) => { r[c] = c === 'INR' ? 45 + (t - Date.UTC(2009, 0, 1)) / 86400e3 * 0.0075 : 0.9 + i * 0.1; }); rates[dt.toISOString().slice(0, 10)] = r; }
    return json({ base: 'USD', rates });
  }
  if (url.hostname.includes('frankfurter')) {
    const rates = {}; for (let d = 9; d >= 0; d--) { const dt = new Date(Date.now() - d * 86400e3); if (dt.getUTCDay() % 6 === 0) continue; const f = 1 + 0.003 * Math.sin(d); rates[dt.toISOString().slice(0, 10)] = { INR: 87.5 * f, EUR: 0.86 * f, GBP: 0.75, CAD: 1.38, AUD: 1.52, SGD: 1.3, JPY: 150 }; }
    return json({ base: 'USD', rates });
  }
  if (url.hostname.includes('stooq')) {
    const rows = ['Date,Open,High,Low,Close,Volume']; for (let d = 8; d >= 0; d--) { const dt = new Date(Date.now() - d * 86400e3); if (dt.getUTCDay() % 6 === 0) continue; const c = 6000 + d * 7; rows.push(`${dt.toISOString().slice(0, 10)},${c},${c + 20},${c - 20},${c + 3},1`); }
    return new Response(rows.join('\n'), { status: 200 });
  }
  if (url.hostname === 'fc.yahoo.com') return new Response('', { status: 404, headers: [['set-cookie', 'A3=mock; Path=/; Domain=.yahoo.com']] });
  if (url.hostname.includes('yahoo.com') && url.pathname.includes('getcrumb')) return new Response('mockCrumb123', { status: 200 });
  if (url.hostname.includes('yahoo.com') && url.pathname.includes('/v7/finance/quote')) {
    if (process.env.MOCK_V7_FAIL) return new Response('Too Many Requests', { status: 429 });
    const syms = decodeURIComponent(url.searchParams.get('symbols') || '').split(',');
    const now = Math.floor(Date.now() / 1000);
    return json({ quoteResponse: { result: syms.map((symbol) => { const b = base[symbol] ?? 100 + (hash(symbol) % 20000) / 10; return { symbol, regularMarketPrice: b * 1.004, regularMarketPreviousClose: b, regularMarketOpen: b, regularMarketDayHigh: b * 1.01, regularMarketDayLow: b * 0.99, regularMarketTime: now - 20, fiftyTwoWeekHigh: b * 1.2, fiftyTwoWeekLow: b * 0.8 }; }), error: null } });
  }
  if (url.hostname.includes('nseindia.com')) {
    if (process.env.MOCK_NSE_FAIL) return new Response('Forbidden', { status: 403 });
    if (url.pathname === '/') return new Response('<html></html>', { status: 200, headers: [['set-cookie', 'nsit=mock; Path=/'], ['set-cookie', 'nseappid=mock; Path=/']] });
    const ts = new Date(Date.now() + 5.5 * 3600e3).toISOString(); const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+ts.slice(5, 7) - 1];
    const stamp = `${ts.slice(8, 10)}-${mon}-${ts.slice(0, 4)} ${ts.slice(11, 19)}`;
    if (url.pathname.includes('indicesHistory')) {
      const [d1, m1, y1] = url.searchParams.get('from').split('-').map(Number); const [d2, m2, y2] = url.searchParams.get('to').split('-').map(Number);
      const a = Date.UTC(y1, m1 - 1, d1), b = Date.UTC(y2, m2 - 1, d2); const recs = [];
      if (y1 < 2000) return json({ data: { indexCloseOnlineRecords: [] } });
      for (let t = a; t <= b; t += 86400e3) { const dt = new Date(t); if (dt.getUTCDay() % 6 === 0) continue; recs.push({ EOD_TIMESTAMP: `${String(dt.getUTCDate()).padStart(2, '0')}-${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][dt.getUTCMonth()]}-${dt.getUTCFullYear()}`, EOD_CLOSE_INDEX_VAL: (10000 + (t - Date.UTC(2000, 0, 1)) / 86400e3 * 3.2).toFixed(2) }); }
      return json({ data: { indexCloseOnlineRecords: recs } });
    }
    if (url.pathname.includes('allIndices')) return json({ timestamp: stamp, data: [['NIFTY 50', 24593], ['NIFTY BANK', 53600], ['INDIA VIX', 12.4], ['NIFTY IT', 38000], ['NIFTY MIDCAP 100', 56000]].map(([index, last]) => ({ index, last, previousClose: last * 0.995, open: last * 0.997, high: last * 1.004, low: last * 0.99, yearHigh: last * 1.2, yearLow: last * 0.8 })) });
    if (url.pathname.includes('equity-stockIndices')) return json({ timestamp: stamp, data: [{ symbol: 'NIFTY 50', priority: 1, lastPrice: 24593 }, ...['RELIANCE','TCS','HDFCBANK','ICICIBANK','INFY','BHARTIARTL','ITC','SBIN','LT','HINDUNILVR','KOTAKBANK','AXISBANK'].map((symbol, i) => ({ symbol, lastPrice: 1000 + i * 10, previousClose: 1000 + i * 10 - (i - 5) * 3 }))] });
  }
  if (url.hostname.includes('ts-api.cnbc.com')) {
    const n = url.pathname.includes('/1W/') ? 1500 : 1000; const bars = []; let v = 3000;
    for (let i = n; i > 0; i--) { v *= 1 + Math.sin(i / 7) * 0.004 + 0.0004; const d = new Date(Date.now() - i * (url.pathname.includes('/1W/') ? 7 : 1) * 86400e3); bars.push({ tradeTime: d.toISOString().slice(0, 10).replaceAll('-', '') + '000000', close: v.toFixed(2) }); }
    return json({ barData: { priceBars: bars } });
  }
  if (url.hostname.includes('cnbc.com')) {
    if (process.env.MOCK_CNBC_FAIL) return new Response('nope', { status: 503 });
    const syms = decodeURIComponent(url.searchParams.get('symbols') || '').split('|');
    return json({ FormattedQuoteResult: { FormattedQuote: syms.map((symbol, i) => ({ symbol, last: (1000 + i * 321.5).toLocaleString('en-US'), previous_day_closing: String(1000 + i * 321.5 - 5), open: '1,000', high: '9,999', low: '1', last_time_msec: Date.now() - 30000 })) } });
  }
  if (url.hostname.includes('yahoo.com') && process.env.MOCK_YAHOO_ALL_FAIL && url.pathname.includes('/v8/')) return new Response('Too Many Requests', { status: 429 });
  if (url.hostname.includes('yahoo.com') && process.env.MOCK_YAHOO_FX_FAIL && decodeURIComponent(url.pathname).endsWith('=X')) return new Response('Too Many Requests', { status: 429 });
  if (url.hostname.includes('yahoo.com')) {
    const symbol = decodeURIComponent(url.pathname.split('/').pop());
    return json(chart(symbol, url.searchParams.get('range'), url.searchParams.get('interval')));
  }
  if (url.hostname.includes('amfiindia')) return process.env.MOCK_AMFI_FAIL ? new Response('blocked', { status: 403 }) : new Response(amfi(), { status: 200 });
  if (url.hostname.includes('mfapi.in')) {
    const last = url.pathname.split('/').pop();
    if (last === 'search') return json([{ schemeCode: 100001, schemeName: 'Mock Flexi Cap Fund - Direct Plan - Growth' }, { schemeCode: 100002, schemeName: 'Mock Flexi Cap Fund - Regular Plan - Growth' }, { schemeCode: 100003, schemeName: 'Mock Flexi Cap Fund - Regular Plan - IDCW' }]);
    if (last === 'latest') { const m = mfapi('x'); return json({ meta: m.meta, data: [m.data[0]], status: 'SUCCESS' }); }
    return json(mfapi(last));
  }
  if (url.hostname.includes('faireconomy')) {
    if (url.pathname.includes('nextweek')) return new Response('{}', { status: 404 });
    return json(['USD', 'EUR', 'GBP', 'JPY'].flatMap((c, i) => ['High', 'Medium', 'Low'].map((impact, k) => ({ title: `${c} sample release ${k + 1}`, country: c, date: new Date(Date.now() + (i * 5 + k * 2) * 3600e3).toISOString(), impact, forecast: '1.2%', previous: '1.0%' }))));
  }
  if (/rss|\.xml|\.cms|feeds/.test(url.href)) return new Response(rss(url.hostname), { status: 200, headers: { 'content-type': 'application/xml' } });
  return real(input, init);
};
