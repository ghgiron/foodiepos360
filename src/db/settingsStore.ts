import { db, enqueueOfflineEvent } from './localDb';

export const DEFAULT_UNIT_EQUIVALENCES: Record<string, { baseEquivalence: number; baseUnit: string }> = {
  'Kilogramo': { baseEquivalence: 1000, baseUnit: 'g' },
  'kg': { baseEquivalence: 1000, baseUnit: 'g' },
  'Gramo': { baseEquivalence: 1, baseUnit: 'g' },
  'g': { baseEquivalence: 1, baseUnit: 'g' },
  'Litro': { baseEquivalence: 1000, baseUnit: 'ml' },
  'l': { baseEquivalence: 1000, baseUnit: 'ml' },
  'Mililitro': { baseEquivalence: 1, baseUnit: 'ml' },
  'ml': { baseEquivalence: 1, baseUnit: 'ml' },
  'Libra': { baseEquivalence: 500, baseUnit: 'g' },
  'lb': { baseEquivalence: 500, baseUnit: 'g' },
  'Onza': { baseEquivalence: 29.574, baseUnit: 'ml' },
  'oz': { baseEquivalence: 29.574, baseUnit: 'ml' },
  'Botella 750ml': { baseEquivalence: 750, baseUnit: 'ml' },
  'Botella (750ml)': { baseEquivalence: 750, baseUnit: 'ml' },
  'Botella 700ml': { baseEquivalence: 700, baseUnit: 'ml' },
  'Lata 355ml': { baseEquivalence: 355, baseUnit: 'ml' },
  'Unidad': { baseEquivalence: 1, baseUnit: 'und' },
  'und': { baseEquivalence: 1, baseUnit: 'und' }
};

export const DEFAULT_SETTINGS = {
  currency: 'COP',
  locale: 'es-CO',
  enableImpoconsumo: true,
  impoconsumoRate: 8,
  ipoconsumo_pct: 8,
  error_margin_pct: 5,
  taxPercentage: 8,
  operationalCostPercentage: 14.95,
  safetyMarginPercentage: 5,
  min_utility_margin: 35,
  min_stock_alert_threshold: 10,
  profitabilityThresholdHigh: 60,
  profitabilityThresholdMedium: 30,
  kds_urgent_threshold_minutes: 15,
  official_units: ['Gramo', 'Kilogramo', 'Mililitro', 'Litro', 'Libra', 'Onza', 'Unidad'],
  unit_equivalences: DEFAULT_UNIT_EQUIVALENCES,
  master_categories: ['Combos', 'Burgers', 'Sushi', 'Cocteles', 'Especiales del Chef', 'Entradas', 'Platos Fuertes', 'Postres', 'Bebidas'],
  menu_categories: ['Combos', 'Burgers', 'Sushi', 'Cocteles', 'Especiales del Chef', 'Entradas', 'Platos Fuertes', 'Postres', 'Bebidas'],
  master_allergens: ['Gluten', 'Lácteos', 'Maní', 'Mariscos', 'Huevo', 'Soya', 'Pescado', 'Frutos Secos'],
  supply_categories: ['Empaques domicilio', 'Aseo', 'Garnish', 'Emplatado', 'Producción'],
  ingredient_categories: ['Proteínas', 'Licores', 'Abarrotes', 'Carnes', 'Verduras', 'Lácteos'],
  operating_zones: [
    { name: 'Salón Principal', orden: 1, isDefault: true },
    { name: 'Terraza', orden: 2, isDefault: false },
    { name: 'Bar VIP', orden: 3, isDefault: false }
  ],
  production_zones: ['Cocina', 'Bar', 'Licuadoras'],
  order_categories: ['Pedidos para llevar', 'Reservas'],
  salon_tables: [
    { id: "M1", name: "M1", description: "Sofá Azul Central", capacity: 4, zone: "Salón Principal" },
    { id: "M2", name: "M2", description: "Mesa Redonda (4 pax)", capacity: 4, zone: "Salón Principal" },
    { id: "M3", name: "M3", description: "Mesa Rectangular", capacity: 2, zone: "Salón Principal" },
    { id: "M4", name: "M4", description: "Junto al Pasillo", capacity: 4, zone: "Salón Principal" },
    { id: "M5", name: "M5", description: "Mesa Grande Centro", capacity: 6, zone: "Salón Principal" },
    { id: "M6", name: "M6", description: "Mesa Dos", capacity: 2, zone: "Salón Principal" },
    { id: "M7", name: "M7", description: "Mesa Pared", capacity: 4, zone: "Salón Principal" },
    { id: "M8", name: "M8", description: "Mesa Pequeña", capacity: 2, zone: "Salón Principal" },
    
    { id: "T1", name: "T1", description: "Terraza Entrada", capacity: 4, zone: "Terraza" },
    { id: "T2", name: "T2", description: "Terraza Ventana", capacity: 4, zone: "Terraza" },
    { id: "T3", name: "T3", description: "Terraza Central", capacity: 2, zone: "Terraza" },
    { id: "T4", name: "T4", description: "Mesa Cuadrada", capacity: 6, zone: "Terraza" },

    { id: "VIP1", name: "VIP 1", description: "Box Privado", capacity: 6, zone: "Bar VIP" },
    { id: "VIP2", name: "VIP 2", description: "Lounge Area", capacity: 8, zone: "Bar VIP" },
    { id: "B1", name: "Barra 1", description: "Silla Barra", capacity: 1, zone: "Bar VIP" },
    { id: "B2", name: "Barra 2", description: "Silla Barra", capacity: 1, zone: "Bar VIP" }
  ],
  asset_categories: ['Mobiliario', 'Menaje / Cristalería', 'Electrodomésticos / Maquinaria', 'Ambientación', 'Dotación'],
  asset_locations: ['Salón', 'Cocina', 'Barra', 'Terraza'],
  tax_options: [0, 8, 16, 19],
  waste_reasons: [
    'Error de comanda',
    'Cliente insatisfecho',
    'Plato defectuoso / Quemado',
    'Ingrediente en mal estado',
    'Otro motivo'
  ],
  system_branches: [
    { id: 'sede-norte-01', name: 'Sucursal Norte' },
    { id: 'sede-sur-02', name: 'Sucursal Sur' },
    { id: 'sede-centro-03', name: 'Sucursal Centro' }
  ],
  required_fields: {
    name: true,
    category: true,
    sellPrice: true,
    ingredients: true,
    description: false,
    steps: false,
    chefAdvice: false,
    image: false
  },
  payment_terms: ['Contado / Inmediato', 'Crédito 8 días', 'Crédito 15 días', 'Crédito 30 días', 'Crédito 60 días'],
  quality_ratings: ['Excelente', 'Aceptable', 'Defectuoso'],
  recipe_difficulties: ['Baja', 'Media', 'Alta'],
  asset_actions: ['Reparar de inmediato', 'Programar revisión técnica', 'Reemplazar elemento', 'Retirar de servicio'],
  asset_statuses: ['Nuevo (Operativo)', 'Usado', 'En Mantenimiento', 'Requiere Revisión Urgentemente', 'Retirado de Servicio'],
  voltages: ['110V', '220V', 'Trifásica'],
  maintenance_types: ['Preventivo', 'Correctivo'],
  alert_frequencies: ['Mensual', 'Trimestral', 'Semestral'],
  inventory_types: ['Producto Único', 'Ingrediente', 'Suministro', 'Activo'],
  stock_statuses: ['Óptimo', 'Bajo Stock', 'Stock Crítico']
};

