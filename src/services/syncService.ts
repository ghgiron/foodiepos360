// src/services/syncService.ts
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  getDocs,
  type Unsubscribe
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { db, enqueueOfflineEvent } from '../db/localDb';
export { getFirebaseConfig, checkFirestoreHealth } from '../config/firebaseConfig';
import type { KdsOrderTicket } from '../types';
import { useState, useEffect } from 'react';
import { consolidateStockByBranch, consolidateSucursalStock } from '../utils/branchHelper';

function sanitizeIncomingRecord(table: string, docData: any): any {
  if (!docData || typeof docData !== 'object') return docData;
  if (table === 'inventoryItems') {
    const stockByBranch = consolidateStockByBranch(docData.stockByBranch);
    const reservedStockByBranch = consolidateStockByBranch(docData.reservedStockByBranch);
    const sucursalStock = consolidateSucursalStock(docData.sucursalStock);
    return {
      ...docData,
      stockByBranch,
      reservedStockByBranch,
      sucursalStock
    };
  }
  if (table === 'recipes') {
    const stockPortionsByBranch = consolidateStockByBranch(docData.stockPortionsByBranch);
    const reservedPortionsByBranch = consolidateStockByBranch(docData.reservedPortionsByBranch);
    return {
      ...docData,
      stockPortionsByBranch,
      reservedPortionsByBranch
    };
  }
  return docData;
}

export type SyncStatus = 'SYNCHRONIZED' | 'SYNCING' | 'OFFLINE' | 'ERROR' | 'LOCAL_AHEAD' | 'REMOTE_AHEAD';

export interface SyncStatusInfo {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  errorMessage?: string | null;
}

export interface SyncCollectionConfig {
  table: string;
  key: string;
  collection: string;
  label: string;
  icon: string;
}

export interface EntitySyncComparison {
  entityLabel: string;
  tableName: string;
  collectionName: string;
  icon: string;
  localCount: number;
  remoteCount: number;
  status: 'IN_SYNC' | 'LOCAL_AHEAD' | 'REMOTE_AHEAD' | 'EMPTY' | 'ERROR';
  lastLocalUpdate?: string | null;
  lastRemoteUpdate?: string | null;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
}

export interface PullStats {
  success: boolean;
  totalPulled: number;
  collectionsHydrated: number;
  perCollection: Record<string, number>;
  durationMs: number;
  error?: string | null;
}

export interface PushStats {
  success: boolean;
  totalPushed: number;
  collectionsPushed: number;
  perCollection: Record<string, number>;
  durationMs: number;
  error?: string | null;
}

// Master collections mapping between Dexie and Firestore with UI metadata
export const SYNC_COLLECTIONS: SyncCollectionConfig[] = [
  { table: 'inventoryItems', key: 'id', collection: 'inventoryItems', label: 'Ingredientes y Productos', icon: 'inventory_2' },
  { table: 'recipes', key: 'id', collection: 'recipes', label: 'Recetas y Fichas', icon: 'menu_book' },
  { table: 'suppliers', key: 'id', collection: 'suppliers', label: 'Proveedores', icon: 'local_shipping' },
  { table: 'menuCategories', key: 'id', collection: 'menuCategories', label: 'Categorías de Menú', icon: 'category' },
  { table: 'ingredientCategories', key: 'id', collection: 'ingredientCategories', label: 'Categorías de Ingredientes', icon: 'egg_alt' },
  { table: 'supplyCategories', key: 'id', collection: 'supplyCategories', label: 'Categorías de Suministros', icon: 'package_2' },
  { table: 'systemSettings', key: 'key', collection: 'systemSettings', label: 'Configuración y Sedes', icon: 'settings' },
  { table: 'fixedAssets', key: 'id', collection: 'fixedAssets', label: 'Activos Fijos', icon: 'precision_manufacturing' },
  { table: 'clients', key: 'id', collection: 'clients', label: 'Clientes y Fidelización', icon: 'group' },
  { table: 'kdsOrderTickets', key: 'id', collection: 'kdsOrderTickets', label: 'Comandas KDS', icon: 'receipt_long' },
  { table: 'allergens', key: 'name', collection: 'allergens', label: 'Alérgenos', icon: 'warning' },
  { table: 'reservas', key: 'id', collection: 'reservas', label: 'Reservaciones', icon: 'event_seat' }
];

