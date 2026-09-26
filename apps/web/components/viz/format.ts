/**
 * How a chart formats its values. A plain descriptor rather than a function, because the chart
 * components run on the client and a server page cannot pass them a function.
 *   number   - 1,234
 *   compact  - 1.2K
 *   percent  - the value is already a percentage: 42 -> 42%
 *   ratio    - the value is a 0..1 ratio: 0.42 -> 42%
 *   currency - an amount in an ISO-4217 currency
 */
export type VizValueFormat = 'number' | 'compact' | 'percent' | 'ratio' | { currency: string };

export function formatVizValue(value: number, format: VizValueFormat = 'number', locale = 'en'): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (format === 'percent') {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
  }
  if (format === 'ratio') {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
  }
  if (format === 'compact') {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  if (typeof format === 'object') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: format.currency, maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
