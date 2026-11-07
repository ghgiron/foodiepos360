// src/services/inventoryBomService.ts
import { db } from '../db/localDb';
import type { Recipe, InventoryItem, KdsOrderTicket } from '../types';
import { 
  getPhysicalStockInBranch,
  getReservedStockInBranch,
  getAvailableStockInBranch,
  getSubRecipePhysicalPortionsInBranch,
  getSubRecipeReservedPortionsInBranch,
  getSubRecipeAvailablePortionsInBranch
} from '../types';

export interface BomRequirement {
  itemId: string;
  name: string;
  resourceType: 'ingredient' | 'product' | 'supply' | 'subrecipe_portion' | string;
  quantityRequired: number;
  unit: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
}

export interface AvailabilityResult {
  isAvailable: boolean;
  missingItemName?: string;
  availablePortions: number;
  limitingResourceName?: string;
  availableQuantity?: number;
  requiredQuantity?: number;
  branchId?: string;
}

/**
 * Resolves recursive BOM (Bill of Materials) requirements for an item or recipe.
 * 
 * Logic rules:
 * 1. Single direct product ('product' / 'item'): 1 unit of the item per sold portion.
 * 2. Recipe:
 *    a) Standard raw ingredient: consumption = standardQty * soldQty strictly from branch inventory
 *    b) Subrecipe:
 *       - CASO 1 (Batch prepared portions): If subrecipe has available portions in the branch (stockPortions > 0),
 *         it yields requirement for the prepared subrecipe portions directly.
 *       - CASO 2 (Production on-the-fly): If no prepared batch portions exist, recurses into raw materials:
 *         consumption = (standardQtyUsed / subrecipeYield) * subrecipeIngredientQty * soldQty
 *    c) Packaging/supplies:
 *       - Channel 'dine_in': only dine_in or general supplies.
 *       - Channel 'delivery': includes delivery-specific containers/bags + dine_in supplies.
 */
