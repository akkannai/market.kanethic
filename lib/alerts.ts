export type Cond = 'above' | 'below' | 'pct_up' | 'pct_down';
export type Alert = { id: string; inst: string; cond: Cond; value: number; created: number; triggeredAt?: number; triggeredPrice?: number };

/** Condition sachi chhe? above/below = bhav; pct_up/down = aaj nu % change (|value| thi vadhu). */
export function isTriggered(a: Pick<Alert, 'cond' | 'value'>, price: number, pct: number | null): boolean {
  switch (a.cond) {
    case 'above': return price >= a.value;
    case 'below': return price <= a.value;
    case 'pct_up': return pct !== null && pct >= a.value;
    case 'pct_down': return pct !== null && pct <= -a.value;
  }
}

export function validAlert(a: any): a is Alert {
  return a && typeof a.id === 'string' && typeof a.inst === 'string' && ['above', 'below', 'pct_up', 'pct_down'].includes(a.cond) && Number.isFinite(a.value) && Number.isFinite(a.created);
}
