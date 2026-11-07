import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { db } from '../db/localDb';
import { syncRecordToFirestore, deleteRecordFromFirestore } from '../services/syncService';
import { DEFAULT_SETTINGS } from '../db/settingsStore';
import { useLiveQuery } from 'dexie-react-hooks';
import type { InventoryItem, AbcClassification, SucursalStock } from '../types';
import { getPhysicalStockInBranch, getReservedStockInBranch } from '../types';
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
import { Switch } from './ui/Switch';
import useFormExitGuard from '../hooks/useFormExitGuard';
import DiscardChangesModal from './ui/DiscardChangesModal';
import {
  formatCurrency,
  formatDecimals,
  formatPercentage,
  formatFactor,
  formatUnitCost
} from '../utils/formatters';
import { getDynamicUnitEquivalence, calculateCostMetrics, normalizeUnitToOfficial } from '../utils/costEngine';
import { calculateUsableQuantityAndCost } from '../utils/unitConversion';
import { normalizeUnit, normalizeUnitId } from '../services/excelImportService';
import { useVoiceCopilotRegistration } from '../context/VoiceCopilotContext';
import type { VoiceIngredientExtraction, CopilotContextData } from '../types/voiceCopilot';
import {
  OPERATIONAL_ZONE_OPTIONS,
  normalizeOperationalZone,
  getOperationalZoneLabel
} from '../utils/operationalZones';
import { consolidateSucursalStock, consolidateStockByBranch, areBranchIdsEqual } from '../utils/branchHelper';

export const formatCostDecimals = (val: number | string | undefined | null): string => {
  return formatDecimals(val, 2);
};

interface InventoryOnboardingFormProps {
  type: 'PRODUCT' | 'INGREDIENT' | 'PACKAGING' | 'ASSET';
  onBack: () => void;
  editItemId?: string | null;
  prefillData?: VoiceIngredientExtraction | null;
}

