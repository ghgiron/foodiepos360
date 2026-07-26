import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './localDb';
import { processOrderPaidInventory } from './inventoryEngine';
import type { InventoryItem, Recipe, OrderPaidPayload } from '../types';

describe('InventoryEngine Deductions on OrderPaid', () => {
  beforeEach(async () => {
    await db.inventoryItems.clear();
    await db.recipes.clear();
    await db.inventoryLogs.clear();

    // Seed test inventory item
    const item: InventoryItem = {
      id: 'ins-carne-001',
      name: 'Carne de Res Molida',
      category: 'Carnes',
      purchaseUnit: 'Kg',
      countUnit: 'g',
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 25000,
      gainPercentage: 100,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 500,
      theoreticalStock: 2000, // 2000g available
      realPhysicalStock: 2000,
      abcClassification: 'A',
      supplierId: 'prov-01',
      sucursalStock: [],
      updatedAt: new Date().toISOString(),
    };
    await db.inventoryItems.put(item);

    // Seed test recipe consuming 200g of Carne de Res Molida
    const recipe: Recipe = {
      id: 'rec-burg-001',
      name: 'Hamburguesa Clasica',
      category: 'KITCHEN',
      sellPrice: 35000,
      costPrice: 5000,
      yieldFactor: 1.0,
      ingredients: [
        {
          inventoryItemId: 'ins-carne-001',
          type: 'item',
          quantity: 200, // 200g per burger
          unit: 'g',
        },
      ],
      isSubRecipe: false,
      bcgClassification: 'ESTRELLA',
      updatedAt: new Date().toISOString(),
    };
    await db.recipes.put(recipe);
  });

  it('should deduct raw ingredient inventory correctly when OrderPaid is processed', async () => {
    const payload: OrderPaidPayload = {
      orderId: 'ord-test-999',
      tableId: 14,
      waiterId: 'user-mesero-camilo',
      totalAmount: 70000,
      netAmountBeforeTax: 64814.81,
      taxAmount: 5185.19,
      paymentMethod: 'Efectivo',
      items: [
        {
          recipeId: 'rec-burg-001',
          quantity: 2, // 2 burgers = 400g total
          unitPrice: 35000,
        },
      ],
    };

    await processOrderPaidInventory(payload);

    const updatedItem = await db.inventoryItems.get('ins-carne-001');
    expect(updatedItem).toBeDefined();
    expect(updatedItem?.theoreticalStock).toBe(1600); // 2000 - 400 = 1600g

    const logs = await db.inventoryLogs.toArray();
    expect(logs.length).toBe(1);
    expect(logs[0].itemId).toBe('ins-carne-001');
    expect(logs[0].type).toBe('Venta');
  });
});
