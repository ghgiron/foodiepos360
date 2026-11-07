// src/utils/costEngine.ts

export interface UnitEquivalenceMap {
  [unitName: string]: {
    baseEquivalence: number;
    baseUnit: string;
  };
}

export interface UnitBaseInfo {
  baseValue: number;
  baseType: 'ml' | 'g' | 'und';
}

/**
 * Extracts fundamental base value and measurement domain (ml, g, und) for any unit string.
 * Supports user configured equivalences, standard conversions, and embedded numeric units (e.g. "Botella 750ml").
 */
export function parseUnitBaseInfo(
  unitStr: string,
  unitEquivalences?: UnitEquivalenceMap
): UnitBaseInfo {
  if (!unitStr) return { baseValue: 1, baseType: 'und' };
  const s = unitStr.trim().toLowerCase();

  // 1. Check user configured equivalences in Dexie/System Settings
  if (unitEquivalences) {
    if (unitEquivalences[unitStr]) {
      const eq = unitEquivalences[unitStr];
      const bUnit = (eq.baseUnit || 'g').toLowerCase();
      const bType: 'ml' | 'g' | 'und' = (bUnit.includes('ml') || bUnit.includes('l')) ? 'ml' : (bUnit.includes('und') || bUnit.includes('un')) ? 'und' : 'g';
      return { baseValue: Number(eq.baseEquivalence) || 1, baseType: bType };
    }
    for (const [k, eq] of Object.entries(unitEquivalences)) {
      if (k.toLowerCase() === s) {
        const bUnit = (eq.baseUnit || 'g').toLowerCase();
        const bType: 'ml' | 'g' | 'und' = (bUnit.includes('ml') || bUnit.includes('l')) ? 'ml' : (bUnit.includes('und') || bUnit.includes('un')) ? 'und' : 'g';
        return { baseValue: Number(eq.baseEquivalence) || 1, baseType: bType };
      }
    }
  }

  // 2. Extract embedded numbers and volumetric/mass units (e.g. "Botella 750ml", "Botella (750ml)", "Lata 355 ml", "Paquete 500g")
  const matchWithNumber = s.match(/(\d+(?:[\.,]\d+)?)\s*(ml|mililitros|mililitro|l|litros|litro|g|gramos|gramo|kg|kilos|kilo|kilogramos|oz|onzas|onza|lb|libras|libra|und|unidades|unidad)?/i);
  if (matchWithNumber) {
    const num = parseFloat(matchWithNumber[1].replace(',', '.'));
    const unitTag = (matchWithNumber[2] || '').toLowerCase();

    if (num > 0) {
      if (unitTag === 'ml' || unitTag === 'mililitro' || unitTag === 'mililitros' || s.includes('ml') || s.includes('mililitro')) {
        return { baseValue: num, baseType: 'ml' };
      }
      if (unitTag === 'l' || unitTag === 'litro' || unitTag === 'litros' || s.includes('litro')) {
        return { baseValue: num * 1000, baseType: 'ml' };
      }
      if (unitTag === 'kg' || unitTag === 'kilo' || unitTag === 'kilos' || unitTag === 'kilogramos') {
        return { baseValue: num * 1000, baseType: 'g' };
      }
      if (unitTag === 'g' || unitTag === 'gramo' || unitTag === 'gramos' || s.includes('gramo')) {
        return { baseValue: num, baseType: 'g' };
      }
      if (unitTag === 'oz' || unitTag === 'onza' || unitTag === 'onzas') {
        return { baseValue: num * 29.574, baseType: 'ml' };
      }
      if (unitTag === 'lb' || unitTag === 'libra' || unitTag === 'libras') {
        return { baseValue: num * 500, baseType: 'g' };
      }
      if (unitTag === 'und' || unitTag === 'unidad' || unitTag === 'unidades') {
        return { baseValue: num, baseType: 'und' };
      }
      // If no explicit unit tag but bottle/can keywords:
      if (s.includes('botella') || s.includes('lata') || s.includes('garrafa') || s.includes('copa') || s.includes('vaso')) {
        return { baseValue: num, baseType: 'ml' };
      }
      if (s.includes('paquete') || s.includes('bolsa') || s.includes('porcion') || s.includes('porción')) {
        return { baseValue: num, baseType: 'g' };
      }
    }
  }

  // 3. Normalized standard names
  if (s.includes('mililitro') || s === 'ml') return { baseValue: 1, baseType: 'ml' };
  if (s.includes('litro') || s === 'l') return { baseValue: 1000, baseType: 'ml' };
  // Standard Bar & Kitchen conversion: 1 Onza (oz) = 29.574 ml
  if (s.includes('onza') || s === 'oz' || s === 'fl oz' || s === 'fl_oz') return { baseValue: 29.574, baseType: 'ml' };
  if (s.includes('kilogramo') || s.includes('kilo') || s === 'kg') return { baseValue: 1000, baseType: 'g' };
  if (s.includes('libra') || s === 'lb') return { baseValue: 500, baseType: 'g' }; // Commercial 500g or 453.59g
  if (s.includes('gramo') || s === 'g') return { baseValue: 1, baseType: 'g' };
  if (s.includes('galon') || s.includes('galón') || s === 'gal') return { baseValue: 3785.41, baseType: 'ml' };
  if (s.includes('unidad') || s === 'und' || s === 'un') return { baseValue: 1, baseType: 'und' };

  return { baseValue: 1, baseType: 'und' };
}