export async function explodeItemRequirements(
  entityId: string,
  soldQuantity: number = 1,
  channel: 'dine_in' | 'delivery' = 'dine_in',
  visitedRecipes: Set<string> = new Set(),
  branchId?: string
): Promise<BomRequirement[]> {
  const consolidatedMap = new Map<string, {
    itemId: string;
    name: string;
    resourceType: string;
    quantityRequired: number;
    unit: string;
  }>();

  // Helper to add or accumulate requirements
  const addRequirement = (
    itemId: string,
    name: string,
    resourceType: string,
    qty: number,
    unit: string
  ) => {
    if (qty <= 0) return;
    const roundedQty = Math.round((qty + Number.EPSILON) * 10000) / 10000;
    const existing = consolidatedMap.get(itemId);
    if (existing) {
      existing.quantityRequired = Math.round((existing.quantityRequired + roundedQty + Number.EPSILON) * 10000) / 10000;
    } else {
      consolidatedMap.set(itemId, {
        itemId,
        name,
        resourceType,
        quantityRequired: roundedQty,
        unit: unit || 'und'
      });
    }
  };

  // Internal recursive resolver
  async function resolveEntity(
    id: string,
    qtyMultiplier: number,
    depthVisited: Set<string>
  ): Promise<void> {
    if (depthVisited.has(id)) {
      console.warn(`[inventoryBomService] Circular dependency detected for recipe ID: ${id}`);
      return;
    }

    const recipe = await db.recipes.get(id);

    if (recipe) {
      const nextVisited = new Set(depthVisited);
      nextVisited.add(id);

      // 1. Process Ingredients
      if (Array.isArray(recipe.ingredients)) {
        for (const ing of recipe.ingredients) {
          if (ing.type === 'subrecipe') {
            const subRecipe = await db.recipes.get(ing.inventoryItemId);
            if (subRecipe) {
              const neededPortions = ing.quantity * qtyMultiplier;
              // Subreceta: siempre descontar y reservar del stock preparado de la subreceta en la sede activa.
              // Cuando se agote la subreceta, se debe producir un nuevo lote para descontar sus materias primas.
              addRequirement(
                subRecipe.id,
                subRecipe.name,
                'subrecipe_portion',
                neededPortions,
                subRecipe.yieldUnit || 'porción'
              );
            } else {
              // Fallback: If subrecipe is registered as inventory item
              const invItem = await db.inventoryItems.get(ing.inventoryItemId);
              if (invItem) {
                addRequirement(
                  invItem.id,
                  invItem.name,
                  invItem.resourceType || 'ingredient',
                  ing.quantity * qtyMultiplier,
                  ing.unit || invItem.countUnit
                );
              }
            }
          } else {
            // Direct raw ingredient
            const invItem = await db.inventoryItems.get(ing.inventoryItemId);
            const itemName = invItem ? invItem.name : ing.inventoryItemId;
            const itemUnit = ing.unit || (invItem ? invItem.countUnit : 'und');
            const resourceType = invItem?.resourceType || 'ingredient';

            addRequirement(
              ing.inventoryItemId,
              itemName,
              resourceType,
              ing.quantity * qtyMultiplier,
              itemUnit
            );
          }
        }
      }

      // 2. Process Packaging Supplies according to channel
      if (Array.isArray(recipe.packaging)) {
        for (const pkg of recipe.packaging) {
          const pkgChannel = pkg.channel || 'dine_in';
          const isEligible = 
            channel === 'delivery' 
              ? true // Delivery includes both dine_in standard prep supplies and delivery containers
              : pkgChannel === 'dine_in'; // Dine in excludes delivery-only packaging

          if (isEligible && pkg.quantity > 0) {
            let pkgItem = await db.inventoryItems.get(pkg.item);
            if (!pkgItem) {
              pkgItem = await db.inventoryItems.filter(i => i.name.toLowerCase() === pkg.item.toLowerCase()).first();
            }

            const itemId = pkgItem ? pkgItem.id : `supply-${pkg.item.toLowerCase().replace(/\s+/g, '-')}`;
            const itemName = pkgItem ? pkgItem.name : pkg.item;
            const itemUnit = pkgItem ? pkgItem.countUnit : 'und';

            addRequirement(
              itemId,
              itemName,
              'supply',
              pkg.quantity * qtyMultiplier,
              itemUnit
            );
          }
        }
      }
    } else {
      // Direct Inventory Item (e.g., bottled beverage or standalone product)
      const invItem = await db.inventoryItems.get(id);
      if (invItem) {
        addRequirement(
          invItem.id,
          invItem.name,
          invItem.resourceType || 'product',
          1 * qtyMultiplier,
          invItem.countUnit || 'und'
        );
      }
    }
  }

  await resolveEntity(entityId, soldQuantity, visitedRecipes);

  // Fetch live inventory / subrecipe snapshots strictly for the target branch
  const result: BomRequirement[] = [];
  for (const entry of consolidatedMap.values()) {
    if (entry.resourceType === 'subrecipe_portion') {
      const subRec = await db.recipes.get(entry.itemId);
      const current = subRec ? getSubRecipePhysicalPortionsInBranch(subRec, branchId) : 0;
      const reserved = subRec ? getSubRecipeReservedPortionsInBranch(subRec, branchId) : 0;
      const available = subRec ? getSubRecipeAvailablePortionsInBranch(subRec, branchId) : 0;

      result.push({
        itemId: entry.itemId,
        name: subRec ? subRec.name : entry.name,
        resourceType: 'subrecipe_portion',
        quantityRequired: entry.quantityRequired,
        unit: entry.unit,
        currentStock: current,
        reservedStock: reserved,
        availableStock: available
      });
    } else {
      const invItem = await db.inventoryItems.get(entry.itemId);
      const current = invItem ? getPhysicalStockInBranch(invItem, branchId) : 0;
      const reserved = invItem ? getReservedStockInBranch(invItem, branchId) : 0;
      const available = invItem ? getAvailableStockInBranch(invItem, branchId) : 0;

      result.push({
        itemId: entry.itemId,
        name: invItem ? invItem.name : entry.name,
        resourceType: entry.resourceType,
        quantityRequired: entry.quantityRequired,
        unit: entry.unit,
        currentStock: current,
        reservedStock: reserved,
        availableStock: available
      });
    }
  }

  return result;
}

/**
 * Explodes all requirements for a complete KdsOrderTicket comanda.
 */
