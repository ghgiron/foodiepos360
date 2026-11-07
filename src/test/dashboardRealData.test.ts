import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/localDb';
import type { InventoryItem, OperationalLoss, KdsOrderTicket, Recipe } from '../types';

describe('Real Data Connectivity and Zero-Data States for Dashboards', () => {
  beforeEach(async () => {
    await db.inventoryItems.clear();
    await db.operationalLosses.clear();
    await db.kdsOrderTickets.clear();
    await db.recipes.clear();
    await db.inventoryLogs.clear();
  });

  it('should reflect 0 metrics and clean states when all Dexie tables are empty', async () => {
    const items = await db.inventoryItems.toArray();
    const losses = await db.operationalLosses.toArray();
    const tickets = await db.kdsOrderTickets.toArray();

    expect(items.length).toBe(0);
    expect(losses.length).toBe(0);
    expect(tickets.length).toBe(0);

    const totalInventoryValue = items.reduce((acc, item) => acc + (item.theoreticalStock * (item.purchaseCost || 0)), 0);
    expect(totalInventoryValue).toBe(0);

    const totalLosses = losses.reduce((acc, l) => acc + (l.cost || 0), 0);
    expect(totalLosses).toBe(0);
  });

  it('should calculate real total inventory value and dynamic waste metrics from Dexie items and losses', async () => {
    const item1: InventoryItem = {
      id: 'inv-item-01',
      name: 'Carne Molida Angus',
      category: 'Carnes',
      purchaseUnit: 'Kilogramo',
      countUnit: 'kg',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 10,
      realPhysicalStock: 10,
      purchaseCost: 25000,
      stockMinLimit: 3,
      updatedAt: new Date().toISOString()
    };

    const item2: InventoryItem = {
      id: 'inv-item-02',
      name: 'Queso Cheddar',
      category: 'Lácteos',
      purchaseUnit: 'Kilogramo',
      countUnit: 'kg',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 5,
      realPhysicalStock: 5,
      purchaseCost: 30000,
      stockMinLimit: 2,
      updatedAt: new Date().toISOString()
    };

    await db.inventoryItems.bulkPut([item1, item2]);

    const items = await db.inventoryItems.toArray();
    const totalInventoryValue = items.reduce((acc, item) => acc + (item.theoreticalStock * (item.purchaseCost || 0)), 0);
    expect(totalInventoryValue).toBe(10 * 25000 + 5 * 30000); // 400,000

    const loss1: OperationalLoss = {
      id: 'loss-01',
      ticketId: 'T-101',
      recipeId: 'rec-01',
      name: 'Hamburguesa Doble',
      quantity: 1,
      cost: 16000,
      reason: 'Error en comanda',
      cancelledAt: new Date().toISOString(),
      waiterId: 'Mesero David'
    };

    await db.operationalLosses.put(loss1);

    const losses = await db.operationalLosses.toArray();
    const totalLosses = losses.reduce((acc, l) => acc + (l.cost || 0), 0);
    expect(totalLosses).toBe(16000);

    const wasteRate = Number(((totalLosses / totalInventoryValue) * 100).toFixed(1));
    expect(wasteRate).toBe(4.0);
  });

  it('should dynamically calculate expiring alerts within 15 days from inventoryItems', async () => {
    const today = new Date();
    const target3Days = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    const target60Days = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);

    const expDateSoon = `${target3Days.getFullYear()}-${String(target3Days.getMonth() + 1).padStart(2, '0')}-${String(target3Days.getDate()).padStart(2, '0')}`;
    const expDateFar = `${target60Days.getFullYear()}-${String(target60Days.getMonth() + 1).padStart(2, '0')}-${String(target60Days.getDate()).padStart(2, '0')}`;

    const itemExpiring: InventoryItem = {
      id: 'inv-exp-01',
      name: 'Salmón Fresco',
      category: 'Pescados',
      purchaseUnit: 'Kilogramo',
      countUnit: 'kg',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 4,
      realPhysicalStock: 4,
      purchaseCost: 45000,
      stockMinLimit: 2,
      fechaVencimiento: expDateSoon,
      updatedAt: new Date().toISOString()
    };

    const itemNotExpiring: InventoryItem = {
      id: 'inv-safe-01',
      name: 'Arroz Grano Largo',
      category: 'Granos',
      purchaseUnit: 'Kilogramo',
      countUnit: 'kg',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 50,
      realPhysicalStock: 50,
      purchaseCost: 3500,
      stockMinLimit: 10,
      fechaVencimiento: expDateFar,
      updatedAt: new Date().toISOString()
    };

    await db.inventoryItems.bulkPut([itemExpiring, itemNotExpiring]);

    const items = await db.inventoryItems.toArray();
    const todayNorm = new Date();
    todayNorm.setHours(0, 0, 0, 0);

    const alerts = items
      .filter(item => item.fechaVencimiento)
      .map(item => {
        const expDate = new Date(`${item.fechaVencimiento}T00:00:00`);
        const diffTime = expDate.getTime() - todayNorm.getTime();
        const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return { name: item.name, daysLeft };
      })
      .filter(a => a.daysLeft >= 0 && a.daysLeft <= 15);

    expect(alerts.length).toBe(1);
    expect(alerts[0].name).toBe('Salmón Fresco');
    expect(alerts[0].daysLeft).toBe(3);
  });

  it('should compute net sales and David Penagos tax deductions accurately from tickets', async () => {
    const recipe: Recipe = {
      id: 'rec-01',
      name: 'Hamburguesa Clásica',
      category: 'Burgers',
      costPrice: 8000,
      sellPrice: 25000,
      prepTime: 10,
      difficulty: 'Fácil',
      cmvPercentage: 32,
      isSubRecipe: false,
      isCombo: false,
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    };

    await db.recipes.put(recipe);

    const ticket: KdsOrderTicket = {
      id: 'tick-01',
      orderId: 'ord-101',
      tableId: 4,
      paxCount: 2,
      waiterId: 'user-juan',
      comandaTime: new Date().toISOString(),
      timeLimitMinutes: 15,
      isRushHourOrder: false,
      overallStatus: 'ENTREGADO A MESA',
      createdAt: new Date().toISOString(),
      items: [
        {
          recipeId: 'rec-01',
          name: 'Hamburguesa Clásica',
          quantity: 2,
          category: 'COCINA',
          status: 'COMPLETED',
          modifiers: [],
          completedAt: new Date().toISOString()
        }
      ]
    };

    await db.kdsOrderTickets.put(ticket);

    const tickets = await db.kdsOrderTickets.toArray();
    const recipes = await db.recipes.toArray();

    let grossSales = 0;
    let cogs = 0;

    tickets.forEach(t => {
      t.items.forEach(i => {
        const rec = recipes.find(r => r.id === i.recipeId);
        const sellPrice = rec ? rec.sellPrice : 0;
        const costPrice = rec ? rec.costPrice : 0;
        grossSales += sellPrice * i.quantity;
        cogs += costPrice * i.quantity;
      });
    });

    expect(grossSales).toBe(50000);
    expect(cogs).toBe(16000);

    const TAX_RATE = 0.08;
    const netSales = grossSales * (1 - TAX_RATE);
    const netUtility = netSales - cogs;

    expect(netSales).toBe(46000);
    expect(netUtility).toBe(30000);
  });

  it('should correctly calculate total valuation when ingredients are bought in bulk units (e.g. 500g, 400g, 25oz)', async () => {
    const { getItemTotalValuation, getItemUnitCost } = await import('../utils/costEngine');

    // Panela: 1 unit bought at $4,000 containing 500 grams. Cost per gram = $8
    const panela: InventoryItem = {
      id: 'ing-panela',
      name: 'Panela',
      category: 'Endulzantes',
      purchaseUnit: 'Panela 500g',
      countUnit: 'GRAMO',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 500, // 500 grams in stock
      realPhysicalStock: 500,
      purchaseCost: 4000,
      conversionMultiplier: 500,
      costoUnitarioReal: 8,
      costoUnitarioBruto: 8,
      stockMinLimit: 50,
      updatedAt: new Date().toISOString()
    };

    // Gulupa: 1 unit bought at $6,000 containing 400 grams. Cost per gram = $15
    const gulupa: InventoryItem = {
      id: 'ing-gulupa',
      name: 'Gulupa',
      category: 'Frutas',
      purchaseUnit: 'Bolsa 400g',
      countUnit: 'GRAMO',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 400, // 400 grams in stock
      realPhysicalStock: 400,
      purchaseCost: 6000,
      conversionMultiplier: 400,
      costoUnitarioReal: 15,
      costoUnitarioBruto: 15,
      stockMinLimit: 50,
      updatedAt: new Date().toISOString()
    };

    // Licor de café: 1 bottle bought at $40,000 containing 25 onzas. Cost per onza = $1,600
    const licorCafe: InventoryItem = {
      id: 'ing-licor-cafe',
      name: 'Licor de café',
      category: 'Licores',
      purchaseUnit: 'Botella 750ml',
      countUnit: 'ONZA',
      yieldFactor: 1,
      density: 1,
      bottleTareWeightGrams: 0,
      gainPercentage: 0,
      isTaxable: false,
      taxPercentage: 0,
      abcClassification: 'A',
      supplierId: 'sup-1',
      sucursalStock: [],
      theoreticalStock: 25, // 25 onzas in stock
      realPhysicalStock: 25,
      purchaseCost: 40000,
      conversionMultiplier: 25,
      costoUnitarioReal: 1600,
      costoUnitarioBruto: 1600,
      stockMinLimit: 5,
      updatedAt: new Date().toISOString()
    };

    await db.inventoryItems.bulkPut([panela, gulupa, licorCafe]);
    const items = await db.inventoryItems.toArray();

    expect(getItemUnitCost(panela)).toBe(8);
    expect(getItemTotalValuation(panela)).toBe(4000);

    expect(getItemUnitCost(gulupa)).toBe(15);
    expect(getItemTotalValuation(gulupa)).toBe(6000);

    expect(getItemUnitCost(licorCafe)).toBe(1600);
    expect(getItemTotalValuation(licorCafe)).toBe(40000);

    const totalValuation = items.reduce((acc, item) => acc + getItemTotalValuation(item), 0);
    // Correct total: $4,000 + $6,000 + $40,000 = $50,000 COP (not $2,980,000!)
    expect(totalValuation).toBe(50000);
  });
});