// Activity logs ring buffer (max 60 entries)
let syncLogs: SyncLogEntry[] = [
  {
    id: 'log-init',
    timestamp: new Date().toLocaleTimeString(),
    type: 'INFO',
    message: 'Servicio de sincronización FoodiePOS inicializado.'
  }
];

const logListeners = new Set<(logs: SyncLogEntry[]) => void>();

export function addSyncLog(type: SyncLogEntry['type'], message: string) {
  const newEntry: SyncLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString(),
    type,
    message
  };
  syncLogs = [newEntry, ...syncLogs.slice(0, 59)];
  logListeners.forEach(cb => {
    try {
      cb([...syncLogs]);
    } catch {}
  });
}

export function getSyncLogs(): SyncLogEntry[] {
  return [...syncLogs];
}

export function subscribeSyncLogs(callback: (logs: SyncLogEntry[]) => void): () => void {
  logListeners.add(callback);
  callback([...syncLogs]);
  return () => {
    logListeners.delete(callback);
  };
}

// Internal reactive status state
let currentSyncInfo: SyncStatusInfo = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'SYNCHRONIZED',
  pendingCount: 0,
  lastSyncedAt: new Date().toISOString(),
  errorMessage: null
};

const listeners = new Set<(info: SyncStatusInfo) => void>();

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb({ ...currentSyncInfo });
    } catch (e) {
      console.error('[SyncService] Listener error:', e);
    }
  });
}

export function getSyncStatus(): SyncStatusInfo {
  return { ...currentSyncInfo };
}

export function setSyncStatus(status: SyncStatus, errorMessage?: string | null) {
  currentSyncInfo = {
    ...currentSyncInfo,
    status,
    errorMessage: errorMessage || null,
    lastSyncedAt: status === 'SYNCHRONIZED' ? new Date().toISOString() : currentSyncInfo.lastSyncedAt
  };
  notifyListeners();
}

export function subscribeSyncStatus(callback: (info: SyncStatusInfo) => void): () => void {
  listeners.add(callback);
  callback({ ...currentSyncInfo });
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Custom React Hook for reactive sync status
 */
export function useSyncStatus(): SyncStatusInfo {
  const [info, setInfo] = useState<SyncStatusInfo>(() => getSyncStatus());

  useEffect(() => {
    const unsub = subscribeSyncStatus(setInfo);
    return unsub;
  }, []);

  return info;
}

/**
 * Helper to update pending outbox count
 */
async function updatePendingCount(): Promise<number> {
  try {
    const count = await db.domainOutbox.where('status').equals('PENDING').count();
    currentSyncInfo.pendingCount = count;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      currentSyncInfo.status = 'OFFLINE';
    } else if (count > 0 && currentSyncInfo.status === 'SYNCHRONIZED') {
      currentSyncInfo.status = 'SYNCING';
    }
    notifyListeners();
    return count;
  } catch (err) {
    console.warn('[SyncService] Could not count pending outbox events:', err);
    return 0;
  }
}

/**
 * Deeply sanitizes an object before writing to Firestore.
 * Strips all `undefined` values and converts them to valid JSON types to prevent Firestore serialization errors.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeForFirestore(value);
      }
    }
    return cleanObj as T;
  }
  return data;
}

/**
 * Syncs a single record to Firestore (Dexie -> Firestore).
 * Operates offline-first: updates local Dexie immediately and attempts cloud sync or outbox queue.
 */
export async function syncRecordToFirestore<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  const tableConfig = SYNC_COLLECTIONS.find(c => c.collection === collectionName);
  const recordWithTimestamp: T = {
    ...data,
    updatedAt: (data as any).updatedAt || new Date().toISOString()
  };

  // 1. Save locally in IndexedDB first (single source of truth)
  if (tableConfig) {
    await (db as any)[tableConfig.table].put(recordWithTimestamp);
  }

  // 2. Attempt sync to Firestore
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const sanitized = sanitizeForFirestore(recordWithTimestamp);
      await setDoc(doc(firestore, collectionName, docId), sanitized);
      console.log(`[SyncService] Synced ${collectionName}/${docId} directly to Firestore`);
      await updatePendingCount();
      if (currentSyncInfo.pendingCount === 0) {
        setSyncStatus('SYNCHRONIZED');
      }
    } catch (err: any) {
      console.warn(`[SyncService] Direct sync failed for ${collectionName}/${docId}. Enqueuing offline event...`, err);
      addSyncLog('WARNING', `Fallo al sincronizar ${collectionName}/${docId}. Encolando en Outbox.`);
      await enqueueOfflineEvent('RecordUpdated', { collectionName, docId, data: recordWithTimestamp });
      await updatePendingCount();
      setSyncStatus('SYNCING', err?.message);
    }
  } else {
    console.log(`[SyncService] Offline. Enqueuing update for ${collectionName}/${docId}`);
    addSyncLog('INFO', `Modo offline: Guardando cambio local para ${collectionName}/${docId}.`);
    await enqueueOfflineEvent('RecordUpdated', { collectionName, docId, data: recordWithTimestamp });
    await updatePendingCount();
    setSyncStatus('OFFLINE');
  }
}

