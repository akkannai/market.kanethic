import { exec, q, utcNow } from './db.ts';

// Risk-free rate = 91-day Treasury bill (RBI auction cut-off yield). Real value admin ma nakhay (invented default nathi).
export type RiskFree = { pct: number | null; asOf: string | null; note: string };

async function get(key: string): Promise<string | null> {
  const [r] = await q<{ svalue: string | null }>('SELECT svalue FROM settings WHERE skey=?', [key]);
  return r?.svalue ?? null;
}
async function put(key: string, value: string) {
  await exec('INSERT INTO settings (skey, svalue, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue), updated_at=VALUES(updated_at)', [key, value, utcNow()]);
}

export async function getRiskFree(): Promise<RiskFree> {
  const raw = await get('risk_free_pct');
  const n = raw === null ? NaN : Number(raw);
  return { pct: Number.isFinite(n) ? n : null, asOf: await get('risk_free_asof'), note: (await get('risk_free_note')) ?? '91-day Treasury bill (RBI auction cut-off yield)' };
}

export function validateRiskFree(pct: unknown, asOf: unknown, note: unknown): { pct: number; asOf: string; note: string } | string {
  const n = typeof pct === 'number' ? pct : Number(String(pct ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 15) return 'Rate must be a number between 0 and 15 (percent per year).';
  const d = String(asOf ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) return 'Date must be YYYY-MM-DD.';
  if (Date.parse(`${d}T00:00:00Z`) > Date.now() + 2 * 86400_000) return 'Date cannot be in the future.';
  return { pct: Math.round(n * 1000) / 1000, asOf: d, note: String(note ?? '').trim().slice(0, 200) || '91-day Treasury bill (RBI auction cut-off yield)' };
}

export async function setRiskFree(v: { pct: number; asOf: string; note: string }) {
  await put('risk_free_pct', String(v.pct));
  await put('risk_free_asof', v.asOf);
  await put('risk_free_note', v.note);
}
