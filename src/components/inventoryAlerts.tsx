import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import type { InventoryItem, Recipe } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

interface InventoryAlertsProps {
  initialFilter?: {
    level?: 'Crítico' | 'Bajo' | 'ALL';
    type?: 'Stock' | 'Vencimiento' | 'Mantenimiento' | 'ALL';
  } | null;
  onClearFilter?: () => void;
}

interface AlertEntry {
  id: string; // unique key e.g., 'stock-ins-01'
  sourceId?: string;
  name: string;
  type: 'Stock' | 'Vencimiento' | 'Mantenimiento';
  level: 'Crítico' | 'Bajo';
  zone: 'Cocina' | 'Bar' | 'General';
  detail: string;
  qtyNeeded?: number;
  unit?: string;
  cost?: number;
}

const alertLevelOptions = [
  { value: 'ALL', label: 'Todos los Niveles' },
  { value: 'Crítico', label: 'Crítico' },
  { value: 'Bajo', label: 'Bajo Stock' },
];

const alertTypeOptions = [
  { value: 'ALL', label: 'Todos los Tipos' },
  { value: 'Stock', label: 'Stock Mínimo' },
  { value: 'Vencimiento', label: 'Vencimiento' },
  { value: 'Mantenimiento', label: 'Mantenimiento' },
];

const alertZoneOptions = [
  { value: 'ALL', label: 'Todas las Zonas' },
  { value: 'Cocina', label: 'Cocina' },
  { value: 'Bar', label: 'Bar' },
  { value: 'General', label: 'General' },
];

