// src/utils/unitConversion.ts
import { DEFAULT_UNIT_EQUIVALENCES } from '../db/settingsStore';

export interface UnitCatalogItem {
  id: string;
  name: string;
  baseUnit: string;
  equivalenceBase: number;
  [key: string]: any;
}

export type UnitsCatalogInput =
  | UnitCatalogItem[]
  | Record<string, { baseEquivalence?: number; equivalenceBase?: number; baseUnit: string }>
  | undefined
  | null;

export interface CalculateUsableQuantityAndCostParams {
  purchaseQuantity: number;
  purchasePrice: number;
  purchaseUnitId?: string;
  usageUnitId?: string;
  unitsCatalog?: UnitsCatalogInput;
}

export interface CalculateUsableQuantityAndCostResult {
  usableQuantity: number;
  unitCost: number;
  directFactor: number;
  factor: number;
  isCompatible: boolean;
}

/**
 * Normalizes any units catalog representation (Array or Record/Object) into an array of UnitCatalogItem.
 */
export function normalizeUnitsCatalog(unitsCatalog?: UnitsCatalogInput): UnitCatalogItem[] {
  if (Array.isArray(unitsCatalog) && unitsCatalog.length > 0) {
    return unitsCatalog.map(u => ({
      id: u.id || u.name || '',
      name: u.name || u.id || '',
      baseUnit: normalizeBaseUnit(u.baseUnit),
      equivalenceBase: Number(u.equivalenceBase ?? u.baseEquivalence ?? 1) || 1
    }));
  }

  const recordSource = (unitsCatalog && typeof unitsCatalog === 'object' && !Array.isArray(unitsCatalog))
    ? (unitsCatalog as Record<string, any>)
    : DEFAULT_UNIT_EQUIVALENCES;

  return Object.entries(recordSource).map(([key, val]) => ({
    id: key,
    name: key,
    baseUnit: normalizeBaseUnit(val.baseUnit),
    equivalenceBase: Number(val.equivalenceBase ?? val.baseEquivalence ?? 1) || 1
  }));
}

/**
 * Normalizes dimension base units:
 * - 'ml', 'l', 'mililitro', 'litro' -> 'ml'
 * - 'g', 'kg', 'lb', 'gramo', 'kilogramo', 'libra' -> 'g'
 * - 'und', 'unidad', 'unidades', 'u' -> 'und'
 */
export function normalizeBaseUnit(baseUnit?: string): string {
  if (!baseUnit) return 'g';
  const clean = baseUnit.trim().toLowerCase();
  if (clean.includes('ml') || clean.includes('l')) return 'ml';
  if (clean.includes('und') || clean.includes('un')) return 'und';
  if (clean.includes('g') || clean.includes('kg') || clean.includes('lb')) return 'g';
  return clean;
}

/**
 * Resolves a unit item by searching id, name, lowercase variants, and standard volume/weight representations.
 */
