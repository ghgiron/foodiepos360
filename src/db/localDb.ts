// src/db/localDb.ts
import Dexie, { type Table } from 'dexie';
import type {
  InventoryItem,
  Recipe,
  DailyBriefing,
  KdsOrderTicket,
  DomainOutbox,
  LoyaltyPlan,
  PromotionBook,
  OutboxStatus,
  GlobalConfig,
  Allergen,
  SystemSetting,
  FixedAsset,
  DamageReport,
  Supplier,
  OperationalLoss,
  SupplierIncident,
  InventoryLog,
  Client,
  Reservation,
  NotificationTrigger,
  KdsProductPrepHistory,
  KdsLowStockAlertsHistory,
  StockReservation
} from '../types';

/**
 * Dexie.js IndexedDB class representing the local database schema.
 * Ensures resiliency and offline-first single source of truth.
 */
export class FoodiePOSDatabase extends Dexie {
  inventoryItems!: Table<InventoryItem, string>;
  recipes!: Table<Recipe, string>;
  dailyBriefings!: Table<DailyBriefing, string>;
  kdsOrderTickets!: Table<KdsOrderTicket, string>;
  domainOutbox!: Table<DomainOutbox, string>;
  loyaltyPlans!: Table<LoyaltyPlan, string>;
  promotionBooks!: Table<PromotionBook, string>;
  globalConfigs!: Table<GlobalConfig, string>;
  allergens!: Table<Allergen, string>;
  systemSettings!: Table<SystemSetting, string>;
  fixedAssets!: Table<FixedAsset, string>;
  assetDamageReports!: Table<DamageReport, string>;
  suppliers!: Table<Supplier, string>;
  menuCategories!: Table<{ id: string; name: string }, string>;
  ingredientCategories!: Table<{ id: string; name: string }, string>;
  supplyCategories!: Table<{ id: string; name: string }, string>;
  operationalLosses!: Table<OperationalLoss, string>;
  supplierIncidents!: Table<SupplierIncident, string>;
  inventoryLogs!: Table<InventoryLog, string>;
  clients!: Table<Client, string>;
  reservas!: Table<Reservation, string>;
  notifications!: Table<NotificationTrigger, string>;
  kdsProductPrepHistory!: Table<KdsProductPrepHistory, string>;
  kdsLowStockAlertsHistory!: Table<KdsLowStockAlertsHistory, string>;
  stockReservations!: Table<StockReservation, string>;

  get reservations(): Table<Reservation, string> {
    return this.reservas;
  }

  get categories(): Table<{ id: string; name: string }, string> {
    return this.ingredientCategories;
  }

  get orders(): Table<KdsOrderTicket, string> {
    return this.kdsOrderTickets;
  }

  get customers(): Table<Client, string> {
    return this.clients;
  }

  get inventoryMovements(): Table<InventoryLog, string> {
    return this.inventoryLogs;
  }

  get wasteLogs(): Table<OperationalLoss, string> {
    return this.operationalLosses;
  }

  get stockAlerts(): Table<KdsLowStockAlertsHistory, string> {
    return this.kdsLowStockAlertsHistory;
  }

  get sync_outbox(): Table<DomainOutbox, string> {
    return this.domainOutbox;
  }

