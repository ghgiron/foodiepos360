// src/utils/databaseReset.ts
import { db } from '../db/localDb';
import { addSyncLog } from '../services/syncService';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { firestore } from '../firebase';

export interface DatabaseResetStats {
  orders: number;
  customers: number;
  reservations: number;
  suppliers: number;
  inventoryItems: number;
  inventoryMovements: number;
  operationalLosses: number;
  stockAlerts: number;
  syncOutbox: number;
  prepHistory: number;
  totalRecords: number;
}

export interface DatabaseResetResult {
  success: boolean;
  timestamp: string;
  clearedStats: DatabaseResetStats;
  clearedStorageKeys: string[];
  cloudPurgedStats?: {
    totalDeleted: number;
    perCollection: Record<string, number>;
  };
  error?: string;
}

/**
 * Transactional and operational collections in Cloud Firestore to purge.
 * STRICTLY PRESERVES systemSettings, branches, menuCategories, ingredientCategories, supplyCategories.
 */
export const FIRESTORE_OPERATIONAL_COLLECTIONS = [
  'orders',
  'orderItems',
  'clients',
  'customers',
  'suppliers',
  'kdsOrderTickets',
  'kdsTickets',
  'comandas',
  'reservas',
  'reservations',
  'inventoryMovements',
  'inventoryLogs',
  'operationalLosses',
  'wasteLogs',
  'kdsLowStockAlertsHistory',
  'stockAlerts',
  'kdsProductPrepHistory',
  'supplierIncidents',
  'dailyBriefings',
  'notifications',
  'inventoryItems'
] as const;

/**
 * Executes a chunked batch delete across all operational/transactional Firestore collections in the cloud,
 * while strictly safeguarding systemSettings, branches, and master configurations.
 */
export async function purgeFirestoreOperationalCollections(): Promise<{
  success: boolean;
  totalDeleted: number;
  perCollection: Record<string, number>;
  error?: string;
}> {
  const perCollection: Record<string, number> = {};
  let totalDeleted = 0;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      success: false,
      totalDeleted: 0,
      perCollection: {},
      error: 'Navegador sin conexión a internet (purga en la nube omitida)'
    };
  }

  if (!firestore) {
    return {
      success: true,
      totalDeleted: 0,
      perCollection: {}
    };
  }

  try {
    for (const collName of FIRESTORE_OPERATIONAL_COLLECTIONS) {
      try {
        const collRef = collection(firestore, collName);
        const snapshot = await getDocs(collRef);
        if (snapshot.empty) {
          perCollection[collName] = 0;
          continue;
        }

        // Firestore batch delete max 400 docs per chunk (safe limit below 500)
        const docs = snapshot.docs;
        const chunkSize = 400;
        let collDeletedCount = 0;

        for (let i = 0; i < docs.length; i += chunkSize) {
          const chunk = docs.slice(i, i + chunkSize);
          const batch = writeBatch(firestore);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
          collDeletedCount += chunk.length;
        }

        perCollection[collName] = collDeletedCount;
        totalDeleted += collDeletedCount;
      } catch (collErr: any) {
        console.warn(`[databaseReset] Could not purge Firestore collection "${collName}":`, collErr?.message || collErr);
        perCollection[collName] = 0;
      }
    }

    return {
      success: true,
      totalDeleted,
      perCollection
    };
  } catch (err: any) {
    console.error('[databaseReset] General error purging Firestore:', err);
    return {
      success: false,
      totalDeleted,
      perCollection,
      error: err?.message || String(err)
    };
  }
}

/**
 * Keys strictly preserved in localStorage.
 * Under NO circumstance should these be touched during operational purge:
 * - API keys (Groq & Gemini)
 * - Provider selection & voice feedback settings
 * - System theme
 * - Custom Firebase configurations
 * - Database initialization flag (to avoid auto-reseeding legacy mocks)
 * - Authentication sessions and user tokens
 */
export const STRICTLY_PRESERVED_STORAGE_KEYS = new Set<string>([
  'foodie_groq_api_key',
  'foodie_gemini_api_key',
  'foodie_ai_provider',
  'foodie_voice_copilot_voice_enabled',
  'theme',
  'foodiepos_firebase_config',
  'foodiepos_db_initialized',
  'foodiepos_seeded'
]);

/**
 * Reads live counts of all operational and test records currently stored in Dexie.
 */
