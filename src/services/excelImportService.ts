// src/services/excelImportService.ts
import * as XLSX from 'xlsx';
import { db, enqueueOfflineEvent } from '../db/localDb';
import type { InventoryItem, SucursalStock, Supplier } from '../types';
import { 
  type OperationalZone, 
  normalizeOperationalZone, 
  getOperationalZoneLabel 
} from '../utils/operationalZones';
import { consolidateStockByBranch, consolidateSucursalStock, areBranchIdsEqual, normalizeBranchId } from '../utils/branchHelper';

export interface ExcelProductRawRow {
  Proveedor?: string;
  Supplier?: string;
  'Linea de Produccion'?: string;
  'Línea de Producción'?: string;
  'Linea de Productos'?: string;
  'Línea de Productos'?: string;
  Linea?: string;
  Línea?: string;
  Estacion?: string;
  Estación?: string;
  Zona?: string;
  Insumos?: string;
  Insumo?: string;
  Nombre?: string;
  Producto?: string;
  Item?: string;
  'Item Name'?: string;
  'Precio de compra'?: string | number;
  'Precio Compra'?: string | number;
  Costo?: string | number;
  Precio?: string | number;
  'Peso bruto'?: string | number;
  Cantidad?: string | number;
  Stock?: string | number;
  'Peso neto'?: string | number;
  'Cantidad Utilizable'?: string | number;
  'Net Weight'?: string | number;
  'Unidad de medida'?: string;
  'Unidad de medida de compra'?: string;
  'Unidad de Compra'?: string;
  'Unidad Compra'?: string;
  'Unidad de medida de uso'?: string;
  'Unidad de Uso'?: string;
  'Unidad de uso'?: string;
  'Unidad Uso'?: string;
  'Unidad receta'?: string;
  'Unidad Receta'?: string;
  'Unidad de Receta'?: string;
  'Columna H'?: string;
  Uso?: string;
  Unidad?: string;
  Unit?: string;
  Categoría?: string;
  Categoria?: string;
  Category?: string;
  [key: string]: any;
}

export type InventoryItemClassification = 'ingredient' | 'product' | 'supply';

export interface ProcessedInventoryItemCandidate {
  item: InventoryItem;
  isNew: boolean;
  supplierName: string;
  originalRowNumber: number;
  classification: InventoryItemClassification;
  costingMetrics: {
    wastePercentage: number;
    correctionFactor: number;
    unitCostNet: number;
    unitCostGross: number;
    purchaseUnit: string;
    usageUnit: string;
    conversionRatio: number;
    unitCostUsage: number;
  };
}

export interface ExcelImportOptions {
  branchId?: string;
  overwrite?: boolean;
  defaultSupplierId?: string;
}

export interface ExcelParsedInventoryData {
  fileName?: string;
  totalRows: number;
  validCount: number;
  newCount: number;
  updateCount: number;
  suppliersDetected: string[];
  zoneBreakdown: Record<OperationalZone, number>;
  previewItems: ProcessedInventoryItemCandidate[];
  candidates: ProcessedInventoryItemCandidate[];
  errors: { row: number; item?: string; error: string }[];
}

export interface ExcelImportResult {
  totalProcessed: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: { row: number; item?: string; error: string }[];
  zoneBreakdown: Record<OperationalZone, number>;
  suppliersCreated: number;
  categoriesCreated: number;
  items: InventoryItem[];
}

/**
 * Normalizes 'Linea de Productos' / 'Linea de Produccion' to OperationalZone:
 * - 'Cocina' -> 'cocina'
 * - 'Bar', 'Barra' -> 'bar'
 * - 'Batidos', 'Bar - Batidos' -> 'licuadoras'
 * - 'Suministros', 'Domicilios', 'Otros' -> 'general_operaciones'
 */
export function mapExcelLineaToOperationalZone(rawLinea?: string | null): OperationalZone {
  return normalizeOperationalZone(rawLinea);
}

/**
 * Universal mapping function that converts any variant of a unit to the standard
 * official system unit name ('Gramo', 'Mililitro', 'Onza', 'Unidad', 'Kilogramo', 'Litro', 'Botella', 'Libra').
 */
export function normalizeUnit(rawUnit?: string | null): string {
  if (!rawUnit) return 'Unidad';
  const clean = rawUnit
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/^unit-/, '');

  if (['gramo', 'gramos', 'gr', 'g', 'g.', 'grm', 'grs'].includes(clean)) return 'Gramo';
  if (['mililitro', 'mililitros', 'ml', 'mili', 'cc', 'cm3', 'ml.'].includes(clean)) return 'Mililitro';
  if (['onza', 'onzas', 'oz', 'fl oz', 'floz', 'oz.'].includes(clean)) return 'Onza';
  if (['unidad', 'unidades', 'und', 'unid', 'u', 'un', 'und.', 'paquete', 'paquetes', 'pqte', 'lata', 'latas'].includes(clean)) return 'Unidad';
  if (['kilogramo', 'kilogramos', 'kg', 'kilo', 'kilos', 'kg.'].includes(clean)) return 'Kilogramo';
  if (['litro', 'litros', 'l', 'lt', 'l.', 'lts'].includes(clean)) return 'Litro';
  if (['botella', 'botellas', 'bot'].includes(clean)) return 'Botella';
  if (['libra', 'libras', 'lb', 'lbs', 'lb.'].includes(clean)) return 'Libra';

  return rawUnit.trim().charAt(0).toUpperCase() + rawUnit.trim().slice(1);
}

/**
 * Universal mapping function that converts any variant of a unit to its standard ID/slug
 * (e.g. 'unit-gramo', 'unit-mililitro', 'unit-onza', 'unit-unidad', 'unit-kilogramo', 'unit-litro', 'unit-botella', 'unit-libra').
 */