/**
 * Gets active Tombstone IDs for a given collection from domainOutbox to prevent
 * resurrecting deleted records during pull hydration.
 */
export async function getActiveTombstoneIds(collectionName: string): Promise<Set<string>> {
  try {
    const deletedEvents = await db.domainOutbox
      .where('eventType')
      .equals('RecordDeleted')
      .toArray();

    const tombstoneIds = new Set<string>();
    for (const evt of deletedEvents) {
      if (evt.payload?.collectionName === collectionName && evt.payload?.docId) {
        tombstoneIds.add(String(evt.payload.docId));
      }
    }
    return tombstoneIds;
  } catch (err) {
    console.warn(`[SyncService] Could not retrieve tombstones for ${collectionName}:`, err);
    return new Set<string>();
  }
}

/**
 * Deletes a record from Firestore (Dexie -> Firestore).
 * Operates offline-first: deletes from local Dexie immediately and logs a Tombstone in domainOutbox.
 */
export async function deleteRecordFromFirestore(
  collectionName: string,
  docId: string
): Promise<void> {
  const tableConfig = SYNC_COLLECTIONS.find(c => c.collection === collectionName);

  // 1. Delete locally from IndexedDB (Dexie)
  if (tableConfig) {
    await (db as any)[tableConfig.table].delete(docId);
  }

  // 2. Always record a Tombstone event in domainOutbox
  const eventId = await enqueueOfflineEvent('RecordDeleted', {
    collectionName,
    docId,
    entity: collectionName,
    entityId: docId,
    action: 'DELETE',
    timestamp: Date.now(),
    synced: false
  });

  // 3. Attempt sync to Firestore if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await deleteDoc(doc(firestore, collectionName, docId));
      console.log(`[SyncService] Deleted ${collectionName}/${docId} directly from Firestore`);
      addSyncLog('SUCCESS', `Eliminado "${collectionName}/${docId}" en Firestore.`);
      await db.domainOutbox.update(eventId, {
        status: 'COMPLETED',
        syncedAt: new Date().toISOString()
      });
      await updatePendingCount();
      if (currentSyncInfo.pendingCount === 0) {
        setSyncStatus('SYNCHRONIZED');
      }
    } catch (err: any) {
      console.warn(`[SyncService] Direct delete failed for ${collectionName}/${docId}. Enqueued in Outbox:`, err);
      addSyncLog('WARNING', `Fallo al eliminar remoto ${collectionName}/${docId}. Encolado en Outbox.`);
      await updatePendingCount();
      setSyncStatus('SYNCING', err?.message);
    }
  } else {
    console.log(`[SyncService] Offline. Enqueued delete Tombstone for ${collectionName}/${docId}`);
    addSyncLog('INFO', `Modo offline: Registrado Tombstone para eliminar ${collectionName}/${docId}.`);
    await updatePendingCount();
    setSyncStatus('OFFLINE');
  }
}

/**
 * Deletes multiple records in a batch, removing them locally from Dexie
 * and queuing Tombstone events for Firestore sync.
 */
export async function bulkDeleteRecords(
  collectionName: string,
  docIds: string[]
): Promise<void> {
  if (!docIds || docIds.length === 0) return;
  const tableConfig = SYNC_COLLECTIONS.find(c => c.collection === collectionName);

  // 1. Bulk delete locally from Dexie
  if (tableConfig) {
    await (db as any)[tableConfig.table].bulkDelete(docIds);
  }

  // 2. Enqueue Tombstone events & delete from Firestore if online
  for (const docId of docIds) {
    const eventId = await enqueueOfflineEvent('RecordDeleted', {
      collectionName,
      docId,
      entity: collectionName,
      entityId: docId,
      action: 'DELETE',
      timestamp: Date.now(),
      synced: false
    });

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        await deleteDoc(doc(firestore, collectionName, docId));
        await db.domainOutbox.update(eventId, {
          status: 'COMPLETED',
          syncedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn(`[SyncService] Failed to delete ${collectionName}/${docId} from Firestore:`, err);
      }
    }
  }

  await updatePendingCount();
  addSyncLog('SUCCESS', `Eliminados ${docIds.length} elementos de "${collectionName}".`);
}

