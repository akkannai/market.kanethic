export type NavPoint = [number, number]; // [epoch ms (UTC), NAV]

/** mfapi.in: {meta, data:[{date:'DD-MM-YYYY', nav:'12.34'}] newest first} -> ascending points */
export function parseMfapi(json: any): { meta: { name: string; house: string; category: string }; points: NavPoint[] } {
  const rows = json?.data;
  if (!Array.isArray(rows) || !rows.length) throw new Error('No NAV history');
  const points: NavPoint[] = [];
  for (const r of rows) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(r?.date));
    const nav = Number(r?.nav);
    if (!m || !Number.isFinite(nav) || nav <= 0) continue;
    points.push([Date.UTC(+m[3], +m[2] - 1, +m[1]), nav]);
  }
  if (!points.length) throw new Error('No valid NAV rows');
  points.sort((a, b) => a[0] - b[0]);
  const meta = json.meta ?? {};
  return { meta: { name: String(meta.scheme_name ?? ''), house: String(meta.fund_house ?? ''), category: String(meta.scheme_category ?? '') }, points };
}

export function downsample(points: NavPoint[], max = 700): NavPoint[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

const DAY = 86400_000;

function atOrBefore(points: NavPoint[], target: number, tolDays = 10): NavPoint | null {
  let lo = 0, hi = points.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && target - points[ans][0] <= tolDays * DAY ? points[ans] : null;
}

export type Returns = { m1: number | null; m6: number | null; y1: number | null; y3: number | null; y5: number | null; inception: number | null; inceptionYears: number | null };

/** <1 year: absolute %; >=1 year: CAGR %. NAV ma thi j; dividend/IDCW ni asar shamil nathi. */
export function trailingReturns(points: NavPoint[]): Returns {
  const last = points[points.length - 1];
  const at = (months: number) => {
    const d = new Date(last[0]);
    d.setUTCMonth(d.getUTCMonth() - months);
    return atOrBefore(points, d.getTime());
  };
  const abs = (p: NavPoint | null) => (p ? (last[1] / p[1] - 1) * 100 : null);
  const cagr = (p: NavPoint | null, years: number) => (p ? ((last[1] / p[1]) ** (1 / years) - 1) * 100 : null);
  const first = points[0];
  const inceptionYears = (last[0] - first[0]) / (365.25 * DAY);
  return {
    m1: abs(at(1)), m6: abs(at(6)), y1: cagr(at(12), 1), y3: cagr(at(36), 3), y5: cagr(at(60), 5),
    inception: inceptionYears >= 1 ? cagr(first, inceptionYears) : null,
    inceptionYears: inceptionYears >= 1 ? inceptionYears : null,
  };
}
