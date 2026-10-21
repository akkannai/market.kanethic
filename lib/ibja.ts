import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';

// IBJA (India Bullion & Jewellers Association) benchmark rate: Gold 999 (24K) per 10 g, Silver 999 per kg. GST vagar.
// Published AM/PM — live nathi. Aano upyog calibration tarike thay che: live parity bhav ni level IBJA sathe match karay che.
export type Ibja = { gold?: number; silver?: number };

const NUM = /\d{1,3}(?:,\d{2,3})+|\d{5,7}/g;

/** HTML mathi "Gold 999" / "Silver 999" pachhi na (chhella ek-be) 5+ digit numbers. Chhello = latest (PM) rate. */
export function parseIbja(html: string): Ibja {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const pick = (label: RegExp, min: number, max: number): number | undefined => {
    const m = label.exec(text);
    if (!m) return undefined;
    const rest = text.slice(m.index + m[0].length);
    const stop = rest.search(/(?:Gold|Silver|Platinum)\s*(?:\d|\()/i);
    const seg = stop >= 0 ? rest.slice(0, stop) : rest.slice(0, 200);
    const nums = (seg.match(NUM) ?? []).map((n) => Number(n.replace(/,/g, ''))).filter((n) => n >= min && n <= max).slice(0, 2);
    return nums.length ? nums[nums.length - 1] : undefined;
  };
  const out: Ibja = { gold: pick(/Gold\s*999(?!\d)/i, 20_000, 1_000_000), silver: pick(/Silver\s*999(?!\d)/i, 20_000, 5_000_000) };
  if (out.gold === undefined && out.silver === undefined) throw new Error('IBJA rates not found in page');
  return out;
}

export async function getIbja(): Promise<Ibja & { at: number }> {
  const { value, at } = await cached('ibja', 20 * 60_000, async () => {
    let last: unknown;
    for (const url of ['https://ibjarates.com/', 'https://www.ibjarates.com/']) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'text/html,*/*', 'accept-language': 'en-IN,en;q=0.9' }, signal: AbortSignal.timeout(Number(process.env.UPSTREAM_TIMEOUT_MS) || 8000), cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r = parseIbja(await res.text());
        recordOk('IBJA rates');
        return r;
      } catch (e) {
        last = e;
      }
    }
    recordError('IBJA rates', last);
    throw last;
  });
  return { ...value, at };
}

// Calibration: IBJA rate navo aave (badlay) tyare k = IBJA / parity(aaje) lock karvo. Pachhi live bhav = parity(live) x k,
// etle level IBJA jevo ane movement live gold / USDINR thi. (Server mid-day restart thay to k thodo (~gold na divas na move jetlo) ochho-vadhto hoi shake.)
const captured: { gold?: { rate: number; k: number }; silver?: { rate: number; k: number } } = {};
/** IBJA / parity sensible range (duty + premium): 1.00 – 1.30. Bahar hoy to parse/data khotu gani ignore. */
export const plausibleK = (k: number) => Number.isFinite(k) && k >= 1 && k <= 1.3;

export function calibrate(metal: 'gold' | 'silver', ibjaRate: number | undefined, parityNow: number): number | null {
  if (ibjaRate && parityNow > 0) {
    const c = captured[metal];
    if (!c || c.rate !== ibjaRate) {
      const k = ibjaRate / parityNow;
      if (plausibleK(k)) captured[metal] = { rate: ibjaRate, k };
    }
  }
  return captured[metal]?.k ?? null;
}
export const getCalibration = (metal: 'gold' | 'silver') => captured[metal]?.k ?? null;
export const capturedRate = (metal: 'gold' | 'silver') => captured[metal]?.rate ?? null;
export const _resetCalibration = () => { delete captured.gold; delete captured.silver; };
