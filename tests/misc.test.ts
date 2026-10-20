import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldInrPer10g, silverInrPerKg } from '../lib/bullion.ts';
import { decode, mergeNews, parseFeed } from '../lib/rss.ts';
import { parseCalendar } from '../lib/calendar.ts';
import { rank } from '../lib/movers.ts';
import { cached, pool } from '../lib/cache.ts';
import { nf, pctText, signed } from '../lib/format.ts';

test('bullion conversion', () => {
  // 3110.34768 USD/oz at 1 INR/USD => 100 INR per gram => 1000 INR per 10 g
  assert.ok(Math.abs(goldInrPer10g(3110.34768, 1, 0) - 1000) < 1e-6);
  assert.ok(Math.abs(goldInrPer10g(3110.34768, 1, 6) - 1060) < 1e-6);
  assert.ok(Math.abs(silverInrPerKg(31.1034768, 1, 0) - 1000) < 1e-6);
});

test('rss parse: CDATA, entities, atom, invalid items skipped', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Sensex &amp; Nifty rally]]></title><link>https://a.example/1</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><description>&lt;p&gt;Body &amp;amp; more&lt;/p&gt;</description></item>
    <item><title>No link</title><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
    <item><title>JS link</title><link>javascript:alert(1)</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
    <item><title>Bad date</title><link>https://a.example/2</link><pubDate>garbage</pubDate></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'T');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Sensex & Nifty rally');
  assert.equal(items[0].summary, 'Body & more');
  const atom = `<feed><entry><title>Fed statement</title><link href="https://f.example/x"/><updated>2024-01-02T10:00:00Z</updated><summary>S</summary></entry></feed>`;
  assert.equal(parseFeed(atom, 'F')[0].link, 'https://f.example/x');
  assert.equal(decode('&#8377;5 &#x20B9;'), '₹5 ₹');
});

test('mergeNews dedupes, drops old/future, sorts newest first', () => {
  const now = Date.parse('2024-01-10T00:00:00Z');
  const mk = (title: string, t: string) => ({ title, link: 'https://x/' + title, time: Date.parse(t), source: 's', summary: '' });
  const out = mergeNews([[mk('A', '2024-01-09T10:00:00Z'), mk('a!', '2024-01-09T11:00:00Z'), mk('Old', '2023-12-01T00:00:00Z'), mk('Future', '2024-02-01T00:00:00Z'), mk('B', '2024-01-09T12:00:00Z')]], now);
  assert.deepEqual(out.map((n) => n.title), ['B', 'a!']);
});

test('calendar keeps only high/medium with valid dates', () => {
  const ev = parseCalendar([
    { title: 'CPI', country: 'USD', date: '2024-01-10T13:30:00-05:00', impact: 'High', forecast: '3%', previous: '3.1%' },
    { title: 'Low', country: 'USD', date: '2024-01-10T13:30:00-05:00', impact: 'Low' },
    { title: 'Bad', country: 'EUR', date: 'x', impact: 'High' },
  ]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].time, Date.parse('2024-01-10T18:30:00Z'));
  assert.throws(() => parseCalendar({}), /format/);
});

test('movers ranking', () => {
  const m = (s: string, pct: number) => ({ symbol: s, name: s, price: 1, change: pct, pct, time: 1 });
  const r = rank([m('a', 2), m('b', -3), m('c', 0), m('d', 1), m('e', -1)], 2);
  assert.deepEqual(r.gainers.map((x) => x.symbol), ['a', 'd']);
  assert.deepEqual(r.losers.map((x) => x.symbol), ['b', 'e']);
});

test('cache: ttl, dedupe in-flight, stale on error', async () => {
  let calls = 0;
  const load = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return calls; };
  const [a, b] = await Promise.all([cached('k1', 1000, load), cached('k1', 1000, load)]);
  assert.equal(calls, 1);
  assert.equal(a.value, b.value);
  await cached('k1', 1000, load);
  assert.equal(calls, 1);
  const stale = await cached('k1', 0, async () => { throw new Error('down'); });
  assert.equal(stale.stale, true);
  assert.equal(stale.value, 1);
  await assert.rejects(cached('never', 0, async () => { throw new Error('down'); }));
});

