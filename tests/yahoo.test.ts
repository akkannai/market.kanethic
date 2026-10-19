import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChart, parseHistory } from '../lib/yahoo.ts';
import { toQuote } from '../lib/quotes.ts';
import { catalog } from '../lib/instruments.ts';

const sample = (over: object = {}, close: (number | null)[] = [100, null, 102, 103.5]) => ({
  chart: { result: [{ meta: { regularMarketPrice: 103.5, chartPreviousClose: 100, regularMarketTime: 1_700_000_000, regularMarketDayHigh: 104, regularMarketDayLow: 99, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80, ...over },
    timestamp: [1, 2, 3, 4], indicators: { quote: [{ open: [null, 99.5, 100, 102], close, high: [101, 0, 103, 104], low: [99, 0, 100, 102] }] } }], error: null },
});

test('parseChart reads meta and skips null closes', () => {
  const q = parseChart(sample());
  assert.equal(q.price, 103.5);
  assert.equal(q.prev, 100);
  assert.equal(q.open, 99.5);
  assert.equal(q.high, 104);
  assert.equal(q.time, 1_700_000_000_000);
  assert.deepEqual(q.spark, [100, 102, 103.5]);
});

test('parseChart falls back to last close and rejects bad data', () => {
  assert.equal(parseChart(sample({ regularMarketPrice: undefined })).price, 103.5);
  assert.throws(() => parseChart(sample({ regularMarketPrice: 0 }, [])), /No valid price/);
  assert.throws(() => parseChart({ chart: { result: null, error: { description: 'Not Found' } } }), /Not Found/);
  assert.throws(() => parseChart(sample({ regularMarketTime: undefined }, [null, null, null, null])), /No valid price|No timestamp/);
});

test('parseHistory returns [ms, close] pairs', () => {
  assert.deepEqual(parseHistory(sample()), [[1000, 100], [3000, 102], [4000, 103.5]]);
  assert.throws(() => parseHistory(sample({}, [null, null, null, null])), /No history/);
});

test('toQuote: change, percent, live/closed state', () => {
  const inst = catalog.find((i) => i.id === 'nifty50')!;
  const raw = parseChart(sample());
  const live = toQuote(inst, raw, 'x', raw.time + 5 * 60_000);
  assert.equal(live.state, 'live');
  assert.equal(live.change, 3.5);
  assert.ok(Math.abs((live.pct as number) - 3.5) < 1e-9);
  assert.equal(toQuote(inst, raw, 'x', raw.time + 3 * 3600_000).state, 'closed');
});

test('toQuote: yield change in bps, x10 scale repaired', () => {
  const inst = catalog.find((i) => i.id === 'us10y')!;
  const q = toQuote(inst, { price: 43.5, prev: 43, open: null, high: null, low: null, w52h: null, w52l: null, time: 1, spark: [43, 43.5] }, 'x', 1);
  assert.ok(Math.abs(q.price - 4.35) < 1e-9);
  assert.ok(Math.abs((q.change as number) - 5) < 1e-9);
  assert.equal(q.pct, null);
});

test('catalog ids are unique and symbols or derived', () => {
  assert.equal(new Set(catalog.map((i) => i.id)).size, catalog.length);
  assert.ok(catalog.every((i) => i.symbol || i.derived));
});
