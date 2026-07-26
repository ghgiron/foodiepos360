/**
 * Utility functions for financial and recipe cost analysis.
 */

export type ProfitabilityLevel = 'Alta' | 'Media' | 'Baja' | 'N/A' | 'Sin Venta';

/**
 * Calculates the gross margin percentage.
 * Formula: ((NetPrice - CostPrice) / NetPrice) * 100
 * where NetPrice = sellPrice / (1 + taxPercentage / 100)
 */
export function calculateGrossMargin(
  sellPrice: number,
  costPrice: number,
  taxPercentage: number
): number {
  if (sellPrice <= 0) return 0;
  const netPrice = sellPrice / (1 + taxPercentage / 100);
  if (netPrice <= 0) return 0;
  return ((netPrice - costPrice) / netPrice) * 100;
}

/**
 * Classifies the profitability level of an item based on its gross margin
 * and dynamic configuration thresholds.
 */
export function classifyProfitability(
  margin: number,
  thresholdHigh: number,
  thresholdMedium: number,
  isSubRecipe: boolean,
  sellPrice: number
): ProfitabilityLevel {
  if (isSubRecipe) return 'N/A';
  if (sellPrice <= 0) return 'Sin Venta';

  if (margin >= thresholdHigh) {
    return 'Alta';
  }
  if (margin >= thresholdMedium) {
    return 'Media';
  }
  return 'Baja';
}
