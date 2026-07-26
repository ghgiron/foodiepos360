import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/localDb';
import { processOrderPaidInventory, confirmConsumption } from '../db/inventoryEngine';
import { eventBus } from '../events/eventBus';
import type { 
  InventoryItem, 
  Recipe, 
  KdsOrderTicket, 
  KdsItemStatus, 
  KdsOverallStatus,
  OrderPaidPayload 
} from '../types';

// Mock Firebase Sync module to run purely offline-first on IndexedDB
vi.mock('../services/firebaseSync', () => ({
  syncTicketToFirebase: vi.fn(async (ticket) => {
    await db.kdsOrderTickets.put(ticket);
  }),
  forceResyncKds: vi.fn(),
}));

/**
 * Replicates the state transitions and database logging of the production KDS Display component.
 */
async function transitionKdsItemStatus(
  ticketId: string,
  itemIndex: number,
  newStatus: KdsItemStatus,
  timestamp: string
) {
  const ticket = await db.kdsOrderTickets.get(ticketId);
  if (!ticket) throw new Error(`Ticket with ID ${ticketId} not found`);

  const newItems = [...ticket.items];
  const prevStatus = newItems[itemIndex].status;

  newItems[itemIndex] = {
    ...newItems[itemIndex],
    status: newStatus,
    completedAt: newStatus === 'COMPLETED' ? timestamp : null,
    consumed: newItems[itemIndex].consumed,
    prepStartedAt: newStatus === 'PREPARING' ? timestamp : newItems[itemIndex].prepStartedAt
  };

  const activeItems = newItems.filter(i => i.sent !== false);
  const allCompleted = activeItems.every(i => i.status === 'COMPLETED');
  const hasAnyPrep = activeItems.some(i => i.status === 'PREPARING' || i.status === 'COOKING');

  let newOverallStatus: KdsOverallStatus = ticket.overallStatus;
  if (allCompleted) {
    newOverallStatus = 'LISTO PARA MESERO';
  } else if (hasAnyPrep || newStatus === 'PREPARING') {
    newOverallStatus = 'PREPARANDO';
  }

  const updatePayload: Partial<KdsOrderTicket> = {
    items: newItems,
    overallStatus: newOverallStatus
  };

  if (newOverallStatus === 'PREPARANDO' && !ticket.prepStartedAt) {
    updatePayload.prepStartedAt = timestamp;
  }
  if (newOverallStatus === 'LISTO PARA MESERO') {
    updatePayload.dispatchedAt = timestamp;
  }

  await db.kdsOrderTickets.update(ticketId, updatePayload);

  if (newStatus === 'COMPLETED' && prevStatus !== 'COMPLETED') {
    // Deduct stock for this specific item in IndexedDB
    await confirmConsumption(ticketId, itemIndex);

    const itemPrepStart = newItems[itemIndex].prepStartedAt || ticket.prepStartedAt || ticket.comandaTime;
    const elapsedSeconds = Math.max(0, Math.floor((new Date(timestamp).getTime() - new Date(itemPrepStart).getTime()) / 1000));
    const wasEfficient = elapsedSeconds <= (ticket.timeLimitMinutes * 60);
    const station = newItems[itemIndex].category === 'BAR' ? 'Bar' : 'Cocina';

    // Log the preparation time as an operational event
    await db.operationalLosses.put({
      id: `preptime-${ticketId}-${itemIndex}-${Date.now()}`,
      ticketId,
      recipeId: newItems[itemIndex].recipeId,
      name: newItems[itemIndex].name,
      quantity: newItems[itemIndex].quantity,
      cost: 0,
      reason: `Tiempo de Preparación: ${elapsedSeconds} segundos`,
      cancelledAt: timestamp,
      waiterId: ticket.waiterId || 'Mesero',
      user: 'KDS Stn',
      operationZone: station
    });

    // Write to the KDS historical analytics table
    await db.kdsProductPrepHistory.put({
      id: `${ticketId}-${itemIndex}`,
      ticketId,
      orderId: ticket.orderId,
      tableId: ticket.tableId,
      waiterId: ticket.waiterId,
      comandaTime: ticket.comandaTime,
      recipeId: newItems[itemIndex].recipeId,
      name: newItems[itemIndex].name,
      quantity: newItems[itemIndex].quantity,
      station,
      prepStartedAt: itemPrepStart,
      prepCompletedAt: timestamp,
      prepDurationSeconds: elapsedSeconds,
      status: 'COMPLETED',
      wasEfficient,
      createdAt: timestamp
    });
  }
}

