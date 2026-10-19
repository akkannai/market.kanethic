import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';

export type CalEvent = { title: string; country: string; time: number; impact: 'High' | 'Medium'; forecast: string; previous: string };

const URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

export function parseCalendar(raw: unknown): CalEvent[] {
  if (!Array.isArray(raw)) throw new Error('Unexpected calendar format');
  const out: CalEvent[] = [];
  for (const r of raw as any[]) {
    const time = Date.parse(String(r?.date));
    const impact = r?.impact;
    if (!Number.isFinite(time) || (impact !== 'High' && impact !== 'Medium') || !r?.title) continue;
    out.push({
      title: String(r.title), country: String(r.country ?? ''), time, impact,
      forecast: String(r.forecast ?? ''), previous: String(r.previous ?? ''),
    });
  }
  return out;
}

async function one(url: string, optional: boolean): Promise<CalEvent[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.UPSTREAM_TIMEOUT_MS) || 8000), cache: 'no-store', headers: { 'user-agent': 'KanethicMarketHub/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ev = parseCalendar(await res.json());
    recordOk('Economic calendar');
    return ev;
  } catch (e) {
    if (!optional) recordError('Economic calendar', e);
    if (optional) return [];
    throw e;
  }
}

export async function getCalendar() {
  const { value, at, stale } = await cached('calendar', 30 * 60_000, async () => {
    const [week, next] = await Promise.all([one(URLS[0], false), one(URLS[1], true)]);
    return [...week, ...next].sort((a, b) => a.time - b.time);
  });
  return { events: value, at, stale };
}
