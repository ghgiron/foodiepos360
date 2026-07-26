// src/components/inventoryOnboardingForm.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { InventoryItem, AbcClassification, SucursalStock } from '../types';
import { getDropdownOptions } from '../utils/dataHelper';
import ImageUploader from './ImageUploader';
import SupplierForm from './supplierForm';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

const getStandardConversionMultiplier = (pUnit: string, uUnit: string): number | null => {
  const p = pUnit.toLowerCase().trim();
  const u = uUnit.toLowerCase().trim();

  const normalize = (unit: string) => {
    if (unit === 'kilogramo' || unit === 'kg') return 'kg';
    if (unit === 'gramo' || unit === 'g') return 'g';
    if (unit === 'litro' || unit === 'l' || unit === 'litros') return 'l';
    if (unit === 'mililitro' || unit === 'ml') return 'ml';
    if (unit === 'unidad' || unit === 'und') return 'und';
    if (unit === 'libra' || unit === 'lb' || unit === 'lbs') return 'lb';
    if (unit === 'onza' || unit === 'oz' || unit === 'onzas') return 'oz';
    return unit;
  };

  const normP = normalize(p);
  const normU = normalize(u);

  if (normP === normU) return 1;

  if (normP === 'kg' && normU === 'g') return 1000;
  if (normP === 'lb' && normU === 'g') return 453.592;
  if (normP === 'oz' && normU === 'g') return 28.3495;
  if (normP === 'l' && normU === 'ml') return 1000;

  return null;
};

interface InventoryOnboardingFormProps {
  type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET';
  onBack: () => void;
  editItemId?: string | null;
}