describe('Prueba Funcional Completa: Camarón Roll & Cóctel Margarita', () => {
  
  beforeEach(async () => {
    // 1. Clear database tables to ensure clean, isolated state
    await db.inventoryItems.clear();
    await db.recipes.clear();
    await db.kdsOrderTickets.clear();
    await db.inventoryLogs.clear();
    await db.operationalLosses.clear();
    await db.kdsProductPrepHistory.clear();
    await db.domainOutbox.clear();
  });

  it('debería ejecutar el ciclo completo de inventario, recetas, comanda, cocina/bar y arqueo de auditoría', async () => {
    
    // ==========================================
    // PASO 1: Creación de Insumos en Inventario
    // ==========================================
    const insumosSushi: InventoryItem[] = [
      {
        id: 'ins-sushi-shrimp',
        name: 'Camarón Tigre Fresco',
        category: 'Carnes',
        purchaseUnit: 'Kg',
        countUnit: 'g',
        yieldFactor: 0.9,
        density: 1.0,
        bottleTareWeightGrams: 0,
        purchaseCost: 45000,
        gainPercentage: 150,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 500,
        theoreticalStock: 5000, // 5kg iniciales
        realPhysicalStock: 5000,
        abcClassification: 'A',
        supplierId: 'prov-mariscos-pacifico',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'ins-sushi-rice',
        name: 'Arroz para Sushi Premium',
        category: 'Abarrotes',
        purchaseUnit: 'Saco 5Kg',
        countUnit: 'g',
        yieldFactor: 1.0,
        density: 1.0,
        bottleTareWeightGrams: 0,
        purchaseCost: 8000,
        gainPercentage: 150,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 1000,
        theoreticalStock: 10000, // 10kg iniciales
        realPhysicalStock: 10000,
        abcClassification: 'B',
        supplierId: 'prov-lacteos-italianos',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'ins-sushi-nori',
        name: 'Alga Nori Hojas',
        category: 'Abarrotes',
        purchaseUnit: 'Paquete x50',
        countUnit: 'unidad',
        yieldFactor: 1.0,
        density: 1.0,
        bottleTareWeightGrams: 0,
        purchaseCost: 15000,
        gainPercentage: 200,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 10,
        theoreticalStock: 100, // 100 hojas iniciales
        realPhysicalStock: 100,
        abcClassification: 'C',
        supplierId: 'prov-lacteos-italianos',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'ins-sushi-avocado',
        name: 'Aguacate Hass Maduro',
        category: 'Verduras',
        purchaseUnit: 'Kg',
        countUnit: 'g',
        yieldFactor: 0.7,
        density: 1.0,
        bottleTareWeightGrams: 0,
        purchaseCost: 7000,
        gainPercentage: 150,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 300,
        theoreticalStock: 3000, // 3kg iniciales
        realPhysicalStock: 3000,
        abcClassification: 'B',
        supplierId: 'prov-lacteos-italianos',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      }
    ];

    const insumosCoctel: InventoryItem[] = [
      {
        id: 'ins-bar-tequila',
        name: 'Tequila Jose Cuervo Especial',
        category: 'Licores',
        purchaseUnit: 'Botella 750ml',
        countUnit: 'ml',
        yieldFactor: 1.0,
        density: 0.94,
        bottleTareWeightGrams: 450,
        purchaseCost: 120000,
        gainPercentage: 220,
        isTaxable: true,
        taxPercentage: 8,
        stockMinLimit: 750,
        theoreticalStock: 3000, // 4 botellas = 3000ml
        realPhysicalStock: 3000,
        abcClassification: 'A',
        supplierId: 'prov-diageo-colombia',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'ins-bar-limon',
        name: 'Zumo de Limón Fresco',
        category: 'Verduras',
        purchaseUnit: 'Litro',
        countUnit: 'ml',
        yieldFactor: 0.9,
        density: 1.0,
        bottleTareWeightGrams: 0,
        purchaseCost: 4000,
        gainPercentage: 150,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 200,
        theoreticalStock: 2000, // 2 Litros = 2000ml
        realPhysicalStock: 2000,
        abcClassification: 'C',
        supplierId: 'prov-mariscos-pacifico',
        sucursalStock: [],
        updatedAt: new Date().toISOString()
      }
    ];

    await db.inventoryItems.bulkPut([...insumosSushi, ...insumosCoctel]);

    // Verificar que los insumos fueron insertados correctamente
    const countItems = await db.inventoryItems.count();
    expect(countItems).toBe(6);

    // ==========================================
    // PASO 2: Creación de Fichas Técnicas
    // ==========================================
    const sushiRecipe: Recipe = {
      id: 'rec-camaron-roll-001',
      name: 'Camaron Roll',
      description: 'Rollo Premium de camarón crocante, aguacate fresco y arroz de sushi envuelto en nori.',
      category: 'KITCHEN',
      sellPrice: 42000,
      costPrice: 5950,
      yieldFactor: 1.0,
      cmvPercentage: 14.17, // (5950 / 42000) * 100
      bcgClassification: 'ESTRELLA',
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: 'ins-sushi-shrimp', type: 'item', quantity: 100, unit: 'g' },
        { inventoryItemId: 'ins-sushi-rice', type: 'item', quantity: 100, unit: 'g' },
        { inventoryItemId: 'ins-sushi-nori', type: 'item', quantity: 1, unit: 'unidad' },
        { inventoryItemId: 'ins-sushi-avocado', type: 'item', quantity: 50, unit: 'g' }
      ],
      productionZone: 'Cocina',
      updatedAt: new Date().toISOString()
    };

    const coctelRecipe: Recipe = {
      id: 'rec-margarita-001',
      name: 'Margarita de Autor',
      description: 'Cóctel refrescante con tequila premium, zumo de limón fresco y escarcha de sal marina.',
      category: 'BAR',
      sellPrice: 28000,
      costPrice: 8500,
      yieldFactor: 1.0,
      cmvPercentage: 30.36,
      bcgClassification: 'ESTRELLA',
      isSubRecipe: false,
      ingredients: [
        { inventoryItemId: 'ins-bar-tequila', type: 'item', quantity: 45, unit: 'ml' },
        { inventoryItemId: 'ins-bar-limon', type: 'item', quantity: 30, unit: 'ml' }
      ],
      productionZone: 'Bar',
      updatedAt: new Date().toISOString()
    };

    await db.recipes.bulkPut([sushiRecipe, coctelRecipe]);

    // Verificar que las recetas estén registradas
    const countRecipes = await db.recipes.count();
    expect(countRecipes).toBe(2);

    // ==========================================
    // PASO 3: Toma de Comanda (Registro de Pedido)
    // ==========================================
    const comandaBaseTime = new Date('2026-07-25T18:00:00.000Z');
    
    const newTicket: KdsOrderTicket = {
      id: 'kds-functional-test-001',
      orderId: 'ord-functional-test-001',
      tableId: 14,
      paxCount: 2,
      waiterId: 'user-mesero-camilo',
      comandaTime: comandaBaseTime.toISOString(),
      timeLimitMinutes: 15,
      isRushHourOrder: false,
      items: [
        {
          recipeId: 'rec-camaron-roll-001',
          name: 'Camaron Roll',
          category: 'KITCHEN',
          quantity: 1,
          modifiers: ['Camarón tempura extra crocante'],
          status: 'PENDING',
          completedAt: null,
          consumed: false,
          operationZone: 'Cocina'
        },
        {
          recipeId: 'rec-margarita-001',
          name: 'Margarita de Autor',
          category: 'BAR',
          quantity: 1,
          modifiers: ['Sin sal en el borde'],
          status: 'PENDING',
          completedAt: null,
          consumed: false,
          operationZone: 'Bar'
        }
      ],
      overallStatus: 'ORDEN TOMADA'
    };

    await db.kdsOrderTickets.put(newTicket);

    const savedTicket = await db.kdsOrderTickets.get('kds-functional-test-001');
    expect(savedTicket).toBeDefined();
    expect(savedTicket?.overallStatus).toBe('ORDEN TOMADA');
    expect(savedTicket?.items.length).toBe(2);

    // ==========================================
    // PASO 4: Gestión de Tiempos y Preparación KDS
    // ==========================================
    
    // T1: Iniciar preparación de ambos platos (1 minuto después de la comanda)
    const prepStartTime = new Date(comandaBaseTime.getTime() + 60 * 1000).toISOString(); // 18:01:00
    
    await transitionKdsItemStatus('kds-functional-test-001', 0, 'PREPARING', prepStartTime);
    await transitionKdsItemStatus('kds-functional-test-001', 1, 'PREPARING', prepStartTime);

    let preparingTicket = await db.kdsOrderTickets.get('kds-functional-test-001');
    expect(preparingTicket?.overallStatus).toBe('PREPARANDO');
    expect(preparingTicket?.items[0].status).toBe('PREPARING');
    expect(preparingTicket?.items[1].status).toBe('PREPARING');

    // T2: El bar es rápido y termina el cóctel (3 minutos después de iniciar la preparación = 18:04:00)
    const barCompletedTime = new Date(comandaBaseTime.getTime() + 4 * 60 * 1000).toISOString();
    await transitionKdsItemStatus('kds-functional-test-001', 1, 'COMPLETED', barCompletedTime);

    let midTicket = await db.kdsOrderTickets.get('kds-functional-test-001');
    expect(midTicket?.overallStatus).toBe('PREPARANDO'); // Aún falta la cocina
    expect(midTicket?.items[1].status).toBe('COMPLETED');
    expect(midTicket?.items[1].consumed).toBe(true);

    // T3: La cocina termina el sushi (5 minutos después de iniciar la preparación = 18:06:00)
    const kitchenCompletedTime = new Date(comandaBaseTime.getTime() + 6 * 60 * 1000).toISOString();
    await transitionKdsItemStatus('kds-functional-test-001', 0, 'COMPLETED', kitchenCompletedTime);

    let finishedTicket = await db.kdsOrderTickets.get('kds-functional-test-001');
    expect(finishedTicket?.overallStatus).toBe('LISTO PARA MESERO'); // Ambos listos
    expect(finishedTicket?.items[0].status).toBe('COMPLETED');
    expect(finishedTicket?.items[0].consumed).toBe(true);

    // ==========================================
    // PASO 5: Cierre de Venta (Pago)
    // ==========================================
    
    // Suscribir a la app principal para manejar el evento
    const handleOrderPaid = async (payload: OrderPaidPayload) => {
      await processOrderPaidInventory(payload);
    };
    eventBus.on('OrderPaid', handleOrderPaid);

    const payPayload: OrderPaidPayload = {
      orderId: 'ord-functional-test-001',
      tableId: 14,
      waiterId: 'user-mesero-camilo',
      totalAmount: 70000, // 42000 (sushi) + 28000 (margarita)
      netAmountBeforeTax: 64814.81,
      taxAmount: 5185.19,
      paymentMethod: 'Tarjeta Debito',
      items: [
        { recipeId: 'rec-camaron-roll-001', quantity: 1, unitPrice: 42000 },
        { recipeId: 'rec-margarita-001', quantity: 1, unitPrice: 28000 }
      ]
    };

    // Emitir el evento de pago
    await eventBus.emit('OrderPaid', payPayload);
    
    // Limpiar suscripción
    eventBus.off('OrderPaid', handleOrderPaid);

    // ==========================================
    // PASO 6: Auditoría y Verificación en DB
    // ==========================================

    // A. Verificar descuentos en inventario de Sushi (Camarón Roll)
    // Camarón Tigre: 5000g - 100g = 4900g
    const shrimp = await db.inventoryItems.get('ins-sushi-shrimp');
    expect(shrimp?.theoreticalStock).toBe(4900);

    // Arroz Sushi: 10000g - 100g = 9900g
    const rice = await db.inventoryItems.get('ins-sushi-rice');
    expect(rice?.theoreticalStock).toBe(9900);

    // Alga Nori: 100 - 1 = 99 unidades
    const nori = await db.inventoryItems.get('ins-sushi-nori');
    expect(nori?.theoreticalStock).toBe(99);

    // Aguacate: 3000g - 50g = 2950g
    const avocado = await db.inventoryItems.get('ins-sushi-avocado');
    expect(avocado?.theoreticalStock).toBe(2950);

    // B. Verificar descuentos en inventario de Cóctel (Margarita)
    // Tequila: 3000ml - 45ml = 2955ml
    const tequila = await db.inventoryItems.get('ins-bar-tequila');
    expect(tequila?.theoreticalStock).toBe(2955);

    // Zumo de Limón: 2000ml - 30ml = 1970ml
    const limon = await db.inventoryItems.get('ins-bar-limon');
    expect(limon?.theoreticalStock).toBe(1970);

    // C. Verificar el historial de preparación KDS (Duración)
    const prepHistory = await db.kdsProductPrepHistory.toArray();
    expect(prepHistory.length).toBe(2);

    // Validar historia del cóctel en el Bar (Duración: 18:04:00 - 18:01:00 = 180 segundos)
    const margaritaHistory = prepHistory.find(h => h.recipeId === 'rec-margarita-001');
    expect(margaritaHistory).toBeDefined();
    expect(margaritaHistory?.station).toBe('Bar');
    expect(margaritaHistory?.prepDurationSeconds).toBe(180);
    expect(margaritaHistory?.wasEfficient).toBe(true); // 180s <= 15 min limit (900s)

    // Validar historia del sushi en Cocina (Duración: 18:06:00 - 18:01:00 = 300 segundos)
    const sushiHistory = prepHistory.find(h => h.recipeId === 'rec-camaron-roll-001');
    expect(sushiHistory).toBeDefined();
    expect(sushiHistory?.station).toBe('Cocina');
    expect(sushiHistory?.prepDurationSeconds).toBe(300);
    expect(sushiHistory?.wasEfficient).toBe(true);

    // D. Verificar los Logs del Inventario (Inventory Logs)
    const logs = await db.inventoryLogs.toArray();
    expect(logs.length).toBe(6);
    const hasShrimpLog = logs.some(l => l.itemId === 'ins-sushi-shrimp' && l.quantity === -100 && l.type === 'Venta');
    const hasTequilaLog = logs.some(l => l.itemId === 'ins-bar-tequila' && l.quantity === -45 && l.type === 'Venta');
    expect(hasShrimpLog).toBe(true);
    expect(hasTequilaLog).toBe(true);

    // E. Verificar los Registros de Eficiencia y Pérdida Operativa (Operational Losses)
    const losses = await db.operationalLosses.toArray();
    expect(losses.length).toBe(2);
    const hasSushiPrepLoss = losses.some(l => l.recipeId === 'rec-camaron-roll-001' && l.reason.includes('300 segundos'));
    const hasCocktailPrepLoss = losses.some(l => l.recipeId === 'rec-margarita-001' && l.reason.includes('180 segundos'));
    expect(hasSushiPrepLoss).toBe(true);
    expect(hasCocktailPrepLoss).toBe(true);

    console.log('✅ ¡PRUEBA FUNCIONAL COMPLETADA CON ÉXITO!');
    console.log('Inventario de camarón restante:', shrimp?.theoreticalStock, 'g');
    console.log('Inventario de tequila restante:', tequila?.theoreticalStock, 'ml');
    console.log('Duración cóctel en Bar:', margaritaHistory?.prepDurationSeconds, 'segundos');
    console.log('Duración sushi en Cocina:', sushiHistory?.prepDurationSeconds, 'segundos');
  });
});
