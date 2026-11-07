// src/db/inventoryEngine.ts
import { db } from './localDb';
import type { OrderPaidPayload, KdsOrderTicket, InventoryItem, StockReservation, Recipe } from '../types';
import { explodeTicketRequirements, explodeItemRequirements } from '../services/inventoryBomService';
import { 
  getActiveBranchId, 
  setActiveBranchId, 
  DEFAULT_BRANCH_ID, 
  normalizeBranchId, 
  areBranchIdsEqual, 
  consolidateSucursalStock, 
  consolidateStockByBranch,
  setBranchStockValue,
  setSucursalStockValue
} from '../utils/branchHelper';
import { syncRecordToFirestore } from '../services/syncService';

/**
 * Maps inventory category to physical zones (Cocina, Bar, Zona de Jugos).
 */
export function getItemZone(categoryOrItem: string | { category?: string; name?: string }): 'Cocina' | 'Bar' | 'Zona de Jugos' {
  const category = typeof categoryOrItem === 'string' 
    ? categoryOrItem 
    : (categoryOrItem.category || categoryOrItem.name || '');
  const catLower = category.toLowerCase();
  if (catLower.includes('licor') || catLower.includes('bebida') || catLower.includes('bar') || catLower.includes('coctel')) {
    return 'Bar';
  } else if (catLower.includes('jugo') || catLower.includes('fruta') || catLower.includes('pulpa') || catLower.includes('smoothie') || catLower.includes('batido')) {
    return 'Zona de Jugos';
  } else {
    return 'Cocina';
  }
}

/**
 * Helper to update an inventory item's stock levels coherently across fields and per branch.
 */
