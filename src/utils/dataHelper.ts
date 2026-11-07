// src/utils/dataHelper.ts
import { db } from '../db/localDb';
import { DEFAULT_SETTINGS } from '../db/settingsStore';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

// Friendly names mapping to internal settings keys
const keyMap: Record<string, string> = {
  // Categories
  'categories': 'menu_categories',
  'master_categories': 'menu_categories',
  'menu_categories': 'menu_categories',
  'MenuCategory': 'menu_categories',
  'supply_categories': 'supply_categories',
  'SupplyCategory': 'supply_categories',
  'ingredient_categories': 'ingredient_categories',
  'IngredientCategory': 'ingredient_categories',
  'asset_categories': 'asset_categories',
  'AssetCategory': 'asset_categories',
  
  // Units
  'units': 'official_units',
  'official_units': 'official_units',
  'UnitOfMeasure': 'official_units',
  'measurementUnits': 'official_units',
  'measurement_units': 'official_units',
  
  // Zones
  'zones': 'operating_zones',
  'operating_zones': 'operating_zones',
  'production_zones': 'production_zones',
  'ProductionZone': 'production_zones',
  
  // Taxes
  'taxes': 'tax_options',
  'tax_options': 'tax_options',
  
  // Locations
  'locations': 'asset_locations',
  'asset_locations': 'asset_locations'
};

/**
 * Centrally retrieves dropdown options.
 * If systemSettings object is provided, it reads from it reactively.
 * Otherwise, it falls back to DEFAULT_SETTINGS.
 */
export function getDropdownOptions(category: string, systemSettings?: Record<string, any>): any[] {
  const mappedKey = keyMap[category] || category;
  
  if (systemSettings && systemSettings[mappedKey] !== undefined) {
    const val = systemSettings[mappedKey];
    const arr = Array.isArray(val) ? val : [val];
    if (mappedKey === 'operating_zones') {
      return arr.map(item => (typeof item === 'string' ? item : item.name));
    }
    return arr;
  }
  
  const fallback = (DEFAULT_SETTINGS as Record<string, any>)[mappedKey];
  if (fallback !== undefined) {
    const arr = Array.isArray(fallback) ? fallback : [fallback];
    if (mappedKey === 'operating_zones') {
      return arr.map(item => (typeof item === 'string' ? item : item.name));
    }
    return arr;
  }
  
  return [];
}

/**
 * Hook to retrieve dropdown options reactively directly from IndexedDB.
 */
export function useDropdownOptions(category: string): any[] {
  const mappedKey = keyMap[category] || category;
  const fallback = (DEFAULT_SETTINGS as Record<string, any>)[mappedKey] || [];
  
  const options = useLiveQuery(async () => {
    const record = await db.systemSettings.get(mappedKey);
    const val = record ? record.value : fallback;
    const arr = Array.isArray(val) ? val : [val];
    if (mappedKey === 'operating_zones') {
      return arr.map(item => (typeof item === 'string' ? item : item.name));
    }
    return arr;
  }, [mappedKey]);

  const resolvedFallback = useMemo(() => {
    const arr = Array.isArray(fallback) ? fallback : [fallback];
    if (mappedKey === 'operating_zones') {
      return arr.map(item => (typeof item === 'string' ? item : item.name));
    }
    return arr;
  }, [fallback, mappedKey]);
  
  return options || resolvedFallback;
}

export type InventoryResourceType = 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET';

/**
 * Centrally and accurately discriminates the specific resource type of any inventory item.
 * Prevents incorrectly defaulting to 'Producto Único' or 'Ingrediente'.
 */
export function getItemResourceType(item: any): InventoryResourceType {
  if (!item) return 'INGREDIENT';
  if (item.inventoryType === 'ASSET') return 'ASSET';

  // 1. Direct explicit classification & prefix checks
  if (
    item.resourceType === 'product' ||
    item.resourceType === 'PRODUCT' ||
    item.inventoryType === 'PRODUCT' ||
    item.inventoryType === 'PRODUCTO_UNICO' ||
    (item.id && (item.id.startsWith('ins-prd') || item.id.startsWith('prod-') || item.id.startsWith('prd-')))
  ) {
    return 'PRODUCT';
  }

  if (
    item.resourceType === 'supply' ||
    item.resourceType === 'SUPPLY' ||
    item.inventoryType === 'PACKAGING' ||
    item.inventoryType === 'SUPPLY' ||
    item.inventoryType === 'SUMINISTRO' ||
    (item.id && (item.id.startsWith('ins-pkg') || item.id.startsWith('ins-sup') || item.id.startsWith('sum-') || item.id.startsWith('pkg-'))) ||
    item.isPackagingDesechable ||
    item.supplyCategory
  ) {
    return 'PACKAGING';
  }

  if (
    item.resourceType === 'ingredient' ||
    item.resourceType === 'INGREDIENT' ||
    item.inventoryType === 'INGREDIENT' ||
    item.inventoryType === 'INGREDIENTE' ||
    (item.id && (item.id.startsWith('ins-ing') || item.id.startsWith('ing-')))
  ) {
    return 'INGREDIENT';
  }

  // 2. Specific field attributes
  if (item.sellPrice !== undefined && Number(item.sellPrice) > 0) return 'PRODUCT';
  if (item.activo_catalogo || item.showInOnlineStore || item.visible_tienda_online) return 'PRODUCT';
  if (item.operationZone && item.cantidadComprada === undefined) return 'PACKAGING';
  if (
    item.cantidadComprada !== undefined ||
    item.cantidadUtilizable !== undefined ||
    item.mermaPercentage !== undefined ||
    item.costoUnitarioReal !== undefined ||
    item.equivalencia !== undefined
  ) {
    return 'INGREDIENT';
  }

  return 'INGREDIENT';
}

export function getResourceTypeLabel(type: InventoryResourceType): string {
  switch (type) {
    case 'PRODUCT':
      return 'Producto Único';
    case 'INGREDIENT':
      return 'Ingrediente';
    case 'PACKAGING':
      return 'Suministro';
    case 'ASSET':
      return 'Activo';
    default:
      return 'Ingrediente';
  }
}

export function getResourceTypeBadgeStyle(type: InventoryResourceType): string {
  switch (type) {
    case 'PRODUCT':
      return 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'INGREDIENT':
      return 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800';
    case 'PACKAGING':
      return 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    case 'ASSET':
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
}