export function normalizeUnitId(rawUnit?: string | null): string {
  const normalized = normalizeUnit(rawUnit);
  const slug = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `unit-${slug}`;
}

/**
 * Normalizes units of measure into canonical identifiers (e.g. gr, oz, und, ml, kg, lt, lb).
 */
export function normalizeUnitOfMeasure(rawUnit?: string | null): string {
  if (!rawUnit) return 'und';
  const clean = rawUnit
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (['gr', 'g', 'gramo', 'gramos'].includes(clean)) return 'gr';
  if (['ml', 'mili', 'mililitro', 'mililitros', 'cc', 'cm3'].includes(clean)) return 'ml';
  if (['oz', 'onza', 'onzas', 'fl oz', 'floz'].includes(clean)) return 'oz';
  if (['und', 'unid', 'unidad', 'unidades', 'u', 'botella', 'botellas', 'paquete', 'pqte', 'lata', 'latas'].includes(clean)) return 'und';
  if (['kg', 'kilo', 'kilogramo', 'kilogramos', 'kilos'].includes(clean)) return 'kg';
  if (['lt', 'l', 'litro', 'litros'].includes(clean)) return 'lt';
  if (['lb', 'libra', 'libras'].includes(clean)) return 'lb';

  return clean;
}

/**
 * Extracts numeric quantity and optional unit from raw cell values (e.g. "750 ml", "1000 gr", 500).
 * Matches regex ^([0-9.,]+)\s*([a-zA-Z]+)?$
 */
export function extractQuantityAndUnit(rawVal: any): { quantity: number; unit?: string } {
  if (typeof rawVal === 'number') {
    return { quantity: isNaN(rawVal) ? 0 : rawVal };
  }
  if (!rawVal) return { quantity: 0 };
  const str = String(rawVal).trim();
  const match = str.match(/^([0-9.,]+)\s*([a-zA-Z]+)?$/);
  if (match) {
    const qty = parseExcelNumber(match[1]);
    const unit = match[2] ? normalizeUnitOfMeasure(match[2]) : undefined;
    return { quantity: qty, unit };
  }
  return { quantity: parseExcelNumber(str) };
}

/**
 * Conversion matrix to dimension base:
 * - Volume base: ml (1 oz = 29.5735 ml, 1 L = 1000 ml)
 * - Weight base: gr (1 kg = 1000 gr, 1 lb = 500 gr)
 * - Unit base: und (factor 1)
 */
const UNIT_DIMENSION_FACTORS: Record<string, { dimension: 'volume' | 'weight' | 'discrete'; factor: number }> = {
  ml: { dimension: 'volume', factor: 1 },
  oz: { dimension: 'volume', factor: 29.5735 },
  lt: { dimension: 'volume', factor: 1000 },
  l: { dimension: 'volume', factor: 1000 },

  gr: { dimension: 'weight', factor: 1 },
  g: { dimension: 'weight', factor: 1 },
  kg: { dimension: 'weight', factor: 1000 },
  lb: { dimension: 'weight', factor: 500 },

  und: { dimension: 'discrete', factor: 1 }
};

/**
 * Converts quantity between units of measure (Volume, Weight, Units).
 * - Volume: ml <-> oz (1 oz = 29.5735 ml), l <-> ml (1 L = 1000 ml)
 * - Weight: kg <-> gr (1 kg = 1000 gr), lb <-> gr (1 lb = 500 gr)
 * - Unidad: und (factor 1)
 */
export function convertQuantity(quantity: number, fromUnitRaw: string, toUnitRaw: string): number {
  if (!quantity || quantity === 0) return 0;
  const from = normalizeUnitOfMeasure(fromUnitRaw);
  const to = normalizeUnitOfMeasure(toUnitRaw);

  if (from === to) return quantity;

  const fromSpec = UNIT_DIMENSION_FACTORS[from];
  const toSpec = UNIT_DIMENSION_FACTORS[to];

  if (!fromSpec || !toSpec) return quantity;
  if (fromSpec.dimension !== toSpec.dimension) return quantity;

  // Convert from source to dimension base, then to target
  const inBase = quantity * fromSpec.factor;
  const inTarget = inBase / toSpec.factor;

  return Math.round(inTarget * 100000) / 100000;
}

