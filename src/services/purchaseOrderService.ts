// src/services/purchaseOrderService.ts
import { db, enqueueOfflineEvent } from '../db/localDb';
import type { InventoryItem, PurchaseOrder, PurchaseOrderItem, Supplier } from '../types';
import { getAvailableStock } from '../types';
import { getActiveBranchId } from '../utils/branchHelper';

export interface CriticalStockAlert {
  id: string; // e.g. "stock-ins-123"
  itemId: string;
  name: string;
  category: string;
  countUnit: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
  maxStock: number;
  priority: 1 | 2; // 1: Rojo / Agotado (availableStock <= 0), 2: Ámbar / Mínimo (availableStock <= minStock)
  level: 'Crítico' | 'Bajo';
  priorityLabel: string;
  zone: 'Cocina' | 'Bar' | 'General';
  detail: string;
  suggestedQuantity: number;
  purchaseCost: number;
  estimatedCost: number;
  supplierId: string; // ID or 'POR DEFINIR'
  supplierName?: string;
}

/**
 * Invariante de Stock (EGM):
 * availableStock = Math.max(0, physicalStock - (stagedStock || 0))
 */
export function calculateItemAvailableStock(item: InventoryItem): number {
  return getAvailableStock(item);
}

/**
 * Criterio de Aceptación 2:
 * suggestedQuantity = Math.max(1, (item.maxStock || item.minStock * 2) - item.availableStock)
 */
export function calculateSuggestedQuantity(item: InventoryItem, availableStock?: number): number {
  const currentAvailable = availableStock !== undefined ? availableStock : calculateItemAvailableStock(item);
  const min = item.minStock ?? item.stockMinLimit ?? 10;
  // (item.maxStock || item.minStock * 2)
  const targetStock = item.maxStock || (item.minStock ? item.minStock * 2 : (item.stockMaxLimit || min * 2));
  const diff = targetStock - currentAvailable;
  return Math.max(1, Math.round(diff * 100) / 100);
}

/**
 * Criterio de Aceptación 1:
 * Evalúa alertas de inventario y las prioriza estrictamente:
 * - Prioridad 1 (Rojo / Agotado: availableStock <= 0) en la parte superior.
 * - Prioridad 2 (Ámbar / Mínimo: availableStock <= minStock) a continuación.
 */
export function getCriticalStockAlerts(
  inventoryItems: InventoryItem[],
  globalMinStock: number = 10,
  suppliers: Supplier[] = []
): CriticalStockAlert[] {
  const alerts: CriticalStockAlert[] = [];
  const supplierMap = new Map<string, string>();
  suppliers.forEach(s => supplierMap.set(s.id, s.name));

  for (const item of inventoryItems) {
    // Excluir activos fijos
    if (item.inventoryType === 'ASSET') continue;

    const physicalStock = item.currentStock !== undefined 
      ? item.currentStock 
      : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0));
    const reservedStock = item.reservedStock || 0;
    
    // Invariante de Stock
    const availableStock = Math.max(0, physicalStock - reservedStock);
    
    const minLimit = item.stockMinLimit ?? item.minStock ?? globalMinStock;
    const maxLimit = item.stockMaxLimit ?? item.maxStock ?? (minLimit * 2);

    const isPriority1 = availableStock <= 0;
    const isPriority2 = availableStock > 0 && availableStock <= minLimit;

    if (!isPriority1 && !isPriority2) {
      continue; // Stock suficiente, sin alerta
    }

    const priority: 1 | 2 = isPriority1 ? 1 : 2;
    const level: 'Crítico' | 'Bajo' = isPriority1 ? 'Crítico' : 'Bajo';
    const priorityLabel = isPriority1 
      ? 'Prioridad 1 · Agotado' 
      : 'Prioridad 2 · Bajo Stock';

    // Determinar zona operativa
    let zone: 'Cocina' | 'Bar' | 'General' = 'General';
    if (item.operationZone === 'Cocina' || item.operationalZone === 'cocina') {
      zone = 'Cocina';
    } else if (
      item.operationZone === 'Bar' || 
      item.operationZone === 'Barra' || 
      item.operationalZone === 'bar' || 
      item.category === 'Licores'
    ) {
      zone = 'Bar';
    }

    // Resolver proveedor
    const rawSupplierId = item.supplierId?.trim();
    const normalizedSupplierId = (!rawSupplierId || rawSupplierId === 'default-supplier') 
      ? 'POR DEFINIR' 
      : rawSupplierId;
    const resolvedSupplierName = normalizedSupplierId === 'POR DEFINIR'
      ? 'POR DEFINIR'
      : (supplierMap.get(normalizedSupplierId) || `Proveedor (${normalizedSupplierId})`);

    // Calcular cantidad sugerida según fórmula de negocio
    const suggestedQuantity = calculateSuggestedQuantity(item, availableStock);
    const purchaseCost = item.purchaseCost || item.costoUnitarioReal || item.averagePrice || 0;
    const estimatedCost = Math.round(suggestedQuantity * purchaseCost);

    const detail = isPriority1
      ? `¡DESABASTECIMIENTO TOTAL! Stock Disponible: ${availableStock} ${item.countUnit} (Físico: ${physicalStock}, Reservado: ${reservedStock}). Bloquea recetas.`
      : `Stock bajo umbral mínimo. Stock Disponible: ${availableStock} ${item.countUnit} / Mínimo: ${minLimit} ${item.countUnit}.`;

    alerts.push({
      id: `stock-${item.id}`,
      itemId: item.id,
      name: item.name,
      category: item.category,
      countUnit: item.countUnit,
      physicalStock,
      reservedStock,
      availableStock,
      minStock: minLimit,
      maxStock: maxLimit,
      priority,
      level,
      priorityLabel,
      zone,
      detail,
      suggestedQuantity,
      purchaseCost,
      estimatedCost,
      supplierId: normalizedSupplierId,
      supplierName: resolvedSupplierName
    });
  }

  // Ordenamiento estricto: Prioridad 1 en cabecera, Prioridad 2 a continuación
  alerts.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Desempate alfabético
    return a.name.localeCompare(b.name);
  });

  return alerts;
}

