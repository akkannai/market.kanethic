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
const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
const amfi = () => `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

Mock Mutual Fund

100001;INF1;-;Mock Flexi Cap Fund - Direct Plan - Growth;245.6789;${today()}
100002;INF2;-;Mock Flexi Cap Fund - Regular Plan - Growth;221.1234;${today()}
100003;INF3;-;Mock Flexi Cap Fund - Regular Plan - IDCW;45.5;${today()}
${Array.from({ length: 120 }, (_, i) => `1${String(i + 10).padStart(5, '0')};INFX;-;Mock Filler Fund ${i} - Direct Plan - Growth;${(10 + i).toFixed(4)};${today()}`).join('\n')}
`;
const mfapi = (code) => {
  const data = []; const end = Date.now();
  for (let d = 0; d < 365 * 6; d++) { const dt = new Date(end - d * 86400e3); if (dt.getUTCDay() % 6 === 0) continue; data.push({ date: `${String(dt.getUTCDate()).padStart(2, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${dt.getUTCFullYear()}`, nav: (245 * Math.pow(1.13, -d / 365) * (1 + 0.02 * Math.sin(d / 20))).toFixed(4) }); }
  return { meta: { scheme_name: 'Mock Flexi Cap Fund - Direct Plan - Growth', fund_house: 'Mock Mutual Fund', scheme_category: 'Equity Scheme - Flexi Cap Fund' }, data };
};
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname.includes('yahoo.com')) {
    const symbol = decodeURIComponent(url.pathname.split('/').pop());
    return json(chart(symbol, url.searchParams.get('range'), url.searchParams.get('interval')));
  }
  if (url.hostname.includes('amfiindia')) return new Response(amfi(), { status: 200 });
  if (url.hostname.includes('mfapi.in')) return json(mfapi(url.pathname.split('/').pop()));
  if (url.hostname.includes('faireconomy')) {
    if (url.pathname.includes('nextweek')) return new Response('{}', { status: 404 });
    return json(['USD', 'EUR', 'GBP', 'JPY'].flatMap((c, i) => ['High', 'Medium', 'Low'].map((impact, k) => ({ title: `${c} sample release ${k + 1}`, country: c, date: new Date(Date.now() + (i * 5 + k * 2) * 3600e3).toISOString(), impact, forecast: '1.2%', previous: '1.0%' }))));
  }
  if (/rss|\.xml|\.cms|feeds/.test(url.href)) return new Response(rss(url.hostname), { status: 200, headers: { 'content-type': 'application/xml' } });
  return real(input, init);
};