export async function getOperationalDataStats(): Promise<DatabaseResetStats> {
  const ordersTable = db.orders || db.kdsOrderTickets;
  const customersTable = db.customers || db.clients;
  const reservationsTable = db.reservations || db.reservas;
  const suppliersTable = db.suppliers;
  const inventoryTable = db.inventoryItems;
  const movementsTable = db.inventoryMovements || db.inventoryLogs;
  const wasteTable = db.wasteLogs || db.operationalLosses;
  const alertsTable = db.stockAlerts || db.kdsLowStockAlertsHistory;
  const syncOutboxTable = db.sync_outbox || db.domainOutbox;
  const prepTable = db.kdsProductPrepHistory;

  const [
    orders,
    customers,
    reservations,
    suppliers,
    inventoryItems,
    inventoryMovements,
    operationalLosses,
    stockAlerts,
    syncOutbox,
    prepHistory
  ] = await Promise.all([
    ordersTable?.count ? ordersTable.count().catch(() => 0) : Promise.resolve(0),
    customersTable?.count ? customersTable.count().catch(() => 0) : Promise.resolve(0),
    reservationsTable?.count ? reservationsTable.count().catch(() => 0) : Promise.resolve(0),
    suppliersTable?.count ? suppliersTable.count().catch(() => 0) : Promise.resolve(0),
    inventoryTable?.count ? inventoryTable.count().catch(() => 0) : Promise.resolve(0),
    movementsTable?.count ? movementsTable.count().catch(() => 0) : Promise.resolve(0),
    wasteTable?.count ? wasteTable.count().catch(() => 0) : Promise.resolve(0),
    alertsTable?.count ? alertsTable.count().catch(() => 0) : Promise.resolve(0),
    syncOutboxTable?.count ? syncOutboxTable.count().catch(() => 0) : Promise.resolve(0),
    prepTable?.count ? prepTable.count().catch(() => 0) : Promise.resolve(0)
  ]);

  const totalRecords =
    orders +
    customers +
    reservations +
    suppliers +
    inventoryItems +
    inventoryMovements +
    operationalLosses +
    stockAlerts +
    syncOutbox +
    prepHistory;

  return {
    orders,
    customers,
    reservations,
    suppliers,
    inventoryItems,
    inventoryMovements,
    operationalLosses,
    stockAlerts,
    syncOutbox,
    prepHistory,
    totalRecords
  };
}

/**
 * Clears sync cursors, rotation metrics and cached operational summaries from localStorage,
 * while strictly preserving system settings, API keys and authentication.
 */
export function resetOperationalStorageAndCursors(): string[] {
  const clearedKeys: string[] = [];
  if (typeof window === 'undefined' || !window.localStorage) {
    return clearedKeys;
  }

  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Guard: Never touch strictly preserved system credentials or auth
    if (
      STRICTLY_PRESERVED_STORAGE_KEYS.has(key) ||
      key.startsWith('firebase:authUser') ||
      key.toLowerCase().includes('auth') ||
      key.toLowerCase().includes('token')
    ) {
      continue;
    }

    // Match sync cursors, preparation metrics, star dishes counters and temporary turnover caches
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('lastsync') ||
      lowerKey.includes('last_sync') ||
      lowerKey.includes('synctimestamp') ||
      lowerKey.includes('sync_cursor') ||
      lowerKey.includes('stardishes') ||
      lowerKey.includes('star_dishes') ||
      lowerKey.includes('rotation') ||
      lowerKey.includes('rotacion') ||
      lowerKey.includes('preptime') ||
      lowerKey.includes('operational_cache')
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(k => {
    localStorage.removeItem(k);
    clearedKeys.push(k);
  });

  // Ensure DB initialized flag is firmly persisted so the application does not repopulate mock seed data
  localStorage.setItem('foodiepos_db_initialized', 'true');
  localStorage.setItem('foodiepos_seeded', 'true');

  // Reset lastSyncPullTimestamp and purge timestamp to prevent re-hydrating purged records
  const purgeTimestamp = new Date().toISOString();
  localStorage.setItem('lastSyncPullTimestamp', purgeTimestamp);
  localStorage.setItem('foodiepos_last_purge_timestamp', purgeTimestamp);
  clearedKeys.push('lastSyncPullTimestamp (reset to purge time)');

  return clearedKeys;
}

/**
 * Atomic reset and deep purge of all operational/test data in Dexie.js and Cloud Firestore.
 * 
 * CLEARS:
 * - Orders / KDS Tickets (db.orders / db.kdsOrderTickets)
 * - Order items (if standalone store exists)
 * - Clients / Customers (db.customers / db.clients)
 * - Reservations (db.reservations / db.reservas)
 * - Suppliers (db.suppliers)
 * - Inventory items (db.inventoryItems)
 * - Inventory Kardex & Movements (db.inventoryMovements / db.inventoryLogs)
 * - Operational Losses & Waste Logs (db.wasteLogs / db.operationalLosses)
 * - Low stock alert history (db.stockAlerts / db.kdsLowStockAlertsHistory)
 * - Outbox mutations (db.sync_outbox / db.domainOutbox)
 * - Product preparation history (db.kdsProductPrepHistory)
 * - Supplier incidents (db.supplierIncidents)
 * - Daily briefings (db.dailyBriefings)
 * - Notifications (db.notifications)
 * - Cloud Firestore collections (orders, orderItems, clients, suppliers, kdsOrderTickets, etc.)
 * 
 * STRICTLY PRESERVES:
 * - systemSettings (API keys Groq/Gemini, tax rates, margins, thresholds)
 * - SSoT branches (branches defined in Malibu Gastrobar settings)
 * - Master menu categories & allergens
 * - Local authentication & session tokens
 */
