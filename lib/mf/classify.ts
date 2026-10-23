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
  /** AMFI na Plan / Option column mathi (hoy to) */
  planCol: string; optCol: string;
};

/** AMFI Plan/Option column value ne apda enums ma ; khali / ajanyu hoy to scheme name par thi. */
export function resolvePlan(col: string, name: string): Plan {
  if (/direct/i.test(col)) return 'Direct';
  if (/regular/i.test(col)) return 'Regular';
  return classifyPlan(name);
}
export function resolveOption(col: string, name: string): Option {
  if (/growth/i.test(col)) return 'Growth';
  if (/idcw|dividend|payout|reinvest|income distribution/i.test(col)) return 'IDCW';
  if (/bonus/i.test(col)) return 'Bonus';
  return classifyOption(name);
}

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

type Cols = { code: number; isinA: number; isinB: number; name: number; plan: number; opt: number; nav: number; date: number };
const OLD_COLS: Cols = { code: 0, isinA: 1, isinB: 2, name: 3, plan: -1, opt: -1, nav: 4, date: 5 };

/** Header line ("Scheme Code;...;Plan;Option;Net Asset Value;Date") mathi column order shodhe -- AMFI order badle to pan chale. */
export function parseHeader(line: string): Cols | null {
  const h = line.split(';').map((x) => x.trim().toLowerCase());
  if (!h[0]?.startsWith('scheme code')) return null;
  const find = (...needles: string[]) => h.findIndex((c) => needles.some((n) => c.includes(n)));
  const cols: Cols = {
    code: 0,
    isinA: find('payout', 'isin growth'), isinB: find('reinvest'),
    name: find('scheme name'), plan: h.findIndex((c) => c === 'plan'), opt: h.findIndex((c) => c === 'option'),
    nav: find('net asset value', 'nav'), date: h.findIndex((c) => c === 'date'),
  };
  return cols.name >= 0 && cols.nav >= 0 && cols.date >= 0 ? cols : null;
}

export function parseNavAllFull(text: string): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  let cat: CategoryHeader | null = null;
  let amc = '';
  let cols = OLD_COLS;
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = parseHeader(line);
    if (head) { cols = head; continue; }
    if (!line.includes(';')) {
      const h = parseCategoryHeader(line);
      if (h) cat = h; else amc = line;
      continue;
    }
    const f = line.split(';').map((x) => x.trim());
    const nav = Number(f[cols.nav]);
    const date = amfiDate(f[cols.date] ?? '');
    if (!/^\d+$/.test(f[cols.code] ?? '') || !f[cols.name] || !Number.isFinite(nav) || nav <= 0 || !date) { skipped++; continue; } // "N.A." / bad rows
    const isin = (i: number) => (i >= 0 && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(f[i] ?? '') ? f[i] : null);
    rows.push({
      code: Number(f[cols.code]), isinA: isin(cols.isinA), isinB: isin(cols.isinB), name: f[cols.name], nav, date, amc,
      category: cat?.category ?? 'Uncategorised', categorySlug: slugify(cat?.category ?? 'Uncategorised'), main: cat?.main ?? 'Other', sub: cat?.sub ?? 'Uncategorised', schemeType: cat?.schemeType ?? 'Open Ended',
      planCol: cols.plan >= 0 ? f[cols.plan] ?? '' : '', optCol: cols.opt >= 0 ? f[cols.opt] ?? '' : '',
    });
  }
  return { rows, skipped };
}