export function cleanString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function matchesKeyword(normName: string, keyword: string): boolean {
  if (keyword.includes(' ') || keyword.includes('-')) {
    return normName.includes(keyword);
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return regex.test(normName);
}

/**
 * Intelligent resourceType detection:
 * 1. Supply ('supply'):
 *    - 'Linea de Produccion' is 'Suministros' or contains 'suministro'
 *    - Name includes: 'bolsa', 'empaque', 'caja', 'vaso', 'guante', 'palillo', 'pitillo', 'servilleta', 'sombrilla'
 * 2. Product ('product') - Unique product for direct retail:
 *    - Name starts with or contains: 'Cerveza', 'Coca cola', 'Coca-cola', 'RedBull'
 * 3. Ingredient ('ingredient') - Default for recipes/sub-recipes:
 *    - Oils, meats, produce, bar liquors (oz/ml), syrups, fruits, pantry groceries.
 */
export function detectResourceType(
  name: string,
  rawLinea?: string | null
): InventoryItemClassification {
  const normName = cleanString(name || '');
  const normLinea = cleanString(rawLinea || '');

  // 1. Check supply keywords and production line
  const supplyKeywords = [
    'bolsa', 'bolsas',
    'empaque', 'empaques',
    'caja', 'cajas',
    'vaso', 'vasos',
    'guante', 'guantes',
    'palillo', 'palillos',
    'pitillo', 'pitillos',
    'servilleta', 'servilletas',
    'sombrilla', 'sombrillas'
  ];

  const isSupplyByLinea = normLinea === 'suministros' || normLinea.includes('suministro');
  const isSupplyByName = supplyKeywords.some(keyword => matchesKeyword(normName, keyword));

  if (isSupplyByLinea || isSupplyByName) {
    return 'supply';
  }

  // 2. Check direct sale product keywords
  const productKeywords = [
    'cerveza', 'cervezas',
    'coca cola',
    'coca-cola',
    'redbull',
    'red bull'
  ];

  const isProduct = productKeywords.some(keyword => matchesKeyword(normName, keyword));
  if (isProduct) {
    return 'product';
  }

  // 3. Fallback: ingredient for recipes and subrecipes
  return 'ingredient';
}

/**
 * Classifies an inventory item into 'ingredient', 'product', or 'supply'.
 * Backwards compatible with legacy callers passing only linea, or enhanced with name.
 */
export function classifyInventoryLine(linea?: string | null, name?: string): InventoryItemClassification {
  if (name) {
    return detectResourceType(name, linea);
  }
  const norm = normalizeOperationalZone(linea);
  if (norm === 'cocina' || norm === 'licuadoras') return 'ingredient';
  if (norm === 'general_operaciones') return 'supply';
  return 'ingredient';
}

export interface CategoryInferenceRule {
  category: string;
  keywords: string[];
}

/**
 * Standard automated inventory categories according to culinary & POS conventions:
 * - Carnes y Proteínas: pollo, carne, res, cerdo, camarón, alitas, chorizo, pescado, palmitos.
 * - Frutas y Verduras: aguacate, cebolla, limón, apio, arándanos, banano, manzana, yerbabuena, cilantro.
 * - Abarrotes y Secos: arroz, avena, azúcar, harina, tortillas, pan, chips.
 * - Aceites, Salsas y Condimentos: aceite, achiote, ají, ajo, ajonjolí, sal, salsa.
 * - Licores y Destilados: tequila, vodka, whisky, ron, ginebra, pisco, mezcal, aguardiente.
 * - Siropes y Mixers: sirope, triple sec, curacao, baileys, licor de café/menta.
 * - Garnish y Decoración: gomas, bolitas explosivas, cerezas, masmelos, bombones.
 * - Cervezas y Gaseosas: cerveza, coca cola, redbull, soda, tónica.
 * - Empaques y Desechables: cajas, bolsas, vasos, servilletas, pitillos, palillos.
 */
export const INVENTORY_CATEGORY_RULES: CategoryInferenceRule[] = [
  {
    category: 'Empaques y Desechables',
    keywords: [
      'caja', 'cajas', 'bolsa', 'bolsas', 'vaso', 'vasos', 'servilleta', 'servilletas',
      'pitillo', 'pitillos', 'palillo', 'palillos', 'tapa', 'tapas', 'cubierto', 'cubiertos',
      'guante', 'guantes', 'sombrilla', 'sombrillas', 'empaque', 'empaques', 'aluminio',
      'papel vinipel', 'domo'
    ]
  },
  {
    category: 'Cervezas y Gaseosas',
    keywords: [
      'cerveza', 'cervezas', 'coca cola', 'coca-cola', 'redbull', 'red bull', 'soda', 'sodas',
      'tonica', 'tonicas', 'gaseosa', 'gaseosas', 'ginger ale', 'sprite', 'agua', 'aguas',
      'jugo hit', 'postobon', 'cuatro', 'colombiana', 'fanta', 'pepsi', 'heineken', 'corona',
      'club colombia', 'aguila', 'pilsen', 'miller'
    ]
  },
  {
    category: 'Garnish y Decoración',
    keywords: [
      'goma', 'gomas', 'bolitas explosivas', 'perlas explosivas', 'cereza', 'cerezas',
      'masmelo', 'masmelos', 'marshmallow', 'bombon', 'bombones', 'escarcha',
      'decoracion', 'perlas de tapioca'
    ]
  },
  {
    category: 'Siropes y Mixers',
    keywords: [
      'sirope', 'siropes', 'triple sec', 'curacao', 'curazao', 'baileys', 'licor de cafe',
      'licor de menta', 'syrup', 'syrups', 'jarabe', 'jarabes', 'amaretto', 'kahlua',
      'vermut', 'vermouth', 'bitter', 'angostura', 'granadina'
    ]
  },
  {
    category: 'Licores y Destilados',
    keywords: [
      'tequila', 'tequilas', 'vodka', 'vodkas', 'whisky', 'whiskey', 'ron', 'rones',
      'ginebra', 'ginebras', 'gin', 'pisco', 'mezcal', 'aguardiente', 'aguardientes',
      'brandy', 'cognac'
    ]
  },
  {
    category: 'Carnes y Proteínas',
    keywords: [
      'pollo', 'pollos', 'carne', 'carnes', 'res', 'cerdo', 'cerdos', 'camaron', 'camarones',
      'alitas', 'alita', 'chorizo', 'chorizos', 'pescado', 'pescados', 'palmito', 'palmitos',
      'salmon', 'tocineta', 'bacon', 'lomo', 'lomos', 'costilla', 'costillas', 'pechuga', 'pechugas',
      'atun', 'mariscos', 'pavo', 'ternera', 'cordero'
    ]
  },
  {
    category: 'Aceites, Salsas y Condimentos',
    keywords: [
      'aceite', 'aceites', 'achiote', 'aji', 'ajo', 'ajos', 'ajonjoli', 'sal', 'salsa', 'salsas',
      'pimienta', 'mayonesa', 'mostaza', 'vinagre', 'soya', 'soja', 'oregano', 'comino',
      'bbq', 'ketchup', 'curry', 'aderezo'
    ]
  },
  {
    category: 'Frutas y Verduras',
    keywords: [
      'aguacate', 'aguacates', 'cebolla', 'cebollas', 'limon', 'limones', 'apio', 'arandano', 'arandanos',
      'banano', 'bananos', 'manzana', 'manzanas', 'yerbabuena', 'hierbabuena', 'cilantro',
      'tomate', 'tomates', 'lechuga', 'fresa', 'fresas', 'maracuya', 'mango', 'mangos', 'pina',
      'naranja', 'naranjas', 'pepino', 'zanahoria', 'papa', 'papas', 'albahaca', 'romero', 'menta'
    ]
  },
  {
    category: 'Abarrotes y Secos',
    keywords: [
      'arroz', 'avena', 'azucar', 'harina', 'tortilla', 'tortillas', 'pan', 'panes',
      'chip', 'chips', 'frijol', 'frijoles', 'pasta', 'pastas', 'lenteja', 'lentejas',
      'mani', 'cereal', 'maiz', 'nachos', 'galleta', 'galletas'
    ]
  }
];

/**
 * Infers appropriate inventory category using rule-based keyword matching,
 * explicit row category fallback, or operational zone defaults.
 */
export function inferInventoryCategory(
  name: string,
  rawRowCategory?: string,
  operationalZone?: string,
  resourceType?: InventoryItemClassification
): string {
  const normName = cleanString(name || '');

  // 1. Try matching keywords from the 9 standard categories
  for (const rule of INVENTORY_CATEGORY_RULES) {
    if (rule.keywords.some(kw => matchesKeyword(normName, kw))) {
      return rule.category;
    }
  }

  // 2. If row explicitly provides a category in the spreadsheet, respect it
  if (rawRowCategory && rawRowCategory.trim()) {
    const rawClean = cleanString(rawRowCategory);
    if (rawClean.includes('empaque') || rawClean.includes('desechable') || rawClean.includes('suministro')) {
      return 'Empaques y Desechables';
    }
    if (rawClean.includes('carne') || rawClean.includes('proteina')) {
      return 'Carnes y Proteínas';
    }
    if (rawClean.includes('licor') || rawClean.includes('destilado')) {
      return 'Licores y Destilados';
    }
    return rawRowCategory.trim();
  }

  // 3. Fallback based on resourceType and operationalZone
  if (resourceType === 'supply') {
    return 'Empaques y Desechables';
  }
  if (resourceType === 'product') {
    return 'Cervezas y Gaseosas';
  }

  if (operationalZone === 'bar') return 'Licores y Destilados';
  if (operationalZone === 'licuadoras') return 'Frutas y Verduras';
  if (operationalZone === 'cocina') return 'Carnes y Proteínas';

  return 'Abarrotes y Secos';
}

/**
 * Parses numeric price or quantity from spreadsheet strings (e.g. "$ 20.990", "3000", "400.5").
 */
export function parseExcelNumber(val: any, fallback: number = 0): number {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (!val) return fallback;
  const cleaned = String(val)
    .replace(/[^0-9.-]/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

/**
 * Calculates standardized restaurant costing metrics:
 * - wastePercentage: ((gross - net) / gross) * 100
 * - correctionFactor: gross / net
 * - unitCostNet: purchasePrice / net
 * - unitCostGross: purchasePrice / gross
 */
export function calculateCostingMetrics(purchasePrice: number, gross: number, net: number) {
  const wastePercentage = gross > 0 && net < gross
    ? Math.round(((gross - net) / gross) * 10000) / 100
    : 0;

  const correctionFactor = net > 0
    ? Math.round((gross / net) * 1000) / 1000
    : 1.0;

  const unitCostNet = net > 0
    ? Math.round((purchasePrice / net) * 100) / 100
    : purchasePrice;

  const unitCostGross = gross > 0
    ? Math.round((purchasePrice / gross) * 100) / 100
    : purchasePrice;

  return {
    wastePercentage,
    correctionFactor,
    unitCostNet,
    unitCostGross
  };
}

/**
 * Resolves active branch ID fallback for Excel imports.
 */
export function getActiveBranchIdFallback(): string {
  if (typeof window !== 'undefined') {
    const fromStorage = localStorage.getItem('foodiepos_active_branch_id');
    if (fromStorage && fromStorage.trim()) {
      return fromStorage.trim();
    }
  }
  return 'SEDE-SAN-AGUST-N-2044';
}

/**
 * Maps a single row from an Excel spreadsheet into a valid, normalized InventoryItem.
 */
export function normalizeExcelProductRow(
  row: ExcelProductRawRow,
  index: number = 0,
  options?: ExcelImportOptions
): InventoryItem | null {
  const name = (
    row.Insumos ||
    row.Insumo ||
    row.Nombre ||
    row.Producto ||
    row.Item ||
    row['Item Name'] ||
    ''
  ).trim();

  if (!name) return null;

  const rawLinea = 
    row['Linea de Produccion'] ||
    row['Línea de Producción'] ||
    row['Linea de Productos'] ||
    row['Línea de Productos'] ||
    row.Linea ||
    row.Línea ||
    row.Estacion ||
    row.Estación ||
    row.Zona;

  const operationalZone = mapExcelLineaToOperationalZone(rawLinea);
  const operationZone = getOperationalZoneLabel(operationalZone);
  const classification = detectResourceType(name, rawLinea);

  const purchaseCost = parseExcelNumber(
    row['Precio de compra'] || row['Precio Compra'] || row.Costo || row.Precio,
    0
  );

  const rawBruto = row['Peso bruto'] || row.Cantidad || row.Stock;
  const rawNeto = row['Peso neto'] || row['Cantidad Utilizable'] || row['Net Weight'];

  const extractedGross = extractQuantityAndUnit(rawBruto);
  const extractedNet = extractQuantityAndUnit(rawNeto);

  const pesoBruto = extractedGross.quantity > 0 ? extractedGross.quantity : parseExcelNumber(rawBruto, 1);
  const pesoNeto = extractedNet.quantity > 0 ? extractedNet.quantity : parseExcelNumber(rawNeto, pesoBruto);

  const rawPurchaseUnit = 
    row['Unidad de medida de compra'] || 
    row['Unidad de Compra'] || 
    row['Unidad Compra'] || 
    row['Unidad de medida'] || 
    row.Unidad || 
    row.Unit || 
    extractedNet.unit || 
    extractedGross.unit;

  const normalizedPurchase = normalizeUnit(rawPurchaseUnit || 'Unidad');
  const matchedPurchaseUnitId = normalizeUnitId(normalizedPurchase);

  const rawUsageUnit = 
    row['Unidad de medida de uso'] || 
    row['Unidad de Uso'] || 
    row['Unidad de uso'] || 
    row['Unidad Uso'] || 
    row['Unidad receta'] || 
    row['Unidad Receta'] || 
    row['Unidad de Receta'] || 
    row.Uso || 
    row['Columna H'];

  // Smart fallback for usage unit if not explicitly in file
  let defaultUsageUnit = normalizedPurchase;
  if (normalizedPurchase === 'Litro') {
    defaultUsageUnit = operationalZone === 'bar' ? 'Onza' : 'Mililitro';
  } else if (normalizedPurchase === 'Kilogramo' || normalizedPurchase === 'Libra') {
    defaultUsageUnit = 'Gramo';
  } else if (normalizedPurchase === 'Mililitro' && operationalZone === 'bar') {
    defaultUsageUnit = 'Onza';
  } else if (normalizedPurchase === 'Botella') {
    defaultUsageUnit = operationalZone === 'bar' ? 'Onza' : 'Unidad';
  }

  const normalizedUsage = normalizeUnit(rawUsageUnit || defaultUsageUnit);
  const matchedUsageUnitId = normalizeUnitId(normalizedUsage);

  const supplierName = (row.Proveedor || row.Supplier || 'Por definir').trim();
  const branchId = options?.branchId || getActiveBranchIdFallback();

  // ResourceType and catalog flags
  const isDirectProduct = classification === 'product';
  const resourceType = isDirectProduct ? 'product' : (classification === 'supply' ? 'supply' : 'ingredient');
  const isAvailableInCatalog = isDirectProduct;
  const mostrar_en_catalogo = isDirectProduct;

  // Category determination & inference
  const category = inferInventoryCategory(
    name,
    row.Categoría || row.Categoria || row.Category,
    operationalZone,
    classification
  );
  const categorySlug = `cat-${cleanString(category).replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`;
  const categoryId = categorySlug;
  const categoryName = category;

  // Costing calculations
  const costing = calculateCostingMetrics(purchaseCost, pesoBruto, pesoNeto);

  // Conversion ratio: quantity of usageUnit in 1 purchaseUnit (e.g. 1000 gr in 1 kg, 33.814 oz in 1 lt)
  const ratio = convertQuantity(1, normalizedPurchase, normalizedUsage);
  const conversionRatio = ratio > 0 ? ratio : 1.0;

  // Cost per 1 usageUnit: unitCostNet * (purchaseUnits in 1 usageUnit)
  // Dynamic dimensional calculation without premature 2-decimal truncation
  const usageFactor = convertQuantity(1, normalizedUsage, normalizedPurchase);
  const rawUnitCostUsage = costing.unitCostNet * usageFactor;
  const unitCostUsage = Number(rawUnitCostUsage.toFixed(6)) || rawUnitCostUsage;

  // Slug-based deterministic ID for brand new creations
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  const idPrefix = classification === 'supply' ? 'ins-sup' : classification === 'product' ? 'ins-prd' : 'ins-ing';
  const id = `${idPrefix}-${slug || index}`;

  const cantidadFisicaImportada = pesoNeto > 0 ? pesoNeto : pesoBruto;
  const stockByBranch: Record<string, number> = {
    [branchId]: cantidadFisicaImportada
  };
  const reservedStockByBranch: Record<string, number> = {
    [branchId]: 0
  };

  const sucursalStock: SucursalStock[] = [
    {
      sucursalId: branchId,
      stockActual: cantidadFisicaImportada,
      batchObservations: `Importado desde catálogo Excel (${operationZone})`
    }
  ];

  const totalStock = cantidadFisicaImportada;

  return {
    id,
    name,
    category,
    categoryId,
    categoryName,
    resourceType,
    purchaseUnit: normalizedPurchase,
    purchaseUnitId: matchedPurchaseUnitId,
    countUnit: normalizedUsage,
    countUnitId: matchedUsageUnitId,
    usageUnit: normalizedUsage,
    usageUnitId: matchedUsageUnitId,
    conversionRatio,
    conversionMultiplier: conversionRatio,
    unitCostUsage,
    yieldFactor: pesoBruto > 0 ? Math.round((pesoNeto / pesoBruto) * 1000) / 1000 : 1.0,
    density: 1.0,
    bottleTareWeightGrams: 0,
    purchaseCost,
    gainPercentage: 0,
    isTaxable: false,
    taxPercentage: 0,
    stockMinLimit: 5,
    theoreticalStock: totalStock,
    realPhysicalStock: totalStock,
    currentStock: totalStock,
    reservedStock: 0,
    availableStock: totalStock,
    stockByBranch,
    reservedStockByBranch,
    abcClassification: 'B',
    supplierId: supplierName,
    sucursalStock,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    branchId,
    inventoryType: 'CONSUMABLE',
    operationalZone,
    operationZone,
    supplyCategory: classification === 'supply' ? (category === 'Empaques y Desechables' ? 'Empaques / Desechables' : category) : undefined,
    isPackagingDesechable: classification === 'supply',
    cantidadComprada: pesoBruto,
    cantidadUtilizable: cantidadFisicaImportada,
    usable_quantity: cantidadFisicaImportada,
    mermaPercentage: costing.wastePercentage,
    factorCorreccion: costing.correctionFactor,
    costoUnitarioBruto: costing.unitCostGross,
    costoUnitarioReal: costing.unitCostNet,
    isActive: true,
    activo_catalogo: isAvailableInCatalog,
    isAvailableInCatalog,
    mostrar_en_catalogo
  };
}

/**
 * Reads binary File, Blob or ArrayBuffer and parses it with SheetJS (XLSX).
 * Returns array of raw row objects.
 */
export async function readExcelFileRows(fileOrBuffer: File | Blob | ArrayBuffer): Promise<ExcelProductRawRow[]> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else if ('arrayBuffer' in fileOrBuffer) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error('Formato de archivo inválido para lectura Excel');
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.Sheets['Hoja1'] ? 'Hoja1' : workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('El archivo Excel no contiene hojas de datos válidas.');
  }

  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<ExcelProductRawRow>(sheet, { defval: '' });
}

/**
 * Parses and validates an Excel inventory file, comparing with current Dexie database items
 * to produce an interactive preview (first 10 records, counts of new vs update, detected suppliers).
 */
export async function parseInventoryExcel(
  fileOrBuffer: File | Blob | ArrayBuffer,
  options?: ExcelImportOptions
): Promise<ExcelParsedInventoryData> {
  const fileName = (fileOrBuffer as File)?.name || 'Catalogo.xlsx';
  const rawRows = await readExcelFileRows(fileOrBuffer);

  // Load existing items from Dexie for fast in-memory case-insensitive lookup
  const existingItems = await db.inventoryItems.toArray();
  const existingNameMap = new Map<string, InventoryItem>();
  existingItems.forEach(item => {
    existingNameMap.set(cleanString(item.name), item);
  });

  const suppliersSet = new Set<string>();
  const candidates: ProcessedInventoryItemCandidate[] = [];
  const errors: { row: number; item?: string; error: string }[] = [];
  const zoneBreakdown: Record<OperationalZone, number> = {
    cocina: 0,
    bar: 0,
    licuadoras: 0,
    salon_servicio: 0,
    general_operaciones: 0
  };

  let newCount = 0;
  let updateCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNumber = i + 2; // Accounting for Excel 1-indexed + header row
    const rawName = (row.Insumos || row.Insumo || row.Nombre || row.Producto || '').trim();

    if (!rawName) {
      continue; // Skip blank rows
    }

    try {
      const normalizedItem = normalizeExcelProductRow(row, rowNumber, options);
      if (!normalizedItem) continue;

      const rawSupplier = (row.Proveedor || 'Por definir').trim();
      if (rawSupplier && rawSupplier !== 'Por definir') {
        suppliersSet.add(rawSupplier);
      }

      const existingMatch = existingNameMap.get(cleanString(normalizedItem.name));
      const isNew = !existingMatch;

      if (isNew) {
        newCount++;
      } else {
        updateCount++;
        // Preserve existing item ID so we perform clean in-place upsert
        normalizedItem.id = existingMatch.id;
        const targetBranch = normalizeBranchId(options?.branchId || getActiveBranchIdFallback());
        const branchStockQty = normalizedItem.currentStock || 0;
        const mergedStockByBranch = consolidateStockByBranch(existingMatch.stockByBranch);
        mergedStockByBranch[targetBranch] = branchStockQty;
        normalizedItem.stockByBranch = mergedStockByBranch;

        let mergedSucursal = consolidateSucursalStock(existingMatch.sucursalStock);
        const sIdx = mergedSucursal.findIndex(s => areBranchIdsEqual(s.sucursalId, targetBranch));
        if (sIdx >= 0) {
          mergedSucursal[sIdx] = {
            ...mergedSucursal[sIdx],
            sucursalId: targetBranch,
            stockActual: branchStockQty
          };
        } else {
          mergedSucursal.push({
            sucursalId: targetBranch,
            stockActual: branchStockQty,
            batchObservations: `Actualizado desde Excel (${normalizedItem.operationZone || 'General'})`
          });
        }
        normalizedItem.sucursalStock = mergedSucursal;

        const recalculatedTotal = Object.values(mergedStockByBranch).reduce((sum, v) => sum + (Number(v) || 0), 0);
        normalizedItem.currentStock = recalculatedTotal;
        normalizedItem.realPhysicalStock = recalculatedTotal;
        normalizedItem.theoreticalStock = recalculatedTotal;
        normalizedItem.availableStock = Math.max(0, recalculatedTotal - (existingMatch.reservedStock || 0));

        const mergedReservedByBranch = consolidateStockByBranch(existingMatch.reservedStockByBranch);
        mergedReservedByBranch[targetBranch] = mergedReservedByBranch[targetBranch] || 0;
        normalizedItem.reservedStockByBranch = mergedReservedByBranch;
      }

      const zone = (normalizedItem.operationalZone as OperationalZone) || 'general_operaciones';
      zoneBreakdown[zone] = (zoneBreakdown[zone] || 0) + 1;

      const classification = detectResourceType(
        normalizedItem.name,
        row['Linea de Produccion'] || row['Linea de Productos'] || row.Linea
      );

      candidates.push({
        item: normalizedItem,
        isNew,
        supplierName: rawSupplier,
        originalRowNumber: rowNumber,
        classification,
        costingMetrics: {
          wastePercentage: normalizedItem.mermaPercentage || 0,
          correctionFactor: normalizedItem.factorCorreccion || 1.0,
          unitCostNet: normalizedItem.costoUnitarioReal || normalizedItem.purchaseCost,
          unitCostGross: normalizedItem.costoUnitarioBruto || normalizedItem.purchaseCost,
          purchaseUnit: normalizedItem.purchaseUnit,
          usageUnit: normalizedItem.usageUnit || normalizedItem.purchaseUnit,
          conversionRatio: normalizedItem.conversionRatio || 1.0,
          unitCostUsage: normalizedItem.unitCostUsage || normalizedItem.costoUnitarioReal || normalizedItem.purchaseCost
        }
      });
    } catch (err: any) {
      errors.push({
        row: rowNumber,
        item: rawName,
        error: err?.message || String(err)
      });
    }
  }

  return {
    fileName,
    totalRows: rawRows.length,
    validCount: candidates.length,
    newCount,
    updateCount,
    suppliersDetected: Array.from(suppliersSet),
    zoneBreakdown,
    previewItems: candidates.slice(0, 10),
    candidates,
    errors
  };
}

