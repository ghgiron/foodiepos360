// src/services/subRecipeProductionService.ts
import { db, FoodiePOSDatabase } from '../db/localDb';
import type { Recipe, InventoryLog, DomainOutbox } from '../types';
import { 
  getPhysicalStockInBranch, 
  getReservedStockInBranch,
  getSubRecipePhysicalPortionsInBranch,
  getSubRecipeReservedPortionsInBranch 
} from '../types';
import { 
  getActiveBranchId, 
  normalizeBranchId,
  setBranchStockValue,
  setSucursalStockValue
} from '../utils/branchHelper';
import { syncRecordToFirestore } from './syncService';

export interface SubRecipeFeasibilityItem {
  id: string;
  name: string;
  type: 'item' | 'subrecipe';
  unit: string;
  requiredPerBatch: number;
  totalRequired: number;
  availableStock: number;
  unitCost: number;
  totalCost: number;
  isSufficient: boolean;
  missingQuantity: number;
}

export interface SubRecipeFeasibilityResult {
  canProduce: boolean;
  subRecipe: Recipe;
  batchesCount: number;
  yieldPerBatch: number;
  totalProducedYield: number;
  yieldUnit: string;
  items: SubRecipeFeasibilityItem[];
  missingItems: SubRecipeFeasibilityItem[];
  maxPossibleBatches: number;
  totalCost: number;
  costPerYieldUnit: number;
}

export interface BatchExecutionResult {
  success: boolean;
  error?: string;
  subRecipeId?: string;
  subRecipeName?: string;
  batchesCount?: number;
  producedQuantity?: number;
  yieldUnit?: string;
  totalCost?: number;
  costPerYieldUnit?: number;
  timestamp?: string;
}

/**
 * Checks the feasibility of producing a given number of batches of a subrecipe
 * based on current real-time branch or global stock.
 */
