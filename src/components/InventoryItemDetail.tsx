import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import type { InventoryItem } from '../types';
import { getPhysicalStockInBranch, getAvailableStockInBranch } from '../types';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { getItemResourceType, getResourceTypeLabel } from '../utils/dataHelper';
import { navigateContextualBack, pushNavigationState } from '../utils/navigation';
import { getItemUnitCost } from '../utils/costEngine';
import { getActiveBranchId, formatQuantityDecimals, consolidateSucursalStock, areBranchIdsEqual } from '../utils/branchHelper';

const getItemFallbackImg = (item: InventoryItem) => {
  if (item.inventoryType === 'ASSET') {
    return 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=200&h=200&q=80';
  }
  if (item.id.startsWith('ins-prd')) {
    return 'https://images.unsplash.com/photo-1582106243087-90e82139b43e?auto=format&fit=crop&w=200&h=200&q=80';
  }
  if (item.id.startsWith('ins-pkg') || item.isPackagingDesechable) {
    return 'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=200&h=200&q=80';
  }
  return 'https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?auto=format&fit=crop&w=200&h=200&q=80';
};

interface InventoryItemDetailProps {
  itemId: string;
  onBack?: () => void;
  onEdit?: (itemId: string, type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET') => void;
}

export default function InventoryItemDetail({ itemId, onBack, onEdit }: InventoryItemDetailProps) {
  const item = useLiveQuery(() => db.inventoryItems.get(itemId), [itemId]);
  const loading = item === undefined;

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else {
      navigateContextualBack({ fallback: '/inventory' });
    }
  };


  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <span className="material-symbols-outlined text-3xl animate-spin text-[var(--accent-purple)]">sync</span>
          <p className="text-xs font-bold uppercase tracking-wider">Cargando ficha de elemento...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-8 space-y-6 text-center">
        <div className="bg-surface border border-line p-8 rounded-3xl max-w-md mx-auto shadow-sm space-y-4">
          <span className="material-symbols-outlined text-4xl text-rose-500">inventory_2</span>
          <h2 className="text-lg font-bold text-content">Elemento no encontrado</h2>
          <p className="text-xs text-slate-500">El elemento seleccionado no existe o fue eliminado.</p>
          <button
            onClick={handleBackClick}
            className="px-4 py-2 bg-raised text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Volver al Inventario
          </button>
        </div>
      </div>
    );
  }

  const itemType = getItemResourceType(item);
  const typeLabel = getResourceTypeLabel(itemType);

  const minLimit = item.stockMinLimit ?? 10;
  const isCritical = item.theoreticalStock <= minLimit;
  const isLow = item.theoreticalStock > minLimit && item.theoreticalStock <= minLimit * 1.5;

  const statusLabel = isCritical ? 'Crítico' : isLow ? 'Bajo Stock' : 'Óptimo';
  const statusColor = isCritical 
    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30' 
    : isLow 
    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'
    : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30';

  const realUnitCost = getItemUnitCost(item);

  const activeBranchId = getActiveBranchId();
  const activePhysical = getPhysicalStockInBranch(item, activeBranchId);
  const activeAvailable = getAvailableStockInBranch(item, activeBranchId);
  const totalGlobalPhysical = Number(item.currentStock ?? item.realPhysicalStock ?? item.theoreticalStock ?? activePhysical) || 0;
  const isMultiBranchDiff = totalGlobalPhysical !== activePhysical;
  const totalValuation = activePhysical * realUnitCost;

  const handleEditClick = () => {
    const targetUrl = `/inventory/${itemType.toLowerCase()}/edit/${item.id}`;
    pushNavigationState(targetUrl, {
      from: `/inventory/view/${item.id}`,
      originTab: 'INVENTORY_ITEM_DETAIL',
      itemId: item.id,
      itemType
    });
    if (onEdit) {
      onEdit(item.id, itemType);
    }
  };

  return (
    <div className="p-8 space-y-6 animate-fade-in text-left font-sans min-h-screen">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="p-2 rounded-xl border border-line bg-surface text-content-secondary hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-raised transition-colors shadow-sm cursor-pointer"
            title="Volver atrás"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusColor}`}>
                {statusLabel}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30">
                {typeLabel}
              </span>
            </div>
            <h1 className="text-2xl font-black text-content leading-tight mt-1">
              {item.name}
            </h1>
            <p className="text-xs text-content-secondary font-mono">
              SKU: {item.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="px-4 py-2.5 rounded-xl border border-line bg-surface text-content-secondary hover:bg-slate-50 dark:hover:bg-raised text-xs font-bold transition-colors cursor-pointer"
          >
            Volver
          </button>

          {onEdit && (
            <button
              type="button"
              onClick={handleEditClick}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent-purple)] text-white hover:bg-[var(--accent-purple)]/90 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              Editar Elemento
            </button>
          )}
        </div>
      </div>

      {/* Grid Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Card 1: Resumen General e Imagen (4 cols) */}
        <div className="col-span-12 lg:col-span-4 bg-white/40 dark:bg-surface/40 backdrop-blur-md border border-slate-200/30 dark:border-line shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">info</span>
              Resumen del Elemento
            </h3>

            <div className="w-full h-48 rounded-2xl overflow-hidden bg-raised border border-line mb-4 relative">
              <img
                src={item.img || getItemFallbackImg(item)}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-content-secondary font-bold uppercase text-[9px] tracking-wider">Categoría</span>
                <span className="font-bold text-content">{item.category || item.supplyCategory || 'General'}</span>
              </div>

              {item.operationZone && (
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-content-secondary font-bold uppercase text-[9px] tracking-wider">Zona de Operación</span>
                  <span className="font-bold text-content">{item.operationZone}</span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-content-secondary font-bold uppercase text-[9px] tracking-wider">Unidad de Medida</span>
                <span className="font-bold text-content uppercase">{item.purchaseUnit || item.countUnit || 'und'}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-content-secondary font-bold uppercase text-[9px] tracking-wider">Estado en Catálogo</span>
                <span className={`font-bold ${item.isActive !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {item.isActive !== false ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {item.description && (
                <div className="pt-2">
                  <span className="text-content-secondary font-bold uppercase text-[9px] tracking-wider block mb-1">Descripción / Observaciones</span>
                  <p className="text-content-secondary text-xs bg-inset p-3 rounded-xl border border-slate-200/50 dark:border-line leading-relaxed">
                    {item.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2 & 3: Control de Existencias & Métricas de Costo (8 cols) */}
        <div className="col-span-12 lg:col-span-8 space-y-6 flex flex-col justify-between">
          
          {/* Card 2: Control de Existencias */}
          <div className="bg-white/40 dark:bg-surface/40 backdrop-blur-md border border-slate-200/30 dark:border-line shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">inventory</span>
              Control de Existencias
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-inset p-4 rounded-2xl border border-slate-200/60 dark:border-line text-center">
                <span className="text-[9px] font-black uppercase text-content-secondary tracking-wider block">Stock Físico (Sede Activa)</span>
                <span className="text-xl font-black font-mono text-content block mt-1">
                  {formatQuantityDecimals(activePhysical)} {item.countUnit}
                </span>
                {isMultiBranchDiff && (
                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                    (Global: {formatQuantityDecimals(totalGlobalPhysical)} {item.countUnit})
                  </span>
                )}
              </div>

              <div className="bg-amber-50 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-200 dark:border-amber-500/20 text-center">
                <span className="text-[9px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider block">Reservado (Comandas)</span>
                <span className="text-xl font-black font-mono text-amber-700 dark:text-amber-300 block mt-1">
                  {formatQuantityDecimals(item.reservedStockByBranch?.[activeBranchId] ?? item.reservedStock ?? 0)} {item.countUnit}
                </span>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 text-center">
                <span className="text-[9px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider block">Disponible Real (Sede Activa)</span>
                <span className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-300 block mt-1">
                  {formatQuantityDecimals(activeAvailable)} {item.countUnit}
                </span>
                {isMultiBranchDiff && (
                  <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-medium block mt-0.5">
                    (Global: {formatQuantityDecimals(Math.max(0, totalGlobalPhysical - (item.reservedStock || 0)))} {item.countUnit})
                  </span>
                )}
              </div>

              <div className="bg-inset p-4 rounded-2xl border border-slate-200/60 dark:border-line text-center">
                <span className="text-[9px] font-black uppercase text-content-secondary tracking-wider block">Stock Mínimo</span>
                <span className="text-xl font-bold font-mono text-content-secondary block mt-1">
                  {formatQuantityDecimals(item.stockMinLimit || 0)} {item.countUnit}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Métricas de Costo y Financieras */}
          <div className="bg-white/40 dark:bg-surface/40 backdrop-blur-md border border-slate-200/30 dark:border-line shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">payments</span>
              Métricas Financieras y Costos
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-inset rounded-xl border border-slate-200/50 dark:border-line">
                <span className="text-[9px] font-bold text-content-secondary uppercase tracking-wider block">Costo Compra</span>
                <span className="text-sm font-black font-mono text-content mt-1 block">
                  {formatCurrency(item.purchaseCost)}
                </span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
                  Costo Real: {formatCurrency(realUnitCost)} / {item.countUnit || 'und'}
                </span>
              </div>

              <div className="p-3 bg-inset rounded-xl border border-slate-200/50 dark:border-line">
                <span className="text-[9px] font-bold text-content-secondary uppercase tracking-wider block">Rendimiento</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {formatPercentage((item.yieldFactor || 1) * 100)}
                </span>
              </div>

              <div className="p-3 bg-inset rounded-xl border border-slate-200/50 dark:border-line">
                <span className="text-[9px] font-bold text-content-secondary uppercase tracking-wider block">Merma (%)</span>
                <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 mt-1 block">
                  {formatPercentage(item.mermaPercentage || 0)}
                </span>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/25 dark:text-emerald-300 rounded-xl">
                <span className="text-[9px] font-black uppercase tracking-wider block">Valorización Total</span>
                <span className="text-sm font-black font-mono mt-1 block">
                  {formatCurrency(totalValuation)}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Card 4: Desglose de Stock por Sucursales (12 cols) */}
        <div className="col-span-12 bg-white/40 dark:bg-surface/40 backdrop-blur-md border border-slate-200/30 dark:border-line shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
          <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider">
            <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">store</span>
            Desglose de Stock por Sucursal
          </h3>

          {(() => {
            const consolidated = consolidateSucursalStock(item.sucursalStock || []);
            const displayBranches = consolidated.filter(
              (b) => b.sucursalId && b.sucursalId.toUpperCase() !== 'MAIN'
            );
            const effectiveBranches = displayBranches.length > 0 
              ? displayBranches 
              : [{ sucursalId: activeBranchId, stockActual: activePhysical, batchObservations: 'Sede activa' }];

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {effectiveBranches.map((b) => {
                  const isCurrentActive = areBranchIdsEqual(b.sucursalId, activeBranchId);
                  const branchStock = isCurrentActive ? activePhysical : (Number(b.stockActual) || 0);
                  const valuation = branchStock * realUnitCost;
                  return (
                    <div 
                      key={b.sucursalId} 
                      className={`p-4 rounded-2xl space-y-2 shadow-sm border ${
                        isCurrentActive 
                          ? 'bg-purple-50/40 dark:bg-raised border-[var(--accent-purple)]/40 ring-1 ring-[var(--accent-purple)]/20' 
                          : 'bg-slate-100 border-slate-200/80 dark:bg-inset dark:border-line'
                      }`}
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-line">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-content uppercase">{b.sucursalId}</span>
                          {isCurrentActive && (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-[var(--accent-purple)] text-white">
                              Activa
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-black text-purple-700 dark:text-purple-400">
                          Val: {formatCurrency(valuation)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                        <div>
                          <span className="text-[9px] text-content-secondary font-bold uppercase tracking-wider block">Físico</span>
                          <span className="font-mono font-bold text-content">{formatQuantityDecimals(branchStock)} {item.countUnit}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider block">Reservado</span>
                          <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                            {formatQuantityDecimals(item.reservedStockByBranch?.[b.sucursalId] || 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider block">Disponible</span>
                          <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">
                            {formatQuantityDecimals(Math.max(0, (b.stockActual || 0) - (item.reservedStockByBranch?.[b.sucursalId] || 0)))}
                          </span>
                        </div>
                      </div>

                      {b.batchObservations && (
                        <p className="text-[10px] text-content-secondary italic pt-1 border-t border-line/50">
                          "{b.batchObservations}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}
