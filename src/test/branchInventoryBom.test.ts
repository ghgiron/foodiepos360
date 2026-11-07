// src/test/branchInventoryBom.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/localDb';
import type { Recipe, InventoryItem, KdsOrderTicket } from '../types';
import {
  getPhysicalStockInBranch,
  getReservedStockInBranch,
  getAvailableStockInBranch,
  getSubRecipeAvailablePortionsInBranch
} from '../types';
import {
  explodeItemRequirements,
  calculateAvailabilitySync
} from '../services/inventoryBomService';
import {
  stageComandaStock,
  commitComandaStock,
  releaseComandaStock,
  autoMigrateBranchStock
} from '../db/inventoryEngine';

describe('Branch-Isolated Inventory & Subrecipe BOM Engine', () => {
  const BRANCH_A = 'SEDE-SAN-AGUST-N-2044';
  const BRANCH_B = 'SEDE-NORTE-01';

  beforeEach(async () => {
    await db.inventoryItems.clear();
    await db.recipes.clear();
    await db.stockReservations.clear();
    await db.kdsOrderTickets.clear();
    await db.inventoryLogs.clear();
  });

  describe('1. Strict Branch Stock Isolation Helpers', () => {
    it('should accurately resolve physical, reserved, and available stock per branch without cross-branch contamination', () => {
      const item: InventoryItem = {
        id: 'ins-pan-artesanal',
        name: 'Pan Artesanal',
        category: 'Panadería',
        purchaseUnit: 'und',
        countUnit: 'und',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 1500,
        gainPercentage: 0,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 5,
        theoreticalStock: 8,
        realPhysicalStock: 8,
        currentStock: 8,
        reservedStock: 2,
        availableStock: 6,
        abcClassification: 'A',
        supplierId: 'sup-1',
        sucursalStock: [
          { sucursalId: BRANCH_A, stockActual: 6 },
          { sucursalId: BRANCH_B, stockActual: 2 }
        ],
        stockByBranch: {
          [BRANCH_A]: 6,
          [BRANCH_B]: 2
        },
        reservedStockByBranch: {
          [BRANCH_A]: 2,
          [BRANCH_B]: 0
        },
        updatedAt: new Date().toISOString()
      };

      // In Branch A: 6 physical - 2 reserved = 4 available
      expect(getPhysicalStockInBranch(item, BRANCH_A)).toBe(6);
      expect(getReservedStockInBranch(item, BRANCH_A)).toBe(2);
      expect(getAvailableStockInBranch(item, BRANCH_A)).toBe(4);

      // In Branch B: 2 physical - 0 reserved = 2 available
      expect(getPhysicalStockInBranch(item, BRANCH_B)).toBe(2);
      expect(getReservedStockInBranch(item, BRANCH_B)).toBe(0);
      expect(getAvailableStockInBranch(item, BRANCH_B)).toBe(2);

      // In unpopulated branch key: resilience fallback returns currentStock (8)
      expect(getAvailableStockInBranch(item, 'SEDE-DESCONOCIDA')).toBe(8);

      // In explicitly 0 branch stock: strictly 0
      const itemWithZero: InventoryItem = {
        ...item,
        stockByBranch: { ...item.stockByBranch, 'SEDE-CERO': 0 }
      };
      expect(getPhysicalStockInBranch(itemWithZero, 'SEDE-CERO')).toBe(0);
    });
  });

  describe('2. Hard-Gating Availability per Branch', () => {
    it('should block order taking when branch stock is 0 even if other branches have plenty', () => {
      const burgerRecipe: Recipe = {
        id: 'rec-burger-angus',
        name: 'Hamburguesa Angus',
        category: 'KITCHEN',
        sellPrice: 32000,
        costPrice: 11000,
        yieldFactor: 1,
        isSubRecipe: false,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'ins-pan-burger', type: 'item', quantity: 1, unit: 'und' }
        ]
      };

      const panItem: InventoryItem = {
        id: 'ins-pan-burger',
        name: 'Pan Hamburguesa',
        category: 'Panadería',
        purchaseUnit: 'und',
        countUnit: 'und',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 1800,
        gainPercentage: 0,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 5,
        theoreticalStock: 10,
        realPhysicalStock: 10,
        currentStock: 10,
        reservedStock: 0,
        availableStock: 10,
        abcClassification: 'A',
        supplierId: 'sup-1',
        sucursalStock: [
          { sucursalId: BRANCH_A, stockActual: 10 },
          { sucursalId: BRANCH_B, stockActual: 0 }
        ],
        stockByBranch: {
          [BRANCH_A]: 10,
          [BRANCH_B]: 0
        },
        updatedAt: new Date().toISOString()
      };

      // Branch A has 10 units -> available
      const availBranchA = calculateAvailabilitySync(
        'rec-burger-angus',
        [burgerRecipe],
        [panItem],
        'dine_in',
        BRANCH_A
      );
      expect(availBranchA.isAvailable).toBe(true);
      expect(availBranchA.availablePortions).toBe(10);

      // Branch B has 0 units -> strictly blocked!
      const availBranchB = calculateAvailabilitySync(
        'rec-burger-angus',
        [burgerRecipe],
        [panItem],
        'dine_in',
        BRANCH_B
      );
      expect(availBranchB.isAvailable).toBe(false);
      expect(availBranchB.availablePortions).toBe(0);
      expect(availBranchB.missingItemName).toBe('Pan Hamburguesa');
    });
  });

  describe('3. Subrecipe CASO 1: Batch Prepared Portions Deduction', () => {
    it('should consume prepared subrecipe batch portions directly when available in branch', async () => {
      // Prepared subrecipe batch
      const subRecipePatty: Recipe = {
        id: 'subrec-carne-angus',
        name: 'Carne Angus Molida Preparada',
        category: 'KITCHEN',
        sellPrice: 0,
        costPrice: 6500,
        yieldFactor: 1,
        yieldQuantity: 10,
        yieldUnit: 'porción',
        isSubRecipe: true,
        stockPortions: 15,
        reservedPortions: 0,
        availablePortions: 15,
        stockPortionsByBranch: {
          [BRANCH_A]: 15
        },
        reservedPortionsByBranch: {
          [BRANCH_A]: 0
        },
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'ins-carne-cruda', type: 'item', quantity: 200, unit: 'g' }
        ]
      };

      const finalBurger: Recipe = {
        id: 'rec-burger-premium',
        name: 'Hamburguesa Premium',
        category: 'KITCHEN',
        sellPrice: 35000,
        costPrice: 12000,
        yieldFactor: 1,
        isSubRecipe: false,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'subrec-carne-angus', type: 'subrecipe', quantity: 1, unit: 'porción' }
        ]
      };

      await db.recipes.put(subRecipePatty);
      await db.recipes.put(finalBurger);

      // 1. Explode requirements for 2 burgers in Branch A
      const reqs = await explodeItemRequirements('rec-burger-premium', 2, 'dine_in', new Set(), BRANCH_A);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].resourceType).toBe('subrecipe_portion');
      expect(reqs[0].itemId).toBe('subrec-carne-angus');
      expect(reqs[0].quantityRequired).toBe(2);

      // 2. Stage comanda in KDS
      const ticket: KdsOrderTicket = {
        id: 'kds-ticket-001',
        orderId: 'ord-001',
        tableId: 'M1',
        paxCount: 2,
        waiterId: 'Mesero Carlos',
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        branchId: BRANCH_A,
        sucursalId: BRANCH_A,
        overallStatus: 'ORDEN TOMADA',
        items: [
          {
            recipeId: 'rec-burger-premium',
            name: 'Hamburguesa Premium',
            category: 'KITCHEN',
            quantity: 2,
            modifiers: [],
            status: 'PENDING',
            completedAt: null
          }
        ]
      };
      await db.kdsOrderTickets.put(ticket);

      await stageComandaStock(ticket);

      // Verify subrecipe staged portions
      const subRecAfterStage = await db.recipes.get('subrec-carne-angus');
      expect(subRecAfterStage?.reservedPortionsByBranch?.[BRANCH_A]).toBe(2);
      expect(getSubRecipeAvailablePortionsInBranch(subRecAfterStage!, BRANCH_A)).toBe(13);

      // 3. Mark comanda 'LISTO' (commit)
      await commitComandaStock('kds-ticket-001');

      const subRecAfterCommit = await db.recipes.get('subrec-carne-angus');
      expect(subRecAfterCommit?.stockPortionsByBranch?.[BRANCH_A]).toBe(13);
      expect(subRecAfterCommit?.reservedPortionsByBranch?.[BRANCH_A]).toBe(0);
      expect(getSubRecipeAvailablePortionsInBranch(subRecAfterCommit!, BRANCH_A)).toBe(13);
    });
  });

  describe('4. Subrecipe CASO 2: On-the-Fly Recursive Raw Material Explosion', () => {
    it('should recursively explode and deduct raw materials when subrecipe has 0 prepared batch portions', async () => {
      // Subrecipe with 0 prepared batch portions
      const subRecipeSauce: Recipe = {
        id: 'subrec-salsa-gulupa',
        name: 'Salsa Reducción de Gulupa',
        category: 'KITCHEN',
        sellPrice: 0,
        costPrice: 2000,
        yieldFactor: 1,
        yieldQuantity: 10, // Batch produces 10 portions
        yieldUnit: 'porción',
        isSubRecipe: true,
        stockPortions: 0, // No prepared portions
        stockPortionsByBranch: {
          [BRANCH_A]: 0
        },
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'ins-pulpa-gulupa', type: 'item', quantity: 500, unit: 'g' }, // 500g for 10 portions = 50g/portion
          { inventoryItemId: 'ins-azucar', type: 'item', quantity: 200, unit: 'g' }       // 200g for 10 portions = 20g/portion
        ]
      };

      const ribDish: Recipe = {
        id: 'rec-costillas-gulupa',
        name: 'Costillas con Salsa de Gulupa',
        category: 'KITCHEN',
        sellPrice: 42000,
        costPrice: 16000,
        yieldFactor: 1,
        isSubRecipe: false,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'subrec-salsa-gulupa', type: 'subrecipe', quantity: 1, unit: 'porción' }
        ]
      };

      const pulpaItem: InventoryItem = {
        id: 'ins-pulpa-gulupa',
        name: 'Pulpa de Gulupa',
        category: 'Frutas',
        purchaseUnit: 'Kg',
        countUnit: 'g',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 12000,
        gainPercentage: 0,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 100,
        theoreticalStock: 1000,
        realPhysicalStock: 1000,
        currentStock: 1000,
        reservedStock: 0,
        availableStock: 1000,
        abcClassification: 'B',
        supplierId: 'sup-1',
        sucursalStock: [{ sucursalId: BRANCH_A, stockActual: 1000 }],
        stockByBranch: { [BRANCH_A]: 1000 },
        updatedAt: new Date().toISOString()
      };

      const azucarItem: InventoryItem = {
        id: 'ins-azucar',
        name: 'Azúcar Refinada',
        category: 'Abarrotes',
        purchaseUnit: 'Kg',
        countUnit: 'g',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 4000,
        gainPercentage: 0,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 500,
        theoreticalStock: 2000,
        realPhysicalStock: 2000,
        currentStock: 2000,
        reservedStock: 0,
        availableStock: 2000,
        abcClassification: 'C',
        supplierId: 'sup-1',
        sucursalStock: [{ sucursalId: BRANCH_A, stockActual: 2000 }],
        stockByBranch: { [BRANCH_A]: 2000 },
        updatedAt: new Date().toISOString()
      };

      await db.recipes.put(subRecipeSauce);
      await db.recipes.put(ribDish);
      await db.inventoryItems.put(pulpaItem);
      await db.inventoryItems.put(azucarItem);

      // Explode for 3 portions: (1/10) * 500g * 3 = 150g Pulpa; (1/10) * 200g * 3 = 60g Azúcar
      const reqs = await explodeItemRequirements('rec-costillas-gulupa', 3, 'dine_in', new Set(), BRANCH_A);
      expect(reqs).toHaveLength(2);

      const pulpaReq = reqs.find(r => r.itemId === 'ins-pulpa-gulupa');
      const azucarReq = reqs.find(r => r.itemId === 'ins-azucar');
      expect(pulpaReq?.quantityRequired).toBe(150);
      expect(azucarReq?.quantityRequired).toBe(60);

      // Stage ticket in Branch A
      const ticket: KdsOrderTicket = {
        id: 'kds-ticket-002',
        orderId: 'ord-002',
        tableId: 'M5',
        paxCount: 3,
        waiterId: 'Mesera Luisa',
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 20,
        isRushHourOrder: false,
        branchId: BRANCH_A,
        sucursalId: BRANCH_A,
        overallStatus: 'ORDEN TOMADA',
        items: [
          {
            recipeId: 'rec-costillas-gulupa',
            name: 'Costillas con Salsa de Gulupa',
            category: 'KITCHEN',
            quantity: 3,
            modifiers: [],
            status: 'PENDING',
            completedAt: null
          }
        ]
      };
      await db.kdsOrderTickets.put(ticket);

      await stageComandaStock(ticket);

      const pulpaStaged = await db.inventoryItems.get('ins-pulpa-gulupa');
      expect(pulpaStaged?.reservedStockByBranch?.[BRANCH_A]).toBe(150);
      expect(getAvailableStockInBranch(pulpaStaged!, BRANCH_A)).toBe(850);

      // Commit ticket in KDS
      await commitComandaStock('kds-ticket-002');

      const pulpaCommitted = await db.inventoryItems.get('ins-pulpa-gulupa');
      expect(pulpaCommitted?.stockByBranch?.[BRANCH_A]).toBe(850);
      expect(pulpaCommitted?.reservedStockByBranch?.[BRANCH_A]).toBe(0);
      expect(getAvailableStockInBranch(pulpaCommitted!, BRANCH_A)).toBe(850);

      const azucarCommitted = await db.inventoryItems.get('ins-azucar');
      expect(azucarCommitted?.stockByBranch?.[BRANCH_A]).toBe(1940);
      expect(azucarCommitted?.reservedStockByBranch?.[BRANCH_A]).toBe(0);

      // Verify Kardex logged branchId
      const logs = await db.inventoryLogs.where('itemId').equals('ins-pulpa-gulupa').toArray();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].branchId).toBe(BRANCH_A);
      expect(logs[0].quantity).toBe(-150);
    });
  });

  describe('5. Comanda Staging Rollback / Cancellation', () => {
    it('should release staged reservations without altering physical inventory upon order cancellation', async () => {
      const beerItem: InventoryItem = {
        id: 'ins-cerveza-artesanal',
        name: 'Cerveza IPA Artesanal',
        category: 'Bar',
        purchaseUnit: 'und',
        countUnit: 'und',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 6000,
        gainPercentage: 0,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 12,
        theoreticalStock: 24,
        realPhysicalStock: 24,
        currentStock: 24,
        reservedStock: 0,
        availableStock: 24,
        abcClassification: 'A',
        supplierId: 'sup-1',
        sucursalStock: [{ sucursalId: BRANCH_A, stockActual: 24 }],
        stockByBranch: { [BRANCH_A]: 24 },
        updatedAt: new Date().toISOString()
      };
      await db.inventoryItems.put(beerItem);

      const ticket: KdsOrderTicket = {
        id: 'kds-ticket-003',
        orderId: 'ord-003',
        tableId: 'Bar 2',
        paxCount: 1,
        waiterId: 'Bartender Mateo',
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 10,
        isRushHourOrder: false,
        branchId: BRANCH_A,
        sucursalId: BRANCH_A,
        overallStatus: 'ORDEN TOMADA',
        items: [
          {
            recipeId: 'ins-cerveza-artesanal',
            name: 'Cerveza IPA Artesanal',
            category: 'BAR',
            quantity: 4,
            modifiers: [],
            status: 'PENDING',
            completedAt: null
          }
        ]
      };
      await db.kdsOrderTickets.put(ticket);

      // Stage
      await stageComandaStock(ticket);
      let stagedItem = await db.inventoryItems.get('ins-cerveza-artesanal');
      expect(stagedItem?.reservedStockByBranch?.[BRANCH_A]).toBe(4);
      expect(getAvailableStockInBranch(stagedItem!, BRANCH_A)).toBe(20);

      // Release (Customer changed mind or waiter made error)
      await releaseComandaStock('kds-ticket-003');

      let releasedItem = await db.inventoryItems.get('ins-cerveza-artesanal');
      // Physical stock untouched
      expect(releasedItem?.stockByBranch?.[BRANCH_A]).toBe(24);
      // Reserved stock released
      expect(releasedItem?.reservedStockByBranch?.[BRANCH_A]).toBe(0);
      expect(getAvailableStockInBranch(releasedItem!, BRANCH_A)).toBe(24);
    });
  });

  describe('6. Auto-Migration Routine for Unmigrated Items', () => {
    it('should populate stockByBranch for all items lacking the active branch key', async () => {
      // Unmigrated items simulating legacy 232 items in Dexie
      const bbcRose: InventoryItem = {
        id: 'ins-prd-cerveza-bbc-rose',
        name: 'Cerveza BBC Rose',
        category: 'Bebidas',
        purchaseUnit: 'und',
        countUnit: 'und',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 6500,
        gainPercentage: 40,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 5,
        theoreticalStock: 11,
        realPhysicalStock: 11,
        currentStock: 11,
        reservedStock: 0,
        availableStock: 11,
        abcClassification: 'A',
        supplierId: 'sup-bbc',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      };

      const budweiser: InventoryItem = {
        id: 'ins-prd-cerveza-budweiser',
        name: 'Cerveza Budweiser',
        category: 'Cervezas y Gaseosas',
        purchaseUnit: 'und',
        countUnit: 'und',
        yieldFactor: 1,
        density: 1,
        bottleTareWeightGrams: 0,
        purchaseCost: 3500,
        gainPercentage: 50,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 20,
        theoreticalStock: 275,
        realPhysicalStock: 275,
        currentStock: 275,
        reservedStock: 0,
        availableStock: 275,
        abcClassification: 'A',
        supplierId: 'sup-bud',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      };

      await db.inventoryItems.bulkPut([bbcRose, budweiser]);

      // Before migration: resilience fallback returns currentStock
      expect(getPhysicalStockInBranch(bbcRose, BRANCH_A)).toBe(11);
      expect(getPhysicalStockInBranch(budweiser, BRANCH_A)).toBe(275);

      // Execute auto-migration
      const migrationResult = await autoMigrateBranchStock(BRANCH_A);
      expect(migrationResult.migratedItemsCount).toBe(2);

      // After migration: items in database have explicit branch key
      const bbcAfter = await db.inventoryItems.get('ins-prd-cerveza-bbc-rose');
      const budAfter = await db.inventoryItems.get('ins-prd-cerveza-budweiser');
      expect(bbcAfter?.stockByBranch?.[BRANCH_A]).toBe(11);
      expect(budAfter?.stockByBranch?.[BRANCH_A]).toBe(275);
      expect(getAvailableStockInBranch(bbcAfter!, BRANCH_A)).toBe(11);
      expect(getAvailableStockInBranch(budAfter!, BRANCH_A)).toBe(275);
    });
  });
});