  constructor() {
    super('FoodiePOSDatabase');
    
    // Define the schema. The first field is the primary key.
    // Subsequent fields are indexed columns for fast queries/filters.
    this.version(8).stores({
      inventoryItems: 'id, category, abcClassification, supplierId, updatedAt',
      recipes: 'id, category, bcgClassification, isSubRecipe, updatedAt',
      dailyBriefings: 'id, date, briefingLeaderId, completedAt',
      kdsOrderTickets: 'id, orderId, tableId, waiterId, overallStatus, comandaTime',
      domainOutbox: 'eventId, eventType, status, createdAt, syncedAt',
      loyaltyPlans: 'id, createdAt',
      promotionBooks: 'id, sucursalId, isActive, updatedAt',
      globalConfigs: 'key',
      allergens: 'name',
      systemSettings: 'key',
      fixedAssets: 'id, name, category, location, status, nextMaintenanceDate',
      assetDamageReports: 'id, assetId, severity, createdAt',
      suppliers: 'id, name, email',
      menuCategories: 'id, name',
      ingredientCategories: 'id, name',
      supplyCategories: 'id, name',
      operationalLosses: 'id, ticketId, recipeId, reason, cancelledAt',
      supplierIncidents: 'id, supplierId, itemId, quality, recordedAt',
      inventoryLogs: 'id, itemId, type, reason, timestamp',
      clients: 'id, name, phone, taxId, createdAt',
      reservations: 'id, tableId, clientId, date, status',
      notifications: 'id, type, targetId, scheduledAt, status'
    });

    this.version(9).stores({
      inventoryItems: 'id, category, abcClassification, supplierId, updatedAt',
      recipes: 'id, category, bcgClassification, isSubRecipe, updatedAt',
      dailyBriefings: 'id, date, briefingLeaderId, completedAt',
      kdsOrderTickets: 'id, orderId, tableId, waiterId, overallStatus, comandaTime',
      domainOutbox: 'eventId, eventType, status, createdAt, syncedAt',
      loyaltyPlans: 'id, createdAt',
      promotionBooks: 'id, sucursalId, isActive, updatedAt',
      globalConfigs: 'key',
      allergens: 'name',
      systemSettings: 'key',
      fixedAssets: 'id, name, category, location, status, nextMaintenanceDate',
      assetDamageReports: 'id, assetId, severity, createdAt',
      suppliers: 'id, name, email',
      menuCategories: 'id, name',
      ingredientCategories: 'id, name',
      supplyCategories: 'id, name',
      operationalLosses: 'id, ticketId, recipeId, reason, cancelledAt',
      supplierIncidents: 'id, supplierId, itemId, quality, recordedAt',
      inventoryLogs: 'id, itemId, type, reason, timestamp',
      clients: 'id, name, phone, taxId, createdAt',
      reservas: 'id, tableId, clientId, date, status',
      reservations: null,
      notifications: 'id, type, targetId, scheduledAt, status'
    }).upgrade(async (tx) => {
      try {
        const oldReservations = await tx.table('reservations').toArray();
        if (oldReservations && oldReservations.length > 0) {
          await tx.table('reservas').bulkAdd(oldReservations);
          console.log(`Migrated ${oldReservations.length} reservations to 'reservas' store.`);
        }
      } catch (err) {
        console.error('Error migrating reservations data during Dexie upgrade:', err);
      }
    });

    this.version(10).stores({
      inventoryItems: 'id, category, abcClassification, supplierId, updatedAt',
      recipes: 'id, category, bcgClassification, isSubRecipe, updatedAt',
      dailyBriefings: 'id, date, briefingLeaderId, completedAt',
      kdsOrderTickets: 'id, orderId, tableId, waiterId, overallStatus, comandaTime',
      domainOutbox: 'eventId, eventType, status, createdAt, syncedAt',
      loyaltyPlans: 'id, createdAt',
      promotionBooks: 'id, sucursalId, isActive, updatedAt',
      globalConfigs: 'key',
      allergens: 'name',
      systemSettings: 'key',
      fixedAssets: 'id, name, category, location, status, nextMaintenanceDate',
      assetDamageReports: 'id, assetId, severity, createdAt',
      suppliers: 'id, name, email',
      menuCategories: 'id, name',
      ingredientCategories: 'id, name',
      supplyCategories: 'id, name',
      operationalLosses: 'id, ticketId, recipeId, reason, cancelledAt',
      supplierIncidents: 'id, supplierId, itemId, quality, recordedAt',
      inventoryLogs: 'id, itemId, type, reason, timestamp',
      clients: 'id, name, phone, taxId, createdAt',
      reservas: 'id, tableId, clientId, date, status',
      notifications: 'id, type, targetId, scheduledAt, status',
      kdsProductPrepHistory: 'id, ticketId, recipeId, station, comandaTime, prepCompletedAt, wasEfficient',
      kdsLowStockAlertsHistory: 'id, timestamp, productId, station'
    });

    this.version(11).stores({
      inventoryItems: 'id, category, abcClassification, supplierId, updatedAt, operationZone, operationalZone',
      recipes: 'id, category, bcgClassification, isSubRecipe, updatedAt',
      dailyBriefings: 'id, date, briefingLeaderId, completedAt',
      kdsOrderTickets: 'id, orderId, tableId, waiterId, overallStatus, comandaTime',
      domainOutbox: 'eventId, eventType, status, createdAt, syncedAt',
      loyaltyPlans: 'id, createdAt',
      promotionBooks: 'id, sucursalId, isActive, updatedAt',
      globalConfigs: 'key',
      allergens: 'name',
      systemSettings: 'key',
      fixedAssets: 'id, name, category, location, status, nextMaintenanceDate',
      assetDamageReports: 'id, assetId, severity, createdAt',
      suppliers: 'id, name, email',
      menuCategories: 'id, name',
      ingredientCategories: 'id, name',
      supplyCategories: 'id, name',
      operationalLosses: 'id, ticketId, recipeId, reason, cancelledAt',
      supplierIncidents: 'id, supplierId, itemId, quality, recordedAt',
      inventoryLogs: 'id, itemId, type, reason, timestamp',
      clients: 'id, name, phone, taxId, createdAt',
      reservas: 'id, tableId, clientId, date, status',
      notifications: 'id, type, targetId, scheduledAt, status',
      kdsProductPrepHistory: 'id, ticketId, recipeId, station, comandaTime, prepCompletedAt, wasEfficient',
      kdsLowStockAlertsHistory: 'id, timestamp, productId, station'
    });

    this.version(12).stores({
      inventoryItems: 'id, category, abcClassification, supplierId, updatedAt, operationZone, operationalZone',
      recipes: 'id, category, bcgClassification, isSubRecipe, updatedAt',
      dailyBriefings: 'id, date, briefingLeaderId, completedAt',
      kdsOrderTickets: 'id, orderId, tableId, waiterId, overallStatus, comandaTime',
      domainOutbox: 'eventId, eventType, status, createdAt, syncedAt',
      loyaltyPlans: 'id, createdAt',
      promotionBooks: 'id, sucursalId, isActive, updatedAt',
      globalConfigs: 'key',
      allergens: 'name',
      systemSettings: 'key',
      fixedAssets: 'id, name, category, location, status, nextMaintenanceDate',
      assetDamageReports: 'id, assetId, severity, createdAt',
      suppliers: 'id, name, email',
      menuCategories: 'id, name',
      ingredientCategories: 'id, name',
      supplyCategories: 'id, name',
      operationalLosses: 'id, ticketId, recipeId, reason, cancelledAt',
      supplierIncidents: 'id, supplierId, itemId, quality, recordedAt',
      inventoryLogs: 'id, itemId, type, reason, timestamp',
      clients: 'id, name, phone, taxId, createdAt',
      reservas: 'id, tableId, clientId, date, status',
      notifications: 'id, type, targetId, scheduledAt, status',
      kdsProductPrepHistory: 'id, ticketId, recipeId, station, comandaTime, prepCompletedAt, wasEfficient',
      kdsLowStockAlertsHistory: 'id, timestamp, productId, station',
      stockReservations: 'id, orderId, ticketId, itemId, status, timestamp'
    }).upgrade(async (tx) => {
      try {
        const items = await tx.table('inventoryItems').toArray();
        for (const item of items) {
          const current = item.currentStock !== undefined 
            ? item.currentStock 
            : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0));
          const reserved = item.reservedStock !== undefined ? item.reservedStock : 0;
          await tx.table('inventoryItems').update(item.id, {
            currentStock: current,
            reservedStock: reserved,
            availableStock: Math.max(0, current - reserved)
          });
        }
        console.log(`[localDb] Upgraded ${items.length} inventoryItems with two-phase staging fields.`);
      } catch (err) {
        console.error('Error during Dexie version 12 upgrade:', err);
      }
    });

    console.log('[localDb] Tables configured in constructor:', this.tables.map(t => t.name));

    this.on('populate', () => {
      console.log('[localDb] Populate event triggered: database is created from scratch');
    });
  }
}

