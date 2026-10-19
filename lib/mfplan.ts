// Kai plan batavvi: default sirf Regular. MF_PLAN=direct ke any thi badlay.
export function mfPlan(): 'regular' | 'direct' | 'any' {
  const v = (process.env.MF_PLAN || 'regular').toLowerCase();
  return v === 'direct' || v === 'any' ? v : 'regular';
}