/**
 * Calculates dynamic equivalence multiplier between a Purchase Unit and a Unit of Use.
 * E.g.:
 * - Botella 750ml -> Onza (30ml) = 750 / 30 = 25 oz
 * - Litro 1000ml  -> Onza (30ml) = 1000 / 30 = 33.33 oz
 * - Botella 700ml -> Onza (30ml) = 700 / 30 = 23.33 oz
 * - Lata 355ml    -> Onza (30ml) = 355 / 30 = 11.83 oz
 * - Kilogramo     -> Gramo = 1000 g
 * - Libra (500g)  -> Gramo = 500 g
 * - Kilogramo     -> Libra (500g) = 2 lb
 */
export function getDynamicUnitEquivalence(
  pUnit: string,
  uUnit: string,
  unitEquivalences?: UnitEquivalenceMap
): number {
  if (!pUnit) return 1.00;
  const pNorm = pUnit.trim().toLowerCase();
  const uNorm = uUnit ? uUnit.trim().toLowerCase() : '';

  if (uNorm && pNorm === uNorm) return 1.00;

  const baseFrom = parseUnitBaseInfo(pUnit, unitEquivalences);
  const baseTo = parseUnitBaseInfo(uUnit, unitEquivalences);

  if (baseFrom.baseValue > 0 && baseTo.baseValue > 0) {
    const rawEquiv = baseFrom.baseValue / baseTo.baseValue;
    return Number(rawEquiv.toFixed(2));
  }

  return 1.00;
}

/**
 * Normalizes any free-form, abbreviated, or conversational unit string to match configured official system units.
 * E.g. "g", "gr", "gramos", "Gramos" -> "Gramo"
 *      "kg", "kilos", "kilogramos" -> "Kilogramo"
 *      "ml", "cc", "mililitros" -> "Mililitro"
 *      "l", "lt", "litros" -> "Litro"
 *      "lb", "libras" -> "Libra"
 *      "oz", "onzas" -> "Onza"
 *      "und", "u", "unidades", "unidad" -> "Unidad"
 */
export function normalizeUnitToOfficial(unitStr: string | undefined | null, officialUnits?: string[]): string {
  if (!unitStr) return 'Gramo';
  const clean = unitStr.trim().toLowerCase();

  // 1. Direct match in official units list (case-insensitive)
  if (officialUnits && officialUnits.length > 0) {
    const directMatch = officialUnits.find(u => u.toLowerCase() === clean);
    if (directMatch) return directMatch;
  }

  // 2. Abbreviation and synonym dictionary
  if (clean === 'g' || clean === 'gr' || clean === 'gramo' || clean === 'gramos' || clean === 'g.' || clean === 'grm') return 'Gramo';
  if (clean === 'kg' || clean === 'kilo' || clean === 'kilos' || clean === 'kilogramo' || clean === 'kilogramos' || clean === 'kg.') return 'Kilogramo';
  if (clean === 'ml' || clean === 'cc' || clean === 'mililitro' || clean === 'mililitros' || clean === 'ml.') return 'Mililitro';
  if (clean === 'l' || clean === 'lt' || clean === 'litro' || clean === 'litros' || clean === 'l.') return 'Litro';
  if (clean === 'lb' || clean === 'lbs' || clean === 'libra' || clean === 'libras' || clean === 'lb.') return 'Libra';
  if (clean === 'oz' || clean === 'onza' || clean === 'onzas' || clean === 'fl oz' || clean === 'oz.') return 'Onza';
  if (clean === 'und' || clean === 'u' || clean === 'unidad' || clean === 'unidades' || clean === 'un' || clean === 'und.') return 'Unidad';
  if (clean.includes('750')) return 'Botella 750ml';
  if (clean.includes('700')) return 'Botella 700ml';
  if (clean.includes('355')) return 'Lata 355ml';

  // 3. Partial match in official units
  if (officialUnits && officialUnits.length > 0) {
    const partialMatch = officialUnits.find(u => u.toLowerCase().includes(clean) || clean.includes(u.toLowerCase()));
    if (partialMatch) return partialMatch;
  }

  // Capitalize first letter as fallback
  return unitStr.charAt(0).toUpperCase() + unitStr.slice(1);
}

