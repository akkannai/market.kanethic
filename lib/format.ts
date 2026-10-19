export const nf = (n: number, dp = 2) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const signed = (n: number, dp = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${nf(Math.abs(n), dp)}`;

export const pctText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;

export const istTime = (ms: number, withDate = false) =>
  new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', second: withDate ? undefined : '2-digit', hour12: true,
    ...(withDate ? { day: '2-digit', month: 'short' } : {}),
  });

export function ago(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