const InventoryOnboardingForm = React.memo(function InventoryOnboardingForm({ type, onBack, editItemId }: InventoryOnboardingFormProps) {
  // Load system settings reactively
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  // Top switches
  const [isActive, setIsActive] = useState(true);
  const [activoCatalogo, setActivoCatalogo] = useState(false);
  const [showInOnlineStore, setShowInOnlineStore] = useState(false);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load item in edit mode
  useEffect(() => {
    async function loadItem() {
      if (editItemId) {
        const item = await db.inventoryItems.get(editItemId);
        if (item) {
          setName(item.name);
          setDescription(item.description || '');
          setCategory(item.category);
          setSupplierId(item.supplierId || '');
          setStockMinLimit(item.stockMinLimit);
          setStockMaxLimit(item.stockMaxLimit || '');
          setFechaVencimiento(item.fechaVencimiento || '');
          setPurchaseUnit(item.purchaseUnit);
          setCountUnit(item.countUnit);
          setConversionMultiplier(item.conversionMultiplier || '');
          setDensity(item.density || '');
          setBottleTareWeight(item.bottleTareWeightGrams || '');
          setPurchaseCost(item.purchaseCost);
          setGainPercentage(item.gainPercentage);
          setSellPrice(item.sellPrice || '');
          setIsTaxable(item.isTaxable);
          setTaxPercentage(item.taxPercentage || '');
          setIsActive(item.isActive !== false);
          setActivoCatalogo(item.activo_catalogo !== undefined ? item.activo_catalogo : item.isActive !== false);
          setShowInOnlineStore(item.visible_tienda_online !== undefined ? item.visible_tienda_online : !!item.showInOnlineStore);
          setImage(item.img || '');

          setCantidadComprada(item.cantidadComprada !== undefined ? item.cantidadComprada : '');
          setCantidadUtilizable(item.cantidadUtilizable !== undefined ? item.cantidadUtilizable : '');
          setManejoLotes(!!item.manejoLotes);
          setInventoryObservations(item.inventoryObservations || '');

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

  // Common Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [stockMinLimit, setStockMinLimit] = useState<number | ''>('');
  const [stockMaxLimit, setStockMaxLimit] = useState<number | ''>('');
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  const [image, setImage] = useState<string>('');

  // Units
  const [purchaseUnit, setPurchaseUnit] = useState('Kilogramo');
  const [countUnit, setCountUnit] = useState('g');
  const [conversionMultiplier, setConversionMultiplier] = useState<number | ''>('');

  // Liquor-specific
  const [density, setDensity] = useState<number | ''>('');
  const [bottleTareWeight, setBottleTareWeight] = useState<number | ''>('');

  // Pricing Matrix states
  const [purchaseCost, setPurchaseCost] = useState<number | ''>('');
  const [gainPercentage, setGainPercentage] = useState<number | ''>('');
  const [sellPrice, setSellPrice] = useState<number | ''>('');
  const [isTaxable, setIsTaxable] = useState(false);
  const [taxPercentage, setTaxPercentage] = useState<number | ''>(0);

  // Ingredient detailed calculation fields
  const [cantidadComprada, setCantidadComprada] = useState<number | ''>('');
  const [cantidadUtilizable, setCantidadUtilizable] = useState<number | ''>('');
  const [manejoLotes, setManejoLotes] = useState<boolean>(false);
  const [inventoryObservations, setInventoryObservations] = useState<string>('');

  // SSoT Branch stock states
  const [branchStocks, setBranchStocks] = useState<Record<string, { stockActual: number | ''; observations: string; lote?: string; fechaVencimiento?: string }>>({});

  // Initialize defaults based on the form type
  useEffect(() => {
    if (type === 'PRODUCT') {
      setCategory('Bebidas');
      setPurchaseUnit('Unidad');
      setCountUnit('unidad');
      setConversionMultiplier(1);
      setGainPercentage(50); // Default 50% gain
      setActivoCatalogo(true);
    } else {
      setActivoCatalogo(false);
      if (type === 'INGREDIENT') {
        setCategory('Proteínas');
        setPurchaseUnit('Kilogramo');
        setCountUnit('g');
        setConversionMultiplier(1000);
        setGainPercentage(0);
      } else if (type === 'PACKAGING') {
        setCategory('Cajas');
        setPurchaseUnit('Paquete');
        setCountUnit('unidad');
        setConversionMultiplier(100);
        setGainPercentage(0);
      } else if (type === 'ASSET') {
        setCategory('Cristalería');
        setPurchaseUnit('Caja');
        setCountUnit('unidad');
        setConversionMultiplier(12);
        setGainPercentage(0);
      }
    }
  }, [type]);

  // Synchronize dynamic defaults when settings are loaded or type changes (only on creation)
  useEffect(() => {
    if (editItemId) return;
    const cats = getCategories();
    if (cats.length > 0 && !cats.includes(category)) {
      setCategory(cats[0]);
    }
  }, [type, systemSettings, category, editItemId]);

  // Reactively calculate standard conversion multiplier when units change
  const prevUnits = React.useRef({ purchaseUnit, countUnit });
  useEffect(() => {
    if (type === 'INGREDIENT') {
      const stdMult = getStandardConversionMultiplier(purchaseUnit, countUnit);
      if (stdMult !== null) {
        setConversionMultiplier(stdMult);
      } else {
        const prevStd = getStandardConversionMultiplier(prevUnits.current.purchaseUnit, prevUnits.current.countUnit) !== null;
        if (prevStd) {
          setConversionMultiplier('');
        }
      }
      prevUnits.current = { purchaseUnit, countUnit };
    }
  }, [purchaseUnit, countUnit, type]);

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
    if (supplierId && suppliers.length > 0) {
      const found = suppliers.find(s => s.id === supplierId);
      if (found) {
        setSupplierSearch(found.name);
      }
    }
  }, [supplierId, suppliers]);

  // Live query for database normalized categories
  const menuCats = useLiveQuery(() => db.menuCategories.toArray()) || [];
  const ingredientCats = useLiveQuery(() => db.ingredientCategories.toArray()) || [];
  const supplyCats = useLiveQuery(() => db.supplyCategories.toArray()) || [];

  // Default Categories List based on active onboarding type
  const getCategories = () => {
    switch (type) {
      case 'PRODUCT':
        return menuCats.map(c => c.name);
      case 'INGREDIENT':
        return ingredientCats.map(c => c.name);
      case 'PACKAGING':
        return supplyCats.map(c => c.name);
      case 'ASSET':
        return getDropdownOptions('AssetCategory', systemSettings);
      default:
        return [];
    }
  };

  const officialUnitsList = getDropdownOptions('official_units', systemSettings);
  const purchaseUnitsList = officialUnitsList;
  const countUnitsList = officialUnitsList;

  const taxOptions = getDropdownOptions('tax_options', systemSettings);

  const isStandardConversion = useMemo(() => {
    return getStandardConversionMultiplier(purchaseUnit, countUnit) !== null;
  }, [purchaseUnit, countUnit]);

  // --- RECTIVE PRICING EQUATIONS ---

  // Handler when Precio Compra or % Ganancia is updated
  const calculateSellPrice = (costVal: number, gainVal: number) => {
    if (costVal <= 0) return 0;
    return costVal * (1 + gainVal / 100);
  };

  const handleCostChange = (val: number | '') => {
    setPurchaseCost(val);
    if (val !== '' && gainPercentage !== '') {
      const sp = calculateSellPrice(val, Number(gainPercentage));
      setSellPrice(Math.round(sp));
    } else {
      setSellPrice('');
    }
  };

  const handleGainChange = (val: number | '') => {
    setGainPercentage(val);
    if (purchaseCost !== '' && val !== '') {
      const sp = calculateSellPrice(Number(purchaseCost), val);
      setSellPrice(Math.round(sp));
    } else {
      setSellPrice('');
    }
  };

  const handleSellPriceChange = (val: number | '') => {
    setSellPrice(val);
    if (val !== '' && purchaseCost !== '' && Number(purchaseCost) > 0) {
      const costNum = Number(purchaseCost);
      const calculatedGain = ((val - costNum) / costNum) * 100;
      setGainPercentage(Math.round(calculatedGain));
    } else {
      setGainPercentage('');
    }
  };

  // Usage Cost / Cost per Unit of Use (Common for Ingredients)
  const calculatedUsageCost = useMemo(() => {
    const cost = Number(purchaseCost) || 0;
    const multiplier = Number(conversionMultiplier) || 1;
    if (cost <= 0 || multiplier <= 0) return 0;
    return cost / multiplier;
  }, [purchaseCost, conversionMultiplier]);

  // Detailed calculations for purchase and yield (Ingrediente specific)
  const costCalculations = useMemo(() => {
    const cost = Number(purchaseCost) || 0;
    const buyQty = Number(cantidadComprada) || 0;
    const utilQty = Number(cantidadUtilizable) || 0;
    const mult = Number(conversionMultiplier) || 1;

    const cantEquivalente = buyQty * mult;

    // Rendimiento (%)
    const rendimiento = cantEquivalente > 0 ? (utilQty / cantEquivalente) * 100 : 0;

    // Merma (%)
    const merma = cantEquivalente > 0 ? 100 - rendimiento : 0;

    // Factor de corrección
    const factor = (cantEquivalente > 0 && utilQty > 0) ? cantEquivalente / utilQty : 1;

    // Costo de compra = cost
    // Costo unitario = Precio de compra / Cantidad utilizable
    const costoUnitario = utilQty > 0 ? cost / utilQty : 0;

    // Costo real por unidad = Costo unitario * Factor de corrección
    const costoRealPorUnidad = costoUnitario * factor;

    return {
      rendimiento: Number(rendimiento.toFixed(2)),
      merma: Number(merma.toFixed(2)),
      factor: Number(factor.toFixed(4)),
      costBruto: Number(costoUnitario.toFixed(4)), // Mapped to costBruto for database/handling consistency
      costReal: Number(costoRealPorUnidad.toFixed(4)), // Mapped to costReal for database/handling consistency
      cantEquivalente: Number(cantEquivalente.toFixed(4))
    };
  }, [purchaseCost, cantidadComprada, cantidadUtilizable, conversionMultiplier]);

  // PVP Final including taxes (Precio Venta * (1 + Tax / 100))
  const pvpFinal = useMemo(() => {
    const basePrice = Number(sellPrice) || 0;
    if (!isTaxable) return basePrice;
    const tax = Number(taxPercentage) || 0;
    return basePrice * (1 + tax / 100);
  }, [sellPrice, isTaxable, taxPercentage]);

  // --- REACTIVE ABC CLASSIFICATION ---
  const abcClassificationValue = useMemo<AbcClassification>(() => {
    if (!category) return 'C';
    const name = category.trim().toLowerCase();
    
    // Normalize comparison by stripping accents
    const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (
      normalized === 'proteinas' ||
      normalized === 'mariscos y pescados' ||
      normalized === 'pulpas de frutas' ||
      normalized.includes('prote') ||
      normalized.includes('marisco') ||
      normalized.includes('pescado') ||
      normalized.includes('pulpa') ||
      normalized.includes('licor')
    ) {
      return 'A';
    }

    if (
      normalized === 'quesos' ||
      normalized === 'vegetales' ||
      normalized.includes('queso') ||
      normalized.includes('vegetal') ||
      normalized.includes('lacte') ||
      normalized.includes('verdura') ||
      normalized.includes('abarrote') ||
      normalized.includes('frut') ||
      normalized.includes('salsa') ||
      normalized.includes('bebi')
    ) {
      return 'B';
    }

    return 'C';
  }, [category]);

  // --- BRANCH STOCK VALUATIONS ---
  // For Product: stock * purchaseCost (or usageCost since conversion is 1)
  // For Ingredients: stock * usageCost (costoUnitarioReal)
  const costUnitForValuation = useMemo(() => {
    if (type === 'PRODUCT') return Number(purchaseCost) || 0;
    if (type === 'INGREDIENT') return costCalculations.costReal;
    return calculatedUsageCost;
  }, [type, purchaseCost, costCalculations.costReal, calculatedUsageCost]);

  // SSoT branches list (filtered to active ones only)
  const allBranches = getDropdownOptions('system_branches', systemSettings) as Array<{ id: string; name: string; active?: boolean }>;
  const systemBranches = useMemo(() => {
    return allBranches.filter(b => b.active !== false);
  }, [allBranches]);

  const getBranchValuation = (branchId: string) => {
    const stock = Number(branchStocks[branchId]?.stockActual) || 0;
    return stock * costUnitForValuation;
  };

  const handleBranchStockChange = (branchId: string, value: number | '') => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { observations: '' },
        stockActual: value
      }
    }));
  };

  const handleBranchObservationsChange = (branchId: string, value: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { stockActual: '' },
        observations: value
      }
    }));
  };

  const handleBranchLoteChange = (branchId: string, value: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { stockActual: '', observations: '' },
        lote: value
      }
    }));
  };

  const handleBranchExpiryChange = (branchId: string, value: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId] || { stockActual: '', observations: '' },
        fechaVencimiento: value
      }
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name) return;

    if (type === 'INGREDIENT') {
      const buyQty = Number(cantidadComprada) || 0;
      const utilQty = Number(cantidadUtilizable) || 0;
      const mult = Number(conversionMultiplier) || 0;
      const cost = Number(purchaseCost) || 0;

      if (cost <= 0) {
        toast.error('El precio de compra debe ser mayor que cero.');
        return;
      }
      if (buyQty <= 0) {
        toast.error('La cantidad comprada debe ser mayor que cero.');
        return;
      }
      if (mult <= 0) {
        toast.error('La equivalencia debe ser mayor que cero.');
        return;
      }
      if (utilQty <= 0) {
        toast.error('La cantidad utilizable debe ser mayor que cero.');
        return;
      }
      if (utilQty > buyQty * mult) {
        toast.error('La cantidad utilizable no podrá ser mayor que la cantidad equivalente.');
        return;
      }
    }

    const parsedCost = Number(purchaseCost) || 0;
    const parsedMinStock = Number(stockMinLimit) || 0;
    const parsedMaxStock = Number(stockMaxLimit) || 0;
    const parsedTax = isTaxable ? (Number(taxPercentage) || 0) : 0;
    const parsedDensity = category === 'Licores' ? (Number(density) || 1.0) : 1.0;
    const parsedTare = category === 'Licores' ? (Number(bottleTareWeight) || 0) : 0;
    const parsedMultiplier = Number(conversionMultiplier) || 1;
    const parsedSellPrice = Number(sellPrice) || 0;

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
    const totalStock = sucursalStock.reduce((sum, s) => {
      // Only sum stock from currently active branches for the main item total, or sum all of them?
      // Since totalStock is for active management, let's sum active branches or all. Let's sum active ones as it represents current operational stock.
      // Wait, let's check: the active ones is safer for the active stock count. Let's check which is used:
      // If we reactivate a branch, it will be added back. Let's sum all of them to be safe with DB consistency.
      return sum + s.stockActual;
    }, 0);

    let prefix = 'ins-gen';
    if (type === 'PRODUCT') prefix = 'ins-prd';
    else if (type === 'INGREDIENT') prefix = 'ins-ing';
    else if (type === 'PACKAGING') prefix = 'ins-pkg';
    else if (type === 'ASSET') prefix = 'ins-ast';

    const itemId = editItemId || `${prefix}-${Date.now().toString().slice(-4)}`;

    const newItem: InventoryItem = {
      id: itemId,
      name,
      category,
      purchaseUnit,
      countUnit,
      conversionMultiplier: parsedMultiplier,
      yieldFactor: 1.0,
      density: parsedDensity,
      bottleTareWeightGrams: parsedTare,
      purchaseCost: parsedCost,
      gainPercentage: Number(gainPercentage) || 0,
      sellPrice: parsedSellPrice,
      isTaxable,
      taxPercentage: parsedTax,
      stockMinLimit: parsedMinStock,
      stockMaxLimit: parsedMaxStock,
      fechaVencimiento: fechaVencimiento || undefined,
      theoreticalStock: totalStock,
      realPhysicalStock: totalStock,
      abcClassification: abcClassificationValue,
      supplierId: supplierId || 'prov-generic',
      sucursalStock,
      updatedAt: new Date().toISOString(),
      inventoryType: type === 'ASSET' ? 'ASSET' : 'CONSUMABLE',
      description,
      showInOnlineStore: type === 'PRODUCT' ? showInOnlineStore : false,
      isActive,
      activo_catalogo: type === 'PRODUCT' ? activoCatalogo : false,
      visible_tienda_online: type === 'PRODUCT' ? showInOnlineStore : false,
      img: image,
      cantidadComprada: type === 'INGREDIENT' ? (Number(cantidadComprada) || 0) : undefined,
      cantidadUtilizable: type === 'INGREDIENT' ? (Number(cantidadUtilizable) || 0) : undefined,
      mermaPercentage: type === 'INGREDIENT' ? costCalculations.merma : undefined,
      factorCorreccion: type === 'INGREDIENT' ? costCalculations.factor : undefined,
      costoUnitarioBruto: type === 'INGREDIENT' ? costCalculations.costBruto : undefined,
      costoUnitarioReal: type === 'INGREDIENT' ? costCalculations.costReal : undefined,
      manejoLotes: type === 'INGREDIENT' ? manejoLotes : undefined,
      inventoryObservations: type === 'INGREDIENT' ? inventoryObservations.trim() : undefined
    };

    try {
      await db.inventoryItems.put(newItem);
      toast.success(editItemId ? `Recurso "${name}" actualizado exitosamente.` : `Recurso "${name}" catalogado exitosamente.`);
      onBack();
    } catch (error) {
      console.error('Error saving inventory item:', error);
      toast.error('Error al guardar el elemento en IndexedDB.');
    }
  };

  const handleDelete = async () => {
    if (!editItemId) return;
    try {
      await db.inventoryItems.delete(editItemId);
      toast.success(`Recurso "${name}" eliminado exitosamente.`);
      onBack();
    } catch (err) {
      console.error('Error deleting item:', err);
      toast.error('Error al eliminar el elemento.');
    }
  };

  const getButtonText = () => {
    const isEdit = !!editItemId;
    switch (type) {
      case 'PRODUCT':
        return isEdit ? 'Actualizar Producto' : 'Crear Producto';
      case 'INGREDIENT':
        return isEdit ? 'Actualizar Ingrediente' : 'Crear Ingrediente';
      case 'ASSET':
        return isEdit ? 'Actualizar Activo' : 'Crear Activo';
      case 'PACKAGING':
        return isEdit ? 'Actualizar Empaque' : 'Crear Empaque';
      default:
        return isEdit ? 'Actualizar' : 'Guardar';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left font-sans transition-receitly p-8 rounded-3xl min-h-screen">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={onBack}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white flex items-center justify-center p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer bg-transparent"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-headline font-black text-slate-900 dark:text-white leading-tight">
              {type === 'PRODUCT'
                ? (editItemId ? 'Editar Producto Único' : 'Nuevo Producto Único')
                : type === 'INGREDIENT'
                ? (editItemId ? 'Editar Ingrediente' : 'Nuevo Ingrediente')
                : type === 'PACKAGING'
                ? (editItemId ? 'Editar Empaque / Embalaje' : 'Nuevo Empaque / Embalaje')
                : (editItemId ? 'Editar Activo' : 'Nuevo Activo')}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {editItemId && (
            <button 
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0 border-none"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              Eliminar
            </button>
          )}
          <button 
            type="button"
            onClick={() => handleSubmit()}
            className="px-5 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-xs font-bold rounded-xl shadow-md shadow-[var(--accent-pink)]/15 cursor-pointer flex items-center gap-1.5 shrink-0 border-none active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {getButtonText()}
          </button>
        </div>
      </div>

      {type === 'INGREDIENT' ? (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-6 items-start w-full animate-fade-in text-left">
          {/* Card 1: Información General (70% equivalent: 8 columns) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">info</span>
                Información General
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    Nombre del Insumo / Ingrediente
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                    placeholder="Ej. Harina de Trigo Integral"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                    placeholder="Detalles, notas de almacenamiento..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Categoría
                    </label>
                    <CustomSelect
                      value={category}
                      onChange={setCategory}
                      options={getCategories().map(cat => ({ value: cat, label: cat }))}
                      className="bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
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
                        className="w-full bg-slate-5/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 pl-3 pr-10"
                        placeholder="Buscar proveedor..."
                      />
                      <span className="material-symbols-outlined text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                        keyboard_arrow_down
                      </span>

                      {showSupplierDropdown && (
                        <div className="absolute left-0 right-0 top-11 bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-2xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[rgba(143,99,244,0.15)] text-left">
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setShowSupplierModal(true);
                              setShowSupplierDropdown(false);
                            }}
                            className="w-full text-left p-3 text-xs hover:bg-[var(--accent-purple)]/10 dark:hover:bg-[var(--accent-purple)]/20 font-black text-[var(--accent-purple)] transition-colors border-none flex items-center gap-1.5 cursor-pointer bg-transparent"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Crear Proveedor
                          </button>
                          {filteredSuppliers.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSupplierId(s.id);
                                setSupplierSearch(s.name);
                                setShowSupplierDropdown(false);
                              }}
                              className="w-full text-left p-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 transition-colors border-none bg-transparent"
                            >
                              <div>{s.name}</div>
                              <div className="text-[9px] text-slate-400 font-semibold">{s.contact} | {s.email}</div>
                            </button>
                          ))}
                          {filteredSuppliers.length === 0 && (
                            <div className="p-3 text-xs text-slate-450 italic">No se encontraron proveedores.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Imagen + Estado (30% equivalent: 4 columns) */}
          <div className="col-span-12 md:col-span-2 lg:col-span-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4 flex flex-col justify-between self-stretch">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">image</span>
                Imagen y Estado
              </h3>
              
              <div className="space-y-4">
                <ImageUploader
                  value={image}
                  onChange={setImage}
                  label="Imagen del Insumo / Ingrediente"
                  helperText="PNG, JPG, WEBP hasta 5MB"
                />
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-850">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase text-slate-500">¿Activo en Inventario?</span>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isActive ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
                >
                  <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Compra y Rendimiento (70% equivalent: 8 columns) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">local_shipping</span>
                Compra y Rendimiento
              </h3>

              <div className="space-y-4">
                {/* Bloque 1: Compra */}
                <div className="border-b border-slate-100 dark:border-slate-800/50 pb-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">shopping_bag</span>
                    1 Compra
                  </h4>
                  <div className="grid grid-cols-12 gap-3 md:gap-4">
                    <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-550 mb-1">
                        Precio de compra ($)
                      </label>
                      <input
                        type="number"
                        required
                        value={purchaseCost}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          handleCostChange(val);
                        }}
                        className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-right"
                        placeholder="0"
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Unidad de compra
                      </label>
                      <CustomSelect
                        value={purchaseUnit}
                        onChange={(val) => {
                          setPurchaseUnit(val);
                          if (val === 'Kilogramo' || val === 'Kg') setCountUnit('g');
                          else if (val === 'Litro' || val === 'L') setCountUnit('ml');
                          else if (val === 'lb') setCountUnit('g');
                          else if (val === 'oz') setCountUnit('g');
                          else if (val === 'g') setCountUnit('g');
                          else if (val === 'ml') setCountUnit('ml');
                        }}
                        options={purchaseUnitsList.map(unit => ({ value: unit, label: unit }))}
                        className="bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white w-full"
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Cantidad
                      </label>
                      <input
                        type="number"
                        required
                        value={cantidadComprada}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setCantidadComprada(val);
                        }}
                        className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-center"
                        placeholder="0"
                      />
                    </div>

                    {/* Tax Block */}
                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <div className="flex flex-col gap-1 h-full justify-between">
                        <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                          ¿Es Gravable?
                        </label>
                        <div className="flex items-center gap-2 h-11 bg-slate-550/50 dark:bg-slate-955/30 border border-[rgba(143,99,244,0.15)] rounded-xl px-3 justify-between">
                          <input
                            type="checkbox"
                            id="ingredient-is-taxable"
                            checked={isTaxable}
                            onChange={(e) => setIsTaxable(e.target.checked)}
                            className="rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] cursor-pointer"
                          />
                          {isTaxable && (
                            <div className="relative w-16">
                              <CustomSelect
                                value={String(taxPercentage)}
                                onChange={(val) => setTaxPercentage(Number(val))}
                                options={taxOptions.map((opt) => ({ value: String(opt), label: `${opt}%` }))}
                                className="w-full bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-lg p-1 text-[10px] font-mono font-bold text-slate-900 dark:text-white text-right"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloque 2: Conversión */}
                <div className="border-b border-slate-100 dark:border-slate-800/50 pb-3 py-1">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">sync_alt</span>
                    2 Conversión
                  </h4>
                  <div className="grid grid-cols-12 gap-3 md:gap-4">
                    <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Unidad de uso
                      </label>
                      <CustomSelect
                        value={countUnit}
                        onChange={(val) => {
                          setCountUnit(val);
                        }}
                        options={countUnitsList.map(unit => ({ value: unit, label: unit }))}
                        className="bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white w-full"
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-6 lg:col-span-8">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Equivalencia de conversión
                      </label>
                      <div className="flex items-center gap-2 bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                          1 {purchaseUnit} =
                        </span>
                        <input
                          type="number"
                          required
                          disabled={isStandardConversion}
                          readOnly={isStandardConversion}
                          value={conversionMultiplier}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setConversionMultiplier(val);
                          }}
                          className={`w-full bg-transparent border-none outline-none text-center font-mono font-bold text-xs ${
                            isStandardConversion
                              ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                              : 'text-slate-900 dark:text-white'
                          }`}
                          placeholder={isStandardConversion ? '' : 'Ej. 24'}
                        />
                        <span className="text-xs font-bold text-slate-750 dark:text-slate-250 shrink-0">
                          {countUnit}
                        </span>
                      </div>
                      {isStandardConversion && (
                        <span className="text-[9px] font-semibold text-slate-400 italic mt-1 block">
                          * Conversión estándar calculada automáticamente.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bloque 3: Rendimiento y Merma */}
                <div className="py-1">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">insights</span>
                    3 Rendimiento
                  </h4>
                  <div className="grid grid-cols-12 gap-3 md:gap-4">
                    <div className="col-span-12 sm:col-span-6 lg:col-span-8">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-550 mb-1">
                        Cantidad utilizable
                      </label>
                      <input
                        type="number"
                        required
                        value={cantidadUtilizable}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setCantidadUtilizable(val);
                        }}
                        className={`w-full bg-slate-50/50 dark:bg-slate-955/50 border rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 outline-none text-center ${
                          Number(cantidadUtilizable) > costCalculations.cantEquivalente
                            ? 'border-rose-500 focus:ring-rose-500 text-rose-600'
                            : 'border-[rgba(143,99,244,0.15)] focus:ring-[var(--accent-purple)] text-slate-900 dark:text-white'
                        }`}
                        placeholder="0"
                      />
                      {Number(cantidadUtilizable) > costCalculations.cantEquivalente && (
                        <span className="text-[9px] text-rose-500 font-bold mt-1 block">
                          * La cantidad utilizable no puede superar la equivalente ({costCalculations.cantEquivalente} {countUnit})
                        </span>
                      )}
                    </div>

                    <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Merma (%)
                      </label>
                      <input
                        type="number"
                        readOnly
                        value={costCalculations.merma}
                        className="w-full bg-slate-100 dark:bg-slate-955/30 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs font-mono font-bold text-rose-500 dark:text-rose-450 outline-none text-center cursor-not-allowed"
                        placeholder="0"
                      />
                      <span className="text-[9px] font-semibold text-slate-400 italic mt-1 block">
                        * Calculado automáticamente.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Costeo y Métricas (30% equivalent: 4 columns) */}
          <div className="col-span-12 md:col-span-2 lg:col-span-4 bg-[#121829] dark:bg-slate-900/60 text-white border border-slate-800 rounded-3xl p-5 flex flex-col justify-between space-y-4 self-stretch">
            <div>
              <h3 className="text-xs font-extrabold text-slate-400 flex items-center gap-2 pb-2 border-b border-white/10 uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">analytics</span>
                Costeo y Métricas
              </h3>

              <div className="divide-y divide-white/5 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Costo compra</span>
                  <span className="font-mono font-bold text-slate-200">
                    ${(Number(purchaseCost) || 0).toLocaleString('es-CO')} COP
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Costo unitario</span>
                  <span className="font-mono font-bold text-slate-200">
                    ${costCalculations.costBruto.toLocaleString('es-CO', { minimumFractionDigits: 2 })} / {countUnit}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Factor corrección</span>
                  <span className="font-mono font-bold text-slate-200">
                    {costCalculations.factor}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 bg-emerald-500/10 border border-emerald-500/25 px-3 rounded-xl mt-1 shadow-sm">
                  <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Costo real</span>
                  <span className="font-mono font-black text-emerald-300 text-sm">
                    ${costCalculations.costReal.toLocaleString('es-CO', { minimumFractionDigits: 2 })} / {countUnit}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Merma</span>
                  <span className="font-mono font-bold text-rose-400">
                    {costCalculations.merma}%
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Rendimiento</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {costCalculations.rendimiento}%
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-t border-white/10 mt-1">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-wider">Clasificación</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${
                    abcClassificationValue === 'A' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                    abcClassificationValue === 'B' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                    'bg-slate-800 text-slate-300 border-slate-700'
                  }`}>
                    Clase {abcClassificationValue}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 5: Inventario y Alertas (100% equivalent: 12 columns) */}
          <div className="col-span-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">inventory_2</span>
              Inventario y Alertas
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  Stock Mínimo ({countUnit})
                </label>
                <input
                  type="number"
                  required
                  value={stockMinLimit}
                  onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-center"
                  placeholder="10"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  Stock Máximo ({countUnit})
                </label>
                <input
                  type="number"
                  value={stockMaxLimit}
                  onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-center"
                  placeholder="100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  Fecha de Vencimiento
                </label>
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-center"
                />
              </div>

              <div className="flex flex-col justify-center items-center p-2 bg-slate-500/5 rounded-xl border border-[rgba(143,99,244,0.15)]">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 mb-1">Manejo por lotes</span>
                <button
                  type="button"
                  onClick={() => setManejoLotes(!manejoLotes)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${manejoLotes ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
                >
                  <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${manejoLotes ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                Observaciones de inventario
              </label>
              <textarea
                value={inventoryObservations}
                onChange={(e) => setInventoryObservations(e.target.value)}
                className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                placeholder="Notas específicas sobre manipulación o almacenamiento del lote..."
                rows={2}
              />
            </div>
          </div>

          {/* Card 6: Stock Inicial por Sucursal (100% equivalent: 12 columns) */}
          <div className="col-span-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4 animate-fade-in text-left">
            <div>
              <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-2">
                <span className="material-symbols-outlined text-[var(--text-muted)]">store</span>
                Stock Inicial por Sucursal
              </h4>
              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mb-4">
                * Cantidades expresadas en la Unidad de Conteo ({countUnit})
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {systemBranches.map(branch => {
                  const stockValue = branchStocks[branch.id]?.stockActual ?? '';
                  const observationsValue = branchStocks[branch.id]?.observations ?? '';
                  const loteValue = branchStocks[branch.id]?.lote ?? '';
                  const expiryValue = branchStocks[branch.id]?.fechaVencimiento ?? '';
                  const branchValuation = getBranchValuation(branch.id);

                  return (
                    <div key={branch.id} className="p-4 bg-slate-50/50 dark:bg-slate-905/30 rounded-2xl border border-slate-200/30 dark:border-slate-800/40 space-y-3 text-left animate-fade-in">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">{branch.name}</span>
                        <span className="text-[10px] font-black font-mono text-[var(--accent-purple)]">
                          Val: ${branchValuation.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Stock Inicial</label>
                            <input
                              type="number"
                              value={stockValue}
                              onChange={(e) => handleBranchStockChange(branch.id, e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold text-center focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Lote</label>
                            <input
                              type="text"
                              value={loteValue}
                              onChange={(e) => handleBranchLoteChange(branch.id, e.target.value)}
                              className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                              placeholder="Ej. L-001"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Vencimiento</label>
                            <input
                              type="date"
                              value={expiryValue}
                              onChange={(e) => handleBranchExpiryChange(branch.id, e.target.value)}
                              className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-[10px] text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Observaciones</label>
                            <input
                              type="text"
                              value={observationsValue}
                              onChange={(e) => handleBranchObservationsChange(branch.id, e.target.value)}
                              className="w-full bg-slate-50/50 dark:bg-slate-955/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                              placeholder="Notas"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {systemBranches.length === 0 && (
                  <p className="text-xs text-slate-400 italic text-center py-2 col-span-3">No hay sedes configuradas.</p>
                )}
              </div>
            </div>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full">
        
        {/* ==================== FILA 1 ==================== */}
        
        {/* Card 1: Información General (70%) */}
        <div className="lg:col-span-8 flex flex-col justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">info</span>
              Información General
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  {type === 'PRODUCT' ? 'Nombre del Producto' : 'Nombre del Insumo / Ingrediente'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                  placeholder={type === 'PRODUCT' ? 'Ej. Cerveza Laboyana' : 'Ej. Harina de Trigo Integral'}
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                  placeholder="Detalles, notas de almacenamiento..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    Categoría
                  </label>
                  <CustomSelect
                    value={category}
                    onChange={setCategory}
                    options={getCategories().map(cat => ({ value: cat, label: cat }))}
                    className="bg-slate-550/10 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
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
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 pl-3 pr-10"
                      placeholder="Buscar proveedor..."
                    />
                    <span className="material-symbols-outlined text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                      keyboard_arrow_down
                    </span>

                    {showSupplierDropdown && (
                      <div className="absolute left-0 right-0 top-11 bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-2xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[rgba(143,99,244,0.15)] text-left">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setShowSupplierModal(true);
                            setShowSupplierDropdown(false);
                          }}
                          className="w-full text-left p-3 text-xs hover:bg-[var(--accent-purple)]/10 dark:hover:bg-[var(--accent-purple)]/20 font-black text-[var(--accent-purple)] transition-colors border-none flex items-center gap-1.5 cursor-pointer bg-transparent"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          Crear Proveedor
                        </button>
                        {filteredSuppliers.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSupplierId(s.id);
                              setSupplierSearch(s.name);
                              setShowSupplierDropdown(false);
                            }}
                            className="w-full text-left p-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 transition-colors border-none bg-transparent"
                          >
                            <div>{s.name}</div>
                            <div className="text-[9px] text-slate-400 font-semibold">{s.contact} | {s.email}</div>
                          </button>
                        ))}
                        {filteredSuppliers.length === 0 && (
                          <div className="p-3 text-xs text-slate-400 italic">No se encontraron proveedores.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Imagen + Estado (30%) */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">image</span>
              Imagen y Estado
            </h3>
            
            <div className="space-y-4">
              <ImageUploader
                value={image}
                onChange={setImage}
                label={type === 'PRODUCT' ? 'Imagen del Producto' : 'Imagen del Insumo / Ingrediente'}
                helperText="PNG, JPG, WEBP hasta 5MB"
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-850">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-slate-500">¿Activo en Inventario?</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isActive ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
              >
                <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>

            {type === 'PRODUCT' && (
              <>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-850">
                  <span className="text-[10px] font-extrabold uppercase text-slate-505">¿Activo en Catálogo?</span>
                  <button
                    type="button"
                    onClick={() => setActivoCatalogo(!activoCatalogo)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${activoCatalogo ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
                  >
                    <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${activoCatalogo ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-850">
                  <span className="text-[10px] font-extrabold uppercase text-slate-505">Visible en Tienda Online</span>
                  <button
                    type="button"
                    onClick={() => setShowInOnlineStore(!showInOnlineStore)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${showInOnlineStore ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
                  >
                    <div className={`bg-white h-4 w-4 rounded-full shadow transform transition-transform duration-300 ${showInOnlineStore ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ==================== FILA 2 ==================== */}

        {/* Card 3: Logística y Alertas (40%) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">local_shipping</span>
              Logística y Alertas
            </h3>

            {type === 'PRODUCT' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Unidad de Medida
                    </label>
                    <CustomSelect
                      value={purchaseUnit}
                      onChange={(val) => {
                        setPurchaseUnit(val);
                        setCountUnit(val);
                      }}
                      options={officialUnitsList.map(unit => ({ value: unit, label: unit }))}
                      className="bg-slate-550/10 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Fecha de Vencimiento
                    </label>
                    <input
                      type="date"
                      value={fechaVencimiento}
                      onChange={(e) => setFechaVencimiento(e.target.value)}
                      className="w-full bg-slate-550/10 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Stock Mín. de Alerta
                    </label>
                    <input
                      type="number"
                      required
                      value={stockMinLimit}
                      onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Stock Máx. Sugerido
                    </label>
                    <input
                      type="number"
                      value={stockMaxLimit}
                      onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                      placeholder="100"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Unidad de Compra
                    </label>
                    <CustomSelect
                      value={purchaseUnit}
                      onChange={setPurchaseUnit}
                      options={purchaseUnitsList.map(unit => ({ value: unit, label: unit }))}
                      className="bg-slate-550/10 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Unidad de Conteo
                    </label>
                    <CustomSelect
                      value={countUnit}
                      onChange={setCountUnit}
                      options={countUnitsList.map(unit => ({ value: unit, label: unit }))}
                      className="bg-slate-550/10 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Equivalencia
                    </label>
                    <input
                      type="number"
                      required
                      value={conversionMultiplier}
                      onChange={(e) => setConversionMultiplier(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-center"
                      placeholder="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Stock Mínimo
                    </label>
                    <input
                      type="number"
                      required
                      value={stockMinLimit}
                      onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-center"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Stock Máximo
                    </label>
                    <input
                      type="number"
                      value={stockMaxLimit}
                      onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-center"
                      placeholder="100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    Fecha de Vencimiento
                  </label>
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-center"
                  />
                </div>
              </div>
            )}
          </div>

          {category === 'Licores' && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--accent-purple)]/5 rounded-2xl border border-[rgba(143,99,244,0.15)] mt-2">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                  Densidad (g/ml)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={density}
                  onChange={(e) => setDensity(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white"
                  placeholder="Ej. 0.94"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                  Tara Botella Vacía (g)
                </label>
                <input
                  type="number"
                  value={bottleTareWeight}
                  onChange={(e) => setBottleTareWeight(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white"
                  placeholder="Ej. 450"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 4: Información Financiera (30%) */}
        <div className="lg:col-span-3 flex flex-col justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">payments</span>
              Finanzas
            </h3>

            {type === 'PRODUCT' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-550 mb-1">
                    Costo Compra ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">$</span>
                    <input
                      type="number"
                      required
                      value={purchaseCost}
                      onChange={(e) => handleCostChange(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl py-2.5 pl-6 pr-2 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-right"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-550 mb-1">
                    % Margen Ganancia
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      value={gainPercentage}
                      onChange={(e) => handleGainChange(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl py-2.5 px-2 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-center pr-8"
                      placeholder="50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-550 mb-1">
                    Precio Venta Sugerido ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-505">$</span>
                    <input
                      type="number"
                      required
                      value={sellPrice}
                      onChange={(e) => handleSellPriceChange(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl py-2.5 pl-6 pr-2 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-right"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold text-slate-505 flex items-center gap-1">
                      ¿Tiene IVA?
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTaxable(!isTaxable)}
                      className={`w-9 h-5.5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isTaxable ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
                    >
                      <div className={`bg-white w-4.5 h-4.5 rounded-full shadow transform transition-transform duration-300 ${isTaxable ? 'translate-x-3.5' : 'translate-x-0'}`}></div>
                    </button>
                  </div>

                  {isTaxable && (
                    <div className="flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] p-2 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-550">Tarifa (%)</span>
                      <div className="relative w-20">
                        <CustomSelect
                          value={String(taxPercentage)}
                          onChange={(val) => setTaxPercentage(Number(val))}
                          options={taxOptions.map((opt: number) => ({ value: String(opt), label: `${opt}%` }))}
                          className="w-full bg-white dark:bg-slate-900 border border-[rgba(143,99,244,0.15)] rounded-lg p-1 text-xs font-mono font-bold text-slate-900 dark:text-white text-right"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    Precio Compra ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={purchaseCost}
                    onChange={(e) => handleCostChange(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-3 text-xs font-mono font-bold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-slate-900 dark:text-white text-right"
                    placeholder="Ej. 95000"
                  />
                </div>

                <div className="flex flex-col gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] font-extrabold text-slate-505 uppercase">¿Es Gravable?</span>
                    <input
                      type="checkbox"
                      checked={isTaxable}
                      onChange={(e) => setIsTaxable(e.target.checked)}
                      className="rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] cursor-pointer"
                    />
                  </div>

                  {isTaxable && (
                    <div className="relative mt-1">
                      <input
                        type="number"
                        value={taxPercentage}
                        onChange={(e) => setTaxPercentage(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200/50 dark:border-slate-800/50 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-900 dark:text-white text-right pr-8"
                        placeholder="8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 font-mono">%</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 5: Costeo (30%) */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-6 space-y-4 h-full">
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">analytics</span>
              Costeo y Métricas
            </h3>

            <div className="py-4">
              {type === 'PRODUCT' ? (
                <div className="bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20 shadow-sm space-y-3">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase block">
                    Precio Venta Final (PVP):
                  </span>
                  <div className="text-xl font-black font-mono text-emerald-500">
                    ${Math.round(pvpFinal).toLocaleString('es-CO')} COP
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Calculado automáticamente sumando los impuestos configurados al precio base de venta.
                  </p>
                </div>
              ) : (
                <div className="bg-[var(--accent-purple)]/10 p-5 rounded-2xl border border-[rgba(143,99,244,0.15)] shadow-sm space-y-3">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase block">
                    Costo por Unidad de Uso:
                  </span>
                  <div className="text-xl font-black font-mono text-[var(--accent-purple)]">
                    ${calculatedUsageCost.toLocaleString('es-CO', { minimumFractionDigits: 2 })} / {countUnit}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Representa el costo prorrateado de acuerdo a la equivalencia de empaque ingresada.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${
              abcClassificationValue === 'A' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
              abcClassificationValue === 'B' ? 'bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[rgba(143,99,244,0.15)]' :
              'bg-slate-550/10 text-slate-500 border border-slate-200/30'
            }`}>
              Clasificación ABC: Clase {abcClassificationValue}
            </span>
          </div>
        </div>

        {/* ==================== FILA 3 ==================== */}

        {/* Card 6: Stock Inicial por Sucursal (100%) */}
        <div className="lg:col-span-12 flex flex-col justify-between bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-6 space-y-4 w-full">
          <div>
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-2">
              <span className="material-symbols-outlined text-[var(--text-muted)]">store</span>
              Stock Inicial por Sucursal
            </h4>
            <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mb-4">
              * Cantidades expresadas en la Unidad de Conteo ({countUnit})
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemBranches.map(branch => {
                const stockValue = branchStocks[branch.id]?.stockActual ?? '';
                const observationsValue = branchStocks[branch.id]?.observations ?? '';
                const loteValue = branchStocks[branch.id]?.lote ?? '';
                const expiryValue = branchStocks[branch.id]?.fechaVencimiento ?? '';
                const branchValuation = getBranchValuation(branch.id);

                return (
                  <div key={branch.id} className="p-4 bg-slate-50/50 dark:bg-slate-905/30 rounded-2xl border border-slate-200/30 dark:border-slate-800/40 space-y-3 text-left animate-fade-in">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/80">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">{branch.name}</span>
                      <span className="text-[10px] font-black font-mono text-[var(--accent-purple)]">
                        Val: ${branchValuation.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Stock Inicial</label>
                          <input
                            type="number"
                            value={stockValue}
                            onChange={(e) => handleBranchStockChange(branch.id, e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-xs text-slate-900 dark:text-white font-mono font-bold text-center focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Lote</label>
                          <input
                            type="text"
                            value={loteValue}
                            onChange={(e) => handleBranchLoteChange(branch.id, e.target.value)}
                            className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="Ej. L-001"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Vencimiento</label>
                          <input
                            type="date"
                            value={expiryValue}
                            onChange={(e) => handleBranchExpiryChange(branch.id, e.target.value)}
                            className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-[10px] text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Observaciones</label>
                          <input
                            type="text"
                            value={observationsValue}
                            onChange={(e) => handleBranchObservationsChange(branch.id, e.target.value)}
                            className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-[rgba(143,99,244,0.15)] rounded-xl p-2 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
                            placeholder="Notas"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {systemBranches.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-2 col-span-3">No hay sedes activas configuradas.</p>
              )}
            </div>
          </div>
        </div>
      </form>
      )}

      {showSupplierModal && (
        <Modal title="Crear Proveedor" onClose={() => setShowSupplierModal(false)}>
          <SupplierForm
            onCancel={() => setShowSupplierModal(false)}
            onSaved={(newId) => {
              if (newId) {
                setSupplierId(newId);
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

export default InventoryOnboardingForm;
