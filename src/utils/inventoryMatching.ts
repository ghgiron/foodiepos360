// src/utils/inventoryMatching.ts
import type { InventoryItem } from '../types';
import type { VoiceIngredientExtraction, ExistingItemMatchInfo } from '../types/voiceCopilot';

/**
 * Normalizes text removing accents, punctuation and excess whitespace for robust fuzzy matching.
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[^a-z0-9\s]/g, '')     // keep alphanumeric and space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Key modifiers designating distinct variants, SKUs, or references in gastrobar/POS.
 * If a target name contains any of these modifiers and the candidate does not (or differs),
 * it must NOT match and should be created as a new reference (NEW_ITEM).
 */
export const KEY_VARIANT_MODIFIERS: string[] = [
  // Multi-word modifiers first to prevent partial word cuts
  'sin gas',
  'con gas',
  'doble malta',
  'sin alcohol',
  'sin azucar',
  'frutos rojos',
  'semi seco',
  'six pack',
  // Colors
  'roja', 'rojo',
  'negra', 'negro',
  'dorada', 'dorado',
  'rubia', 'rubio',
  'verde',
  'ambar',
  'azul',
  'blanca', 'blanco',
  'oscura', 'oscuro',
  'trigo',
  'rosada', 'rosado',
  // Types / Formulations / Diet
  'light',
  'zero', 'cero',
  'diet',
  'clasica', 'clasico',
  'original',
  '00',
  'deslactosada',
  'descremada',
  'entera',
  'semidescremada',
  'artesanal',
  'premium',
  'reserva',
  'extra',
  'suave',
  'fuerte',
  'seco',
  'dulce',
  // Styles / Beer Varieties
  'ipa', 'apa', 'stout', 'lager', 'pilsen', 'ale', 'porter',
  // Flavors / Fruits
  'maracuya', 'mango', 'fresa', 'lulo', 'mora', 'guanabana', 'limon', 'naranja', 'uva', 'manzana', 'durazno', 'vainilla', 'chocolate', 'arequipe', 'coco', 'menta',
  // Produce Varieties
  'chonto', 'milano', 'cherry', 'criolla', 'pastusa', 'sabanera',
  // Packaging / Presentations
  'lata', 'botella', 'barril', 'garrafa', 'sixpack'
];

function canonicalizeModifier(mod: string): string {
  if (mod === 'rojo' || mod === 'roja') return 'roja';
  if (mod === 'negro' || mod === 'negra') return 'negra';
  if (mod === 'dorado' || mod === 'dorada') return 'dorada';
  if (mod === 'rubio' || mod === 'rubia') return 'rubia';
  if (mod === 'blanco' || mod === 'blanca') return 'blanca';
  if (mod === 'oscuro' || mod === 'oscura') return 'oscura';
  if (mod === 'rosado' || mod === 'rosada') return 'rosada';
  if (mod === 'cero') return 'zero';
  if (mod === 'clasico' || mod === 'clasica') return 'clasica';
  if (mod === 'sixpack') return 'six pack';
  return mod;
}

/**
 * Extracts canonicalized key variant modifiers present in a normalized string.
 */
export function extractKeyModifiers(normText: string): Set<string> {
  const found = new Set<string>();
  if (!normText) return found;

  const paddedText = ` ${normText} `;
  for (const mod of KEY_VARIANT_MODIFIERS) {
    const regex = new RegExp(`\\b${mod}\\b`, 'i');
    if (regex.test(paddedText)) {
      found.add(canonicalizeModifier(mod));
    }
  }
  return found;
}

/**
 * Determines whether two normalized strings have conflicting or mismatched key variant modifiers.
 */
export function hasVariantModifierMismatch(targetNorm: string, itemNorm: string): boolean {
  const targetMods = extractKeyModifiers(targetNorm);
  const itemMods = extractKeyModifiers(itemNorm);

  if (targetMods.size !== itemMods.size) return true;
  for (const mod of targetMods) {
    if (!itemMods.has(mod)) return true;
  }
  return false;
}

/**
 * Basic Spanish stemmer for plural suffixes.
 */
