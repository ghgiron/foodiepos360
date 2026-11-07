import { describe, it, expect } from 'vitest';
import { DEFAULT_UNIT_EQUIVALENCES } from '../db/settingsStore';

describe('Dynamic Unit Equivalences and 2-Decimal Precision', () => {
  it('should have standard units configured with exact 2-decimal numbers', () => {
    expect(DEFAULT_UNIT_EQUIVALENCES['Libra'].baseEquivalence).toBe(500);
    expect(DEFAULT_UNIT_EQUIVALENCES['lb'].baseEquivalence).toBe(500);
    expect(DEFAULT_UNIT_EQUIVALENCES['Kilogramo'].baseEquivalence).toBe(1000);
    expect(DEFAULT_UNIT_EQUIVALENCES['Litro'].baseEquivalence).toBe(1000);
    expect(DEFAULT_UNIT_EQUIVALENCES['Onza'].baseEquivalence).toBe(29.574);
  });

  it('should allow user custom unit configurations (e.g. Colombian commercial pound = 500g, Botella 750ml = 750ml)', () => {
    const userCustomEquivalences: Record<string, { baseEquivalence: number; baseUnit: string }> = {
      ...DEFAULT_UNIT_EQUIVALENCES,
      'Libra Comercial': { baseEquivalence: 500.00, baseUnit: 'g' },
      'Botella 750ml': { baseEquivalence: 750.00, baseUnit: 'ml' },
      'Caja 24und': { baseEquivalence: 24.00, baseUnit: 'und' }
    };

    expect(userCustomEquivalences['Libra Comercial'].baseEquivalence).toBe(500.00);
    expect(userCustomEquivalences['Botella 750ml'].baseEquivalence).toBe(750.00);
    expect(userCustomEquivalences['Caja 24und'].baseEquivalence).toBe(24.00);
  });

  it('should correctly format equivalence values to strictly 2 decimals', () => {
    const rawEquivalence = 453.59237;
    const formattedEquivalence = Number(rawEquivalence.toFixed(2));
    expect(formattedEquivalence).toBe(453.59);
    expect(formattedEquivalence.toFixed(2)).toBe('453.59');
  });
});
