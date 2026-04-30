// Shared formatters for portal UI.

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  ILS: '₪',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
};

export function fmtMoney(n: number, code = 'USD'): string {
  if (!Number.isFinite(n)) return '—';
  const sym = CURRENCY_SYMBOL[code] ?? `${code} `;
  return `${sym}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function fmtNum(n: number, locale = 'he-IL'): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(locale, { maximumFractionDigits: 1 });
}

export function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function deltaClass(d: number | null, lowerIsBetter = false): string {
  if (d === null || !Number.isFinite(d)) return 'flat';
  if (lowerIsBetter) return d < 0 ? 'up' : d > 0 ? 'down' : 'flat';
  return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
}
