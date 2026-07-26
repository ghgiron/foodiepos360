// src/components/supplyOnboardingForm.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';

import type { InventoryItem, SucursalStock } from '../types';
import { getDropdownOptions } from '../utils/dataHelper';
import ImageUploader from './ImageUploader';
import SupplierForm from './supplierForm';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

interface SupplyOnboardingFormProps {
  onBack: () => void;
  editItemId?: string | null;
}

const SupplyOnboardingForm = React.memo(function SupplyOnboardingForm({ onBack, editItemId }: SupplyOnboardingFormProps) {
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
  const operatingZonesList = getDropdownOptions('operating_zones', systemSettings);
  const officialUnitsList = getDropdownOptions('official_units', systemSettings);

  // Top switches
  const [isActive, setIsActive] = useState(true);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load item in edit mode
  useEffect(() => {
    async function loadItem() {
      if (editItemId) {
        const item = await db.inventoryItems.get(editItemId);
        if (item) {
          setName(item.name);
          setSupplyCategory(item.supplyCategory || item.category || '');
          setOperationZone(item.operationZone || '');
          setDescription(item.description || '');
          setPurchaseUnit(item.purchaseUnit);
          setPurchaseCost(item.purchaseCost);
          setSupplier(item.supplierId || '');
          setStockMinLimit(item.stockMinLimit);
          setStockMaxLimit(item.stockMaxLimit || '');
          setFechaVencimiento(item.fechaVencimiento || '');
          setIsActive(item.isActive !== false);
          setImage(item.img || '');
          
          const mappedStocks: Record<string, { stockActual: number | ''; observations: string; lote?: string; fechaVencimiento?: string }> = {};
          if (item.sucursalStock) {
            item.sucursalStock.forEach(s => {
              mappedStocks[s.sucursalId] = {
                stockActual: s.stockActual,
                observations: s.batchObservations || '',
                lote: s.lote || '',
                fechaVencimiento: s.fechaVencimiento || ''
              };
            });
          }
          setBranchStocks(mappedStocks);
        }
      }
    }
    loadItem();
  }, [editItemId]);

  // Card 1: Element Information
  const [name, setName] = useState('');
  const [supplyCategory, setSupplyCategory] = useState('');
  const [operationZone, setOperationZone] = useState('');
  const [description, setDescription] = useState('');

  // Card 2: Logistics and Costs
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [purchaseCost, setPurchaseCost] = useState<number | ''>('');
  const [supplier, setSupplier] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // Synchronize options once settings load
  useEffect(() => {
    if (supplyCategoriesList.length > 0 && !supplyCategoriesList.includes(supplyCategory)) {
      setSupplyCategory(supplyCategoriesList[0]);
    }
    if (operatingZonesList.length > 0 && !operatingZonesList.includes(operationZone)) {
      setOperationZone(operatingZonesList[0]);
    }
    if (officialUnitsList.length > 0 && !officialUnitsList.includes(purchaseUnit)) {
      setPurchaseUnit(officialUnitsList[0]);
    }
  }, [systemSettings, supplyCategoriesList, operatingZonesList, officialUnitsList, supplyCategory, operationZone, purchaseUnit]);

  // Card 3: Stock Control
  const [stockMinLimit, setStockMinLimit] = useState<number | ''>('');
  const [stockMaxLimit, setStockMaxLimit] = useState<number | ''>('');
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  const [image, setImage] = useState<string>('');

  // SSoT Branch stock states
  const [branchStocks, setBranchStocks] = useState<Record<string, { stockActual: number | ''; observations: string; lote?: string; fechaVencimiento?: string }>>({});

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

  // Dynamic Valuation Calculations
  const costNumber = useMemo(() => Number(purchaseCost) || 0, [purchaseCost]);

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
        const activeIds = new Set(systemBranches.map(b => b.id));
        const historicalPreserved = existingItem.sucursalStock.filter(
          (s: any) => !activeIds.has(s.sucursalId)
        );
        sucursalStock = [...sucursalStock, ...historicalPreserved];
      }
    }
    const totalStock = sucursalStock.reduce((sum, s) => sum + s.stockActual, 0);
    const itemId = editItemId || `ins-sup-${Date.now().toString().slice(-4)}`;

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
      purchaseCost: costNumber,
      gainPercentage: 0,
      sellPrice: 0,
      isTaxable: false,
      taxPercentage: 0,
      stockMinLimit: Number(stockMinLimit) || 0,
      stockMaxLimit: Number(stockMaxLimit) || 0,
      fechaVencimiento: fechaVencimiento || undefined,
      theoreticalStock: totalStock,
      realPhysicalStock: totalStock,
      abcClassification: 'C',
      supplierId: supplier.trim() || 'prov-generic',
      sucursalStock,
      updatedAt: new Date().toISOString(),
      inventoryType: 'CONSUMABLE',
      description: description.trim(),
      showInOnlineStore: false,
      isActive,
      activo_catalogo: false,
      visible_tienda_online: false,
      operationZone,
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

  return (
    <div className="space-y-6 animate-fade-in text-left font-sans p-8 rounded-3xl min-h-screen transition-receitly">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-glow)] pb-4">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={onBack}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center p-1.5 rounded-xl border border-[var(--border-glow)] transition-colors cursor-pointer bg-transparent"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)] leading-tight">
              {editItemId ? 'Editar Ficha Suministro' : 'Nuevo Suministro'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-receitly-secondary text-xs flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-sm">close</span>
            Cancelar
          </button>
          {editItemId && (
            <button 
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-receitly !bg-rose-500 !hover:bg-rose-650 text-xs flex items-center gap-1.5 shrink-0 border-none cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              Eliminar
            </button>
          )}
          <button 
            type="button"
            onClick={() => handleSubmit()}
            className="btn-receitly text-xs flex items-center gap-1.5 shrink-0 border-none cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {editItemId ? 'Actualizar Suministro' : 'Crear Suministro'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full">
        
        {/* ==================== FILA 1 ==================== */}
        
        {/* Card 1: Información General (70%) */}
        <div className="lg:col-span-8 flex flex-col justify-between glass-card p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--border-glow)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">info</span>
              Información General
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Nombre del Suministro
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-450"
                  placeholder="Ej: Vasos de Cartón 12oz"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-450"
                  placeholder="Detalles, notas de almacenamiento..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Categoría
                  </label>
                  <CustomSelect
                    value={supplyCategory}
                    onChange={setSupplyCategory}
                    options={supplyCategoriesList.map(cat => ({ value: cat, label: cat }))}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Zona de Operación
                  </label>
                  <CustomSelect
                    value={operationZone}
                    onChange={setOperationZone}
                    options={operatingZonesList.map(zone => ({ value: zone, label: zone }))}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Imagen + Estado (30%) */}
        <div className="lg:col-span-4 flex flex-col justify-between glass-card p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--border-glow)] uppercase tracking-wider mb-4">
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

          <div className="space-y-3 pt-3 border-t border-[var(--border-glow)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-[var(--text-muted)]">¿Activo en Inventario?</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isActive ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* ==================== FILA 2 ==================== */}

        {/* Card 3: Logística y Alertas (40%) */}
        <div className="lg:col-span-5 flex flex-col justify-between glass-card p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--border-glow)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">local_shipping</span>
              Logística y Alertas
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Unidad de Medida
                  </label>
                  <CustomSelect
                    value={purchaseUnit}
                    onChange={setPurchaseUnit}
                    options={officialUnitsList.map(unit => ({ value: unit, label: unit }))}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Proveedor
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => {
                        setSupplierSearch(e.target.value);
                        setShowSupplierDropdown(true);
                      }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-400 dark:placeholder-slate-500 pr-10"
                      placeholder="Buscar proveedor..."
                    />
                    <span className="material-symbols-outlined text-[var(--text-muted)] absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                      keyboard_arrow_down
                    </span>

                    {showSupplierDropdown && (
                      <div className="absolute left-0 right-0 top-11 bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-2xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[var(--border-glow)] text-left">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Stock Mín. de Alerta
                  </label>
                  <input
                    type="number"
                    value={stockMinLimit}
                    onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-mono font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="10"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                    Stock Máx. Sugerido
                  </label>
                  <input
                    type="number"
                    value={stockMaxLimit}
                    onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-mono font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Fecha de Vencimiento
                </label>
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3 text-xs font-bold text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-center"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Información Financiera (30%) */}
        <div className="lg:col-span-3 flex flex-col justify-between glass-card p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--border-glow)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">payments</span>
              Costo Adquisición
            </h3>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                Costo Unitario ($)
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">$</span>
                <input
                  type="number"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl py-2.5 pl-6 pr-2 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] text-right"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Costeo / Summary (30%) */}
        <div className="lg:col-span-4 flex flex-col justify-between panel-card p-6 relative overflow-hidden h-full">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-purple)]/10 rounded-bl-full -mr-4 -mt-4"></div>
          
          <div className="pb-3 border-b border-white/10">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block">
              Resumen Técnico
            </span>
          </div>

          <div className="space-y-3 py-4 flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)] font-semibold">Valor de Inventario:</span>
              <span className="text-base font-black font-mono text-emerald-400">
                ${totalValuation.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--text-muted)] font-semibold">Reposición estimada:</span>
              <span className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                reposicionEstimadaLabel === 'Inmediata' ? 'bg-rose-500/20 text-rose-400' :
                reposicionEstimadaLabel === 'Urgente' ? 'bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]' :
                'bg-slate-800 text-slate-300'
              }`}>
                {reposicionEstimadaLabel}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10">
            <p className="text-[10px] text-[var(--text-muted)] italic font-medium leading-relaxed">
              "Optimiza tus costos gestionando empaques de manera inteligente."
            </p>
          </div>
        </div>

        {/* ==================== FILA 3 ==================== */}

        {/* Card 6: Stock Inicial por Sucursal (100%) */}
        <div className="lg:col-span-12 flex flex-col justify-between glass-card p-6 space-y-4 w-full">
          <div>
            <h4 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2 pb-2 border-b border-[var(--border-glow)] uppercase tracking-wider mb-2">
              <span className="material-symbols-outlined text-[var(--accent-purple)]">store</span>
              Stock Inicial por Sucursal
            </h4>
            <p className="text-[9px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-4">
              * Cantidades expresadas en la Unidad de Medida ({purchaseUnit})
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemBranches.map(branch => {
                const stockValue = branchStocks[branch.id]?.stockActual ?? '';
                const observationsValue = branchStocks[branch.id]?.observations ?? '';
                const loteValue = branchStocks[branch.id]?.lote ?? '';
                const expiryValue = branchStocks[branch.id]?.fechaVencimiento ?? '';
                const branchValuation = getBranchValuation(branch.id);

                return (
                  <div key={branch.id} className="p-4 bg-[var(--bg-app)]/30 rounded-2xl border border-[var(--border-glow)] space-y-3 text-left animate-fade-in">
                    <div className="flex justify-between items-center pb-2 border-b border-[var(--border-glow)]/50">
                      <span className="text-xs font-bold text-[var(--text-secondary)]">{branch.name}</span>
                      <span className="text-[10px] font-black font-mono text-[var(--accent-purple)]">
                        Val: ${branchValuation.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Stock Inicial</label>
                          <input
                            type="number"
                            value={stockValue}
                            onChange={(e) => handleBranchStockChange(branch.id, e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-2 text-xs text-[var(--text-primary)] font-mono font-bold text-center focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Lote</label>
                          <input
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
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Vencimiento</label>
                          <input
                            type="date"
                            value={expiryValue}
                            onChange={(e) => handleBranchExpiryChange(branch.id, e.target.value)}
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-2 text-[10px] text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Observaciones</label>
                          <input
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
        <Modal title="Crear Proveedor" onClose={() => setShowSupplierModal(false)}>
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
    </div>
  );
});

export default SupplyOnboardingForm;