/**
 * Criterio de Aceptación 3:
 * Agrupa insumos críticos por proveedor y genera registros borradores (status: 'DRAFT')
 * en la tabla Dexie 'purchaseOrders'. Asigna 'POR DEFINIR' si un insumo no tiene supplierId.
 *
 * Fuera de alcance: NO modifica physicalStock.
 */
export async function generateSuggestedPurchaseOrders(
  alertsOrItems: Array<CriticalStockAlert | InventoryItem>,
  suppliers: Supplier[] = [],
  options: { branchId?: string; createdBy?: string } = {}
): Promise<PurchaseOrder[]> {
  if (!alertsOrItems || alertsOrItems.length === 0) {
    return [];
  }

  const supplierMap = new Map<string, string>();
  suppliers.forEach(s => supplierMap.set(s.id, s.name));

  const targetBranch = options.branchId || getActiveBranchId() || 'principal';
  const createdBy = options.createdBy || 'Administrador Foodie POS';
  const now = new Date().toISOString();

  // Agrupación por proveedor
  const groups = new Map<string, {
    supplierId: string;
    supplierName: string;
    items: PurchaseOrderItem[];
  }>();

  for (const entry of alertsOrItems) {
    let alert: CriticalStockAlert;

    // Normalizar a CriticalStockAlert si es un InventoryItem crudo
    if ('itemId' in entry && 'suggestedQuantity' in entry) {
      alert = entry as CriticalStockAlert;
    } else {
      const item = entry as InventoryItem;
      const avail = calculateItemAvailableStock(item);
      const min = item.stockMinLimit ?? item.minStock ?? 10;
      const max = item.stockMaxLimit ?? item.maxStock ?? (min * 2);
      const rawSupp = item.supplierId?.trim();
      const suppId = (!rawSupp || rawSupp === 'default-supplier') ? 'POR DEFINIR' : rawSupp;
      const suppName = suppId === 'POR DEFINIR' ? 'POR DEFINIR' : (supplierMap.get(suppId) || `Proveedor (${suppId})`);
      const suggested = calculateSuggestedQuantity(item, avail);
      const cost = item.purchaseCost || item.averagePrice || 0;

      alert = {
        id: `stock-${item.id}`,
        itemId: item.id,
        name: item.name,
        category: item.category,
        countUnit: item.countUnit,
        physicalStock: item.currentStock ?? item.realPhysicalStock ?? 0,
        reservedStock: item.reservedStock ?? 0,
        availableStock: avail,
        minStock: min,
        maxStock: max,
        priority: avail <= 0 ? 1 : 2,
        level: avail <= 0 ? 'Crítico' : 'Bajo',
        priorityLabel: avail <= 0 ? 'Prioridad 1 · Agotado' : 'Prioridad 2 · Bajo Stock',
        zone: 'General',
        detail: '',
        suggestedQuantity: suggested,
        purchaseCost: cost,
        estimatedCost: Math.round(suggested * cost),
        supplierId: suppId,
        supplierName: suppName
      };
    }

    const groupKey = alert.supplierId || 'POR DEFINIR';
    if (!groups.has(groupKey)) {
      const resolvedName = groupKey === 'POR DEFINIR'
        ? 'POR DEFINIR'
        : (supplierMap.get(groupKey) || alert.supplierName || `Proveedor (${groupKey})`);

      groups.set(groupKey, {
        supplierId: groupKey,
        supplierName: resolvedName,
        items: []
      });
    }

    const targetGroup = groups.get(groupKey)!;
    targetGroup.items.push({
      itemId: alert.itemId,
      name: alert.name,
      quantity: alert.suggestedQuantity,
      unit: alert.countUnit,
      unitCost: alert.purchaseCost,
      estimatedCost: alert.estimatedCost,
      currentStock: alert.physicalStock,
      availableStock: alert.availableStock,
      minStock: alert.minStock,
      maxStock: alert.maxStock,
      priority: alert.priority
    });
  }

  const generatedOrders: PurchaseOrder[] = [];

  for (const group of groups.values()) {
    // Ordenar ítems dentro de la orden por prioridad (Prioridad 1 primero)
    group.items.sort((a, b) => a.priority - b.priority);

    const totalEstimatedCost = group.items.reduce((sum, item) => sum + item.estimatedCost, 0);
    const orderId = `po-draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const orderRecord: PurchaseOrder = {
      id: orderId,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      status: 'DRAFT',
      items: group.items,
      totalEstimatedCost,
      itemsCount: group.items.length,
      createdAt: now,
      updatedAt: now,
      branchId: targetBranch,
      createdBy,
      notes: `Generado automáticamente desde Alertas de Stock Crítico [US-09] (${group.items.length} ítems)`
    };

    generatedOrders.push(orderRecord);
  }

  // Persistir en Dexie
  await db.transaction('rw', [db.purchaseOrders, db.domainOutbox], async () => {
    for (const order of generatedOrders) {
      await db.purchaseOrders.put(order);
    }
    
    // Registrar evento outbox para replicación offline-first
    await enqueueOfflineEvent('PurchaseOrdersDraftCreated', {
      count: generatedOrders.length,
      orderIds: generatedOrders.map(o => o.id),
      createdAt: now
    });
  });

  return generatedOrders;
}

/**
 * Obtiene todas las órdenes de compra en estado borrador (DRAFT) persistidas en Dexie.
 */
export async function getDraftPurchaseOrders(): Promise<PurchaseOrder[]> {
  return db.purchaseOrders
    .where('status')
    .equals('DRAFT')
    .reverse()
    .sortBy('createdAt');
}

/**
 * Elimina una orden de compra en borrador de Dexie.
 */
export async function deletePurchaseOrderDraft(orderId: string): Promise<void> {
  await db.purchaseOrders.delete(orderId);
}

/**
 * [US-09C] Cancela una orden de compra en Dexie.
 * Invariante de Dominio: Solo está permitido cancelar si el estado es 'DRAFT' u 'ORDERED'.
 * Arroja error si ya fue 'RECEIVED' o si ya está 'CANCELLED'.
 * Encola un evento de sincronización en 'domainOutbox'.
 */
export async function cancelPurchaseOrder(
  orderId: string,
  reason: string = 'Cancelada por el usuario'
): Promise<PurchaseOrder> {
  const order = await db.purchaseOrders.get(orderId);
  if (!order) {
    throw new Error(`La orden de compra "${orderId}" no existe.`);
  }

  if (order.status === 'RECEIVED') {
    throw new Error('No es posible cancelar una orden de compra que ya ha sido RECIBIDA y asentada al inventario.');
  }

  if (order.status === 'CANCELLED') {
    throw new Error('La orden de compra ya se encuentra cancelada.');
  }

  const now = new Date().toISOString();
  const updatedOrder: PurchaseOrder = {
    ...order,
    status: 'CANCELLED',
    cancelledAt: now,
    cancellationReason: reason,
    updatedAt: now
  };

  await db.transaction('rw', [db.purchaseOrders, db.domainOutbox], async () => {
    await db.purchaseOrders.put(updatedOrder);
    await enqueueOfflineEvent('PurchaseOrderCancelled', {
      orderId,
      cancelledAt: now,
      reason,
      supplierId: order.supplierId,
      totalEstimatedCost: order.totalEstimatedCost
    });
  });

  return updatedOrder;
}

/**
 * [US-09C] Actualiza el estado de una orden de compra (ej. marcar como 'ORDERED' cuando se envía al proveedor).
 */
export async function updatePurchaseOrderStatus(
  orderId: string,
  newStatus: 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED',
  details: Partial<PurchaseOrder> = {}
): Promise<PurchaseOrder> {
  const order = await db.purchaseOrders.get(orderId);
  if (!order) {
    throw new Error(`La orden de compra "${orderId}" no existe.`);
  }

  const now = new Date().toISOString();
  const updatedOrder: PurchaseOrder = {
    ...order,
    ...details,
    status: newStatus,
    updatedAt: now
  };

  await db.transaction('rw', [db.purchaseOrders, db.domainOutbox], async () => {
    await db.purchaseOrders.put(updatedOrder);
    await enqueueOfflineEvent('PurchaseOrderStatusUpdated', {
      orderId,
      previousStatus: order.status,
      newStatus,
      updatedAt: now
    });
  });

  return updatedOrder;
}

/**
 * [US-09C] Obtiene todas las órdenes de compra históricas ordenadas por fecha de creación descendente.
 */
export async function getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
  return db.purchaseOrders
    .toCollection()
    .reverse()
    .sortBy('createdAt');
}


