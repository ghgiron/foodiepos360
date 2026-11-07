import { describe, it, expect } from 'vitest';
import {
  formatDecimals,
  formatCurrency,
  formatUnitCost,
  formatPercentage,
  formatFactor
} from './formatters';

describe('Global 2-Decimal Formatter Utility', () => {
  it('should format numbers with exactly 2 decimals', () => {
    // In es-CO, comma is the decimal separator
    const formatted = formatDecimals(4.4092);
    expect(formatted).toBe('4,41');

    const formattedWhole = formatDecimals(100);
    expect(formattedWhole).toBe('100,00');
  });

  it('should format nullish and empty values gracefully to 0,00', () => {
    expect(formatDecimals(null)).toBe('0,00');
    expect(formatDecimals(undefined)).toBe('0,00');
    expect(formatDecimals('')).toBe('0,00');
  });

  it('should format currency with $ and 2 decimals', () => {
    expect(formatCurrency(4.4092)).toBe('$4,41');
    expect(formatCurrency(15000)).toBe('$15.000,00');
    expect(formatCurrency(0)).toBe('$0,00');
  });

  it('should format unit rate cost with / unit', () => {
    expect(formatUnitCost(4.4092, 'g')).toBe('$4,41 / g');
    expect(formatUnitCost(1500, 'ml')).toBe('$1.500,00 / ml');
    expect(formatUnitCost(250, 'und')).toBe('$250,00 / und');
  });

  it('should format percentage with % sign and 2 decimals', () => {
    expect(formatPercentage(15.5)).toBe('15,50%');
    expect(formatPercentage(100)).toBe('100,00%');
    expect(formatPercentage(0)).toBe('0,00%');
  });

  it('should format factor with 2 decimals', () => {
    expect(formatFactor(1.0543)).toBe('1,05');
    expect(formatFactor(1)).toBe('1,00');
  });
});
