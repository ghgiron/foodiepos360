// src/utils/inventoryMatching.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeSearchText, findMatchingInventoryItem, calculateRestockMetrics } from './inventoryMatching';
import type { InventoryItem } from '../types';
import type { VoiceIngredientExtraction } from '../types/voiceCopilot';

describe('inventoryMatching utility', () => {
  const mockItems: InventoryItem[] = [
    {
      id: 'item-salmon-1',
      name: 'Salmón Fresco',
      category: 'Proteínas',
      purchaseUnit: 'Kilogramo',
      countUnit: 'g',
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 6500, // $6.500 por kg
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 5,
      theoreticalStock: 10,
      realPhysicalStock: 10,
      abcClassification: 'A',
      supplierId: 'prov-fierro',
      sucursalStock: [],
      updatedAt: Date.now()
    },
    {
      id: 'item-corona-2',
      name: 'Cerveza Corona 355ml',
      category: 'Cervezas',
      purchaseUnit: 'Unidad',
      countUnit: 'und',
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 4500,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 24,
      theoreticalStock: 48,
      realPhysicalStock: 48,
      abcClassification: 'B',
      supplierId: 'prov-bavaria',
      sucursalStock: [],
      updatedAt: Date.now()
    }
  ];

  it('should normalize search text by stripping accents and punctuation', () => {
    expect(normalizeSearchText('Salmón!')).toBe('salmon');
    expect(normalizeSearchText('Café con Leche')).toBe('cafe con leche');
  });

  it('should find existing item by partial/exact match', () => {
    const match1 = findMatchingInventoryItem('salmon', mockItems);
    expect(match1).toBeDefined();
    expect(match1?.id).toBe('item-salmon-1');

    const match2 = findMatchingInventoryItem('Cervezas Corona', mockItems);
    expect(match2).toBeDefined();
    expect(match2?.id).toBe('item-corona-2');

    const noMatch = findMatchingInventoryItem('Lomo Fino Res', mockItems);
    expect(noMatch).toBeNull();
  });

  it('should strictly avoid false positive matches when key variant modifiers diverge', () => {
    const beerCatalog: InventoryItem[] = [
      {
        ...mockItems[1],
        id: 'beer-club-colombia',
        name: 'Cerveza Club Colombia',
      },
      {
        ...mockItems[1],
        id: 'beer-club-roja',
        name: 'Cerveza Club Colombia Roja',
      },
      {
        ...mockItems[1],
        id: 'water-con-gas',
        name: 'Agua Cristal Con Gas 600ml',
      },
      {
        ...mockItems[1],
        id: 'coke-regular',
        name: 'Coca Cola 400ml',
      }
    ];

    // "Cerveza Club Colombia Negra" has modifier "negra" which is absent in "Cerveza Club Colombia"
    expect(findMatchingInventoryItem('Cerveza Club Colombia Negra', beerCatalog)).toBeNull();

    // "Cerveza Club Colombia Negra" has modifier "negra" which conflicts with "roja"
    expect(findMatchingInventoryItem('Cerveza Club Colombia Negra', [beerCatalog[1]])).toBeNull();

    // "Agua Cristal Sin Gas" has modifier "sin gas" which conflicts with "con gas"
    expect(findMatchingInventoryItem('Agua Cristal Sin Gas', beerCatalog)).toBeNull();

    // "Coca Cola Zero" has modifier "zero" which is absent in regular Coca Cola
    expect(findMatchingInventoryItem('Coca Cola Zero', beerCatalog)).toBeNull();

    // Matching succeeds when key modifiers match exactly
    const blackBeerCatalog: InventoryItem[] = [
      {
        ...mockItems[1],
        id: 'beer-club-negra-330',
        name: 'Cerveza Club Colombia Negra 330ml',
      }
    ];
    expect(findMatchingInventoryItem('Cerveza Club Colombia Negra', blackBeerCatalog)?.id).toBe('beer-club-negra-330');
  });

  it('should calculate accurate restock metrics and weighted average cost', () => {
    const extraction: VoiceIngredientExtraction = {
      name: 'Salmón',
      purchase_quantity: 10, // +10 kg
      purchase_unit: 'Kilogramo',
      purchase_price: 70000, // $70.000 total -> $7.000/kg (Subió $500/kg)
      conversion_multiplier: 1,
      missing_fields: [],
      follow_up_question: '',
      is_complete: true
    };

    const metrics = calculateRestockMetrics(mockItems[0], extraction);
    expect(metrics.id).toBe('item-salmon-1');
    expect(metrics.currentStock).toBe(10);
    expect(metrics.newCalculatedStock).toBe(20);
    expect(metrics.previousCost).toBe(6500);
    expect(metrics.newUnitCost).toBe(7000);
    expect(metrics.costDifference).toBe(500); // Subió $500
    // Weighted average: ((10 * 6500) + (10 * 7000)) / 20 = 135000 / 20 = 6750
    expect(metrics.weightedAverageCost).toBe(6750);
  });
});