// Instantiate the singleton database connection
export const db = new FoodiePOSDatabase();

/**
 * HELPER OPERATIONS & OFFLINE-FIRST UTILITIES
 */

/**
 * Enqueues a domain event to the Domain Outbox table to be processed when online.
 * @param eventType Type of the domain event (e.g. 'OrderPaid', 'InventoryItemUpdated')
 * @param payload Event-specific payload conforming to domain types
 */
export async function enqueueOfflineEvent<T>(
  eventType: string,
  payload: T
): Promise<string> {
  const eventId = `evt-${eventType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  const event: DomainOutbox = {
    eventId,
    eventType,
    payload,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    syncedAt: null
  };

  await db.domainOutbox.put(event);
  return eventId;
}

/**
 * Fetches all offline events currently waiting to be synchronized (FIFO order).
 */
export async function getPendingOfflineEvents(): Promise<DomainOutbox[]> {
  return await db.domainOutbox
    .where('status')
    .equals('PENDING')
    .sortBy('createdAt');
}

/**
 * Updates the sync status of an outbox event.
 * @param eventId The event identifier
 * @param status Synchronization status
 */
export async function updateEventStatus(
  eventId: string,
  status: OutboxStatus
): Promise<void> {
  const event = await db.domainOutbox.get(eventId);
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found in outbox.`);
  }

  const updates: Partial<DomainOutbox> = {
    status,
    syncedAt: status === 'COMPLETED' ? new Date().toISOString() : null
  };

  await db.domainOutbox.update(eventId, updates);
}

/**
 * Helper to update physical inventory items and record stockout status.
 * Automatically checks for stock limits and triggers alerts if necessary.
 * @param itemId The inventory item ID
 * @param newPhysicalQty Measured physical stock
 */
export async function recordPhysicalCount(
  itemId: string,
  newPhysicalQty: number
): Promise<void> {
  const item = await db.inventoryItems.get(itemId);
  if (!item) {
    throw new Error(`Inventory item with ID ${itemId} not found.`);
  }

  const previousQty = item.realPhysicalStock;
  
  await db.inventoryItems.update(itemId, {
    realPhysicalStock: newPhysicalQty,
    updatedAt: new Date().toISOString()
  });

  // Enqueue a Domain Event for the stock mutation sync
  await enqueueOfflineEvent('InventoryItemUpdated', {
    itemId,
    action: 'ADJUSTMENT',
    quantityChanged: newPhysicalQty - previousQty,
    newTheoreticalStock: item.theoreticalStock,
    newRealPhysicalStock: newPhysicalQty,
    updatedAt: new Date().toISOString()
  });
}
