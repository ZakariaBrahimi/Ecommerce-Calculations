/**
 * Meta's campaign/ad set `daily_budget` (and `lifetime_budget`) fields are
 * returned as a string in the account currency's *minor unit* (e.g. cents
 * for USD - "1000" means $10.00), while Insights fields like `spend` are
 * already in standard decimal notation ("12.34" means $12.34). Mixing the
 * two up silently under- or over-reports budgets by 100x, so this
 * conversion is centralized and applied only to budget fields.
 *
 * Not an exhaustive ISO 4217 list - covers the common zero-decimal
 * currencies; extend if a tenant's ad account uses one not listed here.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'PYG', 'UGX']);

export function minorUnitsToAmount(minorUnits: number, currency: string | null): number {
  const divisor = currency && ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
  return minorUnits / divisor;
}
