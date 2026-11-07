import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';

import type { InventoryItem, SucursalStock } from '../types';
import { getPhysicalStockInBranch } from '../types';
import { getDropdownOptions } from '../utils/dataHelper';
import ImageUploader from './ImageUploader';
import SupplierForm from './supplierForm';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import toast from 'react-hot-toast';
import DatePicker from './ui/DatePicker';
import CustomSelect from './ui/CustomSelect';
import CategorySelector from './ui/CategorySelector';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { FormActionsBar } from './ui/FormActionsBar';
import useFormExitGuard from '../hooks/useFormExitGuard';
import DiscardChangesModal from './ui/DiscardChangesModal';
import { formatCurrency } from '../utils/formatters';
import { useVoiceCopilotRegistration } from '../context/VoiceCopilotContext';
import type { VoiceIngredientExtraction } from '../types/voiceCopilot';
import { OPERATIONAL_ZONE_OPTIONS, normalizeOperationalZone, getOperationalZoneLabel } from '../utils/operationalZones';
import { consolidateSucursalStock, consolidateStockByBranch, areBranchIdsEqual } from '../utils/branchHelper';

interface SupplyOnboardingFormProps {
  onBack: () => void;
  editItemId?: string | null;
  prefillData?: VoiceIngredientExtraction | null;
}

