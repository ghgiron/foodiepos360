// src/utils/purchaseOrderUtils.ts
import type { PurchaseOrder, Supplier } from '../types';
import { formatCurrency } from './formatters';

/**
 * [US-09B] Helper de Formateo Comercial y Humanización de Órdenes de Compra
 * 
 * Regla de negocio: NUNCA mostrar en la interfaz de usuario IDs técnicos crudos como 'po-draft-179409...'.
 * Cruza 'order.supplierId' con la lista de proveedores para generar etiquetas comerciales legibles.
 */
export function formatPurchaseOrderLabel(
  order: PurchaseOrder | null | undefined,
  suppliers: Supplier[] = []
): string {
  if (!order) return 'Sin Orden Seleccionada';

  const totalAmount = order.totalEstimatedCost ?? (order as any).estimatedTotal ?? (order as any).total ?? 0;
  const itemsCount = order.items?.length ?? order.itemsCount ?? 0;
  const itemsSuffix = `${itemsCount} ${itemsCount === 1 ? 'ítem' : 'ítems'}`;

  // Buscar coincidencia en el catálogo de proveedores
  const matchedSupplier = suppliers.find(
    s => s.id === order.supplierId || s.name.trim().toLowerCase() === order.supplierName?.trim().toLowerCase()
  );

  const cleanSupplierName = matchedSupplier 
    ? matchedSupplier.name 
    : (order.supplierName && order.supplierName !== 'POR DEFINIR' && !order.supplierName.startsWith('po-')
        ? order.supplierName 
        : null);

  if (cleanSupplierName) {
    return `${cleanSupplierName} · ${itemsSuffix} · ${formatCurrency(totalAmount)}`;
  }

  // Si no tiene proveedor o es 'POR DEFINIR'
  const formattedCost = totalAmount > 0 ? ` · ${formatCurrency(totalAmount)}` : '';
  return `Proveedor por Definir · ${itemsSuffix}${formattedCost}`;
}

/**
 * Obtiene el nombre comercial del proveedor de una orden sin exponer IDs crudos
 */
export function getHumanizedPurchaseOrderSupplier(
  order: PurchaseOrder | null | undefined,
  suppliers: Supplier[] = []
): string {
  if (!order) return 'Proveedor por Definir';
  const matched = suppliers.find(
    s => s.id === order.supplierId || s.name.trim().toLowerCase() === order.supplierName?.trim().toLowerCase()
  );
  if (matched) return matched.name;
  if (order.supplierName && order.supplierName !== 'POR DEFINIR' && !order.supplierName.startsWith('po-')) {
    return order.supplierName;
  }
  return 'Proveedor por Definir';
}

