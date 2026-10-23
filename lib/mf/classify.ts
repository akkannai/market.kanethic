// AMFI NAVAll.txt parsing + scheme classification. Plan/Option kadi mix na thay e mate dara scheme code alag j chhe;
// aa classification fakt filters mate che.
export type Plan = 'Regular' | 'Direct';
export type Option = 'Growth' | 'IDCW' | 'Bonus' | 'Other';

export type CategoryHeader = { raw: string; schemeType: string; category: string; main: string; sub: string };

/** "Open Ended Schemes(Equity Scheme - Large Cap Fund)" -> parts */
export function parseCategoryHeader(line: string): CategoryHeader | null {
  const m = /^(Open Ended|Close Ended|Interval Fund)[^(]*\(\s*(.+?)\s*\)\s*$/i.exec(line.trim());
  if (!m) return null;
  const category = m[2];
  const i = category.indexOf(' - ');
  return {
    raw: line.trim(),
    schemeType: m[1].replace(/\b\w/g, (c) => c.toUpperCase()),
    category,
    main: i >= 0 ? category.slice(0, i).trim() : m[1],
    sub: i >= 0 ? category.slice(i + 3).trim() : category,
  };
}

export const classifyPlan = (name: string): Plan => (/\bdirect\b/i.test(name) ? 'Direct' : 'Regular');

export function classifyOption(name: string): Option {
  if (/idcw|dividend|payout|reinvest|income distribution/i.test(name)) return 'IDCW';
  if (/\bbonus\b/i.test(name)) return 'Bonus';
  if (/growth/i.test(name)) return 'Growth';
  return 'Other';
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

export type ParsedRow = {
  code: number; isinA: string | null; isinB: string | null; name: string; nav: number; date: string;
  amc: string; category: string; categorySlug: string; main: string; sub: string; schemeType: string;
};

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const validIso = (iso: string) => new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
/** 17-Oct-2025 | 17-10-2025 | 17/10/2025 | 2025-10-17 -> ISO */
export function amfiDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{1,2})[-\/ ]([A-Za-z]{3,9})[-\/ ,]+(\d{4})$/.exec(t);
  if (m) { const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (!mm) return null; const iso = `${m[3]}-${mm}-${m[1].padStart(2, '0')}`; return validIso(iso) ? iso : null; }
  m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(t);
  if (m) { const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return validIso(iso) ? iso : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m && validIso(t) ? t : null;
}

export function parseNavAllFull(text: string): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  let cat: CategoryHeader | null = null;
  let amc = '';
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line || /^Scheme Code/i.test(line)) continue;
    if (!line.includes(';')) {
      const h = parseCategoryHeader(line);
      if (h) cat = h; else amc = line;
      continue;
    }
    const f = line.split(';');
    if (f.length < 6 || !/^\d+$/.test(f[0].trim())) { skipped++; continue; }
    const nav = Number(f[4]);
    const date = amfiDate(f[5]);
    if (!Number.isFinite(nav) || nav <= 0 || !date) { skipped++; continue; } // "N.A." / bad rows
    const isin = (v: string) => (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v.trim()) ? v.trim() : null);
    rows.push({
      code: Number(f[0]), isinA: isin(f[1]), isinB: isin(f[2]), name: f[3].trim(), nav, date, amc,
      category: cat?.category ?? 'Uncategorised', categorySlug: slugify(cat?.category ?? 'Uncategorised'), main: cat?.main ?? 'Other', sub: cat?.sub ?? 'Uncategorised', schemeType: cat?.schemeType ?? 'Open Ended',
    });
  }
  return { rows, skipped };
}
