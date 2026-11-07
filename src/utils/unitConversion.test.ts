import { describe, it, expect } from 'vitest';
import {
  calculateUsableQuantityAndCost,
  convertUnits
} from './unitConversion';

describe('Unit Conversion Engine (Universal & Generic)', () => {
  it('converts 750 Mililitro to Onza accurately (25.36 oz and $985,80 / Onza for $25.000)', () => {
    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 750,
      purchasePrice: 25000,
      purchaseUnitId: 'Mililitro',
      usageUnitId: 'Onza'
    });

    // 750 / 29.574 = 25.359944545884898
    expect(result.usableQuantity).toBeCloseTo(25.3599, 3);
    expect(Number(result.usableQuantity.toFixed(2))).toBe(25.36);

    // Unit cost: 25000 / (750 / 29.574) = 25000 * 29.574 / 750 = 985.80 exactly
    expect(result.unitCost).toBeCloseTo(985.80, 2);
    expect(Number(result.unitCost.toFixed(2))).toBe(985.80);

    // Direct factor: 1 / 29.574 = 0.033813...
    expect(result.directFactor).toBeCloseTo(0.03381, 4);
    expect(result.isCompatible).toBe(true);
  });

  it('keeps 1:1 and factor 1 when purchase and usage units are the same (Gramo to Gramo)', () => {
    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 500,
      purchasePrice: 10000,
      purchaseUnitId: 'Gramo',
      usageUnitId: 'Gramo'
    });

    expect(result.usableQuantity).toBe(500);
    expect(result.unitCost).toBe(20);
    expect(result.directFactor).toBe(1);
    expect(result.isCompatible).toBe(true);
  });

  it('converts 1 Kilogramo to 1000 Gramo accurately', () => {
    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 1,
      purchasePrice: 15000,
      purchaseUnitId: 'Kilogramo',
      usageUnitId: 'Gramo'
    });

    expect(result.usableQuantity).toBe(1000);
    expect(result.unitCost).toBe(15);
    expect(result.directFactor).toBe(1000);
    expect(result.isCompatible).toBe(true);
  });

  it('converts 1 Libra to 500 Gramo accurately', () => {
    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 1,
      purchasePrice: 6000,
      purchaseUnitId: 'Libra',
      usageUnitId: 'Gramo'
    });

    expect(result.usableQuantity).toBe(500);
    expect(result.unitCost).toBe(12);
    expect(result.directFactor).toBe(500);
    expect(result.isCompatible).toBe(true);
  });

  it('handles Botella 750ml to Onza correctly (25.36 oz)', () => {
    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 1,
      purchasePrice: 47200,
      purchaseUnitId: 'Botella 750ml',
      usageUnitId: 'Onza'
    });

    expect(Number(result.usableQuantity.toFixed(2))).toBe(25.36);
    expect(Number(result.unitCost.toFixed(2))).toBe(1861.19);
    expect(result.isCompatible).toBe(true);
  });

  it('identifies incompatible dimensions and fallbacks safely (Gramo vs Mililitro)', () => {
    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 500,
      purchasePrice: 10000,
      purchaseUnitId: 'Gramo',
      usageUnitId: 'Mililitro'
    });

    expect(result.usableQuantity).toBe(500);
    expect(result.unitCost).toBe(20);
    expect(result.directFactor).toBe(1);
    expect(result.isCompatible).toBe(false);
  });

  it('supports custom unitsCatalog passed as array of unit objects', () => {
    const customCatalog = [
      { id: 'u-kg', name: 'Kilogramo', baseUnit: 'g', equivalenceBase: 1000 },
      { id: 'u-g', name: 'Gramo', baseUnit: 'g', equivalenceBase: 1 },
      { id: 'u-barrel', name: 'Barril 50L', baseUnit: 'ml', equivalenceBase: 50000 },
      { id: 'u-pint', name: 'Pinta 500ml', baseUnit: 'ml', equivalenceBase: 500 }
    ];

    const result = calculateUsableQuantityAndCost({
      purchaseQuantity: 2,
      purchasePrice: 200000,
      purchaseUnitId: 'u-barrel',
      usageUnitId: 'u-pint',
      unitsCatalog: customCatalog
    });

    // 2 barrels = 100,000 ml / 500 ml = 200 pints
    expect(result.usableQuantity).toBe(200);
    expect(result.unitCost).toBe(1000);
    expect(result.directFactor).toBe(100);
    expect(result.isCompatible).toBe(true);
  });

  it('convertUnits pure helper returns accurate quantity', () => {
    const usable = convertUnits(750, 'Mililitro', 'Onza');
    expect(Number(usable.toFixed(2))).toBe(25.36);
  });
});