function stemWord(word: string): string {
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Finds an existing inventory item in Dexie matching the target name.
 * Priority:
 * 1. Exact normalized match ("salmón" -> "salmon")
 * 2. Substring match ("salmon" in "filete de salmon") - strictly checking modifier consistency
 * 3. Token-based stemmed intersection - strictly checking modifier consistency
 */
export function findMatchingInventoryItem(
  name: string,
  allItems: InventoryItem[]
): InventoryItem | null {
  if (!name || !allItems || allItems.length === 0) return null;
  const targetNorm = normalizeSearchText(name);
  if (!targetNorm) return null;

  // 1. Exact normalized match
  const exact = allItems.find(item => {
    const itemNorm = normalizeSearchText(item.name);
    return itemNorm === targetNorm && !hasVariantModifierMismatch(targetNorm, itemNorm);
  });
  if (exact) return exact;

  // 2. Substring match (with strict variant modifier guard)
  const substring = allItems.find(item => {
    const itemNorm = normalizeSearchText(item.name);
    if (hasVariantModifierMismatch(targetNorm, itemNorm)) return false;
    return itemNorm.includes(targetNorm) || targetNorm.includes(itemNorm);
  });
  if (substring) return substring;

  // 3. Token-based stemmed intersection
  const targetTokens = targetNorm.split(' ').filter(w => w.length > 2).map(stemWord);
  if (targetTokens.length > 0) {
    // 3a. Target tokens are a subset of item tokens (e.g. "cervezas corona" -> "cerveza corona 330ml")
    const targetSubset = allItems.find(item => {
      const itemNorm = normalizeSearchText(item.name);
      if (hasVariantModifierMismatch(targetNorm, itemNorm)) return false;
      const itemTokens = itemNorm.split(' ').filter(w => w.length > 2).map(stemWord);
      return targetTokens.every(t => itemTokens.some(it => it.includes(t) || t.includes(it)));
    });
    if (targetSubset) return targetSubset;

    // 3b. Item tokens are a subset of target tokens (e.g. "tomates chonto frescos" -> "tomate chonto")
    const itemSubset = allItems.find(item => {
      const itemNorm = normalizeSearchText(item.name);
      if (hasVariantModifierMismatch(targetNorm, itemNorm)) return false;
      const itemTokens = itemNorm.split(' ').filter(w => w.length > 2).map(stemWord);
      return itemTokens.length > 0 && itemTokens.every(it => targetTokens.some(t => t.includes(it) || it.includes(t)));
    });
    if (itemSubset) return itemSubset;

    // 3c. Majority token overlap (at least 2 matching tokens)
    let bestMatch: InventoryItem | null = null;
    let maxMatches = 1;
    for (const item of allItems) {
      const itemNorm = normalizeSearchText(item.name);
      if (hasVariantModifierMismatch(targetNorm, itemNorm)) continue;
      const itemTokens = itemNorm.split(' ').filter(w => w.length > 2).map(stemWord);
      const matches = targetTokens.filter(t => itemTokens.some(it => it.includes(t) || t.includes(it))).length;
      if (matches >= 2 && matches > maxMatches) {
        maxMatches = matches;
        bestMatch = item;
      }
    }
    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Calculates stock increment, unit cost, cost delta and weighted average cost for Restock mode.
 */
export function calculateRestockMetrics(
  matchedItem: InventoryItem,
  extraction: VoiceIngredientExtraction
): ExistingItemMatchInfo {
  const currentStock = Number(matchedItem.theoreticalStock ?? matchedItem.realPhysicalStock ?? 0);
  const purchaseQty = Number(extraction.purchase_quantity || 1);
  const multiplier = Number(extraction.conversion_multiplier || matchedItem.conversionMultiplier || 1);
  const addedStock = purchaseQty * multiplier;
  const newCalculatedStock = currentStock + addedStock;

  const previousCost = Number(matchedItem.purchaseCost || 0);
  const purchasePrice = Number(extraction.purchase_price || 0);

  const newUnitCost = (purchasePrice > 0 && purchaseQty > 0)
    ? Math.round(purchasePrice / purchaseQty)
    : previousCost;

  const costDifference = newUnitCost - previousCost;

  // Weighted Average Cost formula (Costo Promedio Ponderado)
  let weightedAverageCost = newUnitCost;
  if (currentStock > 0 && newCalculatedStock > 0) {
    const previousTotalValue = currentStock * previousCost;
    const newTotalValue = purchasePrice > 0 ? purchasePrice : (addedStock * newUnitCost);
    weightedAverageCost = Math.round((previousTotalValue + newTotalValue) / newCalculatedStock);
  }

  return {
    id: matchedItem.id,
    name: matchedItem.name,
    currentStock,
    newCalculatedStock,
    addedStock,
    previousCost,
    newUnitCost,
    weightedAverageCost,
    costDifference,
    unit: matchedItem.purchaseUnit || extraction.purchase_unit || 'Unidad',
    supplierId: extraction.supplier_id || matchedItem.supplierId,
    supplierName: extraction.supplier_name,
    category: matchedItem.category
  };
}