test('pool swallows failures and keeps order', async () => {
  const out = await pool([1, 2, 3, 4], 2, async (n) => { if (n === 3) throw new Error('x'); return n * 2; });
  assert.deepEqual(out, [2, 4, undefined, 8]);
});

test('format helpers', () => {
  assert.equal(nf(1234567.891, 2), '12,34,567.89');
  assert.equal(signed(-1.5), '−1.50');
  assert.equal(pctText(0.456), '+0.46%');
});

import { parseFrankfurter, pairFromSeries } from '../lib/ecb.ts';
test('ECB fallback: cross rates, AED peg, prev day', () => {
  const day = (inr: number, eur: number) => ({ INR: inr, EUR: eur, GBP: 0.75, CAD: 1.4, AUD: 1.5, SGD: 1.3, JPY: 150 });
  const s = parseFrankfurter({ rates: { '2025-10-16': day(88, 0.8), '2025-10-17': day(90, 0.8), '2025-10-15': { INR: null } } });
  assert.deepEqual(s.dates, ['2025-10-16', '2025-10-17']);
  const usdinr = pairFromSeries(s, 'USD', 'INR')!;
  assert.equal(usdinr.price, 90); assert.equal(usdinr.prev, 88);
  assert.ok(Math.abs(pairFromSeries(s, 'EUR', 'INR')!.price - 112.5) < 1e-9);
  assert.ok(Math.abs(pairFromSeries(s, 'AED', 'INR')!.price - 90 / 3.6725) < 1e-9);
  assert.throws(() => parseFrankfurter({ rates: {} }));
});

import { parseStooqCsv } from '../lib/stooq.ts';
test('Stooq csv parse', () => {
  const q = parseStooqCsv('Date,Open,High,Low,Close,Volume\n2025-10-15,1,2,0.5,100,5\n2025-10-16,100,111,99,110,6\n2025-10-17,110,125,109,121,7\n');
  assert.equal(q.price, 121); assert.equal(q.prev, 110); assert.equal(q.high, 125); assert.deepEqual(q.spark, [100, 110, 121]);
  assert.throws(() => parseStooqCsv('No data'), /No data/);
  assert.throws(() => parseStooqCsv('Date,Open,High,Low,Close,Volume\n2025-10-15,1,2,0.5,100,5\n'), /Not enough/);
});

import { nseTime, parseCnbc, parseNseAllIndices, parseNseStocks, parseYahooQuotes } from '../lib/providers.ts';
test('NSE allIndices parse + IST timestamp', () => {
  assert.equal(nseTime('20-Oct-2026 15:30:00'), Date.parse('2026-10-20T10:00:00Z'));
  assert.equal(nseTime('garbage'), null);
  const b = parseNseAllIndices({ timestamp: '20-Oct-2026 15:30:00', data: [
    { index: 'NIFTY 50', last: 24593.7, previousClose: 24500, open: 24520, high: 24600, low: 24480, yearHigh: 26000, yearLow: 21000 },
    { index: 'INDIA VIX', last: 12.4, previousClose: 12.9 },
    { index: 'NIFTY BANK', last: 'bad' },
  ] });
  assert.equal(b.get('nifty50')!.price, 24593.7); assert.equal(b.get('nifty50')!.prev, 24500); assert.equal(b.get('nifty50')!.w52h, 26000);
  assert.equal(b.get('vix')!.price, 12.4); assert.equal(b.has('banknifty'), false);
  assert.throws(() => parseNseAllIndices({ data: [] }));
  assert.throws(() => parseNseAllIndices({ timestamp: '20-Oct-2026 15:30:00', data: [{ index: 'OTHER', last: 1 }] }), /No NSE/);
});
test('NSE stocks parse skips index row', () => {
  const r = parseNseStocks({ timestamp: '20-Oct-2026 15:30:00', data: [{ symbol: 'NIFTY 50', priority: 1, lastPrice: 24000 }, { symbol: 'TCS', lastPrice: '3,500.5', previousClose: 3400 }, { symbol: 'X', lastPrice: 5 }] });
  assert.equal(r.length, 1); assert.equal(r[0].symbol, 'TCS'); assert.equal(r[0].price, 3500.5);
});
test('CNBC parse: commas, symbol identity, timestamp required', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const b = parseCnbc({ FormattedQuoteResult: { FormattedQuote: [
    { symbol: '.SPX', last: '6,370.50', previous_day_closing: '6,333.30', open: '6,340', high: '6,380', low: '6,330', last_time_msec: now - 60000 },
    { symbol: '.DJI', last: '45,000', last_time: 'not a date' },
    { symbol: 'OTHER', last: '1', last_time_msec: now },
  ] } }, now);
  assert.equal(b.get('sp500')!.price, 6370.5); assert.equal(b.get('sp500')!.prev, 6333.3);
  assert.equal(b.has('dow'), false); assert.equal(b.size, 1);
  assert.throws(() => parseCnbc({}, now));
});
test('Yahoo v7 batch parse maps by symbol', () => {
  const b = parseYahooQuotes({ quoteResponse: { result: [{ symbol: '^GSPC', regularMarketPrice: 6370.5, regularMarketPreviousClose: 6333.3, regularMarketTime: 1_800_000_000, fiftyTwoWeekHigh: 7000 }, { symbol: '^NSEI', regularMarketPrice: 0, regularMarketTime: 1 }] } });
  assert.equal(b.get('sp500')!.price, 6370.5); assert.equal(b.get('sp500')!.time, 1_800_000_000_000); assert.equal(b.has('nifty50'), false);
  assert.throws(() => parseYahooQuotes({ finance: { error: { description: 'Unauthorized' } } }), /Unauthorized/);
});

