// src/components/itemOnboarding.tsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import { deleteRecordFromFirestore, bulkDeleteRecords } from '../services/syncService';
import { Search, CheckCircle2, AlertTriangle, AlertOctagon, Box, X } from 'lucide-react';
import toast from 'react-hot-toast';
import InventoryOnboardingForm from './inventoryOnboardingForm';
import SupplyOnboardingForm from './supplyOnboardingForm';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';
import InventoryItemDetail from './InventoryItemDetail';
import BulkActionBar from './ui/BulkActionBar';

import {
  useIngredientCategories,
  useSupplyCategories,
  useMenuCategories,
  useProductionZones
} from '../hooks/useCatalogs';
import {
  getItemResourceType,
  getResourceTypeLabel,
  getResourceTypeBadgeStyle
} from '../utils/dataHelper';
import { pushNavigationState, getNavigationState } from '../utils/navigation';
import { useVoiceCopilot } from '../context/VoiceCopilotContext';
import type { VoiceIngredientExtraction } from '../types/voiceCopilot';
import { getPhysicalStockInBranch } from '../types';
import { getActiveBranchId, formatQuantityDecimals } from '../utils/branchHelper';

interface ItemOnboardingProps {
  onBack: () => void;
  editItemId?: string | null;
  editItemType?: string | null;
  onEditItem?: (itemId: string, type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET') => void;
  onViewItem?: (itemId: string) => void;
}

type OnboardingType = 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET' | null;

const ItemOnboarding = React.memo(function ItemOnboarding({ onBack, editItemId, editItemType, onEditItem, onViewItem }: ItemOnboardingProps) {
  const [activeForm, setActiveForm] = useState<OnboardingType>(
    (editItemType as OnboardingType) || null
  );

  const [copilotPrefill, setCopilotPrefill] = useState<VoiceIngredientExtraction | null>(() => {
    return (getNavigationState()?.prefillData as VoiceIngredientExtraction) || null;
  });

  const [selectedEditId, setSelectedEditId] = useState<string | null>(editItemId || null);
  const [selectedDetailItemId, setSelectedDetailItemId] = useState<string | null>(null);
  const [activeMenuAnchor, setActiveMenuAnchor] = useState<{
    id: string;
    name: string;
    resType: any;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);

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

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string, name: string, resType: any) => {
    e.stopPropagation();
    if (activeMenuAnchor?.id === id) {
      setActiveMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;
    setActiveMenuAnchor({
      id,
      name,
      resType,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(16, rect.right),
      openUpwards
    });
  };

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Sync props to state if provided externally
  useEffect(() => {
    if (editItemId !== undefined) setSelectedEditId(editItemId);
    if (editItemType !== undefined) setActiveForm((editItemType as OnboardingType) || null);
  }, [editItemId, editItemType]);

  const copilot = useVoiceCopilot();

  useEffect(() => {
    if (activeForm === null && copilot?.setMode) {
      copilot.setMode('ONBOARDING');
    }
  }, [activeForm, copilot]);

  // Read initial history state if navigated with prefillData
  useEffect(() => {
    const navState = getNavigationState();
    if (navState?.prefillData) {
      setCopilotPrefill(navState.prefillData);
      if (navState.target === 'INGREDIENT') setActiveForm('INGREDIENT');
      else if (navState.target === 'PRODUCT') setActiveForm('PRODUCT');
      else if (navState.target === 'SUPPLY' || navState.target === 'PACKAGING') setActiveForm('PACKAGING');
    }
  }, []);

  useEffect(() => {
    const handleCopilotNav = (e: any) => {
      const target = e.detail?.target;
      const prefill = e.detail?.prefillData;
      if (prefill) {
        setCopilotPrefill(prefill);
      }
      if (target === 'INGREDIENT') {
        setActiveForm('INGREDIENT');
      } else if (target === 'PRODUCT') {
        setActiveForm('PRODUCT');
      } else if (target === 'SUPPLY' || target === 'PACKAGING') {
        setActiveForm('PACKAGING');
      }
    };
    window.addEventListener('copilot-navigate', handleCopilotNav);
    return () => window.removeEventListener('copilot-navigate', handleCopilotNav);
  }, []);

  // Deletion confirm state
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);

  // Search & Filter state for pre-verification
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedProductionZone, setSelectedProductionZone] = useState<string>('ALL');
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('ALL');

  // Fetch Dexie data safely
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Exclude fixed assets ('ASSET') from operational onboarding
  const operationalInventoryItems = useMemo(() => {
    return inventoryItems.filter(item => item.inventoryType !== 'ASSET');
  }, [inventoryItems]);

