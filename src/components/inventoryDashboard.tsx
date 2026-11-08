import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../db/localDb';
import type { InventoryItem } from '../types';
import { getPhysicalStockInBranch } from '../types';
import { getActiveBranchId, formatQuantityDecimals } from '../utils/branchHelper';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import InventoryAdjustment from './inventoryAdjustment';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';
import { formatCurrency } from '../utils/formatters';
import { getItemResourceType } from '../utils/dataHelper';
import { pushNavigationState } from '../utils/navigation';
import { getItemTotalValuation } from '../utils/costEngine';
import { useVoiceCopilot } from '../context/VoiceCopilotContext';
import { FileSpreadsheet } from 'lucide-react';
import ImportInventoryExcelModal from './inventory/ImportInventoryExcelModal';
import ProduceSubRecipeModal from './inventory/ProduceSubRecipeModal';
import { deleteRecordFromFirestore, bulkDeleteRecords } from '../services/syncService';
import BulkActionBar from './ui/BulkActionBar';
import { flexibleMultiMatch } from '../utils/searchEngine';
import { autoMigrateBranchStock } from '../db/inventoryEngine';

const generateDynamicDateOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    options.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
};

const dateOptions = generateDynamicDateOptions();

const inventoryTypeOptions = [
  { value: 'ALL', label: 'Categoría: Todos' },
  { value: 'PRODUCT', label: 'Producto Único' },
  { value: 'INGREDIENT', label: 'Ingrediente' },
  { value: 'SUPPLY', label: 'Suministro' },
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

export function getItemType(item: InventoryItem): 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' {
  const type = getItemResourceType(item);
  return type === 'ASSET' ? 'INGREDIENT' : type;
}

interface InventoryDashboardProps {
  onIngreso: () => void;
  onEditItem?: (itemId: string, type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING') => void;
  onViewItem?: (itemId: string) => void;
  onNavigateToAlerts?: (filter: { level?: 'Crítico' | 'Bajo' | 'ALL'; type?: 'Stock' | 'Vencimiento' | 'Mantenimiento' | 'ALL' }) => void;
}

export default function InventoryDashboard({ onIngreso, onEditItem, onViewItem, onNavigateToAlerts }: InventoryDashboardProps) {
  const copilot = useVoiceCopilot();
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);

  useEffect(() => {
    if (copilot?.setMode) {
      copilot.setMode('DASHBOARD');
    }
  }, [copilot]);

  useEffect(() => {
    const activeId = getActiveBranchId();
    if (activeId) {
      autoMigrateBranchStock(activeId);
    }
  }, []);

  useEffect(() => {
    const handleCopilotNav = (e: any) => {
      const target = e.detail?.target;
      if (target === 'INGREDIENT' || target === 'PRODUCT' || target === 'SUPPLY') {
        onIngreso();
      } else if (target === 'ALERTS' && onNavigateToAlerts) {
        onNavigateToAlerts({ level: 'ALL', type: 'ALL' });
      }
    };
    window.addEventListener('copilot-navigate', handleCopilotNav);
    return () => window.removeEventListener('copilot-navigate', handleCopilotNav);
  }, [onIngreso, onNavigateToAlerts]);

  // Query inventory items from IndexedDB
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Query system settings for global limits & dropdown lists
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

  // Query subcategories reactively from Dexie
  const ingredientCategories = useLiveQuery(() => db.ingredientCategories.toArray()) || [];
  const supplyCategories = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  const operationalLosses = useLiveQuery(() => db.operationalLosses.toArray()) || [];
  const inventoryLogs = useLiveQuery(() => db.inventoryLogs.toArray()) || [];

