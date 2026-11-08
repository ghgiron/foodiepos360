// src/components/inventory/CompleteNewItemModal.tsx
import React, { useState, useMemo } from 'react';
import { db, enqueueOfflineEvent } from '../../db/localDb';
import { syncRecordToFirestore } from '../../services/syncService';
import { useLiveQuery } from 'dexie-react-hooks';
import type { InventoryItem } from '../../types';
import toast from 'react-hot-toast';
import CustomSelect from '../ui/CustomSelect';
import { Input } from '../ui/Input';
import ImageUploader from '../ImageUploader';
import { CategorySelector } from '../ui/CategorySelector';

interface CompleteNewItemModalProps {
  isOpen: boolean;
  initialName: string;
  initialUnitCost?: number;
  initialSupplierId?: string;
  onClose: () => void;
  onSaveSuccess: (createdItem: InventoryItem) => void;
}

const COMMON_PURCHASE_UNITS = [
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'g', label: 'Gramo (g)' },
  { value: 'litro', label: 'Litro (L)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'und', label: 'Unidad (und)' },
  { value: 'paquete', label: 'Paquete' },
  { value: 'caja', label: 'Caja' },
  { value: 'botella', label: 'Botella' },
  { value: 'lata', label: 'Lata' },
  { value: 'libra', label: 'Libra (lb)' }
];

const COMMON_COUNT_UNITS = [
  { value: 'g', label: 'Gramos (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'und', label: 'Unidad (und)' },
  { value: 'porcion', label: 'Porción' },
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'litro', label: 'Litro (L)' }
];

