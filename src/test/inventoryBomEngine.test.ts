import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/localDb';
import { getAvailableStock, type InventoryItem, type Recipe, type KdsOrderTicket } from '../types';
import { 
  explodeItemRequirements, 
  calculateAvailabilitySync 
} from '../services/inventoryBomService';
import { 
  stageComandaStock, 
  commitComandaStock, 
  releaseComandaStock 
} from '../db/inventoryEngine';

function createMockItem(overrides: Partial<InventoryItem> & { id: string; name: string }): InventoryItem {
  return {
    category: 'General',
    purchaseUnit: 'und',
    countUnit: 'und',
    yieldFactor: 1,
    density: 1,
    bottleTareWeightGrams: 0,
    purchaseCost: 1000,
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
    sucursalStock: [],
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Inventory Two-Phase Engine & Recursive BOM Explosion', () => {
  beforeEach(async () => {
    // Clear relevant test tables
    await db.inventoryItems.clear();
    await db.recipes.clear();
    await db.orders.clear();
    await db.stockReservations.clear();
    await db.inventoryLogs.clear();
  });

  describe('Pure Helper: getAvailableStock', () => {
    it('calculates availableStock = currentStock - reservedStock', () => {
      const item: Partial<InventoryItem> = {
        currentStock: 50,
        reservedStock: 15
      };
      expect(getAvailableStock(item as InventoryItem)).toBe(35);
    });

    it('falls back to realPhysicalStock or theoreticalStock if currentStock is absent', () => {
      const item1: Partial<InventoryItem> = {
        realPhysicalStock: 40,
        reservedStock: 10
      };
      expect(getAvailableStock(item1 as InventoryItem)).toBe(30);

      const item2: Partial<InventoryItem> = {
        theoreticalStock: 25,
        reservedStock: 5
      };
      expect(getAvailableStock(item2 as InventoryItem)).toBe(20);
    });

    it('handles negative or zero reservations safely', () => {
      const item: Partial<InventoryItem> = {
        currentStock: 10,
        reservedStock: 0
      };
      expect(getAvailableStock(item as InventoryItem)).toBe(10);
    });
  });

  describe('Recursive BOM Explosion & Channel Supplies', () => {
    it('correctly explodes subrecipe ingredients using yield ratios', async () => {
      // 1. Raw inventory items
      const tomato = createMockItem({
        id: 'inv-tomato',
        name: 'Tomate Chonto',
        category: 'Verduras',
        countUnit: 'g',
        theoreticalStock: 2000,
        realPhysicalStock: 2000,
        currentStock: 2000,
        reservedStock: 0,
        availableStock: 2000,
        purchaseCost: 5
      });
      const onion = createMockItem({
        id: 'inv-onion',
        name: 'Cebolla Cabezona',
        category: 'Verduras',
        countUnit: 'g',
        theoreticalStock: 1000,
        realPhysicalStock: 1000,
        currentStock: 1000,
        reservedStock: 0,
        availableStock: 1000,
        purchaseCost: 4
      });
      const burgerBun = createMockItem({
        id: 'inv-bun',
        name: 'Pan Brioche',
        category: 'Panadería',
        countUnit: 'und',
        theoreticalStock: 50,
        realPhysicalStock: 50,
        currentStock: 50,
        reservedStock: 0,
        availableStock: 50,
        purchaseCost: 1200
      });
      const deliveryBox = createMockItem({
        id: 'inv-box',
        name: 'Caja Hamburguesa Delivery',
        category: 'Empaques',
        countUnit: 'und',
        theoreticalStock: 100,
        realPhysicalStock: 100,
        currentStock: 100,
        reservedStock: 0,
        availableStock: 100,
        purchaseCost: 600
      });

      await db.inventoryItems.bulkAdd([tomato, onion, burgerBun, deliveryBox]);

      // 2. Subrecipe: Salsa Especial (Yields 1000g from 800g tomato and 200g onion)
      const subrecipeSalsa: Recipe = {
        id: 'sub-salsa',
        name: 'Salsa Especial Burger',
        category: 'Salsas',
        isSubRecipe: true,
        yieldQuantity: 1000,
        yieldFactor: 1.0,
        costPrice: 4800,
        sellPrice: 0,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'inv-tomato', quantity: 800, unit: 'g', type: 'item' },
          { inventoryItemId: 'inv-onion', quantity: 200, unit: 'g', type: 'item' }
        ]
      };

      // 3. Main Recipe: Hamburguesa Doble (Uses 1 bun, 100g salsa, and packaging)
      const recipeBurger: Recipe = {
        id: 'rec-burger',
        name: 'Hamburguesa Doble',
        category: 'Hamburguesas',
        isSubRecipe: false,
        yieldFactor: 1.0,
        costPrice: 6000,
        sellPrice: 28000,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'inv-bun', quantity: 1, unit: 'und', type: 'item' },
          { inventoryItemId: 'sub-salsa', quantity: 100, unit: 'g', type: 'subrecipe' }
        ],
        packaging: [
          { item: 'Caja Hamburguesa Delivery', quantity: 1, cost: 600, channel: 'delivery' }
        ]
      };

      await db.recipes.bulkAdd([subrecipeSalsa, recipeBurger]);

      // Explode for 2 Burgers via Delivery channel
      const requirements = await explodeItemRequirements(
        'rec-burger',
        2,
        'delivery'
      );

      // Verify bun: 2 units
      const bunReq = requirements.find(r => r.itemId === 'inv-bun');
      expect(bunReq).toBeDefined();
      expect(bunReq?.quantityRequired).toBe(2);

      // Verify subrecipe explosion:
      // Sold 2 burgers => 200g salsa total.
      // Batch yield is 1000g, so ratio = 200 / 1000 = 0.2
      // Tomato required: 0.2 * 800 = 160g
      const tomatoReq = requirements.find(r => r.itemId === 'inv-tomato');
      expect(tomatoReq).toBeDefined();
      expect(tomatoReq?.quantityRequired).toBeCloseTo(160, 2);

      // Onion required: 0.2 * 200 = 40g
      const onionReq = requirements.find(r => r.itemId === 'inv-onion');
      expect(onionReq).toBeDefined();
      expect(onionReq?.quantityRequired).toBeCloseTo(40, 2);

      // Verify delivery packaging: 2 boxes
      const boxReq = requirements.find(r => r.itemId === 'inv-box');
      expect(boxReq).toBeDefined();
      expect(boxReq?.quantityRequired).toBe(2);

      // Explode for Dine-in: delivery packaging should NOT be required
      const dineInRequirements = await explodeItemRequirements(
        'rec-burger',
        1,
        'dine_in'
      );
      const dineInBoxReq = dineInRequirements.find(r => r.itemId === 'inv-box');
      expect(dineInBoxReq).toBeUndefined();
    });
  });

  describe('Out-of-Stock Gating Check', () => {
    it('detects when an item is unavailable based on availableStock', () => {
      const items: InventoryItem[] = [
        createMockItem({
          id: 'inv-patty',
          name: 'Carne Angus 150g',
          category: 'Carnes',
          countUnit: 'und',
          currentStock: 5,
          reservedStock: 4, // Only 1 available!
          availableStock: 1,
          purchaseCost: 4000
        })
      ];

      const burgerRecipe: Recipe = {
        id: 'rec-angus',
        name: 'Hamburguesa Angus',
        category: 'Hamburguesas',
        isSubRecipe: false,
        yieldFactor: 1.0,
        costPrice: 5000,
        sellPrice: 30000,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'inv-patty', quantity: 1, unit: 'und', type: 'item' }
        ]
      };

      // When availableStock is 1, 1 portion is available
      const check1 = calculateAvailabilitySync('rec-angus', [burgerRecipe], items, 'dine_in');
      expect(check1.isAvailable).toBe(true);
      expect(check1.availablePortions).toBe(1);

      // When availableStock is depleted, isAvailable is false with missingItemName
      const zeroItems = [{ ...items[0], currentStock: 0, reservedStock: 0, availableStock: 0 }];
      const check2 = calculateAvailabilitySync('rec-angus', [burgerRecipe], zeroItems, 'dine_in');
      expect(check2.isAvailable).toBe(false);
      expect(check2.availablePortions).toBe(0);
      expect(check2.missingItemName).toBe('Carne Angus 150g');
    });
  });

  describe('Two-Phase Inventory Lifecycle (Staging, Commit, Release)', () => {
    it('stages comanda stock without decrementing physical stock', async () => {
      const cheese = createMockItem({
        id: 'inv-cheese',
        name: 'Queso Cheddar',
        category: 'Lácteos',
        countUnit: 'g',
        currentStock: 500,
        reservedStock: 0,
        availableStock: 500,
        purchaseCost: 20
      });
      await db.inventoryItems.add(cheese);

      const recipeCheeseBurger: Recipe = {
        id: 'rec-cheeseburger',
        name: 'Cheeseburger',
        category: 'Hamburguesas',
        isSubRecipe: false,
        yieldFactor: 1.0,
        costPrice: 1000,
        sellPrice: 15000,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'inv-cheese', quantity: 50, unit: 'g', type: 'item' }
        ]
      };
      await db.recipes.add(recipeCheeseBurger);

      const ticket: KdsOrderTicket = {
        id: 'ticket-test-01',
        orderId: 'ord-test-01',
        tableId: 5,
        paxCount: 2,
        waiterId: 'Mesero 1',
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        createdAt: new Date().toISOString(),
        orderType: 'DINE_IN',
        overallStatus: 'ORDEN TOMADA',
        items: [
          {
            recipeId: 'rec-cheeseburger',
            name: 'Cheeseburger',
            category: 'KITCHEN',
            quantity: 2,
            modifiers: [],
            status: 'PENDING',
            completedAt: null,
            consumed: false
          }
        ]
      };
      await db.orders.add(ticket);

      // Phase 1: Stage comanda
      await stageComandaStock(ticket);

      const updatedCheese = await db.inventoryItems.get('inv-cheese');
      expect(updatedCheese).toBeDefined();
      // Physical stock is unchanged: 500
      expect(updatedCheese?.currentStock).toBe(500);
      // Staged reservation is 100 (2 burgers * 50g)
      expect(updatedCheese?.reservedStock).toBe(100);
      // Available stock is now 400
      expect(updatedCheese?.availableStock).toBe(400);

      // Verify reservation log exists in table
      const reservations = await db.stockReservations.where('ticketId').equals('ticket-test-01').toArray();
      expect(reservations.length).toBe(1);
      expect(reservations[0].status).toBe('staged');
      expect(reservations[0].quantityReserved).toBe(100);

      // Phase 2: Commit when dispatched by kitchen
      await commitComandaStock('ticket-test-01');

      const committedCheese = await db.inventoryItems.get('inv-cheese');
      // Physical stock is now decremented: 400
      expect(committedCheese?.currentStock).toBe(400);
      // Reserved stock is freed: 0
      expect(committedCheese?.reservedStock).toBe(0);
      // Available stock remains 400
      expect(committedCheese?.availableStock).toBe(400);

      // Reservation marked committed
      const updatedReservations = await db.stockReservations.where('ticketId').equals('ticket-test-01').toArray();
      expect(updatedReservations[0].status).toBe('committed');

      // Kardex entry recorded
      const logs = await db.inventoryLogs.where('itemId').equals('inv-cheese').toArray();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].type).toBe('Venta');
    });

    it('releases reserved stock cleanly on comanda cancellation without altering physical stock', async () => {
      const beer = createMockItem({
        id: 'inv-beer',
        name: 'Cerveza Corona',
        category: 'Bebidas',
        countUnit: 'und',
        currentStock: 24,
        reservedStock: 0,
        availableStock: 24,
        purchaseCost: 4500
      });
      await db.inventoryItems.add(beer);

      const beerRecipe: Recipe = {
        id: 'rec-beer',
        name: 'Cerveza Corona',
        category: 'Bebidas',
        isSubRecipe: false,
        yieldFactor: 1.0,
        costPrice: 4500,
        sellPrice: 10000,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { inventoryItemId: 'inv-beer', quantity: 1, unit: 'und', type: 'item' }
        ]
      };
      await db.recipes.add(beerRecipe);

      const ticket: KdsOrderTicket = {
        id: 'ticket-cancel-01',
        orderId: 'ord-cancel-01',
        tableId: 3,
        paxCount: 2,
        waiterId: 'Mesero 2',
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        createdAt: new Date().toISOString(),
        orderType: 'DINE_IN',
        overallStatus: 'ORDEN TOMADA',
        items: [
          {
            recipeId: 'rec-beer',
            name: 'Cerveza Corona',
            category: 'BAR',
            quantity: 4,
            modifiers: [],
            status: 'PENDING',
            completedAt: null,
            consumed: false
          }
        ]
      };
      await db.orders.add(ticket);

      // Stage comanda (4 beers)
      await stageComandaStock(ticket);

      let item = await db.inventoryItems.get('inv-beer');
      expect(item?.reservedStock).toBe(4);
      expect(item?.availableStock).toBe(20);
      expect(item?.currentStock).toBe(24);

      // Rollback / Cancel comanda
      await releaseComandaStock('ticket-cancel-01');

      item = await db.inventoryItems.get('inv-beer');
      // Reserved stock returned to 0
      expect(item?.reservedStock).toBe(0);
      // Available stock back to full physical stock: 24
      expect(item?.availableStock).toBe(24);
      // Physical stock untouched
      expect(item?.currentStock).toBe(24);

      // Reservation marked released
      const reservations = await db.stockReservations.where('ticketId').equals('ticket-cancel-01').toArray();
      expect(reservations[0].status).toBe('released');
    });
  });
});
