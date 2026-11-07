import { describe, it, expect } from 'vitest';
import {
  getItemResourceType,
  getResourceTypeLabel,
  getResourceTypeBadgeStyle
} from './dataHelper';

describe('Centralized Inventory Resource Type Discrimination', () => {
  it('should accurately identify INGREDIENT items', () => {
    const ing1 = { id: 'ins-ing-001', name: 'Harina de Trigo', cantidadComprada: 1000, costoUnitarioReal: 3.5 };
    const ing2 = { id: 'ing-sugar-1', name: 'Azúcar Blanca', mermaPercentage: 2 };
    const ing3 = { id: 'ins-123', name: 'Levadura Fresca', equivalencia: 1 };

    expect(getItemResourceType(ing1)).toBe('INGREDIENT');
    expect(getItemResourceType(ing2)).toBe('INGREDIENT');
    expect(getItemResourceType(ing3)).toBe('INGREDIENT');
    expect(getResourceTypeLabel('INGREDIENT')).toBe('Ingrediente');
  });

  it('should accurately identify PRODUCT (Producto Único) items', () => {
    const prod1 = { id: 'ins-prd-001', name: 'Coca Cola 350ml', sellPrice: 5000, activo_catalogo: true };
    const prod2 = { id: 'prod-water-1', name: 'Agua Manantial', showInOnlineStore: true };
    const prod3 = { id: 'prd-beer-1', name: 'Cerveza Club Colombia', inventoryType: 'PRODUCT' };

    expect(getItemResourceType(prod1)).toBe('PRODUCT');
    expect(getItemResourceType(prod2)).toBe('PRODUCT');
    expect(getItemResourceType(prod3)).toBe('PRODUCT');
    expect(getResourceTypeLabel('PRODUCT')).toBe('Producto Único');
  });

  it('should accurately identify PACKAGING (Suministro) items', () => {
    const sum1 = { id: 'ins-pkg-001', name: 'Caja Hamburguesa Kraft', supplyCategory: 'Empaques / Desechables', isPackagingDesechable: true };
    const sum2 = { id: 'ins-sup-002', name: 'Servilletas Ecológicas', operationZone: 'Salon' };
    const sum3 = { id: 'sum-straw-1', name: 'Pitillos Biodegradables', inventoryType: 'SUPPLY' };

    expect(getItemResourceType(sum1)).toBe('PACKAGING');
    expect(getItemResourceType(sum2)).toBe('PACKAGING');
    expect(getItemResourceType(sum3)).toBe('PACKAGING');
    expect(getResourceTypeLabel('PACKAGING')).toBe('Suministro');
  });

  it('should accurately identify ASSET items', () => {
    const asset1 = { id: 'ast-001', name: 'Horno Rational', inventoryType: 'ASSET' };

    expect(getItemResourceType(asset1)).toBe('ASSET');
    expect(getResourceTypeLabel('ASSET')).toBe('Activo');
  });

  it('should return appropriate badge styling for each resource type', () => {
    expect(getResourceTypeBadgeStyle('PRODUCT')).toContain('text-purple-700');
    expect(getResourceTypeBadgeStyle('INGREDIENT')).toContain('text-teal-700');
    expect(getResourceTypeBadgeStyle('PACKAGING')).toContain('text-indigo-700');
    expect(getResourceTypeBadgeStyle('ASSET')).toContain('text-slate-700');
  });
});