export function findUnitInCatalog(catalog: UnitCatalogItem[], unitIdOrName?: string): UnitCatalogItem | undefined {
  if (!unitIdOrName) return undefined;
  const target = unitIdOrName.trim().toLowerCase();

  // 1. Direct match on id or name
  let found = catalog.find(u => 
    u.id?.toLowerCase() === target || 
    u.name?.toLowerCase() === target
  );
  if (found) return found;

  // 2. Canonical abbreviations and synonyms
  const aliasMap: Record<string, string> = {
    'g': 'gramo',
    'gr': 'gramo',
    'g.': 'gramo',
    'gramos': 'gramo',
    'kg': 'kilogramo',
    'kilo': 'kilogramo',
    'kilos': 'kilogramo',
    'kilogramos': 'kilogramo',
    'ml': 'mililitro',
    'cc': 'mililitro',
    'ml.': 'mililitro',
    'mililitros': 'mililitro',
    'l': 'litro',
    'lt': 'litro',
    'litros': 'litro',
    'oz': 'onza',
    'oz.': 'onza',
    'onzas': 'onza',
    'fl oz': 'onza',
    'fl_oz': 'onza',
    'lb': 'libra',
    'lbs': 'libra',
    'libras': 'libra',
    'und': 'unidad',
    'u': 'unidad',
    'un': 'unidad',
    'unidades': 'unidad'
  };

  const canonical = aliasMap[target];
  if (canonical) {
    found = catalog.find(u => 
      u.id?.toLowerCase() === canonical || 
      u.name?.toLowerCase() === canonical
    );
    if (found) return found;
  }

  // 3. Embedded numeric formats (e.g. "Botella 750ml", "Lata 355ml", "Paquete 500g")
  const matchNum = target.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz|lb|und)?/);
  if (matchNum && matchNum[1]) {
    const val = parseFloat(matchNum[1].replace(',', '.'));
    const tag = (matchNum[2] || '').toLowerCase();
    if (val > 0) {
      if (tag === 'ml' || target.includes('ml')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: val };
      }
      if (tag === 'l' || target.includes('l')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: val * 1000 };
      }
      if (tag === 'kg' || target.includes('kg') || target.includes('kilo')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: val * 1000 };
      }
      if (tag === 'g' || target.includes('g') || target.includes('gramo')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: val };
      }
      if (tag === 'oz' || target.includes('oz') || target.includes('onza')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: val * 29.574 };
      }
      if (tag === 'lb' || target.includes('lb') || target.includes('libra')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: val * 500 };
      }
      if (tag === 'und' || target.includes('und') || target.includes('unidad')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'und', equivalenceBase: val };
      }
      if (target.includes('botella') || target.includes('lata') || target.includes('copa') || target.includes('vaso')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: val };
      }
      if (target.includes('paquete') || target.includes('bolsa')) {
        return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: val };
      }
    }
  }

  // 4. Default baseline fallback
  if (target.includes('mililitro') || target === 'ml') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: 1 };
  if (target.includes('litro') || target === 'l') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: 1000 };
  if (target.includes('onza') || target === 'oz') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'ml', equivalenceBase: 29.574 };
  if (target.includes('kilogramo') || target.includes('kilo') || target === 'kg') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: 1000 };
  if (target.includes('libra') || target === 'lb') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: 500 };
  if (target.includes('gramo') || target === 'g') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'g', equivalenceBase: 1 };
  if (target.includes('unidad') || target === 'und' || target === 'u') return { id: unitIdOrName, name: unitIdOrName, baseUnit: 'und', equivalenceBase: 1 };

  return undefined;
}

/**
 * Universal Unit Conversion Engine:
 * Calculates usable quantity, unit cost, and direct conversion factor based on System Settings catalog.
 * Follows strict floating-point precision rule without intermediate truncations.
 */
export function calculateUsableQuantityAndCost({
  purchaseQuantity,
  purchasePrice,
  purchaseUnitId,
  usageUnitId,
  unitsCatalog
}: CalculateUsableQuantityAndCostParams): CalculateUsableQuantityAndCostResult {
  const catalog = normalizeUnitsCatalog(unitsCatalog);

  const pUnit = findUnitInCatalog(catalog, purchaseUnitId);
  const uUnit = findUnitInCatalog(catalog, usageUnitId);

  // Validación: si las unidades no son de la misma dimensión base (ej. g con ml), mantener 1:1 o alertar incompatibilidad
  if (!pUnit || !uUnit || pUnit.baseUnit !== uUnit.baseUnit) {
    const fallbackCost = purchasePrice / (purchaseQuantity || 1);
    return {
      usableQuantity: purchaseQuantity,
      unitCost: isNaN(fallbackCost) || !isFinite(fallbackCost) ? 0 : fallbackCost,
      directFactor: 1,
      factor: 1,
      isCompatible: false
    };
  }

  // 1. Convertir a unidad base absoluta (g, ml o und)
  const quantityInBase = purchaseQuantity * (Number(pUnit.equivalenceBase) || 1);

  // 2. Convertir de unidad base a unidad de uso final (sin truncar a dos decimales)
  const usableQuantity = quantityInBase / (Number(uUnit.equivalenceBase) || 1);

  // 3. Costo unitario real en la unidad de uso
  const unitCost = usableQuantity > 0 ? purchasePrice / usableQuantity : 0;

  // Factor de visualización: relación directa entre ambas unidades
  const directFactor = (Number(pUnit.equivalenceBase) || 1) / (Number(uUnit.equivalenceBase) || 1);

  return {
    usableQuantity,
    unitCost,
    directFactor,
    factor: directFactor,
    isCompatible: true
  };
}

/**
 * Pure helper function to convert a quantity from one unit to another using the catalog.
 */
export function convertUnits(
  quantity: number,
  fromUnitId: string,
  toUnitId: string,
  unitsCatalog?: UnitsCatalogInput
): number {
  const res = calculateUsableQuantityAndCost({
    purchaseQuantity: quantity,
    purchasePrice: 0,
    purchaseUnitId: fromUnitId,
    usageUnitId: toUnitId,
    unitsCatalog
  });
  return res.usableQuantity;
}
