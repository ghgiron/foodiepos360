/**
 * System Settings Type Definitions & Pure Selectors
 * Centralizes configuration for taxation, costs, and operational regimes.
 */

export interface SystemSettings {
  /**
   * Flag indicating whether the restaurant regime is responsible for Impoconsumo (8% DIAN in Colombia)
   * When false, the restaurant does not charge or deduce Impoconsumo (0%).
   */
  enableImpoconsumo: boolean;

  /**
   * The nominal Impoconsumo tax rate configured (typically 8%).
   */
  impoconsumoRate: number;

  /**
   * Legacy or global tax percentage field maintained for backward compatibility.
   */
  taxPercentage?: number;

  /**
   * Legacy alias for taxPercentage.
   */
  ipoconsumo_pct?: number;

  /**
   * Operating cost percentage allocated to production (e.g. 14.95%).
   */
  operationalCostPercentage?: number;

  /**
   * Production error / safety margin percentage (e.g. 5%).
   */
  safetyMarginPercentage?: number;
  error_margin_pct?: number;

  /**
   * Minimum permitted gross margin percentage before triggering critical alerts.
   */
  min_utility_margin?: number;

  /**
   * Currency code (e.g. 'COP').
   */
  currency?: string;

  /**
   * Locale code (e.g. 'es-CO').
   */
  locale?: string;

  /**
   * Additional dynamic system setting entries.
   */
  [key: string]: any;
}

/**
 * Pure selector that computes the effective Impoconsumo rate.
 * Returns 0 if enableImpoconsumo is false.
 * Otherwise returns the configured rate (default 8%).
 *
 * Formula: settings.enableImpoconsumo ? (settings.impoconsumoRate || 8) : 0
 */
export function getEffectiveImpoconsumoRate(
  settings?: Partial<SystemSettings> | Record<string, any> | null
): number {
  if (!settings) return 8;

  // If explicitly disabled (false), return 0 immediately
  if (settings.enableImpoconsumo === false) {
    return 0;
  }

  // If enabled or undefined (default true), resolve the rate
  const rate = settings.impoconsumoRate ?? settings.taxPercentage ?? settings.ipoconsumo_pct ?? 8;
  const numRate = Number(rate);
  return isNaN(numRate) ? 8 : numRate;
}