/**
 * Executes atomic upsert of parsed items in Dexie.js and enqueues domain events into sync_outbox.
 * Links or creates suppliers as required.
 */
export async function commitInventoryExcelImport(
  parsedData: ExcelParsedInventoryData,
  options?: ExcelImportOptions,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<ExcelImportResult> {
  const result: ExcelImportResult = {
    totalProcessed: parsedData.candidates.length,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    suppliersCreated: 0,
    categoriesCreated: 0,
    errors: [],
    zoneBreakdown: {
      cocina: 0,
      bar: 0,
      licuadoras: 0,
      salon_servicio: 0,
      general_operaciones: 0
    },
    items: []
  };

  // 1. Resolve & create suppliers
  const existingSuppliers = await db.suppliers.toArray();
  const supplierMap = new Map<string, Supplier>();
  existingSuppliers.forEach(s => supplierMap.set(cleanString(s.name), s));

  const suppliersToCreate: Supplier[] = [];
  for (const supplierName of parsedData.suppliersDetected) {
    const clean = cleanString(supplierName);
    if (!supplierMap.has(clean)) {
      const slug = clean.replace(/[^a-z0-9]+/g, '-').slice(0, 24);
      const newSupplier: Supplier = {
        id: `sup-${slug || Date.now()}`,
        name: supplierName,
        contact: 'Ventas / Distribución',
        email: `${slug || 'proveedor'}@foodie.local`,
        paymentTerms: 'Contado / 30 días',
        categoriesSupplied: ['Insumos Importados'],
        updatedAt: new Date().toISOString()
      };
      suppliersToCreate.push(newSupplier);
      supplierMap.set(clean, newSupplier);
    }
  }

  // 1.5. Resolve & register categories in db.categories (and respective category tables)
  const existingCategories = await db.categories.toArray();
  const existingCatNames = new Set(existingCategories.map(c => cleanString(c.name)));

  const categoriesToCreate: Array<{ id: string; name: string; classification: InventoryItemClassification }> = [];
  for (const candidate of parsedData.candidates) {
    const itemCat = candidate.item.category;
    if (itemCat) {
      const cleanCat = cleanString(itemCat);
      if (!existingCatNames.has(cleanCat)) {
        const catSlug = `cat-${cleanCat.replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`;
        categoriesToCreate.push({
          id: candidate.item.categoryId || catSlug,
          name: itemCat,
          classification: candidate.classification
        });
        existingCatNames.add(cleanCat);
      }
    }
  }

  // 2. Process all candidates inside an atomic Dexie transaction
  const itemsToPut: InventoryItem[] = [];
  const eventsToQueue: Array<{ type: string; payload: any }> = [];
  const targetBranchId = options?.branchId ? normalizeBranchId(options.branchId) : undefined;

  for (let idx = 0; idx < parsedData.candidates.length; idx++) {
    const candidate = parsedData.candidates[idx];
    const item = { ...candidate.item };

    if (targetBranchId) {
      const importedBranchQty = item.cantidadUtilizable ?? item.currentStock ?? 0;
      item.branchId = targetBranchId;
      const sbb = consolidateStockByBranch(item.stockByBranch);
      if (candidate.isNew) {
        item.stockByBranch = { [targetBranchId]: importedBranchQty };
        item.sucursalStock = [
          {
            sucursalId: targetBranchId,
            stockActual: importedBranchQty,
            batchObservations: `Importado desde catálogo Excel (${item.operationZone || 'General'})`
          }
        ];
        item.currentStock = importedBranchQty;
        item.realPhysicalStock = importedBranchQty;
        item.theoreticalStock = importedBranchQty;
        item.availableStock = importedBranchQty;
      } else {
        sbb[targetBranchId] = importedBranchQty;
        item.stockByBranch = sbb;
        const ss = consolidateSucursalStock(item.sucursalStock);
        const sIdx = ss.findIndex(s => areBranchIdsEqual(s.sucursalId, targetBranchId));
        if (sIdx >= 0) {
          ss[sIdx] = { ...ss[sIdx], sucursalId: targetBranchId, stockActual: importedBranchQty };
        } else {
          ss.push({ sucursalId: targetBranchId, stockActual: importedBranchQty });
        }
        item.sucursalStock = ss;
        const total = Object.values(sbb).reduce((sum, v) => sum + (Number(v) || 0), 0);
        item.currentStock = total;
        item.realPhysicalStock = total;
        item.theoreticalStock = total;
        item.availableStock = Math.max(0, total - (item.reservedStock || 0));
      }
    }

    // Link resolved supplier ID
    const matchedSupplier = supplierMap.get(cleanString(candidate.supplierName));
    if (matchedSupplier) {
      item.supplierId = matchedSupplier.id;
    } else {
      item.supplierId = options?.defaultSupplierId || 'prov-generic';
    }

    itemsToPut.push(item);

    const eventType = candidate.isNew ? 'InventoryItemCreated' : 'InventoryItemUpdated';
    eventsToQueue.push({
      type: eventType,
      payload: {
        collectionName: 'inventoryItems',
        docId: item.id,
        data: item,
        timestamp: Date.now()
      }
    });

    if (candidate.isNew) {
      result.importedCount++;
    } else {
      result.updatedCount++;
    }

    const zone = (item.operationalZone as OperationalZone) || 'general_operaciones';
    result.zoneBreakdown[zone] = (result.zoneBreakdown[zone] || 0) + 1;
    result.items.push(item);

    if (onProgress && idx % 15 === 0) {
      onProgress(Math.round(((idx + 1) / parsedData.candidates.length) * 100), idx + 1, parsedData.candidates.length);
    }
  }

  // Execute atomic transaction
  await db.transaction('rw', [
    db.inventoryItems, 
    db.suppliers, 
    db.sync_outbox,
    db.ingredientCategories,
    db.supplyCategories,
    db.menuCategories
  ], async () => {
    // A. Bulk add suppliers
    if (suppliersToCreate.length > 0) {
      await db.suppliers.bulkPut(suppliersToCreate);
      for (const sup of suppliersToCreate) {
        await enqueueOfflineEvent('SupplierCreated', {
          collectionName: 'suppliers',
          docId: sup.id,
          data: sup,
          timestamp: Date.now()
        });
      }
    }

    // B. Bulk add missing categories to their corresponding tables without polluting menuCategories
    if (categoriesToCreate.length > 0) {
      const cleanCatObjs = categoriesToCreate.map(({ id, name }) => ({ id, name }));
      await db.categories.bulkPut(cleanCatObjs);
      for (const cat of categoriesToCreate) {
        const record = { id: cat.id, name: cat.name };
        if (cat.classification === 'supply') {
          await db.supplyCategories.put(record);
        } else if (cat.classification === 'product') {
          await db.menuCategories.put(record);
        } else {
          await db.ingredientCategories.put(record);
        }
        await enqueueOfflineEvent('CategoryCreated', {
          collectionName: cat.classification === 'supply' ? 'supplyCategories' : cat.classification === 'product' ? 'menuCategories' : 'ingredientCategories',
          docId: cat.id,
          data: record,
          timestamp: Date.now()
        });
      }
    }

    // C. Bulk put items
    await db.inventoryItems.bulkPut(itemsToPut);

    // D. Enqueue outbox synchronization events
    for (const ev of eventsToQueue) {
      await enqueueOfflineEvent(ev.type, ev.payload);
    }
  });

  result.suppliersCreated = suppliersToCreate.length;
  result.categoriesCreated = categoriesToCreate.length;

  if (onProgress) {
    onProgress(100, parsedData.candidates.length, parsedData.candidates.length);
  }

  return result;
}

/**
 * End-to-end convenience method: Reads Excel File, processes items, updates suppliers,
 * saves to Dexie.js and enqueues to sync_outbox.
 */
export async function processInventoryExcel(
  fileOrBuffer: File | Blob | ArrayBuffer,
  options?: ExcelImportOptions,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<ExcelImportResult> {
  const parsedData = await parseInventoryExcel(fileOrBuffer, options);
  return commitInventoryExcelImport(parsedData, options, onProgress);
}

/**
 * Backward compatibility: imports an array of Excel rows into Dexie.js.
 */
export async function importExcelCatalog(
  rows: ExcelProductRawRow[],
  options?: ExcelImportOptions
): Promise<ExcelImportResult> {
  const result: ExcelImportResult = {
    totalProcessed: rows.length,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    suppliersCreated: 0,
    categoriesCreated: 0,
    errors: [],
    zoneBreakdown: {
      cocina: 0,
      bar: 0,
      licuadoras: 0,
      salon_servicio: 0,
      general_operaciones: 0
    },
    items: []
  };

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    try {
      const item = normalizeExcelProductRow(rawRow, i + 1, options);
      if (!item) {
        result.skippedCount++;
        continue;
      }

      // Ensure category is in db.categories
      if (item.category) {
        const catSlug = item.categoryId || `cat-${cleanString(item.category).replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`;
        const existingCat = await db.categories.get(catSlug);
        if (!existingCat) {
          await db.categories.put({ id: catSlug, name: item.category });
          await db.supplyCategories.put({ id: catSlug, name: item.category });
          await db.menuCategories.put({ id: catSlug, name: item.category });
          result.categoriesCreated++;
        }
      }

      const existing = await db.inventoryItems.get(item.id);
      if (existing) {
        if (options?.overwrite !== false) {
          await db.inventoryItems.put(item);
          await enqueueOfflineEvent('InventoryItemUpdated', {
            collectionName: 'inventoryItems',
            docId: item.id,
            data: item,
            timestamp: Date.now()
          });
          result.updatedCount++;
        } else {
          result.skippedCount++;
        }
      } else {
        await db.inventoryItems.add(item);
        await enqueueOfflineEvent('InventoryItemCreated', {
          collectionName: 'inventoryItems',
          docId: item.id,
          data: item,
          timestamp: Date.now()
        });
        result.importedCount++;
      }

      const zone = (item.operationalZone as OperationalZone) || 'general_operaciones';
      result.zoneBreakdown[zone] = (result.zoneBreakdown[zone] || 0) + 1;
      result.items.push(item);
    } catch (err: any) {
      result.errors.push({
        row: i + 1,
        item: rawRow.Insumos || rawRow.Nombre || `Fila ${i + 1}`,
        error: err?.message || String(err)
      });
    }
  }

  return result;
}

/**
 * Parses simple CSV or TSV text into an array of row objects.
 */
export function parseDelimitedTextToRows(text: string, delimiter: string = ','): ExcelProductRawRow[] {
  if (!text || !text.trim()) return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows: ExcelProductRawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const rowObj: ExcelProductRawRow = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(rowObj);
  }

  return rows;
}
