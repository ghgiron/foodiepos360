// src/pages/inventory/HistoricoOrdenesCompra.tsx
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/localDb';
import type { PurchaseOrder, Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getHumanizedPurchaseOrderSupplier } from '../../utils/purchaseOrderUtils';
import { cancelPurchaseOrder } from '../../services/purchaseOrderService';
import PurchaseOrderDetailModal from '../../components/inventory/PurchaseOrderDetailModal';
import PurchaseNavHeader from '../../components/inventory/PurchaseNavHeader';
import CustomSelect from '../../components/ui/CustomSelect';
import CustomDatePicker from '../../components/ui/CustomDatePicker';
import ManualPurchaseOrderModal from '../../components/inventory/ManualPurchaseOrderModal';
import { useNavigate } from '../../hooks/useNavigate';
import { toast } from 'react-hot-toast';

interface HistoricoOrdenesCompraProps {
  onNavigateSection?: (section: 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY') => void;
  onNavigateToReceiptWithOrder?: (order: PurchaseOrder) => void;
}

/**
 * Utilidades defensivas para renderizado blindado contra nulos [US-09C]
 */
function formatDateSafe(dateVal: any): string {
  if (!dateVal) return 'Sin fecha';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (err) {
    console.error('[HistoricoOrdenesCompra] Error parseando fecha:', dateVal, err);
    return 'Sin fecha';
  }
}

function formatTimeSafe(dateVal: any): string {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function resolveTotalAmount(order: any): number {
  if (!order) return 0;
  const val = order.totalAmount ?? order.totalEstimatedCost ?? order.estimatedTotal ?? order.total ?? 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function resolveSupplierNameSafe(order: any, suppliers: Supplier[] = []): string {
  if (!order) return 'Proveedor por Definir';
  try {
    const matched = suppliers.find(s => s.id === order.supplierId);
    if (matched?.name) return matched.name;
    return getHumanizedPurchaseOrderSupplier(order, suppliers);
  } catch (err) {
    console.error('[HistoricoOrdenesCompra] Error resolviendo proveedor:', order, err);
    return 'Proveedor por Definir';
  }
}

export default function HistoricoOrdenesCompra({
  onNavigateSection,
  onNavigateToReceiptWithOrder
}: HistoricoOrdenesCompraProps) {
  const navigate = useNavigate();

  // Live queries from Dexie con manejo seguro de estado indefinido (loading)
  const rawOrders = useLiveQuery(
    () => db.purchaseOrders.toCollection().reverse().sortBy('createdAt')
  );
  const rawSuppliers = useLiveQuery(() => db.suppliers.toArray());
  const rawInventoryItems = useLiveQuery(() => db.inventoryItems.toArray());

  // Banderas de carga y listas normalizadas
  const isLoading = rawOrders === undefined;
  const orders: PurchaseOrder[] = useMemo(() => Array.isArray(rawOrders) ? rawOrders : [], [rawOrders]);
  const suppliers: Supplier[] = useMemo(() => Array.isArray(rawSuppliers) ? rawSuppliers : [], [rawSuppliers]);
  const inventoryItems = useMemo(() => Array.isArray(rawInventoryItems) ? rawInventoryItems : [], [rawInventoryItems]);

  // Active filters state
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal detail view state
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null);
  const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState<boolean>(false);

  // Supplier options for CustomSelect [US-09D]
  const supplierSelectOptions = useMemo(() => [
    { value: 'ALL', label: '-- Todos los Proveedores --' },
    { value: 'POR DEFINIR', label: 'Proveedor por Definir' },
    ...suppliers.map(s => ({ value: s.id, label: s.name || `Proveedor (${s.id})` }))
  ], [suppliers]);

  // Compute counts for active badges
  const draftOrdersCount = useMemo(() => {
    try {
      return orders.filter(o => o && (o.status === 'DRAFT' || o.status === 'ORDERED')).length;
    } catch (err) {
      console.error('[HistoricoOrdenesCompra] Error calculando draftOrdersCount:', err);
      return 0;
    }
  }, [orders]);

  // Critical stock count for nav badge
  const criticalStockCount = useMemo(() => {
    try {
      return inventoryItems.filter(i => {
        if (!i || i.inventoryType === 'ASSET') return false;
        const physical = i.currentStock ?? i.realPhysicalStock ?? 0;
        const reserved = i.reservedStock ?? 0;
        const available = Math.max(0, physical - reserved);
        const min = i.minStock ?? i.stockMinLimit ?? 10;
        return available <= min;
      }).length;
    } catch (err) {
      console.error('[HistoricoOrdenesCompra] Error calculando criticalStockCount:', err);
      return 0;
    }
  }, [inventoryItems]);

  // Filtered orders list blindado con try/catch descriptivo
  const filteredOrders = useMemo(() => {
    try {
      return orders.filter(order => {
        if (!order) return false;

        // 1. Filter by status
        if (selectedStatus !== 'ALL' && order.status !== selectedStatus) {
          return false;
        }

        // 2. Filter by supplier
        if (selectedSupplierId !== 'ALL') {
          if (selectedSupplierId === 'POR DEFINIR') {
            if (order.supplierId && order.supplierId !== 'POR DEFINIR') return false;
          } else if (order.supplierId !== selectedSupplierId) {
            return false;
          }
        }

        // 3. Filter by date range (createdAt)
        if (startDate || endDate) {
          try {
            const orderDateStr = order.createdAt
              ? (typeof order.createdAt === 'string' ? order.createdAt.split('T')[0] : new Date(order.createdAt).toISOString().split('T')[0])
              : '';
            if (startDate && orderDateStr < startDate) {
              return false;
            }
            if (endDate && orderDateStr > endDate) {
              return false;
            }
          } catch {
            // Si la fecha está rota pero hay filtro de fecha, excluir orden
            return false;
          }
        }

        // 4. Text search by supplier name, invoice, notes or contained items
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const supplierName = resolveSupplierNameSafe(order, suppliers).toLowerCase();
          const invoiceNum = String(order.invoiceNumber || '').toLowerCase();
          const notes = String(order.notes || '').toLowerCase();
          const itemNamesMatch = (order.items || []).some(
            it => it && String(it.name || '').toLowerCase().includes(query)
          );

          const matches = supplierName.includes(query) ||
            invoiceNum.includes(query) ||
            notes.includes(query) ||
            itemNamesMatch;

          if (!matches) return false;
        }

        return true;
      });
    } catch (err) {
      console.error('[HistoricoOrdenesCompra] Error crítico filtrando órdenes de compra:', err);
      return [];
    }
  }, [orders, selectedStatus, selectedSupplierId, startDate, endDate, searchQuery, suppliers]);

  // KPI Metrics Calculation con blindaje
  const kpiMetrics = useMemo(() => {
    try {
      const totalCount = orders.length;
      const receivedCount = orders.filter(o => o?.status === 'RECEIVED').length;
      const draftCount = orders.filter(o => o?.status === 'DRAFT').length;
      const orderedCount = orders.filter(o => o?.status === 'ORDERED').length;
      const cancelledCount = orders.filter(o => o?.status === 'CANCELLED').length;

      const totalSpent = orders
        .filter(o => o?.status === 'RECEIVED')
        .reduce((sum, o) => sum + resolveTotalAmount(o), 0);

      const pendingEstimates = orders
        .filter(o => o?.status === 'DRAFT' || o?.status === 'ORDERED')
        .reduce((sum, o) => sum + resolveTotalAmount(o), 0);

      return {
        totalCount,
        receivedCount,
        draftCount,
        orderedCount,
        cancelledCount,
        totalSpent,
        pendingEstimates
      };
    } catch (err) {
      console.error('[HistoricoOrdenesCompra] Error calculando métricas KPI:', err);
      return {
        totalCount: 0,
        receivedCount: 0,
        draftCount: 0,
        orderedCount: 0,
        cancelledCount: 0,
        totalSpent: 0,
        pendingEstimates: 0
      };
    }
  }, [orders]);

  // Navigate to Compras with direct preload
  const handleReceiveOrderAction = (order: PurchaseOrder) => {
    if (!order) return;
    if (order.status === 'CANCELLED') {
      toast.error('Esta orden se encuentra cancelada.');
      return;
    }
    if (order.status === 'RECEIVED') {
      toast.error('Esta orden ya fue recibida en el inventario.');
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({ orderId: order.id }, '', `/inventario/compras?orderId=${order.id}`);
      } catch (err) {
        console.warn('[Navigation] Could not update URL state:', err);
      }
    }

    if (onNavigateToReceiptWithOrder) {
      onNavigateToReceiptWithOrder(order);
    } else if (onNavigateSection) {
      onNavigateSection('INVENTORY_RECEIPTS');
    } else {
      navigate(`/inventario/compras?orderId=${order.id}`, { state: { orderId: order.id } });
    }
  };

