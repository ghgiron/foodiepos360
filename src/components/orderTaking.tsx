import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db/localDb';
import { syncTicketToFirebase } from '../services/firebaseSync';
import { useLiveQuery } from 'dexie-react-hooks';
import { eventBus } from '../events/eventBus';
import { toast } from 'react-hot-toast';
import type { KdsOrderTicket, KdsOrderTicketItem, Client } from '../types';
import Modal from './ui/Modal';

// --- TYPES & HELPERS ---
type Category = string;

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  bcgClassification?: 'ESTRELLA' | 'CABALLO_DE_BATALLA' | 'ROMPECABEZAS' | 'PERRO';
  isRecommended?: boolean;
  isExperiential?: boolean;
  img?: string;
  allergens?: string[];
  productionZone?: string;
}

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DISPATCHED';
  addedAt: number; // timestamp
  ronda?: number;
  sent?: boolean;
}

const mapDbStatusToUiStatus = (dbStatus: string): 'PENDING' | 'PREPARING' | 'READY' | 'DISPATCHED' => {
  if (dbStatus === 'PENDING') return 'PENDING';
  if (dbStatus === 'PREPARING' || dbStatus === 'COOKING') return 'PREPARING';
  if (dbStatus === 'COMPLETED') return 'READY';
  if (dbStatus === 'DELIVERED') return 'DISPATCHED';
  return 'PENDING';
};

const mapUiStatusToDbStatus = (uiStatus: string): 'PENDING' | 'PREPARING' | 'COOKING' | 'COMPLETED' | 'DELIVERED' => {
  if (uiStatus === 'PENDING') return 'PENDING';
  if (uiStatus === 'PREPARING') return 'PREPARING';
  if (uiStatus === 'READY') return 'COMPLETED';
  if (uiStatus === 'DISPATCHED') return 'DELIVERED';
  return 'PENDING';
};

const determineRoute = (item: { name: string; category?: string; tipo_preparacion?: string; productionZone?: string }) => {
  if (item.productionZone) return item.productionZone;
  const prep = (item.tipo_preparacion || '').toLowerCase();
  if (prep === 'cocina' || prep === 'kitchen') return 'Cocina';
  if (prep === 'bar' || prep === 'barra') return 'Bar';
  if (prep === 'licuadoras' || prep === 'licuadora' || prep === 'batidos' || prep === 'jugos') return 'Licuadoras';

  const cat = (item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  if (cat.includes('licuadora') || cat.includes('jugo') || cat.includes('batido') || cat.includes('smoothie') || name.includes('jugo') || name.includes('batido') || name.includes('smoothie')) {
    return 'Licuadoras';
  }
  if (cat.includes('bar') || cat.includes('coctel') || cat.includes('bebida') || cat.includes('drink') || name.includes('gin') || name.includes('tonic') || name.includes('coctel') || name.includes('cerveza')) {
    return 'Bar';
  }
  return 'Cocina';
};

const formatLocalTime = (isoString: string | null): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return '';
  }
};

interface OrderTakingProps {
  selectedTableName?: string;
  selectedZoneName?: string;
  onOrderSubmitted?: () => void;
  onCancel?: () => void;
}

