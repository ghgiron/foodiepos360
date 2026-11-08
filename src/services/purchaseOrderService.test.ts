// src/services/purchaseOrderService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/localDb';
import type { InventoryItem, Supplier } from '../types';
import {
  calculateItemAvailableStock,
  calculateSuggestedQuantity,
  getCriticalStockAlerts,
  generateSuggestedPurchaseOrders,
  cancelPurchaseOrder,
  updatePurchaseOrderStatus,
  getAllPurchaseOrders
} from './purchaseOrderService';

describe('US-09: Purchase Order Suggestion & Stock Alerts Service', () => {
  beforeEach(async () => {
    await db.purchaseOrders.clear();
    await db.domainOutbox.clear();
  });

  it('Invariante de Stock: availableStock = Math.max(0, physicalStock - stagedStock)', () => {
    const itemNormal: Partial<InventoryItem> = {
      currentStock: 15,
      reservedStock: 5
    };
    expect(calculateItemAvailableStock(itemNormal as InventoryItem)).toBe(10);

    const itemOverReserved: Partial<InventoryItem> = {
      currentStock: 4,
      reservedStock: 10
    };
    // No puede ser negativo
    expect(calculateItemAvailableStock(itemOverReserved as InventoryItem)).toBe(0);

    const itemZero: Partial<InventoryItem> = {
      currentStock: 0,
      reservedStock: 0
    };
    expect(calculateItemAvailableStock(itemZero as InventoryItem)).toBe(0);
  });

  it('Fórmula de Cantidad Sugerida: suggestedQuantity = Math.max(1, (maxStock || minStock * 2) - availableStock)', () => {
    // Caso 1: Tiene maxStock definido
    const itemWithMax: Partial<InventoryItem> = {
      minStock: 10,
      maxStock: 30
    };
    // availableStock = 5 -> suggested = 30 - 5 = 25
    expect(calculateSuggestedQuantity(itemWithMax as InventoryItem, 5)).toBe(25);

    // Caso 2: No tiene maxStock, usa minStock * 2
    const itemWithoutMax: Partial<InventoryItem> = {
      minStock: 15,
      maxStock: 0
    };
    // targetStock = 15 * 2 = 30. availableStock = 0 -> suggested = 30
    expect(calculateSuggestedQuantity(itemWithoutMax as InventoryItem, 0)).toBe(30);

    // Caso 3: availableStock es casi igual al target, el mínimo sugerido es 1
    expect(calculateSuggestedQuantity(itemWithMax as InventoryItem, 35)).toBe(1);
  });

  it('Priorización de Alertas: Prioridad 1 (Agotado) arriba, Prioridad 2 (Bajo Stock) después', () => {
    const mockItems: Partial<InventoryItem>[] = [
      {
        id: 'item-low',
        name: 'Azúcar Blanca',
        category: 'Insumos',
        countUnit: 'kg',
        currentStock: 4,
        reservedStock: 1, // available = 3 (<= minStock 5) -> Prioridad 2
        stockMinLimit: 5,
        stockMaxLimit: 15,
        supplierId: 'sup-1',
        purchaseCost: 3500
      },
      {
        id: 'item-out',
        name: 'Carne de Res Angus',
        category: 'Carnes',
        countUnit: 'kg',
        currentStock: 2,
        reservedStock: 3, // available = 0 (<= 0) -> Prioridad 1
        stockMinLimit: 8,
        stockMaxLimit: 20,
        supplierId: 'sup-2',
        purchaseCost: 45000
      },
      {
        id: 'item-sufficient',
        name: 'Sal Marina',
        category: 'Insumos',
        countUnit: 'kg',
        currentStock: 50,
        reservedStock: 2, // available = 48 (> minStock 10) -> Sin alerta
        stockMinLimit: 10,
        stockMaxLimit: 50,
        supplierId: 'sup-1',
        purchaseCost: 1500
      }
    ];

    const alerts = getCriticalStockAlerts(mockItems as InventoryItem[], 10);

    expect(alerts.length).toBe(2);
    // Prioridad 1 debe estar primero
    expect(alerts[0].priority).toBe(1);
    expect(alerts[0].itemId).toBe('item-out');
    expect(alerts[0].level).toBe('Crítico');
    expect(alerts[0].availableStock).toBe(0);

    // Prioridad 2 debe estar después
    expect(alerts[1].priority).toBe(2);
    expect(alerts[1].itemId).toBe('item-low');
    expect(alerts[1].level).toBe('Bajo');
    expect(alerts[1].availableStock).toBe(3);
  });

  it('Agrupación por Proveedor y asignación de "POR DEFINIR" a insumos huérfanos', async () => {
    const mockSuppliers: Supplier[] = [
      { id: 'sup-carnes', name: 'Distribuidora Carnes del Valle', email: 'carnes@test.com' } as Supplier
    ];

    const alerts = [
      {
        id: 'stock-item-1',
        itemId: 'item-1',
        name: 'Lomo Fino',
        category: 'Carnes',
        countUnit: 'kg',
        physicalStock: 0,
        reservedStock: 0,
        availableStock: 0,
        minStock: 5,
        maxStock: 15,
        priority: 1 as const,
        level: 'Crítico' as const,
        priorityLabel: 'Prioridad 1 · Agotado',
        zone: 'Cocina' as const,
        detail: 'Agotado',
        suggestedQuantity: 15,
        purchaseCost: 35000,
        estimatedCost: 525000,
        supplierId: 'sup-carnes',
        supplierName: 'Distribuidora Carnes del Valle'
      },
      {
        id: 'stock-item-2',
        itemId: 'item-2',
        name: 'Cebolla Morada',
        category: 'Verduras',
        countUnit: 'kg',
        physicalStock: 2,
        reservedStock: 0,
        availableStock: 2,
        minStock: 10,
        maxStock: 25,
        priority: 2 as const,
        level: 'Bajo' as const,
        priorityLabel: 'Prioridad 2 · Bajo Stock',
        zone: 'Cocina' as const,
        detail: 'Bajo',
        suggestedQuantity: 23,
        purchaseCost: 4000,
        estimatedCost: 92000,
        supplierId: '', // Sin proveedor asignado
        supplierName: ''
      }
    ];

    const draftOrders = await generateSuggestedPurchaseOrders(alerts, mockSuppliers);

    expect(draftOrders.length).toBe(2);

    // Orden 1: Proveedor 'sup-carnes'
    const carnesOrder = draftOrders.find(o => o.supplierId === 'sup-carnes');
    expect(carnesOrder).toBeDefined();
    expect(carnesOrder?.status).toBe('DRAFT');
    expect(carnesOrder?.supplierName).toBe('Distribuidora Carnes del Valle');
    expect(carnesOrder?.items.length).toBe(1);
    expect(carnesOrder?.items[0].name).toBe('Lomo Fino');

    // Orden 2: Proveedor 'POR DEFINIR'
    const undefinedOrder = draftOrders.find(o => o.supplierId === 'POR DEFINIR');
    expect(undefinedOrder).toBeDefined();
    expect(undefinedOrder?.status).toBe('DRAFT');
    expect(undefinedOrder?.supplierName).toBe('POR DEFINIR');
    expect(undefinedOrder?.items.length).toBe(1);
    expect(undefinedOrder?.items[0].name).toBe('Cebolla Morada');

    // Verificar persistencia en Dexie
    const persisted = await db.purchaseOrders.toArray();
    expect(persisted.length).toBe(2);
    expect(persisted.every(p => p.status === 'DRAFT')).toBe(true);

    // Verificar outbox de sincronización
    const outboxEvents = await db.domainOutbox.toArray();
    expect(outboxEvents.some(e => e.eventType === 'PurchaseOrdersDraftCreated')).toBe(true);
  });

  describe('US-09C: Purchase Order Lifecycle & Cancellation', () => {
    it('Permite cancelar ordenes en DRAFT u ORDERED y asienta evento outbox', async () => {
      const now = new Date().toISOString();
      const testOrder = {
        id: 'po-test-cancel-01',
        supplierId: 'sup-1',
        supplierName: 'Proveedor Prueba',
        status: 'DRAFT' as const,
        items: [],
        totalEstimatedCost: 50000,
        itemsCount: 0,
        createdAt: now,
        updatedAt: now
      };

      await db.purchaseOrders.put(testOrder);

      const cancelled = await cancelPurchaseOrder('po-test-cancel-01', 'Error en pedido');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancelledAt).toBeDefined();
      expect(cancelled.cancellationReason).toBe('Error en pedido');

      const inDb = await db.purchaseOrders.get('po-test-cancel-01');
      expect(inDb?.status).toBe('CANCELLED');

      const outbox = await db.domainOutbox.where('eventType').equals('PurchaseOrderCancelled').toArray();
      expect(outbox.length).toBe(1);
      expect(outbox[0].payload.orderId).toBe('po-test-cancel-01');
    });

    it('Invariante: Prohíbe cancelar órdenes ya recibidas en inventario', async () => {
      const now = new Date().toISOString();
      const receivedOrder = {
        id: 'po-test-received-01',
        supplierId: 'sup-1',
        supplierName: 'Proveedor Prueba',
        status: 'RECEIVED' as const,
        items: [],
        totalEstimatedCost: 50000,
        itemsCount: 0,
        createdAt: now,
        updatedAt: now
      };

      await db.purchaseOrders.put(receivedOrder);

      await expect(cancelPurchaseOrder('po-test-received-01')).rejects.toThrow(
        /No es posible cancelar una orden de compra que ya ha sido RECIBIDA/
      );
    });

    it('Invariante: Prohíbe re-cancelar órdenes que ya estaban canceladas', async () => {
      const now = new Date().toISOString();
      const cancelledOrder = {
        id: 'po-test-already-cancelled',
        supplierId: 'sup-1',
        supplierName: 'Proveedor Prueba',
        status: 'CANCELLED' as const,
        items: [],
        totalEstimatedCost: 50000,
        itemsCount: 0,
        createdAt: now,
        updatedAt: now
      };

      await db.purchaseOrders.put(cancelledOrder);

      await expect(cancelPurchaseOrder('po-test-already-cancelled')).rejects.toThrow(
        /ya se encuentra cancelada/
      );
    });

    it('Permite actualizar orden a ORDERED y consultar todas las órdenes', async () => {
      const now = new Date().toISOString();
      const order = {
        id: 'po-test-order-flow',
        supplierId: 'sup-1',
        supplierName: 'Proveedor Prueba',
        status: 'DRAFT' as const,
        items: [],
        totalEstimatedCost: 25000,
        itemsCount: 0,
        createdAt: now,
        updatedAt: now
      };

      await db.purchaseOrders.put(order);

      const updated = await updatePurchaseOrderStatus('po-test-order-flow', 'ORDERED');
      expect(updated.status).toBe('ORDERED');

      const all = await getAllPurchaseOrders();
      expect(all.some(o => o.id === 'po-test-order-flow')).toBe(true);
    });
  });
});

