// src/test/syncHydration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getSyncStatus, 
  setSyncStatus, 
  subscribeSyncStatus,
  addSyncLog,
  getSyncLogs,
  getDetailedSyncComparison,
  pullDataFromFirestore,
  pushDataToFirestore,
  deleteRecordFromFirestore,
  getActiveTombstoneIds,
  sanitizeForFirestore,
  SYNC_COLLECTIONS
} from '../services/syncService';
import { db } from '../db/localDb';
import {
  getFirebaseConfig,
  saveFirebaseConfig,
  resetFirebaseConfig,
  checkFirestoreHealth
} from '../config/firebaseConfig';

describe('Bidirectional Sync & Hydration Engine (Firestore <-> Dexie.js)', () => {
  beforeEach(async () => {
    // Reset status for test
    setSyncStatus('SYNCHRONIZED');
  });

  it('1. should provide reactive sync status updates and listeners', () => {
    let capturedStatus = '';
    const unsub = subscribeSyncStatus((info) => {
      capturedStatus = info.status;
    });

    expect(capturedStatus).toBe('SYNCHRONIZED');

    setSyncStatus('SYNCING');
    expect(getSyncStatus().status).toBe('SYNCING');
    expect(capturedStatus).toBe('SYNCING');

    setSyncStatus('OFFLINE');
    expect(getSyncStatus().status).toBe('OFFLINE');
    expect(capturedStatus).toBe('OFFLINE');

    unsub();
  });

  it('2. should manage circular log buffer for live diagnostics terminal', () => {
    addSyncLog('INFO', 'Test info log message');
    addSyncLog('SUCCESS', 'Test success log message');
    addSyncLog('WARNING', 'Test warning log message');

    const logs = getSyncLogs();
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs[0].message).toBe('Test warning log message');
    expect(logs[0].type).toBe('WARNING');
    expect(logs[1].type).toBe('SUCCESS');
  });

  it('3. should generate detailed sync comparison matrix for all master entities', async () => {
    const comparison = await getDetailedSyncComparison();
    expect(Array.isArray(comparison)).toBe(true);
    expect(comparison.length).toBe(SYNC_COLLECTIONS.length);

    const inventoryEntry = comparison.find(c => c.tableName === 'inventoryItems');
    expect(inventoryEntry).toBeDefined();
    expect(inventoryEntry?.collectionName).toBe('inventoryItems');
    expect(typeof inventoryEntry?.localCount).toBe('number');
    expect(['IN_SYNC', 'LOCAL_AHEAD', 'REMOTE_AHEAD', 'EMPTY', 'ERROR']).toContain(inventoryEntry?.status);
  }, 15000);

  it('4. should handle pullDataFromFirestore safely in test environment', async () => {
    const stats = await pullDataFromFirestore({ logActivity: false });
    expect(typeof stats.totalPulled).toBe('number');
    expect(typeof stats.durationMs).toBe('number');
    expect(typeof stats.success).toBe('boolean');
  }, 15000);

  it('5. should handle pushDataToFirestore safely in test environment', async () => {
    const stats = await pushDataToFirestore({ logActivity: false });
    expect(typeof stats.totalPushed).toBe('number');
    expect(typeof stats.durationMs).toBe('number');
    expect(typeof stats.success).toBe('boolean');
  }, 15000);

  it('6. should read and save dynamic Firebase configuration', () => {
    const original = getFirebaseConfig();
    expect(original.projectId).toBeDefined();

    saveFirebaseConfig({ projectId: 'test-custom-pos' });
    expect(getFirebaseConfig().projectId).toBe('test-custom-pos');

    resetFirebaseConfig();
    expect(getFirebaseConfig().projectId).toBe(original.projectId);
  });

  it('7. should execute health check diagnostic ping against Firestore', async () => {
    const result = await checkFirestoreHealth();
    expect(typeof result.ok).toBe('boolean');
    expect(typeof result.projectId).toBe('string');
    expect(typeof result.latencyMs).toBe('number');
    expect(typeof result.message).toBe('string');
  });

  it('8. should sanitize undefined fields before serializing to Firestore', () => {
    const dirtyData = {
      id: 'item-1',
      name: 'Tomate Chonto',
      fechaVencimiento: undefined,
      cost: 2500,
      nested: {
        unit: 'kg',
        optionalField: undefined
      },
      tags: ['fresco', undefined, 'vegetal']
    };

    const clean = sanitizeForFirestore(dirtyData);
    expect(clean.fechaVencimiento).toBeUndefined();
    expect('fechaVencimiento' in clean).toBe(false);
    expect(clean.name).toBe('Tomate Chonto');
    expect(clean.nested.unit).toBe('kg');
    expect('optionalField' in clean.nested).toBe(false);
    expect(clean.tags).toEqual(['fresco', 'vegetal']);
  });

  it('9. should register Tombstones in domainOutbox and prevent resurrection on pull', async () => {
    const testItemId = 'ins-tombstone-test-01';

    // Seed test item locally
    await db.inventoryItems.put({
      id: testItemId,
      name: 'Producto Prueba Tombstone',
      theoreticalStock: 10,
      costPrice: 5000,
      countUnit: 'kg'
    } as any);

    // Delete item via deleteRecordFromFirestore
    await deleteRecordFromFirestore('inventoryItems', testItemId);

    // Check item is deleted locally
    const checkItem = await db.inventoryItems.get(testItemId);
    expect(checkItem).toBeUndefined();

    // Check Tombstone ID is tracked
    const tombstones = await getActiveTombstoneIds('inventoryItems');
    expect(tombstones.has(testItemId)).toBe(true);

    // Check event exists in outbox
    const outboxEvents = await db.domainOutbox
      .where('eventType')
      .equals('RecordDeleted')
      .toArray();
    
    const matchingEvent = outboxEvents.find(e => e.payload?.docId === testItemId);
    expect(matchingEvent).toBeDefined();
    expect(matchingEvent?.payload?.action).toBe('DELETE');
  });
});
