import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import { DEFAULT_SETTINGS } from '../db/settingsStore';

/**
 * Custom Hook: Reactive System Settings object from Dexie db.systemSettings
 */
export function useSystemSettings() {
  const settings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  return settings;
}

/**
 * Custom Hook: Production Zones (Zonas de Producción / Operación)
 */
export function useProductionZones(): string[] {
  const settings = useSystemSettings();
  const list = (settings['production_zones'] as string[]) || DEFAULT_SETTINGS.production_zones;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Operating Zones (Zonas Físicas de Servicio / Mesas)
 */
export function useOperatingZones(): string[] {
  const settings = useSystemSettings();
  const raw = settings['operating_zones'] || DEFAULT_SETTINGS.operating_zones;
  return (Array.isArray(raw) ? raw : []).map(z => (typeof z === 'string' ? z : z.name));
}

/**
 * Custom Hook: Official Units of Measure (Unidades de Medida)
 */
export function useOfficialUnits(): string[] {
  const settings = useSystemSettings();
  const list = settings['official_units'] !== undefined ? (settings['official_units'] as string[]) : DEFAULT_SETTINGS.official_units;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Unit Equivalences Map (Equivalencias base de unidades)
 */
export function useUnitEquivalences(): Record<string, { baseEquivalence: number; baseUnit: string }> {
  const settings = useSystemSettings();
  const map = (settings['unit_equivalences'] || DEFAULT_SETTINGS.unit_equivalences || {}) as Record<string, { baseEquivalence: number; baseUnit: string }>;
  return map;
}

/**
 * Custom Hook: Suppliers List (Proveedores)
 */
export function useSuppliers() {
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  return suppliers;
}

/**
 * Custom Hook: Ingredient Categories
 */
export function useIngredientCategories(): string[] {
  const settings = useSystemSettings();
  const dbCats = useLiveQuery(() => db.ingredientCategories.toArray()) || [];
  const dbNames = dbCats.map(c => c.name);
  const settingsNames = (settings['ingredient_categories'] as string[]) || DEFAULT_SETTINGS.ingredient_categories;
  return Array.from(new Set([...dbNames, ...(Array.isArray(settingsNames) ? settingsNames : [])]));
}

/**
 * Custom Hook: Supply Categories
 */
export function useSupplyCategories(): string[] {
  const settings = useSystemSettings();
  const dbCats = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  const dbNames = dbCats.map(c => c.name);
  const settingsNames = (settings['supply_categories'] as string[]) || DEFAULT_SETTINGS.supply_categories;
  return Array.from(new Set([...dbNames, ...(Array.isArray(settingsNames) ? settingsNames : [])]));
}

/**
 * Custom Hook: Menu / Master Categories
 */
export function useMenuCategories(): string[] {
  const settings = useSystemSettings();
  const dbCats = useLiveQuery(() => db.categories.toArray()) || [];
  const dbNames = dbCats.map(c => c.name);
  const settingsNames = (settings['menu_categories'] || settings['master_categories'] || DEFAULT_SETTINGS.menu_categories) as string[];
  return Array.from(new Set([...dbNames, ...(Array.isArray(settingsNames) ? settingsNames : [])]));
}

/**
 * Custom Hook: Asset Categories
 */
export function useAssetCategories(): string[] {
  const settings = useSystemSettings();
  const list = (settings['asset_categories'] as string[]) || DEFAULT_SETTINGS.asset_categories;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Asset Locations
 */
export function useAssetLocations(): string[] {
  const settings = useSystemSettings();
  const list = (settings['asset_locations'] as string[]) || DEFAULT_SETTINGS.asset_locations;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Tax Options
 */
export function useTaxOptions(): number[] {
  const settings = useSystemSettings();
  const list = (settings['tax_options'] as number[]) || DEFAULT_SETTINGS.tax_options;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Waste Reasons
 */
export function useWasteReasons(): string[] {
  const settings = useSystemSettings();
  const list = (settings['waste_reasons'] as string[]) || DEFAULT_SETTINGS.waste_reasons;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: System Branches
 */
export function useSystemBranches() {
  const settings = useSystemSettings();
  const raw = settings['system_branches'] || DEFAULT_SETTINGS.system_branches;
  return (Array.isArray(raw) ? raw : []).filter(b => b.active !== false);
}

/**
 * Custom Hook: Payment Terms
 */
export function usePaymentTerms(): string[] {
  const settings = useSystemSettings();
  const list = (settings['payment_terms'] as string[]) || DEFAULT_SETTINGS.payment_terms;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Quality Ratings
 */
export function useQualityRatings(): string[] {
  const settings = useSystemSettings();
  const list = (settings['quality_ratings'] as string[]) || DEFAULT_SETTINGS.quality_ratings;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Recipe Difficulties
 */
export function useRecipeDifficulties(): string[] {
  const settings = useSystemSettings();
  const list = (settings['recipe_difficulties'] as string[]) || DEFAULT_SETTINGS.recipe_difficulties;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Asset Actions
 */
export function useAssetActions(): string[] {
  const settings = useSystemSettings();
  const list = (settings['asset_actions'] as string[]) || DEFAULT_SETTINGS.asset_actions;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Asset Statuses
 */
export function useAssetStatuses(): string[] {
  const settings = useSystemSettings();
  const list = (settings['asset_statuses'] as string[]) || DEFAULT_SETTINGS.asset_statuses;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Voltages
 */
export function useVoltages(): string[] {
  const settings = useSystemSettings();
  const list = (settings['voltages'] as string[]) || DEFAULT_SETTINGS.voltages;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Maintenance Types
 */
export function useMaintenanceTypes(): string[] {
  const settings = useSystemSettings();
  const list = (settings['maintenance_types'] as string[]) || DEFAULT_SETTINGS.maintenance_types;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Alert Frequencies
 */
export function useAlertFrequencies(): string[] {
  const settings = useSystemSettings();
  const list = (settings['alert_frequencies'] as string[]) || DEFAULT_SETTINGS.alert_frequencies;
  return Array.isArray(list) ? list : [];
}

/**
 * Custom Hook: Inventory Resource Types
 */
export function useInventoryTypes(): string[] {
  const settings = useSystemSettings();
  const list = (settings['inventory_types'] as string[]) || DEFAULT_SETTINGS.inventory_types;
  return Array.isArray(list) ? list : [];
}
