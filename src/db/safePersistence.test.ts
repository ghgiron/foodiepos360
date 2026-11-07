import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from './localDb';
import { seedDatabase, DB_INITIALIZED_KEY } from './seedData';
import { initializeSettings, saveSystemSetting, getSystemSetting } from './settingsStore';
import { forceResyncKds } from '../services/firebaseSync';
import type { InventoryItem, Recipe, KdsOrderTicket } from '../types';

// Mock Firebase module to run purely offline-first on fake-indexeddb
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn(async () => ({
    docs: [
      {
        id: 'kds-remote-001',
        data: () => ({
          id: 'kds-remote-001',
          orderId: 'ord-remote-001',
          tableId: '5',
          paxCount: 2,
          waiterId: 'Carlos',
          comandaTime: new Date().toISOString(),
          timeLimitMinutes: 20,
          isRushHourOrder: false,
          items: [],
          overallStatus: 'PREPARANDO'
        })
      }
    ]
  })),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn()
}));

describe('Safe Persistence & Data Shielding in Dexie.js', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.menuCategories.clear();
    await db.ingredientCategories.clear();
    await db.supplyCategories.clear();
    await db.inventoryItems.clear();
    await db.recipes.clear();
    await db.systemSettings.clear();
    await db.kdsOrderTickets.clear();
    await db.domainOutbox.clear();
  });

  it('1. should seed virgin database and mark foodiepos_db_initialized in localStorage', async () => {
    expect(localStorage.getItem(DB_INITIALIZED_KEY)).toBeNull();

    await seedDatabase();

    expect(localStorage.getItem(DB_INITIALIZED_KEY)).toBe('true');
    const menuCatCount = await db.menuCategories.count();
    const inventoryCount = await db.inventoryItems.count();
    const recipesCount = await db.recipes.count();

    expect(menuCatCount).toBeGreaterThan(0);
    expect(inventoryCount).toBeGreaterThan(0);
    expect(recipesCount).toBeGreaterThan(0);
  });

  it('2. should NEVER overwrite or delete user-created categories, ingredients, and recipes on reload or seedDatabase call', async () => {
    // Simulate user having custom data
    const customMenuCat = { id: 'cat-menu-user-custom', name: 'Cocina Molecular' };
    await db.menuCategories.put(customMenuCat);

    const customIngredient: InventoryItem = {
      id: 'ins-custom-001',
      name: 'Trufa Negra Fresca',
      category: 'Abarrotes',
      purchaseUnit: 'Gramo',
      countUnit: 'g',
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      purchaseCost: 15000,
      gainPercentage: 200,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: 10,
      theoreticalStock: 100,
      realPhysicalStock: 100,
      abcClassification: 'A',
      supplierId: 'prov-diageo-colombia',
      sucursalStock: [],
      updatedAt: new Date().toISOString()
    };
    await db.inventoryItems.put(customIngredient);

    const customRecipe: Recipe = {
      id: 'rec-custom-001',
      name: 'Risotto de Trufa Negra',
      description: 'Risotto cremoso con trufa fresca',
      category: 'KITCHEN',
      sellPrice: 85000,
      costPrice: 25000,
      yieldFactor: 1.0,
      cmvPercentage: 29.4,
      bcgClassification: 'ESTRELLA',
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: 'ins-custom-001', type: 'item', quantity: 20, unit: 'g' }
      ],
      mostrar_en_catalogo: true,
      productionZone: 'Cocina',
      updatedAt: new Date().toISOString()
    };
    await db.recipes.put(customRecipe);

    // Call seedDatabase (as if user reloaded the page)
    await seedDatabase();

    // Verify user's custom records are perfectly intact
    const fetchedMenuCat = await db.menuCategories.get('cat-menu-user-custom');
    expect(fetchedMenuCat).toBeDefined();
    expect(fetchedMenuCat?.name).toBe('Cocina Molecular');

    const fetchedIng = await db.inventoryItems.get('ins-custom-001');
    expect(fetchedIng).toBeDefined();
    expect(fetchedIng?.name).toBe('Trufa Negra Fresca');

    const fetchedRecipe = await db.recipes.get('rec-custom-001');
    expect(fetchedRecipe).toBeDefined();
    expect(fetchedRecipe?.name).toBe('Risotto de Trufa Negra');

    // And verify localStorage flag is maintained
    expect(localStorage.getItem(DB_INITIALIZED_KEY)).toBe('true');
  });

  it('3. should preserve user-modified system settings without restoring deleted defaults', async () => {
    // User saves customized categories list with only 2 categories
    const userCategories = ['Tacos', 'Burritos'];
    await saveSystemSetting('master_categories', userCategories);

    // Re-run initializeSettings (simulating subsequent app initialization)
    await initializeSettings();

    const storedCategories = await getSystemSetting<string[]>('master_categories');
    expect(storedCategories).toEqual(['Tacos', 'Burritos']);
  });

  it('4. should merge remote Firebase tickets during resync without deleting local offline tickets', async () => {
    // Create a local offline ticket
    const localTicket: KdsOrderTicket = {
      id: 'kds-local-offline-001',
      orderId: 'ord-local-offline-001',
      tableId: 3,
      paxCount: 2,
      waiterId: 'Andres',
      comandaTime: new Date().toISOString(),
      timeLimitMinutes: 15,
      isRushHourOrder: false,
      items: [],
      overallStatus: 'PREPARANDO'
    };
    await db.kdsOrderTickets.put(localTicket);

    // Run force resync with simulated remote
    await forceResyncKds();

    // Check that BOTH the remote ticket and the local offline ticket exist
    const localTicketCheck = await db.kdsOrderTickets.get('kds-local-offline-001');
    expect(localTicketCheck).toBeDefined();
    expect(localTicketCheck?.id).toBe('kds-local-offline-001');

    const remoteTicketCheck = await db.kdsOrderTickets.get('kds-remote-001');
    expect(remoteTicketCheck).toBeDefined();
    expect(remoteTicketCheck?.id).toBe('kds-remote-001');
  });

  it('5. should queue offline actions in DomainOutbox when offline and sync them when processing outbox', async () => {
    const { syncRecordToFirestore, processDomainOutbox } = await import('../services/syncService');
    
    // Simulate offline state
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    // Sync a category while offline
    await syncRecordToFirestore('menuCategories', 'cat-test-offline-1', {
      id: 'cat-test-offline-1',
      name: 'Tapas Españolas'
    });

    // Check it is saved in local Dexie immediately
    const localCat = await db.menuCategories.get('cat-test-offline-1');
    expect(localCat).toBeDefined();
    expect(localCat?.name).toBe('Tapas Españolas');

    // Check it was enqueued in DomainOutbox
    const pendingEvents = await db.domainOutbox.where('status').equals('PENDING').toArray();
    expect(pendingEvents.length).toBeGreaterThan(0);
    const syncEvent = pendingEvents.find(e => e.payload?.docId === 'cat-test-offline-1');
    expect(syncEvent).toBeDefined();
    expect(syncEvent?.eventType).toBe('RecordUpdated');

    // Restore online state and process outbox
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await processDomainOutbox();

    const remainingPending = await db.domainOutbox.where('status').equals('PENDING').toArray();
    expect(remainingPending.length).toBe(0);

    // Restore original navigator state
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
  });
});

