import { describe, it, expect } from 'vitest';
import {
  parseUnitBaseInfo,
  getDynamicUnitEquivalence,
  calculateCostMetrics,
  calculateRecipeItemUnitCost
} from './costEngine';
import { DEFAULT_UNIT_EQUIVALENCES } from '../db/settingsStore';

describe('Cost Engine & Generalized Unit Conversion', () => {
  describe('1. Parsing unit base info', () => {
    it('should identify volume units and extract embedded numbers', () => {
      expect(parseUnitBaseInfo('Botella 750ml')).toEqual({ baseValue: 750, baseType: 'ml' });
      expect(parseUnitBaseInfo('Botella (750ml)')).toEqual({ baseValue: 750, baseType: 'ml' });
      expect(parseUnitBaseInfo('Botella 700ml')).toEqual({ baseValue: 700, baseType: 'ml' });
      expect(parseUnitBaseInfo('Lata 355ml')).toEqual({ baseValue: 355, baseType: 'ml' });
      expect(parseUnitBaseInfo('Litro')).toEqual({ baseValue: 1000, baseType: 'ml' });
      expect(parseUnitBaseInfo('Mililitro')).toEqual({ baseValue: 1, baseType: 'ml' });
      expect(parseUnitBaseInfo('Onza')).toEqual({ baseValue: 29.574, baseType: 'ml' });
      expect(parseUnitBaseInfo('oz')).toEqual({ baseValue: 29.574, baseType: 'ml' });
    });

    it('should identify weight units and extract embedded numbers', () => {
      expect(parseUnitBaseInfo('Kilogramo')).toEqual({ baseValue: 1000, baseType: 'g' });
      expect(parseUnitBaseInfo('Gramo')).toEqual({ baseValue: 1, baseType: 'g' });
      expect(parseUnitBaseInfo('Libra')).toEqual({ baseValue: 500, baseType: 'g' });
      expect(parseUnitBaseInfo('Paquete 500g')).toEqual({ baseValue: 500, baseType: 'g' });
    });
  });

  describe('2. Generalized Volume to Onzas conversions', () => {
    it('should convert Botella 750ml to 25.36 Onzas (29.574ml = 1oz)', () => {
      const equiv = getDynamicUnitEquivalence('Botella (750ml)', 'Onza', DEFAULT_UNIT_EQUIVALENCES);
      expect(equiv).toBe(25.36);
    });

    it('should convert Litro 1000ml to 33.81 Onzas (29.574ml = 1oz)', () => {
      const equiv = getDynamicUnitEquivalence('Litro', 'Onza', DEFAULT_UNIT_EQUIVALENCES);
      expect(equiv).toBe(33.81);
    });

    it('should convert Botella 700ml to 23.67 Onzas', () => {
      const equiv = getDynamicUnitEquivalence('Botella 700ml', 'Onza', DEFAULT_UNIT_EQUIVALENCES);
      expect(equiv).toBe(23.67);
    });

    it('should convert Lata 355ml to 12.00 Onzas', () => {
      const equiv = getDynamicUnitEquivalence('Lata 355ml', 'Onza', DEFAULT_UNIT_EQUIVALENCES);
      expect(equiv).toBe(12.00);
    });

    it('should convert Kilogramo to 1000 Gramos and Libra to 500 Gramos', () => {
      expect(getDynamicUnitEquivalence('Kilogramo', 'Gramo', DEFAULT_UNIT_EQUIVALENCES)).toBe(1000);
      expect(getDynamicUnitEquivalence('Libra', 'Gramo', DEFAULT_UNIT_EQUIVALENCES)).toBe(500);
      expect(getDynamicUnitEquivalence('Kilogramo', 'Libra', DEFAULT_UNIT_EQUIVALENCES)).toBe(2);
    });
  });

  describe('3. Cost calculations & Golden Rule consistency', () => {
    it('should accurately calculate unit cost for Licor de café ($47.200 / 25 oz = $1.888,00 / Onza)', () => {
      const metrics = calculateCostMetrics({
        purchaseCost: 47200,
        cantidadComprada: 1,
        conversionMultiplier: 25,
        cantidadUtilizable: 25
      });

      expect(metrics.cantEquivalente).toBe(25);
      expect(metrics.costBruto).toBe(1888.00);
      expect(metrics.costReal).toBe(1888.00);
      expect(metrics.factor).toBe(1.00);
      expect(metrics.merma).toBe(0.00);
      expect(metrics.rendimiento).toBe(100.00);

      // Golden Rule: Unit cost * equivalent quantity === purchase cost
      expect(metrics.costBruto * metrics.cantEquivalente).toBe(47200);
    });

    it('should restrict usable quantity to integer (e.g. 500g with 11.82% merma -> 441g)', () => {
      const rawUtilWithDecimals = 500 * (1 - 0.1182); // 440.9
      const metrics = calculateCostMetrics({
        purchaseCost: 2000,
        cantidadComprada: 1,
        conversionMultiplier: 500,
        cantidadUtilizable: Math.round(rawUtilWithDecimals) // 441
      });

      expect(metrics.effectiveUtilQty).toBe(441);
      expect(Number.isInteger(metrics.effectiveUtilQty)).toBe(true);
      expect(metrics.merma).toBe(11.80);
      expect(metrics.rendimiento).toBe(88.20);
      expect(metrics.costBruto).toBe(4.00);
      expect(metrics.costReal).toBe(4.54);
    });
  });

  describe('4. Recipe Item Costing for Onza vs Mililitro', () => {
    it('should correctly calculate $1.861,19/oz for an item bought in 750ml bottle at $47.200 (ml -> oz)', () => {
      // Botella 750ml a $47.200 -> costoUnitarioReal = 47200 / 750 = $62.9333/ml
      const item = {
        name: 'Ginebra Tanqueray',
        costoUnitarioReal: 47200 / 750, // 62.93333333333333
        countUnit: 'Mililitro',
        purchaseCost: 47200
      };

      const unitCostOnza = calculateRecipeItemUnitCost(item, 'Onza', DEFAULT_UNIT_EQUIVALENCES);
      // 62.93333333333333 * 29.574 = 1861.189333...
      expect(Math.round(unitCostOnza * 100) / 100).toBe(1861.19);
    });

    it('should prefer precomputed unitCostUsage if it exists and matches usage unit', () => {
      const item = {
        name: 'Ginebra Tanqueray',
        costoUnitarioReal: 62.93,
        usageUnit: 'Onza',
        unitCostUsage: 1861.19,
        countUnit: 'Mililitro',
        purchaseCost: 47200
      };

      const unitCostOnza = calculateRecipeItemUnitCost(item, 'Onza', DEFAULT_UNIT_EQUIVALENCES);
      expect(unitCostOnza).toBe(1861.19);
    });
  });
});