/**
 * Specialized KDS Ticket helpers (backward compatibility with firebaseSync.ts)
 */
export async function syncTicketToFirebase(ticket: KdsOrderTicket): Promise<void> {
  await syncRecordToFirestore('kdsOrderTickets', ticket.id, ticket);
}

export async function deleteTicketFromFirebase(ticketId: string): Promise<void> {
  await deleteRecordFromFirestore('kdsOrderTickets', ticketId);
}

/**
 * Processes all pending events in the DomainOutbox.
 */
export async function processDomainOutbox(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus('OFFLINE');
    return;
  }

  const pendingEvents = await db.domainOutbox
    .where('status')
    .equals('PENDING')
    .toArray();

  if (pendingEvents.length === 0) {
    currentSyncInfo.pendingCount = 0;
    setSyncStatus('SYNCHRONIZED');
    return;
  }

  setSyncStatus('SYNCING');
  console.log(`[SyncService] Processing ${pendingEvents.length} pending offline events...`);
  addSyncLog('INFO', `Procesando ${pendingEvents.length} evento(s) pendientes de sincronización...`);

  for (const event of pendingEvents) {
    try {
      await db.domainOutbox.update(event.eventId, { status: 'PROCESSING' });

      if (event.eventType === 'RecordUpdated') {
        const { collectionName, docId, data } = event.payload;
        const sanitized = sanitizeForFirestore(data);
        await setDoc(doc(firestore, collectionName, docId), sanitized);
      } else if (event.eventType === 'RecordDeleted') {
        const { collectionName, docId } = event.payload;
        await deleteDoc(doc(firestore, collectionName, docId));
      } else if (event.eventType === 'KdsTicketUpdated') {
        const ticket = event.payload as KdsOrderTicket;
        const sanitizedTicket = sanitizeForFirestore(ticket);
        await setDoc(doc(firestore, 'kdsOrderTickets', ticket.id), sanitizedTicket);
      } else if (event.eventType === 'KdsTicketDeleted') {
        const { id } = event.payload;
        await deleteDoc(doc(firestore, 'kdsOrderTickets', id));
      }

      await db.domainOutbox.update(event.eventId, {
        status: 'COMPLETED',
        syncedAt: new Date().toISOString()
      });

      console.log(`[SyncService] Outbox event ${event.eventId} successfully synchronized.`);
    } catch (err: any) {
      console.error(`[SyncService] Failed to process outbox event ${event.eventId}:`, err);
      addSyncLog('ERROR', `Error en outbox (${event.eventType}): ${err?.message || err}`);
      await db.domainOutbox.update(event.eventId, { status: 'PENDING' });
      setSyncStatus('ERROR', err?.message);
    }
  }

  await updatePendingCount();
  if (currentSyncInfo.pendingCount === 0) {
    setSyncStatus('SYNCHRONIZED');
    addSyncLog('SUCCESS', 'Todos los eventos pendientes fueron sincronizados con Firestore.');
  }
}

/**
 * Checks if remote Firestore has data in master collections.
 * Used for Safe Seed verification to avoid overwriting existing cloud data.
 */
export async function hasRemoteData(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return false;
  }

  try {
    const checks = ['menuCategories', 'inventoryItems', 'recipes', 'systemSettings'];
    for (const coll of checks) {
      const snap = await getDocs(query(collection(firestore, coll)));
      if (!snap.empty) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('[SyncService] Could not check remote data (proceeding offline):', err);
    return false;
  }
}

/**
 * PULL ON BOOT / HYDRATION:
 * Downloads all collections concurrently from Firestore into local Dexie IndexedDB without truncating.
 * Respects Tombstones so that locally deleted records are not resurrected.
 */
