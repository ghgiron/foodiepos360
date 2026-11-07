import { useState, useEffect, useMemo } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { KdsOrderTicket, KdsItemStatus, KdsOverallStatus, KdsOrderTicketItem } from '../types';
import { confirmConsumption } from '../db/inventoryEngine';
import { syncTicketToFirebase, forceResyncKds } from '../services/firebaseSync';
import toast from 'react-hot-toast';

export default function KdsDisplay() {
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<boolean>(false);
  const [sortUrgentsFirst, setSortUrgentsFirst] = useState<boolean>(false);
  const [stationMenuOpen, setStationMenuOpen] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // 1. Live Query active tickets from Dexie IndexedDB
  const tickets = useLiveQuery(async () => {
    const active = await db.kdsOrderTickets
      .filter(t => t.overallStatus === 'ORDEN TOMADA' || t.overallStatus === 'PREPARANDO')
      .toArray();
    // Sort FIFO (oldest first)
    return active.sort((a, b) => new Date(a.comandaTime).getTime() - new Date(b.comandaTime).getTime());
  }) || [];

  // 2. Live Query inventory items to compute low-stock warnings
  const inventoryItemsMap = useLiveQuery(async () => {
    const items = await db.inventoryItems.toArray();
    return new Map(items.map(item => [item.id, item]));
  }) || new Map();

  // 3. Live Query recipes to resolve ingredients
  const recipesMap = useLiveQuery(async () => {
    const recs = await db.recipes.toArray();
    return new Map(recs.map(rec => [rec.id, rec]));
  }) || new Map();

  // 4. Live Query system settings for KDS dynamic parameters
  const urgentThresholdMins = useLiveQuery(async () => {
    const setting = await db.systemSettings.get('kds_urgent_threshold_minutes');
    return setting ? Number(setting.value) : 15;
  }) ?? 15;

  // Live Query completed items history for today
  const historyToday = useLiveQuery(async () => {
    const all = await db.kdsProductPrepHistory.toArray();
    const todayStr = new Date().toDateString();
    return all.filter(h => h.prepCompletedAt ? new Date(h.prepCompletedAt).toDateString() === todayStr : false);
  }) || [];

  // Live Query low stock alerts history for today
  const alertsToday = useLiveQuery(async () => {
    const all = await db.kdsLowStockAlertsHistory.toArray();
    const todayStr = new Date().toDateString();
    return all.filter(a => new Date(a.timestamp).toDateString() === todayStr);
  }) || [];

  const urgentThresholdSeconds = urgentThresholdMins * 60;

  // Re-render elapsed timers every second
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update last update timestamp when tickets change
  useEffect(() => {
    setLastUpdate(new Date().toLocaleTimeString());
  }, [tickets]);

  // Helper: check if a recipe or item is below min limit (low stock)
  const isItemLowStock = (recipeId: string): boolean => {
    const recipe = recipesMap.get(recipeId);
    if (recipe) {
      return recipe.ingredients.some((ing: any) => {
        const invItem = inventoryItemsMap.get(ing.inventoryItemId);
        return invItem ? invItem.theoreticalStock < invItem.stockMinLimit : false;
      });
    } else {
      const invItem = inventoryItemsMap.get(recipeId);
      return invItem ? invItem.theoreticalStock < invItem.stockMinLimit : false;
    }
  };

  // Helper: calculate elapsed time
  const getElapsedTimeSeconds = (isoString: string): number => {
    return Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  };

  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  // Helper: log low stock alert to history (with a 1-hour throttle to avoid spamming)
  const logLowStockAlert = async (productId: string, productName: string, station: string) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    try {
      const existing = await db.kdsLowStockAlertsHistory
        .where('productId').equals(productId)
        .and(a => a.timestamp >= oneHourAgo)
        .first();

      if (!existing) {
        const recipe = recipesMap.get(productId);
        let stock = 0;
        let limit = 0;
        if (recipe) {
          recipe.ingredients.forEach((ing: any) => {
            const invItem = inventoryItemsMap.get(ing.inventoryItemId);
            if (invItem && invItem.theoreticalStock < invItem.stockMinLimit) {
              stock = invItem.theoreticalStock;
              limit = invItem.stockMinLimit;
            }
          });
        } else {
          const invItem = inventoryItemsMap.get(productId);
          if (invItem) {
            stock = invItem.theoreticalStock;
            limit = invItem.stockMinLimit;
          }
        }

        await db.kdsLowStockAlertsHistory.put({
          id: `alert-${productId}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          productId,
          productName,
          station,
          theoreticalStock: stock,
          stockMinLimit: limit,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Error logging low stock alert:', err);
    }
  };

  // Helper to dynamically resolve and normalize the operation zone of a ticket item
  const getItemZone = (item: KdsOrderTicketItem): string => {
    const zone = (item.operationZone || item.category || 'Cocina').trim();
    const lower = zone.toLowerCase();
    if (lower === 'bar' || lower === 'barra') return 'Bar';
    if (lower.includes('batido') || lower.includes('jugo') || lower.includes('licua')) return 'Batidos';
    return 'Cocina';
  };

  // Helper to dynamically resolve the operation zone of a recipe
  const getRecipeZone = (recipe: any): string => {
    const zone = (recipe.productionZone || recipe.category || 'Cocina').trim();
    const lower = zone.toLowerCase();
    if (lower === 'bar' || lower === 'barra') return 'Bar';
    if (lower.includes('batido') || lower.includes('jugo') || lower.includes('licua')) return 'Batidos';
    return 'Cocina';
  };

  // Helper to dynamically resolve the operation zone of an inventory item
  const getInventoryItemZone = (item: any): string => {
    const zone = (item.operationZone || item.category || 'Cocina').trim();
    const lower = zone.toLowerCase();
    if (lower === 'bar' || lower === 'barra') return 'Bar';
    if (lower.includes('batido') || lower.includes('jugo') || lower.includes('licua')) return 'Batidos';
    return 'Cocina';
  };

  // Helper to dynamically resolve the preparation status of a specific station on a ticket
  const getTicketStationStatus = (ticket: KdsOrderTicket, station: string): 'PENDING' | 'PREPARING' | 'COMPLETED' | 'NONE' => {
    const stationItems = ticket.items.filter(item => item.sent !== false && getItemZone(item).toLowerCase() === station.toLowerCase());
    if (stationItems.length === 0) return 'NONE';

    const allCompleted = stationItems.every(i => i.status === 'COMPLETED');
    if (allCompleted) return 'COMPLETED';

    const hasAnyPrep = stationItems.some(i => i.status === 'PREPARING' || i.status === 'COOKING');
    if (hasAnyPrep) return 'PREPARING';

    return 'PENDING';
  };

  // Helper to dynamically resolve the ticket status for the active filter mode
  const getTicketStatusForFilterMode = (ticket: KdsOrderTicket): 'PENDING' | 'PREPARING' | 'COMPLETED' | 'NONE' => {
    if (filterMode === 'ALL') {
      const statuses = ['Cocina', 'Bar', 'Batidos']
        .map(st => getTicketStationStatus(ticket, st))
        .filter(status => status !== 'NONE');
      
      if (statuses.length === 0) return 'NONE';
      if (statuses.every(status => status === 'COMPLETED')) return 'COMPLETED';
      if (statuses.some(status => status === 'PREPARING')) return 'PREPARING';
      if (statuses.some(status => status === 'PENDING')) return 'PENDING';
      return 'COMPLETED';
    } else {
      return getTicketStationStatus(ticket, filterMode);
    }
  };

  // Find index of the ticket within all tickets that are pending for the active station
  // sorted chronologically by comandaTime.
  const getArrivalOrderNumber = (ticketId: string): number => {
    const pendingOnly = tickets
      .filter(t => {
        const status = getTicketStatusForFilterMode(t);
        return status === 'PENDING';
      })
      .sort((a, b) => new Date(a.comandaTime).getTime() - new Date(b.comandaTime).getTime());
    const index = pendingOnly.findIndex(t => t.id === ticketId);
    return index !== -1 ? index + 1 : 0;
  };

  // Granular Item Status Control (Iniciar / Pausar / Completar)
  const handleUpdateItemStatus = async (ticketId: string, itemIndex: number, newStatus: KdsItemStatus) => {
    const ticket = await db.kdsOrderTickets.get(ticketId);
    if (!ticket) return;

    const newItems = [...ticket.items];
    const prevStatus = newItems[itemIndex].status;

    newItems[itemIndex] = {
      ...newItems[itemIndex],
      status: newStatus,
      completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
      consumed: newItems[itemIndex].consumed,
      prepStartedAt: newStatus === 'PREPARING' ? new Date().toISOString() : newItems[itemIndex].prepStartedAt
    };

    // Auto-update overall status based on items checklist (only sent items)
    const activeItems = newItems.filter(i => i.sent !== false);
    const allCompleted = activeItems.every(i => i.status === 'COMPLETED');
    const hasAnyPrep = activeItems.some(i => i.status === 'PREPARING' || i.status === 'COOKING');

    let newOverallStatus: KdsOverallStatus = ticket.overallStatus;
    if (allCompleted) {
      newOverallStatus = 'LISTO PARA MESERO';
    } else if (hasAnyPrep || newStatus === 'PREPARING') {
      newOverallStatus = 'PREPARANDO';
    } else {
      newOverallStatus = ticket.overallStatus === 'ORDEN TOMADA' ? 'ORDEN TOMADA' : 'PREPARANDO';
    }

    // Strict State Machine Guard: If ORDEN TOMADA, block any other target state except PREPARANDO.
    if (ticket.overallStatus === 'ORDEN TOMADA' && newOverallStatus !== 'PREPARANDO' && newOverallStatus !== 'ORDEN TOMADA') {
      toast.error('Flujo bloqueado: La comanda debe pasar a estado PREPARANDO primero.');
      return;
    }

    const updatePayload: Partial<KdsOrderTicket> = {
      items: newItems,
      overallStatus: newOverallStatus
    };

    if (newOverallStatus === 'PREPARANDO' && !ticket.prepStartedAt) {
      updatePayload.prepStartedAt = new Date().toISOString();
    }
    if (newOverallStatus === 'LISTO PARA MESERO') {
      updatePayload.dispatchedAt = new Date().toISOString();
    }

    const updatedTicket = { ...ticket, ...updatePayload };
    await syncTicketToFirebase(updatedTicket);

    // Call confirmConsumption on transition to completed
    if (newStatus === 'COMPLETED' && prevStatus !== 'COMPLETED') {
      await confirmConsumption(ticketId, itemIndex);

      // Create OperationalLoss log for preparation time
      const itemPrepStart = newItems[itemIndex].prepStartedAt || ticket.prepStartedAt || ticket.comandaTime;
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(itemPrepStart).getTime()) / 1000));
      const wasEfficient = elapsedSeconds <= (ticket.timeLimitMinutes * 60);
      const station = getItemZone(newItems[itemIndex]);

      await db.operationalLosses.put({
        id: `preptime-${ticketId}-${itemIndex}-${Date.now()}`,
        ticketId,
        recipeId: newItems[itemIndex].recipeId,
        name: newItems[itemIndex].name,
        quantity: newItems[itemIndex].quantity,
        cost: 0,
        reason: `Tiempo de Preparación: ${elapsedSeconds} segundos`,
        cancelledAt: new Date().toISOString(),
        waiterId: ticket.waiterId || 'Mesero',
        user: 'KDS Stn',
        operationZone: station
      });

      // Save to kdsProductPrepHistory
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
        prepCompletedAt: new Date().toISOString(),
        prepDurationSeconds: elapsedSeconds,
        status: 'COMPLETED',
        wasEfficient,
        createdAt: new Date().toISOString()
      });
      
      const isLow = isItemLowStock(newItems[itemIndex].recipeId);
      if (isLow) {
        await logLowStockAlert(newItems[itemIndex].recipeId, newItems[itemIndex].name, station);
        toast.error(`¡Alerta de Inventario! Stock mínimo superado para: ${newItems[itemIndex].name}`, {
          icon: '⚠️',
          duration: 4000
        });
      } else {
        toast.success(`Plato Listo: ${newItems[itemIndex].name}`, { icon: '🍳' });
      }
    } else if (newStatus === 'PENDING' && prevStatus === 'COMPLETED') {
      // Allow reverting back to pending if needed (consumed flag remains locally or can be reverted)
      toast.success(`Item revertido a pendiente: ${newItems[itemIndex].name}`, { icon: '🔄' });
    }
  };

  // Master Control: Iniciar toda la comanda
  const handleStartTicket = async (ticketId: string) => {
    const ticket = await db.kdsOrderTickets.get(ticketId);
    if (!ticket) return;

    const updatedItems = ticket.items.map(item => {
      const itemZone = getItemZone(item);
      const isTargetZone = filterMode === 'ALL' || itemZone.toLowerCase() === filterMode.toLowerCase();
      return {
        ...item,
        status: (isTargetZone && item.status === 'PENDING') ? ('PREPARING' as const) : item.status,
        prepStartedAt: (isTargetZone && item.status === 'PENDING') ? new Date().toISOString() : item.prepStartedAt
      };
    });

    const hasAnyPrep = updatedItems.some(i => i.status === 'PREPARING' || i.status === 'COOKING');
    const allCompleted = updatedItems.every(i => i.status === 'COMPLETED');
    let newOverallStatus: KdsOverallStatus = ticket.overallStatus;
    if (allCompleted) {
      newOverallStatus = 'LISTO PARA MESERO';
    } else if (hasAnyPrep) {
      newOverallStatus = 'PREPARANDO';
    }

    const updatePayload: Partial<KdsOrderTicket> = {
      items: updatedItems,
      overallStatus: newOverallStatus,
      prepStartedAt: ticket.prepStartedAt || new Date().toISOString()
    };

    const updatedTicket = { ...ticket, ...updatePayload };
    await syncTicketToFirebase(updatedTicket);
    toast.success(`Preparación de comanda iniciada.`, { icon: '👨‍🍳' });
  };

  // Master Control: Pausar toda la comanda
  const handlePauseTicket = async (ticketId: string) => {
    const ticket = await db.kdsOrderTickets.get(ticketId);
    if (!ticket) return;

    const updatedItems = ticket.items.map(item => {
      const itemZone = getItemZone(item);
      const isTargetZone = filterMode === 'ALL' || itemZone.toLowerCase() === filterMode.toLowerCase();
      return {
        ...item,
        status: (isTargetZone && (item.status === 'PREPARING' || item.status === 'COOKING')) ? ('PENDING' as const) : item.status
      };
    });

    const hasAnyPrep = updatedItems.some(i => i.status === 'PREPARING' || i.status === 'COOKING');
    const allCompleted = updatedItems.every(i => i.status === 'COMPLETED');
    let newOverallStatus: KdsOverallStatus = ticket.overallStatus;
    if (allCompleted) {
      newOverallStatus = 'LISTO PARA MESERO';
    } else if (hasAnyPrep) {
      newOverallStatus = 'PREPARANDO';
    } else {
      newOverallStatus = 'PREPARANDO';
    }

    const updatePayload: Partial<KdsOrderTicket> = {
      items: updatedItems,
      overallStatus: newOverallStatus,
      prepStartedAt: hasAnyPrep ? (ticket.prepStartedAt || new Date().toISOString()) : undefined
    };

    const updatedTicket = { ...ticket, ...updatePayload };
    await syncTicketToFirebase(updatedTicket);
    toast.success(`Comanda pausada.`, { icon: '⏸️' });
  };

  // Master Control: Finalizar Servicio (Complete active station items on ticket immediately)
  const handleCompleteTicket = async (ticketId: string) => {
    const ticket = await db.kdsOrderTickets.get(ticketId);
    if (!ticket) return;

    // Guard: Block completing if it's still ORDEN TOMADA
    if (ticket.overallStatus === 'ORDEN TOMADA') {
      toast.error('Flujo bloqueado: Inicie la comanda antes de marcarla como Lista.');
      return;
    }

    const completedItems = ticket.items.map(item => {
      if (item.sent === false) return item; // Skip drafts
      const itemZone = getItemZone(item);
      const isTargetZone = filterMode === 'ALL' || itemZone.toLowerCase() === filterMode.toLowerCase();
      if (isTargetZone) {
        return {
          ...item,
          status: 'COMPLETED' as const,
          completedAt: item.completedAt || new Date().toISOString(),
          consumed: item.consumed
        };
      }
      return item;
    });

    const activeItems = completedItems.filter(i => i.sent !== false);
    const allCompleted = activeItems.every(i => i.status === 'COMPLETED');
    const hasAnyPrep = activeItems.some(i => i.status === 'PREPARING' || i.status === 'COOKING');
    let newOverallStatus: KdsOverallStatus = ticket.overallStatus;
    if (allCompleted) {
      newOverallStatus = 'LISTO PARA MESERO';
    } else if (hasAnyPrep) {
      newOverallStatus = 'PREPARANDO';
    }

    const updatePayload: Partial<KdsOrderTicket> = {
      items: completedItems,
      overallStatus: newOverallStatus
    };
    if (newOverallStatus === 'LISTO PARA MESERO') {
      updatePayload.dispatchedAt = new Date().toISOString();
    }
    if (!ticket.prepStartedAt) {
      updatePayload.prepStartedAt = new Date().toISOString();
    }

    const updatedTicket = { ...ticket, ...updatePayload };
    await syncTicketToFirebase(updatedTicket);

    // Deduct stock and log prep times for completed items of this station
    for (let i = 0; i < ticket.items.length; i++) {
      const item = ticket.items[i];
      if (item.sent === false) continue; // Skip drafts
      const itemZone = getItemZone(item);
      const isTargetZone = filterMode === 'ALL' || itemZone.toLowerCase() === filterMode.toLowerCase();
      if (isTargetZone && item.status !== 'COMPLETED') {
        await confirmConsumption(ticketId, i);

        // Determine item prep started time
        const itemPrepStart = item.prepStartedAt || ticket.prepStartedAt || ticket.comandaTime;
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(itemPrepStart).getTime()) / 1000));
        const wasEfficient = elapsedSeconds <= (ticket.timeLimitMinutes * 60);

        // Create OperationalLoss log for prep time
        await db.operationalLosses.put({
          id: `preptime-${ticketId}-${i}-${Date.now()}`,
          ticketId,
          recipeId: item.recipeId,
          name: item.name,
          quantity: item.quantity,
          cost: 0,
          reason: `Tiempo de Preparación: ${elapsedSeconds} segundos`,
          cancelledAt: new Date().toISOString(),
          waiterId: ticket.waiterId || 'Mesero',
          user: 'KDS Stn',
          operationZone: itemZone
        });

        // Save to kdsProductPrepHistory
        await db.kdsProductPrepHistory.put({
          id: `${ticketId}-${i}`,
          ticketId,
          orderId: ticket.orderId,
          tableId: ticket.tableId,
          waiterId: ticket.waiterId,
          comandaTime: ticket.comandaTime,
          recipeId: item.recipeId,
          name: item.name,
          quantity: item.quantity,
          station: itemZone,
          prepStartedAt: itemPrepStart,
          prepCompletedAt: new Date().toISOString(),
          prepDurationSeconds: elapsedSeconds,
          status: 'COMPLETED',
          wasEfficient,
          createdAt: new Date().toISOString()
        });

        // Check stock and log alert if low stock
        const isLow = isItemLowStock(item.recipeId);
        if (isLow) {
          await logLowStockAlert(item.recipeId, item.name, itemZone);
        }
      }
    }

    // Toast alerts if any item is below minimum stock
    let lowStockDetected = false;
    for (const item of completedItems) {
      const itemZone = getItemZone(item);
      const isTargetZone = filterMode === 'ALL' || itemZone.toLowerCase() === filterMode.toLowerCase();
      if (isTargetZone && isItemLowStock(item.recipeId)) {
        lowStockDetected = true;
      }
    }

    if (lowStockDetected) {
      toast.error('¡Comanda completada con alertas de stock mínimo superado!', { icon: '⚠️', duration: 4000 });
    } else {
      toast.success('Mesa despachada con éxito. Servicio finalizado.', { icon: '✅' });
    }
  };

  // Toggle ticket urgency manual prioritization
  const handleToggleUrgent = async (ticketId: string) => {
    const ticket = await db.kdsOrderTickets.get(ticketId);
    if (!ticket) return;

    const updatedTicket = {
      ...ticket,
      isRushHourOrder: !ticket.isRushHourOrder
    };
    await syncTicketToFirebase(updatedTicket);

    toast.success(
      updatedTicket.isRushHourOrder
        ? 'Ticket marcado como URGENTE'
        : 'Urgencia removida del ticket',
      { icon: '🚨' }
    );
  };

  // Force Resync from Firebase Cloud
  const handleForceUpdate = async () => {
    setIsRefreshing(true);
    try {
      await forceResyncKds();
      toast.success('KDS resincronizado con éxito.', { icon: '🔄' });
    } catch (err: any) {
      toast.error(err.message || 'Error al resincronizar KDS');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter logic for stations and priority
  const filteredTickets = useMemo(() => {
    let result = tickets;

    // Filter by priority
    if (filterPriority) {
      result = result.filter(t => {
        const elapsed = getElapsedTimeSeconds(t.comandaTime);
        return t.isRushHourOrder || elapsed > urgentThresholdSeconds;
      });
    }

    // Filter by production zone
    if (filterMode !== 'ALL') {
      result = result.filter(ticket =>
        ticket.items.some(item => {
          const itemZone = getItemZone(item);
          return itemZone.toLowerCase() === filterMode.toLowerCase();
        })
      );
    }

    // Sort Urgents First if toggled
    if (sortUrgentsFirst) {
      result = [...result].sort((a, b) => {
        const aElapsed = getElapsedTimeSeconds(a.comandaTime);
        const bElapsed = getElapsedTimeSeconds(b.comandaTime);
        const aUrgent = a.isRushHourOrder || aElapsed > urgentThresholdSeconds;
        const bUrgent = b.isRushHourOrder || bElapsed > urgentThresholdSeconds;
        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;
        return new Date(a.comandaTime).getTime() - new Date(b.comandaTime).getTime();
      });
    }

    return result;
  }, [tickets, filterMode, filterPriority, sortUrgentsFirst, tick, urgentThresholdSeconds]);

  const pendingTickets = useMemo(() => {
    return filteredTickets.filter(t => {
      const status = getTicketStatusForFilterMode(t);
      return status === 'PENDING';
    });
  }, [filteredTickets, filterMode]);

  const preparingTickets = useMemo(() => {
    return filteredTickets.filter(t => {
      const status = getTicketStatusForFilterMode(t);
      return status === 'PREPARING';
    });
  }, [filteredTickets, filterMode]);

  // Dynamic Bento Statistics calculations
  const stats = useMemo(() => {
    const activeTickets = tickets.filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA');
    
    // Filter active tickets by active operationZone (filterMode)
    const activeTicketsForZone = activeTickets.filter(t => {
      if (filterMode === 'ALL') return true;
      const stationStatus = getTicketStationStatus(t, filterMode);
      return stationStatus === 'PENDING' || stationStatus === 'PREPARING';
    });

    // Filter today's completed history records by selected station
    const historyForZone = historyToday.filter(h => {
      if (filterMode === 'ALL') return true;
      return h.station.toLowerCase() === filterMode.toLowerCase();
    });

    // Calculate average preparation time of completed items in the shift
    let avgMins = 0;
    if (historyForZone.length > 0) {
      const totalPrepSeconds = historyForZone.reduce((sum, h) => sum + h.prepDurationSeconds, 0);
      avgMins = (totalPrepSeconds / historyForZone.length) / 60;
    } else {
      avgMins = 0.0;
    }

    // Active items for selected station
    const activeItemsCount = activeTicketsForZone.reduce((sum, t) => {
      const stationItems = t.items.filter(item => {
        if (item.sent === false) return false;
        if (filterMode === 'ALL') return true;
        return getItemZone(item).toLowerCase() === filterMode.toLowerCase();
      });
      return sum + stationItems.length;
    }, 0);

    // Delayed active items for selected station
    const delayedActiveItemsCount = activeTicketsForZone.reduce((sum, t) => {
      const elapsed = getElapsedTimeSeconds(t.comandaTime);
      const isDelayed = t.isRushHourOrder || elapsed > urgentThresholdSeconds;
      if (isDelayed) {
        const stationItems = t.items.filter(item => {
          if (item.sent === false) return false;
          if (filterMode === 'ALL') return true;
          return getItemZone(item).toLowerCase() === filterMode.toLowerCase();
        });
        return sum + stationItems.length;
      }
      return sum;
    }, 0);

    // Completed items on time during the shift
    const completedOnTimeCount = historyForZone.filter(h => h.wasEfficient).length;

    // Total items processed or active in this shift
    const totalItemsShift = historyForZone.length + activeItemsCount;
    const totalOnTimeShift = completedOnTimeCount + (activeItemsCount - delayedActiveItemsCount);

    const efficiency = totalItemsShift > 0 
      ? Math.round((totalOnTimeShift / totalItemsShift) * 100)
      : 100;

    return {
      averageTime: avgMins.toFixed(1),
      pendingTickets: activeTicketsForZone.length,
      urgents: activeTicketsForZone.filter(t => {
        const elapsed = getElapsedTimeSeconds(t.comandaTime);
        return t.isRushHourOrder || elapsed > urgentThresholdSeconds;
      }).length,
      efficiency,
      isOverloaded: activeTicketsForZone.filter(t => {
        const elapsed = getElapsedTimeSeconds(t.comandaTime);
        return t.isRushHourOrder || elapsed > urgentThresholdSeconds;
      }).length > 3
    };
  }, [tickets, historyToday, filterMode, tick, urgentThresholdSeconds]);

  // Helper to dynamically resolve the category of a KDS item based on recipes database or name mapping
  const resolveItemCategory = (item: KdsOrderTicketItem): string => {
    const recipe = recipesMap.get(item.recipeId);
    if (recipe && recipe.category && recipe.category !== 'KITCHEN' && recipe.category !== 'BAR') {
      return recipe.category;
    }

    const nameLower = item.name.toLowerCase();
    
    // Bar
    if (nameLower.includes('gin') || nameLower.includes('tonic') || nameLower.includes('margarita') || nameLower.includes('mojito') || nameLower.includes('cóctel') || nameLower.includes('coctel') || nameLower.includes('cerveza') || nameLower.includes('copa') || nameLower.includes('vino')) {
      return 'Cócteles';
    }
    if (nameLower.includes('ron') || nameLower.includes('whisky') || nameLower.includes('tequila') || nameLower.includes('vodka') || nameLower.includes('licor')) {
      return 'Licores';
    }

    // Batidos
    if (nameLower.includes('batido') || nameLower.includes('smoothie') || nameLower.includes('malteada')) {
      return 'Batidos';
    }
    if (nameLower.includes('jugo') || nameLower.includes('limonada') || nameLower.includes('extracto') || nameLower.includes('fruver')) {
      return 'Jugos';
    }

    // Cocina
    if (nameLower.includes('burger') || nameLower.includes('hamburguesa')) {
      return 'Burgers';
    }
    if (nameLower.includes('sushi') || nameLower.includes('roll') || nameLower.includes('maki') || nameLower.includes('nigiri')) {
      return 'Sushi';
    }
    if (nameLower.includes('ribeye') || nameLower.includes('bife') || nameLower.includes('carne') || nameLower.includes('lomo') || nameLower.includes('parrilla') || nameLower.includes('churrasco') || nameLower.includes('costillas')) {
      return 'Parrilla';
    }
    if (nameLower.includes('ensalada') || nameLower.includes('ceviche') || nameLower.includes('burrata') || nameLower.includes('frio') || nameLower.includes('carpaccio') || nameLower.includes('tártaro')) {
      return 'Fríos';
    }
    if (nameLower.includes('pasta') || nameLower.includes('sopa') || nameLower.includes('crema') || nameLower.includes('caliente')) {
      return 'Platos Calientes';
    }

    // Fallbacks
    if (item.category?.toLowerCase() === 'bar') return 'Bebidas/Bar';
    if (item.category?.toLowerCase().includes('batido') || item.category?.toLowerCase().includes('licua')) return 'Bebidas Frías';
    return 'Especiales';
  };

  // Dynamic Category Grouping for station summary (Requirement 3)
  const stationSummary = useMemo(() => {
    const activeItems: KdsOrderTicketItem[] = [];
    
    tickets.forEach(ticket => {
      ticket.items.forEach(item => {
        if (item.sent !== false && item.status !== 'COMPLETED') {
          // Check if item belongs to the active station filterMode
          let include = false;
          if (filterMode === 'ALL') {
            include = true;
          } else {
            const itemZone = getItemZone(item);
            include = itemZone.toLowerCase() === filterMode.toLowerCase();
          }
          
          if (include) {
            activeItems.push(item);
          }
        }
      });
    });

    const categoryCounts = activeItems.reduce((acc: Record<string, number>, curr) => {
      const cat = resolveItemCategory(curr);
      acc[cat] = (acc[cat] || 0) + curr.quantity;
      return acc;
    }, {});

    // Calculate low stock items for the selected station (including current and shift-long historical alerts)
    const lowStockItems: string[] = [];

    // Check recipes
    recipesMap.forEach(recipe => {
      const zone = getRecipeZone(recipe);
      const isTargetZone = filterMode === 'ALL' || zone.toLowerCase() === filterMode.toLowerCase();
      if (isTargetZone) {
        if (isItemLowStock(recipe.id)) {
          lowStockItems.push(recipe.name);
        }
      }
    });

    // Check inventory items
    inventoryItemsMap.forEach(item => {
      const zone = getInventoryItemZone(item);
      const isTargetZone = filterMode === 'ALL' || zone.toLowerCase() === filterMode.toLowerCase();
      if (isTargetZone) {
        if (item.theoreticalStock < item.stockMinLimit) {
          if (!lowStockItems.includes(item.name)) {
            lowStockItems.push(item.name);
          }
        }
      }
    });

    // Check historical stock alerts today
    alertsToday.forEach(alert => {
      const isTargetZone = filterMode === 'ALL' || alert.station.toLowerCase() === filterMode.toLowerCase();
      if (isTargetZone) {
        if (!lowStockItems.includes(alert.productName)) {
          lowStockItems.push(alert.productName);
        }
      }
    });

    let salsasStatus = 'En stock';
    const lowStockSauce = Array.from(recipesMap.values())
      .filter(r => r.name.toLowerCase().includes('salsa') || r.category.toLowerCase().includes('salsa'))
      .some(r => isItemLowStock(r.id));

    if (lowStockSauce) {
      salsasStatus = '⚠️ Stock Bajo';
    }

    return {
      categories: categoryCounts,
      salsas: salsasStatus,
      lowStockItems,
      hasLowStock: lowStockItems.length > 0
    };
  }, [tickets, recipesMap, inventoryItemsMap, filterMode, alertsToday]);

  const renderTicketCard = (ticket: KdsOrderTicket) => {
    const elapsed = getElapsedTimeSeconds(ticket.comandaTime);
    const isUrgent = ticket.isRushHourOrder || elapsed > urgentThresholdSeconds;
    const elapsedMins = Math.floor(elapsed / 60);

    let statusBarColor = 'bg-slate-350 dark:bg-slate-700';

    if (ticket.overallStatus === 'ORDEN TOMADA') {
      statusBarColor = 'bg-slate-450 dark:bg-slate-650';
    } else if (ticket.overallStatus === 'PREPARANDO') {
      statusBarColor = 'bg-[var(--accent-blue)]';
    } else if (ticket.overallStatus === 'LISTO PARA MESERO') {
      statusBarColor = 'bg-[var(--accent-yellow)]';
    } else if (ticket.overallStatus === 'ENTREGADO A MESA') {
      statusBarColor = 'bg-[var(--accent-green)]';
    }

    // Add late / urgent warning indicator if elapsed is late
    if (elapsedMins >= urgentThresholdMins && ticket.overallStatus !== 'LISTO PARA MESERO' && ticket.overallStatus !== 'ENTREGADO A MESA') {
      statusBarColor = 'bg-rose-500';
    }

    // Filter items in the card based on station selection, excluding unsent drafts
    const cardItems = ticket.items.filter(item => {
      if (item.sent === false) return false;
      if (filterMode === 'ALL') return true;
      const itemZone = getItemZone(item);
      return itemZone.toLowerCase() === filterMode.toLowerCase();
    });

    if (cardItems.length === 0) return null;

    // Check if ticket table is in preparing state
    const isTicketPreparing = !!ticket.prepStartedAt || ticket.items.some(i => i.status === 'PREPARING' || i.status === 'COOKING');

    const arrivalNumber = getArrivalOrderNumber(ticket.id);

    return (
      <div 
        key={ticket.id}
        className={`bg-surface border rounded-2xl overflow-hidden shadow-md flex flex-col justify-between relative transition-all duration-300 hover:shadow-lg ${
          isUrgent 
            ? 'border-2 border-rose-500 ring-2 ring-rose-500/20' 
            : 'border-line'
        }`}
      >
        {/* Status indicator line */}
        <div className={`h-1.5 w-full ${statusBarColor}`}></div>

        {/* Card header */}
        <div className="p-3.5 pb-2.5 border-b border-line bg-inset flex flex-col gap-2">
          {/* Fila 1: Mesa | Orden | Hora | Temporizador */}
          <div className="flex justify-between items-center gap-2 w-full">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-xl font-black text-content leading-none tracking-tight shrink-0">
                {typeof ticket.tableId === 'number' ? `Mesa ${ticket.tableId}` : ticket.tableId || 'Llevar'}
              </h3>
              {arrivalNumber > 0 && (
                <span className="bg-neutral-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black px-2 py-0.5 rounded shadow-sm shrink-0">
                  Orden #{arrivalNumber}
                </span>
              )}
              <span className="text-[10px] font-bold text-content-secondary bg-raised px-2 py-0.5 rounded shrink-0">
                {new Date(ticket.comandaTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {(ticket.branchId || ticket.sucursalId) && (
                <span className="bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded truncate max-w-[120px]" title={`Sede: ${ticket.branchId || ticket.sucursalId}`}>
                  {ticket.branchId || ticket.sucursalId}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handleToggleUrgent(ticket.id)}
                className={`p-1 rounded-lg transition-colors hover:bg-slate-200 dark:hover:bg-raised cursor-pointer border-none bg-transparent ${
                  ticket.isRushHourOrder 
                    ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10' 
                    : 'text-content-tertiary'
                }`}
                title="Marcar Urgente"
              >
                <span className="material-symbols-outlined text-base">flag</span>
              </button>
              
              <div className={`flex items-center gap-0.5 font-black ${isUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-content'}`}>
                <span className="material-symbols-outlined text-xs">schedule</span>
                <span className="text-[11px] tabular-numbers tracking-tight font-bold">{formatElapsedTime(elapsed)}</span>
              </div>
            </div>
          </div>

          {/* Fila 2: Urgente | #Comanda | Mesero | Pax */}
          <div className="flex items-center gap-1.5 text-[10px] text-content-secondary font-black uppercase tracking-wider min-w-0 w-full select-none whitespace-nowrap overflow-hidden">
            {isUrgent && (
              <span className="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 shadow-sm flex items-center gap-0.5 animate-pulse mr-1">
                🚨 URGENTE
              </span>
            )}
            <div className="flex items-center gap-1 truncate min-w-0 text-content">
              <span className="material-symbols-outlined text-[13px] shrink-0 text-content-secondary">person</span>
              <span className="truncate max-w-[95px] font-bold">{ticket.waiterId}</span>
              <span className="text-slate-400 dark:text-slate-700 font-normal">|</span>
              <span className="material-symbols-outlined text-[13px] shrink-0 text-content-secondary">groups</span>
              <span className="shrink-0 font-bold">{ticket.paxCount || 1} pax</span>
              <span className="text-slate-400 dark:text-slate-700 font-normal">|</span>
              <span className="bg-raised px-1.5 py-0.5 rounded tabular-numbers tracking-tight text-[9px] text-content font-black shrink-0">
                #{ticket.id.slice(-4).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Fila 3: Estados de estación (solo en vista global ALL) */}
          {(() => {
            const ticketStations = ['Cocina', 'Bar', 'Batidos'].filter(station => 
              ticket.items.some(item => item.sent !== false && getItemZone(item).toLowerCase() === station.toLowerCase())
            );
            if (filterMode !== 'ALL' || ticketStations.length === 0) return null;
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {ticketStations.map(station => {
                  const status = getTicketStationStatus(ticket, station);
                  let badgeBg = '';
                  let icon = '';
                  let statusLabel = '';

                  if (status === 'PENDING') {
                    badgeBg = 'bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600';
                    icon = 'schedule';
                    statusLabel = 'Pendiente';
                  } else if (status === 'PREPARING') {
                    badgeBg = 'bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800';
                    icon = 'skillet';
                    statusLabel = 'En prep';
                  } else if (status === 'COMPLETED') {
                    badgeBg = 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800';
                    icon = 'check_circle';
                    statusLabel = 'Listo';
                  }

                  return (
                    <span 
                      key={station}
                      className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm ${badgeBg}`}
                    >
                      <span className="material-symbols-outlined text-[10px]">{icon}</span>
                      {station}: {statusLabel}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Granular Items Checklist */}
        <div className="p-4 py-3 flex-1 space-y-2 overflow-y-auto bg-surface">
          {cardItems.map((item, idx) => {
            const isCompleted = item.status === 'COMPLETED';
            const isPreparing = item.status === 'PREPARING' || item.status === 'COOKING';
            const hasLowStock = isItemLowStock(item.recipeId);
            const originalIndex = ticket.items.indexOf(item);

            return (
              <div 
                key={idx}
                className={`flex items-start justify-between gap-2 p-2 rounded-xl transition-all border ${
                  isCompleted 
                    ? 'opacity-50 bg-slate-100/60 border-slate-200 dark:bg-surface/10 dark:border-line' 
                    : isPreparing
                      ? 'bg-blue-50/80 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40'
                      : 'bg-slate-50 border-slate-200/80 dark:bg-raised/40 dark:border-line'
                }`}
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {/* Quantity block */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                    isCompleted 
                      ? 'bg-emerald-600 text-white' 
                      : isPreparing
                        ? 'bg-blue-600 text-white animate-pulse'
                        : 'bg-neutral-900 text-white dark:bg-white dark:text-slate-900 border border-line'
                  }`}>
                    {item.quantity}x
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className={`font-black text-content text-sm leading-snug truncate ${isCompleted ? 'line-through text-slate-500 dark:text-slate-500 font-semibold' : ''}`}>
                        {item.name}
                      </p>
                      {item.ronda && (
                        <span className="bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">
                          Ronda {item.ronda}
                        </span>
                      )}
                      {hasLowStock && !isCompleted && (
                        <span className="bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900/80 dark:text-rose-200 dark:border-rose-800 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">
                          ⚠️ Stock Bajo
                        </span>
                      )}
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-[11px] text-content-secondary font-bold italic mt-0.5">
                        {item.modifiers.join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Granular prep status buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* If PENDING: show Play / Iniciar button */}
                  {!isPreparing && !isCompleted && (
                    <button
                      onClick={() => handleUpdateItemStatus(ticket.id, originalIndex, 'PREPARING')}
                      className="w-7 h-7 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center cursor-pointer transition-colors border-none"
                      title="Iniciar Preparación"
                    >
                      <span className="material-symbols-outlined text-lg">play_arrow</span>
                    </button>
                  )}

                  {/* If PREPARING: show Pause and Listo buttons */}
                  {isPreparing && !isCompleted && (
                    <>
                      <button
                        onClick={() => handleUpdateItemStatus(ticket.id, originalIndex, 'PENDING')}
                        className="w-7 h-7 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 flex items-center justify-center cursor-pointer transition-colors border-none"
                        title="Pausar Item"
                      >
                        <span className="material-symbols-outlined text-lg">pause</span>
                      </button>
                      <button
                        onClick={() => handleUpdateItemStatus(ticket.id, originalIndex, 'COMPLETED')}
                        className="w-7 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 flex items-center justify-center cursor-pointer transition-colors border-none"
                        title="Completar Item"
                      >
                        <span className="material-symbols-outlined text-lg">done</span>
                      </button>
                    </>
                  )}

                  {/* If COMPLETED: show checkmark tick icon, click to revert to PENDING */}
                  {isCompleted && (
                    <button
                      onClick={() => handleUpdateItemStatus(ticket.id, originalIndex, 'PENDING')}
                      className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 flex items-center justify-center cursor-pointer border-none"
                      title="Revertir a Pendiente"
                    >
                      <span className="material-symbols-outlined text-lg font-bold">check_circle</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 dark:bg-inset dark:border-line flex gap-2">
          {/* Play/Pause entire comanda button */}
          {isTicketPreparing ? (
            <button
              onClick={() => handlePauseTicket(ticket.id)}
              className="flex-1 py-2 bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/30 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[var(--accent-yellow)]/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
            >
              <span className="material-symbols-outlined text-base">pause</span>
              Pausar Todo
            </button>
          ) : (
            <button
              onClick={() => handleStartTicket(ticket.id)}
              className="flex-1 py-2 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[var(--accent-blue)]/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              Iniciar Todo
            </button>
          )}
          
          {/* Complete entire table button (Finalizar Servicio) */}
          <button
            onClick={() => handleCompleteTicket(ticket.id)}
            className="flex-1 py-2 bg-[var(--accent-green)] text-white border border-[var(--accent-green)] rounded-xl text-xs font-bold uppercase tracking-wider hover:brightness-110 transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans shadow-sm"
          >
            <span className="material-symbols-outlined text-base">check_circle</span>
            Listo
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-app)]">
      {/* Bento Grid Header */}
      <header className="p-8 pb-4 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Tiempo Promedio */}
          <div className="bg-surface border border-line rounded-3xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-content-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                TIEMPO PROMEDIO
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-content">{stats.averageTime}</span>
                <span className="text-xs font-bold text-content-secondary">minutos</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <span className="material-symbols-outlined text-xl">timer</span>
            </div>
          </div>

          {/* Card 2: Tickets Pendientes */}
          <div className="bg-surface border border-line rounded-3xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-content-secondary uppercase tracking-wider mb-2">
                TICKETS PENDIENTES
              </p>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-black text-content">{stats.pendingTickets}</span>
                {stats.urgents > 0 && (
                  <span className="bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-rose-300 dark:border-rose-800">
                    +{stats.urgents} urgentes
                  </span>
                )}
              </div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 flex items-center justify-center text-rose-700 dark:text-rose-300">
              <span className="material-symbols-outlined text-xl">local_activity</span>
            </div>
          </div>

          {/* Card 3: Eficiencia */}
          <div className="bg-surface border border-line rounded-3xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-content-secondary uppercase tracking-wider mb-2">
                EFICIENCIA
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-content">{stats.efficiency}%</span>
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-black flex items-center">
                  <span className="material-symbols-outlined text-[12px]">arrow_upward</span> 2%
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-300 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300">
              <span className="material-symbols-outlined text-xl">trending_up</span>
            </div>
          </div>

          {/* Card 4: Pendientes Estación */}
          <div className="bg-surface border border-line rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-content-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sky-600 dark:text-sky-400 text-sm">pending_actions</span>
                PENDIENTES ESTACIÓN
              </p>
              <div className="flex items-center gap-2 overflow-x-auto py-1 flex-wrap">
                {Object.entries(stationSummary.categories)
                  .filter(([_, count]) => count > 0)
                  .map(([cat, count]) => (
                    <span key={cat} className="text-[11px] font-extrabold bg-raised text-content px-2 py-0.5 rounded-lg border border-line shrink-0">
                      {cat}: <strong className="text-blue-600 dark:text-sky-400 font-black">{count}</strong>
                    </span>
                  ))}
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg border shrink-0 ${
                  stationSummary.hasLowStock 
                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800' 
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                }`}>
                  {stationSummary.hasLowStock 
                    ? `⚠️ Stock Bajo: ${stationSummary.lowStockItems.length} prod.`
                    : 'Stock: OK'}
                </span>
                {(filterMode === 'ALL' || filterMode.toLowerCase() === 'cocina') && (
                  <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg border shrink-0 ${
                    stationSummary.salsas.includes('⚠️') 
                      ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800' 
                      : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  }`}>
                    Salsas: {stationSummary.salsas}
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center border-t border-line pt-2 mt-2">
              <span className="text-[9px] text-content-secondary font-black uppercase tracking-wider">
                ACT.: {lastUpdate}
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
          </div>
        </div>
      </header>

      {/* Title & Filter Toolbar */}
      <div className="px-8 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-content">Tickets en Vivo</h2>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto relative flex-wrap sm:flex-nowrap justify-end">
          {/* Forced Resync Button */}
          <button
            onClick={handleForceUpdate}
            disabled={isRefreshing}
            className="px-4 py-2.5 bg-surface border border-line rounded-xl text-xs font-black uppercase tracking-wider text-content hover:bg-slate-100 dark:hover:bg-raised flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 transition-all"
            title="Forzar actualización de datos desde Firestore"
          >
            <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
            Actualizar KDS
          </button>

          {/* Station selector */}
          <div className="relative">
            <button
              onClick={() => setStationMenuOpen(!stationMenuOpen)}
              className="px-4 py-2.5 bg-surface border border-line rounded-xl text-xs font-black uppercase tracking-wider text-content hover:bg-slate-100 dark:hover:bg-raised flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">filter_list</span>
              Estación: {filterMode === 'ALL' ? 'Todo' : filterMode}
              <span className="material-symbols-outlined text-xs">keyboard_arrow_down</span>
            </button>
            
            {stationMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-surface border border-line rounded-xl shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => { setFilterMode('ALL'); setStationMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase hover:bg-slate-50 dark:hover:bg-raised/50 cursor-pointer ${
                    filterMode === 'ALL' ? 'text-[var(--color-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Todo
                </button>
                <button
                  onClick={() => { setFilterMode('Cocina'); setStationMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase hover:bg-slate-50 dark:hover:bg-raised/50 cursor-pointer ${
                    filterMode === 'Cocina' ? 'text-[var(--color-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Cocina
                </button>
                <button
                  onClick={() => { setFilterMode('Bar'); setStationMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase hover:bg-slate-50 dark:hover:bg-raised/50 cursor-pointer ${
                    filterMode === 'Bar' ? 'text-[var(--color-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Bar
                </button>
                <button
                  onClick={() => { setFilterMode('Batidos'); setStationMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase hover:bg-slate-50 dark:hover:bg-raised/50 cursor-pointer ${
                    filterMode === 'Batidos' ? 'text-[var(--color-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Batidos
                </button>
              </div>
            )}
          </div>

          {/* Sort Urgents First toggle */}
          <button
            onClick={() => setSortUrgentsFirst(!sortUrgentsFirst)}
            className={`px-4 py-2.5 border rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm transition-all ${
              sortUrgentsFirst 
                ? 'bg-[var(--accent-pink)] border-[var(--accent-pink)] text-white shadow-pink-500/20' 
                : 'bg-surface border-line text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Mover pedidos urgentes a la parte superior de cada columna"
          >
            <span className="material-symbols-outlined text-sm">vertical_align_top</span>
            Urgentes al Inicio
          </button>

          {/* Priority filter toggle */}
          <button
            onClick={() => setFilterPriority(!filterPriority)}
            className={`px-4 py-2.5 border rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm transition-all ${
              filterPriority 
                ? 'bg-rose-500 border-rose-500 text-white shadow-rose-500/20' 
                : 'bg-surface border-line text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">priority_high</span>
            Prioridad
          </button>
        </div>
      </div>

      {/* Main KDS Grid */}
      <main className="p-8 pt-4 flex-1 overflow-y-auto">
        {/* Kanban Board columns (2-column layout: Pendientes & En Preparación) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full min-h-[600px] w-full">
          {/* Column 1: Pendientes */}
          <div className="flex flex-col h-full bg-slate-200/60 border border-slate-300/70 dark:bg-surface/10 dark:border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse"></span>
                <h3 className="text-sm font-black uppercase tracking-wider text-content">Pendientes ({pendingTickets.length})</h3>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {pendingTickets.length === 0 ? (
                <div className="h-40 flex items-center justify-center border border-dashed border-line rounded-xl text-xs text-content-secondary font-bold">
                  Sin pedidos pendientes
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 items-start content-start">
                  {pendingTickets.map(ticket => (
                    <div key={ticket.id} className="w-full xl:w-[calc(50%-8px)] min-w-[280px] shrink-0">
                      {renderTicketCard(ticket)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Column 2: En Preparación */}
          <div className="flex flex-col h-full bg-slate-200/60 border border-slate-300/70 dark:bg-surface/10 dark:border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <h3 className="text-sm font-black uppercase tracking-wider text-content">En Preparación ({preparingTickets.length})</h3>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {preparingTickets.length === 0 ? (
                <div className="h-40 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-850 rounded-xl text-xs text-[var(--text-muted)] font-medium">
                  Sin pedidos en preparación
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 items-start content-start">
                  {preparingTickets.map(ticket => (
                    <div key={ticket.id} className="w-full xl:w-[calc(50%-8px)] min-w-[280px] shrink-0">
                      {renderTicketCard(ticket)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
