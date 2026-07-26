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
  
  // Zones
  'zones': 'operating_zones',
  'operating_zones': 'operating_zones',
  
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

