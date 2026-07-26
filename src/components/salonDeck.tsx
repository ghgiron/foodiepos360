import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import type { KdsOrderTicket, OrderPaidPayload, Reservation, TableLayout } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { eventBus } from '../events/eventBus';
import { enqueueOfflineEvent } from '../db/localDb';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';
import { syncTicketToFirebase } from '../services/firebaseSync';
import { 
  startReservationService, 
  saveReservationWithValidation
} from '../services/reservationService';

interface SalonDeckProps {
  onSelectTable: (tableName: string, zoneName: string) => void;
  selectedZone: string | null;
  setSelectedZone: (zoneName: string) => void;
}

export default function SalonDeck({ onSelectTable, selectedZone, setSelectedZone }: SalonDeckProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals States
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [reservationTable, setReservationTable] = useState<TableLayout | null>(null);
  const [selectedReservationDetail, setSelectedReservationDetail] = useState<Reservation | null>(null);
  
  // Reservation Form State
  const [resClientName, setResClientName] = useState('');
  const [resClientId, setResClientId] = useState('');
  const [resDate, setResDate] = useState('');
  const [resTime, setResTime] = useState('');
  const [resReason, setResReason] = useState('Cumpleaños');
  const [resNotes, setResNotes] = useState('');
  const [resPax, setResPax] = useState(2);
  const [resDecoration, setResDecoration] = useState('');

  // Inline Client Creation inside Reservation Modal State
  const [isResNewClient, setIsResNewClient] = useState(false);
  const [newResPhone, setNewResPhone] = useState('');
  const [newResAddress, setNewResAddress] = useState('');
  const [newResElectronic, setNewResElectronic] = useState(false);
  const [newResEmail, setNewResEmail] = useState('');
  const [newResTaxId, setNewResTaxId] = useState('');

  // Search Client for reservation
  const [clientSearchQuery, setClientSearchQuery] = useState('');


  // Takeaway Modal State
  const [showTakeawayModal, setShowTakeawayModal] = useState(false);
  const [takeawayClientSearch, setTakeawayClientSearch] = useState('');
  const [isNewClientMode, setIsNewClientMode] = useState(false);

  // New Takeaway Client Form State
  const [takeawayClientName, setTakeawayClientName] = useState('');
  const [takeawayPhone, setTakeawayPhone] = useState('');
  const [takeawayAddress, setTakeawayAddress] = useState('');
  const [takeawayElectronic, setTakeawayElectronic] = useState(false);
  const [takeawayEmail, setTakeawayEmail] = useState('');
  const [takeawayTaxId, setTakeawayTaxId] = useState('');

  // Live query for active tickets and database entities
  const liveTickets = useLiveQuery(() => 
    db.kdsOrderTickets.filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').toArray()
  ) || [];

  const dbClients = useLiveQuery(() => db.clients.toArray()) || [];
  const dbReservations = useLiveQuery(() => db.reservas.toArray()) || [];

  const [activeTickets, setActiveTickets] = useState<KdsOrderTicket[]>([]);

  const loadActiveTickets = async () => {
    const tickets = await db.orders.filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA').toArray();
    setActiveTickets(tickets);
  };

  useEffect(() => {
    loadActiveTickets();
  }, [liveTickets]);

  const refreshAllOrders = async () => {
    toast.loading('Actualizando pedidos...', { id: 'refresh' });
    await loadActiveTickets();
    toast.success('Actualizado', { id: 'refresh' });
  };

  const refreshComanda = async (tableId: number | string) => {
    const tickets = await db.orders
      .where('tableId')
      .equals(tableId as any)
      .filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA')
      .toArray();
    await loadActiveTickets();
    return tickets;
  };

  // Fetch recipes
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];

  // Load IndexedDB settings reactively
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const operatingZones = useMemo<string[]>(() => {
    const rawZones = systemSettings['operating_zones'];
    if (Array.isArray(rawZones)) {
      const sorted = [...rawZones].sort((a, b) => {
        const orderA = typeof a === 'object' && a !== null && typeof a.orden === 'number' ? a.orden : 999;
        const orderB = typeof b === 'object' && b !== null && typeof b.orden === 'number' ? b.orden : 999;
        return orderA - orderB;
      });
      return sorted.map(z => typeof z === 'string' ? z : z.name);
    }
    return ['Salón Principal', 'Terraza', 'Bar VIP'];
  }, [systemSettings]);

  const orderCategories = useMemo<string[]>(() => {
    return ['Pedidos para llevar', 'Reservas'];
  }, []);

  const dynamicTables = useMemo<TableLayout[]>(() => {
    return systemSettings['salon_tables'] || [
      { id: "M1", name: "M1", description: "Sofá Azul Central", capacity: 4, zone: "Salón Principal" },
      { id: "M2", name: "M2", description: "Mesa Redonda (4 pax)", capacity: 4, zone: "Salón Principal" },
      { id: "M3", name: "M3", description: "Mesa Rectangular", capacity: 2, zone: "Salón Principal" },
      { id: "M4", name: "M4", description: "Junto al Pasillo", capacity: 4, zone: "Salón Principal" },
      { id: "M5", name: "M5", description: "Mesa Grande Centro", capacity: 6, zone: "Salón Principal" },
      { id: "M6", name: "M6", description: "Mesa Dos", capacity: 2, zone: "Salón Principal" },
      { id: "M7", name: "M7", description: "Mesa Pared", capacity: 4, zone: "Salón Principal" },
      { id: "M8", name: "M8", description: "Mesa Pequeña", capacity: 2, zone: "Salón Principal" },
      
      { id: "T1", name: "T1", description: "Terraza Entrada", capacity: 4, zone: "Terraza" },
      { id: "T2", name: "T2", description: "Terraza Ventana", capacity: 4, zone: "Terraza" },
      { id: "T3", name: "T3", description: "Terraza Central", capacity: 2, zone: "Terraza" },
      { id: "T4", name: "T4", description: "Mesa Cuadrada", capacity: 6, zone: "Terraza" },

      { id: "VIP1", name: "VIP 1", description: "Box Privado", capacity: 6, zone: "Bar VIP" },
      { id: "VIP2", name: "VIP 2", description: "Lounge Area", capacity: 8, zone: "Bar VIP" },
      { id: "B1", name: "Barra 1", description: "Silla Barra", capacity: 1, zone: "Bar VIP" },
      { id: "B2", name: "Barra 2", description: "Silla Barra", capacity: 1, zone: "Bar VIP" }
    ];
  }, [systemSettings]);

  // Set selected zone initial value once loaded, respecting the default zone setting
  useEffect(() => {
    if (operatingZones.length > 0 && !selectedZone) {
      const rawZones = systemSettings['operating_zones'];
      let defaultZoneName = '';
      if (Array.isArray(rawZones)) {
        const defaultZone = rawZones.find(z => 
          typeof z === 'object' && z !== null && (z.isDefault || z.zona_predeterminada)
        );
        if (defaultZone) {
          defaultZoneName = typeof defaultZone === 'string' ? defaultZone : defaultZone.name;
        }
      }
      setSelectedZone(defaultZoneName || operatingZones[0]);
    }
  }, [operatingZones, selectedZone, systemSettings]);

  const configuredWasteReasons = systemSettings['waste_reasons'] || [
    'Error de comanda',
    'Cliente insatisfecho',
    'Plato defectuoso / Quemado',
    'Ingrediente en mal estado',
    'Otro motivo'
  ];

  // Billing/Checkout states
  const [selectedBillingTicketId, setSelectedBillingTicketId] = useState<string | null>(null);
  const selectedBillingTicket = useMemo(() => {
    return activeTickets.find(t => t.id === selectedBillingTicketId) || null;
  }, [activeTickets, selectedBillingTicketId]);

  const [billingClientName, setBillingClientName] = useState('');
  const [billingClientEmail, setBillingClientEmail] = useState('');
  const [billingClientTaxId, setBillingClientTaxId] = useState('');
  const [billingPaymentMethod, setBillingPaymentMethod] = useState('Efectivo');

  // Waste states
  const [cancellingItem, setCancellingItem] = useState<{
    recipeId: string;
    name: string;
    quantity: number;
    cost: number;
    originalIndex: number;
    operationZone?: string;
  } | null>(null);
  const [cancellingTicket, setCancellingTicket] = useState<boolean>(false);
  const [wasteReason, setWasteReason] = useState<string>('Error de comanda');
  const [showPreProdConfirm, setShowPreProdConfirm] = useState<{
    name: string;
    originalIndex: number;
  } | null>(null);
  const [showCancelComandaConfirm, setShowCancelComandaConfirm] = useState<boolean>(false);
  const [reservationToCancel, setReservationToCancel] = useState<string | null>(null);

  // Helper to look up recipe price
  const getRecipePrice = (recipeId: string, category: string): number => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (recipe) return recipe.sellPrice;
    return category === 'BAR' ? 16000 : 38000;
  };

  // Map active tickets by table name for easy lookup in layout
  const ticketsByTableMap = useMemo(() => {
    const map = new Map<string, KdsOrderTicket>();
    activeTickets.forEach(ticket => {
      if (ticket.tableId !== null) {
        const strId = String(ticket.tableId).trim();
        const key = /^\d+$/.test(strId) ? `M${strId}` : strId;
        const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
        map.set(normalizedKey, ticket);
      }
    });
    return map;
  }, [activeTickets]);

  // Map pending reservations by table
  const reservationsMap = useMemo(() => {
    const map = new Map<string, Reservation>();
    dbReservations.forEach(res => {
      if (res.status === 'PENDING') {
        map.set(res.tableId, res);
      }
    });
    return map;
  }, [dbReservations]);

  // Calculate elapsed time from ISO comandaTime to minutes
  const getElapsedTime = (isoString: string): string => {
    const comandaDate = new Date(isoString);
    const diffMs = Date.now() - comandaDate.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    
    if (diffMins >= 60) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }
    return `${diffMins}m`;
  };

  // Helper to format ISO to Local capture hour
  const formatLocalTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '';
    }
  };

  // Filter tables based on selected zone and search query
  const filteredTables = dynamicTables.filter(table => {
    if (table.zone !== selectedZone) return false;
    if (searchQuery.trim() === '') return true;
    
    const query = searchQuery.toLowerCase();
    return (
      table.name.toLowerCase().includes(query) ||
      table.id.toLowerCase().includes(query)
    );
  });

  // Calculate overall salon stats for the selected zone
  const activeTablesCount = filteredTables.filter(table => {
    const normalizedId = table.name.toLowerCase().replace(/\s+/g, '');
    return ticketsByTableMap.has(normalizedId);
  }).length;

  const totalTablesInZone = filteredTables.length;

  // Aggregate totals
  const totalRevenue = activeTickets.reduce((acc, ticket) => {
    if (ticket.tableId !== null) {
      const strId = String(ticket.tableId).trim();
      const tableKey = /^\d+$/.test(strId) ? `M${strId}` : strId;
      const normalizedTableKey = tableKey.toLowerCase().replace(/\s+/g, '');
      const layout = dynamicTables.find(t => t.name.toLowerCase().replace(/\s+/g, '') === normalizedTableKey);
      if (layout && layout.zone === selectedZone) {
        const ticketTotal = ticket.items.reduce((sum, item) => sum + (item.quantity * getRecipePrice(item.recipeId, item.category)), 0);
        return acc + ticketTotal;
      }
    }
    return acc;
  }, 0);

  // Clients matching search query for reservation
  const filteredClientsForRes = useMemo(() => {
    if (!clientSearchQuery.trim()) return [];
    return dbClients.filter(c => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()));
  }, [dbClients, clientSearchQuery]);

  // Clients matching search query for Takeaway
  const filteredClientsForTakeaway = useMemo(() => {
    return dbClients.filter(c => c.name.toLowerCase().includes(takeawayClientSearch.toLowerCase()));
  }, [dbClients, takeawayClientSearch]);

  const activeTakeawayTickets = useMemo(() => {
    return activeTickets.filter(t => t.tableId === null || t.orderType === 'TAKEAWAY');
  }, [activeTickets]);

  return (
    <div className="flex-1 flex flex-col min-h-screen text-[var(--text-secondary)] font-sans">

      <div className="p-8 space-y-8 flex-1 transition-receitly overflow-y-auto">
        
        {/* Barra Superior de Control */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">Plano de Mesas</h1>
            <span className="bg-slate-200/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
              Turno Mañana
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-64 hidden sm:block group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] rounded-full text-sm outline-none transition-all duration-300 focus:w-72 focus:ring-2 focus:ring-[var(--accent-purple)] border border-transparent focus:border-transparent"
                placeholder="Buscar mesa o cliente..."
              />
            </div>
            
            <button 
              onClick={() => {
                setIsNewClientMode(false);
                setTakeawayClientSearch('');
                setShowTakeawayModal(true);
              }}
              className="bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 shadow-sm shadow-[var(--accent-pink)]/20 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">shopping_bag</span>
              Para Llevar
            </button>

            <button 
              onClick={() => {
                setReservationTable(null);
                setResClientName('');
                setResClientId('');
                setResDate('');
                setResTime('');
                setResReason('Cumpleaños');
                setResNotes('');
                setResPax(2);
                setResDecoration('');
                setIsResNewClient(false);
                setClientSearchQuery('');
                setShowReservationModal(true);
              }}
              className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 shadow-sm shadow-[var(--accent-purple)]/20 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">calendar_month</span>
              Reserva
            </button>
            
            <button 
              onClick={refreshAllOrders}
              className="w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer bg-transparent"
              title="Actualizar"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
            </button>
          </div>
        </div>

        {/* Bento Grid Analytics Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-surface)] p-5 rounded-2xl flex flex-col justify-between border border-[var(--border-glow)] shadow-sm relative overflow-hidden" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-bl-full pointer-events-none"></div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Ocupación / Ingresos</span>
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-500">
                <span className="material-symbols-outlined text-sm">pie_chart</span>
              </div>
            </div>
            <div>
              <h4 className="text-4xl font-black text-slate-900 dark:text-white mt-1 mb-3">
                {totalTablesInZone > 0 ? Math.round((activeTablesCount / totalTablesInZone) * 100) : 0}%
              </h4>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-650 dark:text-slate-300">${totalRevenue.toLocaleString('es-CO')} <span className="text-[10px] text-slate-450 font-medium">Hoy</span></span>
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">trending_up</span> 12%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] p-5 rounded-2xl flex flex-col justify-between border border-[var(--border-glow)] shadow-sm relative overflow-hidden" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <div className="absolute right-0 top-0 w-32 h-32 bg-orange-500/5 rounded-bl-full pointer-events-none"></div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Comensales Totales</span>
              <div className="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-500">
                <span className="material-symbols-outlined text-sm">groups</span>
              </div>
            </div>
            <div>
              <h4 className="text-4xl font-black text-slate-900 dark:text-white mt-1 mb-3">
                {activeTickets.reduce((sum, t) => sum + (t.paxCount || 1), 0)}
              </h4>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-650 dark:text-slate-300">Ticket Prom: <span className="text-slate-900 dark:text-white">${totalRevenue > 0 ? Math.round(totalRevenue / activeTickets.length).toLocaleString('es-CO') : '0.00'}</span></span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] p-5 rounded-2xl flex flex-col justify-between border border-[var(--border-glow)] shadow-sm relative overflow-hidden" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none"></div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Rotación Promedio</span>
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500">
                <span className="material-symbols-outlined text-sm">timer</span>
              </div>
            </div>
            <div>
              <h4 className="text-4xl font-black text-slate-900 dark:text-white mt-1 mb-3">
                45m
              </h4>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '60%' }}></div>
              </div>
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] p-5 rounded-2xl flex flex-col justify-between border border-[var(--border-glow)] shadow-sm" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-4">Estado General</span>
            <div className="space-y-3 mt-auto font-semibold">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-800 dark:bg-slate-400"></span>
                  <span className="text-sm text-slate-650 dark:text-slate-300">Reservas registradas</span>
                </div>
                <span className="text-sm font-black text-slate-900 dark:text-white">{dbReservations.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                  <span className="text-sm text-slate-650 dark:text-slate-300">Mesas en Espera</span>
                </div>
                <span className="text-sm font-black text-orange-505">3</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section Header with Tabs and Legend */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-6">
          <div className="flex flex-wrap items-center gap-2">
            {[...operatingZones, ...orderCategories].map((zone) => {
              const isSelected = selectedZone === zone;
              return (
                <button
                  key={zone}
                  onClick={() => setSelectedZone(zone)}
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-purple)' : 'var(--bg-surface)',
                    color: isSelected ? '#FFFFFF' : 'var(--text-muted)',
                    borderColor: isSelected ? 'var(--accent-purple)' : 'var(--border-glow)',
                  }}
                  className={`px-5 py-2 rounded-xl text-sm font-bold transition-all border cursor-pointer ${
                    isSelected ? 'shadow-sm' : 'hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]'
                  }`}
                >
                  {zone}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-600"></span>
                <span>Libre</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                <span>Ocupada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                <span>Reservada</span>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer border-none bg-transparent ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Vista Cuadrícula"
              >
                <span className="material-symbols-outlined text-[18px]">grid_view</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer border-none bg-transparent ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Vista Lista"
              >
                <span className="material-symbols-outlined text-[18px]">view_list</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Panel (Dynamic switch between Tables, Takeaways, and Reservations) */}
        {selectedZone === 'Pedidos para llevar' ? (
          /* Pedidos para llevar list */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {activeTakeawayTickets.map(ticket => {
              const ticketTotal = ticket.items.reduce(
                (sum, item) => sum + (item.quantity * getRecipePrice(item.recipeId, item.category)),
                0
              );
              return (
                <div 
                  key={ticket.id}
                  onClick={() => onSelectTable(`To-Go: ${ticket.clientId}`, 'Pedidos para llevar')}
                  className="bg-white dark:bg-[var(--bg-surface)] rounded-[20px] overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-800 cursor-pointer flex flex-col h-auto min-h-[16rem] pb-4"
                >
                  <div className="px-4 py-2.5 flex justify-between items-center bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400">
                    <span className="text-[11px] font-black tracking-widest uppercase">Para Llevar</span>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <span className="text-[11px] font-bold">{getElapsedTime(ticket.comandaTime)}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 flex-1 flex flex-col">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                        {ticket.clientId}
                      </h3>
                      <p className="text-xs text-slate-400 font-semibold mt-1">
                        Capturado: {formatLocalTime(ticket.comandaTime)}
                      </p>
                    </div>

                    <div className="mt-auto bg-slate-50/50 dark:bg-slate-900/30 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300">Mesero: <span className="text-slate-900 dark:text-white">{ticket.waiterId.split(' ')[0]}</span></span>
                        <span className="text-[10px] text-slate-500 font-semibold">#{ticket.id.slice(-4)}</span>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="block text-[10px] text-slate-500 mb-0.5">Total Pedido</span>
                          <span className="text-xl font-black text-slate-900 dark:text-white">${ticketTotal.toLocaleString('es-CO')}</span>
                        </div>
                        <span className="bg-slate-200 dark:bg-slate-700 text-slate-650 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-md font-bold">
                          {ticket.items.reduce((sum, i) => sum + i.quantity, 0)} Items
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-white dark:bg-[var(--bg-surface)]">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.success('Pre-cuenta de entrega impresa');
                      }}
                      className="hover:text-slate-700 text-slate-400 bg-transparent border-none cursor-pointer flex items-center"
                    >
                      <span className="material-symbols-outlined text-[18px]">print</span>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBillingTicketId(ticket.id);
                      }}
                      className="px-4 py-1.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border-none"
                    >
                      Cobrar y Entregar
                    </button>
                  </div>
                </div>
              );
            })}
            {activeTakeawayTickets.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 italic">
                No hay pedidos para llevar activos en este momento.
              </div>
            )}
          </div>
        ) : selectedZone === 'Reservas' ? (
          /* Reservas List */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {dbReservations
              .filter(r => r.status === 'PENDING')
              .map(res => (
                <div 
                  key={res.id}
                  className="bg-slate-900 dark:bg-[#111229] rounded-[20px] overflow-hidden shadow-lg border border-slate-800 dark:border-slate-800 flex flex-col h-auto min-h-[16rem] pb-4 text-white"
                >
                  <div className="px-4 py-2.5 flex justify-between items-center bg-purple-600 text-white">
                    <span className="text-[11px] font-black tracking-widest uppercase">Reservada</span>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                      <span className="text-[11px] font-bold">{res.time}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-3xl font-black text-white tracking-tight">Mesa {res.tableId}</h3>
                          <p className="text-xs text-slate-400 font-semibold mt-1">Fecha: {res.date}</p>
                        </div>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const resDetail = await db.reservas.get(res.id);
                              if (resDetail) {
                                setSelectedReservationDetail(resDetail);
                              } else {
                                toast.error('Reserva no encontrada');
                              }
                            } catch (err) {
                              toast.error('Error al cargar detalle de reserva');
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-purple-400 hover:text-purple-350 transition-colors border-none cursor-pointer flex items-center justify-center shrink-0"
                          title="Ver Detalle"
                        >
                          <span className="material-symbols-outlined text-[16px]">info</span>
                        </button>
                      </div>

                      <div className="mt-4 space-y-1">
                        <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase block">Cliente</span>
                        <h4 className="text-base font-bold text-white leading-tight">{res.clientName}</h4>
                        <p className="text-xs text-slate-350 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">group</span>
                          {res.pax} Personas • {res.reason}
                        </p>
                        {res.decoration && (
                          <p className="text-[10px] text-purple-300 font-semibold">
                            ✨ Dec: {res.decoration}
                          </p>
                        )}
                        {res.notes && (
                          <p className="text-[10px] text-slate-400 italic break-words mt-1">"{res.notes}"</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-800">
                      <button
                        onClick={() => {
                          setReservationToCancel(res.id);
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-rose-500 rounded-xl transition-all cursor-pointer border-none"
                        title="Cancelar Reserva"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await startReservationService(res);
                            const tableObj = dynamicTables.find(t => t.id === res.tableId || t.name === res.tableId);
                            const zoneName = tableObj ? tableObj.zone : 'Salón Principal';
                            await refreshComanda(res.tableId);
                            onSelectTable(res.tableId, zoneName);
                          } catch (err: any) {
                            toast.error(err.message || 'Error al iniciar servicio');
                          }
                        }}
                        className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border-none"
                      >
                        Iniciar Servicio
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            {dbReservations.filter(r => r.status === 'PENDING').length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 italic">
                No hay reservas registradas pendientes.
              </div>
            )}
          </div>
        ) : (
          /* Normal Tables Deck */
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
              {filteredTables.map(table => {
                const normalizedId = table.name.toLowerCase().replace(/\s+/g, '');
                const activeTicket = ticketsByTableMap.get(normalizedId);
                const tableReservation = reservationsMap.get(table.id) || reservationsMap.get(table.name);

                if (activeTicket) {
                  // Table Occupied
                  const ticketTotal = activeTicket.items.reduce(
                    (sum, item) => sum + (item.quantity * getRecipePrice(item.recipeId, item.category)),
                    0
                  );
                  const timeStr = getElapsedTime(activeTicket.comandaTime);
                  
                  let statusBadge = activeTicket.overallStatus;
                  let headerBg = 'bg-slate-100 dark:bg-slate-800';
                  let headerText = 'text-slate-550 dark:text-slate-400';
                  let borderStyle = 'border-slate-200 dark:border-slate-700';

                  if (activeTicket.overallStatus === 'ORDEN TOMADA') {
                    statusBadge = 'ORDEN TOMADA';
                    headerBg = 'bg-slate-100 dark:bg-slate-800';
                    headerText = 'text-slate-550 dark:text-slate-400';
                    borderStyle = 'border-slate-200 dark:border-slate-700';
                  } else if (activeTicket.overallStatus === 'PREPARANDO') {
                    statusBadge = 'PREPARANDO';
                    headerBg = 'bg-blue-500 dark:bg-blue-600';
                    headerText = 'text-white';
                    borderStyle = 'border-blue-500 dark:border-blue-600';
                  } else if (activeTicket.overallStatus === 'LISTO PARA MESERO') {
                    statusBadge = 'LISTO PARA MESERO';
                    headerBg = 'bg-amber-550 dark:bg-amber-600';
                    headerText = 'text-white';
                    borderStyle = 'border-amber-500 dark:border-amber-600';
                  } else if (activeTicket.overallStatus === 'ENTREGADO A MESA') {
                    statusBadge = 'ENTREGADO A MESA';
                    headerBg = 'bg-emerald-500 dark:bg-emerald-600';
                    headerText = 'text-white';
                    borderStyle = 'border-emerald-500 dark:border-emerald-600';
                  }

                  const hasKitchen = activeTicket.items.some(i => i.category === 'KITCHEN');
                  const hasBar = activeTicket.items.some(i => i.category === 'BAR');

                  return (
                    <div
                      key={table.id}
                      onClick={async () => {
                        await refreshComanda(table.name);
                        onSelectTable(table.name, table.zone);
                      }}
                      className={`bg-white dark:bg-[var(--bg-surface)] rounded-[20px] overflow-hidden shadow-sm hover:shadow-md transition-shadow border ${borderStyle} cursor-pointer flex flex-col h-auto min-h-[16rem] pb-4`}
                    >
                      {/* Card Header */}
                      <div className={`px-4 py-2.5 flex justify-between items-center ${headerBg} ${headerText}`}>
                        <span className="text-[11px] font-black tracking-widest">{statusBadge}</span>
                        <div className="flex items-center gap-1 opacity-90">
                          <span className="material-symbols-outlined text-[14px]">schedule</span>
                          <span className="text-[11px] font-bold">{timeStr}</span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{table.name}</h3>
                            <p className="text-xs text-slate-400 font-semibold mt-1">Creado: {formatLocalTime(activeTicket.comandaTime)}</p>
                          </div>
                          <div className="flex gap-1.5">
                             {hasKitchen && (
                               <div className="w-7 h-7 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center text-orange-500">
                                 <span className="material-symbols-outlined text-[14px]">restaurant</span>
                               </div>
                             )}
                             {hasBar && (
                               <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                 <span className="material-symbols-outlined text-[14px]">local_bar</span>
                               </div>
                             )}
                          </div>
                        </div>

                        <div className="mt-auto bg-slate-50/50 dark:bg-slate-900/30 rounded-xl p-3 flex flex-col gap-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Mesero: <span className="text-slate-900 dark:text-white">{activeTicket.waiterId.split(' ')[0]}</span></span>
                            <span className="text-[10px] text-slate-500 font-semibold">#{activeTicket.id.slice(-4)}</span>
                          </div>
                          <div className="flex justify-between items-end">
                            <div>
                              <span className="block text-[10px] text-slate-500 mb-0.5">Total Pedido</span>
                              <span className="text-xl font-black text-slate-900 dark:text-white">${ticketTotal.toLocaleString('es-CO')}</span>
                            </div>
                            <span className="bg-slate-200 dark:bg-slate-700 text-slate-650 dark:text-slate-300 text-[10px] px-2 py-0.5 rounded-md font-bold">
                              {activeTicket.items.reduce((sum, i) => sum + i.quantity, 0)} Items
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-white dark:bg-[var(--bg-surface)] gap-2">
                        {activeTicket.overallStatus === 'LISTO PARA MESERO' ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await db.kdsOrderTickets.update(activeTicket.id, {
                                overallStatus: 'ENTREGADO A MESA',
                                deliveredAt: new Date().toISOString()
                              });
                              const updated = await db.kdsOrderTickets.get(activeTicket.id);
                              if (updated) await syncTicketToFirebase(updated);
                              await loadActiveTickets();
                              toast.success('Servicio entregado a mesa.', { icon: '🍽️' });
                            }}
                            className="flex-1 py-1.5 px-3 bg-emerald-600 text-white font-bold rounded-lg text-[10px] uppercase hover:brightness-110 transition-all flex items-center justify-center gap-1 cursor-pointer border-none shadow-sm"
                          >
                            <span className="material-symbols-outlined text-xs">flatware</span>
                            Entregado
                          </button>
                        ) : (
                          <div className="flex gap-4 text-slate-400">
                            <button className="hover:text-slate-700 bg-transparent border-none cursor-pointer flex items-center" onClick={(e) => { e.stopPropagation(); toast.success('Pre-cuenta impresa'); }}><span className="material-symbols-outlined text-[18px]">print</span></button>
                            <button className="hover:text-slate-700 bg-transparent border-none cursor-pointer flex items-center" onClick={(e) => e.stopPropagation()}><span className="material-symbols-outlined text-[18px]">share</span></button>
                            <button className="hover:text-slate-700 bg-transparent border-none cursor-pointer flex items-center" onClick={(e) => e.stopPropagation()}><span className="material-symbols-outlined text-[18px]">sync_alt</span></button>
                          </div>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBillingTicketId(activeTicket.id);
                          }}
                          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors border-none cursor-pointer shrink-0"
                          title="Cobrar / Ver Detalles"
                        >
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        </button>
                      </div>
                    </div>
                  );
                } else if (tableReservation) {
                  // Table Reserved
                  return (
                    <div
                      key={table.id}
                      className="bg-slate-900 dark:bg-[#111229] rounded-[20px] overflow-hidden shadow-lg border border-slate-850 dark:border-slate-800 flex flex-col h-auto min-h-[16rem] pb-4 text-white"
                    >
                      <div className="px-4 py-2.5 flex justify-between items-center bg-purple-600 text-white">
                        <span className="text-[11px] font-black tracking-widest uppercase">Reservada</span>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                          <span className="text-[11px] font-bold">{tableReservation.time}</span>
                        </div>
                      </div>
                      
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-3xl font-black text-white tracking-tight">{table.name}</h3>
                              <p className="text-xs text-slate-400 font-semibold mt-1">{table.description || 'Mesa Reservada'}</p>
                            </div>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const resDetail = await db.reservas.get(tableReservation.id);
                                  if (resDetail) {
                                    setSelectedReservationDetail(resDetail);
                                  } else {
                                    toast.error('Reserva no encontrada');
                                  }
                                } catch (err) {
                                  toast.error('Error al cargar detalle de reserva');
                                }
                              }}
                              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-400 hover:text-purple-300 transition-colors border-none cursor-pointer flex items-center justify-center shrink-0"
                              title="Ver Detalle"
                            >
                              <span className="material-symbols-outlined text-base">info</span>
                            </button>
                          </div>
                          
                          <div className="mt-4 space-y-2">
                            <div>
                              <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-0.5 block">Cliente</span>
                              <h4 className="text-base font-bold text-white leading-tight truncate">{tableReservation.clientName}</h4>
                              <p className="text-xs text-slate-350 flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-[14px]">group</span>
                                {tableReservation.pax} Personas ({tableReservation.reason})
                              </p>
                            </div>
                            
                            {tableReservation.decoration && (
                              <div className="bg-purple-950/40 border border-purple-800/30 rounded-lg p-2">
                                <span className="text-[9px] text-purple-450 font-bold tracking-widest uppercase mb-0.5 block">Decoración</span>
                                <p className="text-xs text-purple-300 font-medium truncate">✨ {tableReservation.decoration}</p>
                              </div>
                            )}

                            {tableReservation.notes && (
                              <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2">
                                <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-0.5 block">Notas Especiales</span>
                                <p className="text-xs text-slate-300 font-normal italic line-clamp-2">"{tableReservation.notes}"</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            try {
                              await startReservationService(tableReservation);
                              await refreshComanda(table.name);
                              onSelectTable(table.name, table.zone);
                            } catch (err: any) {
                              toast.error(err.message || 'Error al iniciar servicio');
                            }
                          }}
                          className="w-full py-2.5 bg-purple-600 hover:bg-purple-750 text-white rounded-xl text-sm font-bold transition-colors shadow-sm cursor-pointer border-none mt-4"
                        >
                          Iniciar Servicio
                        </button>
                      </div>
                    </div>
                  );
                } else {
                  // Table Free
                  return (
                    <div
                      key={table.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setReservationTable(table);
                        setResClientName('');
                        setResClientId('');
                        setResDate('');
                        setResTime('');
                        setResReason('Cumpleaños');
                        setResNotes('');
                        setResPax(table.capacity);
                        setResDecoration('');
                        setIsResNewClient(false);
                        setClientSearchQuery('');
                        setShowReservationModal(true);
                      }}
                      onClick={async () => {
                        await refreshComanda(table.name);
                        onSelectTable(table.name, table.zone);
                      }}
                      className="bg-white dark:bg-[var(--bg-surface)] rounded-[20px] overflow-hidden border border-slate-200 border-dashed hover:border-solid dark:border-slate-800 cursor-pointer flex flex-col items-center justify-center h-auto min-h-[16rem] group hover:shadow-sm transition-all pb-4 pt-4"
                    >
                      <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors mb-4">
                        <span className="material-symbols-outlined text-3xl">add</span>
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{table.name}</h3>
                      <p className="text-xs text-slate-400 font-semibold mt-1">{table.description}</p>
                      <span className="mt-4 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] px-3 py-1 rounded-md font-bold uppercase tracking-wider group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
                        Libre
                      </span>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            /* List View Layout */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[var(--card-color)]/50 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-800">
                      <th className="py-4 px-6">Mesa</th>
                      <th className="py-4 px-6">Zona</th>
                      <th className="py-4 px-6">Capacidad</th>
                      <th className="py-4 px-6">Estado</th>
                      <th className="py-4 px-6">Creado a las</th>
                      <th className="py-4 px-6">Tiempo Transcurrido</th>
                      <th className="py-4 px-6">Mesero</th>
                      <th className="py-4 px-6 text-right">Total</th>
                      <th className="py-4 px-6"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {filteredTables.map(table => {
                      const normalizedId = table.name.toLowerCase().replace(/\s+/g, '');
                      const activeTicket = ticketsByTableMap.get(normalizedId);
                      const tableReservation = reservationsMap.get(table.id) || reservationsMap.get(table.name);

                      return (
                        <tr
                          key={table.id}
                          onClick={async () => {
                            await refreshComanda(table.name);
                            onSelectTable(table.name, table.zone);
                          }}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                        >
                          <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-200">{table.name}</td>
                          <td className="py-4 px-6 text-slate-505">{table.zone}</td>
                          <td className="py-4 px-6 text-slate-505">{table.capacity} Personas</td>
                          <td className="py-4 px-6">
                            {activeTicket ? (
                              (() => {
                                if (activeTicket.overallStatus === 'ORDEN TOMADA') {
                                  return (
                                    <span className="inline-flex bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                      Orden Tomada
                                    </span>
                                  );
                                } else if (activeTicket.overallStatus === 'PREPARANDO') {
                                  return (
                                    <span className="inline-flex bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-455 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                      Preparando
                                    </span>
                                  );
                                } else if (activeTicket.overallStatus === 'LISTO PARA MESERO') {
                                  return (
                                    <span className="inline-flex bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-455 px-2.5 py-0.5 rounded-full text-xs font-semibold animate-pulse">
                                      Listo para Mesero
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="inline-flex bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                      Entregado a Mesa
                                    </span>
                                  );
                                }
                              })()
                            ) : tableReservation ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 px-2.5 py-0.5 rounded-full text-xs font-semibold w-fit">
                                  Reservada
                                </span>
                                <span className="text-[11px] text-slate-600 dark:text-slate-350 font-bold">
                                  {tableReservation.clientName} ({tableReservation.time})
                                </span>
                                {tableReservation.decoration && (
                                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                                    ✨ {tableReservation.decoration}
                                  </span>
                                )}
                                {tableReservation.notes && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 italic line-clamp-1">
                                    "{tableReservation.notes}"
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex bg-slate-100 dark:bg-[var(--card-color)] text-slate-400 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                Libre
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-slate-505">
                            {activeTicket ? formatLocalTime(activeTicket.comandaTime) : '--'}
                          </td>
                          <td className="py-4 px-6 text-slate-505">
                            {activeTicket ? getElapsedTime(activeTicket.comandaTime) : '--'}
                          </td>
                          <td className="py-4 px-6 text-slate-505">
                            {activeTicket ? activeTicket.waiterId.split(' ')[0] : '--'}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-slate-800 dark:text-slate-200">
                            {activeTicket
                              ? `$${activeTicket.items.reduce(
                                  (sum, item) => sum + (item.quantity * getRecipePrice(item.recipeId, item.category)),
                                  0
                                ).toLocaleString('es-CO')}`
                              : '--'}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {activeTicket ? (
                              <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                {activeTicket.overallStatus === 'LISTO PARA MESERO' && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await db.kdsOrderTickets.update(activeTicket.id, {
                                        overallStatus: 'ENTREGADO A MESA',
                                        deliveredAt: new Date().toISOString()
                                      });
                                      const updated = await db.kdsOrderTickets.get(activeTicket.id);
                                      if (updated) await syncTicketToFirebase(updated);
                                      await loadActiveTickets();
                                      toast.success('Servicio entregado a mesa.', { icon: '🍽️' });
                                    }}
                                    className="px-3 py-1.5 bg-emerald-600 hover:brightness-110 text-white rounded-lg text-xs font-bold transition-all cursor-pointer border-none shadow-sm active:scale-95 flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-xs">flatware</span>
                                    Entregado
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBillingTicketId(activeTicket.id);
                                  }}
                                  className="px-3 py-1.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 border-none"
                                >
                                  Facturar
                                </button>
                              </div>
                            ) : (
                              <span className="material-symbols-outlined text-slate-400 hover:text-slate-600">
                                chevron_right
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* Billing/Payment Modal */}
      {selectedBillingTicket && (() => {
        const itemsPayload = selectedBillingTicket.items.map((item, idx) => {
          const recipe = recipes.find(r => r.id === item.recipeId);
          const costPerUnit = recipe ? (recipe.costPrice || 0) : (item.category === 'BAR' ? 4500 : 13000);
          return {
            recipeId: item.recipeId,
            quantity: item.quantity,
            unitPrice: getRecipePrice(item.recipeId, item.category),
            name: item.name,
            status: item.status,
            consumed: item.consumed || ['COOKING', 'PREPARING', 'COMPLETED', 'DELIVERED'].includes(item.status),
            cost: costPerUnit * item.quantity,
            originalIndex: idx,
            operationZone: item.operationZone || recipe?.productionZone || 'Cocina'
          };
        });

        const grossTotal = itemsPayload.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const taxRate = 0.08;
        const taxAmount = grossTotal * taxRate;
        const netAmount = grossTotal - taxAmount;

        const handleProcessPayment = async () => {
          const payload: OrderPaidPayload = {
            orderId: selectedBillingTicket.orderId,
            tableId: selectedBillingTicket.tableId,
            waiterId: selectedBillingTicket.waiterId,
            totalAmount: grossTotal,
            netAmountBeforeTax: netAmount,
            taxAmount: taxAmount,
            paymentMethod: billingPaymentMethod,
            items: itemsPayload.map(i => ({
              recipeId: i.recipeId,
              quantity: i.quantity,
              unitPrice: i.unitPrice
            })),
            clientData: billingClientName ? {
              name: billingClientName,
              email: billingClientEmail,
              taxId: billingClientTaxId || undefined
            } : undefined
          };

          await eventBus.emit('OrderPaid', payload);
          await enqueueOfflineEvent('OrderPaid', payload);
          await db.kdsOrderTickets.update(selectedBillingTicket.id, {
            overallStatus: 'CERRADA',
            deliveredAt: selectedBillingTicket.deliveredAt || new Date().toISOString(),
            closedAt: new Date().toISOString()
          });
          const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
          if (updated) {
            await syncTicketToFirebase(updated);
          }

          setSelectedBillingTicketId(null);
          setBillingClientName('');
          setBillingClientEmail('');
          setBillingClientTaxId('');
          setBillingPaymentMethod('Efectivo');
        };

        const handleCancelItem = (item: typeof itemsPayload[0]) => {
          if (item.consumed) {
            setCancellingItem({
              recipeId: item.recipeId,
              name: item.name,
              quantity: item.quantity,
              cost: item.cost,
              originalIndex: item.originalIndex,
              operationZone: item.operationZone
            });
            setWasteReason('Error de comanda');
          } else {
            setShowPreProdConfirm({
              name: item.name,
              originalIndex: item.originalIndex
            });
          }
        };

        const handleConfirmWasteCancellation = async () => {
          if (!cancellingItem) return;

          await db.operationalLosses.put({
            id: `loss-${Date.now()}`,
            ticketId: selectedBillingTicket.id,
            recipeId: cancellingItem.recipeId,
            name: cancellingItem.name,
            quantity: cancellingItem.quantity,
            cost: cancellingItem.cost,
            reason: wasteReason,
            cancelledAt: new Date().toISOString(),
            waiterId: selectedBillingTicket.waiterId,
            user: selectedBillingTicket.waiterId || 'Alex M. (POS)',
            operationZone: cancellingItem.operationZone
          });

          const updatedItems = selectedBillingTicket.items.filter((_, idx) => idx !== cancellingItem.originalIndex);
          if (updatedItems.length === 0) {
            await db.kdsOrderTickets.update(selectedBillingTicket.id, {
              items: [],
              overallStatus: 'CANCELADA',
              cancelJustification: wasteReason,
              closedAt: new Date().toISOString()
            });
            const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
            if (updated) await syncTicketToFirebase(updated);
            setSelectedBillingTicketId(null);
            toast.success('Comanda cancelada y merma registrada.');
          } else {
            await db.kdsOrderTickets.update(selectedBillingTicket.id, {
              items: updatedItems
            });
            const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
            if (updated) await syncTicketToFirebase(updated);
            toast.success('Merma registrada e ítem cancelado.');
          }
          setCancellingItem(null);
        };

        const handleCancelEntireComandaClick = () => {
          const anyConsumed = itemsPayload.some(i => i.consumed);
          if (anyConsumed) {
            setCancellingTicket(true);
            setWasteReason('Error de comanda');
          } else {
            setShowCancelComandaConfirm(true);
          }
        };

        const handleConfirmEntireComandaWaste = async () => {
          const consumedItems = itemsPayload.filter(i => i.consumed);
          const totalWasteCost = consumedItems.reduce((sum, i) => sum + i.cost, 0);

          for (const item of consumedItems) {
            await db.operationalLosses.put({
              id: `loss-${Date.now()}-${item.originalIndex}`,
              ticketId: selectedBillingTicket.id,
              recipeId: item.recipeId,
              name: item.name,
              quantity: item.quantity,
              cost: item.cost,
              reason: wasteReason,
              cancelledAt: new Date().toISOString(),
              waiterId: selectedBillingTicket.waiterId,
              user: selectedBillingTicket.waiterId || 'Alex M. (POS)',
              operationZone: item.operationZone
            });
          }

          await db.kdsOrderTickets.update(selectedBillingTicket.id, {
            overallStatus: 'CANCELADA',
            cancelJustification: wasteReason,
            closedAt: new Date().toISOString()
          });
          const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
          if (updated) await syncTicketToFirebase(updated);
          setSelectedBillingTicketId(null);
          setCancellingTicket(false);
          toast.success(`Pedido cancelado. Pérdida registrada: $${totalWasteCost.toLocaleString('es-CO')} COP`);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl p-8 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto text-slate-800 dark:text-slate-200">
              <h3 className="text-xl font-headline font-black mb-1 text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent-purple)]">receipt_long</span>
                Facturación y Cierre - {selectedBillingTicket.tableId ? `Mesa ${selectedBillingTicket.tableId}` : `Llevar (${selectedBillingTicket.clientId})`}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-4">
                Comanda creada a las: <strong className="text-slate-800 dark:text-white">{formatLocalTime(selectedBillingTicket.comandaTime)}</strong> • Tiempo transcurrido: <strong className="text-slate-800 dark:text-white">{getElapsedTime(selectedBillingTicket.comandaTime)}</strong>
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
                {/* Left: Summary */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Detalle de Consumos</span>
                    <button
                      type="button"
                      onClick={handleCancelEntireComandaClick}
                      className="text-[10px] text-rose-500 font-black uppercase tracking-wider hover:underline flex items-center gap-1 cursor-pointer border-none bg-transparent"
                    >
                      <span className="material-symbols-outlined text-xs">delete_forever</span>
                      Cancelar Pedido
                    </button>
                  </div>
                  <div className="border border-slate-105 dark:border-slate-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-[var(--card-color)]/50 text-slate-400 font-bold uppercase">
                          <th className="py-2.5 px-3">Item</th>
                          <th className="py-2.5 px-3 text-right">Cant</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                          <th className="py-2.5 px-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {itemsPayload.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-3 font-semibold flex items-center gap-1.5">
                              {item.name}
                              {item.consumed && (
                                <span 
                                  className="material-symbols-outlined text-[var(--text-muted)] text-xs shrink-0 select-none animate-pulse" 
                                  title="En preparación (Punto de No Retorno)" 
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  local_fire_department
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">{item.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-mono">${(item.quantity * item.unitPrice).toLocaleString('es-CO')}</td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleCancelItem(item)}
                                className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer border-none bg-transparent"
                                title="Cancelar ítem"
                              >
                                <span className="material-symbols-outlined text-sm">cancel</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial breakdown */}
                  <div className="p-4 bg-slate-50 dark:bg-[var(--card-color)]/40 rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monto Subtotal:</span>
                      <span className="font-semibold">${grossTotal.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>Impuesto Impoconsumo (8%):</span>
                      <span>${taxAmount.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-2 pt-2 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                      <span>Total Neto (Base):</span>
                      <span>${netAmount.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="flex justify-between font-black text-base text-[var(--accent-purple)] pt-1">
                      <span>Total a Cobrar:</span>
                      <span>${grossTotal.toLocaleString('es-CO')}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Client billing info & Payment method */}
                <div className="space-y-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Datos del Cliente (Opcional - DIAN)</span>
                  
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
                    <CustomSelect
                      value={billingPaymentMethod}
                      onChange={setBillingPaymentMethod}
                      options={[
                        { value: 'Efectivo', label: 'Efectivo' },
                        { value: 'Tarjeta Debito', label: 'Tarjeta Débito' },
                        { value: 'Tarjeta Credito', label: 'Tarjeta Crédito' },
                        { value: 'Transferencia', label: 'Transferencia (Nequi/Daviplata)' }
                      ]}
                      className="w-full bg-white dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSelectedBillingTicketId(null)}
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

              {/* merma modal (single item) */}
              {cancellingItem && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 space-y-4">
                    <div className="flex items-center gap-2 text-rose-500">
                      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                      <h4 className="text-lg font-headline font-black">Confirmar Motivo de Merma</h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      El producto <strong className="text-slate-800 dark:text-white">"{cancellingItem.name}"</strong> ya entró en producción (🔥). Al cancelarlo, se registrará una pérdida operativa de <strong>${cancellingItem.cost.toLocaleString('es-CO')} COP</strong> correspondiente al costo de sus ingredientes.
                    </p>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Motivo del Descarte</label>
                      <CustomSelect
                        value={wasteReason}
                        onChange={setWasteReason}
                        options={configuredWasteReasons.map((r: string) => ({ value: r, label: r }))}
                        className="w-full bg-white dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setCancellingItem(null)}
                        className="flex-1 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer border-none"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmWasteCancellation}
                        className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer border-none"
                      >
                        Registrar Merma
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* merma modal (entire ticket) */}
              {cancellingTicket && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 space-y-4">
                    <div className="flex items-center gap-2 text-rose-500">
                      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                      <h4 className="text-lg font-headline font-black">Confirmar Motivo de Merma Comanda</h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Esta comanda contiene productos que ya entraron en producción (🔥). Al cancelarla completa, se registrará una pérdida de ingredientes correspondiente a los platos iniciados.
                    </p>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Motivo del Descarte</label>
                      <CustomSelect
                        value={wasteReason}
                        onChange={setWasteReason}
                        options={configuredWasteReasons.map((r: string) => ({ value: r, label: r }))}
                        className="w-full bg-white dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setCancellingTicket(false)}
                        className="flex-1 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-350 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer border-none"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmEntireComandaWaste}
                        className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer border-none"
                      >
                        Registrar Pérdida
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Pre-production item delete dialog */}
              <ConfirmDialog
                isOpen={!!showPreProdConfirm}
                onClose={() => setShowPreProdConfirm(null)}
                onConfirm={async () => {
                  if (!showPreProdConfirm) return;
                  const updatedItems = selectedBillingTicket.items.filter((_, idx) => idx !== showPreProdConfirm.originalIndex);
                  if (updatedItems.length === 0) {
                    await db.kdsOrderTickets.update(selectedBillingTicket.id, {
                      items: [],
                      overallStatus: 'CANCELADA',
                      cancelJustification: "Todos los ítems removidos antes de producción",
                      closedAt: new Date().toISOString()
                    });
                    const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
                    if (updated) await syncTicketToFirebase(updated);
                    setSelectedBillingTicketId(null);
                    toast.success('Mesa liberada.');
                  } else {
                    await db.kdsOrderTickets.update(selectedBillingTicket.id, {
                      items: updatedItems
                    });
                    const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
                    if (updated) await syncTicketToFirebase(updated);
                    toast.success('Ítem removido de la comanda.');
                  }
                  setShowPreProdConfirm(null);
                }}
                title="Confirmar Cancelación"
                message={`¿Seguro que deseas eliminar "${showPreProdConfirm?.name}" de la comanda? El producto no ha entrado en producción.`}
              />

              {/* Pre-production entire comanda delete dialog */}
              <ConfirmDialog
                isOpen={showCancelComandaConfirm}
                onClose={() => setShowCancelComandaConfirm(false)}
                onConfirm={async () => {
                  await db.kdsOrderTickets.update(selectedBillingTicket.id, {
                    overallStatus: 'CANCELADA',
                    cancelJustification: 'Cancelación de comanda completa antes de producción',
                    closedAt: new Date().toISOString()
                  });
                  const updated = await db.kdsOrderTickets.get(selectedBillingTicket.id);
                  if (updated) await syncTicketToFirebase(updated);
                  setSelectedBillingTicketId(null);
                  setShowCancelComandaConfirm(false);
                  toast.success('Comanda cancelada.');
                }}
                title="Cancelar Toda la Comanda"
                message="¿Seguro que deseas cancelar toda la comanda? Ningún producto ha entrado en preparación."
              />

            </div>
          </div>
        );
      })()}

      {/* Reservation Detail Modal */}
      {selectedReservationDetail && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-purple)]/10 flex items-center justify-center text-[var(--accent-purple)]">
                  <span className="material-symbols-outlined">event_available</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Detalle de la Reserva</h3>
                  <p className="text-xs text-slate-500">Mesa {selectedReservationDetail.tableId} • Estado: {selectedReservationDetail.status}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedReservationDetail(null)} 
                className="w-8 h-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors border-none bg-transparent cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/50">
                  <span className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">Cliente</span>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{selectedReservationDetail.clientName}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/50">
                  <span className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">Comensales</span>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{selectedReservationDetail.pax} Personas</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/50">
                  <span className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">Fecha</span>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{selectedReservationDetail.date}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/50">
                  <span className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">Hora</span>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{selectedReservationDetail.time}</p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/50">
                <span className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">Motivo</span>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">{selectedReservationDetail.reason}</p>
              </div>

              <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-200/40 dark:border-purple-900/30">
                <span className="block text-[10px] font-extrabold uppercase tracking-widest text-purple-500 mb-1">Decoración:</span>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  {selectedReservationDetail.decoration ? `✨ ${selectedReservationDetail.decoration}` : 'Ninguna'}
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200/40 dark:border-slate-700/50">
                <span className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">Notas:</span>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  {selectedReservationDetail.notes ? `"${selectedReservationDetail.notes}"` : 'Sin notas adicionales'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setSelectedReservationDetail(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-350 hover:bg-slate-250 dark:hover:bg-slate-700 rounded-lg transition-colors border-none bg-transparent cursor-pointer"
              >
                Cerrar
              </button>
              {selectedReservationDetail.status === 'PENDING' && (
                <button 
                  type="button"
                  onClick={async () => {
                    const r = selectedReservationDetail;
                    setSelectedReservationDetail(null);
                    try {
                      await startReservationService(r);
                      const tableObj = dynamicTables.find(t => t.id === r.tableId || t.name === r.tableId);
                      const zoneName = tableObj ? tableObj.zone : 'Salón Principal';
                      await refreshComanda(r.tableId);
                      onSelectTable(r.tableId, zoneName);
                    } catch (err: any) {
                      toast.error(err.message || 'Error al iniciar servicio');
                    }
                  }}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 rounded-lg shadow-sm transition-all border-none cursor-pointer"
                >
                  Iniciar Servicio
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reservation Modal */}
      {showReservationModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-purple)]/10 flex items-center justify-center text-[var(--accent-purple)]">
                  <span className="material-symbols-outlined">event_available</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nueva Reserva</h3>
                  <p className="text-xs text-slate-500">Registra y programa recordatorios de la reserva.</p>
                </div>
              </div>
              <button onClick={() => setShowReservationModal(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Client Search / Registration Block */}
              {!isResNewClient ? (
                <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-[var(--border-glow)]">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Buscador de Clientes *</span>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                    <input
                      type="text"
                      className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none transition-all dark:text-white font-semibold"
                      placeholder="Buscar cliente registrado..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Search Results list */}
                  {clientSearchQuery.trim() !== '' && (
                    <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-750 rounded-xl bg-white dark:bg-slate-900">
                      {filteredClientsForRes.map(client => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setResClientName(client.name);
                            setResClientId(client.id);
                            setClientSearchQuery('');
                          }}
                          className="w-full text-left p-2.5 hover:bg-[var(--accent-purple)]/10 text-slate-800 dark:text-slate-200 transition-colors flex flex-col gap-0.5 cursor-pointer border-none bg-transparent"
                        >
                          <span className="text-xs font-bold">{client.name}</span>
                          <span className="text-[9px] text-slate-400">Cel: {client.phone} • Dir: {client.address}</span>
                        </button>
                      ))}
                      {filteredClientsForRes.length === 0 && (
                        <div className="p-3 text-center text-xs text-slate-400 italic">
                          No se encontraron coincidencias.
                        </div>
                      )}
                    </div>
                  )}

                  {resClientName && (
                    <div className="flex items-center justify-between bg-purple-100/40 dark:bg-purple-950/20 px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800/40">
                      <div>
                        <span className="text-[9px] text-purple-650 dark:text-purple-400 font-extrabold uppercase tracking-wider block">Cliente Seleccionado</span>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{resClientName}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => { setResClientName(''); setResClientId(''); }}
                        className="text-xs text-rose-500 font-bold hover:underline bg-transparent border-none cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  )}

                  <div className="text-right">
                    <button 
                      type="button"
                      onClick={() => setIsResNewClient(true)}
                      className="text-xs text-[var(--accent-purple)] font-black hover:underline bg-transparent border-none cursor-pointer"
                    >
                      + Registrar Nuevo Cliente para la Reserva
                    </button>
                  </div>
                </div>
              ) : (
                /* Inline New Client registration */
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-[var(--border-glow)] animate-fade-in">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-black uppercase text-slate-400">Nuevo Cliente para Reserva</span>
                    <button 
                      type="button"
                      onClick={() => setIsResNewClient(false)}
                      className="text-[10px] text-[var(--accent-purple)] font-black hover:underline bg-transparent border-none cursor-pointer"
                    >
                      Buscar Existente
                    </button>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      value={resClientName}
                      onChange={(e) => setResClientName(e.target.value)}
                      className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                      placeholder="ej. María López"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Celular *</label>
                      <input
                        type="text"
                        value={newResPhone}
                        onChange={(e) => setNewResPhone(e.target.value)}
                        className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                        placeholder="ej. 3001234567"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Dirección *</label>
                      <input
                        type="text"
                        value={newResAddress}
                        onChange={(e) => setNewResAddress(e.target.value)}
                        className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                        placeholder="ej. Calle 85 # 11-44"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] font-bold text-[var(--text-primary)]">Factura Electrónica</span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newResElectronic}
                        onChange={(e) => setNewResElectronic(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-purple)]"></div>
                    </label>
                  </div>

                  {newResElectronic && (
                    <div className="grid grid-cols-2 gap-3 animate-fade-in">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">NIT / Cédula *</label>
                        <input
                          type="text"
                          value={newResTaxId}
                          onChange={(e) => setNewResTaxId(e.target.value)}
                          className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                          placeholder="ej. 109876543-2"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Email *</label>
                        <input
                          type="email"
                          value={newResEmail}
                          onChange={(e) => setNewResEmail(e.target.value)}
                          className="w-full rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                          placeholder="ej. maria@gmail.com"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Table, Date, Time & Pax */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mesa a Asignar *</label>
                    <select 
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white font-semibold"
                      value={reservationTable ? reservationTable.name : ''}
                      onChange={(e) => {
                        const tbl = dynamicTables.find(t => t.name === e.target.value);
                        setReservationTable(tbl || null);
                      }}
                    >
                      <option value="">Seleccione Mesa...</option>
                      {dynamicTables.map(t => (
                        <option key={t.id} value={t.name}>{t.name} ({t.capacity} pax)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Personas (Pax) *</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white font-semibold"
                      value={resPax}
                      onChange={(e) => setResPax(Number(e.target.value))}
                      min={1}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha *</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white font-semibold"
                      value={resDate}
                      onChange={(e) => setResDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hora *</label>
                    <input
                      type="time"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white font-semibold"
                      value={resTime}
                      onChange={(e) => setResTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Motivo *</label>
                    <select 
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white font-semibold"
                      value={resReason}
                      onChange={(e) => setResReason(e.target.value)}
                    >
                      <option value="Cena Casual">Cena Casual</option>
                      <option value="Cumpleaños">Cumpleaños</option>
                      <option value="Aniversario">Aniversario</option>
                      <option value="Negocios">Negocios</option>
                      <option value="Evento Especial">Evento Especial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Decoración (Opcional)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white font-semibold"
                      placeholder="Ej. Globos, Vela, Pétalos"
                      value={resDecoration}
                      onChange={(e) => setResDecoration(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notas Especiales</label>
                  <textarea
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none dark:text-white min-h-[60px] font-medium"
                    placeholder="Silla para bebé, alergias alimentarias..."
                    value={resNotes}
                    onChange={(e) => setResNotes(e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setShowReservationModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-350 hover:bg-slate-250 dark:hover:bg-slate-700 rounded-lg transition-colors border-none bg-transparent cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={async () => {
                  if (!resClientName.trim()) {
                    toast.error('El nombre del cliente es requerido.');
                    return;
                  }
                  if (!reservationTable) {
                    toast.error('Debe seleccionar una mesa.');
                    return;
                  }
                  if (!resDate || !resTime) {
                    toast.error('Fecha y Hora son obligatorias.');
                    return;
                  }

                  let clientData = undefined;
                  if (isResNewClient) {
                    if (!newResPhone.trim() || !newResAddress.trim()) {
                      toast.error('Celular y dirección son requeridos para el cliente.');
                      return;
                    }
                    if (newResElectronic) {
                      if (!newResEmail.trim() || !newResTaxId.trim()) {
                        toast.error('NIT y Email son requeridos para factura electrónica.');
                        return;
                      }
                    }
                    clientData = {
                      name: resClientName.trim(),
                      phone: newResPhone.trim(),
                      address: newResAddress.trim(),
                      electronicInvoice: newResElectronic,
                      email: newResElectronic ? newResEmail.trim() : undefined,
                      taxId: newResElectronic ? newResTaxId.trim() : undefined
                    };
                  }

                  try {
                    await saveReservationWithValidation(
                      {
                        tableId: reservationTable.name,
                        clientName: resClientName.trim(),
                        clientId: resClientId || '',
                        date: resDate,
                        time: resTime,
                        reason: resReason,
                        notes: resNotes.trim() || undefined,
                        decoration: resDecoration.trim() || undefined,
                        pax: resPax
                      },
                      clientData
                    );
                    toast.success('Reserva guardada y notificaciones programadas.');
                    setShowReservationModal(false);
                  } catch (err: any) {
                    toast.error(err.message || 'Error al guardar la reserva');
                  }
                }}
                className="px-5 py-2.5 text-xs font-bold text-white bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 rounded-lg shadow-sm transition-all shadow-[var(--accent-purple)]/20 border-none cursor-pointer"
              >
                Confirmar Reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Takeaway Modal */}
      {showTakeawayModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-[var(--accent-purple)]">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_bag</span>
                <h4 className="text-lg font-headline font-black">Pedido para Llevar</h4>
              </div>
              <button
                onClick={() => {
                  setShowTakeawayModal(false);
                  setIsNewClientMode(false);
                  setTakeawayClientSearch('');
                }}
                className="text-slate-400 hover:text-slate-500 cursor-pointer border-none bg-transparent flex items-center"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {!isNewClientMode ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Busca y selecciona un cliente registrado o crea uno nuevo para iniciar la facturación.
                </p>
                
                {/* Search input */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                  <input
                    type="text"
                    value={takeawayClientSearch}
                    onChange={(e) => setTakeawayClientSearch(e.target.value)}
                    placeholder="Buscar cliente por nombre..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white text-xs outline-none focus:ring-2 focus:ring-[var(--accent-purple)]"
                    autoFocus
                  />
                </div>

                {/* Clients list */}
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-[var(--card-color)]/20">
                  {filteredClientsForTakeaway.map(client => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setShowTakeawayModal(false);
                        onSelectTable(`To-Go: ${client.name}`, 'Pedidos para llevar');
                      }}
                      className="w-full text-left p-3 hover:bg-[var(--accent-purple)]/10 text-slate-800 dark:text-slate-200 transition-colors flex flex-col gap-0.5 cursor-pointer border-none bg-transparent"
                    >
                      <span className="text-xs font-bold">{client.name}</span>
                      <span className="text-[10px] text-slate-450 font-semibold">{client.phone} • NIT: {client.taxId || 'No registra'}</span>
                    </button>
                  ))}
                  {filteredClientsForTakeaway.length === 0 && (
                    <div className="p-4 text-center text-xs text-[var(--text-muted)] italic">
                      No se encontraron coincidencias.
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
                    className="w-full py-3 bg-slate-100 dark:bg-[var(--card-color)] text-[var(--text-primary)] hover:bg-slate-200 dark:hover:bg-slate-800 font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    Nuevo Cliente
                  </button>
                </div>
              </div>
            ) : (
              /* Takeaway Client Creation Form */
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ingresa la información obligatoria de facturación del nuevo cliente.
                </p>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={takeawayClientName}
                    onChange={(e) => setTakeawayClientName(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. Juan Pérez"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Celular *</label>
                    <input
                      type="text"
                      value={takeawayPhone}
                      onChange={(e) => setTakeawayPhone(e.target.value)}
                      className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                      placeholder="ej. 3001234567"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Dirección *</label>
                    <input
                      type="text"
                      value={takeawayAddress}
                      onChange={(e) => setTakeawayAddress(e.target.value)}
                      className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                      placeholder="ej. Calle 85 # 11-44"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/55 border border-[var(--border-glow)]">
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cédula / NIT *</label>
                      <input
                        type="text"
                        value={takeawayTaxId}
                        onChange={(e) => setTakeawayTaxId(e.target.value)}
                        className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                        placeholder="ej. 109876543-2"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Correo Electrónico *</label>
                      <input
                        type="email"
                        value={takeawayEmail}
                        onChange={(e) => setTakeawayEmail(e.target.value)}
                        className="w-full rounded-xl border border-[rgba(143,99,244,0.15)] dark:bg-[var(--card-color)] dark:text-white p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                        placeholder="ej. juan@gmail.com"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsNewClientMode(false)}
                    className="flex-1 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-650 dark:text-slate-350 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer border-none"
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
                          toast.error('NIT y correo electrónico son obligatorios para factura electrónica.');
                          return;
                        }
                      }

                      // Save client
                      const newClientId = `cli-${Date.now()}`;
                      await db.clients.put({
                        id: newClientId,
                        name: takeawayClientName.trim(),
                        phone: takeawayPhone.trim(),
                        address: takeawayAddress.trim(),
                        electronicInvoice: takeawayElectronic,
                        email: takeawayElectronic ? takeawayEmail.trim() : undefined,
                        taxId: takeawayElectronic ? takeawayTaxId.trim() : undefined,
                        createdAt: new Date().toISOString()
                      });

                      setShowTakeawayModal(false);
                      setIsNewClientMode(false);
                      onSelectTable(`To-Go: ${takeawayClientName.trim()}`, 'Pedidos para llevar');
                    }}
                    className="flex-1 py-3 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-black rounded-xl text-xs uppercase tracking-wider text-center cursor-pointer shadow-md border-none"
                  >
                    Iniciar Pedido
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Reservation Cancellation ConfirmDialog */}
      <ConfirmDialog
        isOpen={!!reservationToCancel}
        onClose={() => setReservationToCancel(null)}
        onConfirm={async () => {
          if (reservationToCancel) {
            await db.reservas.delete(reservationToCancel);
            // Delete scheduled notifications
            await db.notifications.where('targetId').equals(reservationToCancel).delete();
            toast.success('Reserva cancelada.');
            setReservationToCancel(null);
          }
        }}
        title="Cancelar Reserva"
        message="¿Deseas cancelar esta reserva? Esta acción no se puede deshacer."
        confirmText="Confirmar"
        cancelText="Cancelar"
      />

    </div>
  );
}