export default function CompleteNewItemModal({
  isOpen,
  initialName,
  initialUnitCost = 0,
  initialSupplierId = '',
  onClose,
  onSaveSuccess
}: CompleteNewItemModalProps) {
  const [resourceType, setResourceType] = useState<'INGREDIENT' | 'PRODUCT' | 'PACKAGING'>('INGREDIENT');
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState('');
  const [purchaseUnit, setPurchaseUnit] = useState('kg');
  const [countUnit, setCountUnit] = useState('g');
  const [conversionRatio, setConversionRatio] = useState<number>(1000);
  const [mermaPercentage, setMermaPercentage] = useState<number>(0);
  const [purchaseCost, setPurchaseCost] = useState<number>(initialUnitCost);
  const [operationZone, setOperationZone] = useState<'Cocina' | 'Bar' | 'General'>('Cocina');
  const [minStock, setMinStock] = useState<number>(10);
  const [maxStock, setMaxStock] = useState<number>(30);
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync initial props
  React.useEffect(() => {
    if (initialName) setName(initialName);
    if (initialUnitCost) setPurchaseCost(initialUnitCost);
  }, [initialName, initialUnitCost]);

  // Load available categories reactively
  const ingredientCats = useLiveQuery(() => db.ingredientCategories.toArray()) || [];
  const supplyCats = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  const menuCats = useLiveQuery(() => db.menuCategories.toArray()) || [];

  const categoryOptions = useMemo(() => {
    let sourceList: Array<{ id: string; name: string }> = [];
    if (resourceType === 'INGREDIENT') sourceList = ingredientCats;
    else if (resourceType === 'PACKAGING') sourceList = supplyCats;
    else sourceList = menuCats;

    if (sourceList.length === 0) {
      return [{ value: 'General', label: 'General' }];
    }
    return sourceList.map(c => ({ value: c.name, label: c.name }));
  }, [resourceType, ingredientCats, supplyCats, menuCats]);

  // Auto-set default conversion ratio when units change
  const handlePurchaseUnitChange = (unit: string) => {
    setPurchaseUnit(unit);
    if (unit === 'kg' && countUnit === 'g') setConversionRatio(1000);
    else if (unit === 'litro' && countUnit === 'ml') setConversionRatio(1000);
    else if (unit === countUnit) setConversionRatio(1);
  };

  const handleCountUnitChange = (unit: string) => {
    setCountUnit(unit);
    if (purchaseUnit === 'kg' && unit === 'g') setConversionRatio(1000);
    else if (purchaseUnit === 'litro' && unit === 'ml') setConversionRatio(1000);
    else if (purchaseUnit === unit) setConversionRatio(1);
  };

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre del insumo es obligatorio.');
      return;
    }

    try {
      setIsSaving(true);
      const prefix = resourceType === 'PRODUCT' ? 'prod' : resourceType === 'PACKAGING' ? 'sup' : 'ins';
      const itemId = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const yieldFactor = Math.max(0.01, 1 - ((Number(mermaPercentage) || 0) / 100));

      const newItem: InventoryItem = {
        id: itemId,
        name: name.trim(),
        category: category.trim() || (categoryOptions[0]?.value || 'General'),
        resourceType: resourceType.toLowerCase(),
        purchaseUnit,
        countUnit,
        usageUnit: countUnit,
        conversionRatio: Number(conversionRatio) || 1,
        conversionMultiplier: Number(conversionRatio) || 1,
        cantidadUtilizable: Number(conversionRatio) || 1,
        yieldFactor,
        mermaPercentage: Number(mermaPercentage) || 0,
        purchaseCost: Number(purchaseCost) || 0,
        averagePrice: Number(purchaseCost) || 0,
        lastPurchasePrice: Number(purchaseCost) || 0,
        gainPercentage: 30,
        isTaxable: false,
        taxPercentage: 0,
        density: 1,
        bottleTareWeightGrams: 0,
        stockMinLimit: Number(minStock) || 10,
        stockMaxLimit: Number(maxStock) || 30,
        minStock: Number(minStock) || 10,
        maxStock: Number(maxStock) || 30,
        theoreticalStock: 0,
        realPhysicalStock: 0,
        currentStock: 0,
        reservedStock: 0,
        availableStock: 0,
        stockByBranch: {},
        sucursalStock: [],
        abcClassification: 'B',
        supplierId: initialSupplierId || '',
        operationZone,
        img: photoUrl || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.inventoryItems.put(newItem);
      await enqueueOfflineEvent('InventoryItemCreated', newItem);
      syncRecordToFirestore('inventoryItems', newItem.id, newItem).catch(() => {});

      toast.success(`Ficha técnica creada: ${newItem.name} listo para recepción.`);
      onSaveSuccess(newItem);
      onClose();
    } catch (error) {
      console.error('Error al crear ficha de nuevo insumo:', error);
      toast.error('No fue posible guardar la ficha del insumo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-surface border border-line rounded-xl p-6 md:p-8 max-w-2xl w-full shadow-2xl text-left flex flex-col max-h-[90vh] overflow-y-auto font-body text-content">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <div>
              <h3 className="font-headline font-black text-lg text-content">
                Completar Ficha Técnica de Insumo Nuevo
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Configura unidades, factor de uso y merma antes de registrar su ingreso al inventario [US-10A].
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-content cursor-pointer p-1 rounded-sm"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 pt-4">
          
          {/* Resource Type Selector */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
              Tipo de Elemento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'INGREDIENT', label: 'Ingrediente', icon: 'lunch_dining' },
                { type: 'PRODUCT', label: 'Producto Único', icon: 'inventory_2' },
                { type: 'PACKAGING', label: 'Suministro', icon: 'takeout_dining' }
              ].map(opt => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setResourceType(opt.type as any)}
                  className={`py-2 px-3 rounded-sm text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] ${
                    resourceType === opt.type
                      ? 'bg-emerald-600/15 border-emerald-600 text-emerald-600 dark:text-emerald-400'
                      : 'bg-raised border-line text-content-secondary hover:text-content'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name & Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Nombre del Insumo *
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-sm border-line dark:bg-canvas p-2.5 text-xs font-semibold focus:ring-1 focus:ring-emerald-500 outline-none"
                placeholder="ej. Crema de Leche Premium"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Categoría *
              </label>
              <CategorySelector
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                placeholder="Seleccionar categoría..."
                className="w-full rounded-sm text-xs"
                categoryType={resourceType === 'PACKAGING' ? 'SUPPLY' : resourceType}
              />
            </div>
          </div>

          {/* Units Resolution: Purchase Unit vs Usage/Count Unit */}
          <div className="p-4 bg-slate-50/50 dark:bg-raised/20 rounded-lg border border-line space-y-3">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">scale</span>
              Resolución Automática de Unidades
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Unidad de Compra
                </label>
                <CustomSelect
                  value={purchaseUnit}
                  onChange={handlePurchaseUnitChange}
                  options={COMMON_PURCHASE_UNITS}
                  className="w-full rounded-sm text-xs p-2.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Unidad de Uso (Recetas)
                </label>
                <CustomSelect
                  value={countUnit}
                  onChange={handleCountUnitChange}
                  options={COMMON_COUNT_UNITS}
                  className="w-full rounded-sm text-xs p-2.5"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Equivalencia (1 {purchaseUnit} = X {countUnit})
                </label>
                <Input
                  type="number"
                  min="0.001"
                  step="any"
                  value={conversionRatio}
                  onChange={(e) => setConversionRatio(Math.max(0.001, parseFloat(e.target.value) || 1))}
                  className="w-full rounded-sm border-line dark:bg-canvas p-2.5 text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Merma Estimada (%)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={mermaPercentage}
                  onChange={(e) => setMermaPercentage(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                  className="w-full rounded-sm border-line dark:bg-canvas p-2.5 text-xs font-mono font-bold"
                  placeholder="0%"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Zona Operativa
                </label>
                <CustomSelect
                  value={operationZone}
                  onChange={(v) => setOperationZone(v as any)}
                  options={[
                    { value: 'Cocina', label: 'Cocina' },
                    { value: 'Bar', label: 'Bar / Barra' },
                    { value: 'General', label: 'General' }
                  ]}
                  className="w-full rounded-sm text-xs p-2.5"
                />
              </div>
            </div>
          </div>

          {/* Pricing and Stock Limits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Costo de Compra ($)
              </label>
              <Input
                type="number"
                min="0"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full rounded-sm border-line dark:bg-canvas p-2.5 text-xs font-mono font-bold"
                placeholder="$0"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Stock Mínimo ({countUnit})
              </label>
              <Input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full rounded-sm border-line dark:bg-canvas p-2.5 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Stock Máximo ({countUnit})
              </label>
              <Input
                type="number"
                min="0"
                value={maxStock}
                onChange={(e) => setMaxStock(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full rounded-sm border-line dark:bg-canvas p-2.5 text-xs font-mono"
              />
            </div>
          </div>

          {/* Photo Uploader */}
          <div>
            <ImageUploader
              value={photoUrl}
              onChange={(b64) => setPhotoUrl(b64)}
              label="Foto del Insumo (Opcional)"
              helperText="Imagen de referencia para reconocimiento en cocina y comandas."
              className="p-3"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-line flex justify-end items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 bg-slate-100 dark:bg-raised text-slate-500 dark:text-slate-300 font-bold rounded-sm text-xs uppercase tracking-wider cursor-pointer active:scale-[0.98]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-full text-xs uppercase tracking-wider cursor-pointer shadow-md shadow-emerald-600/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              {isSaving ? 'Guardando...' : 'Guardar Ficha del Insumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