export interface CostCalculationInput {
  purchaseCost: number | string;
  cantidadComprada: number | string;
  conversionMultiplier: number | string;
  cantidadUtilizable?: number | string;
}

export interface CostCalculationResult {
  rendimiento: number; // Percentage (e.g. 100.00 or 88.18)
  merma: number; // Percentage (e.g. 0.00 or 11.82)
  factor: number; // Factor de corrección (e.g. 1.00 or 1.13)
  costBruto: number; // Cost per unit of use without waste (Exact 2 decimals)
  costReal: number; // Cost per unit of use with waste applied (Exact 2 decimals)
  cantEquivalente: number; // Total units of use bought (buyQty * multiplier)
  effectiveUtilQty: number; // Integer rounded usable quantity
}

/**
 * Robust, unified cost and yield calculator enforcing the Golden Consistency Rule:
 * Costo Unitario * Total Unidades de Uso === Precio Total de Compra
 */
export function calculateCostMetrics(input: CostCalculationInput): CostCalculationResult {
  const cost = Number(input.purchaseCost) || 0;
  const buyQty = Number(input.cantidadComprada) || 0;
  const mult = Number(input.conversionMultiplier) || 1;
  const rawUtil = input.cantidadUtilizable !== undefined && input.cantidadUtilizable !== '' 
    ? Number(input.cantidadUtilizable) 
    : NaN;

  const cantEquivalente = buyQty * mult;

  if (cantEquivalente <= 0 || cost <= 0) {
    return {
      rendimiento: 100,
      merma: 0,
      factor: 1.00,
      costBruto: 0,
      costReal: 0,
      cantEquivalente: Number(cantEquivalente.toFixed(2)),
      effectiveUtilQty: Math.round(cantEquivalente)
    };
  }

  // Handle usable quantity with floating-point tolerance
  const isEssentiallyEqual = !isNaN(rawUtil) && Math.abs(rawUtil - cantEquivalente) <= 0.01;
  const hasCustomWaste = !isNaN(rawUtil) && rawUtil > 0 && rawUtil < cantEquivalente && !isEssentiallyEqual;
  const effectiveUtilQty = hasCustomWaste ? rawUtil : cantEquivalente;

  const rawRendimiento = (effectiveUtilQty / cantEquivalente) * 100;
  const rendimiento = isEssentiallyEqual ? 100 : Math.min(100, Math.max(0, rawRendimiento));
  const merma = hasCustomWaste ? Math.max(0, 100 - rendimiento) : 0;
  const factor = cantEquivalente / effectiveUtilQty;

  // Costo Bruto (por unidad de uso) = Precio de compra / Cantidad equivalente total
  const costoUnitarioBruto = cost / cantEquivalente;

  // Costo Real (por unidad de uso) = Precio de compra / Cantidad utilizable
  const costoRealPorUnidad = cost / effectiveUtilQty;

  return {
    rendimiento: Number(rendimiento.toFixed(2)),
    merma: Number(merma.toFixed(2)),
    factor: Number(factor.toFixed(2)),
    costBruto: Number(costoUnitarioBruto.toFixed(2)),
    costReal: Number(costoRealPorUnidad.toFixed(2)),
    cantEquivalente: Number(cantEquivalente.toFixed(2)),
    effectiveUtilQty: Number(effectiveUtilQty.toFixed(2))
  };
}

/**
 * Calculates the exact unit cost per unit of use/count for an inventory item.
 * For Ingredients: uses costoUnitarioReal or purchaseCost / (conversionMultiplier * cantidadComprada).
 * For Products/Supplies: uses purchaseCost or purchaseCost / conversionMultiplier.
 */
