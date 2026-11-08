// src/utils/purchaseOrderUtils.test.ts
import { describe, it, expect } from 'vitest';
import type { PurchaseOrder, Supplier } from '../types';
import { formatPurchaseOrderLabel, getHumanizedPurchaseOrderSupplier } from './purchaseOrderUtils';

describe('[US-09B] purchaseOrderUtils: Formateo Comercial y Humanización', () => {
  const mockSuppliers: Supplier[] = [
    { id: 'sup-101', name: 'Lácteos del Campo', email: 'lacteos@campo.com' } as Supplier,
    { id: 'sup-202', name: 'Distribuidora Carnes Gourmet', email: 'carnes@gourmet.com' } as Supplier
  ];

  it('Formatea con nombre de proveedor, conteo de ítems y costo en formato moneda', () => {
    const order: Partial<PurchaseOrder> = {
      id: 'po-draft-179409823192',
      supplierId: 'sup-101',
      totalEstimatedCost: 450000,
      items: [
        { itemId: 'item-1', name: 'Queso Mozzarella', quantity: 10 } as any,
        { itemId: 'item-2', name: 'Crema de Leche', quantity: 5 } as any
      ]
    };

    const label = formatPurchaseOrderLabel(order as PurchaseOrder, mockSuppliers);
    expect(label).toContain('Lácteos del Campo');
    expect(label).toContain('2 ítems');
    expect(label).toContain('$450.000');
    // Invariante: NUNCA mostrar en la UI el ID técnico crudo
    expect(label).not.toContain('po-draft-179409823192');
  });

  it('Asigna "Proveedor por Definir" cuando no tiene supplierId o es "POR DEFINIR"', () => {
    const orderNoSupplier: Partial<PurchaseOrder> = {
      id: 'po-draft-999999999999',
      supplierId: 'POR DEFINIR',
      supplierName: 'POR DEFINIR',
      totalEstimatedCost: 120000,
      items: [
        { itemId: 'item-x', name: 'Pimienta Negra', quantity: 2 } as any
      ]
    };

    const label = formatPurchaseOrderLabel(orderNoSupplier as PurchaseOrder, mockSuppliers);
    expect(label).toContain('Proveedor por Definir');
    expect(label).toContain('1 ítem');
    expect(label).toContain('$120.000');
    expect(label).not.toContain('po-draft-999999999999');
  });

  it('Maneja órdenes nulas o vacías de forma segura sin arrojar excepciones', () => {
    expect(formatPurchaseOrderLabel(null, mockSuppliers)).toBe('Sin Orden Seleccionada');
    expect(formatPurchaseOrderLabel(undefined, mockSuppliers)).toBe('Sin Orden Seleccionada');
    expect(getHumanizedPurchaseOrderSupplier(null, mockSuppliers)).toBe('Proveedor por Definir');
  });
});