export const OrderTaking: React.FC<OrderTakingProps> = ({ selectedTableName = 'Mesa 12', selectedZoneName = 'Salón Principal', onOrderSubmitted, onCancel }) => {
  // Live query for recipes and inventory items
  const dbRecipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const dbInventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Map db recipes & products to UI MenuItem (filter by activo_catalogo: true)
  const menuItems = useMemo<MenuItem[]>(() => {
    const recipesMapped = dbRecipes
      .filter(recipe => recipe.activo_catalogo === true || recipe.mostrar_en_catalogo === true)
      .map(recipe => {
        const isRecommended = recipe.bcgClassification === 'ESTRELLA';
        const isExperiential = recipe.difficulty === 'Alta';
        return {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description || 'Sin descripción disponible.',
          price: recipe.sellPrice,
          category: recipe.category || 'General',
          bcgClassification: recipe.bcgClassification as MenuItem['bcgClassification'],
          isRecommended,
          isExperiential,
          img: recipe.img,
          allergens: (recipe.allergens || []).map(a => {
            const l = a.toLowerCase();
            if (l === 'pescado' || l === 'mariscos') return 'fish';
            if (l === 'gluten' || l === 'trigo') return 'gluten';
            return l;
          }),
          productionZone: recipe.productionZone || 'Cocina'
        };
      });

    const productsMapped = dbInventoryItems
      .filter(item => item.activo_catalogo === true)
      .map(item => {
        return {
          id: item.id,
          name: item.name,
          description: item.description || 'Sin descripción disponible.',
          price: item.sellPrice || 0,
          category: item.category || 'General',
          isRecommended: false,
          isExperiential: false,
          img: item.img,
          allergens: [],
          productionZone: item.operationZone || 'General'
        };
      });

    return [...recipesMapped, ...productsMapped];
  }, [dbRecipes, dbInventoryItems]);

  // Dynamic categories
  const CATEGORIES = useMemo(() => {
    const cats = new Set<string>();
    menuItems.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return ['Todos', ...Array.from(cats)];
  }, [menuItems]);

  // Load system settings
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const taxPercentage = systemSettings['taxPercentage'] !== undefined ? Number(systemSettings['taxPercentage']) : 10;
  const taxRate = taxPercentage / 100;

  // menuItems memoized above

  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  
  // Localized states for selected Table/Client info
  const [table, setTable] = useState(selectedTableName);
  const [client, setClient] = useState('');
  const [pax, setPax] = useState(4);
  const [orderId, setOrderId] = useState('');
  const [comandaTime, setComandaTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Responsive View Mode Toggle (Mobile-First)
  const [mobileView, setMobileView] = useState<'catalog' | 'ticket'>('catalog');

  // Cancel order modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Takeaway conversion modal states
  const [showTakeawayModal, setShowTakeawayModal] = useState(false);
  const [takeawayClientQuery, setTakeawayClientQuery] = useState('');
  const [isNewClientMode, setIsNewClientMode] = useState(false);

  // Takeaway Form States
  const [takeawayClientName, setTakeawayClientName] = useState('');
  const [takeawayPhone, setTakeawayPhone] = useState('');
  const [takeawayAddress, setTakeawayAddress] = useState('');
  const [takeawayElectronic, setTakeawayElectronic] = useState(false);
  const [takeawayEmail, setTakeawayEmail] = useState('');
  const [takeawayTaxId, setTakeawayTaxId] = useState('');

  // Live Query for Clients
  const dbClients = useLiveQuery(() => db.clients.toArray()) || [];

  const filteredClientsForTakeaway = useMemo(() => {
    return dbClients.filter(c => c.name.toLowerCase().includes(takeawayClientQuery.toLowerCase()));
  }, [dbClients, takeawayClientQuery]);

  const loadOrder = async () => {
    setIsLoading(true);
    try {
      const isTakeaway = selectedTableName.startsWith('To-Go');
      const clientName = isTakeaway ? selectedTableName.replace('To-Go:', '').trim() : '';
      const tableNumber = isTakeaway ? null : selectedTableName;

      const allRecipes = await db.recipes.toArray();
      const allItems = await db.inventoryItems.toArray();
      const ticket = isTakeaway
        ? await db.orders
            .filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA')
            .first()
        : await db.orders
            .where('tableId')
            .equals(tableNumber!)
            .filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA')
            .first();

      if (ticket) {
        setOrderId(`COMANDA #${ticket.orderId.substring(Math.max(0, ticket.orderId.length - 4))}`);
        setClient(ticket.clientId || (isTakeaway ? clientName : 'Mesa'));
        setPax(ticket.paxCount || 4);
        setComandaTime(ticket.comandaTime);
        
        const items: OrderItem[] = ticket.items.map((item, idx) => {
          const recipe = allRecipes.find(r => r.id === item.recipeId);
          const invItem = !recipe ? allItems.find(i => i.id === item.recipeId) : null;
          return {
            id: `item-${idx}-${Date.now()}`,
            menuItemId: item.recipeId,
            name: item.name,
            price: recipe ? recipe.sellPrice : (invItem ? (invItem.sellPrice || 0) : (item.category === 'BAR' ? 16000 : 38000)),
            quantity: item.quantity,
            note: item.modifiers?.[0] || '',
            status: mapDbStatusToUiStatus(item.status),
            addedAt: item.completedAt ? new Date(item.completedAt).getTime() : Date.now(),
            ronda: item.ronda || 1,
            sent: true
          };
        });
        setOrderItems(items);
      } else {
        setOrderId(`COMANDA #${Date.now().toString().slice(-4)}`);
        setClient(isTakeaway ? clientName : 'Mesa');
        setPax(4);
        setComandaTime(null);
        setOrderItems([]);
      }
    } catch (error) {
      console.error('Error loading order:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (dbRecipes.length > 0) {
      loadOrder();
    } else {
      setIsLoading(false);
    }
  }, [selectedTableName, dbRecipes.length]);

  const saveCartToDb = async (currentItems: OrderItem[]) => {
    const isTakeaway = table.startsWith('To-Go');
    const clientName = isTakeaway ? table.replace('To-Go:', '').trim() : client;
    const tableNumber = isTakeaway ? null : table;

    const existingTicket = isTakeaway
      ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
      : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

    if (currentItems.length === 0) {
      if (existingTicket) {
        existingTicket.overallStatus = 'CANCELADA';
        existingTicket.cancelJustification = 'Comanda vaciada (sin ítems)';
        existingTicket.closedAt = new Date().toISOString();
        await syncTicketToFirebase(existingTicket);
      }
      return;
    }

    const comandaItems: KdsOrderTicketItem[] = currentItems.map(item => {
      const recipe = dbRecipes.find(r => r.id === item.menuItemId);
      const invItem = !recipe ? dbInventoryItems.find(i => i.id === item.menuItemId) : null;
      
      const dbMatch = existingTicket?.items.find(i => 
        i.recipeId === item.menuItemId && 
        i.ronda === item.ronda &&
        i.sent !== false
      );

      return {
        recipeId: item.menuItemId,
        name: item.name,
        category: recipe?.productionZone || invItem?.operationZone || 'Cocina',
        operationZone: recipe?.productionZone || invItem?.operationZone || 'Cocina',
        quantity: item.quantity,
        modifiers: item.note ? [item.note] : [],
        status: dbMatch ? dbMatch.status : mapUiStatusToDbStatus(item.status),
        prepStartedAt: dbMatch ? dbMatch.prepStartedAt : null,
        completedAt: dbMatch ? dbMatch.completedAt : (item.status === 'READY' ? new Date().toISOString() : null),
        consumed: dbMatch ? dbMatch.consumed : false,
        seatNumber: 1,
        ronda: dbMatch ? dbMatch.ronda : (item.ronda || 1),
        sent: dbMatch ? true : (item.sent ?? false)
      };
    });

    if (existingTicket) {
      existingTicket.items = comandaItems;
      existingTicket.clientId = isTakeaway ? clientName : undefined;
      existingTicket.orderType = isTakeaway ? 'TAKEAWAY' : 'DINE_IN';
      existingTicket.tableId = tableNumber;
      await syncTicketToFirebase(existingTicket);
    } else {
      const ticketId = `kds-${Date.now()}`;
      const newComandaTime = new Date().toISOString();
      const newTicket: KdsOrderTicket = {
        id: ticketId,
        orderId: `ord-${Date.now()}`,
        tableId: tableNumber,
        clientId: isTakeaway ? clientName : undefined,
        orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        paxCount: pax,
        waiterId: "Alex M. (POS)",
        comandaTime: newComandaTime,
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        items: comandaItems,
        overallStatus: 'ORDEN TOMADA',
        createdAt: newComandaTime
      };
      await syncTicketToFirebase(newTicket);
      setComandaTime(newComandaTime);
    }
  };

  const handleAddItem = async (item: MenuItem) => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      status: 'PENDING',
      addedAt: Date.now(),
      sent: false
    };
    const updated = [...orderItems, newItem];
    setOrderItems(updated);
    await saveCartToDb(updated);
    toast.success(`${item.name} agregado.`);
  };

  const updateQuantity = async (id: string, delta: number) => {
    const targetItem = orderItems.find(item => item.id === id);
    if (!targetItem) return;

    if (targetItem.sent) {
      if (delta < 0) {
        toast.error('No se pueden eliminar o disminuir productos ya enviados a producción.');
        return;
      }
      // If delta > 0 (waiter clicked + on a sent item): append a new draft instead
      const menuItem = menuItems.find(m => m.id === targetItem.menuItemId);
      if (menuItem) {
        handleAddItem(menuItem);
      } else {
        const newItem: OrderItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          menuItemId: targetItem.menuItemId,
          name: targetItem.name,
          price: targetItem.price,
          quantity: 1,
          status: 'PENDING',
          addedAt: Date.now(),
          sent: false
        };
        const updated = [...orderItems, newItem];
        setOrderItems(updated);
        await saveCartToDb(updated);
        toast.success(`${targetItem.name} agregado (nueva ronda).`);
      }
      return;
    }

    const updated = orderItems.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    });
    setOrderItems(updated);
    await saveCartToDb(updated);
  };

  const removeItem = async (id: string) => {
    const targetItem = orderItems.find(item => item.id === id);
    if (!targetItem) return;

    if (targetItem.sent) {
      toast.error('No se pueden eliminar productos ya enviados a producción.');
      return;
    }

    const updated = orderItems.filter(item => item.id !== id);
    setOrderItems(updated);
    await saveCartToDb(updated);
  };

  const setItemNote = async (id: string, note: string) => {
    const targetItem = orderItems.find(item => item.id === id);
    if (targetItem?.sent) return;
    const updated = orderItems.map(item => item.id === id ? { ...item, note } : item);
    setOrderItems(updated);
    await saveCartToDb(updated);
  };

  const handleSendOrder = async () => {
    if (orderItems.length === 0) return;

    const unsentItems = orderItems.filter(item => !item.sent);
    if (unsentItems.length === 0) {
      toast.success('Todos los productos ya fueron enviados a producción.');
      return;
    }

    const isTakeaway = table.startsWith('To-Go');
    const clientName = isTakeaway ? table.replace('To-Go:', '').trim() : client;
    const tableNumber = isTakeaway ? null : table;

    const existingTicket = isTakeaway
      ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
      : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

    const existingRounds = existingTicket?.items.map(i => i.ronda || 1) || [0];
    const maxRound = Math.max(...existingRounds);
    const nextRound = maxRound + 1;

    // Mark unsent items as sent in state
    const updatedItems = orderItems.map(item => {
      if (!item.sent) {
        return {
          ...item,
          sent: true,
          ronda: nextRound
        };
      }
      return item;
    });
    setOrderItems(updatedItems);

    const comandaItems: KdsOrderTicketItem[] = updatedItems.map(item => {
      const recipe = dbRecipes.find(r => r.id === item.menuItemId);
      const invItem = !recipe ? dbInventoryItems.find(i => i.id === item.menuItemId) : null;
      
      const dbMatch = existingTicket?.items.find(i => 
        i.recipeId === item.menuItemId && 
        i.ronda === item.ronda &&
        i.sent !== false
      );

      return {
        recipeId: item.menuItemId,
        name: item.name,
        category: recipe?.productionZone || invItem?.operationZone || 'Cocina',
        operationZone: recipe?.productionZone || invItem?.operationZone || 'Cocina',
        quantity: item.quantity,
        modifiers: item.note ? [item.note] : [],
        status: dbMatch ? dbMatch.status : 'PENDING',
        prepStartedAt: dbMatch ? dbMatch.prepStartedAt : null,
        completedAt: dbMatch ? dbMatch.completedAt : null,
        consumed: dbMatch ? dbMatch.consumed : false,
        seatNumber: 1,
        ronda: item.ronda,
        sent: true
      };
    });

    let ticketToSave: KdsOrderTicket;

    if (existingTicket) {
      existingTicket.items = comandaItems;
      // If order status is READY or DELIVERED, sending new items reactivates it to PREPARANDO
      if (existingTicket.overallStatus === 'LISTO PARA MESERO' || existingTicket.overallStatus === 'ENTREGADO A MESA') {
        existingTicket.overallStatus = 'PREPARANDO';
      }
      ticketToSave = existingTicket;
      await syncTicketToFirebase(existingTicket);
    } else {
      const ticketId = `kds-${Date.now()}`;
      const newComandaTime = new Date().toISOString();
      ticketToSave = {
        id: ticketId,
        orderId: `ord-${Date.now()}`,
        tableId: tableNumber,
        clientId: isTakeaway ? clientName : undefined,
        orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        paxCount: pax,
        waiterId: "Alex M. (POS)",
        comandaTime: newComandaTime,
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        items: comandaItems,
        overallStatus: 'ORDEN TOMADA',
        createdAt: newComandaTime
      };
      await syncTicketToFirebase(ticketToSave);
      setComandaTime(newComandaTime);
    }

    await eventBus.emit('OrderPlaced', ticketToSave);

    const routedItems = unsentItems.map(item => {
      const recipe = dbRecipes.find(r => r.id === item.menuItemId);
      const route = determineRoute(recipe || { name: item.name, category: 'KITCHEN' });
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        route,
        category: recipe?.productionZone || 'Cocina'
      };
    });

    const cocinaItems = routedItems.filter(i => i.route === 'Cocina');
    const barItems = routedItems.filter(i => i.route === 'Bar');
    const licuadorasItems = routedItems.filter(i => i.route === 'Licuadoras');

    let toastMessage = `¡Ronda ${nextRound} enviada con éxito!`;
    if (cocinaItems.length > 0) {
      toastMessage += `\n🍳 Cocina: ${cocinaItems.map(i => `${i.name} (x${i.quantity})`).join(', ')}`;
    }
    if (barItems.length > 0) {
      toastMessage += `\n🍹 Bar: ${barItems.map(i => `${i.name} (x${i.quantity})`).join(', ')}`;
    }
    if (licuadorasItems.length > 0) {
      toastMessage += `\n🥤 Licuadoras: ${licuadorasItems.map(i => `${i.name} (x${i.quantity})`).join(', ')}`;
    }

    toast.success(toastMessage, { duration: 5000 });
  };

  const handleProcessPayment = async () => {
    if (orderItems.length === 0) return;
    
    try {
      const subtotalAmt = subtotal;
      const taxesAmt = taxes;
      const totalAmt = total;

      const isTakeaway = table.startsWith('To-Go');
      const clientName = isTakeaway ? table.replace('To-Go:', '').trim() : client;
      const tableNumber = isTakeaway ? null : table;

      const existingTicket = isTakeaway
        ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
        : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

      const comandaItems = orderItems.map(item => {
        const recipe = dbRecipes.find(r => r.id === item.menuItemId);
        const invItem = !recipe ? dbInventoryItems.find(i => i.id === item.menuItemId) : null;
        return {
          recipeId: item.menuItemId,
          name: item.name,
          category: recipe?.productionZone || invItem?.operationZone || 'Cocina',
          operationZone: recipe?.productionZone || invItem?.operationZone || 'Cocina',
          quantity: item.quantity,
          modifiers: item.note ? [item.note] : [],
          status: 'COMPLETED' as const,
          completedAt: new Date().toISOString(),
          consumed: false
        };
      });

      const ticketId = existingTicket ? existingTicket.id : `kds-${Date.now()}`;
      const ticketToSave: KdsOrderTicket = {
        id: ticketId,
        orderId: existingTicket ? existingTicket.orderId : `ord-${Date.now()}`,
        tableId: tableNumber,
        clientId: clientName || undefined,
        orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        paxCount: pax,
        waiterId: "Alex M. (POS)",
        comandaTime: existingTicket ? existingTicket.comandaTime : new Date().toISOString(),
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        items: comandaItems,
        overallStatus: 'CERRADA',
        createdAt: existingTicket ? existingTicket.createdAt : new Date().toISOString(),
        deliveredAt: existingTicket?.deliveredAt || new Date().toISOString(),
        closedAt: new Date().toISOString()
      };

      await syncTicketToFirebase(ticketToSave);

      const payPayload = {
        orderId: ticketToSave.orderId,
        tableId: tableNumber || 0,
        waiterId: ticketToSave.waiterId,
        totalAmount: totalAmt,
        netAmountBeforeTax: subtotalAmt,
        taxAmount: taxesAmt,
        paymentMethod: 'Efectivo',
        items: orderItems.map(i => ({
          recipeId: i.menuItemId,
          quantity: i.quantity,
          unitPrice: i.price
        })),
        clientData: clientName ? {
          name: clientName,
          email: '',
          taxId: undefined
        } : undefined
      };

      await eventBus.emit('OrderPaid', payPayload);

      await db.domainOutbox.put({
        eventId: `evt-orderpaid-${Date.now()}`,
        eventType: 'OrderPaid',
        payload: payPayload,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        syncedAt: null
      });

      toast.success(`¡Mesa cobrada exitosamente! Total: ${formatCurrency(totalAmt)}`);
      
      setOrderItems([]);
      if (onOrderSubmitted) {
        onOrderSubmitted();
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      toast.error('Error al procesar el cobro.');
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelReason) return;
    
    try {
      const isTakeaway = table.startsWith('To-Go');
      const clientName = isTakeaway ? table.replace('To-Go:', '').trim() : '';
      const tableNumber = isTakeaway ? null : table;

      const existingTicket = isTakeaway
        ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
        : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

      if (existingTicket) {
        for (const item of existingTicket.items) {
          const recipe = dbRecipes.find(r => r.id === item.recipeId);
          await db.operationalLosses.put({
            id: `waste-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            ticketId: existingTicket.id,
            recipeId: item.recipeId,
            name: item.name,
            quantity: item.quantity,
            cost: recipe ? recipe.costPrice : 0,
            reason: cancelReason,
            cancelledAt: new Date().toISOString(),
            waiterId: 'Alex M. (POS)',
            user: 'Alex M. (POS)',
            operationZone: item.operationZone || recipe?.productionZone || 'Cocina'
          });
        }
        existingTicket.overallStatus = 'CANCELADA';
        existingTicket.cancelJustification = cancelReason || "Cancelada desde Toma de Pedidos";
        existingTicket.closedAt = new Date().toISOString();
        await syncTicketToFirebase(existingTicket);
        toast.success('Comanda cancelada y registrada en auditoría de mermas.');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
    }

    setOrderItems([]);
    setIsCancelModalOpen(false);
    setCancelReason('');
    if (onCancel) onCancel();
  };

  // Convert current DINE_IN order to TAKEAWAY (Para Llevar)
  const handleConvertToTakeaway = async (selectedClient: Client) => {
    try {
      const oldIsTakeaway = table.startsWith('To-Go');
      const oldClientName = oldIsTakeaway ? table.replace('To-Go:', '').trim() : client;
      const oldTableNumber = oldIsTakeaway ? null : table;

      const existingTicket = oldIsTakeaway
        ? await db.orders.filter(t => t.clientId === oldClientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
        : await db.orders.where('tableId').equals(oldTableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

      if (existingTicket) {
        existingTicket.tableId = null;
        existingTicket.orderType = 'TAKEAWAY';
        existingTicket.clientId = selectedClient.name;
        await syncTicketToFirebase(existingTicket);
      } else {
        // Create new takeaway comanda record if cart not empty
        if (orderItems.length > 0) {
          const comandaItems: KdsOrderTicketItem[] = orderItems.map(item => {
            const recipe = dbRecipes.find(r => r.id === item.menuItemId);
            const invItem = !recipe ? dbInventoryItems.find(i => i.id === item.menuItemId) : null;
            return {
              recipeId: item.menuItemId,
              name: item.name,
              category: recipe?.productionZone || invItem?.operationZone || 'Cocina',
              operationZone: recipe?.productionZone || invItem?.operationZone || 'Cocina',
              quantity: item.quantity,
              modifiers: item.note ? [item.note] : [],
              status: 'PENDING',
              completedAt: null,
              consumed: false,
              seatNumber: 1
            };
          });

          const newComandaTime = new Date().toISOString();
          await syncTicketToFirebase({
            id: `kds-${Date.now()}`,
            orderId: `ord-${Date.now()}`,
            tableId: null,
            clientId: selectedClient.name,
            orderType: 'TAKEAWAY',
            paxCount: 1,
            waiterId: 'Alex M. (POS)',
            comandaTime: newComandaTime,
            timeLimitMinutes: 15,
            isRushHourOrder: false,
            items: comandaItems,
            overallStatus: 'ORDEN TOMADA',
            createdAt: newComandaTime
          });
          setComandaTime(newComandaTime);
        }
      }

      setTable(`To-Go: ${selectedClient.name}`);
      setClient(selectedClient.name);
      setPax(1);
      setShowTakeawayModal(false);
      toast.success(`Pedido desvinculado de la mesa y convertido a 'Para Llevar' para ${selectedClient.name}.`);
    } catch (err) {
      console.error('Error converting order to takeaway:', err);
      toast.error('Error al convertir a pedido para llevar.');
    }
  };

  const subtotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const taxes = subtotal * taxRate;
  const total = subtotal + taxes;

  const filteredMenu = menuItems.filter(item => {
    const matchesCat = activeCategory === 'Todos' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const renderStars = (bcg?: string) => {
    const count = bcg === 'ESTRELLA' ? 5 : bcg === 'CABALLO_DE_BATALLA' ? 4 : bcg === 'ROMPECABEZAS' ? 3 : 2;
    return (
      <div className="flex items-center text-[var(--accent-purple)] text-sm mb-2">
        {[...Array(5)].map((_, i) => (
          <span key={i} className="material-symbols-outlined text-[16px]">
            {i < count ? 'star' : 'star_border'}
          </span>
        ))}
      </div>
    );
  };

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;

  return (
    <div className="h-full w-full flex flex-col md:flex-row bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden">
      
      {/* LEFT PANEL - MENU (Visible in Catalog mode or desktop) */}
      <div className={`flex-1 flex flex-col p-6 overflow-hidden h-full ${mobileView === 'catalog' ? 'flex' : 'hidden md:flex'}`}>
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Toma de Pedidos</h1>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">search</span>
              <input 
                type="text" 
                placeholder="Buscar producto..." 
                className="pl-10 pr-4 py-2 rounded-full bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)] w-full md:w-64 transition-receitly border border-transparent focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={onCancel}
              className="h-10 w-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border-glow)] flex items-center justify-center text-[var(--text-secondary)] hover-accent-purple shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-3 mb-6 overflow-x-auto hide-scrollbar pb-2">
          {CATEGORIES.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2 rounded-full font-medium whitespace-nowrap transition-receitly cursor-pointer border ${
                activeCategory === cat 
                ? 'bg-[var(--text-primary)] text-[var(--bg-app)] dark:bg-[var(--text-accessible)] dark:text-[var(--bg-app)] border-transparent' 
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-glow)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-app)] dark:hover:bg-[var(--text-accessible)] dark:hover:text-[var(--bg-app)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto hide-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
          {isLoading ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <span className="material-symbols-outlined animate-spin text-4xl mb-2">sync</span>
              <p className="text-sm">Cargando menú...</p>
            </div>
          ) : filteredMenu.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[var(--text-muted)]">
              No se encontraron productos en el catálogo.
            </div>
          ) : (
            filteredMenu.map(item => (
              <div key={item.id} className="glass-card flex flex-col relative group cursor-pointer hover:-translate-y-1">
                
                {/* Badges */}
                <div className="absolute top-3 left-3 z-20 flex flex-col gap-1">
                  {item.isRecommended && (
                    <span className="bg-[var(--accent-pink)] text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider shadow-sm">
                      Recomendado del Chef
                    </span>
                  )}
                </div>
                <div className="absolute top-3 right-3 z-20 flex gap-1">
                  {item.allergens?.includes('fish') && <span className="material-symbols-outlined text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] rounded-full p-1 shadow-sm">set_meal</span>}
                  {item.allergens?.includes('gluten') && <span className="material-symbols-outlined text-sm text-[var(--text-muted)] bg-[var(--bg-surface)] rounded-full p-1 shadow-sm">bakery_dining</span>}
                </div>

                {/* Photo Image / Fallback Placeholder */}
                <div className="h-40 w-full rounded-[var(--radius-sm)] bg-[var(--bg-input)] mb-4 overflow-hidden flex items-center justify-center text-[var(--text-muted)] transition-receitly relative group-hover:opacity-90">
                  {item.img ? (
                    <img 
                      src={item.img} 
                      alt={item.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-5xl opacity-40">restaurant</span>
                  )}
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Rentabilidad
                  </div>
                  {renderStars(item.bcgClassification)}
                  
                  {item.isExperiential && (
                    <span className="bg-[var(--text-primary)] text-[var(--bg-surface)] text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider w-max mb-2 dark:bg-[var(--text-accessible)] dark:text-[var(--bg-app)]">
                      Experiencial
                    </span>
                  )}
                  
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 leading-tight">{item.name}</h3>
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-4 flex-1">
                    {item.description}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-xl font-bold text-[var(--accent-pink)]">
                      {formatCurrency(item.price)}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAddItem(item); }}
                      className="h-10 w-10 rounded-full bg-[var(--bg-input)] text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--accent-pink)] hover:text-white transition-receitly border-none cursor-pointer"
                    >
                      <span className="material-symbols-outlined">add</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Mobile floating button to view comanda */}
        <div className="md:hidden fixed bottom-6 left-6 right-6 z-30">
          <button
            onClick={() => setMobileView('ticket')}
            className="w-full py-3 bg-[var(--accent-purple)] text-white font-black rounded-xl text-sm flex items-center justify-between px-5 shadow-lg shadow-[var(--accent-purple)]/20 active:scale-98 transition-all border-none"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined">shopping_cart</span>
              <span>Ver Comanda ({orderItems.reduce((s, i) => s + i.quantity, 0)})</span>
            </div>
            <span className="font-mono font-bold">{formatCurrency(total)}</span>
          </button>
        </div>
      </div>

      {/* RIGHT PANEL - ACTIVE ORDER TICKET (Visible in Ticket mode or desktop) */}
      <div className={`w-full md:w-[400px] border-l border-[var(--border-glow)] bg-[var(--bg-surface)] flex flex-col h-full shadow-lg z-20 ${mobileView === 'ticket' ? 'flex' : 'hidden md:flex'}`}>
        
        {/* Ticket Header */}
        <div className="p-6 border-b border-[var(--border-glow)] flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setMobileView('catalog')}
                className="md:hidden p-1 bg-[var(--bg-input)] rounded-lg text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center border-none cursor-pointer"
                title="Volver al Menú"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
              </button>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{orderId || 'Comanda'}</h2>
            </div>
            <div className="flex gap-2">
              <button className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover-accent-purple border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined text-[20px]">person_add</span>
              </button>
              <button className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover-accent-purple border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined text-[20px]">more_horiz</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-[var(--bg-input)] rounded-[var(--radius-sm)] p-3">
            <div className="flex items-center gap-2 text-[var(--text-secondary)] font-medium text-sm overflow-hidden mr-2">
              <span className="material-symbols-outlined text-[18px] shrink-0">table_restaurant</span>
              <span className="truncate">
                {table} <span className="text-xs text-[var(--text-muted)] font-normal">({selectedZoneName})</span> {client && <span className="text-[var(--text-muted)]">• {client} ({pax} pax)</span>}
              </span>
            </div>
            {/* Convert to Takeaway Button */}
            {!table.startsWith('To-Go') && (
              <button 
                onClick={() => {
                  setTakeawayClientQuery('');
                  setIsNewClientMode(false);
                  setShowTakeawayModal(true);
                }}
                className="bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-all shrink-0 border-none cursor-pointer"
              >
                Para Llevar
              </button>
            )}
          </div>

          {comandaTime && (
            <div className="flex items-center gap-2 text-[var(--text-secondary)] text-xs font-semibold px-1 mt-1">
              <span className="material-symbols-outlined text-[16px] text-[var(--accent-purple)]">schedule</span>
              <span>Toma de pedido: {formatLocalTime(comandaTime)}</span>
            </div>
          )}
        </div>

        {/* Order Items List */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          {orderItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-60">
              <span className="material-symbols-outlined text-5xl mb-2">receipt_long</span>
              <p>No hay productos en la comanda</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {orderItems.map((item, idx) => (
                <div key={item.id} className="flex gap-3 bg-[var(--bg-app)] p-3 rounded-[var(--radius-sm)] border border-[var(--border-glow)] group">
                  <div className="font-bold text-[var(--text-primary)] w-5 text-xs">{idx + 1}</div>
                  <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <span className="font-bold text-[var(--text-primary)] text-sm leading-snug">{item.name}</span>
                      <span className="font-semibold text-[var(--text-primary)] text-sm font-mono shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                    
                    {/* Status and Round Indicator */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {item.sent ? (
                        <>
                          <span className="bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider">
                            Ronda {item.ronda || 1}
                          </span>
                          {item.status === 'PENDING' && (
                            <span className="bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider">
                              En Cola
                            </span>
                          )}
                          {item.status === 'PREPARING' && (
                            <span className="bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider">
                              Preparando
                            </span>
                          )}
                          {item.status === 'READY' && (
                            <span className="bg-emerald-100 text-emerald-900 border border-emerald-250 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider">
                              Listo
                            </span>
                          )}
                          {item.status === 'DISPATCHED' && (
                            <span className="bg-teal-100 text-teal-900 border border-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-800 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider">
                              Entregado
                            </span>
                          )}
                          <span className="text-[10px] text-[var(--text-muted)] font-medium">
                            hace {Math.floor((Date.now() - item.addedAt) / 60000) || 1}m
                          </span>
                        </>
                      ) : (
                        <span className="bg-amber-100 text-amber-900 border border-amber-250 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider animate-pulse">
                          Nuevo sin enviar
                        </span>
                      )}
                    </div>

                    {/* Note input area */}
                    <input 
                      type="text" 
                      placeholder="Añadir nota (ej. Sin cebolla)" 
                      value={item.note || ''}
                      onChange={(e) => setItemNote(item.id, e.target.value)}
                      disabled={item.sent}
                      className={`text-xs bg-transparent border-none focus:ring-0 text-[var(--text-secondary)] placeholder-[var(--text-muted)] mb-2 p-0 w-full outline-none focus:outline-none ${
                        item.sent ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    />

                    {/* Quantity Controls */}
                    <div className="flex items-center justify-between border-t border-[var(--border-glow)] pt-2 mt-auto">
                      <div className="flex items-center bg-[var(--bg-surface)] rounded-md border border-[var(--border-glow)]">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)} 
                          className={`px-2.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--accent-pink)] font-bold cursor-pointer border-none bg-transparent ${item.sent ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          -
                        </button>
                        <span className="px-3 py-0.5 text-xs font-mono font-bold text-[var(--text-primary)]">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)} 
                          className="px-2.5 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold cursor-pointer border-none bg-transparent"
                        >
                          +
                        </button>
                      </div>
                      <button 
                        onClick={() => removeItem(item.id)} 
                        className={`text-[var(--text-muted)] hover:text-[var(--accent-pink)] transition-receitly border-none bg-transparent cursor-pointer flex items-center ${item.sent ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticket Footer / Summary */}
        <div className="p-6 border-t border-[var(--border-glow)] bg-[var(--bg-surface)]">
          <div className="flex justify-between items-center mb-2 text-sm text-[var(--text-secondary)]">
            <span>Subtotal</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center mb-4 text-sm text-[var(--text-secondary)]">
            <span>Impuestos ({taxPercentage}%)</span>
            <span className="font-mono">{formatCurrency(taxes)}</span>
          </div>
          <div className="flex justify-between items-center mb-6">
            <span className="text-xl font-bold text-[var(--text-primary)]">Total</span>
            <span className="text-2xl font-black text-[var(--accent-pink)] font-mono">{formatCurrency(total)}</span>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <button className="flex flex-col items-center justify-center py-2 bg-[var(--bg-input)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover-accent-purple group border-none cursor-pointer">
              <span className="material-symbols-outlined text-[20px] mb-1 group-hover:text-[var(--accent-purple)]">print</span>
              <span className="text-[10px] font-medium">Imprimir</span>
            </button>
            <button className="flex flex-col items-center justify-center py-2 bg-[var(--bg-input)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover-accent-purple group border-none cursor-pointer">
              <span className="material-symbols-outlined text-[20px] mb-1 group-hover:text-[var(--accent-purple)]">call_split</span>
              <span className="text-[10px] font-medium">Dividir</span>
            </button>
            <button className="flex flex-col items-center justify-center py-2 bg-[var(--bg-input)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover-accent-purple group border-none cursor-pointer">
              <span className="material-symbols-outlined text-[20px] mb-1 group-hover:text-[var(--accent-purple)]">swap_horiz</span>
              <span className="text-[10px] font-medium">Mover</span>
            </button>
            <button 
              onClick={() => setIsCancelModalOpen(true)}
              className="flex flex-col items-center justify-center py-2 bg-[var(--bg-input)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[#FEE2E2] hover:text-[#DC2626] dark:hover:bg-[#7F1D1D] dark:hover:text-[#FCA5A5] transition-receitly border-none cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] mb-1">cancel</span>
              <span className="text-[10px] font-medium">Cancelar</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={async () => {
                await handleSendOrder();
                if (onOrderSubmitted) {
                  onOrderSubmitted();
                }
              }}
              disabled={orderItems.length === 0}
              className="btn-receitly-secondary w-full text-sm disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
            >
              <span className="material-symbols-outlined text-[20px]">send</span> Enviar
            </button>
            <button 
              onClick={handleProcessPayment}
              disabled={orderItems.length === 0}
              className="btn-receitly w-full text-sm disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
              style={{ backgroundColor: 'var(--accent-purple)', boxShadow: 'none' }}
            >
              <span className="material-symbols-outlined text-[20px]">payments</span> Cobrar
            </button>
          </div>
        </div>
      </div>

      {/* Order cancellation modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="panel-card w-full max-w-md m-4">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--accent-pink)]">warning</span>
              Cancelar Pedido
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Por favor indica el motivo de la cancelación. Esta acción quedará registrada en auditoría de mermas.
            </p>
            
            <div className="mb-6 relative z-50">
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Motivo</label>
              <select 
                className="w-full p-3 rounded-[var(--radius-sm)] bg-[var(--bg-input)] border border-[var(--border-glow)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)]"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                <option value="">Seleccione un motivo...</option>
                <option value="Demora">Demora en preparación</option>
                <option value="Error">Error de captura</option>
                <option value="Cancela Cliente">El cliente se arrepintió</option>
                <option value="Falta Stock">Falta de insumos</option>
                <option value="Otro">Otro...</option>
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover-accent-purple font-medium border-none bg-transparent cursor-pointer"
              >
                Volver
              </button>
              <button 
                onClick={handleCancelOrder}
                disabled={!cancelReason}
                className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent-pink)] text-white font-bold disabled:opacity-50 hover:brightness-110 transition-all border-none cursor-pointer"
              >
                Confirmar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Takeaway / client selector modal for conversion */}
      {showTakeawayModal && (
        <Modal
          isOpen={showTakeawayModal}
          onClose={() => {
            setShowTakeawayModal(false);
            setIsNewClientMode(false);
          }}
          title="Convertir a Pedido para Llevar"
          size="md"
        >
          {!isNewClientMode ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Selecciona un cliente para desvincular el pedido de la mesa y convertirlo en un Pedido para Llevar.
              </p>

              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                <input
                  type="text"
                  value={takeawayClientQuery}
                  onChange={(e) => setTakeawayClientQuery(e.target.value)}
                  placeholder="Buscar cliente registrado..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-xs outline-none focus:ring-2 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                  autoFocus
                />
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-[var(--card-color)]/20">
                {filteredClientsForTakeaway.map(client => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleConvertToTakeaway(client)}
                    className="w-full text-left p-3 hover:bg-[var(--accent-purple)]/10 text-slate-800 dark:text-slate-200 transition-colors flex flex-col gap-0.5 cursor-pointer border-none bg-transparent"
                  >
                    <span className="text-xs font-bold">{client.name}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{client.phone} • NIT: {client.taxId || 'No registra'}</span>
                  </button>
                ))}
                {filteredClientsForTakeaway.length === 0 && (
                  <div className="p-4 text-center text-xs text-slate-450 italic">
                    No se encontraron clientes registrados con ese nombre.
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTakeawayClientName('');
                    setTakeawayPhone('');
                    setTakeawayAddress('');
                    setTakeawayElectronic(false);
                    setTakeawayEmail('');
                    setTakeawayTaxId('');
                    setIsNewClientMode(true);
                  }}
                  className="w-full py-3 bg-slate-100 dark:bg-[var(--bg-input)] text-slate-800 dark:text-white hover:bg-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  Registrar Nuevo Cliente
                </button>
              </div>
            </div>
          ) : (
            /* Create client in takeaway conversion modal */
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Ingresa los datos obligatorios del nuevo cliente para proceder a facturar Para Llevar.
              </p>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  value={takeawayClientName}
                  onChange={(e) => setTakeawayClientName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="ej. Juan Pérez"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Celular *</label>
                  <input
                    type="text"
                    value={takeawayPhone}
                    onChange={(e) => setTakeawayPhone(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. 3001234567"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Dirección *</label>
                  <input
                    type="text"
                    value={takeawayAddress}
                    onChange={(e) => setTakeawayAddress(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. Calle 85 # 11-44"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-[var(--border-glow)]">
                <span className="text-xs font-bold text-[var(--text-primary)]">Factura Electrónica</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={takeawayElectronic}
                    onChange={(e) => setTakeawayElectronic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-purple)]"></div>
                </label>
              </div>

              {takeawayElectronic && (
                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">NIT / Cédula *</label>
                    <input
                      type="text"
                      value={takeawayTaxId}
                      onChange={(e) => setTakeawayTaxId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                      placeholder="ej. 109876543-2"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      value={takeawayEmail}
                      onChange={(e) => setTakeawayEmail(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                      placeholder="ej. cliente@gmail.com"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewClientMode(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-[var(--bg-input)] text-slate-650 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer border-none"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!takeawayClientName.trim() || !takeawayPhone.trim() || !takeawayAddress.trim()) {
                      toast.error('Nombre completo, celular y dirección son obligatorios.');
                      return;
                    }
                    if (takeawayElectronic) {
                      if (!takeawayEmail.trim() || !takeawayTaxId.trim()) {
                        toast.error('NIT y correo electrónico son requeridos para factura electrónica.');
                        return;
                      }
                    }

                    // Save client to IndexedDB
                    const newClient: Client = {
                      id: `cli-${Date.now()}`,
                      name: takeawayClientName.trim(),
                      phone: takeawayPhone.trim(),
                      address: takeawayAddress.trim(),
                      electronicInvoice: takeawayElectronic,
                      email: takeawayElectronic ? takeawayEmail.trim() : undefined,
                      taxId: takeawayElectronic ? takeawayTaxId.trim() : undefined,
                      createdAt: new Date().toISOString()
                    };

                    await db.clients.put(newClient);
                    await handleConvertToTakeaway(newClient);
                  }}
                  className="flex-1 py-3 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer shadow-md border-none"
                >
                  Convertir a Para Llevar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

    </div>
  );
};

export default OrderTaking;