const SupplyOnboardingForm = React.memo(function SupplyOnboardingForm({ onBack, editItemId, prefillData }: SupplyOnboardingFormProps) {
  // Load system settings reactively
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const supplyCategories = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  const supplyCategoriesList = supplyCategories.map(c => c.name);
  const officialUnitsList = useMemo(() => {
    const opts = systemSettings?.['official_units'];
    if (Array.isArray(opts) && opts.length > 0) return opts.filter(Boolean);
    const fallback = getDropdownOptions('official_units', systemSettings);
    if (Array.isArray(fallback) && fallback.length > 0) return fallback.filter(Boolean);
    return [];
  }, [systemSettings]);

  // Card 1: Element Information
  const [name, setName] = useState('');
  const [supplyCategory, setSupplyCategory] = useState('');
  const [operationZone, setOperationZone] = useState('');
  const [description, setDescription] = useState('');

  // Card 2: Logistics and Structured Purchase Costs
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [cantidadComprada, setCantidadComprada] = useState<number | ''>('');
  const [precioCompra, setPrecioCompra] = useState<number | ''>('');
  const [purchaseCost, setPurchaseCost] = useState<number | ''>('');
  const [supplier, setSupplier] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // Real-time calculated unit cost from structured purchase inputs
  const calculatedUnitCost = useMemo(() => {
    const qty = typeof cantidadComprada === 'number' ? cantidadComprada : 0;
    const price = typeof precioCompra === 'number' ? precioCompra : 0;
    if (qty > 0 && price >= 0) {
      return Number((price / qty).toFixed(2));
    }
    return typeof purchaseCost === 'number' ? purchaseCost : 0;
  }, [cantidadComprada, precioCompra, purchaseCost]);

  // Card 3: Stock Control
  const [stockMinLimit, setStockMinLimit] = useState<number | ''>('');
  const [stockMaxLimit, setStockMaxLimit] = useState<number | ''>('');
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  const [inventoryObservations, setInventoryObservations] = useState<string>('');
  const [image, setImage] = useState<string>('');

  // SSoT Branch stock states
  const [branchStocks, setBranchStocks] = useState<Record<string, { stockActual: number | ''; observations: string; lote?: string; fechaVencimiento?: string }>>({});
  const [loadedEditItem, setLoadedEditItem] = useState<InventoryItem | null>(null);

  // Top switches
  const [isActive, setIsActive] = useState(true);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [isUserTouched, setIsUserTouched] = useState(false);

  // Load item in edit mode
  useEffect(() => {
    async function loadItem() {
      if (editItemId) {
        const item = await db.inventoryItems.get(editItemId);
        if (item) {
          setName(item.name);
          setSupplyCategory(item.supplyCategory || item.category || '');
          const initialZone = normalizeOperationalZone(item.operationalZone || item.operationZone || '');
          setOperationZone(initialZone);
          setDescription(item.description || '');
          setPurchaseUnit(item.purchaseUnit || '');
          setCantidadComprada(item.cantidadComprada !== undefined ? item.cantidadComprada : '');
          setPrecioCompra(item.precioCompra !== undefined ? item.precioCompra : '');
          setPurchaseCost(item.purchaseCost !== undefined ? item.purchaseCost : '');
          setSupplier(item.supplierId || '');
          setStockMinLimit(item.stockMinLimit);
          setStockMaxLimit(item.stockMaxLimit || '');
          setFechaVencimiento(item.fechaVencimiento || '');
          setInventoryObservations(item.description || '');
          setIsActive(item.isActive !== false);
          setImage(item.img || '');
          
          const mappedStocks: Record<string, { stockActual: number | ''; observations: string; lote?: string; fechaVencimiento?: string }> = {};
          const consolidatedSucursal = consolidateSucursalStock(item.sucursalStock);
          consolidatedSucursal.forEach(s => {
            if (s.sucursalId) {
              mappedStocks[s.sucursalId] = {
                stockActual: s.stockActual,
                observations: s.batchObservations || '',
                lote: s.lote || '',
                fechaVencimiento: s.fechaVencimiento || ''
              };
            }
          });
          setLoadedEditItem(item);
          setBranchStocks(mappedStocks);

          setInitialSnapshot(JSON.stringify({
            name: item.name,
            supplyCategory: item.supplyCategory || item.category || '',
            operationZone: initialZone,
            description: item.description || '',
            purchaseUnit: item.purchaseUnit || '',
            cantidadComprada: item.cantidadComprada !== undefined ? item.cantidadComprada : '',
            precioCompra: item.precioCompra !== undefined ? item.precioCompra : '',
            purchaseCost: item.purchaseCost !== undefined ? item.purchaseCost : '',
            supplier: item.supplierId || '',
            stockMinLimit: item.stockMinLimit,
            stockMaxLimit: item.stockMaxLimit || '',
            fechaVencimiento: item.fechaVencimiento || '',
            inventoryObservations: item.description || '',
            image: item.img || '',
            branchStocks: mappedStocks,
            isActive: item.isActive !== false,
          }));
          setIsUserTouched(false);
        }
      } else {
        setInitialSnapshot(JSON.stringify({
          name: '',
          supplyCategory: '',
          operationZone: '',
          description: '',
          purchaseUnit: '',
          cantidadComprada: '',
          precioCompra: '',
          purchaseCost: '',
          supplier: '',
          stockMinLimit: '',
          stockMaxLimit: '',
          fechaVencimiento: '',
          inventoryObservations: '',
          image: '',
          branchStocks: {},
          isActive: true,
        }));
        setIsUserTouched(false);
      }
    }
    loadItem();
  }, [editItemId]);

  const currentSnapshot = useMemo(() => {
    return JSON.stringify({
      name,
      supplyCategory,
      operationZone,
      description,
      purchaseUnit,
      cantidadComprada,
      precioCompra,
      purchaseCost,
      supplier,
      stockMinLimit,
      stockMaxLimit,
      fechaVencimiento,
      inventoryObservations,
      image,
      branchStocks,
      isActive,
    });
  }, [
    name,
    supplyCategory,
    operationZone,
    description,
    purchaseUnit,
    cantidadComprada,
    precioCompra,
    purchaseCost,
    supplier,
    stockMinLimit,
    stockMaxLimit,
    fechaVencimiento,
    inventoryObservations,
    image,
    branchStocks,
    isActive,
  ]);

  // Check if form has unsaved user changes
  const isDirty = useMemo(() => {
    if (!isUserTouched || !initialSnapshot) return false;
    return currentSnapshot !== initialSnapshot;
  }, [isUserTouched, currentSnapshot, initialSnapshot]);

  const { showDiscardModal, handleSafeExit, confirmExit, cancelExit } = useFormExitGuard({
    isDirty,
    destination: '/inventory/new-item',
    onExitCallback: onBack
  });

  // Seed suppliers state
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }, [suppliers, supplierSearch]);

  // Sync initial supplier search text if default
  useEffect(() => {
    if (supplier && suppliers.length > 0) {
      const found = suppliers.find(s => s.id === supplier);
      if (found) {
        setSupplierSearch(found.name);
      }
    }
  }, [supplier, suppliers]);

  // SSoT branches list (filtered to active ones only)
  const allBranches = getDropdownOptions('system_branches', systemSettings) as Array<{ id: string; name: string; active?: boolean }>;
  const systemBranches = useMemo(() => {
    return allBranches.filter(b => b.active !== false);
  }, [allBranches]);

  useEffect(() => {
    if (!editItemId || !loadedEditItem || systemBranches.length === 0) return;
    setBranchStocks(prev => {
      let changed = false;
      const next = { ...prev };
      for (const branch of systemBranches) {
        if (next[branch.id] === undefined || next[branch.id]?.stockActual === '') {
          const matchingSucursal = loadedEditItem.sucursalStock?.find(s => areBranchIdsEqual(s.sucursalId, branch.id));
          next[branch.id] = {
            stockActual: getPhysicalStockInBranch(loadedEditItem, branch.id),
            observations: matchingSucursal?.batchObservations || next[branch.id]?.observations || '',
            lote: matchingSucursal?.lote || next[branch.id]?.lote || '',
            fechaVencimiento: matchingSucursal?.fechaVencimiento || loadedEditItem.fechaVencimiento || next[branch.id]?.fechaVencimiento || ''
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [editItemId, loadedEditItem, systemBranches]);

  const handleBranchStockChange = (branchId: string, val: number | '') => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { observations: '' },
        stockActual: val
      }
    }));
  };

  const handleBranchObservationsChange = (branchId: string, val: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { stockActual: '' },
        observations: val
      }
    }));
  };

  const handleBranchLoteChange = (branchId: string, val: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { stockActual: '', observations: '' },
        lote: val
      }
    }));
  };

  const handleBranchExpiryChange = (branchId: string, val: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { stockActual: '', observations: '' },
        fechaVencimiento: val
      }
    }));
  };

  // Automatic Expiration Date Propagation to Sucursales
  useEffect(() => {
    if (fechaVencimiento) {
      setBranchStocks(prev => {
        const next = { ...prev };
        systemBranches.forEach(b => {
          next[b.id] = {
            ...next[b.id] || { stockActual: '', observations: '' },
            fechaVencimiento: fechaVencimiento
          };
        });
        return next;
      });
    }
  }, [fechaVencimiento]);

  // Dynamic Valuation Calculations using structured unit cost
  const costNumber = useMemo(() => calculatedUnitCost, [calculatedUnitCost]);

  const getBranchValuation = (branchId: string) => {
    const stock = Number(branchStocks[branchId]?.stockActual) || 0;
    return stock * costNumber;
  };

  const totalValuation = useMemo(() => {
    return systemBranches.reduce((sum, b) => sum + getBranchValuation(b.id), 0);
  }, [systemBranches, branchStocks, costNumber]);
  
  const totalStockQty = useMemo(() => {
    return systemBranches.reduce((sum, b) => sum + (Number(branchStocks[b.id]?.stockActual) || 0), 0);
  }, [systemBranches, branchStocks]);

  // Dynamic Reposición Estimada Label
  const reposicionEstimadaLabel = useMemo(() => {
    if (totalStockQty <= 0) return 'Inmediata';
    const limit = Number(stockMinLimit) || 0;
    if (totalStockQty <= limit) return 'Urgente';
    return '-- días';
  }, [totalStockQty, stockMinLimit]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      toast.error('Nombre de Suministro es obligatorio.');
      return;
    }
    if (!operationZone) {
      toast.error('Zona de Operación es obligatoria.');
      return;
    }

    let sucursalStock: SucursalStock[] = systemBranches.map(branch => ({
      sucursalId: branch.id,
      stockActual: Number(branchStocks[branch.id]?.stockActual) || 0,
      batchObservations: branchStocks[branch.id]?.observations || '',
      lote: branchStocks[branch.id]?.lote || '',
      fechaVencimiento: branchStocks[branch.id]?.fechaVencimiento || undefined
    }));

    if (editItemId) {
      const existingItem = await db.inventoryItems.get(editItemId);
      if (existingItem && existingItem.sucursalStock) {
        const activeIds = new Set(systemBranches.map(b => b.id.toLowerCase().trim()));
        const historicalPreserved = existingItem.sucursalStock.filter(
          (s: any) => s.sucursalId && s.sucursalId.toUpperCase() !== 'MAIN' && !activeIds.has(s.sucursalId.toLowerCase().trim())
        );
        sucursalStock = [...sucursalStock, ...historicalPreserved];
      }
    }

    // Ensure ghost branches are purged and consolidate by canonical branch ID
    sucursalStock = consolidateSucursalStock(sucursalStock.filter(s => s.sucursalId && s.sucursalId.toUpperCase() !== 'MAIN'));

    const totalStock = sucursalStock.reduce((sum, s) => sum + s.stockActual, 0);
    const stockByBranch: Record<string, number> = consolidateStockByBranch(
      sucursalStock.reduce((acc, s) => ({ ...acc, [s.sucursalId]: s.stockActual }), {})
    );

    const itemId = editItemId || `ins-sup-${Date.now().toString().slice(-4)}`;

    const resolvedZone = normalizeOperationalZone(operationZone);
    const zoneLabel = getOperationalZoneLabel(resolvedZone);

    const newItem: InventoryItem = {
      id: itemId,
      name: name.trim(),
      category: supplyCategory,
      purchaseUnit,
      countUnit: purchaseUnit,
      conversionMultiplier: 1,
      yieldFactor: 1.0,
      density: 1.0,
      bottleTareWeightGrams: 0,
      cantidadComprada: typeof cantidadComprada === 'number' ? cantidadComprada : undefined,
      precioCompra: typeof precioCompra === 'number' ? precioCompra : undefined,
      purchaseCost: costNumber,
      unitCostUsage: costNumber,
      gainPercentage: 0,
      sellPrice: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: Number(stockMinLimit) || 0,
      stockMaxLimit: Number(stockMaxLimit) || 0,
      fechaVencimiento: fechaVencimiento || undefined,
      theoreticalStock: totalStock,
      realPhysicalStock: totalStock,
      currentStock: totalStock,
      availableStock: Math.max(0, totalStock),
      stockByBranch,
      abcClassification: 'C',
      supplierId: supplier.trim() || 'prov-generic',
      sucursalStock,
      updatedAt: new Date().toISOString(),
      inventoryType: 'CONSUMABLE',
      description: (inventoryObservations || description).trim(),
      showInOnlineStore: false,
      isActive,
      activo_catalogo: false,
      visible_tienda_online: false,
      operationalZone: resolvedZone,
      operationZone: zoneLabel,
      supplyCategory,
      isPackagingDesechable: supplyCategory === 'Empaques / Desechables',
      img: image
    };

    try {
      await db.inventoryItems.put(newItem);
      toast.success(editItemId ? `Suministro "${name}" actualizado exitosamente.` : `Suministro "${name}" catalogado exitosamente.`);
      onBack();
    } catch (error) {
      console.error('Error saving operational supply:', error);
      toast.error('Error al guardar el suministro en IndexedDB.');
    }
  };

  const handleDelete = async () => {
    if (!editItemId) return;
    try {
      await db.inventoryItems.delete(editItemId);
      toast.success(`Suministro "${name}" eliminado exitosamente.`);
      onBack();
    } catch (err) {
      console.error('Error deleting supply:', err);
      toast.error('Error al eliminar el suministro.');
    }
  }

  // Voice Copilot Context & Extraction Handler for Supplies
  const copilotContextData = useMemo(() => ({
    mode: 'SUPPLY' as const,
    existingCategories: supplyCategoriesList,
    existingSuppliers: suppliers.map(s => ({ id: s.id, name: s.name })),
    configuredUnits: (officialUnitsList || []).map((u: string) => ({ name: u, baseEquivalence: 1, baseUnit: u })),
    currentFormState: {
      name,
      category: supplyCategory,
      supplierId: supplier,
      purchaseCost: calculatedUnitCost,
      purchaseUnit,
      cantidadComprada,
      precioCompra,
      stockMinLimit,
      stockMaxLimit
    }
  }), [supplyCategoriesList, suppliers, officialUnitsList, name, supplyCategory, supplier, calculatedUnitCost, purchaseUnit, cantidadComprada, precioCompra, stockMinLimit, stockMaxLimit]);

  const handleClearForm = () => {
    setName('');
    setSupplyCategory('');
    setOperationZone('');
    setDescription('');
    setPurchaseUnit('');
    setCantidadComprada('');
    setPrecioCompra('');
    setPurchaseCost('');
    setSupplier('');
    setSupplierSearch('');
    setStockMinLimit('');
    setStockMaxLimit('');
    setFechaVencimiento('');
  };

  const handleApplyCopilotExtraction = (ext: VoiceIngredientExtraction) => {
    if (ext.name) setName(ext.name);
    if (ext.category) setSupplyCategory(ext.category);
    if (ext.description) setDescription(ext.description);
    if ((ext as any).purchased_quantity !== undefined && (ext as any).purchased_quantity > 0) {
      setCantidadComprada((ext as any).purchased_quantity);
    }
    if (ext.purchase_price !== undefined && ext.purchase_price > 0) {
      setPrecioCompra(ext.purchase_price);
      setPurchaseCost(ext.purchase_price);
    }
    if (ext.purchase_unit) setPurchaseUnit(ext.purchase_unit);
    if (ext.stock_min_limit !== undefined) setStockMinLimit(ext.stock_min_limit);
    if (ext.stock_max_limit !== undefined) setStockMaxLimit(ext.stock_max_limit);
    if (ext.supplier_id) {
      setSupplier(ext.supplier_id);
      const found = suppliers.find(s => s.id === ext.supplier_id);
      if (found) setSupplierSearch(found.name);
    } else if (ext.supplier_name) {
      const match = suppliers.find(s => s.name.toLowerCase().includes(ext.supplier_name!.toLowerCase()));
      if (match) {
        setSupplier(match.id);
        setSupplierSearch(match.name);
      } else {
        setSupplierSearch(ext.supplier_name);
      }
    }
    if (ext.operationalZone) {
      setOperationZone(normalizeOperationalZone(ext.operationalZone));
    }
    setIsUserTouched(true);
  };

  // Automatically prefill form when prefillData is provided (from Copilot navigation)
  useEffect(() => {
    if (prefillData && !editItemId) {
      handleApplyCopilotExtraction(prefillData);
    }
  }, [prefillData, editItemId]);

  useVoiceCopilotRegistration({
    mode: 'SUPPLY',
    contextData: copilotContextData,
    onApplyExtraction: handleApplyCopilotExtraction,
    onConfirmSave: () => handleSubmit(),
    onClearForm: handleClearForm
  });

  return (
    <div 
      onChangeCapture={() => setIsUserTouched(true)}
      onInputCapture={() => setIsUserTouched(true)}
      className="space-y-6 animate-fade-in text-left font-sans p-8 rounded-xl min-h-screen transition-receitly"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-glow)] pb-4">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={handleSafeExit}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center p-1.5 rounded-xl border border-[var(--border-glow)] transition-colors cursor-pointer bg-transparent"
            title="Regresar"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)] leading-tight">
              {editItemId ? 'Editar Ficha Suministro' : 'Nuevo Suministro'}
            </h1>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <button
            type="button"
            onClick={handleSafeExit}
            className="btn-receitly-secondary text-xs flex items-center gap-1.5 shrink-0 rounded-xl"
          >
            <span className="material-symbols-outlined text-sm">close</span>
            Cancelar
          </button>
          {editItemId && (
            <button 
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-receitly !bg-rose-500 !hover:bg-rose-650 text-xs flex items-center gap-1.5 shrink-0 border-none cursor-pointer rounded-xl"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              Eliminar
            </button>
          )}
          <button 
            type="button"
            onClick={() => handleSubmit()}
            className="btn-receitly text-xs flex items-center gap-1.5 shrink-0 border-none cursor-pointer rounded-xl"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {editItemId ? 'Actualizar Suministro' : 'Crear Suministro'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full">
        
        {/* ==================== FILA 1 ==================== */}
        
        {/* Card 1: Información General (70%) */}
        <div className="col-span-12 md:col-span-4 lg:col-span-8 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">info</span>
              Información General
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Nombre del Suministro
                </label>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Vasos de Cartón 12oz"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Descripción
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalles, notas de almacenamiento..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Categoría
                  </label>
                  <CategorySelector
                    value={supplyCategory}
                    onChange={setSupplyCategory}
                    onClear={() => setSupplyCategory('')}
                    options={supplyCategoriesList.map(cat => ({ value: cat, label: cat }))}
                    placeholder="Buscar categoría..."
                    searchPlaceholder="Buscar categoría..."
                    categoryType="SUPPLY"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    ZONA DE OPERACIÓN / PRODUCCIÓN <span className="text-[var(--accent-pink)]">*</span>
                  </label>
                  <CustomSelect
                    value={operationZone}
                    onChange={setOperationZone}
                    options={OPERATIONAL_ZONE_OPTIONS}
                    placeholder="Seleccionar estación operativa..."
                    searchPlaceholder="Buscar zona de producción..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Costo Unitario (Uso)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-500">$</span>
                    <Input
                      type="text"
                      readOnly
                      value={calculatedUnitCost > 0 ? `${calculatedUnitCost.toLocaleString('es-CO')} / ${purchaseUnit || 'ud'}` : '0.00'}
                      className="w-full bg-raised border border-purple-500/30 rounded-xl py-2.5 pl-6 pr-2 text-xs font-mono font-bold text-purple-700 dark:text-purple-300 text-right cursor-not-allowed"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Imagen + Estado (30%) */}
        <div className="col-span-12 md:col-span-2 lg:col-span-4 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">image</span>
              Imagen y Estado
            </h3>
            
            <div className="space-y-4">
              <ImageUploader
                value={image}
                onChange={setImage}
                label="Imagen del Suministro"
                helperText="PNG, JPG, WEBP hasta 5MB"
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200/30 dark:border-line">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">¿Activo en Inventario?</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isActive ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-surface'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* ==================== FILA 2 ==================== */}

        {/* ==================== FILA 2 ==================== */}

        {/* Card 3: Estructura de Compra, Costos y Logística (col-span-12 lg:col-span-8) */}
        <div className="col-span-12 lg:col-span-8 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">shopping_cart</span>
              Estructura de Compra y Costeo Unitario
            </h3>

            <div className="space-y-4">
              {/* Estructura de Compra y Costo Unitario en Alta */}
              <div className="p-4 rounded-xl bg-inset border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">calculate</span>
                    Costeo de Suministros en Alta
                  </span>
                  {calculatedUnitCost > 0 && (
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      1 {purchaseUnit || 'ud'} = ${calculatedUnitCost.toLocaleString('es-CO')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* 1. Unidad de Medida de Compra */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      Unidad de Compra
                    </label>
                    <CustomSelect
                      value={purchaseUnit}
                      onChange={setPurchaseUnit}
                      options={officialUnitsList.map(unit => ({ value: unit, label: unit }))}
                      placeholder={officialUnitsList.length === 0 ? "Configurar unidades" : "Seleccione unidad..."}
                    />
                  </div>

                  {/* 2. Cantidad Comprada */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      Cantidad Comprada
                    </label>
                    <Input
                      type="number"
                      step="any"
                      value={cantidadComprada}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setCantidadComprada(val);
                        setIsUserTouched(true);
                      }}
                      placeholder="Ej. 100"
                      className="text-right font-mono font-bold"
                    />
                  </div>

                  {/* 3. Precio de Compra */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      Precio de Compra ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">$</span>
                      <Input
                        type="number"
                        step="any"
                        value={precioCompra}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPrecioCompra(val);
                          setIsUserTouched(true);
                        }}
                        placeholder="Ej. 25000"
                        className="pl-6 pr-3 text-right font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* 4. Costo por Unidad (Calculado de Solo Lectura) */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                      Costo por Unidad
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-500">$</span>
                      <Input
                        type="text"
                        readOnly
                        value={calculatedUnitCost > 0 ? calculatedUnitCost.toLocaleString('es-CO') : '0.00'}
                        className="pl-6 pr-3 text-right font-mono font-black text-purple-700 dark:text-purple-300"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Proveedor y Datos de Almacén */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Proveedor
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => {
                        setSupplierSearch(e.target.value);
                        setShowSupplierDropdown(true);
                      }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                      placeholder="Buscar proveedor..."
                    />
                    {supplierSearch || supplier ? (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSupplier('');
                          setSupplierSearch('');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded-xl transition-colors cursor-pointer z-10"
                        title="Limpiar proveedor"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    ) : (
                      <span className="material-symbols-outlined text-[var(--text-muted)] absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                        keyboard_arrow_down
                      </span>
                    )}

                    {showSupplierDropdown && (
                      <div className="absolute left-0 right-0 top-11 bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[var(--border-glow)] text-left">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setShowSupplierModal(true);
                            setShowSupplierDropdown(false);
                          }}
                          className="w-full text-left p-3 text-xs hover:bg-[var(--bg-app)] font-black text-[var(--accent-purple)] transition-colors border-none flex items-center gap-1.5 cursor-pointer bg-transparent"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          Crear Proveedor
                        </button>
                        {filteredSuppliers.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSupplier(s.id);
                              setSupplierSearch(s.name);
                              setShowSupplierDropdown(false);
                            }}
                            className="w-full text-left p-3 text-xs hover:bg-[var(--bg-app)] font-bold text-[var(--text-secondary)] transition-colors border-none bg-transparent"
                          >
                            <div>{s.name}</div>
                            <div className="text-[9px] text-[var(--text-muted)] font-semibold">{s.contact} | {s.email}</div>
                          </button>
                        ))}
                        {filteredSuppliers.length === 0 && (
                          <div className="p-3 text-xs text-[var(--text-muted)] italic">No se encontraron proveedores.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Stock Mínimo
                    </label>
                    <Input
                      type="number"
                      value={stockMinLimit}
                      onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="10"
                      className="rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Stock Máximo
                    </label>
                    <Input
                      type="number"
                      value={stockMaxLimit}
                      onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="100"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                    Fecha de Vencimiento
                  </label>
                  <DatePicker
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                    Observaciones
                  </label>
                  <Input
                    type="text"
                    value={inventoryObservations}
                    title={inventoryObservations}
                    onChange={(e) => setInventoryObservations(e.target.value)}
                    placeholder="Notas de almacenamiento o empaque..."
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4 removed to optimize screen space */}

        {/* Card 5: Costeo / Summary (40%: col-span-12 lg:col-span-4) */}
        <div className="col-span-12 lg:col-span-4 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-purple)]/10 rounded-bl-full -mr-4 -mt-4"></div>
          
          <div className="pb-3 border-b border-slate-200/30 dark:border-white/10">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block">
              Resumen Técnico
            </span>
          </div>

          <div className="space-y-3 py-4 flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)] font-semibold">Valor de Inventario:</span>
              <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalValuation)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)] font-semibold">Reposición estimada:</span>
              <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                reposicionEstimadaLabel === 'Inmediata' ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-400' :
                reposicionEstimadaLabel === 'Urgente' ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-[var(--accent-pink)]/20 dark:text-[var(--accent-pink)]' :
                'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-raised dark:text-slate-300'
              }`}>
                {reposicionEstimadaLabel}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200/30 dark:border-white/10">
            <p className="text-[10px] text-[var(--text-muted)] italic font-medium leading-relaxed">
              "Optimiza tus costos gestionando empaques de manera inteligente."
            </p>
          </div>
        </div>

        {/* ==================== FILA 3 ==================== */}

        {/* Card 6: Stock Actual / Inicial por Sucursal (100%) */}
        <div className="col-span-12 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
          <div>
            <h4 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-slate-200/30 dark:border-line uppercase tracking-wider mb-2">
              <span className="material-symbols-outlined text-[var(--accent-purple)]">store</span>
              {editItemId ? 'Stock Actual por Sucursal' : 'Stock Inicial por Sucursal'}
            </h4>
            <p className="text-[9px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-4">
              * Cantidades expresadas en la Unidad de Medida ({purchaseUnit})
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemBranches.map(branch => {
                const rawBranchStock = branchStocks[branch.id]?.stockActual;
                const stockValue = rawBranchStock !== undefined && rawBranchStock !== ''
                  ? rawBranchStock
                  : (loadedEditItem ? getPhysicalStockInBranch(loadedEditItem, branch.id) : '');
                const observationsValue = branchStocks[branch.id]?.observations ?? '';
                const loteValue = branchStocks[branch.id]?.lote ?? '';
                const expiryValue = branchStocks[branch.id]?.fechaVencimiento ?? '';
                const branchValuation = getBranchValuation(branch.id);

                return (
                  <div key={branch.id} className="p-3.5 bg-slate-100 border border-slate-200 dark:bg-inset dark:border-line rounded-xl space-y-3 shadow-sm">
                    <div className="flex justify-between items-center pb-2 border-b border-line">
                      <span className="text-xs font-black text-content">{branch.name}</span>
                      <span className="text-xs font-mono font-black text-purple-700 dark:text-purple-400">
                        Val: {formatCurrency(branchValuation)}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                            {editItemId ? 'Stock Actual' : 'Stock Inicial'}
                          </label>
                          <Input
                            type="number"
                            value={stockValue}
                            onChange={(e) => handleBranchStockChange(branch.id, e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-2 text-xs text-[var(--text-primary)] font-mono font-bold text-center focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Lote</label>
                          <Input
                            type="text"
                            value={loteValue}
                            onChange={(e) => handleBranchLoteChange(branch.id, e.target.value)}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-2 text-xs text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="Ej. L-001"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Vencimiento</label>
                          <DatePicker
                            value={expiryValue}
                            onChange={(e) => handleBranchExpiryChange(branch.id, e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Observaciones</label>
                          <Input
                            type="text"
                            value={observationsValue}
                            onChange={(e) => handleBranchObservationsChange(branch.id, e.target.value)}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-2 text-xs text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="Notas"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {systemBranches.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] italic text-center py-2 col-span-3">No hay sedes activas configuradas.</p>
              )}
            </div>
          </div>
        </div>
      </form>

      {showSupplierModal && (
        <Modal title="Crear Proveedor" onClose={() => setShowSupplierModal(false)} size="2xl">
          <SupplierForm 
            onCancel={() => setShowSupplierModal(false)} 
            onSaved={(newId?: string) => {
              if (newId) {
                setSupplier(newId);
                const found = suppliers.find(s => s.id === newId);
                if (found) {
                  setSupplierSearch(found.name);
                } else {
                  db.suppliers.get(newId).then(s => {
                    if (s) setSupplierSearch(s.name);
                  });
                }
              }
              setShowSupplierModal(false);
            }} 
          />
        </Modal>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Eliminar Elemento"
          message={`¿Estás seguro de que deseas eliminar "${name}" del inventario? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <DiscardChangesModal
        isOpen={showDiscardModal}
        onContinueEditing={cancelExit}
        onDiscardAndExit={confirmExit}
      />

      <FormActionsBar>
        <button 
          type="button"
          onClick={handleSafeExit}
          className="px-5 py-2.5 bg-surface hover:bg-raised text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-sm font-bold rounded-lg cursor-pointer flex items-center gap-1.5 shrink-0 border border-line min-h-[44px] transition-colors shadow-xs"
        >
          <span className="material-symbols-outlined text-base">close</span>
          Cancelar
        </button>
        {editItemId && (
          <button 
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-[8px] cursor-pointer flex items-center gap-1.5 shrink-0 border-none min-h-[44px]"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            Eliminar
          </button>
        )}
        <button 
          type="button"
          onClick={() => handleSubmit()}
          className="px-5 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-sm font-bold rounded-[8px] shadow-md shadow-[var(--accent-pink)]/15 cursor-pointer flex items-center gap-1.5 shrink-0 border-none active:scale-95 transition-all min-h-[44px]"
        >
          <span className="material-symbols-outlined text-base">save</span>
          {editItemId ? 'Actualizar' : 'Crear'}
        </button>
      </FormActionsBar>
    </div>
  );
});

export default SupplyOnboardingForm;