export function getItemUnitCost(item: {
  costoUnitarioReal?: number;
  costoUnitarioBruto?: number;
  purchaseCost?: number;
  conversionMultiplier?: number;
  equivalencia?: number;
  cantidadComprada?: number;
}): number {
  if (item.costoUnitarioReal !== undefined && item.costoUnitarioReal > 0) {
    return item.costoUnitarioReal;
  }
  if (item.costoUnitarioBruto !== undefined && item.costoUnitarioBruto > 0) {
    return item.costoUnitarioBruto;
  }
  const cost = Number(item.purchaseCost || 0);
  const mult = Number(item.conversionMultiplier || item.equivalencia || 1);
  const buyQty = Number(item.cantidadComprada || 1);
  const totalUsageUnits = buyQty * mult;

  if (totalUsageUnits > 1 && cost > 0) {
    return cost / totalUsageUnits;
  }
  return cost;
}

/**
 * Calculates the total valuation of an item in stock.
 * Valuation = Theoretical Stock (in count units) * Cost per Count Unit.
 */
export function getItemTotalValuation(item: {
  theoreticalStock?: number;
  realPhysicalStock?: number;
  costoUnitarioReal?: number;
  costoUnitarioBruto?: number;
  purchaseCost?: number;
  conversionMultiplier?: number;
  equivalencia?: number;
  cantidadComprada?: number;
}): number {
  const stock = Number(item.theoreticalStock ?? item.realPhysicalStock ?? 0);
  const unitCost = getItemUnitCost(item);
  return stock * unitCost;
}

/**
 * Calculates the exact cost per unit of use for an ingredient or item inside a Recipe / Subrecipe.
 * Resolves mathematical conversions between base measurement units (ml, g, und) and usage units (Onza, Libra, Kg, etc.).
 * 
 * Example:
 * If an item is purchased in ml (e.g. Botella 750ml at $47.200 -> $62.93/ml)
 * and used in 'Onza' (1 oz = 29.574 ml):
 * - contenidoTotalOz = 750 / 29.574 = 25.36 oz
 * - costoPorOz = 47200 / 25.36 = $1.861,19/oz (or $62.9333 * 29.574 = $1.861,19/oz).
 */
export function calculateRecipeItemUnitCost(
  item: {
    costoUnitarioReal?: number;
    costoUnitarioBruto?: number;
    purchaseCost?: number;
    countUnit?: string;
    usageUnit?: string;
    unitCostUsage?: number;
    contentPerPurchaseUnit?: number;
    conversionMultiplier?: number;
    equivalencia?: number;
  },
  recipeUnit: string,
  unitEquivalences?: UnitEquivalenceMap
): number {
  if (!item) return 0;

  const targetUnit = (recipeUnit || '').trim().toLowerCase();

  // 1. If item already has unitCostUsage precomputed and the unit matches directly
  const normUsageUnit = (item.usageUnit || '').trim().toLowerCase();
  if (
    item.unitCostUsage !== undefined &&
    item.unitCostUsage > 0 &&
    normUsageUnit &&
    (normUsageUnit === targetUnit ||
      (normUsageUnit.includes('oz') && targetUnit.includes('oz')) ||
      (normUsageUnit.includes('onza') && targetUnit.includes('onza')))
  ) {
    return item.unitCostUsage;
  }

  // 2. Determine base unit cost (cost per 1 ml, 1 g, or 1 und)
  let baseUnitCost = 0;
  if (item.costoUnitarioReal !== undefined && item.costoUnitarioReal > 0) {
    baseUnitCost = item.costoUnitarioReal;
  } else if (item.costoUnitarioBruto !== undefined && item.costoUnitarioBruto > 0) {
    baseUnitCost = item.costoUnitarioBruto;
  } else if (item.purchaseCost !== undefined && item.purchaseCost > 0) {
    const cUnit = (item.countUnit || '').toLowerCase();
    if (cUnit.includes('und') || cUnit.includes('unidad')) {
      baseUnitCost = item.purchaseCost;
    } else if (cUnit.includes('kg') || cUnit.includes('kilo') || cUnit.includes('l') || cUnit.includes('litro')) {
      baseUnitCost = item.purchaseCost / 1000;
    } else {
      const divisor = item.conversionMultiplier || item.equivalencia || 1;
      baseUnitCost = item.purchaseCost / (divisor > 0 ? divisor : 1);
    }
  }

  // 3. Convert from base unit (ml / g / und) to the recipe's target unit
  const targetInfo = parseUnitBaseInfo(recipeUnit, unitEquivalences);
  const factor = targetInfo.baseValue > 0 ? targetInfo.baseValue : 1;

  return baseUnitCost * factor;
}


