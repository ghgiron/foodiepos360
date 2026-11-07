import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from '../hooks/useNavigate';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe, InventoryItem } from '../types';
import { saveSystemSetting, DEFAULT_SETTINGS } from '../db/settingsStore';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { formatCurrency } from '../utils/formatters';
import { calculateRecipeItemUnitCost } from '../utils/costEngine';
import useFormExitGuard from '../hooks/useFormExitGuard';
import { normalizeFormValue, areFormValuesEqual } from '../hooks/useFormDirty';
import DiscardChangesModal from './ui/DiscardChangesModal';
import { flexibleMultiMatch } from '../utils/searchEngine';

interface SubRecipeFormProps {
  onCancel: () => void;
  onSaved: () => void;
  subRecipeId?: string | null;
}

export default function SubRecipeForm({ onCancel, onSaved, subRecipeId }: SubRecipeFormProps) {
  const navigate = useNavigate();
  const handleExitCallback = onCancel || (() => navigate(-1));
  // DB items
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const dbSupplyCategories = useLiveQuery(() => db.supplyCategories.toArray()) || [];

  const existingSubRecipe = useLiveQuery(async () => {
    if (!subRecipeId) return null;
    return await db.recipes.get(subRecipeId);
  }, [subRecipeId]);

  // Load settings dynamically from IndexedDB systemSettings table
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const officialUnits = systemSettings['official_units'] || ['g', 'kg', 'ml', 'l', 'und'];
  const dbAllergens = systemSettings['master_allergens'] || DEFAULT_SETTINGS.master_allergens || [];
  const reqFields = systemSettings['required_fields'] || DEFAULT_SETTINGS.required_fields;
  const operationalCostPercentage = systemSettings['operationalCostPercentage'] !== undefined 
    ? Number(systemSettings['operationalCostPercentage']) 
    : 14.95;

  // Form states (start empty per cleanup requirements)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [yieldQuantity, setYieldQuantity] = useState<number | ''>('');
  const [yieldUnit, setYieldUnit] = useState<string>('gr');
  const [quantityToProduce, setQuantityToProduce] = useState<number>(1);
  const [errorMarginPercentage, setErrorMarginPercentage] = useState<number>(5);
  const [allergens, setAllergens] = useState<string[]>([]);

  // Selected ingredients state
  const [ingredients, setIngredients] = useState<Array<{
    inventoryItemId: string;
    quantity: number; // Standard qty
    unit: string;
  }>>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showItemDropdown, setShowItemDropdown] = useState<boolean>(false);

  // Autofocus and keyboard refs
  const quantityInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const lastAddedIdRef = useRef<string | null>(null);

  // Snapshot for dirty tracking
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const currentSnapshotObj = useMemo(() => {
    return {
      name,
      description,
      yieldQuantity,
      yieldUnit,
      quantityToProduce,
      errorMarginPercentage,
      allergens,
      ingredients: ingredients.map(i => ({ id: i.inventoryItemId, q: i.quantity, u: i.unit }))
    };
  }, [name, description, yieldQuantity, yieldUnit, quantityToProduce, errorMarginPercentage, allergens, ingredients]);

  // Set initial snapshot once subrecipe is loaded
  useEffect(() => {
    if (!subRecipeId) {
      if (initialSnapshot === null) {
        setInitialSnapshot(JSON.stringify(normalizeFormValue(currentSnapshotObj)));
        setIsLoaded(true);
      }
    } else if (existingSubRecipe && !isLoaded) {
      const loadedSnapshot = JSON.stringify(normalizeFormValue({
        name: existingSubRecipe.name || '',
        description: existingSubRecipe.description || '',
        yieldQuantity: existingSubRecipe.yieldQuantity || 150,
        yieldUnit: existingSubRecipe.yieldUnit || 'gr',
        quantityToProduce: 1,
        errorMarginPercentage: Number(systemSettings['error_margin_pct']) || 5,
        allergens: existingSubRecipe.allergens || [],
        ingredients: (existingSubRecipe.ingredients || []).map(i => ({ id: i.inventoryItemId, q: i.quantity, u: i.unit }))
      }));
      setInitialSnapshot(loadedSnapshot);
      setIsLoaded(true);
    }
  }, [subRecipeId, existingSubRecipe, isLoaded, currentSnapshotObj, initialSnapshot, systemSettings]);

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return !areFormValuesEqual(currentSnapshotObj, JSON.parse(initialSnapshot));
  }, [currentSnapshotObj, initialSnapshot]);

  const { showDiscardModal, handleSafeExit, confirmExit, cancelExit } = useFormExitGuard({
    isDirty,
    destination: '/recipes',
    onExitCallback: handleExitCallback
  });

  // Autofocus on newly added ingredient row
  useEffect(() => {
    if (lastAddedIdRef.current) {
      const el = quantityInputRefs.current[lastAddedIdRef.current];
      if (el) {
        el.focus();
        el.select();
        lastAddedIdRef.current = null;
      }
    }
  }, [ingredients]);

  // New Allergen input state
  const [newAllergen, setNewAllergen] = useState<string>('');
  const [showAllergensDropdown, setShowAllergensDropdown] = useState<boolean>(false);

  // Initialize form if editing
  useEffect(() => {
    if (existingSubRecipe) {
      setName(existingSubRecipe.name);
      setDescription(existingSubRecipe.description || '');
      setYieldQuantity(existingSubRecipe.yieldQuantity || 150);
      setYieldUnit(existingSubRecipe.yieldUnit || 'gr');
      setAllergens(existingSubRecipe.allergens || []);
      setIngredients(existingSubRecipe.ingredients.map(ing => ({
        inventoryItemId: ing.inventoryItemId,
        quantity: ing.quantity,
        unit: ing.unit
      })));
    }
  }, [existingSubRecipe]);

  // Update local error margin when system settings load or change
  useEffect(() => {
    if (systemSettings['error_margin_pct'] !== undefined) {
      setErrorMarginPercentage(Number(systemSettings['error_margin_pct']));
    }
  }, [systemSettings]);

  // Universal helper to detect supply items
  const isSupplyItem = (item: any) => {
    if (!item) return false;
    const resType = (item.resourceType || '').toLowerCase().trim();
    const type = (item.type || '').toLowerCase().trim();
    const itemType = (item.itemType || '').toLowerCase().trim();
    if (resType === 'supply' || type === 'supply' || itemType === 'supply') return true;

    const cat = (item.category || '').toLowerCase().trim();
    const supplyCat = (item.supplyCategory || '').toLowerCase().trim();
    if (
      cat.includes('suministro') || cat.includes('desechable') || cat.includes('empaque') || cat.includes('descartable') || cat.includes('packaging') ||
      supplyCat.includes('suministro') || supplyCat.includes('desechable') || supplyCat.includes('empaque') || supplyCat.includes('descartable') || supplyCat.includes('packaging')
    ) return true;

    return dbSupplyCategories.some(sc => {
      const n = (sc.name || '').toLowerCase().trim();
      return n && (supplyCat === n || cat === n || supplyCat.includes(n) || cat.includes(n));
    });
  };

  // Expanded search results with details (including supplies)
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return inventoryItems.filter(item => {
      if (!flexibleMultiMatch([item.name, item.id, item.category, item.supplyCategory], searchQuery)) return false;
      const res = (item.resourceType || '').toLowerCase().trim();
      const tp = ((item as any).type || '').toLowerCase().trim();
      const isAllowed = !res || res === 'ingredient' || res === 'supply' || tp === 'ingredient' || tp === 'supply' || isSupplyItem(item);
      return isAllowed && !ingredients.some(ing => ing.inventoryItemId === item.id);
    });
  }, [searchQuery, inventoryItems, ingredients, dbSupplyCategories]);

  // Dynamic cost calculations
  const ingredientDetails = useMemo(() => {
    let rawSum = 0;
    const details = ingredients.map(ing => {
      const item = inventoryItems.find(i => i.id === ing.inventoryItemId);
      
      let unitCost = 0;
      let nameStr = ing.inventoryItemId;

      if (item) {
        nameStr = item.name;
        unitCost = calculateRecipeItemUnitCost(item, ing.unit, systemSettings['unit_equivalences']);
      }

      const totalCost = unitCost * ing.quantity;
      rawSum += totalCost;

      return {
        ...ing,
        name: nameStr,
        unitCost,
        totalCost
      };
    });

    const errorMarginCost = rawSum * (errorMarginPercentage / 100);
    const operatingCost = rawSum * (operationalCostPercentage / 100);
    const totalProductionCost = rawSum + errorMarginCost + operatingCost;
    const costPerPortion = totalProductionCost * quantityToProduce;
    const yieldQtyNum = Number(yieldQuantity) || 1;
    const costPerUnit = yieldQtyNum > 0 ? (totalProductionCost / yieldQtyNum) : 0;

    return {
      items: details,
      rawSum,
      errorMarginCost,
      operatingCost,
      totalProductionCost,
      costPerPortion,
      costPerUnit
    };
  }, [ingredients, inventoryItems, errorMarginPercentage, operationalCostPercentage, quantityToProduce, yieldQuantity, systemSettings]);

  // Ingredients handlers
  const addIngredient = (item: InventoryItem) => {
    lastAddedIdRef.current = item.id;
    setIngredients(prev => [
      ...prev,
      {
        inventoryItemId: item.id,
        quantity: 10,
        unit: item.usageUnit || item.countUnit
      }
    ]);
    setSearchQuery('');
    setShowItemDropdown(false);
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(ing => ing.inventoryItemId !== id));
  };

  const updateQuantity = (id: string, qty: number) => {
    setIngredients(ingredients.map(ing => 
      ing.inventoryItemId === id ? { ...ing, quantity: qty } : ing
    ));
  };

  // Allergens handlers
  const handleSelectAllergen = (all: string) => {
    if (!allergens.includes(all)) {
      setAllergens([...allergens, all]);
    }
    setShowAllergensDropdown(false);
  };

  const handleAddNewAllergen = async () => {
    const cleanAllergen = newAllergen.trim();
    if (!cleanAllergen) return;

    try {
      const allList = [...dbAllergens];
      if (!allList.includes(cleanAllergen)) {
        allList.push(cleanAllergen);
        await saveSystemSetting('master_allergens', allList);
        await db.allergens.put({ name: cleanAllergen });
      }
      if (!allergens.includes(cleanAllergen)) {
        setAllergens([...allergens, cleanAllergen]);
      }
      setNewAllergen('');
      setShowAllergensDropdown(false);
    } catch (err) {
      console.error('Failed to save new allergen to DB:', err);
    }
  };

  const handleRemoveAllergen = (all: string) => {
    setAllergens(allergens.filter(a => a !== all));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Por favor ingresa un nombre para la subreceta');
      return;
    }

    // Required fields validations
    if (reqFields?.description && !description.trim()) {
      toast.error('El campo "Descripción" es obligatorio según las directivas del sistema.');
      return;
    }

    const yieldQtyNum = Number(yieldQuantity) || 150;

    const subRecipeData: Recipe = {
      ...(existingSubRecipe || {}),
      id: subRecipeId || `subrec-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      category: existingSubRecipe?.category || 'BAR',
      sellPrice: 0,
      costPrice: ingredientDetails.costPerUnit, 
      portionCost: ingredientDetails.costPerPortion,
      costPerUnit: ingredientDetails.costPerUnit,
      yieldFactor: 1.0,
      isSubRecipe: true,
      ingredients: ingredients.map(ing => ({
        inventoryItemId: ing.inventoryItemId,
        type: 'item',
        quantity: ing.quantity,
        unit: ing.unit
      })),
      yieldQuantity: yieldQtyNum,
      yieldUnit,
      allergens,
      updatedAt: new Date().toISOString()
    };

    try {
      await db.recipes.put(subRecipeData);
      toast.success(`Subreceta "${name}" guardada exitosamente.`);
      onSaved();
    } catch (err) {
      console.error('Failed to save subrecipe:', err);
      toast.error('Error al guardar la subreceta en la base de datos.');
    }
  };

  const handleDelete = async () => {
    if (!subRecipeId) return;
    try {
      await db.recipes.delete(subRecipeId);
      toast.success(`Subreceta "${name}" eliminada exitosamente.`);
      onSaved();
    } catch (err) {
      console.error('Error deleting subrecipe:', err);
      toast.error('Error al eliminar la subreceta.');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-content">
      
      {/* Header Row */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSafeExit}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white flex items-center justify-center p-1.5 rounded-xl border border-line transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-content leading-tight">
              {subRecipeId ? 'Editar Subreceta' : 'Crear Nueva Subreceta'}
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {subRecipeId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 border-none"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              Eliminar
            </button>
          )}
          <button 
            onClick={handleSave}
            className="px-5 py-2.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white text-xs font-bold rounded-xl shadow-md shadow-[var(--accent-purple)]/10 transition-all cursor-pointer flex items-center gap-2 border-none"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            Guardar Subreceta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Form Blocks */}
        <div className="lg:col-span-8 space-y-6 w-full min-w-0">
          
          {/* 1. Información Básica */}
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">info</span>
              </div>
              <h3 className="text-sm font-black text-content uppercase tracking-wider">Información Básica</h3>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-content-secondary block mb-1">Nombre de la Subreceta</label>
              <Input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Salsa de gulupa"
                className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-content-secondary block mb-1">Descripción</label>
              <Textarea 
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detalles sobre la preparación o uso de esta subreceta..."
                className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
              />
            </div>

            {/* Allergens selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-content-secondary block mb-1.5">Alérgenos</label>
              <div className="flex flex-wrap items-center gap-2">
                {allergens.map(al => (
                  <span 
                    key={al}
                    className="bg-slate-100 dark:bg-[var(--card-color)] text-slate-700 dark:text-slate-200 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-line"
                  >
                    {al}
                    <button 
                      onClick={() => handleRemoveAllergen(al)}
                      className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
                
                <div className="relative">
                  <button
                    onClick={() => setShowAllergensDropdown(!showAllergensDropdown)}
                    className="text-[var(--accent-purple)] hover:underline text-[10px] font-black flex items-center gap-1 cursor-pointer bg-[var(--bg-app)] px-2.5 py-1.5 rounded-xl border border-[var(--border-glow)] transition-all"
                  >
                    + Seleccionar Alérgeno
                  </button>

                  {showAllergensDropdown && (
                    <div className="absolute left-0 top-9 bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-xl shadow-xl p-2.5 w-56 z-40 space-y-1.5 animate-fade-in text-[var(--text-primary)]">
                      <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                        {dbAllergens.filter((a: string) => !allergens.includes(a)).map((all: string) => (
                          <button
                            key={all}
                            onClick={() => handleSelectAllergen(all)}
                            className="w-full text-left px-2 py-1.5 text-[10px] font-black hover:bg-[var(--bg-app)] rounded-md block truncate text-[var(--text-secondary)] cursor-pointer border-none"
                          >
                            {all}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-[var(--border-glow)] pt-2 flex items-center gap-1">
                        <Input
                          type="text"
                          placeholder="Nuevo..."
                          value={newAllergen}
                          onChange={(e) => setNewAllergen(e.target.value)}
                          className="w-full border border-[var(--border-glow)] rounded-md px-1.5 py-1 text-[9px] bg-[var(--bg-app)] outline-none text-[var(--text-primary)]"
                        />
                        <button
                          onClick={handleAddNewAllergen}
                          className="bg-[var(--accent-purple)] text-white rounded-md px-2 py-1 text-[9px] font-bold shrink-0 cursor-pointer border-none"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Métricas de Producción */}
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">equalizer</span>
              </div>
              <h3 className="text-sm font-black text-content uppercase tracking-wider">Métricas de Producción</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Cant. Obtenida</label>
                <Input 
                  type="number" 
                  value={yieldQuantity}
                  onChange={e => setYieldQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ej. 150"
                  className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none text-center focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">U. de Medida</label>
                <CustomSelect 
                  value={yieldUnit}
                  onChange={setYieldUnit}
                  options={officialUnits.map((unit: string) => ({ value: unit, label: unit }))}
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">A Producir</label>
                <Input 
                  type="number" 
                  value={quantityToProduce}
                  onChange={e => setQuantityToProduce(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none text-center focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Margen Error (%)</label>
                <Input 
                  type="text" 
                  value={`${errorMarginPercentage}%`}
                  onChange={e => setErrorMarginPercentage(Number(e.target.value.replace('%', '')) || 0)}
                  className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none text-center focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* 3. Insumos e Ingredientes */}
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-black text-content uppercase tracking-wider">Insumos e Ingredientes</h3>
              
              {/* Search input dropdown - full width w-full */}
              <div className="relative w-full">
                <div className="flex items-center gap-2 bg-inset/40 border border-line px-3 py-2.5 rounded-lg w-full">
                  <span className="material-symbols-outlined text-xs text-content-secondary">search</span>
                  <Input 
                    type="text" 
                    placeholder="Añadir Insumo..." 
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowItemDropdown(true);
                    }}
                    onFocus={() => setShowItemDropdown(true)}
                    className="bg-transparent border-none outline-none text-xs w-full font-semibold text-content shadow-none p-0 h-auto"
                  />
                </div>

                {/* Expanded search dropdown showing Name, Category, Stock, Unit - dark contrast */}
                {showItemDropdown && filteredItems.length > 0 && (
                  <div className="absolute left-0 right-0 top-11 w-full max-h-60 overflow-y-auto bg-surface border border-line rounded-lg shadow-2xl z-30 divide-y divide-gray-100 dark:divide-line text-content animate-fade-in">
                    <div className="p-2.5 bg-inset text-[9px] font-black text-content-secondary uppercase tracking-wider grid grid-cols-12 gap-1 border-b border-line shrink-0">
                      <div className="col-span-5">Insumo</div>
                      <div className="col-span-3">Categoría</div>
                      <div className="col-span-2 text-right">Stock</div>
                      <div className="col-span-2 text-right">Unidad</div>
                    </div>
                    {filteredItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => addIngredient(item)}
                        className="w-full text-left p-3 text-[11px] hover:bg-slate-50 dark:hover:bg-raised font-bold text-content grid grid-cols-12 gap-1 items-center transition-colors border-none cursor-pointer"
                      >
                        <div className="col-span-5 truncate">{item.name}</div>
                        <div className="col-span-3 truncate text-content-secondary text-[10px]">{item.category}</div>
                        <div className="col-span-2 text-right text-content-secondary">{item.realPhysicalStock}</div>
                        <div className="col-span-2 text-right text-slate-400">{item.countUnit}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ingredients Table - scroll-x responsivo */}
            <div className="overflow-x-auto w-full border border-line rounded-lg">
              <table className="w-full text-left text-xs font-semibold min-w-[600px]">
                <thead>
                  <tr className="border-b border-line text-[9px] font-black text-content-tertiary uppercase tracking-wider bg-inset">
                    <th className="p-3">Insumo</th>
                    <th className="p-3 text-center">Cant. Estándar</th>
                    <th className="p-3 text-center">Unidad</th>
                    <th className="p-3 text-right">Costo Real</th>
                    <th className="p-3 text-center">Cant. Prod.</th>
                    <th className="p-3 text-right">Costo Prod.</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-line text-content-secondary">
                  {ingredientDetails.items.map(ing => (
                    <tr key={ing.inventoryItemId}>
                      <td className="p-3 text-content font-bold">{ing.name}</td>
                      <td className="p-3 text-center">
                        <Input 
                          ref={el => { quantityInputRefs.current[ing.inventoryItemId] = el; }}
                          type="number"
                          step="any"
                          value={ing.quantity}
                          onFocus={e => e.target.select()}
                          onClick={e => (e.target as HTMLInputElement).select()}
                          onChange={e => {
                            const raw = e.target.value.replace(',', '.');
                            const parsed = raw === '' ? 0 : parseFloat(raw);
                            updateQuantity(ing.inventoryItemId, isNaN(parsed) ? 0 : parsed);
                          }}
                          className="w-20 rounded-lg bg-surface border border-line p-1 text-center font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-content"
                        />
                      </td>
                      <td className="p-3 text-center text-slate-400">{ing.unit}</td>
                      <td className="p-3 text-right text-content">{formatCurrency(ing.unitCost)}</td>
                      <td className="p-3 text-center text-content-secondary">{ing.quantity} {ing.unit}</td>
                      <td className="p-3 text-right text-content font-bold">
                        {formatCurrency(ing.totalCost)}
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => removeIngredient(ing.inventoryItemId)}
                          className="text-rose-500 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ingredients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-500">
                        No hay insumos agregados. Utilice la barra de búsqueda de arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Section */}
            <div className="flex justify-between items-center pt-4 text-sm font-semibold">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Costo Total Ingredientes</span>
              <span className="text-content font-black text-base">
                {formatCurrency(ingredientDetails.rawSum)}
              </span>
            </div>
          </div>

        </div>

        {/* Right Results Panel */}
        <div className="lg:col-span-4 space-y-6 w-full animate-fade-in">
          
          {/* RESULTADOS */}
          <div className="bg-surface text-content p-6 rounded-2xl shadow-sm space-y-6 border border-line">
            <div className="flex items-center gap-2 pb-2 border-b border-line">
              <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">trending_up</span>
              <h3 className="text-sm font-black uppercase tracking-wider">Resultados</h3>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-content-secondary">Costo total de insumos</span>
                <span className="font-bold text-content">{formatCurrency(ingredientDetails.rawSum)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-content-secondary">Margen de error ({errorMarginPercentage}%)</span>
                <span className="font-bold text-content">{formatCurrency(ingredientDetails.errorMarginCost)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-content-secondary">Costo Operativo ({operationalCostPercentage}%)</span>
                <span className="font-bold text-content">{formatCurrency(ingredientDetails.operatingCost)}</span>
              </div>

              <div className="pt-4 border-t border-line flex justify-between items-center">
                <span className="text-xs font-black text-content-secondary">Costo total de producción</span>
                <span className="text-2xl font-black text-purple-600 dark:text-purple-400">{formatCurrency(ingredientDetails.totalProductionCost)}</span>
              </div>
            </div>

            <div className="bg-inset p-4 rounded-xl space-y-3.5 pt-4 border border-line">
              <span className="text-[9px] font-black tracking-wider uppercase text-content-tertiary block">Porción y Unidad</span>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-content-secondary">Costo por porción</span>
                <span className="font-extrabold text-sm text-content">{formatCurrency(ingredientDetails.costPerPortion)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold pt-2.5 border-t border-line">
                <span className="text-content-secondary">Costo por {yieldUnit}</span>
                <span className="font-black text-lg text-cyan-700 dark:text-cyan-400 font-mono tabular-nums">{formatCurrency(ingredientDetails.costPerUnit)}</span>
              </div>
            </div>

            <p className="text-[9px] text-content-tertiary italic mt-2">
              * El costo por porción se calcula como: Costo Total Producción × Cantidad a Producir. El costo por {yieldUnit} se divide por la cantidad obtenida.
            </p>

            <button 
              onClick={handleSave}
              className="w-full py-3.5 bg-neutral-900 hover:bg-canvas dark:bg-raised dark:hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer shadow-sm transition-colors text-center block border-none"
            >
              Guardar Subreceta
            </button>
          </div>

        </div>

      </div>

      <DiscardChangesModal
        isOpen={showDiscardModal}
        onContinueEditing={cancelExit}
        onDiscardAndExit={confirmExit}
        onConfirm={confirmExit}
        onCancel={cancelExit}
      />

      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Eliminar Subreceta"
          message={`¿Estás seguro de que deseas eliminar la subreceta "${name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