import { crossCheck } from '../lib/quotes.ts';
test('crossCheck: agree, differ, ignore stale/incomparable, single', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  const p = { price: 100, time: now - 60_000 };
  const a = crossCheck(p, [{ source: 'B', price: 100.2, time: now - 120_000 }], 0.4, now);
  assert.equal(a.agree, 'ok'); assert.ok(Math.abs(a.diffPct! - 0.2) < 1e-9);
  assert.equal(crossCheck(p, [{ source: 'B', price: 102, time: now - 120_000 }], 0.4, now).agree, 'diff');
  assert.equal(crossCheck(p, [{ source: 'B', price: 150, time: now - 3 * 3600_000 }], 0.4, now).agree, 'single'); // old quote ignored
  assert.equal(crossCheck(p, [{ source: 'ECB', price: 100.5, time: now - 20 * 3600_000, ref: true }], 1, now).agree, 'ok'); // daily reference
  assert.equal(crossCheck(p, [], 0.4, now).agree, 'single');
});

import { nseDay, parseCnbcBars, parseFxHistory, parseNseHistory } from '../lib/history.ts';
test('history parsers: CNBC bars, NSE records, ECB pair series', () => {
  const bars = parseCnbcBars({ barData: { priceBars: [{ tradeTime: '20250102000000', close: '5,000.5' }, { tradeTime: '20250101000000', close: '4900' }, { tradeTime: 'bad', close: '1' }] } });
  assert.equal(bars.length, 2); assert.equal(bars[0][1], 4900); assert.equal(bars[1][1], 5000.5); assert.equal(bars[0][0], Date.UTC(2025, 0, 1));
  assert.throws(() => parseCnbcBars({}));
  assert.equal(nseDay('20-OCT-2026'), Date.UTC(2026, 9, 20)); assert.equal(nseDay('05-03-2024'), Date.UTC(2024, 2, 5)); assert.equal(nseDay('x'), null);
  const n = parseNseHistory({ data: { indexCloseOnlineRecords: [{ EOD_TIMESTAMP: '02-JAN-2024', EOD_CLOSE_INDEX_VAL: '21,741.9' }, { EOD_TIMESTAMP: '01-JAN-2024', EOD_CLOSE_INDEX_VAL: 21731 }] } });
  assert.deepEqual(n.map((p) => p[1]), [21731, 21741.9]);
  const fx = parseFxHistory({ rates: { '2024-01-02': { INR: 83, EUR: 0.9 }, '2024-01-03': { INR: 84, EUR: 0.9 }, '2024-01-04': { EUR: 0.9 } } }, 'EUR', 'INR');
  assert.equal(fx.length, 2); assert.ok(Math.abs(fx[0][1] - 83 / 0.9) < 1e-9);
  const aed = parseFxHistory({ rates: { '2024-01-02': { INR: 83 }, '2024-01-03': { INR: 84 } } }, 'AED', 'INR');
  assert.ok(Math.abs(aed[1][1] - 84 / 3.6725) < 1e-9);
});
