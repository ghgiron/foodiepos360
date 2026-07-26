import { useState, useEffect } from 'react';
import { db } from '../db/localDb';
import type { Recipe, KdsOrderTicket, KdsOrderTicketItem } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { eventBus } from '../events/eventBus';
import { calculateGrossMargin, classifyProfitability } from '../utils/finance';
import Modal from './ui/Modal';
import toast from 'react-hot-toast';

interface OrderFlowProps {
  selectedTableName: string;
  onOrderSubmitted: () => void;
  onCancel: () => void;
}

interface CartItem {
  recipe: Recipe;
  quantity: number;
  modifiers: string[];
  status?: string;
  seatNumber?: number;
}

export default function OrderFlow({ selectedTableName, onOrderSubmitted, onCancel }: OrderFlowProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showUpsellModal, setShowUpsellModal] = useState<boolean>(false);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const [itemToCancel, setItemToCancel] = useState<CartItem | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Error de comanda');

  // Billing & Checkout state
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);
  const [billingClientName, setBillingClientName] = useState<string>('');
  const [billingClientEmail, setBillingClientEmail] = useState<string>('');
  const [billingClientTaxId, setBillingClientTaxId] = useState<string>('');
  const [billingPaymentMethod, setBillingPaymentMethod] = useState<string>('Efectivo');

  // Print Preview state
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);

  // Fetch active recipes dynamically from IndexedDB
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];

  const loadOrder = async () => {
    const isTakeaway = selectedTableName.startsWith('To-Go');
    const clientName = isTakeaway ? selectedTableName.replace('To-Go:', '').trim() : '';
    const tableIdMatch = selectedTableName.match(/\d+/);
    const tableNumber = isTakeaway ? null : (tableIdMatch ? parseInt(tableIdMatch[0], 10) : 1);

    console.log(`[IndexedDB Debug] loadOrder: Querying db.orders for ${isTakeaway ? `clientId: ${clientName}` : `tableId: ${tableNumber}`}`);

    const allRecipes = await db.recipes.toArray();
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
      console.log(`[IndexedDB Debug] loadOrder: Found active comanda in IndexedDB:`, ticket);
      const cartItems: CartItem[] = ticket.items.map(item => {
        const recipe = allRecipes.find(r => r.id === item.recipeId) || {
          id: item.recipeId,
          name: item.name,
          category: item.category,
          sellPrice: item.category === 'BAR' ? 16000 : 38000,
          costPrice: item.category === 'BAR' ? 4500 : 13000,
          description: '',
          ingredients: [],
          isSubRecipe: false,
          difficulty: 'MEDIA',
          prepTime: 12,
          bcgClassification: 'INCOGNITA',
          allergens: [],
          updatedAt: new Date().toISOString()
        } as unknown as Recipe;
        return {
          recipe,
          quantity: item.quantity,
          modifiers: item.modifiers || [],
          status: item.status,
          seatNumber: item.seatNumber || 1
        };
      });
      setCart(cartItems);
    } else {
      console.log(`[IndexedDB Debug] loadOrder: No active comanda found for table ${tableNumber}. Starting clean cart.`);
      setCart([]);
    }
  };

  const refreshComanda = async () => {
    console.log(`[IndexedDB Debug] refreshComanda: Forcing clean read from db.orders`);
    await loadOrder();
  };

  useEffect(() => {
    if (recipes.length > 0) {
      loadOrder();
    }
  }, [selectedTableName, recipes.length]);

  const saveCartToDb = async (currentCart: CartItem[]) => {
    const isTakeaway = selectedTableName.startsWith('To-Go');
    const clientName = isTakeaway ? selectedTableName.replace('To-Go:', '').trim() : '';
    const tableIdMatch = selectedTableName.match(/\d+/);
    const tableNumber = isTakeaway ? null : (tableIdMatch ? parseInt(tableIdMatch[0], 10) : 1);

    // Check if there is an existing active comanda for this table/client
    const existingTicket = isTakeaway
      ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
      : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

    const comandaItems: KdsOrderTicketItem[] = currentCart.map(item => {
      const existingItem = existingTicket?.items.find(i => i.recipeId === item.recipe.id);
      return {
        recipeId: item.recipe.id,
        name: item.recipe.name,
        category: item.recipe.category,
        operationZone: item.recipe.productionZone || item.recipe.category || 'Cocina',
        quantity: item.quantity,
        modifiers: item.modifiers || [],
        seatNumber: item.seatNumber || 1,
        status: existingItem ? existingItem.status : 'PENDING',
        completedAt: existingItem ? existingItem.completedAt : null,
        consumed: existingItem ? existingItem.consumed : false
      };
    });

    if (existingTicket) {
      console.log(`[IndexedDB Debug] Updating existing comanda ticket ${existingTicket.id} for table ${tableNumber}`);
      existingTicket.items = comandaItems;
      if (!existingTicket.createdAt) {
        existingTicket.createdAt = new Date().toISOString();
      }
      await db.orders.put(existingTicket);
    } else {
      const ticketId = `kds-${Date.now()}`;
      const newTicket: KdsOrderTicket = {
        id: ticketId,
        orderId: `ord-${Date.now()}`,
        tableId: tableNumber,
        clientId: isTakeaway ? clientName : undefined,
        orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        paxCount: 4,
        waiterId: "Alex M. (POS)",
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        items: comandaItems,
        overallStatus: 'ORDEN TOMADA',
        createdAt: new Date().toISOString()
      };
      console.log(`[IndexedDB Debug] Creating new comanda ticket ${ticketId} for table ${tableNumber}`);
      await db.orders.put(newTicket);
    }
  };

  // Load IndexedDB settings reactively
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const taxPercentage = systemSettings['taxPercentage'] !== undefined ? Number(systemSettings['taxPercentage']) : 8;
  const thresholdHigh = systemSettings['profitabilityThresholdHigh'] !== undefined ? Number(systemSettings['profitabilityThresholdHigh']) : 60;
  const thresholdMedium = systemSettings['profitabilityThresholdMedium'] !== undefined ? Number(systemSettings['profitabilityThresholdMedium']) : 30;
  const configuredWasteReasons = systemSettings['waste_reasons'] || [
    'Error de comanda',
    'Cliente insatisfecho',
    'Plato defectuoso / Quemado',
    'Ingrediente en mal estado',
    'Otro motivo'
  ];

  // Seed default items image mapping
  const getImageForRecipe = (recipeId: string): string => {
    switch (recipeId) {
      case 'rec-gin-tonic-01':
        return 'https://lh3.googleusercontent.com/aida-public/AB6AXuBiVKs89539-57XeKzHf0DXDMm5LX8v6F2VxKoNmvdlggAB9VN2Oi29M3iPoyVnUzw7KTPRmJw9znByOVWiKPvtQ751bCRIwhVCEBABWbKV9_-GbWSdf6rflbjApi_TN_u0qhaAs9SCcljCu_hnqlv1DgJxnUl9ovVQROBwweoosHX4ftYr3vO74jQoFCUGwcdnLva5mvHXTcJg_ZhWUPz364YghULxhzBQb7bPvKBHrLFlnNZaPp_NtCUhucEcXpZbA_kkLQyJ76s';
      case 'rec-hamburguesa-gourmet-01':
        return 'https://lh3.googleusercontent.com/aida-public/AB6AXuDfqUUvwNRXpstmfHNg0OstYinl6qzBv4mm1MKTDEd3A63OZeO2dH8iInbEXx_ZFItWvWViKAHNrkbUgSM-1WxrF1iG6ib6PwJPNmaYgP0FiE_wOg9mxkHzF18cKbV32sKQqLT6yp7iIWxMGT-hwOc--3LeU2ch4W0naJBh9sCrBdzpD5kcIw9vjTACCd2y2KUueOKxeXOLs7O-XKMODUC3CW6G38uWoQxaOh62XIIeEULzHauLRQ0Oc8BLNYZnaXbf-l3bqGDsclQ';
      case 'rec-burrata-01':
        return 'https://lh3.googleusercontent.com/aida-public/AB6AXuDxXYbM5Oc8P6nUz-dgs8lwSNz8wHqeo3OAi-NN1lEdyEDL8-4dIILb74zYp4AtyJdsLEifZOrJHM4zOqSWOxY0bkjR3BV4swDGVcMx9hv03uqUUOxC1dE1Mj0BLpAbftUj8Ar6bkg34_H0RNcRe5iiLp1-I4qC8n-CzqGgyUC5V2HGSppj-D0cV9FW0s6Y_e9xI735iMN98YW5M1UVqYwPLxrnSj7Jccx_57SRd4-ILek-xO0JYJ0hR-RHmpfwMiaZmXQ994ohHK8';
      case 'rec-vieiras-01':
        return 'https://lh3.googleusercontent.com/aida-public/AB6AXuBJ0iF4zxcDd56vqwbNNsJx3QAn642mB0H8v1M-wO2mLCrbM76jVeqRMMKuvpj0OfaPeS9Oe-uuOX46oVEuTby7ge88HfRBsYjNHueSHr1QRORJ7CbbEnbTe21HVadQtJ9Ud0KIX4o9_fsr8n-dAuwozVKqlMZ-uSuaPEdJtvJMp2MWATtggGjwDLOC7P6I-oYaTQeXa5PIwTLxw4vL-1CDZIHCYzT9YqsOEMV51ejbI5YpfT9wGEo5OEm8P_qyvSS6lxP0M5YHHOo';
      default:
        return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200';
    }
  };

  // List of available categories
  const categories = ['TODOS', 'BAR', 'KITCHEN'];

  // Filter recipes based on tab selection
  const filteredRecipes = selectedCategory === 'TODOS' 
    ? recipes 
    : recipes.filter(r => r.category === selectedCategory);

  // Add item to cart (handleAddItem)
  const handleAddToCart = async (recipe: Recipe) => {
    let newCart: CartItem[] = [];
    const existing = cart.find(item => item.recipe.id === recipe.id);
    if (existing) {
      newCart = cart.map(item => 
        item.recipe.id === recipe.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      );
    } else {
      newCart = [...cart, { recipe, quantity: 1, modifiers: [], status: 'PENDING', seatNumber: 1 }];
    }
    setCart(newCart);
    await saveCartToDb(newCart);
  };

  // Remove or decrement item from cart
  const handleRemoveFromCart = async (item: CartItem) => {
    if (item.status && item.status !== 'PENDING') {
      setItemToCancel(item);
      return;
    }
    
    let newCart: CartItem[] = [];
    if (item.quantity > 1) {
      newCart = cart.map(c => 
        c.recipe.id === item.recipe.id 
          ? { ...c, quantity: c.quantity - 1 } 
          : c
      );
    } else {
      newCart = cart.filter(c => c.recipe.id !== item.recipe.id);
    }
    setCart(newCart);
    await saveCartToDb(newCart);
  };

  const handleConfirmWaste = async () => {
    if (!itemToCancel) return;
    
    // Decrease quantity or remove
    let newCart: CartItem[] = [];
    if (itemToCancel.quantity > 1) {
      newCart = cart.map(c => 
        c.recipe.id === itemToCancel.recipe.id 
          ? { ...c, quantity: c.quantity - 1 } 
          : c
      );
    } else {
      newCart = cart.filter(c => c.recipe.id !== itemToCancel.recipe.id);
    }
    
    // Register Operational Loss
    await db.operationalLosses.put({
      id: `waste-${Date.now()}`,
      ticketId: selectedTableName, // Fallback
      recipeId: itemToCancel.recipe.id,
      name: itemToCancel.recipe.name,
      quantity: 1,
      cost: itemToCancel.recipe.costPrice,
      reason: cancelReason,
      cancelledAt: new Date().toISOString(),
      waiterId: 'Alex M. (POS)',
      user: 'Alex M. (POS)',
      operationZone: itemToCancel.recipe.productionZone || itemToCancel.recipe.category || 'Cocina'
    });
    
    setCart(newCart);
    await saveCartToDb(newCart);
    setItemToCancel(null);
  };

  const handleProcessPayment = async () => {
    // 1. Get gross, tax, net totals
    const subtotalAmt = cart.reduce((sum, item) => sum + (item.recipe.sellPrice * item.quantity), 0);
    const impoconsumoAmt = subtotalAmt * (taxPercentage / 100);
    const totalGeneralAmt = subtotalAmt + impoconsumoAmt;

    // 2. Parse table/client
    const isTakeaway = selectedTableName.startsWith('To-Go');
    const clientName = isTakeaway ? selectedTableName.replace('To-Go:', '').trim() : billingClientName;
    const tableIdMatch = selectedTableName.match(/\d+/);
    const tableNumber = isTakeaway ? null : (tableIdMatch ? parseInt(tableIdMatch[0], 10) : 1);

    // 3. Find active comanda in Dexie
    const existingTicket = isTakeaway
      ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
      : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

    const comandaItems = cart.map(item => ({
      recipeId: item.recipe.id,
      name: item.recipe.name,
      category: item.recipe.category,
      operationZone: item.recipe.productionZone || item.recipe.category || 'Cocina',
      quantity: item.quantity,
      modifiers: item.modifiers || [],
      seatNumber: item.seatNumber || 1,
      status: 'COMPLETED' as const,
      completedAt: new Date().toISOString(),
      consumed: false
    }));

    const ticketId = existingTicket ? existingTicket.id : `kds-${Date.now()}`;
    const ticketToSave: KdsOrderTicket = {
      id: ticketId,
      orderId: existingTicket ? existingTicket.orderId : `ord-${Date.now()}`,
      tableId: tableNumber,
      clientId: clientName || undefined,
      orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
      paxCount: existingTicket ? existingTicket.paxCount : 4,
      waiterId: existingTicket ? existingTicket.waiterId : "Alex M. (POS)",
      comandaTime: existingTicket ? existingTicket.comandaTime : new Date().toISOString(),
      timeLimitMinutes: 15,
      isRushHourOrder: false,
      items: comandaItems,
      overallStatus: 'CERRADA',
      createdAt: existingTicket ? existingTicket.createdAt : new Date().toISOString(),
      deliveredAt: existingTicket?.deliveredAt || new Date().toISOString(),
      closedAt: new Date().toISOString()
    };

    // 4. Save ticket and emit event
    await db.orders.put(ticketToSave);
    
    const payPayload = {
      orderId: ticketToSave.orderId,
      tableId: tableNumber || 0,
      waiterId: ticketToSave.waiterId,
      totalAmount: totalGeneralAmt,
      netAmountBeforeTax: subtotalAmt,
      taxAmount: impoconsumoAmt,
      paymentMethod: billingPaymentMethod,
      items: cart.map(i => ({
        recipeId: i.recipe.id,
        quantity: i.quantity,
        unitPrice: i.recipe.sellPrice
      })),
      clientData: clientName ? {
        name: clientName,
        email: billingClientEmail,
        taxId: billingClientTaxId || undefined
      } : undefined
    };

    await eventBus.emit('OrderPaid', payPayload);
    
    // Log to domainOutbox
    await db.domainOutbox.put({
      eventId: `evt-orderpaid-${Date.now()}`,
      eventType: 'OrderPaid',
      payload: payPayload,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      syncedAt: null
    });

    // 5. Clear cart and return
    setCart([]);
    setShowBillingModal(false);
    onOrderSubmitted();
  };

  const handleClearCart = async () => {
    setCart([]);
    const isTakeaway = selectedTableName.startsWith('To-Go');
    const clientName = isTakeaway ? selectedTableName.replace('To-Go:', '').trim() : '';
    const tableIdMatch = selectedTableName.match(/\d+/);
    const tableNumber = isTakeaway ? null : (tableIdMatch ? parseInt(tableIdMatch[0], 10) : 1);

    const existingTicket = isTakeaway
      ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
      : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

    if (existingTicket) {
      console.log(`[IndexedDB Debug] Soft-cancelling comanda ticket ${existingTicket.id} due to cleared cart`);
      existingTicket.overallStatus = 'CANCELADA';
      existingTicket.cancelJustification = 'Comanda vaciada por el usuario';
      existingTicket.closedAt = new Date().toISOString();
      await db.orders.put(existingTicket);
    }
  };

  // Calculate cart subtotal
  const subtotal = cart.reduce((sum, item) => sum + (item.recipe.sellPrice * item.quantity), 0);
  const impoconsumo = subtotal * (taxPercentage / 100);
  const totalGeneral = subtotal + impoconsumo;

  // Trigger Disney Suggested Sales Modal
  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    setShowUpsellModal(true);
  };

  // Complete checkout process
  const handleFinalSubmit = async (addUpsellItem: boolean, upsellRecipeId?: string) => {
    setShowUpsellModal(false);
    
    let finalCart = [...cart];

    // If cashier added the upselled drink/dish, append it to the cart
    if (addUpsellItem && upsellRecipeId) {
      const upsellRecipe = recipes.find(r => r.id === upsellRecipeId);
      if (upsellRecipe) {
        const existing = finalCart.find(item => item.recipe.id === upsellRecipeId);
        if (existing) {
          finalCart = finalCart.map(item => 
            item.recipe.id === upsellRecipeId 
              ? { ...item, quantity: item.quantity + 1 } 
              : item
          );
        } else {
          finalCart.push({ recipe: upsellRecipe, quantity: 1, modifiers: ['Upsell Disney Suggested'] });
        }
      }
    }

    const isTakeaway = selectedTableName.startsWith('To-Go');
    const clientName = isTakeaway ? selectedTableName.replace('To-Go:', '').trim() : '';
    const tableIdMatch = selectedTableName.match(/\d+/);
    const tableNumber = isTakeaway ? null : (tableIdMatch ? parseInt(tableIdMatch[0], 10) : 1);

    // Check if there is an existing active comanda for this table/client to preserve statuses
    const existingTicket = isTakeaway
      ? await db.orders.filter(t => t.clientId === clientName && t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first()
      : await db.orders.where('tableId').equals(tableNumber!).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();

    const comandaItems: KdsOrderTicketItem[] = finalCart.map(item => {
      const existingItem = existingTicket?.items.find(i => i.recipeId === item.recipe.id);
      return {
        recipeId: item.recipe.id,
        name: item.recipe.name,
        category: item.recipe.category,
        operationZone: item.recipe.productionZone || item.recipe.category || 'Cocina',
        quantity: item.quantity,
        modifiers: item.modifiers || [],
        seatNumber: item.seatNumber || 1,
        status: existingItem ? existingItem.status : 'PENDING',
        completedAt: existingItem ? existingItem.completedAt : null,
        consumed: existingItem ? existingItem.consumed : false
      };
    });

    let ticketToSave: KdsOrderTicket;

    if (existingTicket) {
      existingTicket.items = comandaItems;
      if (!existingTicket.createdAt) {
        existingTicket.createdAt = new Date().toISOString();
      }
      ticketToSave = existingTicket;
      console.log(`[IndexedDB Debug] handleFinalSubmit: Merging into active comanda ticket ${existingTicket.id} for table ${tableNumber}`);
    } else {
      const ticketId = `kds-${Date.now()}`;
      ticketToSave = {
        id: ticketId,
        orderId: `ord-${Date.now()}`,
        tableId: tableNumber,
        clientId: isTakeaway ? clientName : undefined,
        orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
        paxCount: 4,
        waiterId: "Alex M. (POS)",
        comandaTime: new Date().toISOString(),
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        items: comandaItems,
        overallStatus: 'ORDEN TOMADA',
        createdAt: new Date().toISOString()
      };
      console.log(`[IndexedDB Debug] handleFinalSubmit: Creating new KDS order ticket ${ticketId} for table ${tableNumber}`);
    }

    // Save ticket into IndexedDB (Await complete transaction before callback)
    await db.orders.put(ticketToSave);

    // Emit event reactively
    await eventBus.emit('OrderPlaced', ticketToSave);

    // Clear cart and invoke callback
    setCart([]);
    onOrderSubmitted();
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen pt-16 relative bg-slate-50 dark:bg-slate-950">
      {/* Product Catalog Section (60%) */}
      <section className="flex-1 p-6 overflow-y-auto transition-receitly">
        <div className="flex items-center justify-between mb-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] font-sans leading-none">
              Toma de Pedidos
            </h1>
            <h2 className="text-base font-bold text-[var(--text-muted)] tracking-wide">
              Menú
            </h2>
            <p className="text-[var(--text-muted)] text-xs font-semibold">
              Ubicación activa: <span className="text-[var(--text-primary)] font-bold">{selectedTableName}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refreshComanda}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-650 dark:text-slate-300 rounded-full text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refrescar comanda"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Refrescar
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Volver al Mapa
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-6 py-2.5 rounded-full text-xs font-extrabold whitespace-nowrap shadow-sm border transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-900 dark:bg-slate-700 border-transparent text-white'
                  : 'bg-white dark:bg-[var(--card-color)] border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {cat === 'TODOS' ? 'Todos los platos' : cat === 'BAR' ? 'Bebidas & Coctelería' : 'Cocina & Platos Fuertes'}
            </button>
          ))}
        </div>

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          {filteredRecipes.map(recipe => (
            <div
              key={recipe.id}
              className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800/80 hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div className="w-full aspect-square relative overflow-hidden bg-slate-100 dark:bg-[var(--card-color)]">
                <img
                  src={getImageForRecipe(recipe.id)}
                  alt={recipe.name}
                  onClick={() => handleAddToCart(recipe)}
                  className="w-full h-full object-cover cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent pointer-events-none"></div>

                {/* Floating Expand/Zoom Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFullImage(getImageForRecipe(recipe.id));
                  }}
                  className="absolute top-3 right-3 z-10 w-8 h-8 bg-slate-950/70 hover:bg-slate-950/90 text-white rounded-xl flex items-center justify-center transition-colors cursor-pointer border-none shadow-sm active:scale-95"
                  title="Ampliar imagen"
                >
                  <span className="material-symbols-outlined text-sm font-bold">zoom_in</span>
                </button>

                {/* Floating category badge */}
                <span className="absolute top-3 left-3 bg-white/95 dark:bg-[var(--card-color)]/95 text-slate-900 dark:text-slate-200 text-[10px] font-bold px-2 py-1 rounded-full uppercase shadow-sm">
                  {recipe.category}
                </span>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  {(() => {
                    const margin = calculateGrossMargin(recipe.sellPrice || 0, recipe.costPrice || 0, taxPercentage);
                    const level = classifyProfitability(margin, thresholdHigh, thresholdMedium, !!recipe.isSubRecipe, recipe.sellPrice || 0);
                    return (
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-tight truncate flex-1">{recipe.name}</h4>
                        {level !== 'N/A' && level !== 'Sin Venta' && (
                          <div className="group relative shrink-0">
                            <span 
                              className="inline-block w-2.5 h-2.5 rounded-full cursor-help"
                              style={{
                                backgroundColor: level === 'Alta' ? '#22C55E' : level === 'Media' ? '#EAB308' : '#EF4444'
                              }}
                            />
                            {level === 'Baja' && (
                              <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block w-48 bg-slate-950 text-white text-[9px] p-2 rounded-lg shadow-xl text-center z-30 font-semibold leading-snug">
                                Margen por debajo del umbral objetivo. Revisar costeo.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">{recipe.description || 'Sin descripción disponible.'}</p>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-900 dark:text-white font-black text-base">${recipe.sellPrice.toLocaleString('es-CO')}</span>
                  <button
                    onClick={() => handleAddToCart(recipe)}
                    className="bg-[var(--accent-pink)] text-white rounded-full p-2.5 shadow-md shadow-[var(--accent-pink)]/15 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-lg">add</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cart Sidebar Section (40%) */}
      <section className="w-full md:w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl relative z-20">
        <div className="p-6 bg-slate-50 dark:bg-[var(--card-color)]/20 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 dark:bg-[var(--card-color)] text-white rounded-xl flex items-center justify-center font-bold text-lg">
              {selectedTableName}
            </div>
            <div>
              <h3 className="font-headline font-black text-slate-900 dark:text-white">Comanda Activa</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detalles de Facturación</p>
            </div>
          </div>
        </div>

        {/* Cart items list */}
        <div className="flex-1 overflow-y-auto scroll-smooth p-6 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 gap-3">
              <span className="material-symbols-outlined text-6xl">shopping_cart</span>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Comanda Vacía</p>
            </div>
          ) : (
            cart.map(item => {
              const margin = calculateGrossMargin(item.recipe.sellPrice || 0, item.recipe.costPrice || 0, taxPercentage);
              const level = classifyProfitability(margin, thresholdHigh, thresholdMedium, !!item.recipe.isSubRecipe, item.recipe.sellPrice || 0);
              return (
                <div key={item.recipe.id} className="flex gap-4 items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate flex-1">{item.recipe.name}</h5>
                      {level !== 'N/A' && level !== 'Sin Venta' && (
                        <div className="group relative shrink-0">
                          <span 
                            className="inline-block w-2 h-2 rounded-full cursor-help"
                            style={{
                              backgroundColor: level === 'Alta' ? '#22C55E' : level === 'Media' ? '#EAB308' : '#EF4444'
                            }}
                          />
                          {level === 'Baja' && (
                            <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block w-48 bg-slate-950 text-white text-[9px] p-2 rounded-lg shadow-xl text-center z-30 font-semibold leading-snug">
                              Margen por debajo del umbral objetivo. Revisar costeo.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-slate-400">${item.recipe.sellPrice.toLocaleString('es-CO')} c/u</p>
                      <select 
                        value={item.seatNumber || 1}
                        onChange={(e) => {
                          const newCart = cart.map(c => c.recipe.id === item.recipe.id ? { ...c, seatNumber: parseInt(e.target.value) } : c);
                          setCart(newCart);
                        }}
                        className="text-[10px] bg-slate-100 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded px-1 py-0.5 outline-none text-slate-700 dark:text-slate-300 font-bold"
                      >
                        {[1,2,3,4,5,6,7,8].map(n => (
                          <option key={n} value={n}>Silla {n}</option>
                        ))}
                      </select>
                      {item.status && item.status !== 'PENDING' && (
                        <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">En Cocina</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRemoveFromCart(item)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[var(--card-color)] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
                    >
                      <span className="material-symbols-outlined text-sm">remove</span>
                    </button>
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200 w-5 text-center">{item.quantity}</span>
                    <button
                      onClick={() => handleAddToCart(item.recipe)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[var(--card-color)] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Checkout Cart Summary Footer */}
        {cart.length > 0 && (
          <div className="p-6 bg-slate-50 dark:bg-[var(--card-color)]/20 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Subtotal</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">${subtotal.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Impoconsumo ({taxPercentage}%)</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">${impoconsumo.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Acciones</span>
              <div className="flex gap-2">
                {!selectedTableName.startsWith('To-Go') && (
                  <button
                    onClick={async () => {
                      const client = window.prompt('Ingresa el nombre del cliente para Pedido para Llevar:');
                      if (client && client.trim()) {
                        const tableIdMatch = selectedTableName.match(/\d+/);
                        const tableNumber = tableIdMatch ? parseInt(tableIdMatch[0], 10) : 1;
                        const existingTicket = await db.orders.where('tableId').equals(tableNumber).filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').first();
                        if (existingTicket) {
                           existingTicket.tableId = null;
                           existingTicket.clientId = client;
                           existingTicket.orderType = 'TAKEAWAY';
                           await db.orders.put(existingTicket);
                           onCancel();
                        } else {
                           toast.error('No hay comanda activa para convertir');
                        }
                      }
                    }}
                    className="text-xs text-[var(--accent-purple)] font-bold uppercase tracking-widest hover:underline cursor-pointer"
                  >
                    Mover a Para Llevar
                  </button>
                )}
                <button
                  onClick={handleClearCart}
                  className="text-xs text-rose-500 font-bold uppercase tracking-widest hover:underline cursor-pointer"
                >
                  Borrar Todo
                </button>
              </div>
            </div>
            <div className="flex justify-between items-end border-t border-dashed border-slate-300 dark:border-slate-700 pt-3">
              <span className="text-sm font-semibold text-slate-500">Monto Total:</span>
              <span className="text-2xl font-manrope font-black text-slate-900 dark:text-white">${totalGeneral.toLocaleString('es-CO')}</span>
            </div>
            
            {/* Primary & Secondary Action Buttons Row */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCheckoutClick}
                className="w-full py-3.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 duration-200 cursor-pointer border-none"
              >
                <span className="material-symbols-outlined text-base">send</span>
                Enviar a Cocina
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPrintPreview(true)}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Imprimir
                </button>
                <button
                  onClick={() => {
                    if (selectedTableName.startsWith('To-Go')) {
                      setBillingClientName(selectedTableName.replace('To-Go:', '').trim());
                    }
                    setShowBillingModal(true);
                  }}
                  className="flex-1 py-3 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-[var(--accent-pink)]/15 hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer border-none"
                >
                  <span className="material-symbols-outlined text-sm">payments</span>
                  Cobrar
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* DISNEY SUGGESTIVE SALES MODAL (TACTILE LOCK) */}
      {showUpsellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg p-8 shadow-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden flex flex-col gap-6">
            {/* Upsell Header Accent */}
            <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-pink)]"></div>

            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 bg-[var(--accent-purple)]/10 dark:bg-[var(--accent-purple)]/20 rounded-2xl flex items-center justify-center text-[var(--accent-purple)] mb-2">
                <span className="material-symbols-outlined text-3xl">local_bar</span>
              </div>
              <h3 className="text-2xl font-headline font-black text-slate-950 dark:text-white">Venta Sugerida Disney</h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                ¡Obligatorio sugerir antes de enviar comanda! Ofrece nuestra bebida estrella en Happy Hour o entrada destacada:
              </p>
            </div>

            {/* Upselling Products Options */}
            <div className="space-y-3">
              {/* Option 1: Gin Tonic */}
              <button
                onClick={() => handleFinalSubmit(true, 'rec-gin-tonic-01')}
                className="w-full flex gap-3 p-4 bg-slate-50 dark:bg-[var(--card-color)]/30 border border-[rgba(143,99,244,0.15)] rounded-2xl hover:border-[var(--accent-purple)] hover:bg-white dark:hover:bg-slate-800 transition-all text-left group"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100">
                  <img
                    src={getImageForRecipe('rec-gin-tonic-01')}
                    alt="Gin Tonic"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="flex-1">
                  <span className="bg-[var(--text-muted)]/15 text-[var(--text-muted)] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-1 inline-block">50% DESC</span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">Gin Tonic Clásico (Copón)</h4>
                  <p className="text-xs text-slate-400">Ginebra Tanqueray, tónica casa, mist botánico.</p>
                  <p className="text-xs font-bold text-[var(--accent-purple)] mt-1">Agregar por sólo $16.000 COP</p>
                </div>
              </button>

              {/* Option 2: Burrata de Herencia */}
              <button
                onClick={() => handleFinalSubmit(true, 'rec-burrata-01')}
                className="w-full flex gap-3 p-4 bg-slate-50 dark:bg-[var(--card-color)]/30 border border-[rgba(143,99,244,0.15)] rounded-2xl hover:border-[var(--accent-purple)] hover:bg-white dark:hover:bg-slate-800 transition-all text-left group"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100">
                  <img
                    src={getImageForRecipe('rec-burrata-01')}
                    alt="Burrata"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="flex-1">
                  <span className="bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-1 inline-block">PLATO POPULAR</span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">Burrata de Herencia</h4>
                  <p className="text-xs text-slate-400">Tomates heirloom marinados y pesto fresco.</p>
                  <p className="text-xs font-bold text-teal-500 mt-1">Agregar por $38.000 COP</p>
                </div>
              </button>
            </div>

            {/* Close without adding */}
            <div className="flex flex-col gap-2 mt-2">
              <button
                onClick={() => handleFinalSubmit(false)}
                className="w-full py-3.5 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer border-none"
              >
                No, el cliente declinó sugerencias
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedFullImage && (
        <Modal title="Vista de Imagen" onClose={() => setSelectedFullImage(null)}>
          <div className="flex justify-center items-center p-2 bg-slate-950/10 rounded-2xl">
            <img 
              src={selectedFullImage} 
              alt="Full Screen Recipe Product" 
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </Modal>
      )}

      {/* Waste Reason Modal */}
      {itemToCancel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-rose-500">
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              <h4 className="text-lg font-headline font-black">Confirmar Motivo de Merma</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              El producto <strong className="text-slate-800 dark:text-white">"{itemToCancel.recipe.name}"</strong> ya entró en producción. Al cancelarlo, se registrará una pérdida operativa de <strong>${itemToCancel.recipe.costPrice.toLocaleString('es-CO')} COP</strong>.
            </p>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Motivo del Descarte</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-100 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
              >
                {configuredWasteReasons.map((reason: string) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToCancel(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-350 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmWaste}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer"
              >
                Registrar Merma
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Billing/Payment Modal */}
      {showBillingModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xl font-headline font-black text-slate-950 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent-purple)]">receipt_long</span>
                Facturación y Cierre - {selectedTableName}
              </h3>
              <button
                onClick={() => setShowBillingModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nombre Completo / Razón Social</label>
                <input
                  type="text"
                  value={billingClientName}
                  onChange={(e) => setBillingClientName(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="ej. Juan Pérez"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">NIT / Cédula</label>
                  <input
                    type="text"
                    value={billingClientTaxId}
                    onChange={(e) => setBillingClientTaxId(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. 109876543-2"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={billingClientEmail}
                    onChange={(e) => setBillingClientEmail(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. juan@gmail.com"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Medio de Pago</label>
                <select
                  value={billingPaymentMethod}
                  onChange={(e) => setBillingPaymentMethod(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[var(--accent-purple)]"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta Debito">Tarjeta Débito</option>
                  <option value="Tarjeta Credito">Tarjeta Crédito</option>
                  <option value="Transferencia">Transferencia (Nequi/Daviplata)</option>
                </select>
              </div>

              {/* Totals Summary */}
              <div className="p-4 bg-slate-50 dark:bg-[var(--card-color)]/40 rounded-2xl space-y-2 text-xs border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Monto Subtotal:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">${subtotal.toLocaleString('es-CO')}</span>
                </div>
                <div className="flex justify-between text-rose-500">
                  <span>Impuesto Impoconsumo ({taxPercentage}%):</span>
                  <span>${impoconsumo.toLocaleString('es-CO')}</span>
                </div>
                <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-2 pt-2 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                  <span>Total Neto (Base):</span>
                  <span>${(subtotal - impoconsumo).toLocaleString('es-CO')}</span>
                </div>
                <div className="flex justify-between font-black text-base text-[var(--accent-purple)] pt-1">
                  <span>Total a Cobrar:</span>
                  <span>${totalGeneral.toLocaleString('es-CO')}</span>
                </div>
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBillingModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer border-none"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleProcessPayment}
                  className="flex-1 py-3 bg-[var(--accent-pink)] text-white font-black rounded-xl text-xs uppercase tracking-wider text-center hover:bg-[var(--accent-pink)]/90 shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 transition-all cursor-pointer border-none"
                >
                  Cerrar y Pagar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Pre-Factura Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 space-y-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-[var(--accent-purple)]">
                <span className="material-symbols-outlined">print</span>
                <h4 className="text-sm font-headline font-black uppercase tracking-wider">Previsualización de Factura</h4>
              </div>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Thermal Ticket Design Container */}
            <div className="bg-amber-50/50 dark:bg-slate-950 border border-amber-100 dark:border-slate-800 rounded-xl p-4 font-mono text-[10px] text-slate-800 dark:text-slate-300 space-y-3 shadow-inner overflow-y-auto max-h-96">
              <div className="text-center space-y-1">
                <h5 className="font-extrabold text-xs text-slate-900 dark:text-white">MALIBU GASTROBAR</h5>
                <p>Nit: 901.234.567-8</p>
                <p>Calle 85 # 12-34, Bogotá</p>
                <p>Tel: (601) 345-6789</p>
              </div>

              <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1">
                <p>Fecha: {new Date().toLocaleDateString('es-CO')}  Hora: {new Date().toLocaleTimeString('es-CO')}</p>
                <p>Mesero: Alex M. (POS)</p>
                <p>Destino: {selectedTableName}</p>
              </div>

              <div className="border-t border-b border-dashed border-slate-300 dark:border-slate-700 py-2">
                <div className="grid grid-cols-6 font-bold text-slate-900 dark:text-white border-b border-dashed border-slate-200 dark:border-slate-800 pb-1 mb-1">
                  <span className="col-span-3">Item</span>
                  <span className="col-span-1 text-center">Cant</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>
                <div className="space-y-1">
                  {cart.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-6">
                      <span className="col-span-3 truncate">{item.recipe.name}</span>
                      <span className="col-span-1 text-center">{item.quantity}</span>
                      <span className="col-span-2 text-right">${(item.quantity * item.recipe.sellPrice).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 text-right">
                <p>Subtotal: ${subtotal.toLocaleString('es-CO')}</p>
                <p>Impoconsumo ({taxPercentage}%): ${impoconsumo.toLocaleString('es-CO')}</p>
                <p className="font-bold text-slate-900 dark:text-white text-xs border-t border-dashed border-slate-300 dark:border-slate-700 pt-1 mt-1">
                  TOTAL A PAGAR: ${totalGeneral.toLocaleString('es-CO')}
                </p>
              </div>

              <div className="text-center pt-2 text-[9px] text-slate-400">
                <p>*** PRE-FACTURA DE VENTA ***</p>
                <p>No válida como factura legal o Dian.</p>
                <p>¡Gracias por tu visita!</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer border-none"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPrintPreview(false);
                  toast.success('Factura enviada a ticketera principal (Barra)', {
                    icon: '🖨️',
                    duration: 3500
                  });
                }}
                className="flex-1 py-3 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer shadow-md border-none"
              >
                Imprimir Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
