// src/utils/databaseReset.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  resetOperationalData, 
  getOperationalDataStats, 
  resetOperationalStorageAndCursors, 
  STRICTLY_PRESERVED_STORAGE_KEYS 
} from './databaseReset';
import { db } from '../db/localDb';

// Mock Dexie db
vi.mock('../db/localDb', () => {
  const mockTable = () => ({
    count: vi.fn().mockResolvedValue(5),
    clear: vi.fn().mockResolvedValue(undefined)
  });

  const orders = mockTable();
  const customers = mockTable();
  const reservations = mockTable();
  const suppliers = mockTable();
  const inventoryItems = mockTable();
  const inventoryMovements = mockTable();
  const wasteLogs = mockTable();
  const stockAlerts = mockTable();
  const sync_outbox = mockTable();
  const kdsProductPrepHistory = mockTable();
  const supplierIncidents = mockTable();
  const dailyBriefings = mockTable();
  const notifications = mockTable();
  const systemSettings = mockTable();

  return {
    db: {
      orders,
      kdsOrderTickets: orders,
      customers,
      clients: customers,
      reservations,
      reservas: reservations,
      suppliers,
      inventoryItems,
      inventoryMovements,
      inventoryLogs: inventoryMovements,
      wasteLogs,
      operationalLosses: wasteLogs,
      stockAlerts,
      kdsLowStockAlertsHistory: stockAlerts,
      sync_outbox,
      domainOutbox: sync_outbox,
      kdsProductPrepHistory,
      supplierIncidents,
      dailyBriefings,
      notifications,
      systemSettings,
      transaction: vi.fn(async (_mode, _tables, callback) => {
        return callback();
      })
    }
  };
});

vi.mock('../services/syncService', () => ({
  addSyncLog: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_fs, name) => ({ path: name })),
  getDocs: vi.fn().mockResolvedValue({
    empty: false,
    docs: [
      { id: 'doc-1', ref: { path: 'orders/doc-1' } },
      { id: 'doc-2', ref: { path: 'orders/doc-2' } }
    ]
  }),
  writeBatch: vi.fn(() => ({
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../firebase', () => ({
  firestore: {}
}));

describe('databaseReset utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('STRICTLY_PRESERVED_STORAGE_KEYS', () => {
    it('contains all critical system setting and API keys', () => {
      expect(STRICTLY_PRESERVED_STORAGE_KEYS.has('foodie_groq_api_key')).toBe(true);
      expect(STRICTLY_PRESERVED_STORAGE_KEYS.has('foodie_gemini_api_key')).toBe(true);
      expect(STRICTLY_PRESERVED_STORAGE_KEYS.has('foodie_ai_provider')).toBe(true);
      expect(STRICTLY_PRESERVED_STORAGE_KEYS.has('theme')).toBe(true);
      expect(STRICTLY_PRESERVED_STORAGE_KEYS.has('foodiepos_firebase_config')).toBe(true);
      expect(STRICTLY_PRESERVED_STORAGE_KEYS.has('foodiepos_db_initialized')).toBe(true);
    });
  });

  describe('resetOperationalStorageAndCursors', () => {
    it('clears transient sync and metric keys while preserving critical keys', () => {
      localStorage.setItem('foodie_groq_api_key', 'gsk_test_123');
      localStorage.setItem('foodie_gemini_api_key', 'AIza_test_456');
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('firebase:authUser:123', '{"uid":"123"}');
      localStorage.setItem('lastSyncTimestamp_orders', '1710000000');
      localStorage.setItem('sync_cursor_inventory', 'cur_abc');
      localStorage.setItem('cached_star_dishes', '["tacos"]');

      const cleared = resetOperationalStorageAndCursors();

      expect(cleared).toContain('lastSyncTimestamp_orders');
      expect(cleared).toContain('sync_cursor_inventory');
      expect(cleared).toContain('cached_star_dishes');

      // Preserved keys
      expect(localStorage.getItem('foodie_groq_api_key')).toBe('gsk_test_123');
      expect(localStorage.getItem('foodie_gemini_api_key')).toBe('AIza_test_456');
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(localStorage.getItem('firebase:authUser:123')).toBe('{"uid":"123"}');

      // DB initialized flag should be set
      expect(localStorage.getItem('foodiepos_db_initialized')).toBe('true');
      expect(localStorage.getItem('foodiepos_seeded')).toBe('true');

      // Purge and hydration timestamps should be set
      expect(localStorage.getItem('lastSyncPullTimestamp')).toBeTruthy();
      expect(localStorage.getItem('foodiepos_last_purge_timestamp')).toBeTruthy();
    });
  });

  describe('getOperationalDataStats', () => {
    it('accurately counts operational records across all operational tables', async () => {
      const stats = await getOperationalDataStats();
      expect(stats.orders).toBe(5);
      expect(stats.customers).toBe(5);
      expect(stats.reservations).toBe(5);
      expect(stats.suppliers).toBe(5);
      expect(stats.inventoryItems).toBe(5);
      expect(stats.inventoryMovements).toBe(5);
      expect(stats.operationalLosses).toBe(5);
      expect(stats.stockAlerts).toBe(5);
      expect(stats.syncOutbox).toBe(5);
      expect(stats.prepHistory).toBe(5);
      expect(stats.totalRecords).toBe(50);
    });
  });

  describe('resetOperationalData', () => {
    it('executes atomic Dexie transaction clearing all operational tables and batch purges Cloud Firestore', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      const result = await resetOperationalData();

      expect(result.success).toBe(true);
      expect(db.transaction).toHaveBeenCalled();

      // Check operational tables were cleared
      expect(db.orders.clear).toHaveBeenCalled();
      expect(db.customers.clear).toHaveBeenCalled();
      expect(db.reservations.clear).toHaveBeenCalled();
      expect(db.suppliers.clear).toHaveBeenCalled();
      expect(db.inventoryItems.clear).toHaveBeenCalled();
      expect(db.inventoryMovements.clear).toHaveBeenCalled();
      expect(db.wasteLogs.clear).toHaveBeenCalled();
      expect(db.stockAlerts.clear).toHaveBeenCalled();
      expect(db.sync_outbox.clear).toHaveBeenCalled();
      expect(db.kdsProductPrepHistory.clear).toHaveBeenCalled();

      // Ensure systemSettings was NOT cleared
      expect(db.systemSettings.clear).not.toHaveBeenCalled();

      // Verify Cloud Firestore purge was triggered and recorded
      expect(result.cloudPurgedStats).toBeDefined();
      expect(result.cloudPurgedStats?.totalDeleted).toBeGreaterThan(0);

      // Event was dispatched
      expect(dispatchSpy).toHaveBeenCalled();
    });
  });
});