function normalizeStockUpdate(item: InventoryItem, deltaPhysical: number, deltaReserved: number, branchId?: string) {
  const cleanBranchId = normalizeBranchId(branchId || getActiveBranchId());
  const currentPhysical = item.currentStock !== undefined 
    ? item.currentStock 
    : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0));

  // 1. stockByBranch
  const existingStockMap = consolidateStockByBranch(item.stockByBranch);
  const existingBranchKey = Object.keys(existingStockMap).find(k => areBranchIdsEqual(k, cleanBranchId));
  const curBranchPhys = existingBranchKey !== undefined
    ? existingStockMap[existingBranchKey]
    : (item.sucursalStock?.find(s => areBranchIdsEqual(s.sucursalId, cleanBranchId))?.stockActual ?? currentPhysical);
  const newBranchPhys = Math.round(Math.max(0, curBranchPhys + deltaPhysical) * 1000) / 1000;
  const stockByBranch = setBranchStockValue(existingStockMap, cleanBranchId, newBranchPhys);

  // 2. reservedStockByBranch
  const existingResMap = consolidateStockByBranch(item.reservedStockByBranch);
  const existingResKey = Object.keys(existingResMap).find(k => areBranchIdsEqual(k, cleanBranchId));
  const curBranchRes = existingResKey !== undefined
    ? existingResMap[existingResKey]
    : (item.reservedStock || 0);
  const newBranchRes = Math.round(Math.max(0, curBranchRes + deltaReserved) * 1000) / 1000;
  const reservedStockByBranch = setBranchStockValue(existingResMap, cleanBranchId, newBranchRes);

  // 3. sucursalStock
  const sucursalStock = setSucursalStockValue(item.sucursalStock, cleanBranchId, newBranchPhys);

  const newPhysical = Object.keys(stockByBranch).length > 0
    ? Math.round(Object.values(stockByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
    : newBranchPhys;
  const newReserved = Object.keys(reservedStockByBranch).length > 0
    ? Math.round(Object.values(reservedStockByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
    : newBranchRes;
  const newAvailable = Math.max(0, newPhysical - newReserved);

  const updatedPayload: Partial<InventoryItem> = {
    currentStock: newPhysical,
    realPhysicalStock: newPhysical,
    theoreticalStock: newPhysical,
    reservedStock: newReserved,
    availableStock: newAvailable,
    stockByBranch,
    reservedStockByBranch,
    sucursalStock,
    updatedAt: new Date().toISOString()
  };

  return updatedPayload;
}

/**
 * Helper to update a subrecipe's prepared batch portions coherently across fields and per branch.
 */
function normalizeRecipePortionsUpdate(recipe: Recipe, deltaPhysical: number, deltaReserved: number, branchId?: string) {
  const cleanBranchId = normalizeBranchId(branchId || getActiveBranchId());

  const existingPortionsMap = consolidateStockByBranch(recipe.stockPortionsByBranch);
  const existingPortionsKey = Object.keys(existingPortionsMap).find(k => areBranchIdsEqual(k, cleanBranchId));
  const curBranchPhys = existingPortionsKey !== undefined
    ? existingPortionsMap[existingPortionsKey]
    : (recipe.stockPortions || 0);
  const newBranchPhys = Math.round(Math.max(0, curBranchPhys + deltaPhysical) * 1000) / 1000;
  const stockPortionsByBranch = setBranchStockValue(existingPortionsMap, cleanBranchId, newBranchPhys);

  const existingResMap = consolidateStockByBranch(recipe.reservedPortionsByBranch);
  const existingResKey = Object.keys(existingResMap).find(k => areBranchIdsEqual(k, cleanBranchId));
  const curBranchRes = existingResKey !== undefined
    ? existingResMap[existingResKey]
    : (recipe.reservedPortions || 0);
  const newBranchRes = Math.round(Math.max(0, curBranchRes + deltaReserved) * 1000) / 1000;
  const reservedPortionsByBranch = setBranchStockValue(existingResMap, cleanBranchId, newBranchRes);

  const newPhysical = Object.keys(stockPortionsByBranch).length > 0
    ? Math.round(Object.values(stockPortionsByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
    : newBranchPhys;
  const newReserved = Object.keys(reservedPortionsByBranch).length > 0
    ? Math.round(Object.values(reservedPortionsByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
    : newBranchRes;
  const newAvailable = Math.max(0, newPhysical - newReserved);

  const updatedPayload: Partial<Recipe> = {
    stockPortions: newPhysical,
    reservedPortions: newReserved,
    availablePortions: newAvailable,
    stockPortionsByBranch,
    reservedPortionsByBranch,
    updatedAt: new Date().toISOString()
  };

  return updatedPayload;
}

/**
 * FASE 1: ENVÍO DE ORDEN / COMANDA A PREPARACIÓN (STAGING IDEMPOTENTE EN TIEMPO REAL)
 * Al agregar/modificar ítems en la comanda o al confirmar 'Enviar Comanda' (a Cocina o Bar):
 * - Ejecuta la explosión recursiva BOM de todos los ítems no consumidos de la orden para la sede activa.
 * - Reconcilia de forma idempotente cualquier reserva previa ('staged') del mismo ticket para evitar duplicaciones.
 * - Actualiza reservedStock y reservedStockByBranch para cada insumo en la sede activa.
 * - Actualiza reservedPortions y reservedPortionsByBranch si es una subreceta en lote.
 * - Registra las líneas de reserva en 'stockReservations' con status = 'staged'.
 */
export async function stageComandaStock(ticket: KdsOrderTicket): Promise<void> {
  if (!ticket || !ticket.id) return;

  const branchId = normalizeBranchId(ticket.branchId || ticket.sucursalId || getActiveBranchId());
  const requirements = Array.isArray(ticket.items) && ticket.items.length > 0
    ? await explodeTicketRequirements(ticket, undefined, { includeUnsent: true })
    : [];

  await db.transaction('rw', [db.inventoryItems, db.recipes, db.stockReservations], async () => {
    const timestamp = new Date().toISOString();

    // 1. Revertir cualquier reserva 'staged' previa de este mismo ticket (idempotencia)
    const existingReservations = await db.stockReservations
      .where('ticketId')
      .equals(ticket.id)
      .filter(r => r.status === 'staged')
      .toArray();

    for (const prevResv of existingReservations) {
      const prevBranch = normalizeBranchId(prevResv.branchId || branchId);
      if (prevResv.resourceType === 'subrecipe_portion' || prevResv.isSubRecipePortion) {
        const subRec = await db.recipes.get(prevResv.itemId);
        if (subRec) {
          const rollbackPayload = normalizeRecipePortionsUpdate(subRec, 0, -prevResv.quantityReserved, prevBranch);
          await db.recipes.update(subRec.id, rollbackPayload);
        }
      } else {
        const invItem = await db.inventoryItems.get(prevResv.itemId);
        if (invItem && invItem.inventoryType !== 'ASSET') {
          const rollbackPayload = normalizeStockUpdate(invItem, 0, -prevResv.quantityReserved, prevBranch);
          await db.inventoryItems.update(invItem.id, rollbackPayload);
        }
      }
      await db.stockReservations.delete(prevResv.id);
    }

    // 2. Aplicar las nuevas reservas para los ítems activos de la comanda
    for (const req of requirements) {
      if (req.quantityRequired <= 0) continue;

      if (req.resourceType === 'subrecipe_portion') {
        const subRec = await db.recipes.get(req.itemId);
        if (subRec) {
          const updatePayload = normalizeRecipePortionsUpdate(subRec, 0, req.quantityRequired, branchId);
          await db.recipes.update(subRec.id, updatePayload);

          const reservationId = `resv-${ticket.id}-${subRec.id}`;
          const reservation: StockReservation = {
            id: reservationId,
            orderId: ticket.orderId || ticket.id,
            ticketId: ticket.id,
            itemId: subRec.id,
            itemName: subRec.name,
            resourceType: 'subrecipe_portion',
            quantityReserved: req.quantityRequired,
            unit: req.unit,
            timestamp,
            status: 'staged',
            branchId,
            isSubRecipePortion: true,
            subRecipeId: subRec.id
          };
          await db.stockReservations.put(reservation);

          console.log(
            `[InventoryEngine:Stage] Staged ${req.quantityRequired} ${req.unit} of subrecipe '${subRec.name}' in branch '${branchId}' for ticket '${ticket.id}'.`
          );
        }
      } else {
        const item = await db.inventoryItems.get(req.itemId);
        if (item) {
          if (item.inventoryType === 'ASSET') continue;

          // 1. Increment reserved stock
          const updatePayload = normalizeStockUpdate(item, 0, req.quantityRequired, branchId);
          await db.inventoryItems.update(item.id, updatePayload);

          // 2. Register staging reservation
          const reservationId = `resv-${ticket.id}-${item.id}`;
          const reservation: StockReservation = {
            id: reservationId,
            orderId: ticket.orderId || ticket.id,
            ticketId: ticket.id,
            itemId: item.id,
            itemName: item.name,
            resourceType: req.resourceType,
            quantityReserved: req.quantityRequired,
            unit: req.unit,
            timestamp,
            status: 'staged',
            branchId
          };

          await db.stockReservations.put(reservation);

          console.log(
            `[InventoryEngine:Stage] Staged ${req.quantityRequired} ${req.unit} for '${item.name}' in branch '${branchId}' for ticket '${ticket.id}'. Reserved: ${updatePayload.reservedStock}, Available: ${updatePayload.availableStock}`
          );
        }
      }
    }
  });
}

/**
 * FASE 2: CONFIRMACIÓN Y DESCUENTO FÍSICO (KDS Listo / Despachado)
 * Cuando en el KDS / Pantalla de Cocina / Bar se marca la comanda o el plato como 'Listo' / 'Despachado':
 * - Descontar el stock físico real de la sede: stockByBranch[branchId] -= cantidadRequerida.
 * - Liberar la reserva de la sede: reservedStockByBranch[branchId] -= cantidadRequerida.
 * - Si es subreceta en lote: stockPortionsByBranch[branchId] -= cantidad y libera reserva.
 * - Marcar la reserva como 'committed'.
 * - Registrar movimiento de salida en el Kardex (inventoryLogs) con branchId.
 */
export async function commitComandaStock(ticketId: string, itemIndex?: number): Promise<void> {
  const ticket = await db.kdsOrderTickets.get(ticketId);
  if (!ticket) return;

  const modifiedItemIds = new Set<string>();
  const modifiedRecipeIds = new Set<string>();

  await db.transaction('rw', [db.inventoryItems, db.stockReservations, db.kdsOrderTickets, db.inventoryLogs, db.recipes], async () => {
    const txTicket = await db.kdsOrderTickets.get(ticketId);
    if (!txTicket) return;

    const branchId = normalizeBranchId(txTicket.branchId || txTicket.sucursalId || getActiveBranchId());

    // Check existing staged reservations for this ticket
    const existingReservations = await db.stockReservations
      .where('ticketId')
      .equals(ticketId)
      .filter(r => r.status === 'staged')
      .toArray();

    const timestamp = new Date().toISOString();
    const orderLabel = txTicket.orderId || txTicket.id;

    if (existingReservations.length > 0) {
      // Case A: Normal 2-Phase Flow with pre-existing Staged Reservations
      if (itemIndex !== undefined) {
        // Specific item committed
        const txItem = txTicket.items[itemIndex];
        if (!txItem || txItem.consumed) return;

        const channel = txTicket.orderType === 'TAKEAWAY' ? 'delivery' : 'dine_in';
        const itemReqs = await explodeItemRequirements(txItem.recipeId, txItem.quantity, channel, new Set(), branchId);

        for (const req of itemReqs) {
          const matchingResv = existingReservations.find(r => r.itemId === req.itemId && r.status === 'staged');
          const qtyToCommit = matchingResv 
            ? Math.min(matchingResv.quantityReserved, req.quantityRequired)
            : req.quantityRequired;

          if (req.resourceType === 'subrecipe_portion') {
            const subRec = await db.recipes.get(req.itemId);
            if (subRec) {
              const updatePayload = normalizeRecipePortionsUpdate(subRec, -qtyToCommit, -qtyToCommit, branchId);
              await db.recipes.put({ ...subRec, ...updatePayload });
              modifiedRecipeIds.add(subRec.id);
            }
          } else {
            const invItem = await db.inventoryItems.get(req.itemId);
            if (invItem && invItem.inventoryType !== 'ASSET') {
              // Deduct physical, release reserved in branch
              const updatePayload = normalizeStockUpdate(invItem, -qtyToCommit, -qtyToCommit, branchId);
              await db.inventoryItems.put({ ...invItem, ...updatePayload });
              modifiedItemIds.add(invItem.id);

              // Kardex Movement with branchId
              await db.inventoryLogs.add({
                id: `log-sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                itemId: invItem.id,
                itemName: invItem.name,
                type: 'Venta',
                quantity: -qtyToCommit,
                reason: `Venta Comanda #${orderLabel} (${txItem.name})`,
                user: txTicket.waiterId || 'KDS Cocina',
                timestamp,
                branchId
              });
            }
          }

          // Update reservation
          if (matchingResv) {
            if (matchingResv.quantityReserved <= qtyToCommit) {
              await db.stockReservations.update(matchingResv.id, { status: 'committed' });
            } else {
              await db.stockReservations.update(matchingResv.id, {
                quantityReserved: matchingResv.quantityReserved - qtyToCommit
              });
            }
          }
        }

        // Mark item as consumed
        const updatedItems = [...txTicket.items];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], consumed: true };
        await db.kdsOrderTickets.update(ticketId, { items: updatedItems });

      } else {
        // Entire ticket committed
        for (const resv of existingReservations) {
          const resvBranch = normalizeBranchId(resv.branchId || branchId);

          if (resv.resourceType === 'subrecipe_portion' || resv.isSubRecipePortion) {
            const subRec = await db.recipes.get(resv.itemId);
            if (subRec) {
              const updatePayload = normalizeRecipePortionsUpdate(subRec, -resv.quantityReserved, -resv.quantityReserved, resvBranch);
              await db.recipes.put({ ...subRec, ...updatePayload });
              modifiedRecipeIds.add(subRec.id);
            }
          } else {
            const invItem = await db.inventoryItems.get(resv.itemId);
            if (invItem && invItem.inventoryType !== 'ASSET') {
              const updatePayload = normalizeStockUpdate(invItem, -resv.quantityReserved, -resv.quantityReserved, resvBranch);
              await db.inventoryItems.put({ ...invItem, ...updatePayload });
              modifiedItemIds.add(invItem.id);

              // Kardex Movement with branchId
              await db.inventoryLogs.add({
                id: `log-sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                itemId: invItem.id,
                itemName: invItem.name,
                type: 'Venta',
                quantity: -resv.quantityReserved,
                reason: `Venta Comanda #${orderLabel}`,
                user: txTicket.waiterId || 'KDS Cocina',
                timestamp,
                branchId: resvBranch
              });
            }
          }

          await db.stockReservations.update(resv.id, { status: 'committed' });
        }

        // Mark all items consumed
        const updatedItems = txTicket.items.map(it => ({ ...it, consumed: true }));
        await db.kdsOrderTickets.update(ticketId, { items: updatedItems });
      }

    } else {
      // Case B: Fallback (ticket was not staged previously, e.g. direct KDS completion)
      const targetItems = itemIndex !== undefined ? [txTicket.items[itemIndex]] : txTicket.items;
      const channel = txTicket.orderType === 'TAKEAWAY' ? 'delivery' : 'dine_in';

      for (let i = 0; i < targetItems.length; i++) {
        const it = targetItems[i];
        if (!it || it.consumed) continue;

        const reqs = await explodeItemRequirements(it.recipeId, it.quantity, channel, new Set(), branchId);
        for (const req of reqs) {
          if (req.resourceType === 'subrecipe_portion') {
            const subRec = await db.recipes.get(req.itemId);
            if (subRec) {
              const updatePayload = normalizeRecipePortionsUpdate(subRec, -req.quantityRequired, 0, branchId);
              await db.recipes.put({ ...subRec, ...updatePayload });
              modifiedRecipeIds.add(subRec.id);
            }
          } else {
            const invItem = await db.inventoryItems.get(req.itemId);
            if (invItem && invItem.inventoryType !== 'ASSET') {
              const updatePayload = normalizeStockUpdate(invItem, -req.quantityRequired, 0, branchId);
              await db.inventoryItems.put({ ...invItem, ...updatePayload });
              modifiedItemIds.add(invItem.id);

              await db.inventoryLogs.add({
                id: `log-sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                itemId: invItem.id,
                itemName: invItem.name,
                type: 'Venta',
                quantity: -req.quantityRequired,
                reason: `Venta Comanda #${orderLabel} (${it.name})`,
                user: txTicket.waiterId || 'KDS Cocina',
                timestamp,
                branchId
              });
            }
          }
        }
      }

      const updatedItems = txTicket.items.map((it, idx) => 
        (itemIndex === undefined || idx === itemIndex) ? { ...it, consumed: true } : it
      );
      await db.kdsOrderTickets.update(ticketId, { items: updatedItems });
    }

    console.log(`[InventoryEngine:Commit] Committed physical stock deduction for ticket '${ticketId}' in branch '${branchId}'.`);
  });

  if (modifiedItemIds.size > 0 || modifiedRecipeIds.size > 0) {
    Promise.all([
      ...Array.from(modifiedItemIds).map(async id => {
        const it = await db.inventoryItems.get(id);
        if (it) await syncRecordToFirestore('inventoryItems', id, it);
      }),
      ...Array.from(modifiedRecipeIds).map(async id => {
        const rec = await db.recipes.get(id);
        if (rec) await syncRecordToFirestore('recipes', id, rec);
      })
    ]).catch(() => {});
  }
}

/**
 * FASE 3: ROLLBACK / CANCELACIÓN DE COMANDA
 * Si un mesero o administrador anula una comanda que estaba en preparación:
 * - Liberar la reserva sin tocar el stock físico: reservedStock -= cantidadRequerida.
 * - Marcar la reserva como 'released'.
 */
export async function releaseComandaStock(ticketId: string): Promise<void> {
  const modifiedItemIds = new Set<string>();
  const modifiedRecipeIds = new Set<string>();

  await db.transaction('rw', [db.inventoryItems, db.recipes, db.stockReservations], async () => {
    const stagedReservations = await db.stockReservations
      .where('ticketId')
      .equals(ticketId)
      .filter(r => r.status === 'staged')
      .toArray();

    if (stagedReservations.length === 0) return;

    for (const resv of stagedReservations) {
      const resvBranch = normalizeBranchId(resv.branchId || getActiveBranchId());

      if (resv.resourceType === 'subrecipe_portion' || resv.isSubRecipePortion) {
        const subRec = await db.recipes.get(resv.itemId);
        if (subRec) {
          const updatePayload = normalizeRecipePortionsUpdate(subRec, 0, -resv.quantityReserved, resvBranch);
          await db.recipes.put({ ...subRec, ...updatePayload });
          modifiedRecipeIds.add(subRec.id);

          await db.stockReservations.update(resv.id, { status: 'released' });
          console.log(
            `[InventoryEngine:Release] Released staged subrecipe portion reservation of ${resv.quantityReserved} for '${subRec.name}' in branch '${resvBranch}'.`
          );
        }
      } else {
        const invItem = await db.inventoryItems.get(resv.itemId);
        if (invItem) {
          // Decrease reserved stock without touching physical stock
          const updatePayload = normalizeStockUpdate(invItem, 0, -resv.quantityReserved, resvBranch);
          await db.inventoryItems.put({ ...invItem, ...updatePayload });
          modifiedItemIds.add(invItem.id);

          await db.stockReservations.update(resv.id, { status: 'released' });
          console.log(
            `[InventoryEngine:Release] Released staged reservation of ${resv.quantityReserved} for '${invItem.name}' in branch '${resvBranch}'. Reserved now: ${updatePayload.reservedStock}, Available: ${updatePayload.availableStock}`
          );
        }
      }
    }
  });

  if (modifiedItemIds.size > 0 || modifiedRecipeIds.size > 0) {
    Promise.all([
      ...Array.from(modifiedItemIds).map(async id => {
        const it = await db.inventoryItems.get(id);
        if (it) await syncRecordToFirestore('inventoryItems', id, it);
      }),
      ...Array.from(modifiedRecipeIds).map(async id => {
        const rec = await db.recipes.get(id);
        if (rec) await syncRecordToFirestore('recipes', id, rec);
      })
    ]).catch(() => {});
  }
}

/**
 * Backwards compatibility helper for KDS Display (calls commitComandaStock).
 */
export async function confirmConsumption(ticketId: string, itemIndex: number): Promise<void> {
  await commitComandaStock(ticketId, itemIndex);
}

/**
 * Backwards compatibility helper for complete ticket consumption.
 */
export async function confirmTicketConsumption(ticketId: string): Promise<void> {
  await commitComandaStock(ticketId);
}

/**
 * Atomic transaction to deduct inventory when an order is paid.
 * Ensures items already consumed in KDS are not double deducted.
 */
export async function processOrderPaidInventory(payload: OrderPaidPayload): Promise<void> {
  const ticket = await db.kdsOrderTickets.where('orderId').equals(payload.orderId).first();
  if (ticket) {
    // If ticket has unconsumed items or staged reservations, commit them
    const hasUnconsumed = ticket.items.some(it => !it.consumed);
    const stagedCount = await db.stockReservations
      .where('ticketId')
      .equals(ticket.id)
      .filter(r => r.status === 'staged')
      .count();
    if (hasUnconsumed || stagedCount > 0) {
      await commitComandaStock(ticket.id);
    }
  }
}

/**
 * Reconciles all reserved inventory (`reservedStock`, `reservedStockByBranch`, `reservedPortions`, `reservedPortionsByBranch`)
 * strictly against active open comandas (`overallStatus !== 'CERRADA' && overallStatus !== 'CANCELADA'`).
 * Purges any orphaned or stale reservations so `Reservado` accurately reflects only live open comandas.
 */
export async function reconcileReservedInventory(targetBranchId?: string): Promise<{
  cleanedItemsCount: number;
  cleanedRecipesCount: number;
}> {
  const activeBranchId = normalizeBranchId(targetBranchId || getActiveBranchId());
  const allTickets = await db.kdsOrderTickets.toArray();
  const openTickets = allTickets.filter(
    t => t && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA' && Array.isArray(t.items) && t.items.some(it => !it.consumed)
  );
  const openTicketIds = new Set(openTickets.map(t => t.id));

  // Clean up any staged reservations in db.stockReservations that belong to closed/cancelled/missing tickets
  const allStagedReservations = await db.stockReservations
    .filter(r => r.status === 'staged')
    .toArray();

  const orphanIds: string[] = [];
  const itemBranchReserved = new Map<string, Record<string, number>>();
  const recipeBranchReserved = new Map<string, Record<string, number>>();

  for (const resv of allStagedReservations) {
    if (!resv.ticketId || !openTicketIds.has(resv.ticketId)) {
      orphanIds.push(resv.id);
      continue;
    }
    const bId = normalizeBranchId(resv.branchId || activeBranchId);
    const qty = Math.max(0, Number(resv.quantityReserved) || 0);
    if (qty <= 0) continue;

    if (resv.resourceType === 'subrecipe_portion' || resv.isSubRecipePortion) {
      const recMap = recipeBranchReserved.get(resv.itemId) || {};
      recMap[bId] = Math.round(((recMap[bId] || 0) + qty) * 1000) / 1000;
      recipeBranchReserved.set(resv.itemId, recMap);
    } else {
      const itMap = itemBranchReserved.get(resv.itemId) || {};
      itMap[bId] = Math.round(((itMap[bId] || 0) + qty) * 1000) / 1000;
      itemBranchReserved.set(resv.itemId, itMap);
    }
  }

  if (orphanIds.length > 0) {
    await db.stockReservations.bulkDelete(orphanIds);
  }

  const timestamp = new Date().toISOString();
  const allItems = await db.inventoryItems.toArray();
  const itemsToFix: InventoryItem[] = [];

  for (const item of allItems) {
    const expectedMap = itemBranchReserved.get(item.id) || {};
    const expectedTotal = Math.round(
      Object.values(expectedMap).reduce((sum, v) => sum + (Number(v) || 0), 0) * 1000
    ) / 1000;
    const expectedInActive = expectedMap[activeBranchId] || 0;

    const currentRes = Number(item.reservedStock) || 0;
    const currentBranchRes = Number(item.reservedStockByBranch?.[activeBranchId]) || 0;
    const hasMainResKey = Boolean(item.reservedStockByBranch && ('main' in item.reservedStockByBranch || 'MAIN' in item.reservedStockByBranch));
    const physical = Number(item.currentStock ?? item.realPhysicalStock ?? 0) || 0;
    const expectedAvail = Math.max(0, physical - expectedTotal);

    if (
      Math.abs(currentRes - expectedTotal) > 0.001 ||
      Math.abs(currentBranchRes - expectedInActive) > 0.001 ||
      hasMainResKey ||
      Math.abs((Number(item.availableStock) || 0) - expectedAvail) > 0.001
    ) {
      const cleanResByBranch: Record<string, number> = {
        ...expectedMap,
        [activeBranchId]: expectedInActive
      };
      itemsToFix.push({
        ...item,
        reservedStock: expectedTotal,
        reservedStockByBranch: cleanResByBranch,
        availableStock: expectedAvail,
        updatedAt: timestamp
      });
    }
  }

  if (itemsToFix.length > 0) {
    await db.inventoryItems.bulkPut(itemsToFix);
  }

  const allRecipes = await db.recipes.toArray();
  const recipesToFix: Recipe[] = [];

  for (const rec of allRecipes) {
    if (!rec.isSubRecipe && !(rec.reservedPortions && rec.reservedPortions > 0) && !rec.reservedPortionsByBranch) {
      continue;
    }
    const expectedMap = recipeBranchReserved.get(rec.id) || {};
    const expectedTotal = Math.round(
      Object.values(expectedMap).reduce((sum, v) => sum + (Number(v) || 0), 0) * 1000
    ) / 1000;
    const expectedInActive = expectedMap[activeBranchId] || 0;

    const currentRes = Number(rec.reservedPortions) || 0;
    const currentBranchRes = Number(rec.reservedPortionsByBranch?.[activeBranchId]) || 0;
    const hasMainResKey = Boolean(rec.reservedPortionsByBranch && ('main' in rec.reservedPortionsByBranch || 'MAIN' in rec.reservedPortionsByBranch));
    const physical = Number(rec.stockPortions) || 0;
    const expectedAvail = Math.max(0, physical - expectedTotal);

    if (
      Math.abs(currentRes - expectedTotal) > 0.001 ||
      Math.abs(currentBranchRes - expectedInActive) > 0.001 ||
      hasMainResKey ||
      Math.abs((Number(rec.availablePortions) || 0) - expectedAvail) > 0.001
    ) {
      const cleanResByBranch: Record<string, number> = {
        ...expectedMap,
        [activeBranchId]: expectedInActive
      };
      recipesToFix.push({
        ...rec,
        reservedPortions: expectedTotal,
        reservedPortionsByBranch: cleanResByBranch,
        availablePortions: expectedAvail,
        updatedAt: timestamp
      });
    }
  }

  if (recipesToFix.length > 0) {
    await db.recipes.bulkPut(recipesToFix);
  }

  // Push reconciled reservations to Firestore in background
  if (itemsToFix.length > 0 || recipesToFix.length > 0) {
    Promise.all([
      ...itemsToFix.map(it => syncRecordToFirestore('inventoryItems', it.id, it)),
      ...recipesToFix.map(r => syncRecordToFirestore('recipes', r.id, r))
    ]).catch(() => {});
  }

  return {
    cleanedItemsCount: itemsToFix.length,
    cleanedRecipesCount: recipesToFix.length
  };
}

/**
 * RUTINA DE AUTO-MIGRACIÓN EN MEMORIA / DEXIE:
 * Al iniciar la aplicación o cargar el inventario: si existen registros donde stockByBranch
 * no contiene la sede activa actual (currentBranchId), pobla automáticamente
 * item.stockByBranch = { ...item.stockByBranch, [currentBranchId]: Number(item.currentStock) || 0 }
 * y lo persiste en Dexie.js para recuperar de inmediato las existencias de todos los elementos registrados.
 */
export async function autoMigrateBranchStock(targetBranchId?: string): Promise<{
  migratedItemsCount: number;
  migratedRecipesCount: number;
  activeBranchId: string;
}> {
  try {
    let activeBranchId = targetBranchId;

    if (!activeBranchId) {
      activeBranchId = getActiveBranchId();
    }

    if (!activeBranchId || activeBranchId === 'main') {
      try {
        const activeSetting = await db.systemSettings.get('active_branch_id');
        if (activeSetting?.value && String(activeSetting.value).trim()) {
          activeBranchId = String(activeSetting.value).trim();
        }
      } catch {
        // Continue fallback
      }
    }

    if (!activeBranchId || activeBranchId === 'main') {
      try {
        const branchesSetting = await db.systemSettings.get('system_branches');
        if (Array.isArray(branchesSetting?.value) && branchesSetting.value.length > 0) {
          const firstValid = branchesSetting.value.find((b: any) => b.active !== false) || branchesSetting.value[0];
          if (firstValid?.id) {
            activeBranchId = firstValid.id;
          }
        }
      } catch {
        // Continue fallback
      }
    }

    activeBranchId = normalizeBranchId(activeBranchId);

    // Persist synchronously to localStorage so all components share the exact active branch
    setActiveBranchId(activeBranchId);

    // Retrieve all officially valid branch IDs
    const validBranchIds = new Set<string>([activeBranchId.toLowerCase().trim()]);
    try {
      const branchesSetting = await db.systemSettings.get('system_branches');
      if (Array.isArray(branchesSetting?.value)) {
        branchesSetting.value.forEach((b: any) => {
          if (b?.id && b.active !== false) {
            validBranchIds.add(normalizeBranchId(String(b.id)).toLowerCase().trim());
          }
        });
      }
    } catch {
      // Continue
    }

    // 1. Sanitize Inventory Items
    const allItems = await db.inventoryItems.toArray();
    const itemsToUpdate: InventoryItem[] = [];

    for (const item of allItems) {
      let needsUpdate = false;
      const originalSucursalCount = item.sucursalStock?.length || 0;
      const originalStockByBranchKeys = Object.keys(item.stockByBranch || {}).length;

      // Consolidate duplicates by canonical branch ID
      let sucursalStock = consolidateSucursalStock(item.sucursalStock);
      let stockByBranch = consolidateStockByBranch(item.stockByBranch);

      if (sucursalStock.length !== originalSucursalCount || Object.keys(stockByBranch).length !== originalStockByBranchKeys) {
        needsUpdate = true;
      }

      // Filter out ghost branches like 'MAIN' or obsolete invalid IDs
      const filteredSucursal = sucursalStock.filter(
        s => s.sucursalId && s.sucursalId.toUpperCase() !== 'MAIN' && validBranchIds.has(s.sucursalId.toLowerCase().trim())
      );
      if (filteredSucursal.length !== sucursalStock.length) {
        needsUpdate = true;
        sucursalStock = filteredSucursal;
      }

      const filteredStockByBranch: Record<string, number> = {};
      for (const [k, v] of Object.entries(stockByBranch)) {
        if (k.toUpperCase() !== 'MAIN' && validBranchIds.has(k.toLowerCase().trim())) {
          filteredStockByBranch[k] = v;
        } else {
          needsUpdate = true;
        }
      }
      stockByBranch = filteredStockByBranch;

      // Identify stock for active branch
      const activeSucursalEntry = sucursalStock.find(s => areBranchIdsEqual(s.sucursalId, activeBranchId));
      const activeStockKey = Object.keys(stockByBranch).find(k => areBranchIdsEqual(k, activeBranchId));

      let resolvedActiveStock: number;
      if (activeStockKey !== undefined && typeof stockByBranch[activeStockKey] === 'number') {
        resolvedActiveStock = stockByBranch[activeStockKey];
      } else if (activeSucursalEntry && typeof activeSucursalEntry.stockActual === 'number') {
        resolvedActiveStock = activeSucursalEntry.stockActual;
      } else {
        resolvedActiveStock = Number(
          item.currentStock !== undefined 
            ? item.currentStock 
            : (item.realPhysicalStock !== undefined ? item.realPhysicalStock : (item.theoreticalStock || 0))
        ) || 0;
        needsUpdate = true;
      }

      // Self-heal single-branch items whose branch stock was artificially doubled by legacy 'main' + branch sum
      const rawCurrentStock = Number(item.currentStock) || 0;
      if (
        sucursalStock.length <= 1 &&
        Object.keys(stockByBranch).length <= 1 &&
        rawCurrentStock > 0 &&
        resolvedActiveStock > rawCurrentStock * 1.8 &&
        resolvedActiveStock < rawCurrentStock * 2.2
      ) {
        resolvedActiveStock = rawCurrentStock;
        needsUpdate = true;
      }

      // Self-heal exponential 2^n stock doubling caused by legacy 'main' + branch key collision (e.g. Aceite, Mayonesa)
      const maxRef = Math.max(
        (Number(item.maxStock) || 0) * 20,
        (Number(item.cantidadUtilizable) || 0) * 20,
        25000
      );
      if (resolvedActiveStock > 100000 && (Number(item.maxStock) || 0) <= 50000) {
        while (resolvedActiveStock > maxRef && resolvedActiveStock > 5000) {
          resolvedActiveStock = Math.round((resolvedActiveStock / 2) * 100) / 100;
        }
        needsUpdate = true;
      }

      // Ensure active branch has a unified, single canonical entry
      sucursalStock = setSucursalStockValue(
        sucursalStock,
        activeBranchId,
        resolvedActiveStock,
        { batchObservations: 'Stock activo verificado' },
        validBranchIds
      );
      stockByBranch = setBranchStockValue(
        stockByBranch,
        activeBranchId,
        resolvedActiveStock,
        validBranchIds
      );

      // Recalculate totalStock as the sum of all valid branches
      const recalculatedTotal = Math.round(
        sucursalStock.reduce((acc, s) => acc + (Number(s.stockActual) || 0), 0) * 1000
      ) / 1000;
      const reservedStock = Number(
        item.reservedStockByBranch?.[activeBranchId] !== undefined
          ? item.reservedStockByBranch[activeBranchId]
          : (item.reservedStock || 0)
      ) || 0;

      if (
        needsUpdate ||
        item.currentStock !== recalculatedTotal ||
        item.theoreticalStock !== recalculatedTotal ||
        item.stockByBranch?.[activeBranchId] !== resolvedActiveStock
      ) {
        itemsToUpdate.push({
          ...item,
          currentStock: recalculatedTotal,
          realPhysicalStock: recalculatedTotal,
          theoreticalStock: recalculatedTotal,
          availableStock: Math.max(0, recalculatedTotal - reservedStock),
          stockByBranch,
          sucursalStock,
          branchId: item.branchId || activeBranchId,
          updatedAt: new Date().toISOString()
        });
      }
    }

    if (itemsToUpdate.length > 0) {
      await db.inventoryItems.bulkPut(itemsToUpdate);
      console.log(`[AutoMigrate] Saneadas existencias y deduplicadas sedes de ${itemsToUpdate.length} insumos para la sede '${activeBranchId}'.`);
      Promise.all(
        itemsToUpdate.map(it => syncRecordToFirestore('inventoryItems', it.id, it))
      ).catch(() => {});
    }

    // 1.5 Clean up warehouse/ingredient categories accidentally persisted into menuCategories
    try {
      const WAREHOUSE_ONLY_NAMES = new Set([
        'frutas y verduras',
        'licores y destilados',
        'abarrotes y secos',
        'abarrotes secos',
        'aceites, salsas y condimentos',
        'carnes y embutidos',
        'lacteos y quesos',
        'lácteos y quesos',
        'panaderia e insumos',
        'panadería e insumos',
        'pescados y mariscos',
        'empaques y desechables',
        'empaques / desechables',
        'limpieza y aseo',
        'siropes y mixers',
        'garnish y decoracion',
        'garnish y decoración',
        'insumos operativos',
        'materia prima',
        'suministros'
      ]);
      const allMenuCats = await db.menuCategories.toArray();
      const pollutedIds = allMenuCats
        .filter(c => c?.name && WAREHOUSE_ONLY_NAMES.has(c.name.toLowerCase().trim()))
        .map(c => c.id);
      if (pollutedIds.length > 0) {
        await db.menuCategories.bulkDelete(pollutedIds);
      }
    } catch {
      // Ignore cleanup error
    }

    // 2. Sanitize Subrecipes prepared portions
    const allRecipes = await db.recipes.toArray();
    const recipesToUpdate: Recipe[] = [];

    for (const recipe of allRecipes) {
      if (recipe.isSubRecipe || (recipe.stockPortions && recipe.stockPortions > 0)) {
        let needsRecipeUpdate = false;
        const origPortionKeys = Object.keys(recipe.stockPortionsByBranch || {}).length;
        let portionsByBranch = consolidateStockByBranch(recipe.stockPortionsByBranch);
        let reservedByBranch = consolidateStockByBranch(recipe.reservedPortionsByBranch);

        if (Object.keys(portionsByBranch).length !== origPortionKeys) {
          needsRecipeUpdate = true;
        }

        const activePortionsKey = Object.keys(portionsByBranch).find(k => areBranchIdsEqual(k, activeBranchId));
        const resolvedPortions = activePortionsKey !== undefined 
          ? portionsByBranch[activePortionsKey] 
          : (Number(recipe.stockPortions) || 0);

        portionsByBranch = setBranchStockValue(portionsByBranch, activeBranchId, resolvedPortions, validBranchIds);

        const activeReservedKey = Object.keys(reservedByBranch).find(k => areBranchIdsEqual(k, activeBranchId));
        const reservedPortions = activeReservedKey !== undefined 
          ? reservedByBranch[activeReservedKey] 
          : (Number(recipe.reservedPortions) || 0);

        reservedByBranch = setBranchStockValue(reservedByBranch, activeBranchId, reservedPortions, validBranchIds);

        if (
          needsRecipeUpdate ||
          activePortionsKey === undefined ||
          recipe.stockPortions !== resolvedPortions ||
          recipe.availablePortions !== Math.max(0, resolvedPortions - reservedPortions) ||
          recipe.stockPortionsByBranch?.[activeBranchId] !== resolvedPortions
        ) {
          recipesToUpdate.push({
            ...recipe,
            stockPortions: resolvedPortions,
            availablePortions: Math.max(0, resolvedPortions - reservedPortions),
            stockPortionsByBranch: portionsByBranch,
            reservedPortionsByBranch: reservedByBranch,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    if (recipesToUpdate.length > 0) {
      await db.recipes.bulkPut(recipesToUpdate);
      console.log(`[AutoMigrate] Saneadas existencias de ${recipesToUpdate.length} subrecetas para la sede '${activeBranchId}'.`);
      Promise.all(
        recipesToUpdate.map(r => syncRecordToFirestore('recipes', r.id, r))
      ).catch(() => {});
    }

    // 3. Reconcile reserved inventory against active open comandas (clearing any phantom reservations)
    await reconcileReservedInventory(activeBranchId);

    return {
      migratedItemsCount: itemsToUpdate.length,
      migratedRecipesCount: recipesToUpdate.length,
      activeBranchId
    };
  } catch (err) {
    console.error('[AutoMigrate] Error ejecutando saneamiento automático de inventario:', err);
    return {
      migratedItemsCount: 0,
      migratedRecipesCount: 0,
      activeBranchId: targetBranchId || DEFAULT_BRANCH_ID
    };
  }
}

