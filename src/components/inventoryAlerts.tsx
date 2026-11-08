import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import type { InventoryItem, Recipe, PurchaseOrder } from '../types';
import { getAvailableStock } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';
import { useProductionZones } from '../hooks/useCatalogs';
import {
  getCriticalStockAlerts,
  generateSuggestedPurchaseOrders,
  deletePurchaseOrderDraft,
  type CriticalStockAlert
} from '../services/purchaseOrderService';
import {
  formatPurchaseOrderLabel,
  getHumanizedPurchaseOrderSupplier
} from '../utils/purchaseOrderUtils';
import PurchaseNavHeader from './inventory/PurchaseNavHeader';
import ManualPurchaseOrderModal from './inventory/ManualPurchaseOrderModal';

interface InventoryAlertsProps {
  initialFilter?: {
    level?: 'Crítico' | 'Bajo' | 'ALL';
    type?: 'Stock' | 'Vencimiento' | 'Mantenimiento' | 'ALL';
  } | null;
  onClearFilter?: () => void;
  onNavigateToPurchaseOrder?: (draft: { supplierId?: string; items?: any[]; purchaseOrderId?: string }) => void;
  onNavigateSection?: (section: 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY') => void;
}

interface AlertEntry {
  id: string; // unique key e.g., 'stock-ins-01'
  sourceId?: string;
  name: string;
  type: 'Stock' | 'Vencimiento' | 'Mantenimiento';
  level: 'Crítico' | 'Bajo';
  priority: 1 | 2; // 1: Urgente / Agotado (availableStock <= 0), 2: Advertencia / Mínimo (availableStock <= minStock)
  priorityLabel: string;
  zone: 'Cocina' | 'Bar' | 'General';
  detail: string;
  qtyNeeded?: number;
  availableStock?: number;
  physicalStock?: number;
  reservedStock?: number;
  minStock?: number;
  maxStock?: number;
  unit?: string;
  cost?: number;
  estimatedCost?: number;
  supplierId?: string;
  supplierName?: string;
}

const alertLevelOptions = [
  { value: 'ALL', label: 'Todos los Niveles' },
  { value: 'Crítico', label: 'Prioridad 1 · Urgente (Agotado)' },
  { value: 'Bajo', label: 'Prioridad 2 · Advertencia (Bajo Stock)' },
];

const alertTypeOptions = [
  { value: 'ALL', label: 'Todos los Tipos' },
  { value: 'Stock', label: 'Stock Crítico y Mínimo' },
  { value: 'Vencimiento', label: 'Vencimientos HACCP' },
  { value: 'Mantenimiento', label: 'Mantenimiento de Activos' },
];

export default function InventoryAlerts({
  initialFilter,
  onClearFilter,
  onNavigateToPurchaseOrder,
  onNavigateSection
}: InventoryAlertsProps) {
  // Query inventory, assets, settings, suppliers, and draft orders reactively
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const fixedAssets = useLiveQuery(() => db.fixedAssets.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const productionZones = useProductionZones();

  // Reactive draft purchase orders stored in Dexie
  const savedDraftOrders = useLiveQuery(
    () => db.purchaseOrders.where('status').equals('DRAFT').reverse().sortBy('createdAt')
  ) || [];

  const alertZoneOptions = useMemo(() => [
    { value: 'ALL', label: 'Todas las Zonas' },
    ...productionZones.map(z => ({ value: z, label: z }))
  ], [productionZones]);

  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const globalMinStock = systemSettings['min_stock_alert_threshold'] !== undefined
    ? Number(systemSettings['min_stock_alert_threshold'])
    : 10;

  // Filters State
  const [selectedLevel, setSelectedLevel] = useState<'ALL' | 'Crítico' | 'Bajo'>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'Stock' | 'Vencimiento' | 'Mantenimiento'>('ALL');
  const [selectedZone, setSelectedZone] = useState<'ALL' | 'Cocina' | 'Bar' | 'General'>('ALL');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  // Manual Purchase Order Modal State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Purchase Order Generation Modal State
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [viewingDraftOrder, setViewingDraftOrder] = useState<PurchaseOrder | null>(null);

  // Sync with initial filters passed from Dashboard
  useEffect(() => {
    if (initialFilter) {
      if (initialFilter.level && initialFilter.level !== 'ALL') setSelectedLevel(initialFilter.level);
      if (initialFilter.type && initialFilter.type !== 'ALL') setSelectedType(initialFilter.type);
      setIsFiltersExpanded(true);
    }
    return () => {
      if (onClearFilter) onClearFilter();
    };
  }, [initialFilter, onClearFilter]);

  // Consolidate alerts according to business rules & strict priority sorting
  const consolidatedAlerts = useMemo(() => {
    const alerts: AlertEntry[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Stock alerts computed via purchaseOrderService (EGM Invariant: availableStock = physicalStock - stagedStock)
    const stockAlerts = getCriticalStockAlerts(inventoryItems, globalMinStock, suppliers);

    stockAlerts.forEach(alert => {
      alerts.push({
        id: alert.id,
        sourceId: alert.itemId,
        name: alert.name,
        type: 'Stock',
        level: alert.level,
        priority: alert.priority,
        priorityLabel: alert.priorityLabel,
        zone: alert.zone,
        detail: alert.detail,
        qtyNeeded: alert.suggestedQuantity,
        availableStock: alert.availableStock,
        physicalStock: alert.physicalStock,
        reservedStock: alert.reservedStock,
        minStock: alert.minStock,
        maxStock: alert.maxStock,
        unit: alert.countUnit,
        cost: alert.purchaseCost,
        estimatedCost: alert.estimatedCost,
        supplierId: alert.supplierId,
        supplierName: alert.supplierName
      });
    });

    // 2. HACCP expiration alerts (derivadas dinámicamente de inventoryItems reales en Dexie)
    inventoryItems.forEach(item => {
      const expDateStr = item.fechaVencimiento ||
        (Array.isArray(item.sucursalStock) ? item.sucursalStock.find(s => s.fechaVencimiento)?.fechaVencimiento : undefined);

      if (expDateStr) {
        const expDate = new Date(expDateStr);
        if (!isNaN(expDate.getTime())) {
          const diffTime = expDate.getTime() - new Date(todayStr).getTime();
          const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Alerta preventiva: insumos vencidos (daysLeft <= 0) o próximos a vencer en 7 días
          if (daysLeft <= 7) {
            const isUrgent = daysLeft <= 2;
            const level: 'Crítico' | 'Bajo' = isUrgent ? 'Crítico' : 'Bajo';
            const priority: 1 | 2 = isUrgent ? 1 : 2;

            let zone: 'Cocina' | 'Bar' | 'General' = 'Cocina';
            if (item.operationZone === 'Bar' || item.operationZone === 'Barra' || item.category === 'Licores') {
              zone = 'Bar';
            }

            const currentStockVal = item.availableStock ?? item.realPhysicalStock ?? item.currentStock ?? 0;
            const statusLabel = daysLeft <= 0
              ? `¡Vencido hace ${Math.abs(daysLeft)} día(s)!`
              : `Vence en ${daysLeft} día(s)`;

            alerts.push({
              id: `expiry-${item.id}`,
              sourceId: item.id,
              name: item.name,
              type: 'Vencimiento',
              level,
              priority,
              priorityLabel: isUrgent ? 'Prioridad 1 · Vencimiento Inminente' : 'Prioridad 2 · Vencimiento Preventivo',
              zone,
              detail: `${statusLabel} (${expDateStr}) | Existencia: ${currentStockVal} ${item.countUnit || 'und'}`,
              qtyNeeded: Math.max(1, (item.stockMinLimit ?? globalMinStock) * 2),
              availableStock: currentStockVal,
              physicalStock: item.realPhysicalStock ?? currentStockVal,
              reservedStock: item.reservedStock ?? 0,
              minStock: item.stockMinLimit ?? globalMinStock,
              unit: item.countUnit || 'und',
              cost: item.purchaseCost || item.averagePrice || 0,
              supplierId: item.supplierId || 'POR DEFINIR'
            });
          }
        }
      }
    });

    // 3. Asset Maintenance alerts
    fixedAssets.forEach(asset => {
      if (asset.nextMaintenanceDate && asset.nextMaintenanceDate <= todayStr) {
        const isPastDue = asset.nextMaintenanceDate < todayStr;
        const level: 'Crítico' | 'Bajo' = (asset.status === 'Requiere Revisión Urgentemente' || isPastDue) ? 'Crítico' : 'Bajo';
        const priority: 1 | 2 = level === 'Crítico' ? 1 : 2;

        let zone: 'Cocina' | 'Bar' | 'General' = 'General';
        if (asset.location === 'Cocina') zone = 'Cocina';
        else if (asset.location === 'Barra' || asset.location === 'Bar') zone = 'Bar';

        alerts.push({
          id: `maint-${asset.id}`,
          sourceId: asset.id,
          name: asset.name,
          type: 'Mantenimiento',
          level,
          priority,
          priorityLabel: level === 'Crítico' ? 'Prioridad 1 · Falla Crítica' : 'Prioridad 2 · Mantenimiento Preventivo',
          zone,
          detail: `Mantenimiento programado (${asset.nextMaintenanceDate}) | Estado: ${asset.status}`
        });
      }
    });

    // CRITERIO DE ACEPTACIÓN 1:
    // Prioridad 1 (Rojo / Agotado) estrictamente en la parte superior, Prioridad 2 (Ámbar / Mínimo) a continuación.
    alerts.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.name.localeCompare(b.name);
    });

    return alerts;
  }, [inventoryItems, fixedAssets, suppliers, globalMinStock]);

  // Apply visual filters
  const filteredAlerts = useMemo(() => {
    return consolidatedAlerts.filter(alert => {
      const matchesLevel = selectedLevel === 'ALL' || alert.level === selectedLevel;
      const matchesType = selectedType === 'ALL' || alert.type === selectedType;
      const matchesZone = selectedZone === 'ALL' || alert.zone === selectedZone;
      return matchesLevel && matchesType && matchesZone;
    });
  }, [consolidatedAlerts, selectedLevel, selectedType, selectedZone]);

  const handleResetFilters = () => {
    setSelectedLevel('ALL');
    setSelectedType('ALL');
    setSelectedZone('ALL');
    if (onClearFilter) onClearFilter();
  };

  // Filter stock alerts eligible for purchase
  const purchasableAlerts = useMemo(() => {
    return filteredAlerts.filter(a => a.type === 'Stock');
  }, [filteredAlerts]);

  /**
   * Generación de órdenes de compra sugeridas agrupadas por proveedor.
   * Calcula suggestedQuantity = Math.max(1, (item.maxStock || item.minStock * 2) - item.availableStock)
   * Agrupa y persiste en Dexie en 'purchaseOrders' por cada proveedor detectado.
   * Asigna 'POR DEFINIR' si un insumo no tiene supplierId.
   */
  const handleGeneratePurchaseOrdersAction = async () => {
    const itemsToOrder = purchasableAlerts;

    if (itemsToOrder.length === 0) {
      toast.error('No hay insumos con stock agotado o mínimo para reabastecer.');
      return;
    }

    try {
      setIsGeneratingOrders(true);

      // Convert alerts to CriticalStockAlert structure for the service
      const criticalPayload: CriticalStockAlert[] = itemsToOrder.map(alert => ({
        id: alert.id,
        itemId: alert.sourceId || alert.id.replace('stock-', ''),
        name: alert.name,
        category: 'Insumos',
        countUnit: alert.unit || 'und',
        physicalStock: alert.physicalStock ?? 0,
        reservedStock: alert.reservedStock ?? 0,
        availableStock: alert.availableStock ?? 0,
        minStock: alert.minStock ?? globalMinStock,
        maxStock: alert.maxStock ?? (alert.minStock ? alert.minStock * 2 : 20),
        priority: alert.priority,
        level: alert.level,
        priorityLabel: alert.priorityLabel,
        zone: alert.zone,
        detail: alert.detail,
        suggestedQuantity: alert.qtyNeeded || 1,
        purchaseCost: alert.cost || 0,
        estimatedCost: alert.estimatedCost || ((alert.qtyNeeded || 1) * (alert.cost || 0)),
        supplierId: alert.supplierId || 'POR DEFINIR',
        supplierName: alert.supplierName || 'POR DEFINIR'
      }));

      const generatedDrafts = await generateSuggestedPurchaseOrders(criticalPayload, suppliers);

      toast.success(
        `¡Se generaron ${generatedDrafts.length} órdenes de compra en borrador agrupadas por proveedor!`,
        { duration: 5000, icon: '📦' }
      );

      setIsDraftModalOpen(true);
      if (generatedDrafts.length > 0) {
        setViewingDraftOrder(generatedDrafts[0]);
      }
    } catch (error) {
      console.error('Error al generar órdenes de compra sugeridas:', error);
      toast.error('Error al persistir las órdenes de compra en Dexie.');
    } finally {
      setIsGeneratingOrders(false);
    }
  };

  /**
   * [US-09B] Navegación fluida y recepción directa de borrador hacia Compras
   */
  const handleReceiveOrViewOrder = (order: PurchaseOrder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!order || !order.items || order.items.length === 0) {
      toast.error('La orden de compra no contiene ítems.');
      return;
    }

    // Navegación con URL query param y state hacia la vista de compras
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState({ orderId: order.id }, '', `/inventario/compras?orderId=${order.id}`);
      } catch (err) {
        console.warn('[Navigation] Could not update URL state:', err);
      }
    }

    if (onNavigateToPurchaseOrder) {
      onNavigateToPurchaseOrder({
        supplierId: order.supplierId === 'POR DEFINIR' ? '' : order.supplierId,
        items: order.items.map(item => ({
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          cost: item.unitCost,
          historicalCost: item.unitCost,
          unit: item.unit
        })),
        purchaseOrderId: order.id
      });
      setIsDraftModalOpen(false);
      toast.success(`Cargando orden en Compras...`, { icon: '⚡' });
    } else {
      toast.success('Borrador cargado.');
    }
  };

  const handleDeleteDraft = async (orderId: string) => {
    try {
      await deletePurchaseOrderDraft(orderId);
      toast.success('Borrador de orden de compra eliminado de Dexie.');
      if (viewingDraftOrder?.id === orderId) {
        setViewingDraftOrder(savedDraftOrders.find(o => o.id !== orderId) || null);
      }
    } catch (err) {
      toast.error('No fue posible eliminar el borrador.');
    }
  };

  // Quick stats
  const urgentCount = consolidatedAlerts.filter(a => a.priority === 1).length;
  const warningCount = consolidatedAlerts.filter(a => a.priority === 2).length;

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1 font-body text-content">

      {/* Subnavigation Bar entre Módulos de Compras [US-09C] */}
      <PurchaseNavHeader
        activeSection="INVENTORY_ALERTS"
        onNavigateSection={onNavigateSection}
        draftCount={savedDraftOrders.length}
        criticalAlertCount={urgentCount + warningCount}
      />

      {/* Header and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-line">
        <div>
          <h2 className="text-2xl md:text-3xl font-headline font-black text-content tracking-tight">
            Alertas de Stock
          </h2>
        </div>

        {/* Action Buttons: [ + Nueva Orden Manual ] & [ 📦 Generar Órdenes de Compra Sugeridas ] */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="w-full sm:w-auto bg-action text-action-text font-black py-3 px-5 rounded-full flex items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all text-xs uppercase tracking-wider cursor-pointer"
            title="Crear una orden de compra manual directa"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            <span>Orden de Compra (Manual)</span>
          </button>

          <button
            onClick={handleGeneratePurchaseOrdersAction}
            disabled={isGeneratingOrders || purchasableAlerts.length === 0}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 px-6 rounded-full flex items-center justify-center gap-2.5 shadow-md shadow-emerald-600/20 active:scale-[0.97] transition-all text-xs uppercase tracking-wider cursor-pointer"
            title="Genera órdenes de compra sugeridas agrupadas por proveedor"
          >
            <span className="text-base">📦</span>
            <span>{isGeneratingOrders ? 'Generando...' : 'Generar Órdenes de Compra Sugeridas'}</span>
          </button>
        </div>
      </div>

      {/* KPI Diagnostic Cards (Tokens: cards a 16px rounded-lg) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-line rounded-lg p-4 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
            Total Alertas Activas
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-black tabular-nums text-content">
              {consolidatedAlerts.length}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">recursos</span>
          </div>
        </div>

        <div className="bg-surface border border-rose-500/30 rounded-lg p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500" />
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Prioridad 1 · Agotado
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-black tabular-nums text-rose-500">
              {urgentCount}
            </span>
            <span className="text-[10px] text-rose-400 font-semibold">desabastecimiento total</span>
          </div>
        </div>

        <div className="bg-surface border border-amber-500/30 rounded-lg p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-500" />
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Prioridad 2 · Bajo Stock
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-black tabular-nums text-amber-500">
              {warningCount}
            </span>
            <span className="text-[10px] text-amber-400 font-semibold">en o bajo mínimo</span>
          </div>
        </div>

        <div
          onClick={() => {
            if (savedDraftOrders.length > 0) {
              setViewingDraftOrder(savedDraftOrders[0]);
              setIsDraftModalOpen(true);
            }
          }}
          className={`bg-surface border border-line rounded-lg p-4 shadow-sm cursor-pointer transition-all hover:border-[var(--accent-purple)] flex flex-col justify-between ${savedDraftOrders.length > 0 ? 'bg-purple-500/[0.03]' : ''
            }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Borradores de Órdenes
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-mono font-black tabular-nums text-[var(--accent-purple)]">
                {savedDraftOrders.length}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">órdenes</span>
            </div>
            {savedDraftOrders.length > 0 && (
              <p className="text-[11px] font-semibold text-content-secondary truncate mt-1.5" title={formatPurchaseOrderLabel(savedDraftOrders[0], suppliers)}>
                Última: {formatPurchaseOrderLabel(savedDraftOrders[0], suppliers)}
              </p>
            )}
          </div>

          {/* Botón directo: [ ⚡ Recibir Pedido / Ver Borrador ] */}
          {savedDraftOrders.length > 0 && (
            <div className="mt-3 pt-2 border-t border-line flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={(e) => handleReceiveOrViewOrder(savedDraftOrders[0], e)}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-[0.97]"
                title="Recibir pedido y asentar al inventario en Compras"
              >
                <span>⚡</span>
                <span>Recibir Pedido / Ver Borrador</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Panel (Tokens: inputs a 8px rounded-sm, container rounded-lg) - relative z-30 para selectores flotantes */}
      <section className="bg-surface rounded-lg border border-line shadow-sm relative z-30">
        <div
          onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
          className="md:hidden flex items-center justify-between p-4 cursor-pointer bg-slate-50/50 dark:bg-raised/20 border-b border-line"
        >
          <span className="text-xs font-black text-content uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">filter_alt</span>
            Filtros y Segmentación
          </span>
          <span className="material-symbols-outlined text-sm">
            {isFiltersExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </div>

        <div className={`p-5 space-y-4 md:space-y-0 md:grid md:grid-cols-4 md:gap-4 ${isFiltersExpanded ? 'block' : 'hidden md:grid'}`}>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Nivel de Prioridad
            </label>
            <CustomSelect
              value={selectedLevel}
              onChange={(val) => setSelectedLevel(val as any)}
              options={alertLevelOptions}
              className="w-full bg-slate-50 dark:bg-raised border border-line rounded-sm p-2.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-content"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Tipo de Alerta
            </label>
            <CustomSelect
              value={selectedType}
              onChange={(val) => setSelectedType(val as any)}
              options={alertTypeOptions}
              className="w-full bg-slate-50 dark:bg-raised border border-line rounded-sm p-2.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-content"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Zona Operativa
            </label>
            <CustomSelect
              value={selectedZone}
              onChange={(val) => setSelectedZone(val as any)}
              options={alertZoneOptions}
              className="w-full bg-slate-50 dark:bg-raised border border-line rounded-sm p-2.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-content"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full py-2.5 border border-line hover:bg-slate-50 dark:hover:bg-raised text-slate-500 hover:text-content font-bold rounded-sm text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">filter_alt_off</span>
              Limpiar Filtros
            </button>
          </div>
        </div>
      </section>

      {/* Main Console Table (Tokens: cards a 16px rounded-lg) */}
      <section className="bg-surface rounded-lg border border-line shadow-sm overflow-hidden">

        {/* Table Header Bar */}
        <div className="p-4 md:p-5 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/30 dark:bg-raised/10">
          <div>
            <h3 className="font-headline font-bold text-content text-base">
              Alertas Priorizadas ({filteredAlerts.length})
            </h3>

          </div>
        </div>

        {/* Data Table with Tabular Numbers & Strict WCAG Contrast */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50 dark:bg-raised/30 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-line">
              <tr>
                <th className="py-3.5 px-4">Insumo</th>
                <th className="py-3.5 px-4 text-center">Prioridad</th>
                <th className="py-3.5 px-4 text-center">Zona</th>
                <th className="py-3.5 px-4 text-right">Físico / Reservado</th>
                <th className="py-3.5 px-4 text-right">Disponible</th>
                <th className="py-3.5 px-4 text-right">Mín / Máx</th>
                <th className="py-3.5 px-4 text-right">Cant. Sugerida</th>
                <th className="py-3.5 px-4">Proveedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-xs">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-6 text-center text-slate-400 italic">
                    No se detectan alertas activas con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map(alert => {
                  const isPriority1 = alert.priority === 1;

                  return (
                    <tr
                      key={alert.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-raised/20 transition-colors ${isPriority1 ? 'bg-rose-500/[0.02]' : ''
                        }`}
                    >
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-content leading-tight">{alert.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{alert.id}</p>
                      </td>

                      {/* CRITERIO 1: Prioridad 1 (Rojo / Agotado) vs Prioridad 2 (Ámbar / Mínimo) */}
                      <td className="py-3.5 px-4 text-center">
                        {isPriority1 ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            Prioridad 1 · Agotado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Prioridad 2 · Bajo Stock
                          </span>
                        )}
                      </td>

                      {/* Zone */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-raised text-slate-600 dark:text-slate-300 border border-line">
                          {alert.zone}
                        </span>
                      </td>

                      {/* Physical & Staged (Kardex Breakdown) */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-content-secondary">
                        <span>{alert.physicalStock ?? '-'}</span>
                        <span className="text-[10px] text-slate-400"> / {alert.reservedStock ?? 0}</span>
                      </td>

                      {/* Invariante de Stock: Available Stock */}
                      <td className="py-3.5 px-4 text-right font-mono font-black tabular-nums">
                        <span className={isPriority1 ? 'text-rose-500' : 'text-amber-500'}>
                          {alert.availableStock !== undefined ? alert.availableStock.toFixed(1) : '-'}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1 uppercase">{alert.unit || ''}</span>
                      </td>

                      {/* Min / Max Stock Limits */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400 text-[11px]">
                        <span>{alert.minStock ?? '-'}</span>
                        <span> / </span>
                        <span>{alert.maxStock ?? '-'}</span>
                      </td>

                      {/* CRITERIO 2: suggestedQuantity = Math.max(1, (maxStock || minStock * 2) - availableStock) */}
                      <td className="py-3.5 px-4 text-right font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                        <span>+{alert.qtyNeeded ?? 1}</span>
                        <span className="text-[10px] text-slate-400 font-semibold ml-1 uppercase">{alert.unit || 'und'}</span>
                      </td>

                      {/* Supplier (or 'POR DEFINIR') */}
                      <td className="py-3.5 px-4">
                        {alert.supplierId === 'POR DEFINIR' || !alert.supplierId ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200/50 dark:bg-raised text-slate-500 dark:text-slate-400 border border-line">
                            POR DEFINIR
                          </span>
                        ) : (
                          <span className="font-semibold text-content text-[11px]">
                            {alert.supplierName || alert.supplierId}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal / Visualizador de Órdenes de Compra Sugeridas (Tokens: modal a 20px rounded-xl) */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-surface border border-line rounded-xl p-6 md:p-8 max-w-4xl w-full shadow-2xl text-left flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📦</span>
                <div>
                  <h3 className="font-headline font-black text-xl text-content">
                    Órdenes de Compra Sugeridas
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Generadas automáticamente agrupando insumos por proveedor con cantidades sugeridas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDraftModalOpen(false)}
                className="text-slate-400 hover:text-content cursor-pointer p-1 rounded-sm"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Supplier Tabs Selector */}
            {savedDraftOrders.length > 0 ? (
              <>
                <div className="pt-4 flex items-center gap-2 overflow-x-auto pb-2 border-b border-line">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">
                    Borradores ({savedDraftOrders.length}):
                  </span>
                  {savedDraftOrders.map(order => {
                    const isSelected = viewingDraftOrder?.id === order.id;
                    const isPorDefinir = order.supplierId === 'POR DEFINIR';

                    return (
                      <button
                        key={order.id}
                        onClick={() => setViewingDraftOrder(order)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-[0.98] ${isSelected
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-raised text-content hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                      >
                        <span>{isPorDefinir ? 'POR DEFINIR' : order.supplierName}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-300 dark:bg-slate-600'}`}>
                          {order.items.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active Draft Order Details */}
                {viewingDraftOrder && (
                  <div className="py-4 space-y-4 overflow-y-auto flex-1">

                    {/* Order Metadata Box */}
                    <div className="p-4 bg-slate-50/50 dark:bg-raised/20 rounded-lg border border-line flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase text-content">
                            Proveedor: {getHumanizedPurchaseOrderSupplier(viewingDraftOrder, suppliers)}
                          </span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            {viewingDraftOrder.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                          {formatPurchaseOrderLabel(viewingDraftOrder, suppliers)} · Creado: {new Date(viewingDraftOrder.createdAt).toLocaleDateString('es-CO')}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
                          Costo Estimado
                        </span>
                        <span className="text-xl font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                          ${viewingDraftOrder.totalEstimatedCost.toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-x-auto border border-line rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-raised/30 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-line">
                          <tr>
                            <th className="py-3 px-3">Insumo</th>
                            <th className="py-3 px-3 text-center">Prioridad</th>
                            <th className="py-3 px-3 text-right">Disponible</th>
                            <th className="py-3 px-3 text-right">Cant. Sugerida</th>
                            <th className="py-3 px-3 text-right">Costo Unit.</th>
                            <th className="py-3 px-3 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {viewingDraftOrder.items.map(item => {
                            const isUrgent = item.priority === 1;
                            return (
                              <tr
                                key={item.itemId}
                                className={`hover:bg-slate-50/50 dark:hover:bg-raised/10 ${isUrgent ? 'bg-rose-500/[0.03]' : ''
                                  }`}
                              >
                                <td className="py-3 px-3">
                                  <p className="font-bold text-content">{item.name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{item.itemId}</p>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {isUrgent ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/20">
                                      Agotado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20">
                                      Bajo Stock
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-content-secondary tabular-nums">
                                  {item.availableStock.toFixed(1)} {item.unit}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  +{item.quantity} <span className="text-[10px] text-slate-400 uppercase">{item.unit}</span>
                                </td>
                                <td className="py-3 px-3 text-right font-mono tabular-nums text-content-secondary">
                                  ${item.unitCost.toLocaleString('es-CO')}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-black tabular-nums text-content">
                                  ${item.estimatedCost.toLocaleString('es-CO')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Modal Footer Controls */}
                <div className="pt-4 border-t border-line flex flex-col sm:flex-row justify-between items-center gap-3">
                  {viewingDraftOrder && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(viewingDraftOrder.id)}
                      className="text-rose-500 hover:text-rose-400 font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Eliminar Este Borrador
                    </button>
                  )}

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDraftModalOpen(false)}
                      className="px-5 py-2.5 bg-slate-100 dark:bg-raised text-slate-500 dark:text-slate-300 font-bold rounded-sm text-xs uppercase tracking-wider cursor-pointer active:scale-[0.98]"
                    >
                      Cerrar
                    </button>
                    {viewingDraftOrder && (
                      <button
                        type="button"
                        onClick={() => handleReceiveOrViewOrder(viewingDraftOrder)}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-full text-xs uppercase tracking-wider cursor-pointer shadow-md shadow-emerald-600/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">shopping_cart_checkout</span>
                        Transferir a Recepción (Comprar)
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-slate-400 italic">
                No hay borradores de órdenes de compra guardados en este momento.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Creación Manual de Órdenes de Compra */}
      <ManualPurchaseOrderModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        suppliers={suppliers}
        inventoryItems={inventoryItems}
        onNavigateSection={onNavigateSection}
        onOrderCreated={(_order) => {
          onNavigateSection?.('PURCHASE_ORDERS_HISTORY');
        }}
      />
    </div>
  );
}

/**
 * Returns a set of recipe/dish IDs that are out of stock (depleted raw items).
 * Evaluates real-time available stock (physicalStock - stagedStock).
 * Used by OrderFlow and OrderTaking to disable buttons or show warnings for unavailable dishes.
 */
export function getOutofStockRecipeIds(recipes: Recipe[], inventoryItems: InventoryItem[]): Set<string> {
  const outOfStockRecipes = new Set<string>();
  const inventoryMap = new Map<string, InventoryItem>();
  inventoryItems.forEach(item => inventoryMap.set(item.id, item));

  // Recursive checker for recipe ingredients
  const isIngredientUnavailable = (ingredientId: string, quantityNeeded: number, type: 'item' | 'subrecipe'): boolean => {
    if (type === 'item') {
      const item = inventoryMap.get(ingredientId);
      if (!item) return true;
      const available = getAvailableStock(item);
      return available <= 0 || available < quantityNeeded;
    } else {
      const subRecipe = recipes.find(r => r.id === ingredientId);
      if (!subRecipe) return true;
      return subRecipe.ingredients.some(subIng =>
        isIngredientUnavailable(subIng.inventoryItemId, subIng.quantity * quantityNeeded, subIng.type)
      );
    }
  };

  recipes.forEach(recipe => {
    const isOut = recipe.ingredients.some(ing =>
      isIngredientUnavailable(ing.inventoryItemId, ing.quantity, ing.type)
    );
    if (isOut) {
      outOfStockRecipes.add(recipe.id);
    }
  });

  return outOfStockRecipes;
}