  const ingredientCats = useIngredientCategories();
  const supplyCats = useSupplyCategories();
  const menuCats = useMenuCategories();
  const productionZones = useProductionZones();

  // 1. Categoría Inventario options (excluye Activos)
  const inventoryTypeOptions = useMemo(() => [
    { value: 'ALL', label: 'Categoría: Todos' },
    { value: 'PRODUCT', label: 'Producto Único' },
    { value: 'INGREDIENT', label: 'Ingrediente' },
    { value: 'SUPPLY', label: 'Suministro' },
  ], []);

  // 2. Subcategoría options (Cascada Dinámica)
  const subcategoryOptions = useMemo(() => {
    let list: string[] = [];

    if (selectedTypeFilter === 'INGREDIENT') {
      list = ingredientCats;
    } else if (selectedTypeFilter === 'SUPPLY') {
      list = supplyCats;
    } else if (selectedTypeFilter === 'PRODUCT') {
      list = menuCats;
    } else {
      const allItemCats = new Set<string>();
      ingredientCats.forEach(c => allItemCats.add(c));
      supplyCats.forEach(c => allItemCats.add(c));
      menuCats.forEach(c => allItemCats.add(c));
      operationalInventoryItems.forEach(i => {
        if (i.category) allItemCats.add(i.category);
        if (i.supplyCategory) allItemCats.add(i.supplyCategory);
      });
      list = Array.from(allItemCats);
    }

    return [
      { value: 'ALL', label: 'Todas las Subcategorías' },
      ...list.sort().map(cat => ({ value: cat, label: cat }))
    ];
  }, [selectedTypeFilter, ingredientCats, supplyCats, menuCats, operationalInventoryItems]);

  // 3. Zona de Producción / Operación options
  const productionZonesOptions = useMemo(() => [
    { value: 'ALL', label: 'Todas las Zonas de Producción' },
    ...productionZones.map(z => ({ value: z, label: z }))
  ], [productionZones]);