export default function InventoryAlerts({ initialFilter, onClearFilter }: InventoryAlertsProps) {
  // Query inventory, assets, and settings reactively
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const fixedAssets = useLiveQuery(() => db.fixedAssets.toArray()) || [];
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

  // Static expiration alert items matching the HACCP requirements
  const expirationAlerts = [
    { name: 'Queso Burrata Fresco', daysLeft: 2, date: '11 Jun 2026', qty: '8 unidades', unit: 'unidades' },
    { name: 'Tomate Cherry', daysLeft: 4, date: '13 Jun 2026', qty: '5 Cajas', unit: 'Cajas' },
    { name: 'Solomillo de Ternera', daysLeft: 1, date: '10 Jun 2026', qty: '4.5 Kg', unit: 'Kg' }
  ];

  // Filters State
  const [selectedLevel, setSelectedLevel] = useState<'ALL' | 'Crítico' | 'Bajo'>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'Stock' | 'Vencimiento' | 'Mantenimiento'>('ALL');
  const [selectedZone, setSelectedZone] = useState<'ALL' | 'Cocina' | 'Bar' | 'General'>('ALL');
  
  // Mobile accordion state for filters
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  // Bulk actions selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Draft Purchase Order Modal State
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Sync with initial filters passed from Dashboard
  useEffect(() => {
    if (initialFilter) {
      if (initialFilter.level && initialFilter.level !== 'ALL') setSelectedLevel(initialFilter.level);
      if (initialFilter.type && initialFilter.type !== 'ALL') setSelectedType(initialFilter.type);
      setIsFiltersExpanded(true); // Auto expand if navigating from dashboard
    }
    return () => {
      // Clear parent filter state on unmount
      if (onClearFilter) onClearFilter();
    };
  }, [initialFilter, onClearFilter]);

  // Consolidate all alert sources into a single alert list
  const consolidatedAlerts = useMemo(() => {
    const alerts: AlertEntry[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Stock alerts (using globalIndexedDB threshold)
    inventoryItems.forEach(item => {
      const minLimit = item.stockMinLimit ?? globalMinStock;
      const isCritical = item.theoreticalStock <= minLimit;
      const isLow = item.theoreticalStock > minLimit && item.theoreticalStock <= minLimit * 1.5;

      // Map operational zone
      let zone: 'Cocina' | 'Bar' | 'General' = 'General';
      if (item.operationZone === 'Cocina') zone = 'Cocina';
      else if (item.operationZone === 'Bar' || item.operationZone === 'Barra' || item.category === 'Licores') zone = 'Bar';

      if (isCritical) {
        alerts.push({
          id: `stock-${item.id}`,
          sourceId: item.id,
          name: item.name,
          type: 'Stock',
          level: 'Crítico',
          zone,
          detail: `Existencia crítica: ${item.theoreticalStock} ${item.countUnit} / Mínimo: ${minLimit} ${item.countUnit}`,
          qtyNeeded: Math.max(0, (minLimit * 2) - item.theoreticalStock), // recommend ordering up to double min stock
          unit: item.countUnit,
          cost: item.purchaseCost
        });
      } else if (isLow) {
        alerts.push({
          id: `stock-${item.id}`,
          sourceId: item.id,
          name: item.name,
          type: 'Stock',
          level: 'Bajo',
          zone,
          detail: `Existencia baja: ${item.theoreticalStock} ${item.countUnit} / Mínimo: ${minLimit} ${item.countUnit}`,
          qtyNeeded: Math.max(0, (minLimit * 1.5) - item.theoreticalStock),
          unit: item.countUnit,
          cost: item.purchaseCost
        });
      }
    });

    // 2. Expiration alerts (preventative HACCP alerts)
    expirationAlerts.forEach((alert, idx) => {
      const level = alert.daysLeft <= 2 ? 'Crítico' : 'Bajo';
      // Attempt to match zone from db items by name
      const matchedItem = inventoryItems.find(i => i.name.toLowerCase() === alert.name.toLowerCase());
      let zone: 'Cocina' | 'Bar' | 'General' = 'Cocina';
      if (matchedItem) {
        if (matchedItem.operationZone === 'Bar' || matchedItem.operationZone === 'Barra' || matchedItem.category === 'Licores') zone = 'Bar';
      }

      alerts.push({
        id: `expiry-${idx}`,
        name: alert.name,
        type: 'Vencimiento',
        level,
        zone,
        detail: `Vencimiento preventivo el ${alert.date} (${alert.daysLeft} días restantes) | Cant: ${alert.qty}`,
        qtyNeeded: matchedItem ? Math.max(0, (matchedItem.stockMinLimit ?? globalMinStock) * 2) : 10,
        unit: alert.unit,
        cost: matchedItem ? matchedItem.purchaseCost : 25000
      });
    });

    // 3. Maintenance alerts (from fixedAssets)
    fixedAssets.forEach(asset => {
      if (asset.nextMaintenanceDate && asset.nextMaintenanceDate <= todayStr) {
        const isPastDue = asset.nextMaintenanceDate < todayStr;
        const level = (asset.status === 'Requiere Revisión Urgentemente' || isPastDue) ? 'Crítico' : 'Bajo';
        
        let zone: 'Cocina' | 'Bar' | 'General' = 'General';
        if (asset.location === 'Cocina') zone = 'Cocina';
        else if (asset.location === 'Barra' || asset.location === 'Bar') zone = 'Bar';

        alerts.push({
          id: `maint-${asset.id}`,
          sourceId: asset.id,
          name: asset.name,
          type: 'Mantenimiento',
          level,
          zone,
          detail: `Mantenimiento requerido (${asset.nextMaintenanceDate}) | Estado: ${asset.status}`
        });
      }
    });

    return alerts;
  }, [inventoryItems, fixedAssets, globalMinStock]);

  // Apply filters
  const filteredAlerts = useMemo(() => {
    return consolidatedAlerts.filter(alert => {
      const matchesLevel = selectedLevel === 'ALL' || alert.level === selectedLevel;
      const matchesType = selectedType === 'ALL' || alert.type === selectedType;
      const matchesZone = selectedZone === 'ALL' || alert.zone === selectedZone;
      return matchesLevel && matchesType && matchesZone;
    });
  }, [consolidatedAlerts, selectedLevel, selectedType, selectedZone]);

  // Handle individual selection toggling
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Handle select all currently filtered rows
  const handleSelectAllFiltered = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        filteredAlerts.forEach(alert => newSet.add(alert.id));
        return newSet;
      });
    } else {
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        filteredAlerts.forEach(alert => newSet.delete(alert.id));
        return newSet;
      });
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setSelectedLevel('ALL');
    setSelectedType('ALL');
    setSelectedZone('ALL');
    if (onClearFilter) onClearFilter();
  };

  // Items selected that can be purchased (excluding assets)
  const purchasableSelectedAlerts = useMemo(() => {
    return filteredAlerts.filter(alert => selectedIds.has(alert.id) && alert.type !== 'Mantenimiento');
  }, [filteredAlerts, selectedIds]);

  const totalEstimatedCost = useMemo(() => {
    return purchasableSelectedAlerts.reduce((sum, alert) => {
      const qty = alert.qtyNeeded || 0;
      const cost = alert.cost || 0;
      return sum + (qty * cost);
    }, 0);
  }, [purchasableSelectedAlerts]);

  // Simulate generating draft purchase order
  const handleGeneratePurchaseOrder = () => {
    if (purchasableSelectedAlerts.length === 0) {
      toast.error('Por favor selecciona al menos un insumo o producto con alerta para reordenar.');
      return;
    }
    setIsDraftModalOpen(true);
  };

  const confirmDraftOrder = () => {
    setIsDraftModalOpen(false);
    setSelectedIds(new Set()); // clear selections
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  return (
    <div className="p-8 space-y-8 transition-receitly overflow-y-auto flex-1 font-body text-slate-800 dark:text-slate-200">
      
      {/* Header and Toast Notification */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-headline font-black text-slate-900 dark:text-white flex items-center gap-2">
            Consola de Alertas de Stock
          </h2>
          <p className="text-slate-500 font-semibold text-sm">Panel de diagnóstico unificado para control de existencias, vencimientos HACCP y mantenimiento de activos.</p>
        </div>

        {showSuccessToast && (
          <div className="bg-emerald-500 text-white px-5 py-3 rounded-xl text-xs font-bold animate-pulse shadow-md z-30">
            ¡Orden de compra borrador generada y enviada a compras con éxito!
          </div>
        )}
      </div>

      {/* Responsive Accordion Filter Panel */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-[rgba(143,99,244,0.15)] shadow-sm overflow-hidden">
        {/* Mobile Accordion Header */}
        <div 
          onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
          className="md:hidden flex items-center justify-between p-5 cursor-pointer bg-slate-50/50 dark:bg-[var(--card-color)]/30 border-b border-slate-100 dark:border-slate-800/60"
        >
          <span className="text-xs font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">filter_alt</span>
            Filtros Avanzados
          </span>
          <span className="material-symbols-outlined">
            {isFiltersExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </div>

        {/* Filters Body */}
        <div className={`p-6 space-y-6 md:space-y-0 md:grid md:grid-cols-4 md:gap-6 ${isFiltersExpanded ? 'block' : 'hidden md:grid'}`}>
          {/* Level Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Nivel de Alerta</label>
            <CustomSelect
              value={selectedLevel}
              onChange={(val) => setSelectedLevel(val as any)}
              options={alertLevelOptions}
              className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white"
            />
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Tipo de Alerta</label>
            <CustomSelect
              value={selectedType}
              onChange={(val) => setSelectedType(val as any)}
              options={alertTypeOptions}
              className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white"
            />
          </div>

          {/* Zone Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Zona Operativa</label>
            <CustomSelect
              value={selectedZone}
              onChange={(val) => setSelectedZone(val as any)}
              options={alertZoneOptions}
              className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white"
            />
          </div>

          {/* Clean Filters button */}
          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full py-3.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">filter_alt_off</span>
              Limpiar Filtros
            </button>
          </div>
        </div>
      </section>

      {/* Main Console Grid */}
      <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-[rgba(143,99,244,0.15)] shadow-sm overflow-hidden">
        
        {/* Bulk Action Header Panel */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20 dark:bg-slate-900/50">
          <div>
            <h3 className="font-headline font-bold text-slate-900 dark:text-white text-base">
              Alertas Detectadas ({filteredAlerts.length})
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              {selectedIds.size} de {filteredAlerts.length} alertas seleccionadas
            </p>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 animate-fade-in">
              <span className="text-xs font-semibold text-slate-400">
                {purchasableSelectedAlerts.length} reabastecibles elegidos
              </span>
              <button
                onClick={handleGeneratePurchaseOrder}
                className="bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white font-black py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">shopping_cart</span>
                Generar Orden de Compra/Acción
              </button>
            </div>
          )}
        </div>

        {/* Diagnostic High-contrast Responsive Data Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-slate-50 dark:bg-[var(--card-color)]/40 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-4 px-6 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={filteredAlerts.length > 0 && filteredAlerts.every(a => selectedIds.has(a.id))}
                    onChange={handleSelectAllFiltered}
                    className="rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[rgba(143,99,244,0.15)] bg-transparent cursor-pointer"
                  />
                </th>
                <th className="py-4 px-4">Recurso / Item</th>
                <th className="py-4 px-4 text-center">Tipo Alerta</th>
                <th className="py-4 px-4 text-center">Nivel</th>
                <th className="py-4 px-4 text-center">Zona Operativa</th>
                <th className="py-4 px-6">Detalle de Diagnóstico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-6 text-center text-slate-400 italic">
                    No hay alertas activas que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map(alert => {
                  const isChecked = selectedIds.has(alert.id);
                  return (
                    <tr 
                      key={alert.id}
                    className={`hover:bg-slate-50/30 dark:hover:bg-slate-900/40 transition-colors ${
                      isChecked ? 'bg-[var(--accent-purple)]/5 dark:bg-[var(--accent-purple)]/10' : ''
                    }`}
                    >
                      <td className="py-4 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(alert.id)}
                          className="rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[rgba(143,99,244,0.15)] bg-transparent cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white leading-tight">{alert.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{alert.id}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          alert.type === 'Stock' ? 'bg-[var(--text-muted)]/15 text-[var(--text-muted)] border-[rgba(143,99,244,0.15)]' :
                          alert.type === 'Vencimiento' ? 'bg-purple-500/5 text-purple-500 border-purple-500/10' :
                          'bg-blue-500/5 text-blue-500 border-blue-500/10'
                        }`}>
                          <span className="material-symbols-outlined text-xs">
                            {alert.type === 'Stock' ? 'warning' : alert.type === 'Vencimiento' ? 'calendar_today' : 'engineering'}
                          </span>
                          {alert.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          alert.level === 'Crítico'
                            ? 'bg-rose-500/15 text-rose-500 border border-rose-500/10'
                            : 'bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[rgba(143,99,244,0.15)]'
                        }`}>
                          {alert.level}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-450 border border-slate-200/40 dark:border-slate-700/50">
                          {alert.zone}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-650 dark:text-slate-350 font-medium">
                        {alert.detail}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Draft Purchase Order Premium Modal */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-fade-in text-left">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-headline font-black text-xl text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--text-muted)]">description</span>
                  Borrador: Orden de Compra Sugerida
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Sugerencias de reposición basadas en el consumo operativo.</p>
              </div>
              <button
                onClick={() => setIsDraftModalOpen(false)}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="py-6 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-450 text-[10px] font-black uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                      <th className="py-3 px-3">Item</th>
                      <th className="py-3 px-3 text-right">Cant. Requerida</th>
                      <th className="py-3 px-3">Unidad</th>
                      <th className="py-3 px-3 text-right">Costo Unit. (Est)</th>
                      <th className="py-3 px-3 text-right">Total Estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {purchasableSelectedAlerts.map(alert => {
                      const qty = alert.qtyNeeded || 0;
                      const cost = alert.cost || 0;
                      const totalItemCost = qty * cost;
                      return (
                        <tr key={alert.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{alert.name}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold">{qty.toFixed(1)}</td>
                          <td className="py-3 px-3 text-slate-450 text-[10px] uppercase font-black">{alert.unit || 'und'}</td>
                          <td className="py-3 px-3 text-right font-mono">${cost.toLocaleString('es-CO')}</td>
                          <td className="py-3 px-3 text-right font-mono font-black text-[var(--accent-purple)]">${totalItemCost.toLocaleString('es-CO')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Total valuation panel */}
              <div className="p-4 bg-slate-550/5 dark:bg-slate-850/30 rounded-2xl border border-slate-200/50 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-450 uppercase font-black tracking-wider block">Costo Sugerido Total</span>
                  <span className="text-xs text-slate-400 italic">Neto proyectado</span>
                </div>
                <div className="text-right">
                  <h4 className="text-2xl font-black font-mono text-slate-900 dark:text-white leading-none">
                    ${totalEstimatedCost.toLocaleString('es-CO')}
                  </h4>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDraftModalOpen(false)}
                className="px-6 py-3 bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-450 font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={confirmDraftOrder}
                className="px-8 py-3 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white font-black rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 transition-all"
              >
                Confirmar Borrador
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Returns a set of recipe/dish IDs that are out of stock (depleted raw items).
 * Used by OrderFlow to disable buttons or show warnings for unavailable dishes.
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
      return item.theoreticalStock <= 0 || item.theoreticalStock < quantityNeeded;
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