export async function pullDataFromFirestore(options?: { logActivity?: boolean }): Promise<PullStats> {
  const startTime = Date.now();
  const perCollection: Record<string, number> = {};
  let totalPulled = 0;
  let collectionsHydrated = 0;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    addSyncLog('WARNING', 'Descarga cancelada: Navegador en modo offline.');
    return {
      success: false,
      totalPulled: 0,
      collectionsHydrated: 0,
      perCollection: {},
      durationMs: 0,
      error: 'Sin conexión a Internet'
    };
  }

  try {
    setSyncStatus('SYNCING');
    addSyncLog('INFO', 'Iniciando hidratación / descarga masiva desde Firestore...');

    const results = await Promise.allSettled(
      SYNC_COLLECTIONS.map(async (config) => {
        try {
          const snapshot = await getDocs(collection(firestore, config.collection));
          const docs = snapshot.docs.map(d => d.data());

          if (docs.length > 0) {
            // Filter out records that were deleted locally (Tombstone protection)
            const tombstoneIds = await getActiveTombstoneIds(config.collection);
            const purgeTimeStr = typeof window !== 'undefined' && window.localStorage 
              ? localStorage.getItem('foodiepos_last_purge_timestamp') 
              : null;
            const purgeTime = purgeTimeStr ? new Date(purgeTimeStr).getTime() : 0;

            const activeDocs = docs.filter(docData => {
              const docId = String(docData[config.key] || docData.id || docData.key || docData.name);
              if (tombstoneIds.has(docId)) return false;

              // If an operational purge was executed and this is an operational collection, discard old orphan documents
              if (purgeTime > 0 && config.collection !== 'systemSettings') {
                const docTime = new Date(docData.updatedAt || docData.createdAt || docData.timestamp || 0).getTime();
                if (docTime > 0 && docTime < purgeTime) {
                  return false;
                }
              }

              return true;
            });

            if (activeDocs.length > 0) {
              const sanitizedDocs = activeDocs.map(d => sanitizeIncomingRecord(config.table, d));
              await (db as any)[config.table].bulkPut(sanitizedDocs);
            }
            if (options?.logActivity !== false) {
              addSyncLog('SUCCESS', `Descargados ${activeDocs.length} registros en "${config.label}".`);
            }
            return { label: config.label, count: activeDocs.length, hydrated: true };
          }
          return { label: config.label, count: 0, hydrated: false };
        } catch (collErr: any) {
          console.warn(`[SyncService] Error pulling collection ${config.collection}:`, collErr);
          addSyncLog('WARNING', `Fallo al descargar "${config.label}": ${collErr?.message || collErr}`);
          return { label: config.label, count: 0, hydrated: false };
        }
      })
    );

    results.forEach((res) => {
      if (res.status === 'fulfilled') {
        perCollection[res.value.label] = res.value.count;
        totalPulled += res.value.count;
        if (res.value.hydrated) collectionsHydrated++;
      }
    });

    const durationMs = Date.now() - startTime;
    setSyncStatus('SYNCHRONIZED');
    addSyncLog('SUCCESS', `Hidratación completada: ${totalPulled} registros descargados en ${durationMs}ms.`);

    return {
      success: true,
      totalPulled,
      collectionsHydrated,
      perCollection,
      durationMs
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[SyncService] Pull data failed:', err);
    setSyncStatus('ERROR', err?.message);
    addSyncLog('ERROR', `Fallo general en descarga desde Firestore: ${err?.message || err}`);

    return {
      success: false,
      totalPulled,
      collectionsHydrated,
      perCollection,
      durationMs,
      error: err?.message || String(err)
    };
  }
}

/**
 * PUSH ON DEMAND:
 * Uploads all local Dexie records to Firestore to guarantee cloud backup.
 * Processes all pending Tombstone deletions first.
 */
