// Aa ek j file thi instruments add / remove thay che.
// Navo instrument: ek line umero (symbol = Yahoo Finance symbol). Kadhva: line delete karo.
export type Group = 'india' | 'global' | 'fx' | 'commodity' | 'rates';

export type Instrument = {
  id: string;
  name: string;
  group: Group;
  region: string;
  currency: string;
  unit: string;
  kind: string;
  /** Yahoo Finance symbol. Derived instrument ma hoy nahi. */
  symbol?: string;
  /** Display decimals */
  dp: number;
  /** Yield: change basis points ma batavay che */
  yield?: boolean;
  derived?: 'gold-in' | 'silver-in' | 'gold-in-gst' | 'silver-in-gst';
  /** Ticker strip ma batavvu */
  hot?: boolean;
  note?: string;
};

const idx = (
  id: string, name: string, symbol: string, group: Group, region: string, currency: string, hot = false,
): Instrument => ({ id, name, symbol, group, region, currency, unit: 'points', kind: 'Index', dp: 2, hot });

const fx = (base: string, quote: string, hot = false): Instrument => ({
  id: `${base}${quote}`.toLowerCase(),
  name: `${base}/${quote}`,
  symbol: `${base}${quote}=X`,
  group: 'fx',
  region: 'Currency',
  currency: quote,
  unit: `${quote} per ${base}`,
  kind: 'Currency pair',
  dp: quote === 'JPY' || quote === 'INR' ? (base === 'JPY' ? 4 : 2) : 4,
  hot,
});