export async function checkSubRecipeFeasibility(
  subRecipeId: string,
  batchesCount: number = 1,
  dbInstance: FoodiePOSDatabase = db,
  branchId?: string
): Promise<SubRecipeFeasibilityResult> {
  const resolvedBranchId = normalizeBranchId(branchId || getActiveBranchId());
  const subRecipe = await dbInstance.recipes.get(subRecipeId);
  if (!subRecipe) {
    throw new Error(`Subreceta con ID "${subRecipeId}" no encontrada.`);
  }

  const effectiveBatches = Math.max(1, batchesCount);
  const yieldPerBatch = subRecipe.yieldQuantity && subRecipe.yieldQuantity > 0 ? subRecipe.yieldQuantity : 1;
  const yieldUnit = subRecipe.yieldUnit || 'porciones';
  const totalProducedYield = yieldPerBatch * effectiveBatches;

  const items: SubRecipeFeasibilityItem[] = [];
  const missingItems: SubRecipeFeasibilityItem[] = [];
  let totalCost = 0;
  let maxPossibleBatches = Infinity;

  const allInventory = await dbInstance.inventoryItems.toArray();
  const allRecipes = await dbInstance.recipes.toArray();

  const ingredients = Array.isArray(subRecipe.ingredients) ? subRecipe.ingredients : [];

  for (const ing of ingredients) {
    const rawQtyPerBatch = Number(ing.quantity ?? (ing as any).standardQuantity ?? 0);
    const totalRequired = Math.round((rawQtyPerBatch * effectiveBatches + Number.EPSILON) * 1000) / 1000;
    let nameStr = ing.inventoryItemId;
    let unitCost = 0;
    let availableStock = 0;

    if (ing.type === 'subrecipe') {
      const nestedSub = allRecipes.find(r => r.id === ing.inventoryItemId);
      if (nestedSub) {
        nameStr = nestedSub.name;
        unitCost = nestedSub.costPrice || nestedSub.costPerUnit || 0;
        availableStock = getSubRecipePhysicalPortionsInBranch(nestedSub, resolvedBranchId);
      }
    } else {
      const invItem = allInventory.find(i => i.id === ing.inventoryItemId);
      if (invItem) {
        nameStr = invItem.name;
        if (invItem.costoUnitarioReal !== undefined && invItem.costoUnitarioReal > 0) {
          unitCost = invItem.costoUnitarioReal;
        } else {
          unitCost = invItem.purchaseCost / (invItem.countUnit === 'Kilogramo' || invItem.countUnit === 'Kg' ? 1 : 1000);
          if (invItem.countUnit === 'Unidad' || invItem.countUnit === 'unidad') {
            unitCost = invItem.purchaseCost;
          }
        }
        availableStock = getPhysicalStockInBranch(invItem, resolvedBranchId);
      }
    }

    const itemTotalCost = Math.round((unitCost * totalRequired + Number.EPSILON) * 100) / 100;
    totalCost += itemTotalCost;

    const isSufficient = availableStock >= totalRequired;
    const missingQuantity = isSufficient ? 0 : Math.round((totalRequired - availableStock + Number.EPSILON) * 1000) / 1000;

    if (rawQtyPerBatch > 0) {
      const itemPossibleBatches = Math.floor(availableStock / rawQtyPerBatch);
      if (itemPossibleBatches < maxPossibleBatches) {
        maxPossibleBatches = Math.max(0, itemPossibleBatches);
      }
    }

    const feasibilityItem: SubRecipeFeasibilityItem = {
      id: ing.inventoryItemId,
      name: nameStr,
      type: ing.type || 'item',
      unit: ing.unit || 'und',
      requiredPerBatch: rawQtyPerBatch,
      totalRequired,
      availableStock,
      unitCost,
      totalCost: itemTotalCost,
      isSufficient,
      missingQuantity
    };

    items.push(feasibilityItem);
    if (!isSufficient) {
      missingItems.push(feasibilityItem);
    }
  }

  if (maxPossibleBatches === Infinity) {
    maxPossibleBatches = 0;
  }

  const costPerYieldUnit = totalProducedYield > 0 ? Math.round((totalCost / totalProducedYield + Number.EPSILON) * 100) / 100 : 0;

  return {
    canProduce: missingItems.length === 0,
    subRecipe,
    batchesCount: effectiveBatches,
    yieldPerBatch,
    totalProducedYield,
    yieldUnit,
    items,
    missingItems,
    maxPossibleBatches,
    totalCost: Math.round(totalCost * 100) / 100,
    costPerYieldUnit
  };
}

/**
 * Executes atomic subrecipe batch production in Dexie:
 * 1. Validates real-time inventory sufficiency.
 * 2. In an atomic Dexie transaction:
 *    a) Deducts raw ingredients from physical inventory (movement: 'CONSUMO_PRODUCCION_INTERNA').
 *    b) Increments physical batch portions of the subrecipe (movement: 'ENTRADA_PRODUCCION_LOTE').
 *    c) Enqueues sync event in 'sync_outbox' (domainOutbox) for Firestore sync.
 */
