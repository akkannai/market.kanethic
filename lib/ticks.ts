import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Site pote dar minute bhav collect kare (server chalu hoy tyare). Yahoo intraday chart na male tyare 1D chart aa thi bane.
type Tick = [number, number]; // [epoch ms, price]
const KEEP_MS = 26 * 3600_000;
const MAX = 1600;
const store = new Map<string, Tick[]>();
let loaded = false, lastSave = 0;
const dir = () => process.env.DATA_DIR || join(process.cwd(), '.data');
const file = () => join(dir(), 'ticks.json');

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(file())) {
      const j = JSON.parse(readFileSync(file(), 'utf8'));
      for (const [id, arr] of Object.entries(j as Record<string, Tick[]>)) if (Array.isArray(arr)) store.set(id, arr.filter((t) => Array.isArray(t) && t.length === 2));
    }
  } catch { /* file kharab hoy to ignore */ }
}

function save() {
  try {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(file(), JSON.stringify(Object.fromEntries(store)));
  } catch { /* writable disk na hoy to memory ma j */ }
}

/** quote.time != price change hoy tyare j navo point (market band hoy tyare duplicate na bhare). */
export function recordTicks(quotes: Record<string, { price: number; time: number }>, now = Date.now()) {
  load();
  for (const [id, q] of Object.entries(quotes)) {
    if (!(q.price > 0) || now - q.time > 6 * 3600_000) continue; // bazar band / junu data
    const arr = store.get(id) ?? [];
    const last = arr[arr.length - 1];
    if (last && last[0] === q.time) continue;
    arr.push([q.time, q.price]);
    const cut = now - KEEP_MS;
    while (arr.length && (arr[0][0] < cut || arr.length > MAX)) arr.shift();
    store.set(id, arr);
  }
  if (now - lastSave > 5 * 60_000) { lastSave = now; save(); }
}

export function getTicks(id: string, now = Date.now()): Tick[] {
  load();
  // Chhello trading session: chhella tick thi 14 kalak pachhal sudhi (raat/weekend par pan chalu rahe)
  const arr = store.get(id) ?? [];
  if (!arr.length) return [];
  const last = arr[arr.length - 1][0];
  return arr.filter((t) => t[0] >= last - 14 * 3600_000 && t[0] <= now + 60_000);
}