  const handleCancelOrderDirect = async (order: PurchaseOrder) => {
    if (!order) return;
    const supplierName = resolveSupplierNameSafe(order, suppliers);
    if (window.confirm(`¿Está seguro de cancelar la orden de compra de "${supplierName}"?`)) {
      try {
        await cancelPurchaseOrder(order.id, 'Cancelada por el administrador desde el historial');
        toast.success('Orden de compra cancelada exitosamente.', { icon: '🛑' });
      } catch (err: any) {
        toast.error(err.message || 'Error al cancelar la orden.');
      }
    }
  };

  const handleResetFilters = () => {
    setSelectedStatus('ALL');
    setSelectedSupplierId('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  const statusPills = [
    { id: 'ALL', label: 'Todas', count: kpiMetrics.totalCount },
    { id: 'DRAFT', label: 'Borrador', count: kpiMetrics.draftCount, color: 'text-amber-500' },
    { id: 'ORDERED', label: 'Pedidas', count: kpiMetrics.orderedCount, color: 'text-blue-500' },
    { id: 'RECEIVED', label: 'Recibidas', count: kpiMetrics.receivedCount, color: 'text-emerald-500' },
    { id: 'CANCELLED', label: 'Canceladas', count: kpiMetrics.cancelledCount, color: 'text-red-500' }
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1 font-body text-content">

      {/* Subnavigation Bar entre Módulos de Compras [US-09C] */}
      <PurchaseNavHeader
        activeSection="PURCHASE_ORDERS_HISTORY"
        onNavigateSection={onNavigateSection}
        draftCount={draftOrdersCount}
        criticalAlertCount={criticalStockCount}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl md:text-3xl font-headline font-black text-content tracking-tight">
              Histórico de Órdenes de Compra
            </h2>

          </div>

        </div>

        {/* Quick Actions: Manual Purchase Order & Go to Receipts [US-09D] */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsManualOrderModalOpen(true)}
            className="px-4 py-2.5 bg-action text-action-text font-black rounded-full text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-[0.97] transition-all cursor-pointer"
            title="Crear una orden de compra manual en borrador o confirmada"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            <span>Orden de Compra (Manual)</span>
          </button>


        </div>
      </div>

      {/* Skeleton Loading State */}
      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(idx => (
              <div key={idx} className="h-24 bg-surface rounded-lg border border-line p-4 space-y-2">
                <div className="h-3 w-24 bg-line rounded"></div>
                <div className="h-7 w-16 bg-line rounded"></div>
              </div>
            ))}
          </div>
          <div className="h-32 bg-surface rounded-lg border border-line p-5"></div>
          <div className="h-64 bg-surface rounded-lg border border-line p-5"></div>
        </div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-line rounded-lg p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Total Órdenes Históricas
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono font-black tabular-nums text-content">
                  {kpiMetrics.totalCount}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">registros</span>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-lg p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
                Órdenes Recibidas
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  {kpiMetrics.receivedCount}
                </span>
                <span className="text-[10px] text-emerald-600/70 font-semibold">asentadas</span>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-lg p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 block mb-1">
                Pendientes / Borradores
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono font-black tabular-nums text-amber-500">
                  {kpiMetrics.draftCount + kpiMetrics.orderedCount}
                </span>
                <span className="text-[10px] text-amber-500/70 font-semibold">por recibir</span>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-lg p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent-purple)] block mb-1">
                Inversión Recibida
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-mono font-black tabular-nums text-[var(--accent-purple)] truncate">
                  {formatCurrency(kpiMetrics.totalSpent)}
                </span>
              </div>
            </div>
          </div>

          {/* Reactive Filter Panel (Tokens: cards rounded-lg, inputs rounded-sm) - relative z-30 para selectores flotantes */}
          <section className="bg-surface rounded-lg border border-line shadow-sm p-5 space-y-4 relative z-30">

            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-2 shrink-0">
                Estado:
              </span>
              {statusPills.map(pill => {
                const isSelected = selectedStatus === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setSelectedStatus(pill.id)}
                    className={`py-1 px-3 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 border btn-press ${isSelected
                      ? 'bg-action text-action-text border-line shadow-sm font-black'
                      : 'bg-raised/40 text-content-secondary hover:text-content hover:bg-raised border-line'
                      }`}
                  >
                    <span>{pill.label}</span>
                    <span className={`ml-1.5 text-[10px] font-mono tabular-nums ${pill.color || 'text-slate-400'}`}>
                      ({pill.count})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Inputs Filters Grid (12 Columnas uniforme, estilo Añadir Insumo Manual) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end pt-3 border-t border-line">

              {/* Supplier Selector (lg:col-span-4) */}
              <div className="md:col-span-2 lg:col-span-4">
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Proveedor">
                  Proveedor
                </label>
                <CustomSelect
                  value={selectedSupplierId}
                  onChange={setSelectedSupplierId}
                  options={supplierSelectOptions}
                  placeholder="Filtrar proveedor..."
                  searchPlaceholder="Buscar proveedor..."
                  className="w-full h-10 text-xs px-2.5"
                />
              </div>

              {/* Start Date (lg:col-span-2) */}
              <div className="md:col-span-1 lg:col-span-2">
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Fecha Desde">
                  Fecha Desde
                </label>
                <CustomDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="dd/mm/aaaa"
                  className="h-10 text-xs px-2.5"
                />
              </div>

              {/* End Date (lg:col-span-2) */}
              <div className="md:col-span-1 lg:col-span-2">
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Fecha Hasta">
                  Fecha Hasta
                </label>
                <CustomDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="dd/mm/aaaa"
                  className="h-10 text-xs px-2.5"
                />
              </div>

              {/* Insumo / Factura text search (lg:col-span-4) */}
              <div className="md:col-span-2 lg:col-span-4">
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Buscar Insumo / Factura">
                  Buscar Insumo / Factura
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nombre de insumo o fac..."
                    className="w-full h-10 bg-inset border border-line rounded-sm pl-8 pr-7 text-xs font-semibold text-content placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-action/25 focus:border-action transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-content text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Clear Filters indicator */}
            {(selectedStatus !== 'ALL' || selectedSupplierId !== 'ALL' || startDate || endDate || searchQuery) && (
              <div className="flex items-center justify-between text-xs pt-1 text-slate-400">
                <span>
                  Mostrando <strong>{filteredOrders.length}</strong> de {orders.length} órdenes filtradas
                </span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] font-bold text-red-500 hover:underline cursor-pointer"
                >
                  Limpiar todos los filtros
                </button>
              </div>
            )}
          </section>

          {/* Main Table or Empty State Container */}
          <section className="bg-surface rounded-lg border border-line shadow-sm overflow-hidden">
            {orders.length === 0 ? (
              /* ESTADO VACÍO INFORMATIVO GLOBAL (0 Órdenes en la base de datos) */
              <div className="py-16 px-6 text-center max-w-md mx-auto space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-slate-500/10 border border-line mx-auto flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-3xl">inventory_2</span>
                </div>
                <div>
                  <h3 className="text-base font-headline font-black text-content tracking-tight">
                    No hay órdenes de compra registradas
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    Las órdenes generadas automáticamente desde Alertas de Stock o creadas en compras aparecerán aquí.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateSection ? onNavigateSection('INVENTORY_ALERTS') : navigate('/inventario/alertas')}
                    className="py-2 px-4 rounded-full text-xs font-bold bg-raised text-content hover:bg-slate-200 dark:hover:bg-line border border-line transition-all cursor-pointer"
                  >
                    Ver Alertas de Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateSection ? onNavigateSection('INVENTORY_RECEIPTS') : navigate('/inventario/compras')}
                    className="py-2 px-4 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-sm"
                  >
                    + Registrar Entrada
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-raised/60 border-b border-line text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Proveedor</th>
                      <th className="py-3 px-4 text-center">Total Ítems</th>
                      <th className="py-3 px-4 text-right">Importe Estimado/Facturado</th>
                      <th className="py-3 px-4 text-center">Factura Vinculada</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredOrders.map((order, idx) => {
                      const supplierName = resolveSupplierNameSafe(order, suppliers);
                      const totalAmount = resolveTotalAmount(order);
                      const itemsCount = order.items?.length || order.itemsCount || 0;
                      const isCancellable = order.status === 'DRAFT' || order.status === 'ORDERED';
                      const rowKey = order.id || `order-row-${idx}`;

                      return (
                        <tr key={rowKey} className="hover:bg-raised/20 transition-colors">

                          {/* Fecha */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-content">
                              {formatDateSafe(order.createdAt)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {formatTimeSafe(order.createdAt)}
                            </div>
                          </td>

                          {/* Proveedor */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-content max-w-[200px] truncate" title={supplierName}>
                              {supplierName}
                            </div>
                            {order.items && order.items.length > 0 && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                {order.items.slice(0, 2).map(i => i?.name || 'Ítem').join(', ')}
                                {order.items.length > 2 && '...'}
                              </div>
                            )}
                          </td>

                          {/* Total Ítems */}
                          <td className="py-3 px-4 text-center font-mono tabular-nums font-bold text-content whitespace-nowrap">
                            {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'}
                          </td>

                          {/* Importe */}
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-black text-sm text-[var(--accent-purple)] whitespace-nowrap">
                            {formatCurrency(totalAmount)}
                          </td>

                          {/* Factura Vinculada */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {order.invoiceNumber ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-500/10 text-content border border-line">
                                #{order.invoiceNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Estado con Badge Semántico */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {order.status === 'RECEIVED' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Recibida
                              </span>
                            )}
                            {order.status === 'CANCELLED' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Cancelada
                              </span>
                            )}
                            {order.status === 'ORDERED' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                Pedida
                              </span>
                            )}
                            {order.status === 'DRAFT' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                Borrador
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingOrder(order)}
                                className="py-1 px-3 bg-raised/50 hover:bg-raised text-content rounded-full text-[11px] font-bold border border-line transition-all cursor-pointer btn-press"
                              >
                                Ver Detalle
                              </button>

                              {isCancellable && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelOrderDirect(order)}
                                  className="py-1 px-3 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-full text-[11px] font-bold border border-rose-500/20 transition-all cursor-pointer btn-press"
                                  title="Cancelar orden de compra pendiente"
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredOrders.length === 0 && orders.length > 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <span className="material-symbols-outlined text-3xl mb-1 text-slate-300 dark:text-slate-600 block">
                            filter_list_off
                          </span>
                          <p className="font-semibold text-xs text-content">
                            Sin resultados para los filtros actuales
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            No se encontraron órdenes que coincidan con los criterios seleccionados.
                          </p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="mt-3 py-1.5 px-4 rounded-full text-xs font-bold bg-raised text-[var(--accent-purple)] hover:underline border border-line cursor-pointer"
                          >
                            Restablecer filtros
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Detail and Cancellation Modal */}
      <PurchaseOrderDetailModal
        order={viewingOrder}
        isOpen={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        suppliers={suppliers}
        onReceiveOrder={handleReceiveOrderAction}
        onOrderCancelled={(_orderId) => {
          setViewingOrder(null);
        }}
      />

      {/* Manual Purchase Order Modal */}
      <ManualPurchaseOrderModal
        isOpen={isManualOrderModalOpen}
        onClose={() => setIsManualOrderModalOpen(false)}
        suppliers={suppliers}
        inventoryItems={inventoryItems}
        onNavigateSection={onNavigateSection}
      />

    </div>
  );
}