export const catalog: Instrument[] = [
  // ---- India
  idx('sensex', 'S&P BSE Sensex', '^BSESN', 'india', 'India', 'INR', true),
  idx('nifty50', 'Nifty 50', '^NSEI', 'india', 'India', 'INR', true),
  idx('banknifty', 'Nifty Bank', '^NSEBANK', 'india', 'India', 'INR', true),
  idx('midcap100', 'Nifty Midcap 100', 'NIFTY_MIDCAP_100.NS', 'india', 'India', 'INR'),
  idx('smallcap100', 'Nifty Smallcap 100', '^CNXSC', 'india', 'India', 'INR'),
  { ...idx('vix', 'India VIX', '^INDIAVIX', 'india', 'India', 'INR'), kind: 'Volatility index' },
  idx('it', 'Nifty IT', '^CNXIT', 'india', 'India', 'INR'),
  idx('auto', 'Nifty Auto', '^CNXAUTO', 'india', 'India', 'INR'),
  idx('pharma', 'Nifty Pharma', '^CNXPHARMA', 'india', 'India', 'INR'),
  idx('financial', 'Nifty Financial Services', 'NIFTY_FIN_SERVICE.NS', 'india', 'India', 'INR'),
  idx('fmcg', 'Nifty FMCG', '^CNXFMCG', 'india', 'India', 'INR'),
  idx('metal', 'Nifty Metal', '^CNXMETAL', 'india', 'India', 'INR'),
  idx('realty', 'Nifty Realty', '^CNXREALTY', 'india', 'India', 'INR'),
  idx('energy', 'Nifty Energy', '^CNXENERGY', 'india', 'India', 'INR'),
  idx('psubank', 'Nifty PSU Bank', '^CNXPSUBANK', 'india', 'India', 'INR'),

  // ---- Global
  idx('sp500', 'S&P 500', '^GSPC', 'global', 'United States', 'USD', true),
  idx('nasdaq', 'Nasdaq Composite', '^IXIC', 'global', 'United States', 'USD', true),
  idx('dow', 'Dow Jones', '^DJI', 'global', 'United States', 'USD'),
  idx('ftse', 'FTSE 100', '^FTSE', 'global', 'United Kingdom', 'GBP'),
  idx('dax', 'DAX', '^GDAXI', 'global', 'Germany', 'EUR'),
  idx('cac', 'CAC 40', '^FCHI', 'global', 'France', 'EUR'),
  idx('nikkei', 'Nikkei 225', '^N225', 'global', 'Japan', 'JPY'),
  idx('hangseng', 'Hang Seng', '^HSI', 'global', 'Hong Kong', 'HKD'),
  idx('shanghai', 'Shanghai Composite', '000001.SS', 'global', 'China', 'CNY'),
  idx('kospi', 'KOSPI', '^KS11', 'global', 'South Korea', 'KRW'),
  idx('sti', 'Straits Times', '^STI', 'global', 'Singapore', 'SGD'),
  idx('asx', 'S&P/ASX 200', '^AXJO', 'global', 'Australia', 'AUD'),

  // ---- Currencies
  fx('USD', 'INR', true), fx('EUR', 'INR'), fx('GBP', 'INR'), fx('AED', 'INR'),
  fx('CAD', 'INR'), fx('AUD', 'INR'), fx('SGD', 'INR'), fx('JPY', 'INR'),
  fx('EUR', 'USD'), fx('GBP', 'USD'), fx('USD', 'JPY'),

  // ---- Commodities
  {
    id: 'gold-in', name: 'Gold 999 (India, indicative)', group: 'commodity', region: 'India', currency: 'INR',
    unit: '₹ / 10 g', kind: 'Derived', dp: 0, derived: 'gold-in', hot: true,
    note: 'International spot gold x USD/INR / 31.1035 x 10 g + import duty (INDIA_BULLION_PREMIUM_PCT). GST (3%), making charges ane local dealer premium shamil nathi, etle jeweller / MCX / IBJA bhav thi alag hoi shake. Matching mate MCX ke IBJA bhav sathe sarkhavo.',
  },
  {
    id: 'gold-in-gst', name: 'Gold 999 incl. GST (India, approx)', group: 'commodity', region: 'India', currency: 'INR',
    unit: '₹ / 10 g', kind: 'Derived', dp: 0, derived: 'gold-in-gst',
    note: 'Upar na Gold 999 bhav + 3% GST (INDIA_GST_PCT). Making charges ane local premium haju shamil nathi. Retail / jeweller bhav sathe sarkhavo.',
  },
  {
    id: 'silver-in', name: 'Silver 999 (India, indicative)', group: 'commodity', region: 'India', currency: 'INR',
    unit: '₹ / kg', kind: 'Derived', dp: 0, derived: 'silver-in',
    note: 'International silver x USD/INR + import duty premium. GST shamil nathi. Local bhav thi alag hoi shake.',
  },
  {
    id: 'silver-in-gst', name: 'Silver 999 incl. GST (India, approx)', group: 'commodity', region: 'India', currency: 'INR',
    unit: '₹ / kg', kind: 'Derived', dp: 0, derived: 'silver-in-gst',
    note: 'Upar na Silver 999 bhav + 3% GST (INDIA_GST_PCT). Local premium shamil nathi.',
  },
  { id: 'goldspot', name: 'Gold (spot)', symbol: 'XAUUSD=X', group: 'commodity', region: 'Global', currency: 'USD', unit: 'USD / troy oz', kind: 'Spot', dp: 2 },
  { id: 'silverspot', name: 'Silver (spot)', symbol: 'XAGUSD=X', group: 'commodity', region: 'Global', currency: 'USD', unit: 'USD / troy oz', kind: 'Spot', dp: 3 },
  { id: 'gold', name: 'Gold (COMEX futures)', symbol: 'GC=F', group: 'commodity', region: 'Global', currency: 'USD', unit: 'USD / troy oz', kind: 'Futures', dp: 2, hot: true },
  { id: 'silver', name: 'Silver (COMEX futures)', symbol: 'SI=F', group: 'commodity', region: 'Global', currency: 'USD', unit: 'USD / troy oz', kind: 'Futures', dp: 3 },
  { id: 'brent', name: 'Brent crude (front month)', symbol: 'BZ=F', group: 'commodity', region: 'Global', currency: 'USD', unit: 'USD / barrel', kind: 'Futures', dp: 2, hot: true },
  { id: 'wti', name: 'WTI crude (front month)', symbol: 'CL=F', group: 'commodity', region: 'United States', currency: 'USD', unit: 'USD / barrel', kind: 'Futures', dp: 2 },
  { id: 'natgas', name: 'Natural gas (Henry Hub)', symbol: 'NG=F', group: 'commodity', region: 'United States', currency: 'USD', unit: 'USD / MMBtu', kind: 'Futures', dp: 3 },
  { id: 'copper', name: 'Copper (COMEX)', symbol: 'HG=F', group: 'commodity', region: 'United States', currency: 'USD', unit: 'USD / lb', kind: 'Futures', dp: 4 },

  // ---- Rates / dollar
  { id: 'us10y', name: 'U.S. 10Y Treasury yield', symbol: '^TNX', group: 'rates', region: 'United States', currency: 'USD', unit: '%', kind: 'Yield', dp: 3, yield: true },
  { id: 'dxy', name: 'U.S. Dollar Index', symbol: 'DX-Y.NYB', group: 'rates', region: 'United States', currency: 'USD', unit: 'index points', kind: 'Index', dp: 3 },
];

export const byId = new Map(catalog.map((i) => [i.id, i]));
export const ofGroup = (g: Group) => catalog.filter((i) => i.group === g);

export const sections: { slug: string; label: string; nav?: boolean }[] = [
  { slug: 'overview', label: 'Overview' },
  { slug: 'india', label: 'India' },
  { slug: 'global', label: 'Global' },
  { slug: 'currencies', label: 'Currencies' },
  { slug: 'commodities', label: 'Commodities' },
  { slug: 'mutual-funds', label: 'Mutual Funds' },
  { slug: 'calculators', label: 'Calculators' },
  { slug: 'news', label: 'News' },
  { slug: 'calendar', label: 'Calendar' },
  { slug: 'watchlist', label: 'Watchlist & Alerts' },
  { slug: 'sources', label: 'Sources', nav: false },
];

/** Converter ma vaparati currencies: code -> INR rate no instrument id */
export const converterCurrencies: Record<string, string | null> = {
  INR: null, USD: 'usdinr', EUR: 'eurinr', GBP: 'gbpinr', AED: 'aedinr',
  CAD: 'cadinr', AUD: 'audinr', SGD: 'sgdinr', JPY: 'jpyinr',
};