const InventoryOnboardingForm = React.memo(function InventoryOnboardingForm({ type, onBack, editItemId, prefillData }: InventoryOnboardingFormProps) {
  // Load system settings and database categories reactively
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const menuCats = useLiveQuery(() => db.menuCategories.toArray()) || [];
  const ingredientCats = useLiveQuery(() => db.ingredientCategories.toArray()) || [];
  const supplyCats = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];

  // Top switches
  const [isActive, setIsActive] = useState(true);
  const [activoCatalogo, setActivoCatalogo] = useState(false);
  const [showInOnlineStore, setShowInOnlineStore] = useState(false);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [isUserTouched, setIsUserTouched] = useState(false);

  // Common Form Fields
  const [name, setName] = useState('');
  const [operationalZone, setOperationalZone] = useState('');
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
  const [countUnit, setCountUnit] = useState('Gramo');
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
  const [loadedEditItem, setLoadedEditItem] = useState<InventoryItem | null>(null);

  // Default Categories List based on active onboarding type
  const getCategories = useCallback(() => {
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
  }, [type, menuCats, ingredientCats, supplyCats, systemSettings]);

  const currentSnapshot = useMemo(() => {
    return JSON.stringify({
      name,
      operationalZone,
      description,
      category,
      supplierId,
      stockMinLimit,
      stockMaxLimit,
      fechaVencimiento,
      image,
      purchaseUnit,
      countUnit,
      conversionMultiplier,
      density,
      bottleTareWeight,
      purchaseCost,
      gainPercentage,
      sellPrice,
      isTaxable,
      taxPercentage,
      cantidadComprada,
      cantidadUtilizable,
      manejoLotes,
      inventoryObservations,
      branchStocks,
      isActive,
      activoCatalogo,
      showInOnlineStore,
    });
  }, [
    name,
    description,
    category,
    supplierId,
    stockMinLimit,
    stockMaxLimit,
    fechaVencimiento,
    image,
    purchaseUnit,
    countUnit,
    conversionMultiplier,
    density,
    bottleTareWeight,
    purchaseCost,
    gainPercentage,
    sellPrice,
    isTaxable,
    taxPercentage,
    cantidadComprada,
    cantidadUtilizable,
    manejoLotes,
    inventoryObservations,
    branchStocks,
    isActive,
    activoCatalogo,
    showInOnlineStore,
    operationalZone,
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

  const isLoadedRef = React.useRef(false);

  // Load item in edit mode
  useEffect(() => {
    async function loadItem() {
      if (editItemId) {
        isLoadedRef.current = false;
        const item = await db.inventoryItems.get(editItemId);
        if (item) {
          setName(item.name);
          const loadedZone = item.operationalZone || normalizeOperationalZone(item.operationZone);
          setOperationalZone(loadedZone || '');
          setDescription(item.description || '');
          setCategory(item.category);
          setSupplierId(item.supplierId || '');
          setStockMinLimit(item.stockMinLimit !== undefined ? item.stockMinLimit : '');
          setStockMaxLimit(item.stockMaxLimit || '');
          setFechaVencimiento(item.fechaVencimiento || '');
          const rawPUnit = item.purchaseUnit || item.purchaseUnitId || '';
          const resolvedPUnit = (officialUnitsList && officialUnitsList.length > 0)
            ? (officialUnitsList.find(u => u.toLowerCase() === rawPUnit.toLowerCase())
              || officialUnitsList.find(u => normalizeUnit(u) === normalizeUnit(rawPUnit))
              || normalizeUnit(rawPUnit))
            : normalizeUnit(rawPUnit);
          setPurchaseUnit(resolvedPUnit);

          const rawCUnit = item.usageUnit || item.countUnit || item.usageUnitId || item.countUnitId || '';
          const resolvedCUnit = (countUnitsList && countUnitsList.length > 0)
            ? (countUnitsList.find(u => u.toLowerCase() === rawCUnit.toLowerCase())
              || countUnitsList.find(u => normalizeUnit(u) === normalizeUnit(rawCUnit))
              || normalizeUnit(rawCUnit))
            : normalizeUnit(rawCUnit);
          setCountUnit(resolvedCUnit);
          setConversionMultiplier(item.conversionMultiplier ?? item.equivalencia ?? '');
          setDensity(item.density || '');
          setBottleTareWeight(item.bottleTareWeightGrams || '');
          setPurchaseCost(item.purchaseCost);
          setGainPercentage(item.gainPercentage);
          setSellPrice(item.sellPrice || '');
          setIsTaxable(!!item.isTaxable);
          setTaxPercentage(item.taxPercentage || '');
          setIsActive(item.isActive !== false);
          setActivoCatalogo(item.activo_catalogo !== undefined ? item.activo_catalogo : item.isActive !== false);
          setShowInOnlineStore(item.visible_tienda_online !== undefined ? item.visible_tienda_online : !!item.showInOnlineStore);
          setImage(item.img || '');

          setCantidadComprada(item.cantidadComprada !== undefined ? item.cantidadComprada : '');
          const loadedUtil = item.cantidadUtilizable !== undefined
            ? item.cantidadUtilizable
            : (item.usable_quantity !== undefined ? item.usable_quantity : '');
          setCantidadUtilizable(loadedUtil);
          setManejoLotes(!!item.manejoLotes);
          setInventoryObservations(item.inventoryObservations || '');

          const buyQty = Number(item.cantidadComprada) || 0;
          const mult = Number(item.conversionMultiplier ?? item.equivalencia) || 1;
          prevEquivRef.current = buyQty * mult;

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
          const consolidatedByBranch = consolidateStockByBranch(item.stockByBranch);
          Object.entries(consolidatedByBranch).forEach(([bId, qty]) => {
            if (mappedStocks[bId] === undefined) {
              mappedStocks[bId] = {
                stockActual: qty,
                observations: '',
                lote: '',
                fechaVencimiento: item.fechaVencimiento || ''
              };
            }
          });
          setLoadedEditItem(item);
          setBranchStocks(mappedStocks);

          setInitialSnapshot(JSON.stringify({
            name: item.name,
            operationalZone: item.operationalZone || normalizeOperationalZone(item.operationZone) || '',
            description: item.description || '',
            category: item.category,
            supplierId: item.supplierId || '',
            stockMinLimit: item.stockMinLimit,
            stockMaxLimit: item.stockMaxLimit || '',
            fechaVencimiento: item.fechaVencimiento || '',
            image: item.img || '',
            purchaseUnit: resolvedPUnit,
            countUnit: resolvedCUnit,
            conversionMultiplier: item.conversionMultiplier ?? item.equivalencia ?? '',
            density: item.density || '',
            bottleTareWeight: item.bottleTareWeightGrams || '',
            purchaseCost: item.purchaseCost,
            gainPercentage: item.gainPercentage,
            sellPrice: item.sellPrice || '',
            isTaxable: item.isTaxable,
            taxPercentage: item.taxPercentage || '',
            cantidadComprada: item.cantidadComprada !== undefined ? item.cantidadComprada : '',
            cantidadUtilizable: loadedUtil,
            manejoLotes: !!item.manejoLotes,
            inventoryObservations: item.inventoryObservations || '',
            branchStocks: mappedStocks,
            isActive: item.isActive !== false,
            activoCatalogo: item.activo_catalogo !== undefined ? item.activo_catalogo : item.isActive !== false,
            showInOnlineStore: item.visible_tienda_online !== undefined ? item.visible_tienda_online : !!item.showInOnlineStore,
          }));
          setIsUserTouched(false);
        }
        isLoadedRef.current = true;
      } else {
        isLoadedRef.current = true;
      }
    }
    loadItem();
  }, [editItemId]);

  // Initialize defaults based on the form type (only on creation)
  useEffect(() => {
    if (editItemId) return;

    let initialCat = 'Bebidas';
    let initialPUnit = 'Unidad';
    let initialCUnit = 'unidad';
    let initialMult: number | '' = 1;
    let initialGain: number | '' = 50;
    let initialActivoCat = true;

    if (type === 'INGREDIENT') {
      initialCat = 'Proteínas';
      initialPUnit = 'Kilogramo';
      initialCUnit = 'Gramo';
      initialMult = 1000;
      initialGain = 0;
      initialActivoCat = false;
    } else if (type === 'PACKAGING') {
      initialCat = 'Cajas';
      initialPUnit = 'Paquete';
      initialCUnit = 'Unidad';
      initialMult = 100;
      initialGain = 0;
      initialActivoCat = false;
    } else if (type === 'ASSET') {
      initialCat = 'Cristalería';
      initialPUnit = 'Caja';
      initialCUnit = 'Unidad';
      initialMult = 12;
      initialGain = 0;
      initialActivoCat = false;
    }

    const cats = getCategories();
    if (cats.length > 0 && !cats.includes(initialCat)) {
      initialCat = cats[0];
    }

    setCategory(initialCat);
    setPurchaseUnit(initialPUnit);
    setCountUnit(initialCUnit);
    setConversionMultiplier(initialMult);
    setGainPercentage(initialGain);
    setActivoCatalogo(initialActivoCat);

    setInitialSnapshot(JSON.stringify({
      name: '',
      description: '',
      category: initialCat,
      supplierId: '',
      stockMinLimit: '',
      stockMaxLimit: '',
      fechaVencimiento: '',
      image: '',
      purchaseUnit: initialPUnit,
      countUnit: initialCUnit,
      conversionMultiplier: initialMult,
      density: '',
      bottleTareWeight: '',
      purchaseCost: '',
      gainPercentage: initialGain,
      sellPrice: '',
      isTaxable: false,
      taxPercentage: 0,
      cantidadComprada: '',
      cantidadUtilizable: '',
      manejoLotes: false,
      inventoryObservations: '',
      branchStocks: {},
      isActive: true,
      activoCatalogo: initialActivoCat,
      showInOnlineStore: false,
    }));
    setIsUserTouched(false);
  }, [type, editItemId, getCategories]);

  const officialUnitsList = useMemo(() => {
    const opts = systemSettings?.['official_units'];
    if (Array.isArray(opts) && opts.length > 0) return opts.filter(Boolean);
    const fallback = getDropdownOptions('official_units', systemSettings);
    if (Array.isArray(fallback) && fallback.length > 0) return fallback.filter(Boolean);
    return [];
  }, [systemSettings]);

  const unitEquivalences = useMemo(() => {
    return (systemSettings?.['unit_equivalences'] || DEFAULT_SETTINGS.unit_equivalences || {}) as Record<string, { baseEquivalence: number; baseUnit: string }>;
  }, [systemSettings]);

  const purchaseUnitsList = officialUnitsList;
  const countUnitsList = officialUnitsList;

  const taxOptions = getDropdownOptions('tax_options', systemSettings);

  // Pure universal conversion computation based on system settings
  const universalConversion = useMemo(() => {
    if (type !== 'INGREDIENT') {
      return { usableQuantity: Number(cantidadComprada) || 0, unitCost: 0, directFactor: 1, factor: 1, isCompatible: true };
    }
    return calculateUsableQuantityAndCost({
      purchaseQuantity: Number(cantidadComprada) || 0,
      purchasePrice: Number(purchaseCost) || 0,
      purchaseUnitId: purchaseUnit,
      usageUnitId: countUnit,
      unitsCatalog: unitEquivalences
    });
  }, [type, cantidadComprada, purchaseCost, purchaseUnit, countUnit, unitEquivalences]);

  // Reactively calculate standard conversion multiplier when units change (preserving full precision)
  const prevUnits = React.useRef({ purchaseUnit, countUnit });
  useEffect(() => {
    if (type === 'INGREDIENT' && purchaseUnit && countUnit) {
      if (prevUnits.current.purchaseUnit !== purchaseUnit || prevUnits.current.countUnit !== countUnit) {
        if (universalConversion.directFactor > 0) {
          setConversionMultiplier(universalConversion.directFactor);
        }
        prevUnits.current = { purchaseUnit, countUnit };
      }
    }
  }, [purchaseUnit, countUnit, type, universalConversion.directFactor]);

  // Total calculated equivalence quantity (without intermediate truncation)
  const cantEquivalenteCalc = useMemo(() => {
    if (type === 'INGREDIENT' && universalConversion.isCompatible) {
      return universalConversion.usableQuantity;
    }
    const buyQty = Number(cantidadComprada) || 0;
    const mult = Number(conversionMultiplier) || 1;
    return buyQty * mult;
  }, [type, universalConversion, cantidadComprada, conversionMultiplier]);

  // Auto-sync cantidadUtilizable to total equivalent quantity when purchase quantity/conversion changes
  const prevEquivRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (type === 'INGREDIENT' && isLoadedRef.current) {
      const newEquiv = cantEquivalenteCalc;
      const prevEquiv = prevEquivRef.current;

      if (prevEquiv !== null && prevEquiv !== newEquiv && newEquiv > 0) {
        setCantidadUtilizable(prevUtil => {
          const numUtil = Number(prevUtil);
          if (!prevUtil || isNaN(numUtil) || numUtil <= 0 || Math.abs(numUtil - prevEquiv) <= 0.01 || numUtil > newEquiv) {
            return Number(newEquiv.toFixed(2));
          }
          if (prevEquiv > 0) {
            const ratio = numUtil / prevEquiv;
            return Number((newEquiv * ratio).toFixed(2));
          }
          return Number(newEquiv.toFixed(2));
        });
      } else if (prevEquiv === null && newEquiv > 0) {
        setCantidadUtilizable(prevUtil => {
          if (!prevUtil || Number(prevUtil) <= 0) {
            return Number(newEquiv.toFixed(2));
          }
          return Number(Number(prevUtil).toFixed(2));
        });
      }
      prevEquivRef.current = newEquiv;
    }
  }, [cantEquivalenteCalc, type]);

  // Filter suppliers
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
    return calculateCostMetrics({
      purchaseCost,
      cantidadComprada,
      conversionMultiplier: universalConversion.isCompatible ? universalConversion.directFactor : (Number(conversionMultiplier) || 1),
      cantidadUtilizable: cantidadUtilizable !== '' ? cantidadUtilizable : universalConversion.usableQuantity
    });
  }, [purchaseCost, cantidadComprada, conversionMultiplier, universalConversion, cantidadUtilizable]);

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

  // Ensure every active systemBranch has its current stock mapped in edit mode
  useEffect(() => {
    if (!editItemId || !loadedEditItem || systemBranches.length === 0) return;
    setBranchStocks(prev => {
      let changed = false;
      const next = { ...prev };
      for (const branch of systemBranches) {
        if (next[branch.id] === undefined || next[branch.id]?.stockActual === '') {
          const matchingSucursal = loadedEditItem.sucursalStock?.find(s => areBranchIdsEqual(s.sucursalId, branch.id));
          const resolvedStock = getPhysicalStockInBranch(loadedEditItem, branch.id);
          next[branch.id] = {
            stockActual: resolvedStock,
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

  const getBranchValuation = (branchId: string) => {
    const rawVal = branchStocks[branchId]?.stockActual;
    const stock = rawVal !== undefined && rawVal !== ''
      ? (Number(rawVal) || 0)
      : (loadedEditItem ? getPhysicalStockInBranch(loadedEditItem, branchId) : 0);
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

  // Context data for Gemini Voice Copilot
  const copilotContextData = useMemo<CopilotContextData>(() => {
    return {
      existingCategories: getCategories(),
      existingSuppliers: suppliers.map(s => ({ id: s.id, name: s.name })),
      configuredUnits: (getDropdownOptions('UnitOfMeasure', systemSettings) || []).map((u: any) => ({
        name: typeof u === 'string' ? u : u.name || '',
        baseEquivalence: u.baseEquivalence || 1,
        baseUnit: u.baseUnit || 'g'
      })),
      currentFormState: {
        name,
        category,
        supplierId,
        purchaseCost,
        purchaseUnit,
        countUnit,
        cantidadComprada,
        conversionMultiplier,
        cantidadUtilizable
      }
    };
  }, [getCategories, suppliers, systemSettings, name, category, supplierId, purchaseCost, purchaseUnit, countUnit, cantidadComprada, conversionMultiplier, cantidadUtilizable]);

  const handleClearForm = useCallback(() => {
    setName('');
    setDescription('');
    setCategory('');
    setSupplierId('');
    setSupplierSearch('');
    setPurchaseCost('');
    setCantidadComprada('');
    setConversionMultiplier('');
    setCantidadUtilizable('');
    setStockMinLimit('');
    setStockMaxLimit('');
    setFechaVencimiento('');
    setDensity('');
    setBottleTareWeight('');
  }, []);

  const handleApplyCopilotExtraction = useCallback((ext: VoiceIngredientExtraction) => {
    if (ext.name) setName(ext.name);
    if (ext.description) setDescription(ext.description);

    // Category mapping
    if (ext.category) {
      setCategory(ext.category);
    }

    // Supplier mapping & creation
    if (ext.supplier_id) {
      setSupplierId(ext.supplier_id);
      const found = suppliers.find(s => s.id === ext.supplier_id);
      if (found) setSupplierSearch(found.name);
    } else if (ext.supplier_name) {
      const match = suppliers.find(s => s.name.toLowerCase().includes(ext.supplier_name!.toLowerCase()));
      if (match) {
        setSupplierId(match.id);
        setSupplierSearch(match.name);
      } else {
        setSupplierSearch(ext.supplier_name);
      }
    } else if (ext.supplier_name_to_create) {
      const cleanName = ext.supplier_name_to_create.trim();
      const match = suppliers.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
      if (match) {
        setSupplierId(match.id);
        setSupplierSearch(match.name);
      } else {
        const newSuppId = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        db.suppliers.put({
          id: newSuppId,
          name: cleanName,
          contact: 'Contacto Principal',
          phone: '',
          email: '',
          paymentTerms: 'Contado',
          categoriesSupplied: [ext.category || category || 'Ingredientes'],
          updatedAt: new Date().toISOString()
        }).then(() => {
          setSupplierId(newSuppId);
          setSupplierSearch(cleanName);
          toast.success(`Proveedor "${cleanName}" creado y vinculado automáticamente.`);
        }).catch(err => {
          console.warn('Could not auto-create supplier:', err);
          setSupplierSearch(cleanName);
        });
      }
    }

    // Units (Normalized strictly to official system catalog)
    const normPUnit = ext.purchase_unit
      ? normalizeUnitToOfficial(ext.purchase_unit, officialUnitsList)
      : (purchaseUnit || 'Gramo');
    const normUseUnit = ext.use_unit
      ? normalizeUnitToOfficial(ext.use_unit, officialUnitsList)
      : (ext.purchase_unit ? normalizeUnitToOfficial(ext.purchase_unit, officialUnitsList) : (countUnit || 'Gramo'));

    if (normPUnit) {
      setPurchaseUnit(normPUnit);
    }
    if (normUseUnit) {
      setCountUnit(normUseUnit);
    }

    if (ext.operationalZone || ext.operation_zone || (ext as any).operational_zone) {
      const zoneToSet = normalizeOperationalZone(ext.operationalZone || ext.operation_zone || (ext as any).operational_zone);
      setOperationalZone(zoneToSet);
    }

    // Quantities & Mult
    const buyQty = ext.purchase_quantity !== undefined && ext.purchase_quantity > 0 ? ext.purchase_quantity : (Number(cantidadComprada) || 1);
    setCantidadComprada(buyQty);

    let mult = ext.conversion_multiplier;
    if (!mult || mult <= 0) {
      const autoMult = getDynamicUnitEquivalence(normPUnit, normUseUnit, systemSettings['unit_equivalences']);
      if (autoMult > 0) mult = autoMult;
    }
    if (mult && mult > 0) {
      setConversionMultiplier(mult);
    }

    // Purchase Price
    if (ext.purchase_price !== undefined && ext.purchase_price > 0) {
      setPurchaseCost(ext.purchase_price);
    }

    // Sale Price (for PRODUCT mode)
    if (ext.sale_price !== undefined && ext.sale_price > 0) {
      setSellPrice(ext.sale_price);
    }

    // Usable quantity & waste calculation
    const currentMult = mult || Number(conversionMultiplier) || 1;
    const totalEquivalent = buyQty * currentMult;
    let calculatedUsable = 0;

    if (ext.usable_quantity !== undefined && ext.usable_quantity > 0) {
      calculatedUsable = ext.usable_quantity;
      setCantidadUtilizable(ext.usable_quantity);
    } else if (ext.waste_percentage !== undefined && ext.waste_percentage >= 0) {
      calculatedUsable = Math.round(totalEquivalent * (1 - ext.waste_percentage / 100));
      setCantidadUtilizable(calculatedUsable);
    } else {
      calculatedUsable = totalEquivalent;
      setCantidadUtilizable(calculatedUsable);
    }

    // Shield against reactive useEffect overwrite
    prevEquivRef.current = totalEquivalent;

    // Initial Stock in Primary Branch (Sucursal Principal)
    const primaryBranch = systemBranches[0];
    if (primaryBranch && calculatedUsable > 0) {
      setBranchStocks(prev => ({
        ...prev,
        [primaryBranch.id]: {
          stockActual: calculatedUsable,
          observations: prev[primaryBranch.id]?.observations || 'Stock inicial registrado por Foodie Voice Copilot',
          lote: prev[primaryBranch.id]?.lote || '',
          fechaVencimiento: ext.fecha_vencimiento || prev[primaryBranch.id]?.fechaVencimiento || ''
        }
      }));
    }

    // Liquor details
    if (ext.density !== undefined) setDensity(ext.density);
    if (ext.bottle_tare_weight !== undefined) setBottleTareWeight(ext.bottle_tare_weight);

    // Stock limits & Expiry
    if (ext.stock_min_limit !== undefined) setStockMinLimit(ext.stock_min_limit);
    if (ext.stock_max_limit !== undefined) setStockMaxLimit(ext.stock_max_limit);
    if (ext.fecha_vencimiento) setFechaVencimiento(ext.fecha_vencimiento);

    setIsUserTouched(true);
  }, [suppliers, systemSettings, systemBranches, category, purchaseUnit, countUnit, cantidadComprada, conversionMultiplier]);

  // Automatically prefill form when prefillData is provided (from Copilot navigation)
  useEffect(() => {
    if (prefillData && !editItemId) {
      handleApplyCopilotExtraction(prefillData);
    }
  }, [prefillData, editItemId, handleApplyCopilotExtraction]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name) return;

    if (!operationalZone) {
      toast.error('Zona de Operación es obligatoria.');
      return;
    }

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
      if (utilQty > (buyQty * mult) + 0.01) {
        toast.error('La cantidad utilizable no podrá ser mayor que la cantidad equivalente.');
        return;
      }
    }

    // Resolve or auto-create supplier if typed but not selected from dropdown
    let finalSupplierId = supplierId;
    if (!finalSupplierId && supplierSearch.trim()) {
      const cleanSearch = supplierSearch.trim();
      const existing = suppliers.find(s => s.name.toLowerCase() === cleanSearch.toLowerCase());
      if (existing) {
        finalSupplierId = existing.id;
      } else {
        finalSupplierId = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        try {
          await db.suppliers.put({
            id: finalSupplierId,
            name: cleanSearch,
            contact: 'Contacto Principal',
            phone: '',
            email: '',
            paymentTerms: 'Contado',
            categoriesSupplied: [category || 'Ingredientes'],
            updatedAt: new Date().toISOString()
          });
          toast.success(`Proveedor "${cleanSearch}" registrado y asociado.`);
        } catch (sErr) {
          console.warn('Error auto-creating supplier on submit:', sErr);
        }
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

    let sucursalStock: SucursalStock[] = systemBranches.map(branch => {
      const rawVal = branchStocks[branch.id]?.stockActual;
      const resolvedStock = rawVal !== undefined && rawVal !== ''
        ? (Number(rawVal) || 0)
        : (loadedEditItem ? getPhysicalStockInBranch(loadedEditItem, branch.id) : 0);
      return {
        sucursalId: branch.id,
        stockActual: resolvedStock,
        batchObservations: branchStocks[branch.id]?.observations || '',
        lote: branchStocks[branch.id]?.lote || '',
        fechaVencimiento: branchStocks[branch.id]?.fechaVencimiento || undefined
      };
    });

    // If all branches have 0 stock and this is a new ingredient with usable quantity, allocate to primary branch
    const utilQty = Number(cantidadUtilizable) || 0;
    if (!editItemId && type === 'INGREDIENT' && utilQty > 0) {
      const currentSum = sucursalStock.reduce((acc, s) => acc + s.stockActual, 0);
      if (currentSum === 0 && sucursalStock.length > 0) {
        sucursalStock[0].stockActual = utilQty;
        sucursalStock[0].batchObservations = sucursalStock[0].batchObservations || 'Stock inicial registrado';
      }
    }

    if (editItemId) {
      const existingItem = await db.inventoryItems.get(editItemId);
      if (existingItem && existingItem.sucursalStock) {
        const activeIds = new Set(systemBranches.map(b => b.id.toLowerCase().trim()));
        // Filter out ghost branches like 'MAIN' to prevent artificially inflating stock
        const historicalPreserved = existingItem.sucursalStock.filter(
          (s: any) => s.sucursalId && s.sucursalId.toUpperCase() !== 'MAIN' && !activeIds.has(s.sucursalId.toLowerCase().trim())
        );
        sucursalStock = [...sucursalStock, ...historicalPreserved];
      }
    }

    // Ensure ghost branches are never kept and deduplicate by canonical branch ID
    sucursalStock = consolidateSucursalStock(sucursalStock.filter(s => s.sucursalId && s.sucursalId.toUpperCase() !== 'MAIN'));

    const totalStock = sucursalStock.reduce((sum, s) => {
      return sum + s.stockActual;
    }, 0);

    const stockByBranch: Record<string, number> = consolidateStockByBranch(
      sucursalStock.reduce((acc, s) => ({ ...acc, [s.sucursalId]: s.stockActual }), {})
    );

    let prefix = 'ins-gen';
    if (type === 'PRODUCT') prefix = 'ins-prd';
    else if (type === 'INGREDIENT') prefix = 'ins-ing';
    else if (type === 'PACKAGING') prefix = 'ins-pkg';
    else if (type === 'ASSET') prefix = 'ins-ast';

    const itemId = editItemId || `${prefix}-${Date.now().toString().slice(-4)}`;

    const normalizedPurchase = normalizeUnit(purchaseUnit);
    const matchedPurchaseUnitId = normalizeUnitId(normalizedPurchase);
    const normalizedCount = normalizeUnit(countUnit);
    const matchedCountUnitId = normalizeUnitId(normalizedCount);

    const newItem: InventoryItem = {
      id: itemId,
      name,
      category,
      operationalZone,
      operationZone: getOperationalZoneLabel(operationalZone),
      purchaseUnit: normalizedPurchase,
      purchaseUnitId: matchedPurchaseUnitId,
      countUnit: normalizedCount,
      countUnitId: matchedCountUnitId,
      usageUnit: normalizedCount,
      usageUnitId: matchedCountUnitId,
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
      currentStock: totalStock,
      availableStock: Math.max(0, totalStock),
      stockByBranch,
      abcClassification: abcClassificationValue,
      supplierId: finalSupplierId || 'prov-generic',
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
      usable_quantity: type === 'INGREDIENT' ? (Number(cantidadUtilizable) || 0) : undefined,
      equivalencia: type === 'INGREDIENT' ? parsedMultiplier : undefined,
      mermaPercentage: type === 'INGREDIENT' ? costCalculations.merma : undefined,
      factorCorreccion: type === 'INGREDIENT' ? costCalculations.factor : undefined,
      costoUnitarioBruto: type === 'INGREDIENT' ? costCalculations.costBruto : undefined,
      costoUnitarioReal: type === 'INGREDIENT' ? costCalculations.costReal : undefined,
      manejoLotes: type === 'INGREDIENT' ? manejoLotes : undefined,
      inventoryObservations: type === 'INGREDIENT' ? inventoryObservations.trim() : undefined
    };

    try {
      await syncRecordToFirestore('inventoryItems', newItem.id, newItem);
      toast.success(editItemId ? `Recurso "${name}" actualizado exitosamente.` : `Recurso "${name}" catalogado exitosamente con ${totalStock} ${countUnit} en sede principal.`);
      onBack();
    } catch (error) {
      console.error('Error saving inventory item:', error);
      toast.error('Error al guardar el elemento.');
    }
  };

  const handleDelete = async () => {
    if (!editItemId) return;
    try {
      await deleteRecordFromFirestore('inventoryItems', editItemId);
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

  // Register with global VoiceCopilot
  useVoiceCopilotRegistration({
    mode: type === 'PRODUCT' ? 'PRODUCT' : 'INGREDIENT',
    contextData: copilotContextData,
    onApplyExtraction: handleApplyCopilotExtraction,
    onConfirmSave: () => handleSubmit(),
    onClearForm: handleClearForm
  });

  return (
    <div
      onChangeCapture={() => setIsUserTouched(true)}
      onInputCapture={() => setIsUserTouched(true)}
      className="space-y-6 animate-fade-in text-left font-sans transition-receitly p-8 rounded-xl min-h-screen pb-28"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSafeExit}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white flex items-center justify-center p-1.5 rounded-[8px] border border-line transition-colors cursor-pointer bg-transparent"
            title="Regresar"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-headline font-black text-content leading-tight">
                {type === 'PRODUCT'
                  ? (editItemId ? 'Editar Producto Único' : 'Nuevo Producto Único')
                  : type === 'INGREDIENT'
                    ? (editItemId ? 'Editar Ingrediente' : 'Nuevo Ingrediente')
                    : type === 'PACKAGING'
                      ? (editItemId ? 'Editar Empaque / Embalaje' : 'Nuevo Empaque / Embalaje')
                      : (editItemId ? 'Editar Activo' : 'Nuevo Activo')}
              </h1>
              {type === 'INGREDIENT' && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-purple-500/15 to-orange-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                  <span className="material-symbols-outlined text-xs text-purple-500">mic</span>
                  Voice Copilot Activo ✨
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top Header Cancel Button */}
        <button
          type="button"
          onClick={handleSafeExit}
          className="px-4 py-2 bg-surface hover:bg-raised text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-bold rounded-lg transition-colors border border-line cursor-pointer flex items-center gap-1.5 shadow-xs"
        >
          <span className="material-symbols-outlined text-sm">close</span>
          Cancelar
        </button>
      </div>

      {type === 'INGREDIENT' ? (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-6 items-start w-full animate-fade-in text-left">
          {/* Card 1: Información General (70% equivalent: 8 columns) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-8 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">info</span>
                Información General
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    Nombre del Insumo / Ingrediente
                  </label>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}

                    placeholder="Ej. Harina de Trigo Integral"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
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
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1">
                      Categoría
                    </label>
                    <CategorySelector
                      value={category}
                      onChange={setCategory}
                      onClear={() => setCategory('')}
                      options={getCategories().map(cat => ({ value: cat, label: cat }))}
                      placeholder="Buscar categoría..."
                      searchPlaceholder="Buscar categoría..."
                      categoryType="INGREDIENT"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1 flex items-center gap-1">
                      <span>ZONA DE OPERACIÓN / PRODUCCIÓN</span>
                      <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <CustomSelect
                      value={operationalZone}
                      onChange={setOperationalZone}
                      options={OPERATIONAL_ZONE_OPTIONS}
                      placeholder="Seleccionar zona de producción..."
                      searchPlaceholder="Buscar zona de producción..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1">
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
                      {supplierSearch || supplierId ? (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSupplierId('');
                            setSupplierSearch('');
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded-[8px] transition-colors cursor-pointer z-10"
                          title="Limpiar proveedor"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      ) : (
                        <span className="material-symbols-outlined text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                          keyboard_arrow_down
                        </span>
                      )}

                      {showSupplierDropdown && (
                        <div className="absolute left-0 right-0 top-11 bg-surface border border-[rgba(143,99,244,0.15)] rounded-xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[rgba(143,99,244,0.15)] text-left">
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
                              className="w-full text-left p-3 text-xs hover:bg-slate-50 dark:hover:bg-raised font-bold text-content transition-colors border-none bg-transparent"
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
          <div className="col-span-12 md:col-span-2 lg:col-span-4 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4 flex flex-col justify-between self-stretch">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
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
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isActive ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-surface'}`}
                >
                  <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Compra y Rendimiento (70% equivalent: 8 columns) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-8 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">local_shipping</span>
                Compra y Rendimiento
              </h3>

              <div className="space-y-4">
                {/* Bloque 1: Compra */}
                <div className="border-b border-line/50 pb-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">shopping_bag</span>
                    1 Compra
                  </h4>
                  <div className="grid grid-cols-12 gap-3 md:gap-4 items-end">
                    {/* Fila 1: Precio, Unidad, Cantidad y ¿Es Gravable? */}
                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide mb-1">
                        Precio de compra ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-content-secondary z-10 pointer-events-none">$</span>
                        <Input
                          type="number"
                          required
                          value={purchaseCost}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            handleCostChange(val);
                          }}
                          className="pl-7"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide mb-1">
                        Unidad de compra
                      </label>
                      <CustomSelect
                        value={purchaseUnit}
                        onChange={(val) => {
                          setPurchaseUnit(val);
                          const conv = calculateUsableQuantityAndCost({
                            purchaseQuantity: Number(cantidadComprada) || 0,
                            purchasePrice: Number(purchaseCost) || 0,
                            purchaseUnitId: val,
                            usageUnitId: countUnit,
                            unitsCatalog: unitEquivalences
                          });
                          if (conv.directFactor) {
                            setConversionMultiplier(conv.directFactor);
                          }
                        }}
                        options={purchaseUnitsList.map(unit => ({ value: unit, label: unit }))}
                        placeholder={purchaseUnitsList.length === 0 ? "No hay unidades configuradas. Por favor agréguelas en Configuración" : "Seleccione..."}
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-4 lg:col-span-2">
                      <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide mb-1">
                        Cantidad
                      </label>
                      <Input
                        type="number"
                        required
                        value={cantidadComprada}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setCantidadComprada(val);
                        }}
                        placeholder="0"
                      />
                    </div>

                    {/* Tax Block - 4 columnas limpias alineadas perfectamente al fondo */}
                    <div className="col-span-12 sm:col-span-8 lg:col-span-4">
                      <div className="flex items-center gap-3 h-11 px-3 bg-inset border border-line rounded-[8px] justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isTaxable}
                            onChange={(checked) => setIsTaxable(checked)}
                          />
                          <span className="text-xs font-bold text-content uppercase tracking-wide">Gravable</span>
                        </div>
                        {isTaxable && (
                          <div className="min-w-[100px]">
                            <CustomSelect
                              value={String(taxPercentage)}
                              onChange={(val) => setTaxPercentage(Number(val))}
                              options={taxOptions.map((opt) => ({ value: String(opt), label: `${opt}%` }))}
                              className="w-full text-xs font-semibold text-content"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloque 2: Conversión y Rendimiento (Single 12-col Row) */}
                <div className="py-1">
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">sync_alt</span>
                    2 Conversión y Rendimiento
                  </h4>
                  <div className="grid grid-cols-12 gap-3 md:gap-4 items-end">
                    {/* Unidad de uso (col-3) */}
                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide mb-1">
                        Unidad de uso
                      </label>
                      <CustomSelect
                        value={countUnit}
                        onChange={(val) => {
                          setCountUnit(val);
                          const conv = calculateUsableQuantityAndCost({
                            purchaseQuantity: Number(cantidadComprada) || 0,
                            purchasePrice: Number(purchaseCost) || 0,
                            purchaseUnitId: purchaseUnit,
                            usageUnitId: val,
                            unitsCatalog: unitEquivalences
                          });
                          if (conv.directFactor) {
                            setConversionMultiplier(conv.directFactor);
                          }
                        }}
                        options={countUnitsList.map(unit => ({ value: unit, label: unit }))}
                        placeholder={countUnitsList.length === 0 ? "No hay unidades configuradas. Por favor agréguelas en Configuración" : "Seleccione..."}
                      />
                    </div>

                    {/* Equivalencia (col-3) */}
                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide mb-1">
                        Equivalencia por {purchaseUnit || 'Unidad'} ({countUnit || 'u'})
                      </label>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={conversionMultiplier}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setConversionMultiplier(val);
                        }}
                        className="text-center font-mono font-bold rounded-[8px]"
                        placeholder="Ej. 1"
                      />
                    </div>

                    {/* Cantidad utilizable (col-3) */}
                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide">
                          Cantidad utilizable ({countUnit})
                        </label>
                        {universalConversion.usableQuantity > 0 && (
                          <span className="text-[10px] font-mono font-semibold text-[var(--accent-purple)] dark:text-purple-400">
                            Exacto: {Number(universalConversion.usableQuantity.toFixed(2))} {countUnit}
                          </span>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={cantidadUtilizable !== '' ? cantidadUtilizable : (universalConversion.usableQuantity > 0 ? Number(universalConversion.usableQuantity.toFixed(2)) : '')}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setCantidadUtilizable(val);
                        }}
                        className={`text-center font-mono font-bold rounded-[8px] ${Number(cantidadUtilizable) > (costCalculations.cantEquivalente + 0.01)
                            ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                            : 'text-content'
                          }`}
                        placeholder="0"
                      />
                    </div>

                    {/* Merma % (col-3) */}
                    <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                      <label className="block text-xs font-bold text-content-secondary uppercase tracking-wide mb-1">
                        Merma (%)
                      </label>
                      <Input
                        type="number"
                        step="any"
                        value={costCalculations.merma}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : Number(e.target.value);
                          const mermaPct = Math.min(99.9, Math.max(0, val));
                          const buyEquiv = costCalculations.cantEquivalente;
                          if (buyEquiv > 0) {
                            const util = buyEquiv * (1 - mermaPct / 100);
                            setCantidadUtilizable(Number(util.toFixed(2)));
                          }
                        }}
                        className="text-center font-mono font-bold text-rose-600 dark:text-rose-400 rounded-[8px]"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Costeo y Métricas (30% equivalent: 4 columns) */}
          <div className="col-span-12 md:col-span-2 lg:col-span-4 bg-surface border border-line text-slate-900 shadow-sm dark:text-white rounded-2xl p-5 flex flex-col justify-between space-y-4 self-stretch">
            <div>
              <h3 className="text-xs font-extrabold text-content-secondary flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-white/10 uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">analytics</span>
                Costeo y Métricas
              </h3>

              <div className="divide-y divide-slate-100 dark:divide-white/5 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-content-secondary tracking-wider">Costo compra</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                    {formatCurrency(purchaseCost)} COP
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-content-secondary tracking-wider">Costo unitario</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                    {formatUnitCost(costCalculations.costBruto, countUnit)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-content-secondary tracking-wider">Factor corrección</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                    {formatFactor(costCalculations.factor)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/25 dark:text-emerald-300 px-3 rounded-xl mt-1 shadow-sm">
                  <span className="text-[9px] font-black uppercase tracking-wider">Costo real</span>
                  <span className="font-mono font-black text-sm">
                    {formatUnitCost(costCalculations.costReal, countUnit)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-content-secondary tracking-wider">Merma</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatPercentage(costCalculations.merma)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[9px] font-extrabold uppercase text-content-secondary tracking-wider">Rendimiento</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPercentage(costCalculations.rendimiento)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-t border-slate-200 dark:border-white/10 mt-1">
                  <span className="text-[9px] font-extrabold uppercase text-content-secondary tracking-wider">Clasificación</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${abcClassificationValue === 'A' ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30' :
                      abcClassificationValue === 'B' ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30' :
                        'bg-slate-100 text-slate-800 border-slate-300 dark:bg-raised dark:text-slate-300 dark:border-line-strong'
                    }`}>
                    Clase {abcClassificationValue}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 5: Inventario y Alertas (100% equivalent: 12 columns) */}
          <div className="col-span-12 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">inventory_2</span>
              Inventario y Alertas
            </h3>

            <div className="grid grid-cols-12 gap-3 md:gap-4">
              <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                  Stock Mínimo ({countUnit})
                </label>
                <Input
                  type="number"
                  value={stockMinLimit}
                  onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="10"
                />
              </div>

              <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                  Stock Máximo ({countUnit})
                </label>
                <Input
                  type="number"
                  value={stockMaxLimit}
                  onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="100"
                />
              </div>

              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                  Fecha de Vencimiento
                </label>
                <DatePicker
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                />
              </div>

              <div className="col-span-12 sm:col-span-6 lg:col-span-5">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                  Observaciones de inventario
                </label>
                <Input
                  type="text"
                  value={inventoryObservations}
                  title={inventoryObservations}
                  onChange={(e) => setInventoryObservations(e.target.value)}
                  placeholder="Notas específicas sobre manipulación..."
                />
              </div>
            </div>
          </div>

          {/* Card 6: Stock Actual / Inicial por Sucursal (100% equivalent: 12 columns) */}
          <div className="col-span-12 bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4 animate-fade-in text-left">
            <div>
              <h4 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-2">
                <span className="material-symbols-outlined text-[var(--text-muted)]">store</span>
                {editItemId ? 'Stock Actual por Sucursal' : 'Stock Inicial por Sucursal'}
              </h4>
              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mb-4">
                * Cantidades expresadas en la Unidad de Conteo ({countUnit}) · Valorización calculada a Costo Real ({formatUnitCost(costCalculations.costReal, countUnit)})
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
                  const branchReserved = loadedEditItem ? getReservedStockInBranch(loadedEditItem, branch.id) : 0;
                  const branchAvailable = Math.max(0, (Number(stockValue) || 0) - branchReserved);

                  return (
                    <div key={branch.id} className="p-3.5 bg-inset border border-line rounded-xl space-y-2.5">
                      <div className="flex justify-between items-center pb-2 border-b border-line">
                        <div>
                          <span className="text-xs font-black text-content block">{branch.name}</span>
                          {editItemId && (
                            <span className="text-[9px] font-mono text-content-secondary block mt-0.5">
                              Disponible: <strong className="text-emerald-600 dark:text-emerald-400">{formatCostDecimals(branchAvailable)} {countUnit}</strong>
                              {branchReserved > 0 ? ` · Reservado: ${formatCostDecimals(branchReserved)}` : ''}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-black font-mono text-[var(--accent-purple)]">
                          Val: ${formatCostDecimals(branchValuation)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-content-secondary mb-0.5">
                              {editItemId ? `Stock Actual (${countUnit})` : 'Stock Inicial'}
                            </label>
                            <Input
                              type="number"
                              value={stockValue}
                              onChange={(e) => handleBranchStockChange(branch.id, e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-content-secondary mb-0.5">Lote</label>
                            <Input
                              type="text"
                              value={loteValue}
                              onChange={(e) => handleBranchLoteChange(branch.id, e.target.value)}

                              placeholder="Ej. L-001"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-content-secondary mb-0.5">Vencimiento</label>
                            <DatePicker
                              value={expiryValue}
                              onChange={(e) => handleBranchExpiryChange(branch.id, e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-extrabold uppercase tracking-wider text-content-secondary mb-0.5">Observaciones</label>
                            <Input
                              type="text"
                              value={observationsValue}
                              onChange={(e) => handleBranchObservationsChange(branch.id, e.target.value)}

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
          <div className="lg:col-span-8 flex flex-col justify-between bg-surface border border-line shadow-sm rounded-2xl p-6 space-y-4 h-full">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">info</span>
                Información General
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                    {type === 'PRODUCT' ? 'Nombre del Producto' : 'Nombre del Insumo / Ingrediente'}
                  </label>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}

                    placeholder={type === 'PRODUCT' ? 'Ej. Cerveza Laboyana' : 'Ej. Harina de Trigo Integral'}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
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
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1">
                      Categoría
                    </label>
                    <CategorySelector
                      value={category}
                      onChange={setCategory}
                      onClear={() => setCategory('')}
                      options={getCategories().map(cat => ({ value: cat, label: cat }))}
                      placeholder="Buscar categoría..."
                      searchPlaceholder="Buscar categoría..."
                      categoryType="PRODUCT"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1 flex items-center gap-1">
                      <span>ZONA DE OPERACIÓN / PRODUCCIÓN</span>
                      <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <CustomSelect
                      value={operationalZone}
                      onChange={setOperationalZone}
                      options={OPERATIONAL_ZONE_OPTIONS}
                      placeholder="Seleccionar zona de producción..."
                      searchPlaceholder="Buscar zona de producción..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1">
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
                      {supplierSearch || supplierId ? (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSupplierId('');
                            setSupplierSearch('');
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded-[8px] transition-colors cursor-pointer z-10"
                          title="Limpiar proveedor"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      ) : (
                        <span className="material-symbols-outlined text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-base pointer-events-none">
                          keyboard_arrow_down
                        </span>
                      )}

                      {showSupplierDropdown && (
                        <div className="absolute left-0 right-0 top-11 bg-surface border border-[rgba(143,99,244,0.15)] rounded-xl shadow-xl z-55 max-h-48 overflow-y-auto divide-y divide-[rgba(143,99,244,0.15)] text-left">
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
                              className="w-full text-left p-3 text-xs hover:bg-slate-50 dark:hover:bg-raised font-bold text-content transition-colors border-none bg-transparent"
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
          <div className="lg:col-span-4 flex flex-col justify-between bg-surface border border-line shadow-sm rounded-2xl p-6 space-y-4 h-full">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
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

            <div className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">¿Activo en Inventario?</span>
                <Switch checked={isActive} onChange={setIsActive} />
              </div>

              {type === 'PRODUCT' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">¿Activo en FoodiePOS?</span>
                    <Switch checked={activoCatalogo} onChange={setActivoCatalogo} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Visible en Tienda Online</span>
                    <Switch checked={showInOnlineStore} onChange={setShowInOnlineStore} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ==================== FILA 2 ==================== */}

          {/* Card 3: Logística y Alertas (40%) */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-surface border border-line shadow-sm rounded-2xl p-6 space-y-4 h-full">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
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
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Fecha de Vencimiento
                      </label>
                      <DatePicker
                        value={fechaVencimiento}
                        onChange={(e) => setFechaVencimiento(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Stock Mín. de Alerta
                      </label>
                      <Input
                        type="number"
                        required
                        value={stockMinLimit}
                        onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}

                        placeholder="10"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Stock Máx. Sugerido
                      </label>
                      <Input
                        type="number"
                        value={stockMaxLimit}
                        onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}

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
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Equivalencia
                      </label>
                      <Input
                        type="number"
                        required
                        value={conversionMultiplier}
                        onChange={(e) => setConversionMultiplier(e.target.value === '' ? '' : Number(e.target.value))}

                        placeholder="1000"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Stock Mínimo
                      </label>
                      <Input
                        type="number"
                        required
                        value={stockMinLimit}
                        onChange={(e) => setStockMinLimit(e.target.value === '' ? '' : Number(e.target.value))}

                        placeholder="10"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                        Stock Máximo
                      </label>
                      <Input
                        type="number"
                        value={stockMaxLimit}
                        onChange={(e) => setStockMaxLimit(e.target.value === '' ? '' : Number(e.target.value))}

                        placeholder="100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Fecha de Vencimiento
                    </label>
                    <Input
                      type="date"
                      value={fechaVencimiento}
                      onChange={(e) => setFechaVencimiento(e.target.value)}

                    />
                  </div>
                </div>
              )}
            </div>

            {category === 'Licores' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--accent-purple)]/5 rounded-xl border border-[rgba(143,99,244,0.15)] mt-2">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                    Densidad (g/ml)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={density}
                    onChange={(e) => setDensity(e.target.value === '' ? '' : Number(e.target.value))}

                    placeholder="Ej. 0.94"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
                    Tara Botella Vacía (g)
                  </label>
                  <Input
                    type="number"
                    value={bottleTareWeight}
                    onChange={(e) => setBottleTareWeight(e.target.value === '' ? '' : Number(e.target.value))}

                    placeholder="Ej. 450"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 4: Información Financiera (30%) */}
          <div className="lg:col-span-3 flex flex-col justify-between bg-surface border border-line shadow-sm rounded-2xl p-6 space-y-4 h-full">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">payments</span>
                Finanzas
              </h3>

              {type === 'PRODUCT' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Costo Compra ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 z-10 pointer-events-none">$</span>
                      <Input
                        type="number"
                        required
                        value={purchaseCost}
                        onChange={(e) => handleCostChange(e.target.value === '' ? '' : Number(e.target.value))}
                        className="pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      % Margen Ganancia
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        required
                        value={gainPercentage}
                        onChange={(e) => handleGainChange(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="50"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Precio Venta Sugerido ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 z-10 pointer-events-none">$</span>
                      <Input
                        type="number"
                        required
                        value={sellPrice}
                        onChange={(e) => handleSellPriceChange(e.target.value === '' ? '' : Number(e.target.value))}
                        className="pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-center pt-2 border-t border-line">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                        ¿Tiene IVA?
                      </label>
                      <Switch
                        checked={isTaxable}
                        onChange={(checked) => setIsTaxable(checked)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                        Tarifa (%)
                      </label>
                      <CustomSelect
                        disabled={!isTaxable}
                        value={isTaxable ? String(taxPercentage) : ''}
                        onChange={(val) => setTaxPercentage(Number(val))}
                        options={taxOptions.map((opt: number) => ({ value: String(opt), label: `${opt}%` }))}
                        placeholder={isTaxable ? "Seleccione..." : "Inactivo"}
                        className={`w-full min-w-[140px] ${!isTaxable ? 'opacity-40 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">
                      Precio Compra ($)
                    </label>
                    <Input
                      type="number"
                      required
                      value={purchaseCost}
                      onChange={(e) => handleCostChange(e.target.value === '' ? '' : Number(e.target.value))}

                      placeholder="Ej. 95000"
                    />
                  </div>

                  <div className="flex flex-col gap-1 pt-2 border-t border-line">
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">¿Es Gravable?</span>
                      <Switch
                        checked={isTaxable}
                        onChange={(checked) => setIsTaxable(checked)}
                      />
                    </div>

                    {isTaxable && (
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          value={taxPercentage}
                          onChange={(e) => setTaxPercentage(e.target.value === '' ? '' : Number(e.target.value))}

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
          <div className="lg:col-span-4 flex flex-col justify-between bg-surface border border-line shadow-sm rounded-2xl p-6 space-y-4 h-full">
            <div>
              <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-4">
                <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">analytics</span>
                Costeo y Métricas
              </h3>

              <div className="py-4">
                {type === 'PRODUCT' ? (
                  <div className="bg-emerald-500/10 p-5 rounded-xl border border-emerald-500/20 shadow-sm space-y-3">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block">
                      Precio Venta Final (PVP):
                    </span>
                    <div className="text-xl font-black font-mono text-emerald-500">
                      {formatCurrency(pvpFinal)} COP
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Calculado automáticamente sumando los impuestos configurados al precio base de venta.
                    </p>
                  </div>
                ) : (
                  <div className="bg-[var(--accent-purple)]/10 p-5 rounded-xl border border-[rgba(143,99,244,0.15)] shadow-sm space-y-3">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block">
                      Costo por Unidad de Uso:
                    </span>
                    <div className="text-xl font-black font-mono text-[var(--accent-purple)]">
                      {formatUnitCost(calculatedUsageCost, countUnit)}
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Representa el costo prorrateado de acuerdo a la equivalencia de empaque ingresada.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-line">
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${abcClassificationValue === 'A' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                  abcClassificationValue === 'B' ? 'bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[rgba(143,99,244,0.15)]' :
                    'bg-slate-550/10 text-slate-500 border border-slate-200/30'
                }`}>
                Clasificación ABC: Clase {abcClassificationValue}
              </span>
            </div>
          </div>

          {/* ==================== FILA 3 ==================== */}

          {/* Card 6: Stock Actual / Inicial por Sucursal (100%) */}
          <div className="lg:col-span-12 flex flex-col justify-between bg-surface border border-line shadow-sm rounded-2xl p-6 space-y-4 w-full">
            <div>
              <h4 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider mb-2">
                <span className="material-symbols-outlined text-[var(--text-muted)]">store</span>
                {editItemId ? 'Stock Actual por Sucursal' : 'Stock Inicial por Sucursal'}
              </h4>
              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mb-4">
                * Cantidades expresadas en la Unidad de Conteo ({countUnit})
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
                  const branchReserved = loadedEditItem ? getReservedStockInBranch(loadedEditItem, branch.id) : 0;
                  const branchAvailable = Math.max(0, (Number(stockValue) || 0) - branchReserved);

                  return (
                    <div key={branch.id} className="p-3.5 bg-slate-100 border border-slate-200 dark:bg-inset dark:border-line rounded-xl space-y-3 shadow-sm">
                      <div className="flex justify-between items-center pb-2 border-b border-line">
                        <div>
                          <span className="text-xs font-black text-content block">{branch.name}</span>
                          {editItemId && (
                            <span className="text-[9px] font-mono text-content-secondary block mt-0.5">
                              Disponible: <strong className="text-emerald-600 dark:text-emerald-400">{formatCostDecimals(branchAvailable)} {countUnit}</strong>
                              {branchReserved > 0 ? ` · Reservado: ${formatCostDecimals(branchReserved)}` : ''}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-black text-purple-700 dark:text-purple-400">
                          Val: {formatCurrency(branchValuation)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                              {editItemId ? `Stock Actual (${countUnit})` : 'Stock Inicial'}
                            </label>
                            <Input
                              type="number"
                              value={stockValue}
                              onChange={(e) => handleBranchStockChange(branch.id, e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Lote</label>
                            <Input
                              type="text"
                              value={loteValue}
                              onChange={(e) => handleBranchLoteChange(branch.id, e.target.value)}
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
        <Modal title="Crear Proveedor" onClose={() => setShowSupplierModal(false)} size="2xl">
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

      <DiscardChangesModal
        isOpen={showDiscardModal}
        onContinueEditing={cancelExit}
        onDiscardAndExit={confirmExit}
      />

      <FormActionsBar>
        <button
          type="button"
          onClick={handleSafeExit}
          className="px-5 py-2.5 bg-surface hover:bg-raised text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-sm md:text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5 shrink-0 border border-line min-h-[44px] transition-colors shadow-xs"
        >
          <span className="material-symbols-outlined text-base md:text-sm">close</span>
          Cancelar
        </button>
        {editItemId && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm md:text-xs font-bold rounded-[8px] cursor-pointer flex items-center gap-1.5 shrink-0 border-none min-h-[44px]"
          >
            <span className="material-symbols-outlined text-base md:text-sm">delete</span>
            Eliminar
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSubmit()}
          className="px-5 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-sm md:text-xs font-bold rounded-[8px] shadow-md shadow-[var(--accent-pink)]/15 cursor-pointer flex items-center gap-1.5 shrink-0 border-none active:scale-95 transition-all min-h-[44px]"
        >
          <span className="material-symbols-outlined text-base md:text-sm">save</span>
          {getButtonText()}
        </button>
      </FormActionsBar>
    </div>
  );
});

export default InventoryOnboardingForm;
