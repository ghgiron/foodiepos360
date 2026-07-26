import { useState, useMemo, useEffect, useRef } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe } from '../types';
import { saveSystemSetting, DEFAULT_SETTINGS } from '../db/settingsStore';
import { getDropdownOptions } from '../utils/dataHelper';
import ImageUploader from './ImageUploader';
import ConfirmDialog from './ui/ConfirmDialog';
import { toast } from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

interface RecipeFormProps {
  onCancel: () => void;
  onSaved: () => void;
  recipeId?: string | null;
}

export default function RecipeForm({ onCancel, onSaved, recipeId }: RecipeFormProps) {
  // DB query
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const subRecipes = useLiveQuery(() => db.recipes.filter(r => r.isSubRecipe).toArray()) || [];
  const dbSupplyCategories = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  
  const existingRecipe = useLiveQuery(async () => {
    if (!recipeId) return null;
    return await db.recipes.get(recipeId);
  }, [recipeId]);

  // Load system settings
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const taxPercentage = systemSettings['taxPercentage'] !== undefined 
    ? Number(systemSettings['taxPercentage']) 
    : (systemSettings['ipoconsumo_pct'] !== undefined ? Number(systemSettings['ipoconsumo_pct']) : 8);

  const safetyMarginPercentage = systemSettings['safetyMarginPercentage'] !== undefined 
    ? Number(systemSettings['safetyMarginPercentage']) 
    : (systemSettings['error_margin_pct'] !== undefined ? Number(systemSettings['error_margin_pct']) : 5);

  const operationalCostPercentage = systemSettings['operationalCostPercentage'] !== undefined 
    ? Number(systemSettings['operationalCostPercentage']) 
    : 14.95;

  const minUtilityMargin = systemSettings['min_utility_margin'] !== undefined ? Number(systemSettings['min_utility_margin']) : 35;
  const reqFields = systemSettings['required_fields'] || DEFAULT_SETTINGS.required_fields;
  const dbAllergens = getDropdownOptions('master_allergens', systemSettings);
  
  // Load categories EXCLUSIVELY from Dexie menuCategories table
  const dbMenuCategories = useLiveQuery(() => db.menuCategories.toArray()) || [];
  const menuCategories = useMemo(() => dbMenuCategories.map(c => c.name), [dbMenuCategories]);

  const productionZones = useMemo<string[]>(() => systemSettings['production_zones'] || ['Cocina', 'Bar', 'Licuadoras'], [systemSettings]);

  // Form states (start empty per cleanup requirements)
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [productionZone, setProductionZone] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [image, setImage] = useState<string>('');
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState<string>('');
  const [chefAdvice, setChefAdvice] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('Media');
  const [prepTime, setPrepTime] = useState<number>(15);
  const [activo_catalogo, setActivoCatalogo] = useState<boolean>(true);
  const [visible_tienda_online, setVisibleTiendaOnline] = useState<boolean>(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Search refs for click outside
  const ingredientSearchRef = useRef<HTMLDivElement>(null);
  const packagingSearchRef = useRef<HTMLDivElement>(null);

  // Click outside to close search dropdowns
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (ingredientSearchRef.current && !ingredientSearchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (packagingSearchRef.current && !packagingSearchRef.current.contains(event.target as Node)) {
        setShowPkgDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);



  // Price config (using number | '' for clean placeholders)
  const [sellPrice, setSellPrice] = useState<number | ''>(''); 
  const [domesticPrice, setDomesticPrice] = useState<number | ''>('');

  // Ingredients list (either inventory items or subrecipes)
  const [ingredients, setIngredients] = useState<Array<{
    id: string; 
    inventoryItemId: string; // references InventoryItem.id or Recipe.id
    type: 'item' | 'subrecipe';
    quantity: number;
    unit: string;
  }>>([]);

  // Packaging and disposables state
  const [packaging, setPackaging] = useState<Array<{
    item: string;
    quantity: number;
    cost: number;
  }>>([]);

  // Packaging search and selection states
  const [pkgSearchQuery, setPkgSearchQuery] = useState<string>('');
  const [showPkgDropdown, setShowPkgDropdown] = useState<boolean>(false);

  // Allergens selector states
  const [newAllergen, setNewAllergen] = useState<string>('');
  const [showAllergensDropdown, setShowAllergensDropdown] = useState<boolean>(false);

  // Search query states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  const supplyCategoriesList = useMemo(() => {
    return dbSupplyCategories.map(c => c.name.toLowerCase().trim());
  }, [dbSupplyCategories]);

  // Filter packaging items from inventory items list
  const packagingInventoryItems = useMemo(() => {
    return inventoryItems.filter(item => {
      const supplyCat = (item.supplyCategory || '').toLowerCase().trim();
      const cat = (item.category || '').toLowerCase().trim();
      return supplyCategoriesList.some(sc => 
        supplyCat === sc || cat === sc || supplyCat.includes(sc) || cat.includes(sc)
      );
    });
  }, [inventoryItems, supplyCategoriesList]);

  const filteredPkgItems = useMemo(() => {
    const q = pkgSearchQuery.toLowerCase().trim();
    if (!q) return [];
    return packagingInventoryItems.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.id.toLowerCase().includes(q)
    );
  }, [pkgSearchQuery, packagingInventoryItems]);

  // Initialize default category if not editing
  useEffect(() => {
    if (!category && menuCategories.length > 0) {
      setCategory(menuCategories[0]);
    }
  }, [category, menuCategories]);

  useEffect(() => {
    if (category && systemSettings && !recipeId) {
      const catMap = systemSettings['category_production_map'] || {};
      const defaultZone = catMap[category] || productionZones[0] || 'Cocina';
      setProductionZone(defaultZone);
    }
  }, [category, productionZones, systemSettings, recipeId]);

  // Load existing recipe data if editing
  useEffect(() => {
    if (existingRecipe) {
      setName(existingRecipe.name);
      setCategory(existingRecipe.category);
      setProductionZone(existingRecipe.productionZone || '');
      setDescription(existingRecipe.description || '');
      setSellPrice(existingRecipe.sellPrice || '');
      setDomesticPrice(existingRecipe.domesticPrice || '');
      setAllergens(existingRecipe.allergens || []);
      setImage(existingRecipe.img || '');
      setSteps(existingRecipe.steps || []);
      setChefAdvice(existingRecipe.chefAdvice || '');
      setDifficulty(existingRecipe.difficulty || 'Media');
      setPrepTime(existingRecipe.prepTime || 15);
      setActivoCatalogo(existingRecipe.activo_catalogo !== undefined ? existingRecipe.activo_catalogo : (existingRecipe.mostrar_en_catalogo !== undefined ? existingRecipe.mostrar_en_catalogo : true));
      setVisibleTiendaOnline(!!existingRecipe.visible_tienda_online);

      setIngredients(existingRecipe.ingredients.map((ing, index) => ({
        id: `ing-${index}-${Date.now()}`,
        inventoryItemId: ing.inventoryItemId,
        type: ing.type || 'item',
        quantity: ing.quantity,
        unit: ing.unit
      })));
      if (existingRecipe.packaging) {
        setPackaging(existingRecipe.packaging);
      }
    }
  }, [existingRecipe]);

  // Combined search list of inventory items and subrecipes with details
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    
    const matchedItems = inventoryItems
      .filter(item => item.name.toLowerCase().includes(q))
      .map(item => ({ 
        id: item.id, 
        name: item.name, 
        type: 'item' as const, 
        unit: item.countUnit,
        category: item.category,
        stock: item.realPhysicalStock 
      }));

    const matchedSubrecipes = subRecipes
      .filter(sr => sr.name.toLowerCase().includes(q))
      .map(sr => ({ 
        id: sr.id, 
        name: sr.name, 
        type: 'subrecipe' as const, 
        unit: sr.yieldUnit || 'gr',
        category: 'Subreceta',
        stock: 0 
      }));

    return [...matchedItems, ...matchedSubrecipes].filter(r => 
      !ingredients.some(ing => ing.inventoryItemId === r.id)
    );
  }, [searchQuery, inventoryItems, subRecipes, ingredients]);

  // Dynamic calculations: total cost, margins and tax (Ipoconsumo 8%)
  const calculationDetails = useMemo(() => {
    let rawIngredientsCost = 0;

    const itemsDetails = ingredients.map(ing => {
      let unitCost = 0;
      let nameStr = ing.inventoryItemId;

      if (ing.type === 'item') {
        const item = inventoryItems.find(i => i.id === ing.inventoryItemId);
        if (item) {
          nameStr = item.name;
          if (item.costoUnitarioReal !== undefined) {
            unitCost = item.costoUnitarioReal;
          } else {
            unitCost = item.purchaseCost / (item.countUnit === 'Kilogramo' || item.countUnit === 'Kg' ? 1 : 1000); 
            if (item.countUnit === 'unidad' || item.countUnit === 'Unidad') {
              unitCost = item.purchaseCost;
            }
          }
        }
      } else {
        const sr = subRecipes.find(r => r.id === ing.inventoryItemId);
        if (sr) {
          nameStr = sr.name;
          unitCost = sr.costPrice; 
        }
      }

      const totalCost = unitCost * ing.quantity;
      rawIngredientsCost += totalCost;

      return {
        ...ing,
        name: nameStr,
        unitCost,
        totalCost
      };
    });

    const operatingCost = rawIngredientsCost * (operationalCostPercentage / 100);
    const errorMarginCost = rawIngredientsCost * (safetyMarginPercentage / 100);
    const totalProductionCost = rawIngredientsCost + operatingCost + errorMarginCost;

    // Packaging Cost sum
    const packagingCost = packaging.reduce((sum, pkg) => sum + (pkg.cost * pkg.quantity), 0);
    const totalDomiCost = totalProductionCost + packagingCost;

    const sellPriceNum = Number(sellPrice) || 0;
    const domesticPriceNum = Number(domesticPrice) || 0;

    // Dine-in Gross Margin (Mesa) - Strictly divided by (1 + tax)
    const netMesaPVP = sellPriceNum / (1 + (taxPercentage / 100));
    const mesaUtility = netMesaPVP - totalProductionCost;
    const mesaMarginPct = netMesaPVP > 0 ? (mesaUtility / netMesaPVP) * 100 : 0;

    // Delivery Gross Margin (Domi) - Strictly divided by (1 + tax)
    const netDomiPVP = domesticPriceNum / (1 + (taxPercentage / 100));
    const domiUtility = netDomiPVP - totalDomiCost;
    const domiMarginPct = netDomiPVP > 0 ? (domiUtility / netDomiPVP) * 100 : 0;

    // Check if margins fall below minimum permitted global setting (using rounded margins to match display)
    const isMesaCritical = sellPriceNum > 0 && Math.round(mesaMarginPct) < minUtilityMargin;
    const isDomiCritical = domesticPriceNum > 0 && Math.round(domiMarginPct) < minUtilityMargin;

    return {
      items: itemsDetails,
      rawIngredientsCost,
      operatingCost,
      errorMarginCost,
      totalProductionCost,
      packagingCost,
      totalDomiCost,
      netMesaPVP,
      mesaUtility,
      mesaMarginPct,
      netDomiPVP,
      domiUtility,
      domiMarginPct,
      isMesaCritical,
      isDomiCritical
    };
  }, [ingredients, inventoryItems, subRecipes, packaging, sellPrice, domesticPrice, minUtilityMargin, taxPercentage, safetyMarginPercentage, operationalCostPercentage]);

  // Ingredients handlers
  const addIngredient = (item: { id: string; name: string; type: 'item' | 'subrecipe'; unit: string }) => {
    setIngredients([
      ...ingredients,
      {
        id: `ing-${Date.now()}`,
        inventoryItemId: item.id,
        type: item.type,
        quantity: 1,
        unit: item.unit
      }
    ]);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter(ing => ing.id !== id));
  };

  const updateQuantity = (id: string, qty: number) => {
    setIngredients(ingredients.map(ing => 
      ing.id === id ? { ...ing, quantity: qty } : ing
    ));
  };

  // Packaging handlers
  const handleSelectPackagingItem = (item: any) => {
    if (packaging.some(p => p.item === item.name)) {
      toast.error('Este suministro ya ha sido agregado.');
      return;
    }
    setPackaging([
      ...packaging,
      {
        item: item.name,
        quantity: 1,
        cost: item.purchaseCost
      }
    ]);
    setPkgSearchQuery('');
    setShowPkgDropdown(false);
  };

  const handleRemovePackaging = (index: number) => {
    setPackaging(packaging.filter((_, idx) => idx !== index));
  };

  const handleUpdatePackagingQty = (index: number, qty: number) => {
    setPackaging(packaging.map((pkg, idx) => 
      idx === index ? { ...pkg, quantity: qty } : pkg
    ));
  };

  const handleUpdatePackagingCost = (index: number, cost: number) => {
    setPackaging(packaging.map((pkg, idx) => 
      idx === index ? { ...pkg, cost } : pkg
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

    // Save dynamically to IndexedDB master list
    try {
      const allList = [...dbAllergens];
      if (!allList.includes(cleanAllergen)) {
        allList.push(cleanAllergen);
        await saveSystemSetting('master_allergens', allList);
      }
      if (!allergens.includes(cleanAllergen)) {
        setAllergens([...allergens, cleanAllergen]);
      }
      setNewAllergen('');
      setShowAllergensDropdown(false);
    } catch (err) {
      console.error('Failed to save new allergen:', err);
    }
  };

  const handleRemoveAllergen = (all: string) => {
    setAllergens(allergens.filter(a => a !== all));
  };

  // Steps Handlers
  const handleAddStep = () => {
    if (newStep.trim()) {
      setSteps([...steps, newStep.trim()]);
      setNewStep('');
    }
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, idx) => idx !== index));
  };

  const handleUpdateStep = (index: number, text: string) => {
    setSteps(steps.map((st, idx) => idx === index ? text : st));
  };



  // Save recipe
  const handleSaveRecipe = async () => {
    if (!name.trim()) return toast.error('Por favor ingresa el nombre de la receta.');

    // Required fields validations from global configs
    if (reqFields.description && !description.trim()) {
      return toast.error('El campo "Descripción" es obligatorio según las directivas del sistema.');
    }
    if (reqFields.steps && (steps.length === 0 || steps.every(st => !st.trim()))) {
      return toast.error('Debe detallar al menos un "Paso de Preparación" según las directivas del sistema.');
    }
    if (reqFields.chefAdvice && !chefAdvice.trim()) {
      return toast.error('El campo "Consejo del Chef" es obligatorio según las directivas del sistema.');
    }
    if (reqFields.image && !image) {
      return toast.error('Debe cargar una "Imagen" representativa del plato según las directivas del sistema.');
    }

    const sellPriceNum = Number(sellPrice) || 0;
    const domesticPriceNum = Number(domesticPrice) || 0;

    const recipeData: Recipe = {
      id: recipeId || `rec-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      category,
      productionZone,
      sellPrice: sellPriceNum,
      domesticPrice: domesticPriceNum,
      costPrice: calculationDetails.totalProductionCost,
      yieldFactor: 1.0,
      cmvPercentage: sellPriceNum > 0 ? (calculationDetails.totalProductionCost / sellPriceNum) * 100 : 0,
      bcgClassification: calculationDetails.mesaMarginPct >= 60 ? 'ESTRELLA' : 'CABALLO_DE_BATALLA',
      ingredients: ingredients.map(ing => ({
        inventoryItemId: ing.inventoryItemId,
        type: ing.type,
        quantity: ing.quantity,
        unit: ing.unit
      })),
      isSubRecipe: false,
      allergens,
      img: image,
      steps,
      prepTime,
      difficulty,
      chefAdvice: chefAdvice.trim(),
      packaging,
      supplierId: existingRecipe?.supplierId || undefined,
      activo_catalogo,
      mostrar_en_catalogo: activo_catalogo,
      visible_tienda_online,
      updatedAt: new Date().toISOString()
    };

    try {
      await db.recipes.put(recipeData);
      toast.success('Receta guardada exitosamente.');
      onSaved();
    } catch (err) {
      console.error('Failed to save recipe:', err);
      toast.error('Error al guardar la receta en la base de datos.');
    }
  };

  const handleDeleteRecipe = async () => {
    if (!recipeId) return;
    try {
      await db.recipes.delete(recipeId);
      toast.success('Receta eliminada correctamente.');
      onSaved();
    } catch (err) {
      console.error('Error deleting recipe:', err);
      toast.error('Error al eliminar la receta.');
    }
  };

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-slate-800 dark:text-slate-200">
      
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white flex items-center justify-center p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
              {recipeId ? 'Editar Receta' : 'Crear Nueva Receta'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {recipeId && (
            <button 
              type="button"
              onClick={() => setIsConfirmDeleteOpen(true)}
              className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              Eliminar
            </button>
          )}
          <button 
            onClick={handleSaveRecipe}
            className="px-5 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-xs font-bold rounded-xl shadow-md shadow-[var(--accent-pink)]/15 cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {recipeId ? 'Actualizar Receta' : 'Crear Receta'}
          </button>
        </div>
      </div>

      {/* Critical Margins Warning alert */}
      {(calculationDetails.isMesaCritical || calculationDetails.isDomiCritical) && (
        <div className="p-4 bg-rose-500/10 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-3 items-start border border-rose-500/20 shadow-sm animate-pulse">
          <span className="material-symbols-outlined text-lg shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          <div className="text-xs">
            <span className="font-black block uppercase tracking-wider mb-1">Requiere revisión de costos</span>
            <p className="font-semibold">
              La rentabilidad esperada para Mesa ({Math.round(calculationDetails.mesaMarginPct)}%) o Domicilio ({Math.round(calculationDetails.domiMarginPct)}%) ha caído por debajo del margen mínimo permitido de <strong>{minUtilityMargin}%</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Grid Layout - Responsive columns mapping */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Columns Form (takes 8 cols on lg screen) */}
        <div className="lg:col-span-8 space-y-6 w-full min-w-0">
          
          {/* Information Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Nombre de la Receta</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej. Hamburguesa Pícara"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--card-color)] text-slate-900 dark:text-white p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Categoría</label>
                <CustomSelect 
                  value={category}
                  onChange={setCategory}
                  options={menuCategories.map(cat => ({ value: cat, label: cat }))}
                  className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Zona de Producción (KDS)</label>
                <CustomSelect 
                  value={productionZone}
                  onChange={setProductionZone}
                  options={productionZones.map(pz => ({ value: pz, label: pz }))}
                  className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Tiempo de Prep (minutos)</label>
                <input 
                  type="number" 
                  value={prepTime === 0 ? '' : prepTime}
                  onChange={e => setPrepTime(Number(e.target.value) || 0)}
                  placeholder="Ej. 15"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--card-color)] text-slate-900 dark:text-white p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Dificultad</label>
                <CustomSelect 
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { value: 'Baja', label: 'Baja' },
                    { value: 'Media', label: 'Media' },
                    { value: 'Alta', label: 'Alta' }
                  ]}
                  className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Consejo del Chef</label>
              <textarea 
                rows={3}
                value={chefAdvice}
                onChange={e => setChefAdvice(e.target.value)}
                placeholder="Describe sugerencias de montaje o trucos de cocina..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--card-color)] text-slate-900 dark:text-white p-2.5 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/20"
              />
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Descripción</label>
              <textarea 
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe brevemente el plato..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--card-color)] text-slate-900 dark:text-white p-2.5 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/20"
              />
            </div>

            {/* Allergens selection multiselect */}
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1.5">Alérgenos</label>
              <div className="flex flex-wrap items-center gap-2">
                {allergens.map(al => (
                  <span 
                    key={al}
                    className="bg-slate-100 dark:bg-[var(--card-color)] text-slate-700 dark:text-slate-200 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
                  >
                    {al}
                    <button 
                      onClick={() => handleRemoveAllergen(al)}
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
                
                <div className="relative">
                  <button
                    onClick={() => setShowAllergensDropdown(!showAllergensDropdown)}
                    className="text-[var(--accent-purple)] hover:underline text-[10px] font-black flex items-center gap-1 cursor-pointer bg-slate-50 dark:bg-[var(--card-color)] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-all text-slate-700 dark:text-slate-350"
                  >
                    + Seleccionar Alérgeno
                  </button>

                  {showAllergensDropdown && (
                    <div className="absolute left-0 top-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2.5 w-56 z-40 space-y-1.5 animate-fade-in text-slate-800 dark:text-slate-100">
                      <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                        {dbAllergens.filter((a: string) => !allergens.includes(a)).map((all: string) => (
                          <button
                            key={all}
                            onClick={() => handleSelectAllergen(all)}
                            className="w-full text-left px-2 py-1.5 text-[10px] font-black hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md block truncate text-slate-700 dark:text-slate-200"
                          >
                            {all}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="Nuevo..."
                          value={newAllergen}
                          onChange={(e) => setNewAllergen(e.target.value)}
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-1 text-[9px] bg-slate-50 dark:bg-[var(--card-color)] outline-none text-slate-800 dark:text-white"
                        />
                        <button
                          onClick={handleAddNewAllergen}
                          className="bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white rounded-md px-2 py-1 text-[9px] font-bold shrink-0"
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

          {/* Ingredientes y Subrecetas Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Ingredientes y Subrecetas</h3>
              
              {/* Search input dropdown - full width w-full */}
              <div ref={ingredientSearchRef} className="relative w-full">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl w-full">
                  <span className="material-symbols-outlined text-xs text-slate-500 dark:text-slate-400">search</span>
                  <input 
                    type="text" 
                    placeholder="Agregar Ingrediente / Subreceta..." 
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="bg-transparent border-none outline-none text-xs w-full font-semibold text-slate-800 dark:text-slate-200"
                  />
                </div>

                {/* Expanded Search Dropdown showing detailed columns - dark contrast */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-11 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-30 divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-100">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider grid grid-cols-12 gap-1 border-b border-slate-200 dark:border-slate-800 shrink-0">
                      <div className="col-span-5">Nombre</div>
                      <div className="col-span-3">Categoría</div>
                      <div className="col-span-2 text-right">Stock</div>
                      <div className="col-span-2 text-right">Unidad</div>
                    </div>
                    {searchResults.map(res => (
                      <button
                        key={res.id}
                        onClick={() => addIngredient(res)}
                        className="w-full text-left p-3 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 grid grid-cols-12 gap-1 items-center transition-colors border-none"
                      >
                        <div className="col-span-5 truncate">{res.name}</div>
                        <div className="col-span-3 truncate text-slate-500 dark:text-slate-400 text-[10px]">{res.category}</div>
                        <div className="col-span-2 text-right text-slate-500 dark:text-slate-350">{res.type === 'item' ? res.stock : '--'}</div>
                        <div className="col-span-2 text-right text-slate-400">{res.unit}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ingredients Table - scroll-x responsivo */}
            <div className="overflow-x-auto w-full border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs font-semibold min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50">
                    <th className="p-3">Ingrediente / Subreceta</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3 text-center">Unidad</th>
                    <th className="p-3 text-right">Costo Real</th>
                    <th className="p-3 text-right">Costo Producción</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-300">
                  {calculationDetails.items.map(ing => (
                    <tr key={ing.id}>
                      <td className="p-3 text-slate-900 dark:text-white font-bold">
                        <div className="flex flex-col">
                          <span>{ing.name}</span>
                          {ing.type === 'subrecipe' && (
                            <span className="text-[8px] font-black text-cyan-500 uppercase tracking-widest mt-0.5">Preparación Interna</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <input 
                          type="number"
                          value={ing.quantity}
                          onChange={e => updateQuantity(ing.id, Number(e.target.value) || 0)}
                          className="w-16 rounded-md bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 p-1 text-center font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="p-3 text-center text-slate-400">{ing.unit}</td>
                      <td className="p-3 text-right text-slate-800 dark:text-slate-200">${ing.unitCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-slate-900 dark:text-white font-bold">
                        ${ing.totalCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => removeIngredient(ing.id)}
                          className="text-rose-500 hover:text-rose-600 transition-colors p-1"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ingredients.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-500">
                        No hay ingredientes seleccionados. Utilice la barra de búsqueda de arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 text-sm font-semibold">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Subtotal Ingredientes</span>
              <span className="text-slate-900 dark:text-white font-black text-base">
                ${calculationDetails.rawIngredientsCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Suministros (Interactive Table from Inventory) */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Suministros</h3>
            
            {/* Search Input Dropdown */}
            <div ref={packagingSearchRef} className="relative w-full">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[var(--bg-input)] border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl w-full">
                <span className="material-symbols-outlined text-xs text-slate-500 dark:text-slate-400">search</span>
                <input 
                  type="text" 
                  placeholder="Agregar Suministro (nombre o SKU)..." 
                  value={pkgSearchQuery}
                  onChange={e => {
                    setPkgSearchQuery(e.target.value);
                    setShowPkgDropdown(true);
                  }}
                  onFocus={() => setShowPkgDropdown(true)}
                  className="bg-transparent border-none outline-none text-xs w-full font-semibold text-slate-800 dark:text-slate-200"
                />
              </div>

              {/* Dropdown flotante con z-[100] */}
              {showPkgDropdown && filteredPkgItems.length > 0 && (
                <div className="absolute left-0 right-0 top-11 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-[100] divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-100">
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider grid grid-cols-12 gap-1 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <div className="col-span-5">Nombre</div>
                    <div className="col-span-3">Categoría</div>
                    <div className="col-span-2 text-right">Costo</div>
                    <div className="col-span-2 text-right">Stock</div>
                  </div>
                  {filteredPkgItems.map(res => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => handleSelectPackagingItem(res)}
                      className="w-full text-left p-3 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 grid grid-cols-12 gap-1 items-center transition-colors border-none cursor-pointer"
                    >
                      <div className="col-span-5 truncate">{res.name}</div>
                      <div className="col-span-3 truncate text-slate-500 dark:text-slate-400 text-[10px]">{res.category}</div>
                      <div className="col-span-2 text-right text-slate-500 dark:text-slate-350">${res.purchaseCost.toLocaleString('es-CO')}</div>
                      <div className="col-span-2 text-right text-slate-400">{res.realPhysicalStock}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scroll responsivo */}
            <div className="overflow-x-auto w-full border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs font-semibold min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50">
                    <th className="p-3">Ítem de Suministro (Desde Inventario)</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3 text-right">Costo Unitario</th>
                    <th className="p-3 text-right">Costo Total</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-350">
                  {packaging.map((pkg, index) => (
                    <tr key={index}>
                      <td className="p-3 text-slate-900 dark:text-white font-bold">{pkg.item}</td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          value={pkg.quantity}
                          onChange={(e) => handleUpdatePackagingQty(index, Number(e.target.value) || 0)}
                          className="w-16 rounded-md bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 p-1 text-center font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          value={pkg.cost}
                          onChange={(e) => handleUpdatePackagingCost(index, Number(e.target.value) || 0)}
                          className="w-20 rounded-md bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 p-1 text-right font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="p-3 text-right text-slate-900 dark:text-white font-bold">
                        ${(pkg.cost * pkg.quantity).toLocaleString('es-CO')}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePackaging(index)}
                          className="text-[var(--accent-pink)] hover:text-rose-600 transition-colors p-1 cursor-pointer border-none bg-transparent"
                          title="Eliminar Suministro"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {packaging.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 dark:text-slate-500">
                        No hay suministros seleccionados. Utilice la barra de búsqueda de arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800 text-sm font-semibold">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Costo Total Suministros</span>
              <span className="text-slate-900 dark:text-white font-black">
                ${calculationDetails.packagingCost.toLocaleString('es-CO')}
              </span>
            </div>
          </div>

          {/* Pasos de Preparación */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Pasos de Preparación</h3>
            
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-[var(--card-color)] text-slate-1000 dark:text-slate-400 font-bold text-xs flex items-center justify-center shrink-0 mt-1">{idx + 1}</span>
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => handleUpdateStep(idx, e.target.value)}
                    className="w-full border-none border-b border-slate-200 dark:border-slate-800 dark:bg-slate-900 p-1 text-xs text-slate-650 dark:text-slate-350 outline-none focus:border-[var(--accent-purple)] text-slate-800 dark:text-white"
                  />
                  <button
                    onClick={() => handleRemoveStep(idx)}
                    className="text-rose-400 hover:text-rose-600 transition-colors p-1"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
              
              {/* Dynamic steps adder */}
              <div className="flex gap-2 pt-2">
                <textarea 
                  rows={2} 
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  placeholder="Agregar nuevo paso de preparación dinámico..."
                  className="w-full border border-dashed border-slate-200 dark:border-slate-750 rounded-xl p-3 text-xs outline-none text-slate-650 dark:text-slate-350 dark:bg-[var(--card-color)]"
                />
                <button
                  onClick={handleAddStep}
                  className="px-4 py-2.5 bg-slate-300 hover:bg-slate-300 dark:bg-[var(--card-color)] dark:hover:bg-slate-750 text-slate-750 dark:text-white text-xs font-bold rounded-xl transition-all self-end cursor-pointer"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Right Pricing & Profit Analytics Panel (takes 4 cols on lg screen) */}
        <div className="lg:col-span-4 space-y-6 w-full">
          
          {/* Configuración de Precios */}
          <div className="bg-[#121829] dark:bg-slate-900 text-white p-6 rounded-3xl shadow-md space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider pb-2 border-b border-white/10">Configuración de Precios</h3>
            
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">PVP (Punto de Venta Mesa)</label>
              <div className="flex items-center bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-[var(--accent-purple)]/50">
                <span className="text-slate-400 font-bold text-sm">$</span>
                <input 
                  type="number"
                  value={sellPrice}
                  onChange={e => setSellPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ej. 32900"
                  className="bg-transparent border-none outline-none text-white text-sm font-black w-full text-right"
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Precio Domicilio</label>
              <div className="flex items-center bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-[var(--accent-purple)]/50">
                <span className="text-slate-400 font-bold text-sm">$</span>
                <input 
                  type="number"
                  value={domesticPrice}
                  onChange={e => setDomesticPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ej. 35900"
                  className="bg-transparent border-none outline-none text-white text-sm font-black w-full text-right"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Ipoconsumo</label>
                <div className="bg-white/5 rounded-xl p-2 text-center text-[10px] font-black border border-white/5 text-slate-200">
                  {taxPercentage}%
                </div>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Margen Error</label>
                <div className="bg-white/5 rounded-xl p-2 text-center text-[10px] font-black border border-white/5 text-slate-200">
                  {safetyMarginPercentage}%
                </div>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Costo Oper.</label>
                <div className="bg-white/5 rounded-xl p-2 text-center text-[10px] font-black border border-white/5 text-slate-200">
                  {operationalCostPercentage}%
                </div>
              </div>
            </div>
          </div>

          {/* Análisis MESA vs DOMI */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-slate-800">
              Análisis MESA vs DOMI
            </h3>

            <div className="space-y-3 font-semibold text-xs text-slate-500">
              <div className="flex justify-between items-center">
                <span>Costo Total Ingredientes</span>
                <span className="font-bold text-slate-900 dark:text-white">${calculationDetails.rawIngredientsCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Costo Operativo ({operationalCostPercentage}%)</span>
                <span className="font-bold text-slate-900 dark:text-white">${calculationDetails.operatingCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Margen de Error ({safetyMarginPercentage}%)</span>
                <span className="font-bold text-slate-900 dark:text-white">${calculationDetails.errorMarginCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              
              <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="font-black text-slate-700 dark:text-slate-350">COSTO TOTAL PRODUCCIÓN</span>
                <span className="text-sm font-black text-slate-900 dark:text-white">${calculationDetails.totalProductionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            {/* Profits comparison progress bars */}
            <div className="space-y-4 pt-2">
              
              {/* Mesa */}
              <div className={`p-3 rounded-2xl border transition-colors ${
                calculationDetails.isMesaCritical 
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-[#f0f9ff] dark:bg-cyan-950/20 border-cyan-100 dark:border-cyan-950 text-cyan-600 dark:text-cyan-400'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-black uppercase tracking-wider">UTILIDAD BRUTA (MESA)</span>
                  <span className="text-xs font-black">${calculationDetails.mesaUtility.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-[var(--card-color)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${calculationDetails.isMesaCritical ? 'bg-rose-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(100, Math.max(0, calculationDetails.mesaMarginPct))}%` }}></div>
                </div>
                <span className="text-[9px] font-bold block mt-1.5">MARGEN NETO: {Math.round(calculationDetails.mesaMarginPct)}% (Impoconsumo Deducido)</span>
              </div>

              {/* Domicilio */}
              <div className={`p-3 rounded-2xl border transition-colors ${
                calculationDetails.isDomiCritical 
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-[var(--text-muted)]/15 border-[rgba(143,99,244,0.15)] text-[var(--text-muted)]'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-black uppercase tracking-wider">UTILIDAD BRUTA (DOMI)</span>
                  <span className="text-xs font-black">${calculationDetails.domiUtility.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-[var(--card-color)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${calculationDetails.isDomiCritical ? 'bg-rose-500' : 'bg-[var(--text-muted)]'}`} style={{ width: `${Math.min(100, Math.max(0, calculationDetails.domiMarginPct))}%` }}></div>
                </div>
                <span className="text-[9px] font-bold block mt-1.5">MARGEN NETO: {Math.round(calculationDetails.domiMarginPct)}% (Incl. Suministros)</span>
              </div>

            </div>

            <button 
              onClick={handleSaveRecipe}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-950 dark:bg-[var(--card-color)] dark:hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-colors text-center block"
            >
              Finalizar y Activar Receta
            </button>
          </div>

          {/* Configuration Panel */}
          <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/30 dark:border-slate-800/40 shadow-lg shadow-black/5 dark:shadow-black/25 rounded-3xl p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 pb-2 border-b border-[rgba(143,99,244,0.15)] uppercase tracking-wider">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">settings</span>
              Configuración y Parámetros
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-extrabold uppercase text-slate-505">¿Activo en Catálogo?</span>
              <button
                type="button"
                onClick={() => setActivoCatalogo(!activo_catalogo)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${activo_catalogo ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
              >
                <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${activo_catalogo ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[9px] font-extrabold uppercase text-slate-505">Visible en Tienda Online</span>
              <button
                type="button"
                onClick={() => setVisibleTiendaOnline(!visible_tienda_online)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${visible_tienda_online ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-slate-900'}`}
              >
                <div className={`bg-white h-4 w-4 rounded-full shadow transform transition-transform duration-300 ${visible_tienda_online ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>
          </div>

          {/* Full HD Visual Image container */}
          <ImageUploader
            value={image}
            onChange={setImage}
            label="Visualización del Plato (HD)"
            helperText="Sube la presentación final en alta resolución"
          />

        </div>

      </div>

      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDeleteRecipe}
        title="Eliminar Receta"
        message="¿Estás seguro de que deseas eliminar esta receta permanentemente? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  );
}