  // Dynamic Expiration Alerts from real inventory items
  const expirationAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return inventoryItems
      .filter(item => item.fechaVencimiento)
      .map(item => {
        const expDate = new Date(item.fechaVencimiento!);
        expDate.setHours(0, 0, 0, 0);
        const diffTime = expDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
          name: item.name,
          daysLeft,
          date: item.fechaVencimiento!,
          qty: `${item.theoreticalStock} ${item.countUnit || 'und'}`
        };
      })
      .filter(alert => alert.daysLeft >= 0 && alert.daysLeft <= 15)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [inventoryItems]);

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
  const [selectedInventoryType, setSelectedInventoryType] = useState<'ALL' | 'PRODUCT' | 'INGREDIENT' | 'SUPPLY'>('ALL');
  const [selectedSubcategory, setSelectedSubcategory] = useState('ALL');
  const [selectedProductionZone, setSelectedProductionZone] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const itemsPerPage = 18;

  // Fecha real del último control de inventario según registros del Kardex
  const latestControlDate = useMemo(() => {
    if (inventoryLogs.length > 0) {
      const sortedLogs = [...inventoryLogs].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      if (sortedLogs[0]?.timestamp) {
        return new Date(sortedLogs[0].timestamp).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }
    return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [inventoryLogs]);

  // Manual Adjustment & Action states
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [selectedKardexItemId, setSelectedKardexItemId] = useState<string | null>(null);
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  const [activeMenuAnchor, setActiveMenuAnchor] = useState<{
    id: string;
    item: InventoryItem;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);

  // Auto-close floating menu on window scroll or resize
  useEffect(() => {
    if (!activeMenuAnchor) return;
    const handleClose = () => setActiveMenuAnchor(null);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [activeMenuAnchor]);

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>, item: InventoryItem) => {
    e.stopPropagation();
    if (activeMenuAnchor?.id === item.id) {
      setActiveMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;
    setActiveMenuAnchor({
      id: item.id,
      item,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(16, rect.right),
      openUpwards
    });
  };

  // Multi-selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deletingItemId) return;
    try {
      await deleteRecordFromFirestore('inventoryItems', deletingItemId);
      toast.success('Elemento eliminado del inventario exitosamente.');
      setDeletingItemId(null);
    } catch (error) {
      console.error(error);
      toast.error('Ocurrió un error al eliminar el insumo.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDeleteRecords('inventoryItems', selectedIds);
      toast.success(`${selectedIds.length} insumo(s) eliminado(s) exitosamente.`);
      setSelectedIds([]);
    } catch (error) {
      console.error('Failed to bulk delete inventory items:', error);
      toast.error('Ocurrió un error al eliminar los insumos seleccionados.');
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  // Dynamic Subcategories list based on selected Inventory Type
  const subcategoryOptions = useMemo(() => {
    let list: string[] = [];

    if (selectedInventoryType === 'INGREDIENT') {
      const dbCats = ingredientCategories.map(c => c.name);
      const settingsCats = (systemSettings['ingredient_categories'] as string[]) || [];
      list = Array.from(new Set([...dbCats, ...settingsCats]));
    } else if (selectedInventoryType === 'SUPPLY') {
      const dbCats = supplyCategories.map(c => c.name);
      const settingsCats = (systemSettings['supply_categories'] as string[]) || [];
      list = Array.from(new Set([...dbCats, ...settingsCats]));
    } else if (selectedInventoryType === 'PRODUCT') {
      const settingsCats = (systemSettings['menu_categories'] || systemSettings['master_categories'] || []) as string[];
      list = Array.from(new Set(settingsCats));
    } else {
      // ALL
      const allItemCats = new Set<string>();
      inventoryItems.forEach(item => {
        if (item.category) allItemCats.add(item.category);
        if (item.supplyCategory) allItemCats.add(item.supplyCategory);
      });
      list = Array.from(allItemCats);
    }

    return [
      { value: 'ALL', label: 'Todas las Subcategorías' },
      ...list.map(cat => ({ value: cat, label: cat }))
    ];
  }, [selectedInventoryType, ingredientCategories, supplyCategories, systemSettings, inventoryItems]);

  // Production zones options for Suministros
  const productionZonesOptions = useMemo(() => {
    const list = (systemSettings['production_zones'] as string[]) || ['Cocina', 'Bar', 'Licuadoras'];
    return [
      { value: 'ALL', label: 'Todas las Zonas de Producción' },
      ...list.map(z => ({ value: z, label: z }))
    ];
  }, [systemSettings]);

  // Calculate total inventory value
  const totalInventoryValue = useMemo(() => {
    return inventoryItems.reduce((acc, item) => {
      return acc + getItemTotalValuation(item);
    }, 0);
  }, [inventoryItems]);

  // Dynamic Waste Rate calculation
  const wasteMetrics = useMemo(() => {
    const totalWasteCost = operationalLosses.reduce((sum, loss) => sum + (loss.cost || 0), 0);
    const wasteRate = totalInventoryValue > 0 ? (totalWasteCost / totalInventoryValue) * 100 : 0;
    const clampedRate = Math.min(100, Number(wasteRate.toFixed(1)));
    return {
      totalWasteCost,
      wasteRate: clampedRate
    };
  }, [operationalLosses, totalInventoryValue]);

  // Dynamic Today Entries from inventory logs
  const todayEntries = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const entries = inventoryLogs.filter(log => {
      const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
      const isIngreso = log.type === 'Compra' || log.type === 'Ingreso' || log.type === 'INGRESO';
      return isIngreso && (logDate === todayStr || !log.timestamp);
    });

    const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
    return {
      count: entries.length,
      lastEntryName: lastEntry ? `Entrada #${lastEntry.id.slice(-4)}` : null
    };
  }, [inventoryLogs]);

  // Filter items matching conditions and sort by urgency
  const filteredItems = useMemo(() => {
    const items = inventoryItems.filter(item => {
      const itemType = getItemType(item);

      // 1. Search term (Name, ID/SKU, Description, Category, SupplyCategory)
      const matchesSearch = flexibleMultiMatch([
        item.name, 
        item.id, 
        (item as any).sku, 
        item.description, 
        item.category, 
        item.supplyCategory
      ], searchTerm);

      // 2. Inventory Type filter
      const matchesType = selectedInventoryType === 'ALL' || 
        (selectedInventoryType === 'SUPPLY' 
          ? (itemType === 'PACKAGING' || item.resourceType === 'supply')
          : (itemType === selectedInventoryType || item.resourceType === (selectedInventoryType === 'PRODUCT' ? 'product' : 'ingredient')));

      // 3. Subcategory filter
      const itemSubcat = item.category || item.supplyCategory || '';
      const matchesSubcategory = selectedSubcategory === 'ALL' || itemSubcat === selectedSubcategory;

      // 4. Production Zone filter (applicable when Suministro)
      const matchesZone = selectedProductionZone === 'ALL' || 
        (selectedInventoryType === 'SUPPLY' && item.operationZone === selectedProductionZone);

      // 5. Status filter
      const minLimit = item.stockMinLimit ?? globalMinStock;
      const isCritical = item.theoreticalStock <= minLimit;
      const isLow = item.theoreticalStock > minLimit && item.theoreticalStock <= minLimit * 1.5;

      let status = 'OPTIMO';
      if (isCritical) status = 'CRITICO';
      else if (isLow) status = 'BAJO';

      const matchesStatus = selectedStatus === 'ALL' || status === selectedStatus;

      return matchesSearch && matchesType && matchesSubcategory && matchesZone && matchesStatus;
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
  }, [inventoryItems, searchTerm, selectedInventoryType, selectedSubcategory, selectedProductionZone, selectedStatus, globalMinStock]);

  // Pagination slicing
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));

  // Determine item status info
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

  const getItemTypeLabel = (item: InventoryItem) => {
    const type = getItemType(item);
    if (type === 'PRODUCT') return 'Producto Único';
    if (type === 'PACKAGING') return 'Suministro';
    return 'Ingrediente';
  };

  const handleEditClick = (item: InventoryItem) => {
    const type = getItemType(item);
    const targetUrl = `/inventory/${type.toLowerCase()}/edit/${item.id}`;
    pushNavigationState(targetUrl, {
      from: '/inventory/dashboard',
      originTab: 'INVENTORY_DASHBOARD',
      itemId: item.id,
      itemType: type
    });
    if (onEditItem) {
      onEditItem(item.id, type);
    }
  };

  const handleViewClick = (item: InventoryItem) => {
    const targetUrl = `/inventory/view/${item.id}`;
    pushNavigationState(targetUrl, {
      from: '/inventory/dashboard',
      originTab: 'INVENTORY_DASHBOARD',
      itemId: item.id
    });
    if (onViewItem) {
      onViewItem(item.id);
    }
  };

  const handleExportExcel = () => {
    const headers = ['SKU / ID', 'Nombre', 'Tipo', 'Categoría / Subcategoría', 'Zona Operación', 'Stock Actual', 'Unidad', 'Costo Unitario ($)', 'Valorización Total ($)', 'Estado'];
    const rows = filteredItems.map(item => {
      const typeLabel = getItemTypeLabel(item);
      const statusInfo = getItemStatus(item);
      const totalVal = (item.theoreticalStock || 0) * (item.purchaseCost || 0);
      return [
        item.id,
        `"${item.name.replace(/"/g, '""')}"`,
        typeLabel,
        `"${(item.category || item.supplyCategory || 'General').replace(/"/g, '""')}"`,
        `"${(item.operationZone || '--').replace(/"/g, '""')}"`,
        item.theoreticalStock,
        item.countUnit || 'und',
        item.purchaseCost || 0,
        totalVal,
        statusInfo.label
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_existencias_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Reporte de existencias exportado exitosamente.');
  };

  return (
    <div className="p-6 md:p-8 space-y-6 md:space-y-8 flex flex-col flex-1 h-full min-h-full overflow-y-auto transition-receitly text-left">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-headline font-black text-content flex items-center gap-2">
            Gestión de Inventario
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="material-symbols-outlined text-xs text-slate-400">calendar_today</span>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-wider">
              Última fecha de control: <span className="text-slate-500 font-extrabold">{latestControlDate}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CustomSelect
            value={selectedDate}
            onChange={setSelectedDate}
            options={dateOptions}
            className="bg-surface border border-line rounded-xl px-4 py-2.5 pr-10 text-xs font-bold text-content-secondary shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
          />
          <button
            onClick={() => setAdjustingItemId('')}
            className="btn-receitly-secondary text-xs uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-sm font-bold">difference</span>
            Ajustar Stock
          </button>
          <button
            type="button"
            onClick={() => setShowImportExcelModal(true)}
            data-testid="btn-inventory-import-excel"
            className="btn-receitly-secondary text-xs uppercase tracking-wider flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            Importar Excel
          </button>
          <button
            onClick={() => {
              pushNavigationState('/inventory/onboarding', {
                from: '/inventory/dashboard',
                originTab: 'INVENTORY_DASHBOARD'
              });
              onIngreso();
            }}
            className="btn-receitly text-xs uppercase tracking-wider"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            Ingreso
          </button>
        </div>
      </div>

      {/* Bento Grid Indicators */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
        {/* Metric Card 1: Valor Total */}
        <div className="bg-surface text-white p-6 rounded-3xl relative overflow-hidden shadow-lg border border-line flex flex-col justify-between min-h-[140px]">
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
              {formatCurrency(totalInventoryValue)}
            </h3>
            <p className="text-emerald-400 text-[10px] font-bold mt-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">inventory</span>
              {inventoryItems.length} {inventoryItems.length === 1 ? 'insumo registrado' : 'insumos registrados'}
            </p>
          </div>
        </div>

        {/* Metric Card 2: Tasa Desperdicio */}
        <div className="bg-surface border border-line p-6 rounded-3xl shadow-sm flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-content-secondary">
              Tasa de Desperdicio
            </span>
            <span className="material-symbols-outlined text-rose-500 text-lg bg-rose-500/10 p-1.5 rounded-lg">
              delete_outline
            </span>
          </div>
          <div>
            <h3 className="text-3xl font-black font-mono text-content leading-none">
              {wasteMetrics.wasteRate}%
            </h3>
            <div className="w-full bg-raised h-2 rounded-full mt-3 overflow-hidden">
              <div 
                className="bg-[var(--accent-purple)] h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, wasteMetrics.wasteRate * 10)}%` }}
              ></div>
            </div>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-400 mt-2">
              {wasteMetrics.totalWasteCost > 0 ? `Total en mermas: ${formatCurrency(wasteMetrics.totalWasteCost)}` : 'Meta establecida: < 5%'}
            </p>
          </div>
        </div>

        {/* Metric Card 3: Entradas de Hoy */}
        <div className="bg-surface border border-line p-6 rounded-3xl shadow-sm flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-content-secondary">
              Entradas de Hoy
            </span>
            <span className="material-symbols-outlined text-teal-600 text-lg bg-teal-500/10 p-1.5 rounded-lg">
              assignment_returned
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-3xl font-black font-mono text-content leading-none">
                {todayEntries.count}
              </h3>
              {todayEntries.count > 0 && (
                <div className="flex -space-x-1.5 overflow-hidden">
                  <span className="bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                    ING
                  </span>
                </div>
              )}
            </div>
            <p className="text-teal-600 dark:text-teal-400 text-[9px] font-bold mt-3.5 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${todayEntries.count > 0 ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'}`}></span>
              {todayEntries.lastEntryName ? `Última: ${todayEntries.lastEntryName}` : 'Sin ingresos registrados hoy'}
            </p>
          </div>
        </div>
      </section>

      {/* Maintenance Alerts Section */}
      {maintenanceAssets.length > 0 && (
        <section className="bg-surface p-6 rounded-3xl border border-rose-500/30 dark:border-rose-950/30 shadow-sm space-y-4 shrink-0">
          <div className="flex items-center justify-between pb-2 border-b border-line">
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
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">
                      {asset.category}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">{asset.id}</span>
                  </div>
                  <h4 className="font-bold text-content text-xs mt-1">{asset.name}</h4>
                  <p className="text-[10px] text-content-secondary mt-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">location_on</span>
                    {asset.location}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-rose-500/10 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">event</span>
                    Vencimiento: {asset.nextMaintenanceDate || 'Inmediato'}
                  </span>
                  <span className="text-[8px] bg-rose-500/20 text-rose-600 dark:text-rose-300 font-extrabold px-1.5 py-0.5 rounded">
                    {asset.alertFrequency || 'Periódico'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Critical Stock Alerts Carousel / Grid */}
      <section className="bg-surface p-6 rounded-3xl border border-line shadow-sm space-y-4 shrink-0">
        <div className="flex items-center justify-between pb-2 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-500 text-lg">warning</span>
            <h3 className="font-headline font-bold text-content text-sm">
              Alertas de Stock ({criticalItems.length + lowStockItems.length + expirationAlerts.length})
            </h3>
          </div>
          <button 
            onClick={() => onNavigateToAlerts && onNavigateToAlerts({ level: 'ALL', type: 'ALL' })}
            className="text-[11px] font-bold text-[var(--accent-purple)] hover:underline flex items-center gap-1 cursor-pointer"
          >
            Ver panel de alertas
            <span className="material-symbols-outlined text-xs">chevron_right</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          {/* Critical Items Box */}
          <div 
            onClick={() => onNavigateToAlerts && onNavigateToAlerts({ level: 'Crítico', type: 'Stock' })}
            className="p-4 rounded-2xl bg-rose-500/5 dark:bg-rose-950/10 border border-rose-500/20 dark:border-rose-950/30 flex flex-col justify-between cursor-pointer hover:bg-rose-500/10 dark:hover:bg-rose-950/20 transition-colors"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">
                  Stock Crítico ({criticalItems.length})
                </span>
                <span className="material-symbols-outlined text-rose-500 text-sm">error</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {criticalItems.slice(0, 2).map(item => (
                  <div key={item.id} className="flex justify-between items-center text-xs">
                    <span className="font-bold text-content truncate max-w-[140px]">{item.name}</span>
                    <span className="font-mono text-rose-600 font-bold">{item.theoreticalStock} {item.countUnit}</span>
                  </div>
                ))}
                {criticalItems.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic">No hay existencias críticas.</span>
                )}
              </div>
            </div>
            {criticalItems.length > 2 && (
              <span className="text-[9px] font-bold text-rose-500 mt-2 block">
                +{criticalItems.length - 2} productos adicionales
              </span>
            )}
          </div>

          {/* Low Stock Items Box */}
          <div 
            onClick={() => onNavigateToAlerts && onNavigateToAlerts({ level: 'Bajo', type: 'Stock' })}
            className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-950/10 border border-amber-500/20 dark:border-amber-950/30 flex flex-col justify-between cursor-pointer hover:bg-amber-500/10 dark:hover:bg-amber-950/20 transition-colors"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-wider">
                  Bajo Stock ({lowStockItems.length})
                </span>
                <span className="material-symbols-outlined text-amber-500 text-sm">warning_amber</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {lowStockItems.slice(0, 2).map(item => (
                  <div key={item.id} className="flex justify-between items-center text-xs">
                    <span className="font-bold text-content truncate max-w-[140px]">{item.name}</span>
                    <span className="font-mono text-amber-600 font-bold">{item.theoreticalStock} {item.countUnit}</span>
                  </div>
                ))}
                {lowStockItems.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic">No hay productos en bajo stock.</span>
                )}
              </div>
            </div>
            {lowStockItems.length > 2 && (
              <span className="text-[9px] font-bold text-amber-500 mt-2 block">
                +{lowStockItems.length - 2} productos adicionales
              </span>
            )}
          </div>

          {/* Expirations Box */}
          <div 
            onClick={() => onNavigateToAlerts && onNavigateToAlerts({ type: 'Vencimiento' })}
            className="p-4 rounded-2xl bg-purple-500/5 dark:bg-purple-950/10 border border-purple-500/20 dark:border-purple-950/30 flex flex-col justify-between cursor-pointer hover:bg-purple-500/10 dark:hover:bg-purple-950/20 transition-colors"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-purple-500 uppercase tracking-wider">
                  Próximos a Vencer ({expirationAlerts.length})
                </span>
                <span className="material-symbols-outlined text-purple-500 text-sm">hourglass_bottom</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {expirationAlerts.slice(0, 2).map((alert, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span className="font-bold text-content truncate max-w-[140px]">{alert.name}</span>
                    <span className="text-[10px] text-purple-600 font-bold">{alert.daysLeft}d ({alert.qty})</span>
                  </div>
                ))}
              </div>
            </div>
            <span className="text-[9px] font-bold text-purple-500 mt-2 block">
              Control de calidad activo
            </span>
          </div>
        </div>
      </section>

      {/* Filter and Table Section (Integrated Cascading Header) */}
      <section className="bg-surface border border-line rounded-3xl shadow-sm overflow-hidden transition-all flex flex-col flex-1 min-h-[760px]">
        {/* Unified Integrated Cascading Filters Bar */}
        <div className="p-4 border-b border-line flex flex-col lg:flex-row lg:flex-nowrap items-stretch lg:items-center justify-between gap-2.5 bg-slate-50/50 dark:bg-surface/30 shrink-0">
          
          {/* Quick Search Input (Compacto para mantener todos los filtros en 1 sola línea) */}
          <div className="w-full md:w-[220px] lg:w-[240px] xl:w-[280px] shrink-0 flex items-center gap-2 bg-inset px-3 py-2 rounded-xl border border-line shadow-sm focus-within:border-violet-500 transition-colors">
            <span className="material-symbols-outlined text-slate-400 text-base">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por Nombre, Código o SKU..."
              className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none text-xs w-full font-semibold placeholder-slate-400 dark:placeholder-slate-500 text-content"
            />
          </div>

          {/* Filters Container (Single-Line Responsive Layout) */}
          <div className="flex flex-col md:flex-row lg:flex-nowrap items-stretch md:items-center gap-2 flex-1 min-w-0">
            {/* 1. Categoría Inventario (Principal) */}
            <div className="w-full md:w-auto md:min-w-[130px] md:flex-1">
              <CustomSelect
                value={selectedInventoryType}
                onChange={(val) => {
                  setSelectedInventoryType(val as any);
                  setSelectedSubcategory('ALL');
                  setSelectedProductionZone('ALL');
                  setCurrentPage(1);
                }}
                options={inventoryTypeOptions}
                className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
              />
            </div>

            {/* 2. Subcategoría (Secundario Dinámico) */}
            <div className="w-full md:w-auto md:min-w-[130px] md:flex-1">
              <CustomSelect
                value={selectedSubcategory}
                onChange={(val) => {
                  setSelectedSubcategory(val);
                  setCurrentPage(1);
                }}
                options={subcategoryOptions}
                className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
              />
            </div>

            {/* 3. Zona de Operación (Visibilidad Exclusiva cuando es Suministro) */}
            {selectedInventoryType === 'SUPPLY' && (
              <div className="w-full md:w-auto md:min-w-[130px] md:flex-1 animate-fade-in">
                <CustomSelect
                  value={selectedProductionZone}
                  onChange={(val) => {
                    setSelectedProductionZone(val);
                    setCurrentPage(1);
                  }}
                  options={productionZonesOptions}
                  className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
                />
              </div>
            )}

            {/* 4. Estado Dropdown */}
            <div className="w-full md:w-auto md:min-w-[125px] md:flex-1">
              <CustomSelect
                value={selectedStatus}
                onChange={(val) => {
                  setSelectedStatus(val);
                  setCurrentPage(1);
                }}
                options={statusOptions}
                className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
              />
            </div>

            {/* Producir Lote Subreceta Button */}
            <button
              type="button"
              onClick={() => setIsProduceModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
              title="Registrar producción de lotes de subrecetas con cruce en Kardex"
            >
              <span className="material-symbols-outlined text-sm font-bold">skillet</span>
              <span className="hidden sm:inline">+ Producir Lote</span>
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="p-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center cursor-pointer transition-colors shadow-sm shrink-0"
              title="Exportar reporte de existencias en Excel (.csv)"
            >
              <span className="material-symbols-outlined text-lg">file_download</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-raised p-1 rounded-xl border border-line shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === 'GRID'
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
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
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Vista Tabla"
              >
                <span className="material-symbols-outlined text-sm font-bold">table_rows</span>
              </button>
            </div>

          </div>
        </div>

        {/* Stock List (Table or Grid View Mode with Isolated Vertical Scroll) */}
        {viewMode === 'TABLE' ? (
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-[560px] max-h-[760px] relative">
            <table className="w-full text-left">
              <thead className="bg-slate-50/95 dark:bg-surface/95 backdrop-blur-sm sticky top-0 z-10 text-[10px] font-extrabold uppercase tracking-wider text-content-secondary border-b border-line">
                <tr>
                  <th className="py-4 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={paginatedItems.length > 0 && paginatedItems.every(item => selectedIds.includes(item.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const pageIds = paginatedItems.map(item => item.id);
                          setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                        } else {
                          const pageIds = new Set(paginatedItems.map(item => item.id));
                          setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
                        }
                      }}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                    />
                  </th>
                  <th className="py-4 px-6">Elemento</th>
                  <th className="py-4 px-4">Categoría</th>
                  <th className="py-4 px-4">Tipo</th>
                  <th className="py-4 px-4 text-center">Existencias</th>
                  <th className="py-4 px-4 text-center">Unidad</th>
                  <th className="py-4 px-4">Estado</th>
                  <th className="py-4 px-4">Última Actualización</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/80 text-xs font-semibold">
                {inventoryItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 px-6 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-[var(--accent-purple)] bg-[var(--accent-purple)]/10 p-3 rounded-2xl">
                          inventory_2
                        </span>
                        <div className="space-y-1">
                          <p className="font-bold text-content text-sm">Tu inventario está vacío</p>
                          <p className="text-slate-500 text-xs max-w-sm">Registra tus primeros ingredientes, productos o suministros para comenzar a monitorear stock y mermas.</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
                          <button
                            onClick={onIngreso}
                            className="btn-receitly text-xs"
                          >
                            <span className="material-symbols-outlined text-sm font-bold">add</span>
                            Registrar Nuevo Elemento
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowImportExcelModal(true)}
                            className="btn-receitly-secondary text-xs flex items-center gap-1.5"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                            Carga Masiva Excel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 px-6 text-center text-slate-400 italic">
                      No se encontraron elementos que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => {
                    const statusInfo = getItemStatus(item);
                    const activeBranchId = getActiveBranchId();
                    const activeStock = getPhysicalStockInBranch(item, activeBranchId);
                    const totalGlobal = Number(item.currentStock ?? item.realPhysicalStock ?? item.theoreticalStock ?? activeStock) || 0;
                    const activeBranchesCount = Array.isArray(systemSettings['system_branches'])
                      ? systemSettings['system_branches'].filter((b: any) => b.isActive !== false).length
                      : 1;
                    const hasMultipleDiff = activeBranchesCount > 1 && Math.abs(totalGlobal - activeStock) > 0.01;

                    const dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    }) : 'Sin registro';

                    return (
                      <tr 
                        key={item.id} 
                        onClick={() => handleViewClick(item)}
                        className={`hover:bg-slate-50 dark:hover:bg-raised/40 transition-all cursor-pointer ${
                          selectedIds.includes(item.id) ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''
                        }`}
                      >
                        <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedIds(prev =>
                                prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                              );
                            }}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                          />
                        </td>
                        <td className="py-4 px-6">
                          <div>
                            <p className="font-bold text-content leading-tight hover:text-[var(--accent-purple)] transition-colors">
                              {item.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.id}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="bg-raised text-content-secondary text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-line">
                            {item.category || item.supplyCategory || 'General'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-content-secondary font-semibold">
                          {getItemTypeLabel(item)}
                        </td>
                        <td className="py-4 px-4 text-center font-mono font-bold text-sm text-content">
                          {formatQuantityDecimals(activeStock)}
                          {hasMultipleDiff && (
                            <span className="block text-[9px] text-slate-400 font-medium">
                              (Global: {formatQuantityDecimals(totalGlobal)})
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center text-slate-500 uppercase font-black tracking-wider text-[9px]">
                          {item.countUnit || 'und'}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`}></span>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-content-secondary font-semibold">
                          {dateStr}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center">
                            <button
                              onClick={(e) => toggleMenu(e, item)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-raised text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
                              title="Opciones"
                            >
                              <span className="material-symbols-outlined text-base font-bold">more_vert</span>
                            </button>
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
          <div className="p-6 overflow-y-auto flex-1">
            {inventoryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <span className="material-symbols-outlined text-4xl text-[var(--accent-purple)] bg-[var(--accent-purple)]/10 p-3 rounded-2xl">
                  inventory_2
                </span>
                <div className="space-y-1">
                  <p className="font-bold text-content text-sm">Tu inventario está vacío</p>
                  <p className="text-slate-500 text-xs max-w-sm">Registra tus primeros ingredientes, productos o suministros para comenzar a monitorear existencias.</p>
                </div>
                <button
                  onClick={onIngreso}
                  className="mt-2 btn-receitly text-xs"
                >
                  <span className="material-symbols-outlined text-sm font-bold">add</span>
                  Registrar Nuevo Elemento
                </button>
              </div>
            ) : paginatedItems.length === 0 ? (
              <p className="text-center text-slate-400 italic py-12">
                No se encontraron elementos que coincidan con los filtros seleccionados.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Header Selección Múltiple para Grid */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-inset rounded-xl border border-line text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={paginatedItems.length > 0 && paginatedItems.every(item => selectedIds.includes(item.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const pageIds = paginatedItems.map(item => item.id);
                          setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                        } else {
                          const pageIds = new Set(paginatedItems.map(item => item.id));
                          setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
                        }
                      }}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Seleccionar página ({paginatedItems.length})
                    </span>
                  </label>
                  {selectedIds.length > 0 && (
                    <span className="text-purple-600 dark:text-purple-400 font-bold text-xs">
                      {selectedIds.length} seleccionados
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {paginatedItems.map((item) => {
                  const activeBranchId = getActiveBranchId();
                  const activeStock = getPhysicalStockInBranch(item, activeBranchId);
                  const totalGlobal = Number(item.currentStock ?? item.realPhysicalStock ?? item.theoreticalStock ?? activeStock) || 0;
                  const activeBranchesCount = Array.isArray(systemSettings['system_branches'])
                    ? systemSettings['system_branches'].filter((b: any) => b.isActive !== false).length
                    : 1;
                  const hasMultipleDiff = activeBranchesCount > 1 && Math.abs(totalGlobal - activeStock) > 0.01;

                  const minLimit = item.stockMinLimit ?? globalMinStock;
                  const isStockCritical = activeStock <= minLimit;

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

                  return (
                    <div 
                      key={item.id}
                      onClick={() => handleViewClick(item)}
                      className={`bg-surface rounded-2xl p-5 shadow-sm border ${
                        selectedIds.includes(item.id)
                          ? 'border-purple-500 ring-2 ring-purple-500/20'
                          : 'border-line'
                      } hover:shadow-md transition-all flex items-start gap-4 text-left cursor-pointer relative`}
                    >
                      {/* Selection Checkbox */}
                      <label
                        className={`w-5 h-5 shrink-0 rounded flex items-center justify-center cursor-pointer transition-colors mt-0.5 ${
                          selectedIds.includes(item.id)
                            ? 'bg-purple-600 text-white'
                            : 'border border-slate-300 dark:border-slate-600 hover:border-purple-500'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedIds(prev =>
                              prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                            );
                          }}
                          className="hidden"
                        />
                        <span className="material-symbols-outlined text-[14px]">
                          {selectedIds.includes(item.id) ? 'check' : ''}
                        </span>
                      </label>

                      {/* Compact Image Box */}
                      <div className="w-[60px] h-[60px] shrink-0 relative rounded-xl overflow-hidden bg-raised border border-line">
                        <img
                          src={item.img || getItemFallbackImg(item)}
                          alt={item.name}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      {/* Content details */}
                      <div className="flex-1 min-w-0 grid grid-cols-1 gap-1.5">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                              {item.category || item.supplyCategory || 'General'} • {getItemTypeLabel(item)}
                            </span>
                            <h4 
                              className="font-bold text-content leading-tight hover:text-[var(--accent-purple)] transition-colors truncate text-sm mt-0.5"
                              title={item.name}
                            >
                              {item.name}
                            </h4>
                            
                            {/* Alert Badges Row */}
                            <div className="flex flex-wrap gap-1.5 mt-1 h-5 items-center">
                              {isStockCritical && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                                  Stock Crítico
                                </span>
                              )}
                              {isExpiringSoon && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Próximo a vencer
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Dropdown Menu Action */}
                          <div className="shrink-0">
                            <button
                              onClick={(e) => toggleMenu(e, item)}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-raised text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Opciones"
                            >
                              <span className="material-symbols-outlined text-base font-bold">more_vert</span>
                            </button>
                          </div>
                        </div>

                        {/* Quantitative Stock Specs Footer */}
                        <div className="flex justify-between items-center pt-2 border-t border-line-subtle mt-1">
                          <span className="text-[10px] text-content-secondary font-medium font-mono">
                            SKU: {item.id}
                          </span>
                          <span className="font-mono font-black text-sm text-content text-right">
                            {formatQuantityDecimals(activeStock)} <span className="text-[9px] text-slate-400 font-bold uppercase">{item.countUnit}</span>
                            {hasMultipleDiff && (
                              <span className="block text-[9px] text-slate-400 font-medium font-sans">
                                (Global: {formatQuantityDecimals(totalGlobal)})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-line flex items-center justify-between bg-slate-50/50 dark:bg-surface/30">
            <span className="text-xs font-semibold text-slate-500">
              Página {currentPage} de {totalPages} ({filteredItems.length} elementos)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-line bg-inset text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-line bg-inset text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Manual Stock Adjustment Modal */}
      {adjustingItemId !== null && (
        <Modal 
          isOpen={true} 
          onClose={() => setAdjustingItemId(null)}
          title="Ajuste Manual de Inventario"
        >
          <InventoryAdjustment 
            isOpen={true}
            preselectedItemId={adjustingItemId || undefined}
            onClose={() => setAdjustingItemId(null)}
          />
        </Modal>
      )}

      {/* Kardex Modal */}
      {selectedKardexItemId && (
        <Modal 
          isOpen={true} 
          onClose={() => setSelectedKardexItemId(null)}
          title="Kardex de Movimientos de Inventario"
        >
          <div className="p-6 space-y-4">
            <div className="p-4 bg-inset rounded-xl border border-line">
              <p className="text-xs font-bold text-content">
                Histórico de Kardex para: <span className="font-mono text-[var(--accent-purple)]">{selectedKardexItemId}</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Todas las entradas, salidas, mermas y ajustes registrados para este elemento.
              </p>
            </div>
            <div className="text-center py-6 text-slate-400 italic text-xs">
              Sin movimientos recientes registrados en esta sesión.
            </div>
            <button
              onClick={() => setSelectedKardexItemId(null)}
              className="w-full py-2.5 bg-slate-200 dark:bg-slate-700 text-content font-bold text-xs rounded-xl"
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Item Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deletingItemId !== null}
        onClose={() => setDeletingItemId(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar Insumo del Inventario"
        message="¿Estás seguro de que deseas eliminar este insumo? Esta acción eliminará permanentemente sus existencias en todas las sucursales."
        confirmText="Eliminar permanentemente"
        cancelText="Cancelar"
      />

      {/* Bulk Delete Confirm Dialog */}
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          isOpen={showBulkDeleteConfirm}
          onClose={() => setShowBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Eliminación Múltiple de Inventario"
          message={`¿Estás seguro de que deseas eliminar permanentemente ${selectedIds.length} elemento(s) del inventario? Esta acción se sincronizará con la nube y eliminará sus existencias de forma definitiva.`}
          confirmText={`Eliminar ${selectedIds.length} elementos`}
          cancelText="Cancelar"
        />
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
      />

      {/* Bulk Excel Import Modal */}
      <ImportInventoryExcelModal
        isOpen={showImportExcelModal}
        onClose={() => setShowImportExcelModal(false)}
      />

      {/* Contextual Dropdown Menu via Floating Portal (Prevents row & card height expansion) */}
      {activeMenuAnchor && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[9998] bg-transparent" 
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuAnchor(null);
            }} 
          />
          <div 
            style={{
              position: 'fixed',
              top: activeMenuAnchor.openUpwards ? undefined : `${activeMenuAnchor.top}px`,
              bottom: activeMenuAnchor.openUpwards ? `${window.innerHeight - activeMenuAnchor.top}px` : undefined,
              left: `${Math.max(16, activeMenuAnchor.left - 192)}px`,
            }}
            className="z-[9999] w-48 bg-surface border border-line shadow-2xl rounded-2xl py-1.5 text-left divide-y divide-line animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                const item = activeMenuAnchor.item;
                setActiveMenuAnchor(null);
                handleViewClick(item);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-content-secondary hover:bg-slate-50 dark:hover:bg-raised flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm font-bold">visibility</span>
              Ver Ficha
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const item = activeMenuAnchor.item;
                setActiveMenuAnchor(null);
                handleEditClick(item);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-content-secondary hover:bg-slate-50 dark:hover:bg-raised flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm font-bold">edit</span>
              Editar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const item = activeMenuAnchor.item;
                setActiveMenuAnchor(null);
                setAdjustingItemId(item.id);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-content-secondary hover:bg-slate-50 dark:hover:bg-raised flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm font-bold">difference</span>
              Ajustar Stock
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const item = activeMenuAnchor.item;
                setActiveMenuAnchor(null);
                setSelectedKardexItemId(item.id);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-content-secondary hover:bg-slate-50 dark:hover:bg-raised flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm font-bold">history</span>
              Ver Kardex
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const item = activeMenuAnchor.item;
                setActiveMenuAnchor(null);
                setDeletingItemId(item.id);
              }}
              className="w-full text-left px-4 py-2 text-xs font-black text-rose-500 hover:bg-rose-500/5 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm font-bold">delete</span>
              Eliminar
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Subrecipe Batch Production Modal */}
      {isProduceModalOpen && (
        <ProduceSubRecipeModal
          isOpen={isProduceModalOpen}
          onClose={() => setIsProduceModalOpen(false)}
        />
      )}
    </div>
  );
}