export async function executeSubRecipeBatch(
  subRecipeId: string,
  batchesCount: number,
  dbInstance: FoodiePOSDatabase = db,
  branchId?: string
): Promise<BatchExecutionResult> {
  if (batchesCount <= 0) {
    return {
      success: false,
      error: 'La cantidad de lotes a producir debe ser mayor a 0.'
    };
  }

  const effectiveBranchId = normalizeBranchId(branchId || getActiveBranchId());

  // Resolve valid branches so we never retain obsolete/ghost branch keys
  const validBranchIds = new Set<string>([effectiveBranchId.toLowerCase().trim()]);
  try {
    const branchesSetting = await dbInstance.systemSettings.get('system_branches');
    if (Array.isArray(branchesSetting?.value)) {
      branchesSetting.value.forEach((b: any) => {
        if (b?.id && b.active !== false) {
          validBranchIds.add(normalizeBranchId(String(b.id)).toLowerCase().trim());
        }
      });
    }
  } catch {
    // Continue with effectiveBranchId
  }

  // Pre-check outside transaction to avoid aborting without clear feedback
  const feasibility = await checkSubRecipeFeasibility(subRecipeId, batchesCount, dbInstance, effectiveBranchId);
  if (!feasibility.canProduce) {
    const missingNames = feasibility.missingItems
      .map(m => `${m.name} (faltan ${m.missingQuantity} ${m.unit})`)
      .join(', ');
    return {
      success: false,
      error: `Stock insuficiente para producir ${batchesCount} lote(s): ${missingNames}.`
    };
  }

  const subRecipe = feasibility.subRecipe;
  const timestamp = new Date().toISOString();
  const producedQty = feasibility.totalProducedYield;
  const yieldUnit = feasibility.yieldUnit;
  const modifiedInventoryIds: string[] = [];
  const modifiedRecipeIds: string[] = [subRecipeId];

  try {
    await dbInstance.transaction(
      'rw',
      [
        dbInstance.inventoryItems,
        dbInstance.recipes,
        dbInstance.inventoryLogs,
        dbInstance.domainOutbox
      ],
      async () => {
        // Double check subrecipe in transaction
        const txSubRecipe = await dbInstance.recipes.get(subRecipeId);
        if (!txSubRecipe) {
          throw new Error(`La subreceta con ID ${subRecipeId} no existe en la base de datos.`);
        }

        const consumedSummary: Array<{
          id: string;
          name: string;
          quantity: number;
          unit: string;
        }> = [];

        // 1. DEDUCT RAW INGREDIENTS FROM ACTIVE BRANCH
        for (const itemPlan of feasibility.items) {
          if (itemPlan.totalRequired <= 0) continue;

          if (itemPlan.type === 'subrecipe') {
            const nestedSub = await dbInstance.recipes.get(itemPlan.id);
            if (!nestedSub) {
              throw new Error(`Subreceta dependiente '${itemPlan.name}' no encontrada.`);
            }

            const curBranchPortions = getSubRecipePhysicalPortionsInBranch(nestedSub, effectiveBranchId);
            if (curBranchPortions < itemPlan.totalRequired) {
              throw new Error(`Stock insuficiente en subreceta '${nestedSub.name}' en la sede activa. Disponible: ${curBranchPortions}, requerido: ${itemPlan.totalRequired}.`);
            }

            const newBranchPortions = Math.round(Math.max(0, curBranchPortions - itemPlan.totalRequired) * 1000) / 1000;
            const stockPortionsByBranch = setBranchStockValue(
              nestedSub.stockPortionsByBranch,
              effectiveBranchId,
              newBranchPortions,
              validBranchIds
            );
            const updatedPortions = Object.keys(stockPortionsByBranch).length > 0
              ? Math.round(Object.values(stockPortionsByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
              : newBranchPortions;
            const nestedReserved = getSubRecipeReservedPortionsInBranch(nestedSub, effectiveBranchId);

            await dbInstance.recipes.put({
              ...nestedSub,
              stockPortions: updatedPortions,
              stockPortionsByBranch,
              availablePortions: Math.max(0, updatedPortions - nestedReserved),
              updatedAt: timestamp
            });
            modifiedRecipeIds.push(nestedSub.id);

            // Kardex Movement
            const logEntry: InventoryLog = {
              id: `log-prod-sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              itemId: nestedSub.id,
              itemName: nestedSub.name,
              type: 'CONSUMO_PRODUCCION_INTERNA',
              quantity: -itemPlan.totalRequired,
              reason: `Consumo por Producción de Lote - ${txSubRecipe.name}`,
              user: 'Producción Cocina',
              timestamp,
              branchId: effectiveBranchId
            };
            await dbInstance.inventoryLogs.add(logEntry);

            consumedSummary.push({
              id: nestedSub.id,
              name: nestedSub.name,
              quantity: itemPlan.totalRequired,
              unit: itemPlan.unit
            });

          } else {
            // Raw inventory item
            const rawItem = await dbInstance.inventoryItems.get(itemPlan.id);
            if (!rawItem) {
              throw new Error(`Insumo '${itemPlan.name}' no encontrado en el inventario.`);
            }

            const branchPhysical = getPhysicalStockInBranch(rawItem, effectiveBranchId);
            if (branchPhysical < itemPlan.totalRequired) {
              throw new Error(`Stock físico insuficiente en la sede activa para '${rawItem.name}'. Requerido: ${itemPlan.totalRequired}, disponible: ${branchPhysical}.`);
            }

            const newBranchPhysical = Math.round(Math.max(0, branchPhysical - itemPlan.totalRequired) * 1000) / 1000;
            const stockByBranch = setBranchStockValue(
              rawItem.stockByBranch,
              effectiveBranchId,
              newBranchPhysical,
              validBranchIds
            );
            const sucursalStock = setSucursalStockValue(
              rawItem.sucursalStock,
              effectiveBranchId,
              newBranchPhysical,
              undefined,
              validBranchIds
            );

            const newPhysical = Object.keys(stockByBranch).length > 0
              ? Math.round(Object.values(stockByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
              : newBranchPhysical;
            const currentReserved = getReservedStockInBranch(rawItem, effectiveBranchId);
            const newAvailable = Math.max(0, newPhysical - currentReserved);

            await dbInstance.inventoryItems.put({
              ...rawItem,
              currentStock: newPhysical,
              realPhysicalStock: newPhysical,
              theoreticalStock: newPhysical,
              availableStock: newAvailable,
              stockByBranch,
              sucursalStock,
              updatedAt: timestamp
            });
            modifiedInventoryIds.push(rawItem.id);

            // Kardex Movement (Materias primas crudas)
            const logEntry: InventoryLog = {
              id: `log-prod-cons-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              itemId: rawItem.id,
              itemName: rawItem.name,
              type: 'CONSUMO_PRODUCCION_INTERNA',
              quantity: -itemPlan.totalRequired,
              reason: `Consumo por Producción de Lote - ${txSubRecipe.name}`,
              user: 'Producción Cocina',
              timestamp,
              branchId: effectiveBranchId
            };
            await dbInstance.inventoryLogs.add(logEntry);

            consumedSummary.push({
              id: rawItem.id,
              name: rawItem.name,
              quantity: itemPlan.totalRequired,
              unit: itemPlan.unit
            });
          }
        }

        // 2. INCREMENT SUBRECIPE PREPARED PHYSICAL STOCK
        const curBranchPortions = getSubRecipePhysicalPortionsInBranch(txSubRecipe, effectiveBranchId);
        const newBranchPortions = Math.round((curBranchPortions + producedQty) * 1000) / 1000;
        const stockPortionsByBranch = setBranchStockValue(
          txSubRecipe.stockPortionsByBranch,
          effectiveBranchId,
          newBranchPortions,
          validBranchIds
        );
        const newPortions = Object.keys(stockPortionsByBranch).length > 0
          ? Math.round(Object.values(stockPortionsByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
          : newBranchPortions;
        const curReserved = getSubRecipeReservedPortionsInBranch(txSubRecipe, effectiveBranchId);
        const newAvailPortions = Math.max(0, newPortions - curReserved);

        const recipeUpdate: any = {
          stockPortions: newPortions,
          availablePortions: newAvailPortions,
          stockPortionsByBranch,
          updatedAt: timestamp
        };

        // Also track under stockGrams for subrecipes measured in grams
        if (yieldUnit.toLowerCase().includes('g')) {
          recipeUpdate.stockGrams = newPortions;
          recipeUpdate.stockInGrams = newPortions;
          recipeUpdate.stockGramsByBranch = setBranchStockValue(
            txSubRecipe.stockGramsByBranch,
            effectiveBranchId,
            newBranchPortions,
            validBranchIds
          );
        }

        await dbInstance.recipes.put({
          ...txSubRecipe,
          ...recipeUpdate
        });

        // Also update inventoryItem if the subrecipe exists as a tracked inventory item
        const existingInvItem = await dbInstance.inventoryItems.get(txSubRecipe.id);
        if (existingInvItem) {
          const curBranchInv = getPhysicalStockInBranch(existingInvItem, effectiveBranchId);
          const newBranchInv = Math.round((curBranchInv + producedQty) * 1000) / 1000;
          const invStockByBranch = setBranchStockValue(
            existingInvItem.stockByBranch,
            effectiveBranchId,
            newBranchInv,
            validBranchIds
          );
          const invSucursal = setSucursalStockValue(
            existingInvItem.sucursalStock,
            effectiveBranchId,
            newBranchInv,
            { batchObservations: 'Lote producido' },
            validBranchIds
          );

          const newInvTotal = Object.keys(invStockByBranch).length > 0
            ? Math.round(Object.values(invStockByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
            : newBranchInv;
          const invReserved = getReservedStockInBranch(existingInvItem, effectiveBranchId);

          await dbInstance.inventoryItems.put({
            ...existingInvItem,
            currentStock: newInvTotal,
            realPhysicalStock: newInvTotal,
            theoreticalStock: newInvTotal,
            availableStock: Math.max(0, newInvTotal - invReserved),
            stockByBranch: invStockByBranch,
            sucursalStock: invSucursal,
            updatedAt: timestamp
          });
          modifiedInventoryIds.push(existingInvItem.id);
        }

        // Kardex Movement: Entrada de Lote de Subreceta
        const subRecipeLog: InventoryLog = {
          id: `log-prod-in-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          itemId: txSubRecipe.id,
          itemName: txSubRecipe.name,
          type: 'ENTRADA_PRODUCCION_LOTE',
          quantity: producedQty,
          reason: `Entrada por Producción de Lote - ${txSubRecipe.name}`,
          user: 'Producción Cocina',
          timestamp,
          branchId: effectiveBranchId
        };
        await dbInstance.inventoryLogs.add(subRecipeLog);

        // 3. ENQUEUE DOMAIN EVENT IN SYNC_OUTBOX (domainOutbox)
        const eventId = `evt-subrecipbatch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const outboxEvent: DomainOutbox = {
          eventId,
          eventType: 'SubRecipeBatchProduced',
          payload: {
            subRecipeId: txSubRecipe.id,
            subRecipeName: txSubRecipe.name,
            batchesCount,
            producedQuantity: producedQty,
            yieldUnit,
            costPerYieldUnit: feasibility.costPerYieldUnit,
            totalBatchCost: feasibility.totalCost,
            consumedIngredients: consumedSummary,
            timestamp,
            branchId: effectiveBranchId
          },
          status: 'PENDING',
          createdAt: timestamp,
          syncedAt: null
        };
        await dbInstance.domainOutbox.put(outboxEvent);
      }
    );

    // Sync modified inventory items and subrecipes to Firestore so cloud never overwrites with stale values
    if (dbInstance === db) {
      await Promise.all([
        ...Array.from(new Set(modifiedInventoryIds)).map(async (id) => {
          const item = await dbInstance.inventoryItems.get(id);
          if (item) await syncRecordToFirestore('inventoryItems', id, item);
        }),
        ...Array.from(new Set(modifiedRecipeIds)).map(async (id) => {
          const rec = await dbInstance.recipes.get(id);
          if (rec) await syncRecordToFirestore('recipes', id, rec);
        })
      ]).catch(err => console.warn('[subRecipeProductionService] Background cloud sync warning:', err));
    }

    return {
      success: true,
      subRecipeId: subRecipe.id,
      subRecipeName: subRecipe.name,
      batchesCount,
      producedQuantity: producedQty,
      yieldUnit,
      totalCost: feasibility.totalCost,
      costPerYieldUnit: feasibility.costPerYieldUnit,
      timestamp
    };
  } catch (err: any) {
    console.error('[subRecipeProductionService] Error executing batch production:', err);
    return {
      success: false,
      error: err?.message || 'Error inesperado durante la transacción de producción.'
    };
  }
}
