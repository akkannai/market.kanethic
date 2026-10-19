export type YearRow = { year: number; invested: number; value: number };

/** SIP: dar mahine ni shuruaat ma rokan (annuity-due), monthly rate = annual / 12. Step-up: dar 12 mahine SIP % vadhe. */
export function sipSchedule(monthly: number, annualPct: number, years: number, stepUpPct = 0): YearRow[] {
  const i = annualPct / 100 / 12;
  let value = 0, invested = 0, sip = monthly;
  const rows: YearRow[] = [];
  for (let m = 1; m <= Math.round(years * 12); m++) {
    if (m > 1 && (m - 1) % 12 === 0) sip *= 1 + stepUpPct / 100;
    value = (value + sip) * (1 + i);
    invested += sip;
    if (m % 12 === 0) rows.push({ year: m / 12, invested, value });
  }
  return rows;
}

export function lumpsumSchedule(amount: number, annualPct: number, years: number): YearRow[] {
  return Array.from({ length: Math.round(years) }, (_, k) => ({ year: k + 1, invested: amount, value: amount * (1 + annualPct / 100) ** (k + 1) }));
}

/** Target corpus mate jaruri monthly SIP (no step-up). */
export function sipForGoal(target: number, annualPct: number, years: number): number {
  const i = annualPct / 100 / 12;
  const n = Math.round(years * 12);
  if (n <= 0) return NaN;
  if (i === 0) return target / n;
  return target / ((((1 + i) ** n - 1) / i) * (1 + i));
}
