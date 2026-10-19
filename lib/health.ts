// Dara feed nu last success / error yaad rakhe. /sources ane /api/health ma dekhay che.
type Rec = { lastOk?: number; lastError?: string; lastErrorAt?: number; ok: number; fail: number };
const sources = new Map<string, Rec>();
const rec = (name: string) => {
  let r = sources.get(name);
  if (!r) sources.set(name, (r = { ok: 0, fail: 0 }));
  return r;
};
export function recordOk(name: string) {
  const r = rec(name);
  r.lastOk = Date.now();
  r.ok++;
}
export function recordError(name: string, e: unknown) {
  const r = rec(name);
  r.lastError = e instanceof Error ? e.message : String(e);
  r.lastErrorAt = Date.now();
  r.fail++;
}
export const healthSnapshot = () => Object.fromEntries(sources);
