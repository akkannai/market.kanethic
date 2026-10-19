import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';

export type NewsItem = { title: string; link: string; time: number; source: string; summary: string };

export const FEEDS: { name: string; url: string }[] = [
  { name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { name: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/marketreports.xml' },
  { name: 'Mint', url: 'https://www.livemint.com/rss/markets' },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { name: 'RBI', url: 'https://www.rbi.org.in/pressreleases_rss.xml' },
  { name: 'U.S. Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };

export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

const strip = (s: string) => decode(decode(s)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

export function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const b of blocks) {
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link'));
    if (!link) link = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? '';
    const date = strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const time = Date.parse(date);
    if (!title || !/^https?:\/\//i.test(link) || !Number.isFinite(time)) continue;
    const summary = strip(tag(b, 'description') || tag(b, 'summary')).slice(0, 220);
    items.push({ title, link, time, source, summary: summary === title ? '' : summary });
  }
  return items;
}

async function fetchFeed(f: { name: string; url: string }): Promise<NewsItem[]> {
  try {
    const res = await fetch(f.url, {
      headers: { 'user-agent': 'Mozilla/5.0 KanethicMarketHub/1.0', accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(Number(process.env.UPSTREAM_TIMEOUT_MS) || 8000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text(), f.name);
    if (!items.length) throw new Error('No items parsed');
    recordOk(`News: ${f.name}`);
    return items;
  } catch (e) {
    recordError(`News: ${f.name}`, e);
    return [];
  }
}

export function mergeNews(lists: NewsItem[][], now = Date.now(), max = 60): NewsItem[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((n) => n.time <= now + 3600_000 && now - n.time < 7 * 86400_000)
    .sort((a, b) => b.time - a.time)
    .filter((n) => {
      const k = n.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

export async function getNews() {
  const { value, at, stale } = await cached('news', 5 * 60_000, async () => {
    const lists = await Promise.all(FEEDS.map(fetchFeed));
    const merged = mergeNews(lists);
    if (!merged.length) throw new Error('All news feeds failed');
    return merged;
  });
  return { items: value, at, stale };
}
