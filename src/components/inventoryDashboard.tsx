import { useState, useMemo } from 'react';
import { db } from '../db/localDb';
import type { InventoryItem } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import InventoryAdjustment from './inventoryAdjustment';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';

const dateOptions = [
  { value: '2026-10', label: 'Octubre 2026' },
  { value: '2026-09', label: 'Septiembre 2026' },
  { value: '2026-08', label: 'Agosto 2026' },
];

const statusOptions = [
  { value: 'ALL', label: 'Estado: Todos' },
  { value: 'OPTIMO', label: 'Óptimo' },
  { value: 'BAJO', label: 'Bajo Stock' },
  { value: 'CRITICO', label: 'Crítico' },
];

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

interface InventoryDashboardProps {
  onIngreso: () => void;
  onEditItem?: (itemId: string, type: string) => void;
  onNavigateToAlerts?: (filter: { level?: 'Crítico' | 'Bajo' | 'ALL'; type?: 'Stock' | 'Vencimiento' | 'Mantenimiento' | 'ALL' }) => void;
}

export default function InventoryDashboard({ onIngreso, onEditItem, onNavigateToAlerts }: InventoryDashboardProps) {
  // Query inventory items from IndexedDB
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Query system settings for the global minimum stock limit threshold
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

  // Expiration mock data matching advanced alert system
  const expirationAlerts = [
    { name: 'Queso Burrata Fresco', daysLeft: 2, date: '11 Jun 2026', qty: '8 unidades' },
    { name: 'Tomate Cherry', daysLeft: 4, date: '13 Jun 2026', qty: '5 Cajas' },
    { name: 'Solomillo de Ternera', daysLeft: 1, date: '10 Jun 2026', qty: '4.5 Kg' }
  ];

  const criticalItems = useMemo(() => {
    return inventoryItems.filter(item => item.theoreticalStock <= globalMinStock);
  }, [inventoryItems, globalMinStock]);

  const lowStockItems = useMemo(() => {
    return inventoryItems.filter(item => 
      item.theoreticalStock > globalMinStock && 
      item.theoreticalStock <= globalMinStock * 1.5
    );
  }, [inventoryItems, globalMinStock]);

  // Query fixed assets needing maintenance (due today or past due)
  const maintenanceAssets = useLiveQuery(async () => {
    const assets = await db.fixedAssets.toArray();
    const todayStr = new Date().toISOString().split('T')[0];
    return assets.filter(a => a.nextMaintenanceDate && a.nextMaintenanceDate <= todayStr);
  }) || [];

  // Local state for filters and pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('2026-10');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const itemsPerPage = 10;
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);



  // Editing state for modal
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStock, setEditStock] = useState(0);
  const [editMinStock, setEditMinStock] = useState(0);
  const [editPurchaseCost, setEditPurchaseCost] = useState(0);

  // Manual Adjustment modal state
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);

  // Smart Redesign states
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [selectedKardexItemId, setSelectedKardexItemId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    if (!deletingItemId) return;
    try {
      await db.inventoryItems.delete(deletingItemId);
      toast.success('Elemento eliminado del inventario exitosamente.');
      setDeletingItemId(null);
    } catch (error) {
      console.error(error);
      toast.error('Ocurrió un error al eliminar el insumo.');
    }
  };



  // Derive categories from DB items dynamically
  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    inventoryItems.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats);
  }, [inventoryItems]);

  const categoryOptions = useMemo(() => [
    { value: 'ALL', label: 'Todas las Categorías' },
    ...categoriesList.map(cat => ({ value: cat, label: cat }))
  ], [categoriesList]);

  // Calculate stats
  const totalInventoryValue = useMemo(() => {
    return inventoryItems.reduce((acc, item) => {
      return acc + ((item.theoreticalStock || 0) * (item.purchaseCost || 0));
    }, 0);
  }, [inventoryItems]);

  // Filter items matching conditions and sort by urgency
  const filteredItems = useMemo(() => {
    const items = inventoryItems.filter(item => {
      // Search term match
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Category match
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;

      // Status calculation
      const minLimit = item.stockMinLimit ?? globalMinStock;
      const isCritical = item.theoreticalStock <= minLimit;
      const isLow = item.theoreticalStock > minLimit && item.theoreticalStock <= minLimit * 1.5;
      
      let status = 'OPTIMO';
      if (isCritical) status = 'CRITICO';
      else if (isLow) status = 'BAJO';

      const matchesStatus = selectedStatus === 'ALL' || status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });

    const getUrgencyScore = (item: InventoryItem) => {
      const minLimit = item.stockMinLimit ?? globalMinStock;
      const isCritical = item.theoreticalStock <= minLimit;

      let isExpiringSoon = false;
      if (item.fechaVencimiento) {
        const expDate = new Date(item.fechaVencimiento);
        const today = new Date();
        expDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isExpiringSoon = diffDays >= 0 && diffDays < 7;
      }

      if (isCritical) return 3; // Stock Crítico
      if (isExpiringSoon) return 2; // Próximo a vencer
      if (item.theoreticalStock <= minLimit * 1.5) return 1; // Bajo stock
      return 0; // Óptimo
    };

    return [...items].sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));
  }, [inventoryItems, searchTerm, selectedCategory, selectedStatus, globalMinStock]);

  // Pagination slicing
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));

  // Determine item status
  const getItemStatus = (item: InventoryItem) => {
    const minLimit = item.stockMinLimit ?? globalMinStock;
    if (item.theoreticalStock <= minLimit) {
      return { label: 'Crítico', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20', dotColor: 'bg-rose-500' };
    }
    if (item.theoreticalStock <= minLimit * 1.5) {
      return { label: 'Bajo Stock', color: 'text-[var(--text-muted)] bg-[var(--text-muted)]/10 border border-[rgba(143,99,244,0.15)]', dotColor: 'bg-[var(--text-muted)]' };
    }
    return { label: 'Óptimo', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', dotColor: 'bg-emerald-500' };
  };

  // Static/dynamic stock alerts count
  const criticalCount = useMemo(() => {
    return criticalItems.length;
  }, [criticalItems]);

  const lowCount = useMemo(() => {
    return lowStockItems.length;
  }, [lowStockItems]);

  // Save changes from inline editor modal
  const handleSaveChanges = async () => {
    if (!editingItem) return;
    try {
      await db.inventoryItems.update(editingItem.id, {
        name: editName,
        category: editCategory,
        theoreticalStock: editStock,
        realPhysicalStock: editStock,
        stockMinLimit: editMinStock,
        purchaseCost: editPurchaseCost,
        updatedAt: new Date().toISOString()
      });
      setEditingItem(null);
    } catch (err) {
      console.error('Error saving changes to inventory item:', err);
    }
  };

  const getItemTypeLabel = (item: InventoryItem) => {
    if (item.inventoryType === 'ASSET') return 'Activo';
    if (item.id.startsWith('ins-prd')) return 'Producto';
    if (item.id.startsWith('ins-pkg') || item.isPackagingDesechable) return 'Suministro';
    return 'Insumo';
  };

  const handleEditClick = (item: InventoryItem) => {
    if (onEditItem) {
      let type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' = 'INGREDIENT';
      if (item.id.startsWith('ins-prd')) type = 'PRODUCT';
      else if (item.id.startsWith('ins-pkg') || item.isPackagingDesechable) type = 'PACKAGING';
      onEditItem(item.id, type);
    } else {
      setEditingItem(item);
      setEditName(item.name);
      setEditCategory(item.category);
      setEditStock(item.theoreticalStock);
      setEditMinStock(item.stockMinLimit);
      setEditPurchaseCost(item.purchaseCost);
    }
  };

  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'ID,Nombre,Categoria,Tipo,Stock Teorico,Unidad,Costo Compra\n';
    
    inventoryItems.forEach(item => {
      const type = item.inventoryType === 'ASSET' ? 'Mobiliario/Activo' : 'Consumible';
      csvContent += `${item.id},"${item.name}","${item.category}",${type},${item.theoreticalStock},${item.countUnit},${item.purchaseCost}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'existencias_inventario.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto flex-1 transition-receitly">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-headline font-black text-slate-900 dark:text-white flex items-center gap-2">
            Gestión de Inventario
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="material-symbols-outlined text-xs text-slate-400">calendar_today</span>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-wider">
              Última fecha de control: <span className="text-slate-500 font-extrabold">24 Oct 2026</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CustomSelect
            value={selectedDate}
            onChange={setSelectedDate}
            options={dateOptions}
            className="bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-xl px-4 py-2.5 pr-10 text-xs font-bold text-slate-700 dark:text-slate-350 shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
          />
          <button
            onClick={() => setAdjustingItemId('')}
            className="btn-receitly-secondary text-xs uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-sm font-bold">difference</span>
            Ajustar Stock
          </button>
          <button
            onClick={onIngreso}
            className="btn-receitly text-xs uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            Ingreso
          </button>
        </div>
      </div>

      {/* Bento Grid Indicators */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric Card 1: Valor Total */}
        <div className="bg-slate-900 dark:bg-[var(--bg-surface)] text-white p-6 rounded-3xl relative overflow-hidden shadow-lg border border-[rgba(143,99,244,0.15)] flex flex-col justify-between min-h-[140px]">
          <div className="absolute top-0 right-0 w-28 h-28 bg-[var(--accent-purple)]/10 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Valor Total del Inventario
            </span>
            <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg bg-[var(--accent-purple)]/10 p-1.5 rounded-lg">
              payments
            </span>
          </div>
          <div>
            <h3 className="text-3xl font-black font-mono leading-none tracking-tight">
              ${totalInventoryValue.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-emerald-400 text-[10px] font-bold mt-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">trending_up</span>
              +4.2% respecto al mes pasado
            </p>
          </div>
        </div>

        {/* Metric Card 2: Tasa Desperdicio */}
        <div className="panel-card flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Tasa de Desperdicio Semanal
            </span>
            <span className="material-symbols-outlined text-rose-500 text-lg bg-rose-500/10 p-1.5 rounded-lg">
              delete_outline
            </span>
          </div>
          <div>
            <h3 className="text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">
              3.2%
            </h3>
            <div className="w-full bg-slate-100 dark:bg-[var(--card-color)] h-2 rounded-full mt-3 overflow-hidden">
              <div className="bg-[var(--text-muted)] h-full rounded-full" style={{ width: '64%' }}></div>
            </div>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-1000 mt-2">
              Meta establecida: &lt; 5%
            </p>
          </div>
        </div>

        {/* Metric Card 3: Entradas de Hoy */}
        <div className="panel-card flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Entradas de Hoy
            </span>
            <span className="material-symbols-outlined text-teal-600 text-lg bg-teal-500/10 p-1.5 rounded-lg">
              assignment_returned
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">
                12
              </h3>
              <div className="flex -space-x-1.5 overflow-hidden">
                <span className="bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[rgba(143,99,244,0.15)] text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                  INV
                </span>
                <span className="bg-teal-500/15 text-teal-600 border border-teal-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                  FRU
                </span>
                <span className="bg-slate-100 dark:bg-[var(--card-color)] text-slate-600 dark:text-slate-300 text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                  +9
                </span>
              </div>
            </div>
            <p className="text-teal-600 text-[9px] font-bold mt-3.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
              Última entrada: Carnes selectas (hace 2h)
            </p>
          </div>
        </div>
      </section>

      {/* Maintenance Alerts Section */}
      {maintenanceAssets.length > 0 && (
        <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-rose-500/30 dark:border-rose-950/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-headline font-bold text-rose-500 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-500 text-lg">engineering</span>
              Revisión Técnica / Mantenimiento Pendiente ({maintenanceAssets.length})
            </h3>
            <span className="text-[10px] bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
              Crítico
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {maintenanceAssets.map(asset => (
              <div key={asset.id} className="p-4 rounded-2xl bg-rose-500/5 dark:bg-rose-950/10 border border-rose-500/10 dark:border-rose-950/20 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Vencido
                    </span>
                    <span className="text-rose-550 font-extrabold text-[10px] font-mono">{asset.nextMaintenanceDate}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-2">{asset.name}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Ubicación: <span className="font-semibold text-slate-600 dark:text-slate-350">{asset.location}</span> | Frecuencia: <span className="font-semibold text-slate-600 dark:text-slate-350">{asset.alertFrequency}</span>
                  </p>
                  {asset.technicianRemarks && (
                    <p className="text-[9px] text-slate-400 italic mt-1.5 leading-snug">
                      "{asset.technicianRemarks}"
                    </p>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Serial: {asset.serialNumber || 'N/A'}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const nextDate = new Date();
                      if (asset.alertFrequency === 'Mensual') nextDate.setMonth(nextDate.getMonth() + 1);
                      else if (asset.alertFrequency === 'Trimestral') nextDate.setMonth(nextDate.getMonth() + 3);
                      else nextDate.setMonth(nextDate.getMonth() + 6);

                      await db.fixedAssets.update(asset.id, {
                        nextMaintenanceDate: nextDate.toISOString().split('T')[0],
                        status: 'Operativo',
                        updatedAt: new Date().toISOString()
                      });
                      toast.success(`Mantenimiento registrado para ${asset.name}. Próxima fecha: ${nextDate.toISOString().split('T')[0]}`);
                    }}
                    className="text-emerald-500 hover:text-emerald-600 dark:text-emerald-450 dark:hover:text-emerald-400 text-[10px] font-bold uppercase tracking-wider hover:underline cursor-pointer"
                  >
                    Marcar Realizado
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Expiry and Stock Alerts Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Critical Alerts Card */}
        <div 
          onClick={() => onNavigateToAlerts?.({ level: 'Crítico', type: 'Stock' })}
          className="panel-card group cursor-pointer hover:border-rose-500/30 dark:hover:border-rose-500/35 hover:shadow-md flex flex-col justify-between min-h-[220px]"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline font-bold text-slate-900 dark:text-white flex items-center text-sm">
                <span className="material-symbols-outlined text-rose-500 mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                Stock Crítico
              </h3>
              <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {criticalCount} Alertas
              </span>
            </div>
            <div className="space-y-2 max-h-[120px] overflow-y-auto">
              {criticalItems.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No hay alertas críticas de stock.</p>
              ) : (
                criticalItems.slice(0, 2).map(item => (
                  <div key={item.id} className="flex justify-between items-center p-2.5 bg-rose-500/5 dark:bg-rose-950/10 rounded-xl border border-rose-500/10 dark:border-rose-950/20">
                    <div>
                      <p className="font-bold text-xs text-slate-800 dark:text-slate-200">{item.name}</p>
                      <p className="text-[9px] text-slate-400">Min Global: {globalMinStock} {item.countUnit}</p>
                    </div>
                    <span className="text-rose-500 font-extrabold text-xs font-mono">
                      {item.theoreticalStock} {item.countUnit}
                    </span>
                  </div>
                ))
              )}
              {criticalItems.length > 2 && (
                <p className="text-[10px] text-slate-400 text-center font-bold">+ {criticalItems.length - 2} más</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[var(--accent-purple)] text-[10px] font-bold uppercase tracking-wider group-hover:underline">
            <span>Ver consola de alertas</span>
            <span className="material-symbols-outlined text-xs">arrow_forward</span>
          </div>
        </div>

        {/* Low Stock Alerts Card */}
        <div 
          onClick={() => onNavigateToAlerts?.({ level: 'Bajo', type: 'Stock' })}
          className="panel-card group cursor-pointer hover:border-[var(--accent-purple)]/30 dark:hover:border-[var(--accent-purple)]/35 hover:shadow-md flex flex-col justify-between min-h-[220px]"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline font-bold text-slate-900 dark:text-white flex items-center text-sm">
                <span className="material-symbols-outlined text-[var(--text-muted)] mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                Bajo Stock
              </h3>
              <span className="bg-[var(--text-muted)]/15 text-[var(--text-muted)] text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {lowCount} Alertas
              </span>
            </div>
            <div className="space-y-2 max-h-[120px] overflow-y-auto">
              {lowStockItems.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No hay alertas de bajo stock.</p>
              ) : (
                lowStockItems.slice(0, 2).map(item => (
                  <div key={item.id} className="flex justify-between items-center p-2.5 bg-[var(--text-muted)]/5 dark:bg-[var(--text-muted)]/10 rounded-xl border border-[rgba(143,99,244,0.15)] dark:border-[rgba(143,99,244,0.15)]">
                    <div>
                      <p className="font-bold text-xs text-slate-800 dark:text-slate-200">{item.name}</p>
                      <p className="text-[9px] text-slate-400">Min Global: {globalMinStock} {item.countUnit}</p>
                    </div>
                    <span className="text-[var(--text-muted)] font-extrabold text-xs font-mono">
                      {item.theoreticalStock} {item.countUnit}
                    </span>
                  </div>
                ))
              )}
              {lowStockItems.length > 2 && (
                <p className="text-[10px] text-slate-400 text-center font-bold">+ {lowStockItems.length - 2} más</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[var(--accent-purple)] text-[10px] font-bold uppercase tracking-wider group-hover:underline">
            <span>Ver consola de alertas</span>
            <span className="material-symbols-outlined text-xs">arrow_forward</span>
          </div>
        </div>

        {/* Expiry Alerts Card */}
        <div 
          onClick={() => onNavigateToAlerts?.({ type: 'Vencimiento' })}
          className="panel-card group cursor-pointer hover:border-purple-500/30 dark:hover:border-purple-500/35 hover:shadow-md flex flex-col justify-between min-h-[220px]"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline font-bold text-slate-900 dark:text-white flex items-center text-sm">
                <span className="material-symbols-outlined text-purple-500 mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_today</span>
                Por Vencer (HACCP)
              </h3>
              <span className="bg-purple-550/10 text-purple-650 dark:text-purple-400 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {expirationAlerts.length} Preventivo
              </span>
            </div>
            <div className="space-y-2 max-h-[120px] overflow-y-auto">
              {expirationAlerts.slice(0, 2).map((alert, idx) => (
                <div key={idx} className="flex justify-between items-center p-2.5 bg-purple-500/5 dark:bg-purple-950/10 rounded-xl border border-purple-500/10 dark:border-purple-950/20">
                  <div>
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200">{alert.name}</p>
                    <p className="text-[9px] text-slate-400">Vence: {alert.date}</p>
                  </div>
                  <span className={`font-extrabold text-[10px] px-2 py-0.5 rounded ${
                    alert.daysLeft <= 1 ? 'bg-rose-500/15 text-rose-500' : 'bg-purple-500/15 text-purple-500'
                  }`}>
                    {alert.daysLeft === 1 ? 'Mañana' : `${alert.daysLeft}d`}
                  </span>
                </div>
              ))}
              {expirationAlerts.length > 2 && (
                <p className="text-[10px] text-slate-400 text-center font-bold">+ {expirationAlerts.length - 2} más</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[var(--accent-purple)] text-[10px] font-bold uppercase tracking-wider group-hover:underline">
            <span>Ver consola de alertas</span>
            <span className="material-symbols-outlined text-xs">arrow_forward</span>
          </div>
        </div>
      </section>

      {/* Filter and Table Section */}
      <section className="bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden transition-receitly">
        {/* Filters bar */}
        <div className="p-6 border-b border-[rgba(143,99,244,0.15)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--bg-color)]/50">
          <div className="flex-1 flex items-center gap-3 bg-slate-100/70 dark:bg-[var(--card-color)] px-4 py-2.5 rounded-xl border border-slate-200/30 dark:border-slate-800/30 max-w-md">
            <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filtrar por nombre o SKU..."
              className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder-slate-500 dark:placeholder-slate-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Category Dropdown */}
            <CustomSelect
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                setCurrentPage(1);
              }}
              options={categoryOptions}
              className="appearance-none bg-slate-50 dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)] cursor-pointer"
            />

            {/* Status Dropdown */}
            <CustomSelect
              value={selectedStatus}
              onChange={(val) => {
                setSelectedStatus(val);
                setCurrentPage(1);
              }}
              options={statusOptions}
              className="appearance-none bg-slate-50 dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)] cursor-pointer"
            />

            {/* Export CSV button */}
            <button
              onClick={handleExportCSV}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-[var(--card-color)] dark:hover:bg-slate-750 text-slate-650 dark:text-slate-300 rounded-xl border border-[rgba(143,99,244,0.15)] flex items-center justify-center cursor-pointer hover:text-[var(--accent-purple)] transition-colors shadow-sm"
              title="Exportar existencias en CSV"
            >
              <span className="material-symbols-outlined text-lg">download</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-50 dark:bg-[var(--card-color)] p-1 rounded-xl border border-[rgba(143,99,244,0.15)] shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === 'GRID'
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                }`}
                title="Vista Cuadrícula"
              >
                <span className="material-symbols-outlined text-sm font-bold">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                }`}
                title="Vista Tabla"
              >
                <span className="material-symbols-outlined text-sm font-bold">table_rows</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stock List (Table or Grid View Mode) */}
        {viewMode === 'TABLE' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-[var(--card-color)]/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-[rgba(143,99,244,0.15)]">
                <tr>
                  <th className="py-4 px-6">Items</th>
                  <th className="py-4 px-4">Categoría</th>
                  <th className="py-4 px-4">Tipo</th>
                  <th className="py-4 px-4 text-center">Existencias</th>
                  <th className="py-4 px-4 text-center">Unidad</th>
                  <th className="py-4 px-4">Estado</th>
                  <th className="py-4 px-4">Último Recibido</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(143,99,244,0.15)] text-xs font-semibold">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-6 text-center text-slate-400 italic">
                      No se encontraron insumos que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => {
                    const statusInfo = getItemStatus(item);
                    const dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    }) : 'Sin registro';

                    return (
                      <tr 
                        key={item.id} 
                        className="hover:bg-slate-50/40 dark:hover:bg-slate-900/30 transition-all"
                      >
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{item.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{item.id}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="bg-[var(--text-muted)]/10 text-[var(--text-muted)] text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-[rgba(143,99,244,0.15)]">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold">
                          {getItemTypeLabel(item)}
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
                          {item.theoreticalStock}
                        </td>
                        <td className="py-4 px-4 text-center text-slate-400 uppercase font-black tracking-wider text-[9px]">
                          {item.countUnit}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`}></span>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-500 dark:text-slate-500 font-semibold">
                          {dateStr}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(activeMenuId === item.id ? null : item.id);
                                }}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
                                title="Opciones"
                              >
                                <span className="material-symbols-outlined text-base font-bold">more_vert</span>
                              </button>
                              {activeMenuId === item.id && (
                                <>
                                  <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                    }}
                                  ></div>
                                  <div className="absolute right-0 top-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 w-44 py-1.5 text-left divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        handleEditClick(item);
                                      }}
                                      className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-sm font-bold">edit</span>
                                      Editar
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        setAdjustingItemId(item.id);
                                      }}
                                      className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-sm font-bold">difference</span>
                                      Ajustar Stock
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        setSelectedKardexItemId(item.id);
                                      }}
                                      className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-sm font-bold">history</span>
                                      Ver Kardex
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(null);
                                        setDeletingItemId(item.id);
                                      }}
                                      className="w-full text-left px-4 py-2 text-xs font-black text-rose-500 hover:bg-rose-500/5 flex items-center gap-2 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-sm font-bold">delete</span>
                                      Eliminar
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            {paginatedItems.length === 0 ? (
              <p className="text-center text-slate-400 italic py-8">
                No se encontraron insumos que coincidan con la búsqueda.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {paginatedItems.map((item) => {
                  const dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('es-ES', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  }) : 'Sin registro';

                  const minLimit = item.stockMinLimit ?? globalMinStock;
                  const isStockCritical = item.theoreticalStock <= minLimit;

                  let isExpiringSoon = false;
                  if (item.fechaVencimiento) {
                    const expDate = new Date(item.fechaVencimiento);
                    const today = new Date();
                    expDate.setHours(0,0,0,0);
                    today.setHours(0,0,0,0);
                    const diffTime = expDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    isExpiringSoon = diffDays >= 0 && diffDays < 7;
                  }

                  const stockMax = item.stockMaxLimit || Math.max(item.theoreticalStock, minLimit * 3, 100);
                  const progressPct = Math.min(100, Math.max(0, (item.theoreticalStock / stockMax) * 100));

                  return (
                    <div 
                      key={item.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-[rgba(143,99,244,0.15)] hover:shadow-md transition-all flex items-start gap-4 text-left"
                    >
                      {/* Compact Image Box (60px x 60px) */}
                      <div className="w-[60px] h-[60px] shrink-0 relative rounded-xl overflow-hidden bg-slate-100 dark:bg-[var(--card-color)] border border-[rgba(143,99,244,0.15)] group/img">
                        <img
                          src={item.img || getItemFallbackImg(item)}
                          alt={item.name}
                          onClick={() => handleEditClick(item)}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      {/* Content details using CSS Grid */}
                      <div className="flex-1 min-w-0 grid grid-cols-1 gap-1.5">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <span className="text-[9px] font-black text-[var(--text-muted)] dark:text-[var(--text-muted)] uppercase tracking-wider block">
                              {item.category} • {getItemTypeLabel(item)}
                            </span>
                            <h4 
                              onClick={() => handleEditClick(item)}
                              className="font-bold text-slate-900 dark:text-white leading-tight cursor-pointer hover:text-[var(--accent-purple)] transition-colors truncate text-sm mt-0.5"
                              title={item.name}
                            >
                              {item.name}
                            </h4>
                            
                            {/* Alert Badges Row (Contextual Warnings) */}
                            <div className="flex flex-wrap gap-1.5 mt-1 h-5 items-center">
                              {isStockCritical && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                                  Stock Crítico
                                </span>
                              )}
                              {isExpiringSoon && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[rgba(143,99,244,0.15)]">
                                  Próximo a vencer
                                </span>
                              )}
                              {!isStockCritical && !isExpiringSoon && (
                                <div className="h-5"></div>
                              )}
                            </div>
                          </div>

                          {/* Card Dropdown Menu Action */}
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(activeMenuId === item.id ? null : item.id);
                              }}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
                              title="Opciones"
                            >
                              <span className="material-symbols-outlined text-sm font-bold">more_vert</span>
                            </button>
                            {activeMenuId === item.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                  }}
                                ></div>
                                <div className="absolute right-0 top-6 bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-xl shadow-xl z-20 w-44 py-1.5 text-left divide-y divide-[rgba(143,99,244,0.15)] animate-fade-in">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      handleEditClick(item);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer border-none"
                                  >
                                    <span className="material-symbols-outlined text-sm font-bold">edit</span>
                                    Editar
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setAdjustingItemId(item.id);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer border-none"
                                  >
                                    <span className="material-symbols-outlined text-sm font-bold">difference</span>
                                    Ajustar Stock
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setSelectedKardexItemId(item.id);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer border-none"
                                  >
                                    <span className="material-symbols-outlined text-sm font-bold">history</span>
                                    Ver Kardex
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setDeletingItemId(item.id);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-black text-rose-500 hover:bg-rose-500/5 flex items-center gap-2 cursor-pointer border-none"
                                  >
                                    <span className="material-symbols-outlined text-sm font-bold">delete</span>
                                    Eliminar
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar of Max Limit */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                            <span>Existencias / Total</span>
                            <span className="font-mono text-slate-750 dark:text-slate-300">
                              {item.theoreticalStock} / {stockMax} {item.countUnit}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-[var(--card-color)] h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-350 ${
                                isStockCritical ? 'bg-rose-500' : progressPct < 30 ? 'bg-[var(--text-muted)]' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${progressPct}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Last received footer */}
                        <div className="flex justify-between items-center text-[8px] text-slate-450 dark:text-slate-500 font-semibold pt-1 border-t border-slate-100 dark:border-slate-800/80">
                          <span>Último Recibido:</span>
                          <span>{dateStr}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Pagination Footer */}
        <div className="p-6 border-t border-[rgba(143,99,244,0.15)] flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
            Mostrando {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredItems.length)} de {filteredItems.length} ingredientes
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-slate-300/50 dark:border-slate-700/50 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">chevron_left</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentPage === page
                    ? 'bg-[var(--accent-purple)] text-white shadow-md shadow-[var(--accent-purple)]/10'
                    : 'border border-slate-300/50 dark:border-slate-700/50 text-slate-650 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-slate-300/50 dark:border-slate-700/50 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">chevron_right</span>
            </button>
          </div>
        </div>
      </section>

      {/* Editing Modal Dialog */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-3xl p-6 w-full max-w-md shadow-xl animate-fade-in text-left">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(143,99,244,0.15)]">
              <h3 className="font-headline font-black text-lg text-slate-900 dark:text-white">
                Editar Insumo
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-4 py-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[var(--card-color)] border-none rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Categoría</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[var(--card-color)] border-none rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Costo Unitario ($)</label>
                  <input
                    type="number"
                    value={editPurchaseCost}
                    onChange={(e) => setEditPurchaseCost(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-[var(--card-color)] border-none rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Actual ({editingItem.countUnit})</label>
                  <input
                    type="number"
                    value={editStock}
                    onChange={(e) => setEditStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-[var(--card-color)] border-none rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Mínimo ({editingItem.countUnit})</label>
                  <input
                    type="number"
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-[var(--card-color)] border-none rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[rgba(143,99,244,0.15)] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-5 py-2.5 bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-400 font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                className="px-6 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white font-black rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 transition-all"
              >
                Guardar
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
              alt="Full Screen Inventory Item" 
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </Modal>
      )}

      <InventoryAdjustment
        isOpen={adjustingItemId !== null}
        onClose={() => setAdjustingItemId(null)}
        preselectedItemId={adjustingItemId}
      />

      {deletingItemId && (
        <ConfirmDialog
          isOpen={deletingItemId !== null}
          title="Eliminar Insumo"
          message={`¿Está seguro de que desea eliminar este insumo de la base de datos? Esta acción eliminará de forma permanente todas sus existencias y registros históricos.`}
          confirmText="Sí, Eliminar Insumo"
          cancelText="No, Cancelar"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingItemId(null)}
          onClose={() => setDeletingItemId(null)}
        />
      )}

      {selectedKardexItemId && (
        <Modal
          title={`Kardex de Inventario: ${inventoryItems.find(i => i.id === selectedKardexItemId)?.name || selectedKardexItemId}`}
          onClose={() => setSelectedKardexItemId(null)}
          size="lg"
        >
          <KardexHistoryList itemId={selectedKardexItemId} />
        </Modal>
      )}
    </div>
  );
}

