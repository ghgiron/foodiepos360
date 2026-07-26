import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './eventBus';
import type { OrderPaidPayload, InventoryItemUpdatedPayload } from '../types';

describe('eventBus Domain Event System', () => {
  it('should register an event listener and emit events correctly', () => {
    const callback = vi.fn();
    
    eventBus.on('OrderPaid', callback);

    const testPayload: OrderPaidPayload = {
      orderId: 'ord-123',
      tableId: 1,
      waiterId: 'w1',
      totalAmount: 50000,
      netAmountBeforeTax: 45000,
      taxAmount: 5000,
      paymentMethod: 'Efectivo',
      items: [],
    };
    eventBus.emit('OrderPaid', testPayload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(testPayload);

    // Clean up
    eventBus.off('OrderPaid', callback);
  });

  it('should unsubscribe an event listener when off() is called', () => {
    const callback = vi.fn();

    eventBus.on('InventoryItemUpdated', callback);
    eventBus.off('InventoryItemUpdated', callback);

    const testPayload: InventoryItemUpdatedPayload = {
      itemId: 'item-1',
      action: 'ADJUSTMENT',
      quantityChanged: 10,
      newTheoreticalStock: 50,
      updatedAt: new Date().toISOString(),
    };

    eventBus.emit('InventoryItemUpdated', testPayload);

    expect(callback).not.toHaveBeenCalled();
  });
});
