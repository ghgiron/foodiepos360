// src/services/firebaseSync.ts
import { doc, setDoc, deleteDoc, collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { firestore } from '../firebase';
import { db, enqueueOfflineEvent } from '../db/localDb';
import type { KdsOrderTicket } from '../types';

/**
 * Syncs a single KDS Order Ticket to Firestore.
 * If online, writes directly; otherwise, queues in DomainOutbox.
 */
export async function syncTicketToFirebase(ticket: KdsOrderTicket): Promise<void> {
  // 1. Save locally in IndexedDB first (single source of truth)
  await db.kdsOrderTickets.put(ticket);

  // 2. Attempt sync to Firestore
  if (navigator.onLine) {
    try {
      await setDoc(doc(firestore, 'kdsOrderTickets', ticket.id), ticket);
      console.log(`[FirebaseSync] Synced ticket ${ticket.id} directly to Firestore`);
    } catch (err) {
      console.error(`[FirebaseSync] Error syncing ticket ${ticket.id} directly. Enqueuing offline...`, err);
      await enqueueOfflineEvent('KdsTicketUpdated', ticket);
    }
  } else {
    console.log(`[FirebaseSync] Offline. Enqueuing ticket update event for ${ticket.id}`);
    await enqueueOfflineEvent('KdsTicketUpdated', ticket);
  }
}

/**
 * Deletes a KDS Order Ticket from Firestore.
 * If online, deletes directly; otherwise, queues deletion in DomainOutbox.
 */
export async function deleteTicketFromFirebase(ticketId: string): Promise<void> {
  // 1. Delete locally from IndexedDB
  await db.kdsOrderTickets.delete(ticketId);

  // 2. Attempt sync to Firestore
  if (navigator.onLine) {
    try {
      await deleteDoc(doc(firestore, 'kdsOrderTickets', ticketId));
      console.log(`[FirebaseSync] Deleted ticket ${ticketId} directly from Firestore`);
    } catch (err) {
      console.error(`[FirebaseSync] Error deleting ticket ${ticketId} directly. Enqueuing offline...`, err);
      await enqueueOfflineEvent('KdsTicketDeleted', { id: ticketId });
    }
  } else {
    console.log(`[FirebaseSync] Offline. Enqueuing delete ticket event for ${ticketId}`);
    await enqueueOfflineEvent('KdsTicketDeleted', { id: ticketId });
  }
}

/**
 * Processes all pending events in the DomainOutbox.
 */
export async function processDomainOutbox(): Promise<void> {
  if (!navigator.onLine) return;

  const pendingEvents = await db.domainOutbox
    .where('status')
    .equals('PENDING')
    .toArray();

  if (pendingEvents.length === 0) return;

  console.log(`[FirebaseSync] Processing ${pendingEvents.length} pending offline events...`);

  for (const event of pendingEvents) {
    try {
      // Transition status to PROCESSING to prevent double execution
      await db.domainOutbox.update(event.eventId, { status: 'PROCESSING' });

      if (event.eventType === 'KdsTicketUpdated') {
        const ticket = event.payload as KdsOrderTicket;
        await setDoc(doc(firestore, 'kdsOrderTickets', ticket.id), ticket);
      } else if (event.eventType === 'KdsTicketDeleted') {
        const { id } = event.payload;
        await deleteDoc(doc(firestore, 'kdsOrderTickets', id));
      }

      // Mark event as COMPLETED
      await db.domainOutbox.update(event.eventId, {
        status: 'COMPLETED',
        syncedAt: new Date().toISOString()
      });
      console.log(`[FirebaseSync] Outbox event ${event.eventId} successfully synchronized.`);
    } catch (err) {
      console.error(`[FirebaseSync] Failed to process event ${event.eventId}:`, err);
      // Revert status to PENDING for retry later
      await db.domainOutbox.update(event.eventId, { status: 'PENDING' });
    }
  }
}

/**
 * Subscribes to real-time changes in Firestore and registers background outbox flushers.
 */
export function startFirebaseSync(): () => void {
  console.log('[FirebaseSync] Starting real-time Firestore listener...');

  const q = query(collection(firestore, 'kdsOrderTickets'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      // If the write originated locally and hasn't been acknowledged yet, skip writing to Dexie
      if (change.doc.metadata.hasPendingWrites) {
        return;
      }

      const ticketId = change.doc.id;
      if (change.type === 'added' || change.type === 'modified') {
        const ticketData = change.doc.data() as KdsOrderTicket;
        await db.kdsOrderTickets.put(ticketData);
        console.log(`[FirebaseSync] Synced ticket ${ticketId} from Cloud Firestore to IndexedDB`);
      } else if (change.type === 'removed') {
        await db.kdsOrderTickets.delete(ticketId);
        console.log(`[FirebaseSync] Removed ticket ${ticketId} from IndexedDB (deleted in Cloud)`);
      }
    });
  }, (error) => {
    console.error('[FirebaseSync] Error in real-time listener:', error);
  });

  // Background sync processor interval
  const outboxInterval = setInterval(async () => {
    if (navigator.onLine) {
      await processDomainOutbox();
    }
  }, 10000);

  // Sync immediately when connection is restored
  const handleOnline = () => {
    console.log('[FirebaseSync] Browser online. Flushing outbox...');
    processDomainOutbox();
  };
  window.addEventListener('online', handleOnline);

  // Return unsubscribe cleanup function
  return () => {
    unsubscribe();
    clearInterval(outboxInterval);
    window.removeEventListener('online', handleOnline);
  };
}

/**
 * Force-fetches all tickets from Firestore to resolve any out-of-sync or frozen state.
 */
export async function forceResyncKds(): Promise<void> {
  // 1. First flush any outbox events to Firestore
  await processDomainOutbox();

  // 2. Fetch all tickets from Firestore
  if (navigator.onLine) {
    try {
      const querySnapshot = await getDocs(collection(firestore, 'kdsOrderTickets'));
      const remoteIds = new Set<string>();

      for (const docSnap of querySnapshot.docs) {
        const ticket = docSnap.data() as KdsOrderTicket;
        remoteIds.add(ticket.id);
        await db.kdsOrderTickets.put(ticket);
      }

      // Cleanup local active tickets that do not exist on the server anymore
      const localTickets = await db.kdsOrderTickets.toArray();
      for (const localT of localTickets) {
        if (!remoteIds.has(localT.id) && localT.overallStatus !== 'CERRADA' && localT.overallStatus !== 'CANCELADA') {
          await db.kdsOrderTickets.delete(localT.id);
        }
      }
      console.log('[FirebaseSync] Forced resync complete successfully.');
    } catch (err) {
      console.error('[FirebaseSync] Error forcing KDS resync:', err);
      throw err;
    }
  } else {
    throw new Error('Sin conexión a Internet. No se puede realizar la resincronización forzada.');
  }
}