export async function pushDataToFirestore(options?: { logActivity?: boolean }): Promise<PushStats> {
  const startTime = Date.now();
  const perCollection: Record<string, number> = {};
  let totalPushed = 0;
  let collectionsPushed = 0;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    addSyncLog('WARNING', 'Subida cancelada: Navegador en modo offline.');
    return {
      success: false,
      totalPushed: 0,
      collectionsPushed: 0,
      perCollection: {},
      durationMs: 0,
      error: 'Sin conexión a Internet'
    };
  }

  try {
    setSyncStatus('SYNCING');
    addSyncLog('INFO', 'Iniciando subida masiva (Push) de datos locales a Firestore...');

    // 1. Process pending outbox deletions and events first
    await processDomainOutbox();

    const results = await Promise.allSettled(
      SYNC_COLLECTIONS.map(async (config) => {
        try {
          const localRecords = await (db as any)[config.table].toArray();
          if (localRecords.length > 0) {
            const chunkSize = 20;
            for (let i = 0; i < localRecords.length; i += chunkSize) {
              const chunk = localRecords.slice(i, i + chunkSize);
              await Promise.all(
                chunk.map(async (record: any) => {
                  const docId = String(record[config.key] || record.id || record.key || record.name);
                  const docRef = doc(firestore, config.collection, docId);
                  const cleanRecord = sanitizeForFirestore({
                    ...record,
                    updatedAt: record.updatedAt || new Date().toISOString()
                  });
                  await setDoc(docRef, cleanRecord);
                })
              );
            }

            if (options?.logActivity !== false) {
              addSyncLog('SUCCESS', `Subidos ${localRecords.length} registros de "${config.label}" a la nube.`);
            }
            return { label: config.label, count: localRecords.length, pushed: true, error: null };
          }
          return { label: config.label, count: 0, pushed: false, error: null };
        } catch (collErr: any) {
          console.warn(`[SyncService] Error pushing table ${config.table}:`, collErr);
          const errDetail = collErr?.message || String(collErr);
          addSyncLog('ERROR', `Fallo al subir "${config.label}": ${errDetail}`);
          return { label: config.label, count: 0, pushed: false, error: errDetail };
        }
      })
    );

    let firstError: string | null = null;
    let totalLocalCount = 0;

    results.forEach((res) => {
      if (res.status === 'fulfilled') {
        perCollection[res.value.label] = res.value.count;
        totalPushed += res.value.count;
        if (res.value.pushed) collectionsPushed++;
        if (res.value.error && !firstError) firstError = res.value.error;
      }
    });

    for (const c of SYNC_COLLECTIONS) {
      try {
        totalLocalCount += await (db as any)[c.table].count();
      } catch {}
    }

    const durationMs = Date.now() - startTime;
    const isSuccess = totalPushed > 0 || (totalLocalCount === 0);

    if (isSuccess && !firstError) {
      setSyncStatus('SYNCHRONIZED');
      addSyncLog('SUCCESS', `Subida completada: ${totalPushed} registros sincronizados con Firestore en ${durationMs}ms.`);
    } else {
      setSyncStatus('ERROR', firstError || 'Error al escribir en Firestore');
      addSyncLog('WARNING', `Subida finalizada con advertencias. ${totalPushed} de ${totalLocalCount} registros subidos.`);
    }

    return {
      success: isSuccess && !firstError,
      totalPushed,
      collectionsPushed,
      perCollection,
      durationMs,
      error: firstError
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[SyncService] Push data failed:', err);
    setSyncStatus('ERROR', err?.message);
    addSyncLog('ERROR', `Fallo general en subida a Firestore: ${err?.message || err}`);

    return {
      success: false,
      totalPushed,
      collectionsPushed,
      perCollection,
      durationMs,
      error: err?.message || String(err)
    };
  }
}

/**
 * DIAGNOSTICS: Compares local Dexie counts vs remote Firestore counts.
 * Accounts for pending Tombstone deletions.
 */
export async function getDetailedSyncComparison(): Promise<EntitySyncComparison[]> {
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

  const comparisonPromises = SYNC_COLLECTIONS.map(async (config) => {
    let localCount = 0;
    let remoteCount = 0;
    let hasError = false;

    try {
      localCount = await (db as any)[config.table].count();
    } catch {
      localCount = 0;
    }

    if (isOnline) {
      try {
        const snap = await getDocs(collection(firestore, config.collection));
        remoteCount = snap.size;
      } catch (e) {
        hasError = true;
      }
    }

    // Check if there are pending Tombstone deletions in outbox for this collection
    let pendingDeletes = 0;
    try {
      pendingDeletes = await db.domainOutbox
        .where('status')
        .equals('PENDING')
        .and(e => e.eventType === 'RecordDeleted' && e.payload?.collectionName === config.collection)
        .count();
    } catch {}

    let status: EntitySyncComparison['status'] = 'IN_SYNC';
    if (hasError) {
      status = 'ERROR';
    } else if (localCount === 0 && remoteCount === 0) {
      status = 'EMPTY';
    } else if (pendingDeletes > 0) {
      status = 'LOCAL_AHEAD';
    } else if (localCount === remoteCount) {
      status = 'IN_SYNC';
    } else if (localCount > remoteCount) {
      status = 'LOCAL_AHEAD';
    } else {
      status = 'REMOTE_AHEAD';
    }

    return {
      entityLabel: config.label,
      tableName: config.table,
      collectionName: config.collection,
      icon: config.icon,
      localCount,
      remoteCount,
      status
    };
  });

  return Promise.all(comparisonPromises);
}

