import { describe, it, expect, beforeEach } from 'vitest';
import { db, enqueueOfflineEvent, getPendingOfflineEvents, updateEventStatus } from './localDb';

describe('FoodiePOSDatabase Local Storage & Outbox Queue', () => {
  beforeEach(async () => {
    // Clear outbox table before each test
    await db.domainOutbox.clear();
  });

  it('should enqueue offline events into domainOutbox table with PENDING status', async () => {
    const payload = { orderId: 'ord-test-001', amount: 120000 };
    const eventId = await enqueueOfflineEvent('OrderPaid', payload);

    expect(eventId).toBeDefined();
    expect(eventId).toContain('evt-orderpaid-');

    const pending = await getPendingOfflineEvents();
    expect(pending.length).toBe(1);
    expect(pending[0].eventType).toEqual('OrderPaid');
    expect(pending[0].status).toEqual('PENDING');
    expect(pending[0].payload).toEqual(payload);
  });

  it('should update event status to COMPLETED and set syncedAt timestamp', async () => {
    const eventId = await enqueueOfflineEvent('InventoryItemUpdated', { itemId: 'ins-001', qty: 10 });
    
    await updateEventStatus(eventId, 'COMPLETED');

    const updatedEvent = await db.domainOutbox.get(eventId);
    expect(updatedEvent?.status).toEqual('COMPLETED');
    expect(updatedEvent?.syncedAt).not.toBeNull();

    const pendingAfter = await getPendingOfflineEvents();
    expect(pendingAfter.length).toBe(0);
  });
});