function KardexHistoryList({ itemId }: { itemId: string }) {
  const logs = useLiveQuery(() => 
    db.inventoryLogs
      .where('itemId')
      .equals(itemId)
      .toArray()
  ) || [];

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs]);

  return (
    <div className="space-y-4 text-left">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950 text-slate-450 text-[10px] font-extrabold uppercase tracking-wider border-b border-[rgba(143,99,244,0.15)]">
              <th className="py-3 px-4">Fecha</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4 text-right">Cantidad</th>
              <th className="py-3 px-4">Detalle / Motivo</th>
              <th className="py-3 px-4">Responsable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(143,99,244,0.15)] text-xs font-semibold">
            {sortedLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                  No hay movimientos registrados en el Kardex para este elemento.
                </td>
              </tr>
            ) : (
              sortedLogs.map((log) => {
                const isPositive = log.quantity > 0;
                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-500 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleString('es-ES', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        log.type === 'Compra' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/10' :
                        log.type === 'Venta' ? 'bg-blue-500/10 text-blue-600 border-blue-500/10' :
                        'bg-[var(--text-muted)]/15 text-[var(--text-muted)] border-[rgba(143,99,244,0.15)]'
                      }`}>
                        {log.type}
                      </span>
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono font-bold ${
                      isPositive ? 'text-emerald-500' : 'text-rose-500'
                    }`}>
                      {isPositive ? '+' : ''}{log.quantity.toLocaleString('es-CO')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-350 font-semibold max-w-[200px] truncate" title={log.reason}>
                      {log.reason || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                      {log.user || 'N/A'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