/**
 * Initializes default settings if they do not exist in systemSettings table.
 */
export async function initializeSettings(): Promise<void> {
  try {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const exists = await db.systemSettings.get(key);
      if (exists && key === 'operating_zones') {
        const stored = exists.value;
        if (Array.isArray(stored) && stored.length > 0 && typeof stored[0] === 'string') {
          const migrated = stored.map((name: string, idx: number) => ({
            name,
            orden: idx + 1,
            isDefault: idx === 0
          }));
          exists.value = migrated;
          await db.systemSettings.put({ key, value: migrated });
          console.log('[settingsStore] Migrated operating_zones to objects');
        }
      }
      if (exists && key === 'salon_tables') {
        const stored = exists.value;
        if (Array.isArray(stored)) {
          const seen = new Set<string>();
          const deduplicated = [];
          for (const tbl of stored) {
            if (tbl && tbl.id && !seen.has(tbl.id)) {
              seen.add(tbl.id);
              deduplicated.push(tbl);
            }
          }
          if (deduplicated.length !== stored.length) {
            exists.value = deduplicated;
            await db.systemSettings.put({ key, value: deduplicated });
            console.log('[settingsStore] Deduplicated existing salon_tables');
          }
        }
      }
      if (exists && key === 'unit_equivalences') {
        const stored = exists.value;
        if (stored && (stored['Onza']?.baseEquivalence === 30 || stored['oz']?.baseEquivalence === 30)) {
          if (stored['Onza']?.baseEquivalence === 30) stored['Onza'].baseEquivalence = 29.574;
          if (stored['oz']?.baseEquivalence === 30) stored['oz'].baseEquivalence = 29.574;
          await db.systemSettings.put({ key, value: stored });
          console.log('[settingsStore] Updated Onza equivalence to 29.574 ml');
        }
      }
      if (!exists) {
        await db.systemSettings.put({ key, value });
        console.log(`[settingsStore] Seeded initial setting key: ${key}`);
      }
      // If setting already exists, preserve user configurations without forced merging
    }
  } catch (err) {
    console.error('[settingsStore] Error seeding systemSettings:', err);
  }
}

/**
 * Fetches a system setting value, returning a default value if not found.
 */
export async function getSystemSetting<T>(key: string, defaultValue?: T): Promise<T> {
  try {
    const record = await db.systemSettings.get(key);
    if (record) {
      return record.value as T;
    }
  } catch (err) {
    console.error(`[settingsStore] Error reading systemSetting ${key}:`, err);
  }
  return (defaultValue !== undefined ? defaultValue : (DEFAULT_SETTINGS as any)[key]) as T;
}

/**
 * Saves or updates a system setting value.
 */
export async function saveSystemSetting(key: string, value: any): Promise<void> {
  try {
    const updatedAt = new Date().toISOString();
    await db.systemSettings.put({ key, value, updatedAt });
    // Enqueue to domainOutbox for offline-first replication to Firestore
    await enqueueOfflineEvent('RecordUpdated', {
      collectionName: 'systemSettings',
      docId: key,
      data: { key, value, updatedAt }
    }).catch(err => console.warn(`[settingsStore] Failed to enqueue setting ${key} to outbox:`, err));
    console.log(`[settingsStore] Saved setting key: ${key} =`, value);
  } catch (err) {
    console.error(`[settingsStore] Error saving systemSetting ${key}:`, err);
    throw err;
  }
}