  // 4. Estado de Stock options
  const stockStatusOptions = useMemo(() => [
    { value: 'ALL', label: 'Todos los Estados' },
    { value: 'OPTIMO', label: 'Óptimo' },
    { value: 'BAJO', label: 'Bajo Stock' },
    { value: 'CRITICO', label: 'Stock Crítico' },
  ], []);

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== '' ||
      selectedTypeFilter !== 'ALL' ||
      selectedCategoryFilter !== 'ALL' ||
      selectedProductionZone !== 'ALL' ||
      selectedStockStatus !== 'ALL'
    );
  }, [searchTerm, selectedTypeFilter, selectedCategoryFilter, selectedProductionZone, selectedStockStatus]);

  // Clear all filters
  const handleClearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedTypeFilter('ALL');
    setSelectedCategoryFilter('ALL');
    setSelectedProductionZone('ALL');
    setSelectedStockStatus('ALL');
  }, []);

  // Filtered Inventory items
  const filteredItems = useMemo(() => {
    return operationalInventoryItems.filter(item => {
      const resType = getItemResourceType(item);
      const stockVal = item.theoreticalStock ?? item.realPhysicalStock ?? 0;
      const minLimit = item.stockMinLimit || 0;

      // 1. Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = item.name?.toLowerCase().includes(query);
        const matchesId = item.id?.toLowerCase().includes(query);
        const matchesCat = item.category?.toLowerCase().includes(query) || item.supplyCategory?.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesCat && !matchesDesc) {
          return false;
        }
      }

      // 2. Type filter (Excluye ASSET)
      if (selectedTypeFilter !== 'ALL') {
        const mappedType = selectedTypeFilter === 'SUPPLY' ? 'PACKAGING' : selectedTypeFilter;
        if (resType !== mappedType) return false;
      }

      // 3. Subcategory filter
      if (selectedCategoryFilter !== 'ALL') {
        const matchesCategory = item.category === selectedCategoryFilter || item.supplyCategory === selectedCategoryFilter;
        if (!matchesCategory) return false;
      }

      // 4. Production Zone filter (Solo para Suministros)
      if (selectedTypeFilter === 'SUPPLY' && selectedProductionZone !== 'ALL') {
        if (item.operationZone !== selectedProductionZone) return false;
      }

      // 5. Stock Status filter
      if (selectedStockStatus !== 'ALL') {
        const isCritical = stockVal <= 0 || (minLimit > 0 && stockVal <= minLimit / 2);
        const isLow = !isCritical && minLimit > 0 && stockVal <= minLimit;
        const isNormal = !isCritical && !isLow;

        if (selectedStockStatus === 'CRITICO' && !isCritical) return false;
        if (selectedStockStatus === 'BAJO' && !isLow) return false;
        if (selectedStockStatus === 'OPTIMO' && !isNormal) return false;
      }

      return true;
    });
  }, [operationalInventoryItems, selectedTypeFilter, selectedCategoryFilter, selectedProductionZone, selectedStockStatus, searchTerm]);

  // Export filtered items to Excel (.csv UTF-8 BOM)
  const handleExportExcel = () => {
    const headers = ['SKU / ID', 'Nombre', 'Tipo', 'Categoría / Subcategoría', 'Zona Operación', 'Stock Actual', 'Unidad', 'Estado'];
    const rows = filteredItems.map(item => {
      const resType = getItemResourceType(item);
      const typeLabel = getResourceTypeLabel(resType);
      const stockVal = item.theoreticalStock ?? item.realPhysicalStock ?? 0;
      const minLimit = item.stockMinLimit || 0;

      const isCritical = stockVal <= 0 || (minLimit > 0 && stockVal <= minLimit / 2);
      const isLow = !isCritical && minLimit > 0 && stockVal <= minLimit;
      const statusLabel = isCritical ? 'Stock Crítico' : isLow ? 'Bajo Stock' : 'Normal';

      return [
        item.id,
        `"${item.name.replace(/"/g, '""')}"`,
        typeLabel,
        `"${(item.category || item.supplyCategory || 'General').replace(/"/g, '""')}"`,
        `"${(item.operationZone || '--').replace(/"/g, '""')}"`,
        stockVal,
        item.purchaseUnit || item.countUnit || 'und',
        statusLabel
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_existencias_previas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Reporte de existencias exportado exitosamente.');
  };

  const handleSelectCard = (type: OnboardingType) => {
    const targetUrl = `/inventory/${type?.toLowerCase() || 'item'}/new`;
    pushNavigationState(targetUrl, {
      from: '/inventory/onboarding',
      originTab: 'INVENTORY_ONBOARDING',
      itemType: type || undefined
    });
    setSelectedEditId(null);
    setActiveForm(type);
  };

  const handleViewClick = (itemId: string) => {
    const targetUrl = `/inventory/view/${itemId}`;
    pushNavigationState(targetUrl, {
      from: '/inventory/onboarding',
      originTab: 'INVENTORY_ONBOARDING',
      itemId
    });
    if (onViewItem) {
      onViewItem(itemId);
    } else {
      setSelectedDetailItemId(itemId);
    }
  };

  const handleEditClick = (itemId: string, type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET') => {
    const targetUrl = `/inventory/${type.toLowerCase()}/edit/${itemId}`;
    pushNavigationState(targetUrl, {
      from: '/inventory/onboarding',
      originTab: 'INVENTORY_ONBOARDING',
      itemId,
      itemType: type
    });
    if (onEditItem) {
      onEditItem(itemId, type);
    } else {
      setSelectedEditId(itemId);
      setActiveForm(type);
    }
  };

  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      try {
        await deleteRecordFromFirestore('inventoryItems', itemToDelete.id);
        toast.success(`"${itemToDelete.name}" eliminado correctamente de existencias.`);
      } catch (error) {
        console.error('Error al eliminar elemento de IndexedDB:', error);
        toast.error('Error al eliminar el elemento.');
      } finally {
        setItemToDelete(null);
      }
    }
  };

  // Bulk selection calculations & handlers
  const isAllSelected = useMemo(() => {
    return filteredItems.length > 0 && filteredItems.every(i => selectedIds.includes(i.id));
  }, [filteredItems, selectedIds]);

  const isSomeSelected = useMemo(() => {
    return selectedIds.length > 0 && !isAllSelected;
  }, [selectedIds, isAllSelected]);

  const handleToggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(i => i.id));
    }
  }, [isAllSelected, filteredItems]);

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDeleteRecords('inventoryItems', selectedIds);
      toast.success(`${selectedIds.length} elemento(s) eliminado(s) correctamente.`);
      setSelectedIds([]);
    } catch (error) {
      console.error('Error al realizar borrado masivo:', error);
      toast.error('Error al eliminar los elementos seleccionados.');
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  const handleFormBack = useCallback(() => {
    setSelectedEditId(null);
    setCopilotPrefill(null);
    setActiveForm(null);
    setSelectedIds([]);
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-6 md:space-y-8 flex flex-col flex-1 h-full min-h-full transition-receitly font-sans text-content text-left">
      {activeForm ? (
        activeForm === 'PACKAGING' ? (
          <SupplyOnboardingForm editItemId={selectedEditId} onBack={handleFormBack} prefillData={copilotPrefill} />
        ) : (
          <InventoryOnboardingForm type={activeForm} editItemId={selectedEditId} onBack={handleFormBack} prefillData={copilotPrefill} />
        )
      ) : (
        <div className="space-y-6 md:space-y-8 flex flex-col flex-1 h-full">
          {/* Top navigation for Selection Screen */}
          <div className="flex flex-col gap-2 pb-4 border-b border-line shrink-0">
            <button
              onClick={onBack}
              className="text-content-secondary hover:text-[var(--accent-purple)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:underline cursor-pointer border-none bg-transparent self-start"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              REGRESAR AL INVENTARIO
            </button>

            <h2 className="text-xl font-headline font-black text-content mt-1">
              Nuevo Elemento de Inventario
            </h2>
            <p className="text-slate-500 font-semibold text-xs leading-relaxed">
              Selecciona la categoría del recurso que deseas crear:
            </p>
          </div>

          {/* Grid Selection */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
            {/* Card 1: Producto Único */}
            <div
              onClick={() => handleSelectCard('PRODUCT')}
              className="group cursor-pointer bg-inset p-6 rounded-xl border border-line shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex items-start gap-4"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--accent-purple)]/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="w-12 h-12 shrink-0 bg-[var(--accent-purple)]/10 dark:bg-[var(--accent-purple)]/20 rounded-xl flex items-center justify-center text-[var(--accent-purple)] shadow-inner">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>liquor</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-content leading-tight">Producto Único</h3>
                <p className="text-content-secondary text-xs leading-normal mt-1">
                  Artículos de venta directa que no requieren transformación (bebidas embotelladas, licores cerrados).
                </p>
              </div>
              <span className="material-symbols-outlined text-slate-400 group-hover:text-[var(--accent-purple)] self-center transition-colors">chevron_right</span>
            </div>

            {/* Card 2: Ingrediente / Insumo */}
            <div
              onClick={() => handleSelectCard('INGREDIENT')}
              className="group cursor-pointer bg-inset p-6 rounded-xl border border-line shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex items-start gap-4"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-teal-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="w-12 h-12 shrink-0 bg-teal-100 dark:bg-teal-950/45 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400 shadow-inner">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-content leading-tight">Ingrediente</h3>
                <p className="text-content-secondary text-xs leading-normal mt-1">
                  Materia prima comprada por volumen o peso para formar recetas o subrecetas en cocina y barra.
                </p>
              </div>
              <span className="material-symbols-outlined text-slate-400 group-hover:text-teal-500 self-center transition-colors">chevron_right</span>
            </div>

            {/* Card 3: Suministros */}
            <div
              onClick={() => handleSelectCard('PACKAGING')}
              className="group cursor-pointer bg-inset p-6 rounded-xl border border-line shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex items-start gap-4"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="w-12 h-12 shrink-0 bg-purple-100 dark:bg-purple-950/45 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-inner">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>package_2</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-content leading-tight">Suministro</h3>
                <p className="text-content-secondary text-xs leading-normal mt-1">
                  Suministros operativos no comestibles que impactan el costo del despacho a domicilio.
                </p>
              </div>
              <span className="material-symbols-outlined text-slate-400 group-hover:text-purple-600 self-center transition-colors">chevron_right</span>
            </div>
          </section>

          {/* Section: Verificación Previa de Existencias */}
          <section className="bg-inset rounded-xl border border-line p-6 space-y-5 shadow-sm flex flex-col flex-1 min-h-[720px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line shrink-0">
              <div>
                <h3 className="text-base font-bold text-content flex items-center gap-2">
                  <Search className="w-5 h-5 text-[var(--accent-purple)]" />
                  Verificación Previa de Existencias
                </h3>
                <p className="text-xs text-content-secondary mt-1">
                  Consulta tus existencias en IndexedDB antes de registrar un nuevo elemento para evitar duplicados.
                </p>
              </div>

              <div className="text-xs font-semibold px-3 py-1.5 bg-raised rounded-xl text-content-secondary self-start sm:self-auto">
                Total Registrados: <span className="font-bold text-content">{operationalInventoryItems.length}</span>
              </div>
            </div>

            {/* Integrated Toolbar matching InventoryDashboard.tsx */}
            <div className="p-4 border border-line flex flex-col lg:flex-row lg:flex-nowrap items-stretch lg:items-center justify-between gap-2.5 bg-slate-50/50 dark:bg-surface/30 rounded-xl shrink-0">
              {/* Quick Search Input (Compacto para mantener todos los filtros en 1 sola línea) */}
              <div className="w-full md:w-[220px] lg:w-[250px] xl:w-[290px] shrink-0 flex items-center gap-2 bg-inset px-3 py-2 rounded-xl border border-line shadow-sm focus-within:border-violet-500 transition-colors">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por Nombre, Código o SKU..."
                  className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none text-xs w-full font-semibold placeholder-slate-400 dark:placeholder-slate-500 text-content"
                />
              </div>

              {/* Filters Container (Single-Line Responsive Layout) */}
              <div className="flex flex-col md:flex-row lg:flex-nowrap items-stretch md:items-center gap-2 flex-1 min-w-0">
                {/* 1. Categoría Inventario (Principal) */}
                <div className="w-full md:w-auto md:min-w-[135px] md:flex-1">
                  <CustomSelect
                    value={selectedTypeFilter}
                    onChange={(val) => {
                      setSelectedTypeFilter(val);
                      setSelectedCategoryFilter('ALL');
                      setSelectedProductionZone('ALL');
                    }}
                    options={inventoryTypeOptions}
                    className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
                  />
                </div>

                {/* 2. Subcategoría (Cascada Dinámica) */}
                <div className="w-full md:w-auto md:min-w-[135px] md:flex-1">
                  <CustomSelect
                    value={selectedCategoryFilter}
                    onChange={setSelectedCategoryFilter}
                    options={subcategoryOptions}
                    className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
                  />
                </div>

                {/* 3. Zona de Operación (Visibilidad Exclusiva cuando es Suministro) */}
                {selectedTypeFilter === 'SUPPLY' && (
                  <div className="w-full md:w-auto md:min-w-[135px] md:flex-1 animate-fade-in">
                    <CustomSelect
                      value={selectedProductionZone}
                      onChange={setSelectedProductionZone}
                      options={productionZonesOptions}
                      className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
                    />
                  </div>
                )}

                {/* 4. Estado de Stock Dropdown */}
                <div className="w-full md:w-auto md:min-w-[135px] md:flex-1">
                  <CustomSelect
                    value={selectedStockStatus}
                    onChange={setSelectedStockStatus}
                    options={stockStatusOptions}
                    className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
                  />
                </div>

                {/* Export Excel Button */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="p-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center cursor-pointer transition-colors shadow-sm shrink-0"
                  title="Exportar reporte de existencias en Excel (.csv)"
                >
                  <span className="material-symbols-outlined text-lg">file_download</span>
                </button>

                {/* Global Clear [X] Button */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="p-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-800/50 flex items-center justify-center cursor-pointer transition-colors shadow-sm shrink-0"
                    title="Limpiar todos los filtros [x]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Results Table or Empty State with Isolated Internal Scroll */}
            {filteredItems.length > 0 ? (
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-[520px] max-h-[680px] rounded-xl border border-line relative">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/95 dark:bg-surface/95 backdrop-blur-sm sticky top-0 z-10 text-content-secondary font-bold uppercase tracking-wider border-b border-line">
                    <tr>
                      <th className="px-4 py-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={el => {
                            if (el) el.indeterminate = isSomeSelected;
                          }}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                          title="Seleccionar todos los elementos"
                        />
                      </th>
                      <th className="px-4 py-3">Elemento</th>
                      <th className="px-4 py-3">Tipo Recurso</th>
                      <th className="px-4 py-3">Categoría</th>
                      <th className="px-4 py-3">Stock Actual</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60 font-medium">
                    {filteredItems.map((item) => {
                      const resType = getItemResourceType(item);
                      const activeBranchId = getActiveBranchId();
                      const activeStock = getPhysicalStockInBranch(item, activeBranchId);
                      const totalGlobal = Number(item.currentStock ?? item.realPhysicalStock ?? item.theoreticalStock ?? activeStock) || 0;
                      const hasMultipleDiff = totalGlobal !== activeStock;

                      const minLimit = item.stockMinLimit || 0;
                      const isCritical = activeStock <= 0 || (minLimit > 0 && activeStock <= minLimit / 2);
                      const isLow = !isCritical && minLimit > 0 && activeStock <= minLimit;
                      const isSelected = selectedIds.includes(item.id);

                      return (
                        <tr 
                          key={item.id} 
                          onClick={() => handleViewClick(item.id)}
                          className={`hover:bg-slate-50/80 dark:hover:bg-raised/40 transition-colors cursor-pointer ${
                            isSelected ? 'bg-purple-50/60 dark:bg-purple-950/20' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.id)}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-content hover:text-[var(--accent-purple)] transition-colors">{item.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.id}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getResourceTypeBadgeStyle(resType)}`}>
                              {getResourceTypeLabel(resType)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-content-secondary">
                            {item.category || item.supplyCategory || 'General'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-content">
                              {formatQuantityDecimals(activeStock)}
                            </span>{' '}
                            <span className="text-[10px] text-slate-500 font-semibold">{item.purchaseUnit || item.countUnit || 'Unidades'}</span>
                            {hasMultipleDiff && (
                              <span className="block text-[9px] text-slate-400 font-medium">
                                (Global: {formatQuantityDecimals(totalGlobal)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isCritical ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                <AlertOctagon className="w-3.5 h-3.5" />
                                Stock Crítico
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Bajo Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Normal
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(e) => toggleMenu(e, item.id, item.name, resType)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-raised text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                                title="Opciones"
                              >
                                <span className="material-symbols-outlined text-base font-bold">more_vert</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Clean EmptyState */
              <div className="py-12 px-4 rounded-xl border border-dashed border-line bg-slate-50/50 dark:bg-raised/20 text-center flex flex-col items-center justify-center gap-3 flex-1">
                <div className="w-12 h-12 rounded-full bg-raised flex items-center justify-center text-slate-400">
                  <Box className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1">
                  <h4 className="text-sm font-bold text-content">
                    No se encontraron elementos existentes con este criterio
                  </h4>
                  <p className="text-xs text-content-secondary leading-relaxed">
                    No se encontraron elementos existentes con este nombre. Puedes proceder a crear uno nuevo arriba.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        itemLabel="elementos"
        onClear={() => setSelectedIds([])}
        onDelete={() => setShowBulkDeleteConfirm(true)}
      />

      {/* Detail Modal View */}
      {selectedDetailItemId && (
        <InventoryItemDetail
          itemId={selectedDetailItemId}
          onBack={() => setSelectedDetailItemId(null)}
          onEdit={(id, type) => {
            setSelectedDetailItemId(null);
            handleEditClick(id, type as any);
          }}
        />
      )}

      {/* Confirmation Dialog for Single Item Deletion */}
      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar Elemento de Inventario"
        message={`¿Estás seguro de que deseas eliminar "${itemToDelete?.name}"? Esta acción removerá el ítem permanentemente de tus existencias y no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />

      {/* Confirmation Dialog for Bulk Deletion */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleConfirmBulkDelete}
        title="Confirmar eliminación múltiple"
        message={`¿Estás seguro de que deseas eliminar permanentemente ${selectedIds.length} elemento(s) seleccionados de existencias previas? Esta acción se sincronizará de forma atómica y no se puede deshacer.`}
        confirmText={`Eliminar ${selectedIds.length} elementos`}
        cancelText="Cancelar"
      />

      {/* Contextual Dropdown Menu via Floating Portal */}
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
            className="z-[9999] w-48 bg-surface border border-line shadow-2xl rounded-xl py-1.5 text-left divide-y divide-line animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const id = activeMenuAnchor.id;
                setActiveMenuAnchor(null);
                handleViewClick(id);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-content-secondary hover:bg-slate-50 dark:hover:bg-raised flex items-center gap-2 cursor-pointer border-none"
            >
              <span className="material-symbols-outlined text-sm font-bold">visibility</span>
              Visualizar
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const { id, resType } = activeMenuAnchor;
                setActiveMenuAnchor(null);
                handleEditClick(id, resType);
              }}
              className="w-full text-left px-4 py-2 text-xs font-bold text-content-secondary hover:bg-slate-50 dark:hover:bg-raised flex items-center gap-2 cursor-pointer border-none"
            >
              <span className="material-symbols-outlined text-sm font-bold">edit</span>
              Editar
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const { id, name } = activeMenuAnchor;
                setActiveMenuAnchor(null);
                setItemToDelete({ id, name });
              }}
              className="w-full text-left px-4 py-2 text-xs font-black text-rose-500 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer border-none"
            >
              <span className="material-symbols-outlined text-sm font-bold">delete</span>
              Eliminar
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
});

export default ItemOnboarding;
