// src/events/eventBus.ts
import type {
  OrderPaidPayload,
  SubscriptionUpdatedPayload,
  InventoryItemUpdatedPayload,
  HaccpAlertTriggeredPayload,
  PurchaseOcrScannedPayload,
  KdsOrderTicket
} from '../types';

/**
 * Registry of strongly-typed Domain Events mapped to their respective payloads.
 */
export interface DomainEvents {
  SubscriptionUpdated: SubscriptionUpdatedPayload;
  OrderPlaced: KdsOrderTicket; // Conforms to comanda/order placement
  OrderPaid: OrderPaidPayload;
  InventoryItemUpdated: InventoryItemUpdatedPayload;
  HaccpAlertTriggered: HaccpAlertTriggeredPayload;
  PurchaseOcrScanned: PurchaseOcrScannedPayload;
  [key: string]: any; // Allows future extensibility of custom domain events
}

export type EventCallback<T> = (payload: T) => void | Promise<void>;

/**
 * A simple, local, strongly-typed publish-subscribe event bus
 * to handle domain event propagation reactively.
 */
class DomainEventBus {
  private listeners: { [K in keyof DomainEvents]?: EventCallback<any>[] } = {};

  /**
   * Subscribe a listener to a specific domain event.
   * @param event Name of the domain event
   * @param callback Callback function executed when the event is emitted
   */
  public on<K extends keyof DomainEvents>(
    event: K,
    callback: EventCallback<DomainEvents[K]>
  ): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
  }

  /**
   * Unsubscribe a listener from a specific domain event.
   * @param event Name of the domain event
   * @param callback Reference to the registered callback function
   */
  public off<K extends keyof DomainEvents>(
    event: K,
    callback: EventCallback<DomainEvents[K]>
  ): void {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = list.filter(cb => cb !== callback);
  }

  /**
   * Publishes/Emits an event to all subscribed listeners asynchronously.
   * @param event Name of the domain event
   * @param payload Conforming payload
   */
  public async emit<K extends keyof DomainEvents>(
    event: K,
    payload: DomainEvents[K]
  ): Promise<void> {
    const callbacks = this.listeners[event];
    if (!callbacks || callbacks.length === 0) return;

    // Execute all callbacks concurrently and await them to complete
    const promises = callbacks.map(callback => {
      try {
        const result = callback(payload);
        return result instanceof Promise ? result : Promise.resolve();
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
  }
}

// Singleton event bus instance for global POS domain event management
export const eventBus = new DomainEventBus();