export async function resetOperationalData(): Promise<DatabaseResetResult> {
  const timestamp = new Date().toISOString();

  try {
    // 1. Capture record stats before wiping
    const clearedStats = await getOperationalDataStats();

    const ordersTable = db.orders || db.kdsOrderTickets;
    const customersTable = db.customers || db.clients;
    const reservationsTable = db.reservations || db.reservas;
    const suppliersTable = db.suppliers;
    const inventoryTable = db.inventoryItems;
    const movementsTable = db.inventoryMovements || db.inventoryLogs;
    const wasteTable = db.wasteLogs || db.operationalLosses;
    const alertsTable = db.stockAlerts || db.kdsLowStockAlertsHistory;
    const syncOutboxTable = db.sync_outbox || db.domainOutbox;
    const prepTable = db.kdsProductPrepHistory;
    const supplierIncidentsTable = db.supplierIncidents;
    const dailyBriefingsTable = db.dailyBriefings;
    const notificationsTable = db.notifications;

    // 2. Define tables participating in the atomic read/write transaction
    const targetTables = [
      ordersTable,
      customersTable,
      reservationsTable,
      suppliersTable,
      inventoryTable,
      movementsTable,
      wasteTable,
      alertsTable,
      syncOutboxTable,
      prepTable,
      supplierIncidentsTable,
      dailyBriefingsTable,
      notificationsTable
    ].filter(Boolean);

    // 3. Execute atomic transaction
    await db.transaction('rw', targetTables, async () => {
      const clears: Promise<any>[] = [];
      targetTables.forEach(t => {
        if (t && typeof (t as any).clear === 'function') {
          clears.push((t as any).clear());
        }
      });
      if ((db as any).orderItems && typeof (db as any).orderItems.clear === 'function') {
        clears.push((db as any).orderItems.clear());
      }
      await Promise.all(clears);
    });

    // 4. Reset in-memory / storage sync cursors and temporary metric caches
    const clearedStorageKeys = resetOperationalStorageAndCursors();

    // 5. Cloud Deep Purge in Firebase Firestore (Batch Delete)
    let cloudPurgedStats: { totalDeleted: number; perCollection: Record<string, number> } | undefined;
    try {
      const cloudRes = await purgeFirestoreOperationalCollections();
      cloudPurgedStats = {
        totalDeleted: cloudRes.totalDeleted,
        perCollection: cloudRes.perCollection
      };
      if (cloudRes.totalDeleted > 0) {
        addSyncLog(
          'SUCCESS',
          `Purga en la nube Firestore completada: ${cloudRes.totalDeleted} documentos eliminados.`
        );
      }
    } catch (cloudErr: any) {
      console.warn('[databaseReset] Cloud purge warning:', cloudErr);
      addSyncLog(
        'WARNING',
        `No se pudo completar la purga en Firestore: ${cloudErr?.message || cloudErr}`
      );
    }

    // 6. Audit log in sync service
    try {
      addSyncLog(
        'WARNING',
        `Purga profunda ejecutada: ${clearedStats.totalRecords} registros locales ${
          cloudPurgedStats?.totalDeleted ? `y ${cloudPurgedStats.totalDeleted} en la nube Firestore` : ''
        } eliminados.`
      );
    } catch {}

    // 7. Dispatch global event for reactive components / stores
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('foodiepos:operational-reset', {
          detail: {
            timestamp,
            clearedStats,
            clearedStorageKeys,
            cloudPurgedStats
          }
        })
      );
    }

    return {
      success: true,
      timestamp,
      clearedStats,
      clearedStorageKeys,
      cloudPurgedStats
    };
  } catch (error: any) {
    console.error('[databaseReset] Error executing resetOperationalData:', error);
    return {
      success: false,
      timestamp,
      clearedStats: {
        orders: 0,
        customers: 0,
        reservations: 0,
        suppliers: 0,
        inventoryItems: 0,
        inventoryMovements: 0,
        operationalLosses: 0,
        stockAlerts: 0,
        syncOutbox: 0,
        prepHistory: 0,
        totalRecords: 0
      },
      clearedStorageKeys: [],
      error: error?.message || String(error)
    };
  }
}
