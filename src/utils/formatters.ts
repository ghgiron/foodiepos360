/**
 * Global Number, Currency, and Percentage Formatter Utility
 * Enforces standard 2-decimal display rule across Foodie POS 360 (es-CO locale)
 */

export interface NumberFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
}

const DEFAULT_LOCALE = 'es-CO';

/**
 * Formats any number, numeric string, or nullish value with standard 2 decimal places.
 * Example: 4.4092 -> "4,41", 100 -> "100,00"
 */
export function formatDecimals(
  value: number | string | null | undefined,
  digits: number = 2,
  options?: NumberFormatOptions
): string {
  if (value === null || value === undefined || value === '') {
    return (0).toLocaleString(DEFAULT_LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      ...options
    });
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) {
    return (0).toLocaleString(DEFAULT_LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      ...options
    });
  }
  return num.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...options
  });
}

/**
 * Formats a currency value with $ sign and exactly 2 decimal places.
 * Example: 4.4092 -> "$4,41", 15000 -> "$15.000,00"
 */
export function formatCurrency(
  value: number | string | null | undefined,
  digits: number = 2
): string {
  return `$${formatDecimals(value, digits)}`;
}

/**
 * Formats a currency value with Intl.NumberFormat and currency code suffix (e.g. "$ 25.900 COP")
 */
export function formatCurrencyWithCode(
  value: number | string | null | undefined,
  digits: number = 0,
  currency: string = 'COP',
  locale: string = 'es-CO'
): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '';
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }).format(num);
    return `${formatted} ${currency}`;
  } catch {
    return `$ ${formatDecimals(num, digits)} ${currency}`;
  }
}

/**
 * Formats unit rate cost: Example: "$4,41 / g"
 */
export function formatUnitCost(
  value: number | string | null | undefined,
  unit: string = 'und',
  digits: number = 2
): string {
  return `${formatCurrency(value, digits)} / ${unit}`;
}

/**
 * Formats percentage with 2 decimal places: Example: 15.5 -> "15,50%"
 */
export function formatPercentage(
  value: number | string | null | undefined,
  digits: number = 2
): string {
  return `${formatDecimals(value, digits)}%`;
}

/**
 * Formats quantity, multiplier or correction factor with 2 decimal places: Example: 1.0543 -> "1,05"
 */
export function formatFactor(
  value: number | string | null | undefined,
  digits: number = 2
): string {
  return formatDecimals(value, digits);
}