export async function explodeTicketRequirements(
  ticket: KdsOrderTicket,
  itemIndices?: number[],
  options?: { includeUnsent?: boolean }
): Promise<BomRequirement[]> {
  const channel = ticket.orderType === 'TAKEAWAY' ? 'delivery' : 'dine_in';
  const branchId = ticket.branchId || ticket.sucursalId;
  const consolidated = new Map<string, BomRequirement>();

  const targetItems = itemIndices !== undefined 
    ? itemIndices.map(i => ticket.items[i]).filter(Boolean)
    : ticket.items;

  for (const item of targetItems) {
    if (item.consumed) continue; // Skip items already physically consumed in KDS
    if (!options?.includeUnsent && item.sent === false) continue; // Skip unsent drafts unless staging live comanda
    const requirements = await explodeItemRequirements(
      item.recipeId, 
      item.quantity, 
      channel, 
      new Set(), 
      branchId
    );

    for (const req of requirements) {
      const existing = consolidated.get(req.itemId);
      if (existing) {
        existing.quantityRequired = Math.round((existing.quantityRequired + req.quantityRequired + Number.EPSILON) * 10000) / 10000;
      } else {
        consolidated.set(req.itemId, { ...req });
      }
    }
  }

  return Array.from(consolidated.values());
}

/**
 * Checks if a Recipe or Product has enough available stock to be ordered.
 * Validates strictly against the specified branch/sucursal.
 */
export async function checkRecipeAvailability(
  recipeIdOrObj: string | Recipe,
  channel: 'dine_in' | 'delivery' = 'dine_in',
  branchId?: string
): Promise<AvailabilityResult> {
  const recipeId = typeof recipeIdOrObj === 'string' ? recipeIdOrObj : recipeIdOrObj.id;
  const requirements = await explodeItemRequirements(recipeId, 1, channel, new Set(), branchId);

  if (requirements.length === 0) {
    return {
      isAvailable: true,
      availablePortions: 999,
      branchId
    };
  }

  let minPortions = Infinity;
  let missingItemName: string | undefined;
  let bottleneckReq: BomRequirement | undefined;

  for (const req of requirements) {
    if (req.quantityRequired <= 0) continue;
    const portionsForThisItem = Math.floor(req.availableStock / req.quantityRequired);

    if (portionsForThisItem <= 0 || req.availableStock <= 0) {
      return {
        isAvailable: false,
        missingItemName: req.name,
        limitingResourceName: req.name,
        availableQuantity: req.availableStock,
        requiredQuantity: req.quantityRequired,
        availablePortions: 0,
        branchId
      };
    }

    if (portionsForThisItem < minPortions) {
      minPortions = portionsForThisItem;
      missingItemName = req.name;
      bottleneckReq = req;
    }
  }

  return {
    isAvailable: minPortions > 0 && minPortions !== Infinity,
    missingItemName: minPortions === 0 ? missingItemName : undefined,
    limitingResourceName: bottleneckReq?.name,
    availableQuantity: bottleneckReq?.availableStock,
    requiredQuantity: bottleneckReq?.quantityRequired,
    availablePortions: minPortions === Infinity ? 999 : minPortions,
    branchId
  };
}

/**
 * High-performance synchronous availability checker using in-memory live data arrays.
 * Perfect for 60 FPS rendering in OrderTaking catalog cards.
 * Validates stock strictly per active branch.
 */
