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