/**
 * Alias for backward compatibility
 */
export const fetchRemoteData = pullDataFromFirestore;

/**
 * Subscribes to real-time changes across all master collections in Firestore.
 * Implements Last-Write-Wins conflict resolution strategy based on updatedAt timestamp.
 */
export function startSyncService(): () => void {
  console.log('[SyncService] Starting real-time Firestore listeners on all master collections...');

  const unsubscribes: Unsubscribe[] = [];

  SYNC_COLLECTIONS.forEach(({ table, collection: collName }) => {
    try {
      const q = query(collection(firestore, collName));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.doc.metadata.hasPendingWrites) {
              return;
            }

            const docId = change.doc.id;
            const remoteData = change.doc.data();

            if (change.type === 'added' || change.type === 'modified') {
              const localRecord = await (db as any)[table].get(docId);
              const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;
              const localTime = localRecord?.updatedAt ? new Date(localRecord.updatedAt).getTime() : 0;

              if (!localRecord || remoteTime >= localTime) {
                await (db as any)[table].put(sanitizeIncomingRecord(table, remoteData));
                console.log(`[SyncService] Realtime sync: Updated local ${table}/${docId} from Firestore (remote win)`);
              } else {
                console.log(`[SyncService] Realtime conflict: Local ${table}/${docId} is newer. Pushing local to cloud...`);
                await syncRecordToFirestore(collName, docId, localRecord);
              }
            } else if (change.type === 'removed') {
              await (db as any)[table].delete(docId);
              console.log(`[SyncService] Realtime sync: Removed local ${table}/${docId} (deleted in Cloud)`);
            }
          });
        },
        (error) => {
          console.warn(`[SyncService] Error in real-time listener for ${collName}:`, error);
          setSyncStatus('ERROR', error.message);
        }
      );

      unsubscribes.push(unsub);
    } catch (err) {
      console.warn(`[SyncService] Failed to attach listener for ${collName}:`, err);
    }
  });

  const outboxInterval = setInterval(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      await processDomainOutbox();
    } else {
      setSyncStatus('OFFLINE');
    }
  }, 8000);

  // Sync immediately when connection is restored
  const handleOnline = () => {
    console.log('[SyncService] Browser online. Flushing outbox...');
    addSyncLog('INFO', 'Conexión a Internet restablecida. Sincronizando eventos...');
    setSyncStatus('SYNCING');
    processDomainOutbox();
  };

  const handleOffline = () => {
    console.log('[SyncService] Browser offline.');
    addSyncLog('WARNING', 'Navegador desconectado de Internet. Modo Offline activado.');
    setSyncStatus('OFFLINE');
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  updatePendingCount();

  return () => {
    unsubscribes.forEach(unsub => {
      try {
        unsub();
      } catch {}
    });
    clearInterval(outboxInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
}

export const startFirebaseSync = startSyncService;

/**
 * Force-fetches all tickets & collections from Firestore and flushes outbox.
 */
export async function forceResyncAll(): Promise<void> {
  await processDomainOutbox();
  await pullDataFromFirestore();
}

/**
 * Backward compatibility for forceResyncKds
 */
export async function forceResyncKds(): Promise<void> {
  await processDomainOutbox();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const querySnapshot = await getDocs(collection(firestore, 'kdsOrderTickets'));
      for (const docSnap of querySnapshot.docs) {
        const ticket = docSnap.data() as KdsOrderTicket;
        await db.kdsOrderTickets.put(ticket);
      }
      console.log('[SyncService] Forced KDS resync complete successfully.');
      setSyncStatus('SYNCHRONIZED');
    } catch (err: any) {
      console.error('[SyncService] Error forcing KDS resync:', err);
      setSyncStatus('ERROR', err?.message);
      throw err;
    }
  } else {
    setSyncStatus('OFFLINE');
    throw new Error('Sin conexión a Internet. No se puede realizar la resincronización forzada.');
  }
}