export function calculateAvailabilitySync(
  recipeId: string,
  allRecipes: Recipe[],
  allInventoryItems: InventoryItem[],
  channel: 'dine_in' | 'delivery' = 'dine_in',
  branchId?: string
): AvailabilityResult {
  const inventoryMap = new Map<string, InventoryItem>();
  for (const item of allInventoryItems) {
    inventoryMap.set(item.id, item);
    if (item.name) {
      inventoryMap.set(item.name.toLowerCase(), item);
    }
  }

  const recipeMap = new Map<string, Recipe>();
  for (const r of allRecipes) {
    recipeMap.set(r.id, r);
  }

  const consolidatedReqs = new Map<string, { 
    qty: number; 
    name: string; 
    isSubRecipe?: boolean; 
    subRecipeId?: string;
  }>();

  function resolveSync(id: string, multiplier: number, visited: Set<string>): void {
    if (visited.has(id)) return;
    const rec = recipeMap.get(id);

    if (rec) {
      const nextVisited = new Set(visited);
      nextVisited.add(id);

      // Ingredients
      if (Array.isArray(rec.ingredients)) {
        for (const ing of rec.ingredients) {
          if (ing.type === 'subrecipe') {
            const subRec = recipeMap.get(ing.inventoryItemId);
            if (subRec) {
              const neededPortions = ing.quantity * multiplier;
              // Subreceta: validar siempre contra el stock preparado de la subreceta en la sede activa.
              const subKey = `subrecipe-${subRec.id}`;
              const currentReq = consolidatedReqs.get(subKey) || { 
                qty: 0, 
                name: subRec.name, 
                isSubRecipe: true, 
                subRecipeId: subRec.id 
              };
              currentReq.qty += neededPortions;
              consolidatedReqs.set(subKey, currentReq);
            } else {
              const inv = inventoryMap.get(ing.inventoryItemId);
              if (inv) {
                const currentReq = consolidatedReqs.get(inv.id) || { qty: 0, name: inv.name };
                currentReq.qty += ing.quantity * multiplier;
                consolidatedReqs.set(inv.id, currentReq);
              }
            }
          } else {
            const currentReq = consolidatedReqs.get(ing.inventoryItemId) || { qty: 0, name: ing.inventoryItemId };
            currentReq.qty += ing.quantity * multiplier;
            const inv = inventoryMap.get(ing.inventoryItemId);
            if (inv) currentReq.name = inv.name;
            consolidatedReqs.set(ing.inventoryItemId, currentReq);
          }
        }
      }

      // Packaging
      if (Array.isArray(rec.packaging)) {
        for (const pkg of rec.packaging) {
          const pkgChannel = pkg.channel || 'dine_in';
          const isEligible = channel === 'delivery' ? true : pkgChannel === 'dine_in';
          if (isEligible && pkg.quantity > 0) {
            const inv = inventoryMap.get(pkg.item.toLowerCase()) || inventoryMap.get(pkg.item);
            const key = inv ? inv.id : pkg.item;
            const currentReq = consolidatedReqs.get(key) || { qty: 0, name: inv ? inv.name : pkg.item };
            currentReq.qty += pkg.quantity * multiplier;
            consolidatedReqs.set(key, currentReq);
          }
        }
      }
    } else {
      // Direct product
      const inv = inventoryMap.get(id);
      if (inv) {
        const currentReq = consolidatedReqs.get(id) || { qty: 0, name: inv.name };
        currentReq.qty += 1 * multiplier;
        consolidatedReqs.set(id, currentReq);
      }
    }
  }

  resolveSync(recipeId, 1, new Set());

  if (consolidatedReqs.size === 0) {
    return { isAvailable: true, availablePortions: 999, branchId };
  }

  let minPortions = Infinity;
  let missingItemName: string | undefined;
  let limitingReq: { name: string; available: number; required: number } | undefined;

  for (const [itemId, req] of consolidatedReqs.entries()) {
    let available = 0;
    if (req.isSubRecipe && req.subRecipeId) {
      const subRec = recipeMap.get(req.subRecipeId);
      available = subRec ? getSubRecipeAvailablePortionsInBranch(subRec, branchId) : 0;
    } else {
      const invItem = inventoryMap.get(itemId);
      available = invItem ? getAvailableStockInBranch(invItem, branchId) : 0;
    }

    if (available <= 0 || available < req.qty) {
      return {
        isAvailable: false,
        missingItemName: req.name,
        limitingResourceName: req.name,
        availableQuantity: available,
        requiredQuantity: req.qty,
        availablePortions: 0,
        branchId
      };
    }

    const portions = Math.floor(available / req.qty);
    if (portions < minPortions) {
      minPortions = portions;
      missingItemName = req.name;
      limitingReq = { name: req.name, available, required: req.qty };
    }
  }

  return {
    isAvailable: minPortions > 0 && minPortions !== Infinity,
    missingItemName: minPortions === 0 ? missingItemName : undefined,
    limitingResourceName: limitingReq?.name,
    availableQuantity: limitingReq?.available,
    requiredQuantity: limitingReq?.required,
    availablePortions: minPortions === Infinity ? 999 : minPortions,
    branchId
  };
}
