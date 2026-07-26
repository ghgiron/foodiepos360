// src/db/inventoryEngine.ts
import { db } from './localDb';
import type { OrderPaidPayload } from '../types';

/**
 * Maps inventory category to physical zones (Cocina, Bar, Zona de Jugos).
 */
export function getItemZone(category: string): 'Cocina' | 'Bar' | 'Zona de Jugos' {
  const catLower = category.toLowerCase();
  if (catLower.includes('licor') || catLower.includes('bebida') || catLower.includes('bar')) {
    return 'Bar';
  } else if (catLower.includes('jugo') || catLower.includes('fruta') || catLower.includes('pulpa')) {
    return 'Zona de Jugos';
  } else {
    return 'Cocina';
  }
}

/**
 * Recursively deducts stock for a given recipe or raw ingredient.
 * @param entityId The ID of the recipe or inventory item
 * @param quantity The quantity sold/used
 * @param type Whether the entity is a raw item, sub-recipe, or root recipe
 */
async function deductEntityStock(
  entityId: string,
  quantity: number,
  type: 'item' | 'subrecipe' | 'recipe'
): Promise<void> {
  if (type === 'item') {
    // Direct raw ingredient or single product
    const item = await db.inventoryItems.get(entityId);
    if (item) {
      if (item.inventoryType === 'ASSET') {
        console.log(`[InventoryEngine] Ignoring ASSET item '${item.name}' during order paid auto-deduction.`);
        return;
      }
      const newTheoretical = Math.max(0, item.theoreticalStock - quantity);
      
      // Update in local IndexedDB
      await db.inventoryItems.update(entityId, {
        theoreticalStock: newTheoretical,
        updatedAt: new Date().toISOString()
      });

      // Log the sales deduction
      await db.inventoryLogs.add({
        id: `log-sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        itemId: entityId,
        itemName: item.name,
        type: 'Venta',
        quantity: -quantity,
        reason: 'Consumo por Venta',
        user: 'Sistema',
        timestamp: new Date().toISOString()
      });

      console.log(
        `[InventoryEngine] Deducted ${quantity} ${item.countUnit} of raw item '${item.name}' (Zone: ${getItemZone(item.category)}). New theoretical stock: ${newTheoretical}`
      );
    }
  } else {
    // Recipe or Sub-recipe: open ingredients list and recurse
    const recipe = await db.recipes.get(entityId);
    if (recipe) {
      for (const ingredient of recipe.ingredients) {
        const totalIngredientQty = ingredient.quantity * quantity;
        await deductEntityStock(
          ingredient.inventoryItemId,
          totalIngredientQty,
          ingredient.type
        );
      }
    } else {
      // Fallback: If not found in recipes table, search as a Single Product in inventory
      const item = await db.inventoryItems.get(entityId);
      if (item) {
        await deductEntityStock(entityId, quantity, 'item');
      }
    }
  }
}

/**
 * Confirms consumption of ingredients for a KDS order ticket item.
 * Recursively deducts stock and marks the item as consumed.
 */
export async function confirmConsumption(ticketId: string, itemIndex: number): Promise<void> {
  const ticket = await db.kdsOrderTickets.get(ticketId);
  if (!ticket) return;

  const item = ticket.items[itemIndex];
  if (!item || item.consumed) return; // Already consumed or item doesn't exist

  await db.transaction('rw', [db.inventoryItems, db.recipes, db.kdsOrderTickets, db.inventoryLogs], async () => {
    // Re-verify under transaction
    const txTicket = await db.kdsOrderTickets.get(ticketId);
    if (!txTicket) return;
    const txItem = txTicket.items[itemIndex];
    if (!txItem || txItem.consumed) return;

    // 1. Deduct ingredient stocks
    const recipeExists = await db.recipes.get(txItem.recipeId);
    if (recipeExists) {
      await deductEntityStock(txItem.recipeId, txItem.quantity, 'recipe');
    } else {
      await deductEntityStock(txItem.recipeId, txItem.quantity, 'item');
    }

    // 2. Mark item as consumed in ticket
    const updatedItems = [...txTicket.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      consumed: true
    };

    await db.kdsOrderTickets.update(ticketId, {
      items: updatedItems
    });
    
    console.log(`[InventoryEngine] Confirmed consumption for '${txItem.name}' in ticket '${ticketId}'.`);
  });
}

/**
 * Confirms consumption for all items in a ticket that have not yet been marked consumed.
 */
export async function confirmTicketConsumption(ticketId: string): Promise<void> {
  const ticket = await db.kdsOrderTickets.get(ticketId);
  if (!ticket) return;

  for (let i = 0; i < ticket.items.length; i++) {
    if (!ticket.items[i].consumed) {
      await confirmConsumption(ticketId, i);
    }
  }
}

/**
 * Atomic transaction to deduct inventory when an order is paid.
 * Conforms to the domain event 'OrderPaid' and executes in a safe Dexie transaction.
 * Skips items that have already been marked as consumed in the KDS ticket to avoid double-deductions.
 */
export async function processOrderPaidInventory(payload: OrderPaidPayload): Promise<void> {
  await db.transaction('rw', [db.inventoryItems, db.recipes, db.kdsOrderTickets, db.inventoryLogs], async () => {
    // Look up KDS ticket for this order
    const ticket = await db.kdsOrderTickets.where('orderId').equals(payload.orderId).first();
    const consumedMatchedIndices = new Set<number>();
    let ticketUpdated = false;
    let updatedItems = ticket ? [...ticket.items] : [];

    for (const orderItem of payload.items) {
      let quantityToDeduct = orderItem.quantity;

      if (ticket) {
        // Find matching consumed items in KDS ticket that haven't been matched yet
        for (let i = 0; i < ticket.items.length; i++) {
          const tItem = ticket.items[i];
          if (tItem.recipeId === orderItem.recipeId && tItem.consumed && !consumedMatchedIndices.has(i)) {
            consumedMatchedIndices.add(i);
            quantityToDeduct = Math.max(0, quantityToDeduct - tItem.quantity);
            if (quantityToDeduct <= 0) break;
          }
        }
      }

      if (quantityToDeduct > 0) {
        const recipeExists = await db.recipes.get(orderItem.recipeId);
        if (recipeExists) {
          await deductEntityStock(orderItem.recipeId, quantityToDeduct, 'recipe');
        } else {
          await deductEntityStock(orderItem.recipeId, quantityToDeduct, 'item');
        }

        // Update KDS ticket items to consumed: true since we just deducted them
        if (ticket) {
          let qtyNeeded = quantityToDeduct;
          for (let i = 0; i < updatedItems.length; i++) {
            if (updatedItems[i].recipeId === orderItem.recipeId && !updatedItems[i].consumed) {
              const deductFromItem = Math.min(qtyNeeded, updatedItems[i].quantity);
              qtyNeeded -= deductFromItem;
              updatedItems[i] = {
                ...updatedItems[i],
                consumed: true
              };
              ticketUpdated = true;
              if (qtyNeeded <= 0) break;
            }
          }
        }
      }
    }

    if (ticket && ticketUpdated) {
      await db.kdsOrderTickets.update(ticket.id, {
        items: updatedItems
      });
    }
  });
}
