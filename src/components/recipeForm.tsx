import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from '../hooks/useNavigate';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe } from '../types';
import { getEffectiveImpoconsumoRate } from '../types/settings';
import { saveSystemSetting, DEFAULT_SETTINGS } from '../db/settingsStore';
import { getDropdownOptions } from '../utils/dataHelper';
import ImageUploader from './ImageUploader';
import ConfirmDialog from './ui/ConfirmDialog';
import { toast } from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { FormActionsBar } from './ui/FormActionsBar';
import PriceInput from './ui/PriceInput';
import { formatCurrency } from '../utils/formatters';
import { calculateRecipeItemUnitCost } from '../utils/costEngine';
import useFormExitGuard from '../hooks/useFormExitGuard';
import { normalizeFormValue, areFormValuesEqual } from '../hooks/useFormDirty';
import DiscardChangesModal from './ui/DiscardChangesModal';

import { useRecipeDifficulties } from '../hooks/useCatalogs';
import { flexibleMultiMatch } from '../utils/searchEngine';

interface RecipeFormProps {
  onCancel: () => void;
  onSaved: () => void;
  recipeId?: string | null;
}

export default function RecipeForm({ onCancel, onSaved, recipeId }: RecipeFormProps) {
  const navigate = useNavigate();
  const handleExitCallback = onCancel || (() => navigate(-1));
  const difficultiesList = useRecipeDifficulties();
  const difficultyOptions = useMemo(() => {
    return difficultiesList.map(d => ({ value: d, label: d }));
  }, [difficultiesList]);
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

  const taxPercentage = getEffectiveImpoconsumoRate(systemSettings);

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
  const [isStar, setIsStar] = useState<boolean>(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Search refs for click outside
  const ingredientSearchRef = useRef<HTMLDivElement>(null);
  const packagingSearchRef = useRef<HTMLDivElement>(null);
  const quantityInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const lastAddedIdRef = useRef<string | null>(null);

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
    channel?: 'dine_in' | 'delivery';
  }>>([]);

  // Snapshot for dirty form checking
  // Snapshot for dirty form checking
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const currentSnapshotObj = useMemo(() => {
    return {
      name,
      category,
      productionZone,
      description,
      sellPrice,
      domesticPrice,
      allergens,
      image,
      steps,
      chefAdvice,
      difficulty,
      prepTime,
      activo_catalogo,
      visible_tienda_online,
      isStar,
      ingredients: ingredients.map(i => ({ id: i.inventoryItemId, q: i.quantity, u: i.unit })),
      packaging
    };
  }, [
    name, category, productionZone, description, sellPrice, domesticPrice,
    allergens, image, steps, chefAdvice, difficulty, prepTime,
    activo_catalogo, visible_tienda_online, isStar, ingredients, packaging
  ]);

  // Set initial snapshot once initial data is loaded
  useEffect(() => {
    if (!recipeId) {
      if (initialSnapshot === null && category) {
        setInitialSnapshot(JSON.stringify(normalizeFormValue(currentSnapshotObj)));
        setIsLoaded(true);
      }
    } else if (existingRecipe && !isLoaded) {
      const initialIngs = (existingRecipe.ingredients || []).map(i => ({ id: i.inventoryItemId, q: i.quantity, u: i.unit }));
      const loadedSnapshot = JSON.stringify(normalizeFormValue({
        name: existingRecipe.name || '',
        category: existingRecipe.category || '',
        productionZone: existingRecipe.productionZone || '',
        description: existingRecipe.description || '',
        sellPrice: existingRecipe.sellPrice || '',
        domesticPrice: existingRecipe.domesticPrice || '',
        allergens: existingRecipe.allergens || [],
        image: existingRecipe.img || '',
        steps: existingRecipe.steps || [],
        chefAdvice: existingRecipe.chefAdvice || '',
        difficulty: existingRecipe.difficulty || 'Media',
        prepTime: existingRecipe.prepTime || 15,
        activo_catalogo: existingRecipe.activo_catalogo !== undefined ? existingRecipe.activo_catalogo : (existingRecipe.mostrar_en_catalogo !== undefined ? existingRecipe.mostrar_en_catalogo : true),
        visible_tienda_online: !!existingRecipe.visible_tienda_online,
        isStar: Boolean(existingRecipe.isStar || existingRecipe.bcgClassification === 'ESTRELLA'),
        ingredients: initialIngs,
        packaging: (existingRecipe.packaging || []).map((p: any) => ({
          item: p.item,
          quantity: p.quantity,
          cost: p.cost,
          channel: p.channel || 'delivery'
        }))
      }));
      setInitialSnapshot(loadedSnapshot);
      setIsLoaded(true);
    }
  }, [recipeId, existingRecipe, isLoaded, currentSnapshotObj, initialSnapshot, category]);

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return !areFormValuesEqual(currentSnapshotObj, JSON.parse(initialSnapshot));
  }, [currentSnapshotObj, initialSnapshot]);

  const { showDiscardModal, handleSafeExit, confirmExit, cancelExit } = useFormExitGuard({
    isDirty,
    destination: '/recipes',
    onExitCallback: handleExitCallback
  });

  // Autofocus newly added ingredient
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

  // Helper to identify any supply item universally
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

    return supplyCategoriesList.some(sc =>
      sc && (supplyCat === sc || cat === sc || supplyCat.includes(sc) || cat.includes(sc))
    );
  };

  // Filter packaging items from inventory items list
  const packagingInventoryItems = useMemo(() => {
    return inventoryItems.filter(item => isSupplyItem(item));
  }, [inventoryItems, supplyCategoriesList]);

  const filteredPkgItems = useMemo(() => {
    if (!pkgSearchQuery.trim()) return packagingInventoryItems.slice(0, 20);
    return packagingInventoryItems.filter(item =>
      flexibleMultiMatch([item.name, item.id, item.category, item.supplyCategory], pkgSearchQuery)
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
      setIsStar(Boolean(existingRecipe.isStar || existingRecipe.bcgClassification === 'ESTRELLA'));

      setIngredients(existingRecipe.ingredients.map((ing, index) => ({
        id: `ing-${index}-${Date.now()}`,
        inventoryItemId: ing.inventoryItemId,
        type: ing.type || 'item',
        quantity: ing.quantity,
        unit: ing.unit
      })));
      if (existingRecipe.packaging) {
        setPackaging(existingRecipe.packaging.map((p: any) => ({
          item: p.item,
          quantity: p.quantity,
          cost: p.cost,
          channel: p.channel || 'delivery'
        })));
      }
    }
  }, [existingRecipe]);

  // Combined search list of inventory items and subrecipes with details (including supplies)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const matchedItems = inventoryItems
      .filter(item => {
        if (!flexibleMultiMatch([item.name, item.id, item.category, item.supplyCategory], searchQuery)) return false;
        const res = (item.resourceType || '').toLowerCase().trim();
        const tp = ((item as any).type || '').toLowerCase().trim();
        return !res || res === 'ingredient' || res === 'supply' || tp === 'ingredient' || tp === 'supply' || isSupplyItem(item);
      })
      .map(item => ({
        id: item.id,
        name: item.name,
        type: 'item' as const,
        unit: item.usageUnit || item.countUnit,
        category: item.category || item.supplyCategory || (isSupplyItem(item) ? 'Suministro' : 'General'),
        stock: item.realPhysicalStock
      }));

    const matchedSubrecipes = subRecipes
      .filter(sr => flexibleMultiMatch([sr.name, sr.id, 'Subreceta'], searchQuery))
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
          unitCost = calculateRecipeItemUnitCost(item, ing.unit, systemSettings['unit_equivalences']);
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

    // Segment supplies by channel (Salón/Mesa vs Solo Domicilio)
    const dineInSuppliesCost = packaging
      .filter(pkg => pkg.channel === 'dine_in')
      .reduce((sum, pkg) => sum + (pkg.cost * pkg.quantity), 0);

    const deliveryOnlySuppliesCost = packaging
      .filter(pkg => pkg.channel !== 'dine_in')
      .reduce((sum, pkg) => sum + (pkg.cost * pkg.quantity), 0);

    const packagingCost = dineInSuppliesCost + deliveryOnlySuppliesCost;

    // Costo Mesa = Insumos + Costo Operativo + Margen Error + Suministros Mesa
    const totalProductionCost = rawIngredientsCost + operatingCost + errorMarginCost + dineInSuppliesCost;
    const costoMesa = totalProductionCost;

    // Costo Domicilio = Costo Mesa + Suministros Solo Domicilio
    const totalDomiCost = costoMesa + deliveryOnlySuppliesCost;
    const costoDomi = totalDomiCost;

    const sellPriceNum = Number(sellPrice) || 0;
    const domesticPriceNum = Number(domesticPrice) || 0;

    const impoRate = taxPercentage / 100;

    // Dine-in Calculations (Mesa / Salón)
    // Utilidad Bruta Directa = PVP - Costo
    const mesaGrossProfit = sellPriceNum > 0 ? sellPriceNum - costoMesa : 0;
    const mesaGrossMarginPct = sellPriceNum > 0 ? (mesaGrossProfit / sellPriceNum) * 100 : 0;
    // Base Gravable = PVP / (1 + impoRate)
    const netMesaPVP = sellPriceNum > 0 ? sellPriceNum / (1 + impoRate) : 0;
    const mesaTaxAmount = sellPriceNum > 0 ? sellPriceNum - netMesaPVP : 0;
    // Utilidad Neta en Caja = Base Gravable - Costo
    const mesaUtility = sellPriceNum > 0 ? netMesaPVP - costoMesa : 0;
    const mesaMarginPct = netMesaPVP > 0 ? (mesaUtility / netMesaPVP) * 100 : 0;

    // Delivery Calculations (Domicilio)
    // Utilidad Bruta Directa = PVP Domi - Costo Domi
    const domiGrossProfit = domesticPriceNum > 0 ? domesticPriceNum - costoDomi : 0;
    const domiGrossMarginPct = domesticPriceNum > 0 ? (domiGrossProfit / domesticPriceNum) * 100 : 0;
    // Base Gravable = PVP Domi / (1 + impoRate)
    const netDomiPVP = domesticPriceNum > 0 ? domesticPriceNum / (1 + impoRate) : 0;
    const domiTaxAmount = domesticPriceNum > 0 ? domesticPriceNum - netDomiPVP : 0;
    // Utilidad Neta en Caja = Base Gravable - Costo Domi
    const domiUtility = domesticPriceNum > 0 ? netDomiPVP - costoDomi : 0;
    const domiMarginPct = netDomiPVP > 0 ? (domiUtility / netDomiPVP) * 100 : 0;

    // Check if margins fall below minimum permitted global setting (using rounded margins to match display)
    const isMesaCritical = sellPriceNum > 0 && Math.round(mesaMarginPct) < minUtilityMargin;
    const isDomiCritical = domesticPriceNum > 0 && Math.round(domiMarginPct) < minUtilityMargin;

    return {
      items: itemsDetails,
      rawIngredientsCost,
      operatingCost,
      errorMarginCost,
      dineInSuppliesCost,
      deliveryOnlySuppliesCost,
      packagingCost,
      totalProductionCost,
      costoMesa,
      totalDomiCost,
      costoDomi,
      sellPriceNum,
      domesticPriceNum,
      mesaGrossProfit,
      mesaGrossMarginPct,
      netMesaPVP,
      mesaTaxAmount,
      mesaUtility,
      mesaMarginPct,
      domiGrossProfit,
      domiGrossMarginPct,
      netDomiPVP,
      domiTaxAmount,
      domiUtility,
      domiMarginPct,
      isMesaCritical,
      isDomiCritical
    };
  }, [ingredients, inventoryItems, subRecipes, packaging, sellPrice, domesticPrice, minUtilityMargin, taxPercentage, safetyMarginPercentage, operationalCostPercentage, systemSettings]);

  // Ingredients handlers
  const addIngredient = (item: { id: string; name: string; type: 'item' | 'subrecipe'; unit: string }) => {
    const newId = `ing-${Date.now()}`;
    lastAddedIdRef.current = newId;
    setIngredients(prev => [
      ...prev,
      {
        id: newId,
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
  const resolveDefaultPackagingChannel = (item: any): 'dine_in' | 'delivery' => {
    const text = `${item.name || ''} ${item.category || ''} ${item.supplyCategory || ''}`.toLowerCase();
    // Mesa/Salón items: pitillos, palillos, servilletas, garnish, copero, mesa, etc.
    if (
      text.includes('pitillo') ||
      text.includes('palillo') ||
      text.includes('servilleta') ||
      text.includes('garnish') ||
      text.includes('copero') ||
      text.includes('mesa') ||
      text.includes('salon') ||
      text.includes('salón')
    ) {
      return 'dine_in';
    }
    // Default to 'delivery' (empaques, bolsas, cajas, desechables)
    return 'delivery';
  };

  const handleSelectPackagingItem = (item: any) => {
    if (packaging.some(p => p.item === item.name)) {
      toast.error('Este suministro ya ha sido agregado.');
      return;
    }
    const unitCost = Number(item.unitCostUsage || item.costoUnitarioReal || item.costoUnitarioBruto || item.purchaseCost || 0);
    const channel = resolveDefaultPackagingChannel(item);
    setPackaging([
      ...packaging,
      {
        item: item.name,
        quantity: 1,
        cost: unitCost,
        channel
      }
    ]);
    setPkgSearchQuery('');
    setShowPkgDropdown(false);
  };

  const handleUpdatePackagingChannel = (index: number, channel: 'dine_in' | 'delivery') => {
    setPackaging(packaging.map((pkg, idx) =>
      idx === index ? { ...pkg, channel } : pkg
    ));
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
      isStar: Boolean(isStar || calculationDetails.mesaMarginPct >= 60),
      bcgClassification: (isStar || calculationDetails.mesaMarginPct >= 60) ? 'ESTRELLA' : 'CABALLO_DE_BATALLA',
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
    <div className="p-8 space-y-8 transition-receitly font-sans text-content">

      {/* Header Bar */}
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
              {recipeId ? 'Editar Receta' : 'Crear Nueva Receta'}
            </h1>
          </div>
        </div>
      </div>

      {/* Critical Margins Warning alert */}
      {(calculationDetails.isMesaCritical || calculationDetails.isDomiCritical) && (
        <div className="p-4 bg-rose-500/10 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl flex gap-3 items-start border border-rose-500/20 shadow-sm animate-pulse">
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
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Nombre de la Receta</label>
                <Input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej. Hamburguesa Pícara"
                  className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Categoría</label>
                <CustomSelect
                  value={category}
                  onChange={setCategory}
                  options={menuCategories.map(cat => ({ value: cat, label: cat }))}
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Zona de Producción (KDS)</label>
                <CustomSelect
                  value={productionZone}
                  onChange={setProductionZone}
                  options={productionZones.map(pz => ({ value: pz, label: pz }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Tiempo de Prep (minutos)</label>
                <Input
                  type="number"
                  value={prepTime === 0 ? '' : prepTime}
                  onChange={e => setPrepTime(Number(e.target.value) || 0)}
                  placeholder="Ej. 15"
                  className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Dificultad</label>
                <CustomSelect
                  value={difficulty}
                  onChange={setDifficulty}
                  options={difficultyOptions}
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Consejo del Chef</label>
              <Textarea
                rows={3}
                value={chefAdvice}
                onChange={e => setChefAdvice(e.target.value)}
                placeholder="Describe sugerencias de montaje o trucos de cocina..."
                className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
              />
            </div>

            <div>
              <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Descripción</label>
              <Textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe brevemente el plato..."
                className="w-full rounded-lg border border-line bg-surface text-gray-900 dark:text-slate-100 px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition-colors"
              />
            </div>

            {/* Allergens selection multiselect */}
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-content-secondary block mb-1.5">Alérgenos</label>
              <div className="flex flex-wrap items-center gap-2">
                {allergens.map(al => (
                  <span
                    key={al}
                    className="bg-slate-100 dark:bg-[var(--card-color)] text-slate-700 dark:text-slate-200 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-line"
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
                    className="text-[var(--accent-purple)] hover:underline text-[10px] font-black flex items-center gap-1 cursor-pointer bg-slate-50 dark:bg-[var(--card-color)] px-2.5 py-1.5 rounded-xl border border-line transition-all text-content-secondary"
                  >
                    + Seleccionar Alérgeno
                  </button>

                  {showAllergensDropdown && (
                    <div className="absolute left-0 top-9 bg-surface border border-line rounded-xl shadow-xl p-2.5 w-56 z-40 space-y-1.5 animate-fade-in text-content">
                      <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
                        {dbAllergens.filter((a: string) => !allergens.includes(a)).map((all: string) => (
                          <button
                            key={all}
                            onClick={() => handleSelectAllergen(all)}
                            className="w-full text-left px-2 py-1.5 text-[10px] font-black hover:bg-slate-50 dark:hover:bg-raised rounded-md block truncate text-slate-700 dark:text-slate-200"
                          >
                            {all}
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-line pt-2 flex items-center gap-1">
                        <Input
                          type="text"
                          placeholder="Nuevo..."
                          value={newAllergen}
                          onChange={(e) => setNewAllergen(e.target.value)}
                          className="w-full border border-line rounded-md px-1.5 py-1 text-[9px] bg-slate-50 dark:bg-[var(--card-color)] outline-none text-content"
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
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-black text-content uppercase tracking-wider">Ingredientes y Subrecetas</h3>

              {/* Search input dropdown - full width w-full */}
              <div ref={ingredientSearchRef} className="relative w-full">
                <div className="flex items-center gap-2 bg-inset/40 border border-line px-3 py-2.5 rounded-lg w-full">
                  <span className="material-symbols-outlined text-xs text-content-secondary">search</span>
                  <Input
                    type="text"
                    placeholder="Agregar Ingrediente / Subreceta..."
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="bg-transparent border-none outline-none text-xs w-full font-semibold text-content shadow-none p-0 h-auto"
                  />
                </div>

                {/* Expanded Search Dropdown showing detailed columns - dark contrast */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-11 w-full max-h-60 overflow-y-auto bg-surface border border-line rounded-lg shadow-xl z-30 divide-y divide-gray-100 dark:divide-line text-content">
                    <div className="p-2.5 bg-inset text-[9px] font-black text-content-secondary uppercase tracking-wider grid grid-cols-12 gap-1 border-b border-line shrink-0">
                      <div className="col-span-5">Nombre</div>
                      <div className="col-span-3">Categoría</div>
                      <div className="col-span-2 text-right">Stock</div>
                      <div className="col-span-2 text-right">Unidad</div>
                    </div>
                    {searchResults.map(res => (
                      <button
                        key={res.id}
                        onClick={() => addIngredient(res)}
                        className="w-full text-left p-3 text-[11px] hover:bg-slate-50 dark:hover:bg-raised font-bold text-content grid grid-cols-12 gap-1 items-center transition-colors border-none"
                      >
                        <div className="col-span-5 truncate">{res.name}</div>
                        <div className="col-span-3 truncate text-content-secondary text-[10px]">{res.category}</div>
                        <div className="col-span-2 text-right text-content-secondary">{res.type === 'item' ? res.stock : '--'}</div>
                        <div className="col-span-2 text-right text-slate-400">{res.unit}</div>
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
                    <th className="p-3">Ingrediente / Subreceta</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3 text-center">Unidad</th>
                    <th className="p-3 text-right">Costo Real</th>
                    <th className="p-3 text-right">Costo Producción</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-line text-content-secondary">
                  {calculationDetails.items.map(ing => (
                    <tr key={ing.id}>
                      <td className="p-3 text-content font-bold">
                        <div className="flex flex-col">
                          <span>{ing.name}</span>
                          {ing.type === 'subrecipe' && (
                            <span className="text-[8px] font-black text-cyan-500 uppercase tracking-widest mt-0.5">Preparación Interna</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Input
                          ref={el => { quantityInputRefs.current[ing.id] = el; }}
                          type="number"
                          step="any"
                          value={ing.quantity}
                          onFocus={e => e.target.select()}
                          onClick={e => (e.target as HTMLInputElement).select()}
                          onChange={e => {
                            const raw = e.target.value.replace(',', '.');
                            const parsed = raw === '' ? 0 : parseFloat(raw);
                            updateQuantity(ing.id, isNaN(parsed) ? 0 : parsed);
                          }}
                          className="w-20 rounded-lg bg-surface border border-line p-1 text-center font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-content"
                        />
                      </td>
                      <td className="p-3 text-center text-slate-400">{ing.unit}</td>
                      <td className="p-3 text-right text-content">{formatCurrency(ing.unitCost)}</td>
                      <td className="p-3 text-right text-content font-bold">
                        {formatCurrency(ing.totalCost)}
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
              <span className="text-content font-black text-base">
                {formatCurrency(calculationDetails.rawIngredientsCost)}
              </span>
            </div>
          </div>

          {/* Suministros (Interactive Table from Inventory) */}
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <h3 className="text-sm font-black text-content uppercase tracking-wider">Suministros</h3>

            {/* Search Input Dropdown */}
            <div ref={packagingSearchRef} className="relative w-full">
              <div className="flex items-center gap-2 bg-inset/40 border border-line px-3 py-2.5 rounded-lg w-full">
                <span className="material-symbols-outlined text-xs text-content-secondary">search</span>
                <Input
                  type="text"
                  placeholder="Agregar Suministro (nombre o SKU)..."
                  value={pkgSearchQuery}
                  onChange={e => {
                    setPkgSearchQuery(e.target.value);
                    setShowPkgDropdown(true);
                  }}
                  onFocus={() => setShowPkgDropdown(true)}
                  className="bg-transparent border-none outline-none text-xs w-full font-semibold text-content shadow-none p-0 h-auto"
                />
              </div>

              {/* Dropdown flotante con z-[100] */}
              {showPkgDropdown && filteredPkgItems.length > 0 && (
                <div className="absolute left-0 right-0 top-11 w-full max-h-60 overflow-y-auto bg-surface border border-line rounded-lg shadow-2xl z-[100] divide-y divide-gray-100 dark:divide-line text-content">
                  <div className="p-2.5 bg-inset text-[9px] font-black text-content-secondary uppercase tracking-wider grid grid-cols-12 gap-1 border-b border-line shrink-0">
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
                      className="w-full text-left p-3 text-[11px] hover:bg-slate-50 dark:hover:bg-raised font-bold text-content grid grid-cols-12 gap-1 items-center transition-colors border-none cursor-pointer"
                    >
                      <div className="col-span-5 truncate">{res.name}</div>
                      <div className="col-span-3 truncate text-content-secondary text-[10px]">{res.category}</div>
                      <div className="col-span-2 text-right text-content-secondary">${res.purchaseCost.toLocaleString('es-CO')}</div>
                      <div className="col-span-2 text-right text-slate-400">{res.realPhysicalStock}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scroll responsivo */}
            <div className="overflow-x-auto w-full border border-line rounded-lg">
              <table className="w-full text-left text-xs font-semibold min-w-[650px]">
                <thead>
                  <tr className="border-b border-line text-[9px] font-black text-content-tertiary uppercase tracking-wider bg-inset">
                    <th className="p-3">Ítem de Suministro (Desde Inventario)</th>
                    <th className="p-3 text-center w-36">Canal Destino</th>
                    <th className="p-3 text-center w-24">Cantidad</th>
                    <th className="p-3 text-right w-28">Costo Unitario</th>
                    <th className="p-3 text-right w-28">Costo Total</th>
                    <th className="p-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-line text-content-secondary">
                  {packaging.map((pkg, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-raised/30 transition-colors">
                      <td className="p-3 text-content font-bold">
                        <div>{pkg.item}</div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {pkg.channel === 'dine_in' ? 'Se suma a producción Mesa y Domicilio' : 'Exclusivo para Domicilio / Empaque'}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex rounded-lg p-0.5 bg-raised border border-line">
                          <button
                            type="button"
                            onClick={() => handleUpdatePackagingChannel(index, 'dine_in')}
                            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer border-none ${pkg.channel === 'dine_in'
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'text-content-secondary hover:text-slate-900 dark:hover:text-white bg-transparent'
                              }`}
                            title="Salón / Mesa (se suma a Costo Mesa y Domicilio)"
                          >
                            <span className="material-symbols-outlined text-xs">table_restaurant</span>
                            Mesa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePackagingChannel(index, 'delivery')}
                            className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer border-none ${pkg.channel !== 'dine_in'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-content-secondary hover:text-slate-900 dark:hover:text-white bg-transparent'
                              }`}
                            title="Solo Domicilio / Empaque (se suma ÚNICAMENTE a Domicilio)"
                          >
                            <span className="material-symbols-outlined text-xs">two_wheeler</span>
                            Domi
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Input
                          type="number"
                          value={pkg.quantity}
                          onChange={(e) => handleUpdatePackagingQty(index, Number(e.target.value) || 0)}
                          className="w-16 rounded-lg bg-surface border border-line p-1 text-center font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-content"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <Input
                          type="number"
                          value={pkg.cost}
                          onChange={(e) => handleUpdatePackagingCost(index, Number(e.target.value) || 0)}
                          className="w-20 rounded-lg bg-surface border border-line p-1 text-right font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-content"
                        />
                      </td>
                      <td className="p-3 text-right text-content font-bold font-mono">
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
                      <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-500">
                        No hay suministros seleccionados. Utilice la barra de búsqueda de arriba.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-line space-y-2 text-xs font-semibold">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block"></span>
                  Suministros Salón / Mesa
                </span>
                <span className="text-content font-bold font-mono">
                  ${calculationDetails.dineInSuppliesCost.toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>
                  Suministros Solo Domicilio
                </span>
                <span className="text-content font-bold font-mono">
                  ${calculationDetails.deliveryOnlySuppliesCost.toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-line font-bold">
                <span className="text-[10px] font-black uppercase tracking-wider text-content-secondary">
                  Total Suministros
                </span>
                <span className="text-content font-black font-mono">
                  ${calculationDetails.packagingCost.toLocaleString('es-CO')}
                </span>
              </div>
            </div>
          </div>

          {/* Pasos de Preparación */}
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-4">
            <h3 className="text-sm font-black text-content uppercase tracking-wider">Pasos de Preparación</h3>

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-[var(--card-color)] text-slate-1000 dark:text-slate-400 font-bold text-xs flex items-center justify-center shrink-0 mt-1">{idx + 1}</span>
                  <Input
                    type="text"
                    value={step}
                    onChange={(e) => handleUpdateStep(idx, e.target.value)}
                    className="w-full border-none border-b border-line dark:bg-surface p-1 text-xs text-content-secondary outline-none focus:border-[var(--accent-purple)] text-content"
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
                <Textarea
                  rows={2}
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  placeholder="Agregar nuevo paso de preparación dinámico..."
                  className="w-full border border-dashed border-slate-200 dark:border-slate-750 rounded-lg p-3 text-xs outline-none text-content-secondary dark:bg-[var(--card-color)]"
                />
                <button
                  onClick={handleAddStep}
                  className="px-4 py-2.5 bg-raised hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors self-end cursor-pointer"
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
          <div className="bg-white border border-line text-slate-900 shadow-sm dark:bg-surface dark:text-white p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider pb-2 border-b border-line">Configuración de Precios</h3>

            <div>
              <label className="text-[10px] font-black uppercase text-content-secondary block mb-1">
                PVP (Punto de Venta Mesa)
              </label>
              <PriceInput
                value={sellPrice}
                onChange={setSellPrice}
                placeholder="Ej. 32900"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-content-secondary block mb-1">
                Precio Domicilio
              </label>
              <PriceInput
                value={domesticPrice}
                onChange={setDomesticPrice}
                placeholder="Ej. 35900"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">
                  {taxPercentage === 0 ? 'Régimen' : 'Impoconsumo'}
                </label>
                <div className={`rounded-lg p-2 text-center text-[10px] font-black border ${
                  taxPercentage === 0
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                    : 'bg-inset border-line text-content'
                }`}>
                  {taxPercentage === 0 ? 'EXENTO / NO RESPONSABLE' : `${taxPercentage}%`}
                </div>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Margen Error</label>
                <div className="bg-inset rounded-lg p-2 text-center text-[10px] font-black border border-line text-content">
                  {safetyMarginPercentage}%
                </div>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 block mb-1">Costo Oper.</label>
                <div className="bg-inset rounded-lg p-2 text-center text-[10px] font-black border border-line text-content">
                  {operationalCostPercentage}%
                </div>
              </div>
            </div>
          </div>

          {/* Análisis MESA vs DOMI */}
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-line space-y-5">
            <h3 className="text-sm font-black text-content uppercase tracking-wider pb-2 border-b border-line">
              Análisis costo MESA y DOMILICIO
            </h3>

            <div className="space-y-3 font-semibold text-xs text-slate-500">
              <div className="flex justify-between items-center">
                <span>Costo Total Ingredientes</span>
                <span className="font-bold text-content">${calculationDetails.rawIngredientsCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Costo Operativo ({operationalCostPercentage}%)</span>
                <span className="font-bold text-content">${calculationDetails.operatingCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Margen de Error ({safetyMarginPercentage}%)</span>
                <span className="font-bold text-content">${calculationDetails.errorMarginCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-indigo-600 dark:text-indigo-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Suministros Salón / Mesa
                </span>
                <span className="font-bold font-mono">+${calculationDetails.dineInSuppliesCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>

              <div className="flex justify-between items-center pt-2.5 pb-1 border-t border-line">
                <span className="font-black text-content">COSTO MESA (PRODUCCIÓN)</span>
                <span className="text-sm font-black text-content font-mono">${calculationDetails.costoMesa.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>

              <div className="flex justify-between items-center text-purple-600 dark:text-purple-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  Suministros Solo Domicilio
                </span>
                <span className="font-bold font-mono">+${calculationDetails.deliveryOnlySuppliesCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-line">
                <span className="font-black text-purple-700 dark:text-purple-300">COSTO TOTAL DOMICILIO</span>
                <span className="text-sm font-black text-purple-700 dark:text-purple-300 font-mono">${calculationDetails.costoDomi.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            {/* Profits comparison progress cards */}
            <div className="space-y-3.5 pt-2">

              {/* Mesa */}
              <div className={`p-3.5 rounded-xl border transition-all ${calculationDetails.isMesaCritical
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                : 'bg-cyan-50/60 dark:bg-cyan-950/20 border-cyan-100 dark:border-cyan-900/40 text-content'
                }`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-cyan-600 dark:text-cyan-400">table_restaurant</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-content">
                      Utilidad Mesa (Salón)
                    </span>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                    calculationDetails.isMesaCritical
                      ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                      : 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-300'
                  }`}>
                    {taxPercentage === 0 
                      ? `${calculationDetails.mesaMarginPct.toFixed(1)}% Bruto`
                      : `${Math.round(calculationDetails.mesaMarginPct)}% Neto`}
                  </span>
                </div>

                {/* Utilidad Bruta Directa */}
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-[10px] font-semibold text-content-secondary">
                    Utilidad Bruta Directa <span className="text-[9px] text-slate-400 font-normal">(PVP − Costo)</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-content-secondary text-xs">
                    ${calculationDetails.mesaGrossProfit.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
                  </span>
                </div>

                {/* Utilidad Neta en Caja / Bruta */}
                <div className="flex justify-between items-center text-xs py-1.5 border-t border-cyan-200/50 dark:border-cyan-900/30">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-tight text-content">
                      {taxPercentage === 0 ? 'Utilidad Bruta Mesa' : 'Utilidad Neta en Caja'}
                    </span>
                    <span className="text-[8.5px] text-slate-400 font-medium">
                      {taxPercentage === 0 ? 'PVP − Costo (Sin Impuesto)' : 'Base Gravable − Costo'}
                    </span>
                  </div>
                  <span className={`text-sm font-black font-mono tabular-nums tracking-tight ${
                    calculationDetails.isMesaCritical ? 'text-rose-600 dark:text-rose-400' : 'text-cyan-600 dark:text-cyan-400'
                  }`}>
                    ${calculationDetails.mesaUtility.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
                  </span>
                </div>

                <div className="h-1.5 w-full bg-slate-200/60 dark:bg-raised rounded-full overflow-hidden my-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${calculationDetails.isMesaCritical ? 'bg-rose-500' : 'bg-cyan-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, calculationDetails.mesaMarginPct))}%` }}
                  ></div>
                </div>

                {/* Microtexto / Tooltip explicativo */}
                <div
                  className="flex items-center gap-1 pt-1.5 border-t border-cyan-200/40 dark:border-cyan-900/30 text-[9.5px] font-medium text-content-secondary"
                  title={taxPercentage === 0 
                    ? "Régimen No Responsable: no se deduce Impoconsumo ante la DIAN. La totalidad del PVP queda en caja antes de costos."
                    : "Deducido 8% Impoconsumo recaudado en PVP que se transfiere a la DIAN. La Utilidad Neta en Caja refleja el margen real en el punto de venta."}
                >
                  <span className="material-symbols-outlined text-[13px] text-cyan-600 dark:text-cyan-400 shrink-0">
                    {taxPercentage === 0 ? 'verified' : 'info'}
                  </span>
                  <span>
                    {taxPercentage === 0 
                      ? 'MARGEN BRUTO (Sin deducción de impuesto)'
                      : `Deducido ${taxPercentage}% Impoconsumo ($${calculationDetails.mesaTaxAmount.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a la DIAN)`}
                  </span>
                </div>
              </div>

              {/* Domicilio */}
              <div className={`p-3.5 rounded-xl border transition-all ${calculationDetails.isDomiCritical
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                : 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/40 text-content'
                }`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-purple-600 dark:text-purple-400">two_wheeler</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-content">
                      Utilidad Domicilio
                    </span>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                    calculationDetails.isDomiCritical
                      ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                      : 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                  }`}>
                    {taxPercentage === 0 
                      ? `${calculationDetails.domiMarginPct.toFixed(1)}% Bruto`
                      : `${Math.round(calculationDetails.domiMarginPct)}% Neto`}
                  </span>
                </div>

                {/* Utilidad Bruta Directa */}
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-[10px] font-semibold text-content-secondary">
                    Utilidad Bruta Directa <span className="text-[9px] text-slate-400 font-normal">(PVP − Costo)</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-content-secondary text-xs">
                    ${calculationDetails.domiGrossProfit.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
                  </span>
                </div>

                {/* Utilidad Neta en Caja / Bruta */}
                <div className="flex justify-between items-center text-xs py-1.5 border-t border-purple-200/50 dark:border-purple-900/30">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-tight text-content">
                      {taxPercentage === 0 ? 'Utilidad Bruta Domicilio' : 'Utilidad Neta en Caja'}
                    </span>
                    <span className="text-[8.5px] text-slate-400 font-medium">
                      {taxPercentage === 0 ? 'PVP Domi − Costo Domi' : 'Base Gravable − Costo'}
                    </span>
                  </div>
                  <span className={`text-sm font-black font-mono tabular-nums tracking-tight ${
                    calculationDetails.isDomiCritical ? 'text-rose-600 dark:text-rose-400' : 'text-purple-600 dark:text-purple-400'
                  }`}>
                    ${calculationDetails.domiUtility.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
                  </span>
                </div>

                <div className="h-1.5 w-full bg-slate-200/60 dark:bg-raised rounded-full overflow-hidden my-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${calculationDetails.isDomiCritical ? 'bg-rose-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, calculationDetails.domiMarginPct))}%` }}
                  ></div>
                </div>

                {/* Microtexto / Tooltip explicativo */}
                <div
                  className="flex items-center gap-1 pt-1.5 border-t border-purple-200/40 dark:border-purple-900/30 text-[9.5px] font-medium text-content-secondary"
                  title={taxPercentage === 0
                    ? "Régimen No Responsable: sin deducción de Impoconsumo, contempla los suministros exclusivos de entrega."
                    : "Deduce el Impoconsumo correspondiente a la DIAN y contempla los suministros y empaques exclusivos para entrega a domicilio."}
                >
                  <span className="material-symbols-outlined text-[13px] text-purple-600 dark:text-purple-400 shrink-0">
                    {taxPercentage === 0 ? 'verified' : 'info'}
                  </span>
                  <span>
                    {taxPercentage === 0 
                      ? 'MARGEN BRUTO (Sin deducción de impuesto) + Suministros Domicilio'
                      : `Deducido ${taxPercentage}% Impoconsumo (${calculationDetails.domiTaxAmount.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) + Suministros Domicilio`}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Configuration Panel */}
          <div className="bg-surface border border-line shadow-sm rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-content flex items-center gap-2 pb-2 border-b border-line uppercase tracking-wider">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">settings</span>
              Configuración y Parámetros
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-extrabold uppercase text-slate-505">¿Activo en FoodiePOS?</span>
              <button
                type="button"
                onClick={() => setActivoCatalogo(!activo_catalogo)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${activo_catalogo ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-surface'}`}
              >
                <div className={`bg-white h-4 w-4 rounded-full shadow-md transform transition-transform duration-300 ${activo_catalogo ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-line">
              <span className="text-[9px] font-extrabold uppercase text-slate-505">Visible en Tienda Online</span>
              <button
                type="button"
                onClick={() => setVisibleTiendaOnline(!visible_tienda_online)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${visible_tienda_online ? 'bg-[var(--accent-purple)]' : 'bg-slate-300 dark:bg-surface'}`}
              >
                <div className={`bg-white h-4 w-4 rounded-full shadow transform transition-transform duration-300 ${visible_tienda_online ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-line">
              <span className="text-[9px] font-extrabold uppercase text-slate-505 flex items-center gap-1.5">
                <span className="text-amber-500">⭐</span> Plato Estrella (BCG)
              </span>
              <button
                type="button"
                onClick={() => setIsStar(!isStar)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none border-none cursor-pointer ${isStar ? 'bg-amber-500' : 'bg-slate-300 dark:bg-surface'}`}
              >
                <div className={`bg-white h-4 w-4 rounded-full shadow transform transition-transform duration-300 ${isStar ? 'translate-x-4' : 'translate-x-0'}`}></div>
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

      <DiscardChangesModal
        isOpen={showDiscardModal}
        onContinueEditing={cancelExit}
        onDiscardAndExit={confirmExit}
        onConfirm={confirmExit}
        onCancel={cancelExit}
      />

      <FormActionsBar>
        {recipeId && (
          <button
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm md:text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[44px] border-none"
          >
            <span className="material-symbols-outlined text-base md:text-sm">delete</span>
            Eliminar
          </button>
        )}
        <button
          onClick={handleSaveRecipe}
          className="px-5 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-sm md:text-xs font-bold rounded-xl shadow-md shadow-[var(--accent-pink)]/15 cursor-pointer flex items-center gap-1.5 shrink-0 border-none active:scale-95 transition-all min-h-[44px]"
        >
          <span className="material-symbols-outlined text-base md:text-sm">save</span>
          {recipeId ? 'Actualizar Receta' : 'Crear Receta'}
        </button>
      </FormActionsBar>
    </div>
  );
}
