import { useState, useMemo, useEffect, useRef } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe } from '../types';
import ImageUploader from './ImageUploader';
import { toast } from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

interface ComboFormProps {
  onCancel: () => void;
  onSaved: () => void;
  comboId?: string | null;
}

export default function ComboForm({ onCancel, onSaved, comboId }: ComboFormProps) {
  // DB queries
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const dbSupplyCategories = useLiveQuery(() => db.supplyCategories.toArray()) || [];

  const existingCombo = useLiveQuery(async () => {
    if (!comboId) return null;
    return await db.recipes.get(comboId);
  }, [comboId]);

  // Load system settings
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const taxPercentage = systemSettings['taxPercentage'] !== undefined ? Number(systemSettings['taxPercentage']) : 8;
  const minUtilityMargin = systemSettings['min_utility_margin'] !== undefined ? Number(systemSettings['min_utility_margin']) : 35;

  // Menu Categories list EXCLUSIVELY from IndexedDB
  const dbMenuCategories = useLiveQuery(() => db.menuCategories.toArray()) || [];
  const menuCategories = useMemo(() => {
    return dbMenuCategories.map(c => c.name);
  }, [dbMenuCategories]);

  // Combo states
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('Combos');
  const [description, setDescription] = useState<string>('');
  const [image, setImage] = useState<string>('');
  
  // Financial prices (Mesa and Domicilio)
  const [sellPrice, setSellPrice] = useState<number | ''>(''); 
  const [domesticPrice, setDomesticPrice] = useState<number | ''>(''); 

  // Combo items list
  const [comboItems, setComboItems] = useState<Array<{
    id: string; // References Recipe.id or InventoryItem.id
    type: 'recipe' | 'item';
    quantity: number;
  }>>([]);

  // Packaging and disposables state (same as in recipeForm.tsx)
  const [packaging, setPackaging] = useState<Array<{
    item: string;
    quantity: number;
    cost: number;
  }>>([]);

  // Search refs for click outside
  const ingredientSearchRef = useRef<HTMLDivElement>(null);
  const packagingSearchRef = useRef<HTMLDivElement>(null);

  // Packaging search and selection states
  const [pkgSearchQuery, setPkgSearchQuery] = useState<string>('');
  const [showPkgDropdown, setShowPkgDropdown] = useState<boolean>(false);

  // Search selector states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

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

  // Dynamic selector for categories dropdown (merges active category with menu categories)
  const categoryOptions = useMemo(() => {
    const unique = Array.from(new Set([category, ...menuCategories])).filter(Boolean);
    return unique;
  }, [category, menuCategories]);

  // Load combo if editing
  useEffect(() => {
    if (existingCombo) {
      setName(existingCombo.name);
      setDescription(existingCombo.description || '');
      setCategory(existingCombo.category);
      setSellPrice(existingCombo.sellPrice || '');
      setDomesticPrice(existingCombo.domesticPrice || '');
      setImage(existingCombo.img || '');
      if (existingCombo.comboItems) {
        setComboItems(existingCombo.comboItems);
      }
      if (existingCombo.packaging) {
        setPackaging(existingCombo.packaging);
      }
    }
  }, [existingCombo]);

  // Combined search results
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();

    // Match Recipes (exclude combos and subrecipes)
    const matchedRecipes = recipes
      .filter(r => !r.isSubRecipe && !r.isCombo && r.name.toLowerCase().includes(q))
      .map(r => ({
        id: r.id,
        name: r.name,
        type: 'recipe' as const,
        cost: r.costPrice,
        price: r.sellPrice,
        category: r.category,
        img: r.img || ''
      }));

    // Match InventoryItems (only unique products starting with 'ins-prd')
    const matchedItems = inventoryItems
      .filter(item => item.id.startsWith('ins-prd') && 
                      item.name.toLowerCase().includes(q))
      .map(item => ({
        id: item.id,
        name: item.name,
        type: 'item' as const,
        cost: item.purchaseCost,
        price: item.purchaseCost * (1 + (item.gainPercentage || 100) / 100), // estimated PVP
        category: item.category,
        img: ''
      }));

    return [...matchedRecipes, ...matchedItems].filter(res => 
      !comboItems.some(ci => ci.id === res.id)
    );
  }, [searchQuery, recipes, inventoryItems, comboItems]);

  // Consolidated Financial Costing & Profit equations
  const calculationDetails = useMemo(() => {
    let originalCostSum = 0;
    let originalPvpSum = 0;
    
    const itemsDetails = comboItems.map(ci => {
      let nameStr = ci.id;
      let costUnit = 0;
      let priceUnit = 0;
      let categoryStr = '';
      let imgStr = '';

      if (ci.type === 'recipe') {
        const rec = recipes.find(r => r.id === ci.id);
        if (rec) {
          nameStr = rec.name;
          costUnit = rec.costPrice || 0;
          priceUnit = rec.sellPrice || 0;
          categoryStr = rec.category;
          imgStr = rec.img || '';
        }
      } else {
        const item = inventoryItems.find(i => i.id === ci.id);
        if (item) {
          nameStr = item.name;
          costUnit = item.purchaseCost || 0;
          priceUnit = item.purchaseCost * (1 + (item.gainPercentage || 100) / 100);
          categoryStr = item.category;
          imgStr = '';
        }
      }

      const totalCost = costUnit * ci.quantity;
      const totalPVP = priceUnit * ci.quantity;
      originalCostSum += totalCost;
      originalPvpSum += totalPVP;

      return {
        ...ci,
        name: nameStr,
        costUnit,
        priceUnit,
        totalCost,
        totalPVP,
        category: categoryStr,
        img: imgStr
      };
    });

    const sellPriceNum = Number(sellPrice) || 0;
    const domesticPriceNum = Number(domesticPrice) || 0;

    // Deduct tax (impoconsumo)
    const ipoconsumoMesa = sellPriceNum - (sellPriceNum / (1 + (taxPercentage / 100)));
    const ipoconsumoDomi = domesticPriceNum - (domesticPriceNum / (1 + (taxPercentage / 100)));

    const netMesaPVP = sellPriceNum - ipoconsumoMesa;
    const netDomiPVP = domesticPriceNum - ipoconsumoDomi;

    // Packaging Cost sum
    const packagingCost = packaging.reduce((sum, pkg) => sum + (pkg.cost * pkg.quantity), 0);

    // Utilities based on strict direct equations:
    // GrossProfit_Mesa = PVP_Mesa - Ipoconsumo_Calculado - Costo_Total_Productos_Incluidos
    const mesaUtility = sellPriceNum - ipoconsumoMesa - originalCostSum;
    
    // GrossProfit_Domi = PVP_Domicilio - Ipoconsumo_Calculado - (Costo_Total_Productos_Incluidos + Costo_Total_Empaques)
    const domiUtility = domesticPriceNum - ipoconsumoDomi - (originalCostSum + packagingCost);

    // Margins divided by net price (PVP minus Ipoconsumo)
    const mesaMarginPct = netMesaPVP > 0 ? (mesaUtility / netMesaPVP) * 100 : 0;
    const domiMarginPct = netDomiPVP > 0 ? (domiUtility / netDomiPVP) * 100 : 0;

    const isMesaCritical = sellPriceNum > 0 && Math.round(mesaMarginPct) < minUtilityMargin;
    const isDomiCritical = domesticPriceNum > 0 && Math.round(domiMarginPct) < minUtilityMargin;

    return {
      items: itemsDetails,
      originalCostSum,
      originalPvpSum,
      ipoconsumoMesa,
      ipoconsumoDomi,
      netMesaPVP,
      netDomiPVP,
      packagingCost,
      mesaUtility,
      domiUtility,
      mesaMarginPct,
      domiMarginPct,
      isMesaCritical,
      isDomiCritical
    };
  }, [comboItems, recipes, inventoryItems, sellPrice, domesticPrice, taxPercentage, minUtilityMargin, packaging]);

  // Consolidated recursive inventory impact
  const inventoryImpact = useMemo(() => {
    const rawItems: Record<string, { name: string; quantity: number; unit: string; currentStock: number; limit: number }> = {};
    const packagingItems: Record<string, { name: string; quantity: number; unit: string; currentStock: number; limit: number }> = {};

    function resolveRecipeIngredients(recId: string, qtyMultiplier: number) {
      const rec = recipes.find(r => r.id === recId);
      if (!rec) return;

      // ingredients
      if (rec.ingredients) {
        for (const ing of rec.ingredients) {
          if (ing.type === 'item') {
            const item = inventoryItems.find(i => i.id === ing.inventoryItemId);
            if (item) {
              const totalQty = ing.quantity * qtyMultiplier;
              if (rawItems[item.id]) {
                rawItems[item.id].quantity += totalQty;
              } else {
                rawItems[item.id] = {
                  name: item.name,
                  quantity: totalQty,
                  unit: item.countUnit || ing.unit,
                  currentStock: item.realPhysicalStock,
                  limit: item.stockMinLimit || 0
                };
              }
            }
          } else if (ing.type === 'subrecipe') {
            resolveRecipeIngredients(ing.inventoryItemId, ing.quantity * qtyMultiplier);
          }
        }
      }

      // packaging
      if (rec.packaging) {
        for (const pkg of rec.packaging) {
          const item = inventoryItems.find(i => i.name === pkg.item);
          const itemId = item ? item.id : `pkg-${pkg.item}`;
          const totalQty = pkg.quantity * qtyMultiplier;
          if (packagingItems[itemId]) {
            packagingItems[itemId].quantity += totalQty;
          } else {
            packagingItems[itemId] = {
              name: pkg.item,
              quantity: totalQty,
              unit: item ? item.countUnit : 'un',
              currentStock: item ? item.realPhysicalStock : 0,
              limit: item ? item.stockMinLimit : 0
            };
          }
        }
      }
    }

    for (const comboItem of comboItems) {
      if (comboItem.type === 'recipe') {
        resolveRecipeIngredients(comboItem.id, comboItem.quantity);
      } else {
        const item = inventoryItems.find(i => i.id === comboItem.id);
        if (item) {
          if (rawItems[item.id]) {
            rawItems[item.id].quantity += comboItem.quantity;
          } else {
            rawItems[item.id] = {
              name: item.name,
              quantity: comboItem.quantity,
              unit: item.countUnit || 'unidad',
              currentStock: item.realPhysicalStock,
              limit: item.stockMinLimit || 0
            };
          }
        }
      }
    }

    // Add direct combo packaging items to the consolidated list
    for (const pkg of packaging) {
      const item = inventoryItems.find(i => i.name === pkg.item);
      const itemId = item ? item.id : `pkg-${pkg.item}`;
      const totalQty = pkg.quantity;
      if (packagingItems[itemId]) {
        packagingItems[itemId].quantity += totalQty;
      } else {
        packagingItems[itemId] = {
          name: pkg.item,
          quantity: totalQty,
          unit: item ? item.countUnit : 'un',
          currentStock: item ? item.realPhysicalStock : 0,
          limit: item ? item.stockMinLimit : 0
        };
      }
    }

    return {
      rawIngredients: Object.values(rawItems),
      packaging: Object.values(packagingItems)
    };
  }, [comboItems, recipes, inventoryItems, packaging]);

  // Actions
  const handleAddItem = (item: { id: string; type: 'recipe' | 'item' }) => {
    setComboItems([
      ...comboItems,
      { id: item.id, type: item.type, quantity: 1 }
    ]);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleRemoveItem = (id: string) => {
    setComboItems(comboItems.filter(ci => ci.id !== id));
  };

  const handleUpdateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setComboItems(comboItems.map(ci => 
      ci.id === id ? { ...ci, quantity: qty } : ci
    ));
  };

  // Packaging Handlers (identical to recipeForm.tsx)
  const filteredPkgItems = useMemo(() => {
    const q = pkgSearchQuery.toLowerCase().trim();
    if (!q) return [];
    return packagingInventoryItems.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.id.toLowerCase().includes(q)
    );
  }, [pkgSearchQuery, packagingInventoryItems]);

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

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Por favor ingresa un nombre para el combo');
      return;
    }
    if (comboItems.length === 0) {
      toast.error('Debe incluir al menos un producto o plato en el combo');
      return;
    }

    const sellPriceNum = Number(sellPrice) || 0;
    const domesticPriceNum = Number(domesticPrice) || 0;

    const comboData: Recipe = {
      id: comboId || `combo-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      category,
      sellPrice: sellPriceNum,
      domesticPrice: domesticPriceNum,
      costPrice: calculationDetails.originalCostSum,
      yieldFactor: 1.0,
      isSubRecipe: false,
      isCombo: true,
      ingredients: [], // Resolved dynamically via comboItems
      comboItems: comboItems.map(ci => ({
        id: ci.id,
        type: ci.type,
        quantity: ci.quantity
      })),
      packaging: packaging.map(pkg => ({
        item: pkg.item,
        quantity: pkg.quantity,
        cost: pkg.cost
      })),
      img: image,
      updatedAt: new Date().toISOString()
    };

    try {
      await db.recipes.put(comboData);
      toast.success(`Combo "${name}" guardado exitosamente.`);
      onSaved();
    } catch (err) {
      console.error('Failed to save combo:', err);
      toast.error('Error al guardar el combo en la base de datos.');
    }
  };

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-slate-800 dark:text-slate-200">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white flex items-center justify-center p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
              {comboId ? 'Editar Combo' : 'Crear Nuevo Combo'}
            </h1>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          className="px-5 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-xs font-bold rounded-xl shadow-md shadow-[var(--accent-pink)]/15 cursor-pointer flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">save</span>
          {comboId ? 'Actualizar Combo' : 'Crear Combo'}
        </button>
      </div>

      {/* Profit Margin Alert Box */}
      {(calculationDetails.isMesaCritical || calculationDetails.isDomiCritical) && (
        <div className="p-4 bg-rose-550/10 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-3 items-start border border-rose-500/20 shadow-sm animate-pulse">
          <span className="material-symbols-outlined text-lg shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          <div className="text-xs">
            <span className="font-black block uppercase tracking-wider mb-1">Requiere revisión de costos</span>
            <p className="font-semibold">
              El margen esperado para Mesa ({Math.round(calculationDetails.mesaMarginPct)}%) o Domicilio ({Math.round(calculationDetails.domiMarginPct)}%) está por debajo del mínimo permitido de <strong>{minUtilityMargin}%</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (Forms & Table Selections) */}
        <div className="lg:col-span-8 space-y-6 w-full min-w-0">
          
          {/* 1. Información Básica */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">info</span>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Información Básica</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Nombre del Combo</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej. Super Pack Familiar"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--card-color)] text-slate-900 dark:text-white p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/20"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Categoría</label>
                <CustomSelect 
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions.map(cat => ({ value: cat, label: cat }))}
                  className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">Descripción del Combo</label>
              <textarea 
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe los beneficios y qué incluye este combo para tus clientes..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[var(--card-color)] text-slate-900 dark:text-white p-2.5 text-xs outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/20"
              />
            </div>
          </div>

          {/* 2. Productos Incluidos */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">restaurant_menu</span>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Productos Incluidos</h3>
              </div>
              {/* Search selector */}
              <div ref={ingredientSearchRef} className="relative flex-1 max-w-md shrink-0">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
                  <span className="material-symbols-outlined text-xs text-slate-500">search</span>
                  <input 
                    type="text" 
                    placeholder="Buscar plato o bebida..." 
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="bg-transparent border-none outline-none text-xs w-full text-slate-800 dark:text-slate-200 font-semibold"
                  />
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute right-0 top-10 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 divide-y divide-slate-100 dark:divide-slate-800">
                    {searchResults.map(res => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => handleAddItem(res)}
                        className="w-full text-left p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 flex justify-between items-center cursor-pointer"
                      >
                        <div className="truncate pr-2">
                          <span className="block truncate">{res.name}</span>
                          <span className="text-[9px] text-slate-400 block tracking-wider uppercase">{res.category} ({res.type === 'recipe' ? 'Plato' : 'Insumo'})</span>
                        </div>
                        <span className="text-slate-500 text-[10px] shrink-0 font-bold">${res.price.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto w-full border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs font-semibold min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50">
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-center">Costo Unit.</th>
                    <th className="p-3 text-center">PVP Unit.</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3 text-right">Subtotal Costo</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-650 dark:text-slate-350">
                  {calculationDetails.items.map(ci => (
                    <tr key={ci.id}>
                      <td className="p-3 flex items-center gap-2">
                        {ci.img ? (
                          <img 
                            src={ci.img} 
                            alt={ci.name} 
                            className="w-8 h-8 rounded-lg object-cover bg-slate-100 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 shrink-0" 
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[var(--card-color)] flex items-center justify-center text-slate-400 shrink-0">
                            <span className="material-symbols-outlined text-sm">restaurant</span>
                          </div>
                        )}
                        <div className="truncate">
                          <span className="font-bold text-slate-900 dark:text-white block truncate">{ci.name}</span>
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{ci.category}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">${ci.costUnit.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                      <td className="p-3 text-center text-slate-500">${ci.priceUnit.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            type="button"
                            onClick={() => handleUpdateQty(ci.id, ci.quantity - 1)}
                            className="w-5 h-5 rounded-md bg-slate-100 dark:bg-[var(--card-color)] flex items-center justify-center font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="font-bold w-6 text-center text-slate-900 dark:text-white">{ci.quantity}</span>
                          <button 
                            type="button"
                            onClick={() => handleUpdateQty(ci.id, ci.quantity + 1)}
                            className="w-5 h-5 rounded-md bg-slate-100 dark:bg-[var(--card-color)] flex items-center justify-center font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-right text-slate-900 dark:text-white font-bold">
                        ${ci.totalCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          type="button"
                          onClick={() => handleRemoveItem(ci.id)}
                          className="text-rose-500 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {comboItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-500">
                        No hay productos agregados. Utiliza el buscador para añadir platos o bebidas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Costo Consolidado</span>
              <span className="text-slate-900 dark:text-white font-black text-base">
                ${calculationDetails.originalCostSum.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
              </span>
            </div>
            
            <button 
              type="button"
              onClick={() => {
                const el = document.querySelector('input[placeholder="Buscar plato o bebida..."]');
                if (el) (el as HTMLInputElement).focus();
              }}
              className="text-[var(--accent-purple)] hover:text-[var(--accent-purple)]/90 text-xs font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              + Añadir otro producto
            </button>
          </div>

          {/* 3. Suministros de Domicilio (Reubicado e idéntico a Recetas) */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 pb-1">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">inventory_2</span>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Suministros de Domicilio</h3>
            </div>
            
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
            
            <div className="overflow-x-auto w-full border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs font-semibold min-w-[500px]">
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
                          className="w-16 rounded-md bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 p-1 text-center font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-800 dark:text-white text-xs"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          value={pkg.cost}
                          onChange={(e) => handleUpdatePackagingCost(index, Number(e.target.value) || 0)}
                          className="w-20 rounded-md bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-700 p-1 text-right font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-slate-800 dark:text-white text-xs"
                        />
                      </td>
                      <td className="p-3 text-right text-slate-900 dark:text-white font-bold">
                        ${(pkg.cost * pkg.quantity).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
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
            
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-semibold">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Costo Total Suministros (Domicilio)</span>
              <span className="text-slate-900 dark:text-white font-black text-base">
                ${calculationDetails.packagingCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

        </div>

        {/* Right Columns (Image and Financial boxes) */}
        <div className="lg:col-span-4 space-y-6 w-full">
          
          {/* Combo Image */}
          {/* Imagen del Combo */}
          <ImageUploader
            value={image}
            onChange={setImage}
            label="Imagen del Combo"
            helperText="Soporta JPG, PNG (Max. 5MB)"
          />

          {/* Resumen Financiero */}
          <div className="bg-[#121829] dark:bg-slate-900 text-white p-6 rounded-3xl shadow-lg space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <span className="material-symbols-outlined text-[var(--accent-purple)]">payments</span>
              <h3 className="text-sm font-black uppercase tracking-wider">Resumen Financiero</h3>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs text-slate-400 font-semibold">
                <span>Costo Total Consolidado</span>
                <span className="text-sm font-black text-white">${calculationDetails.originalCostSum.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              
              <div className="flex justify-between items-center text-xs text-slate-400 font-semibold border-b border-white/5 pb-2">
                <span>Precio de Venta Consolidado</span>
                <span className="text-xs font-black text-slate-300">${calculationDetails.originalPvpSum.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Precio de Venta Combo (Mesa)</label>
                <div className="flex items-center bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-[var(--accent-purple)]/50">
                  <span className="text-slate-400 font-bold text-sm">$</span>
                  <input 
                    type="number"
                    value={sellPrice}
                    onChange={e => setSellPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej. 28500"
                    className="bg-transparent border-none outline-none text-white text-sm font-black w-full text-right"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Precio de Venta Combo (Domi)</label>
                <div className="flex items-center bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-[var(--accent-purple)]/50">
                  <span className="text-slate-400 font-bold text-sm">$</span>
                  <input 
                    type="number"
                    value={domesticPrice}
                    onChange={e => setDomesticPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej. 31500"
                    className="bg-transparent border-none outline-none text-white text-sm font-black w-full text-right"
                  />
                </div>
              </div>

              {/* Utilidades e Indicadores */}
              <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                {/* Mesa Card */}
                <div className={`p-2.5 rounded-xl border ${calculationDetails.isMesaCritical ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-white/5 border-white/5 text-cyan-400'}`}>
                  <span className="text-[8px] text-slate-400 block uppercase font-black tracking-wider">Margen Mesa</span>
                  <span className="text-lg font-black block">{Math.round(calculationDetails.mesaMarginPct)}%</span>
                  <span className="text-[8px] text-slate-300 block mt-0.5">${Math.round(calculationDetails.mesaUtility).toLocaleString('es-CO', { maximumFractionDigits: 0 })} util.</span>
                  
                  {/* Progress bar */}
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className={`h-full ${calculationDetails.isMesaCritical ? 'bg-rose-500' : 'bg-cyan-500'}`} 
                      style={{ width: `${Math.max(0, Math.min(100, calculationDetails.mesaMarginPct))}%` }}
                    ></div>
                  </div>
                </div>

                {/* Domi Card */}
                <div className={`p-2.5 rounded-xl border ${calculationDetails.isDomiCritical ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-white/5 border-white/5 text-[var(--accent-purple)]'}`}>
                  <span className="text-[8px] text-slate-400 block uppercase font-black tracking-wider">Margen Domi</span>
                  <span className="text-lg font-black block">{Math.round(calculationDetails.domiMarginPct)}%</span>
                  <span className="text-[8px] text-slate-300 block mt-0.5">${Math.round(calculationDetails.domiUtility).toLocaleString('es-CO', { maximumFractionDigits: 0 })} util.</span>
                  
                  {/* Progress bar */}
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className={`h-full ${calculationDetails.isDomiCritical ? 'bg-rose-500' : 'bg-[var(--accent-purple)]'}`} 
                      style={{ width: `${Math.max(0, Math.min(100, calculationDetails.domiMarginPct))}%` }}
                    ></div>
                  </div>
                </div>
              </div>

            </div>

            <button 
              type="button"
              onClick={handleSave}
              className="w-full py-3.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-colors text-center flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Crear Combo
            </button>
          </div>

          {/* Cancel button */}
          <button 
            type="button"
            onClick={onCancel}
            className="w-full text-center text-slate-500 hover:text-slate-700 dark:hover:text-white text-xs font-bold transition-colors block cursor-pointer"
          >
            Cancelar
          </button>

        </div>

      </div>

      {/* 3. Motor de Consolidación de Impacto en Inventario */}
      <div className="bg-[#121829] text-white p-6 rounded-3xl shadow-sm border border-slate-800 space-y-4 w-full">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--accent-purple)]">analytics</span>
          <h3 className="text-sm font-black uppercase tracking-wider">Impacto en Inventario al Vender 1 Combo</h3>
        </div>
        <p className="text-xs text-slate-400">
          Por cada combo vendido, se descontarán las siguientes cantidades de materia prima o productos individuales de su stock actual (con resolución recursiva en cascada).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          
          {/* Materias Primas */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase text-[var(--accent-purple)] tracking-wider">Materia Prima e Insumos Directos</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {inventoryImpact.rawIngredients.map(ing => {
                const remains = ing.currentStock - ing.quantity;
                const isCritical = remains < ing.limit;

                return (
                  <div key={ing.name} className="p-3 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between h-20">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-xs font-bold text-white truncate max-w-[120px]">{ing.name}</span>
                      <span className="text-xs font-black text-rose-500 shrink-0">-{ing.quantity.toLocaleString('es-CO', { maximumFractionDigits: 1 })} {ing.unit}</span>
                    </div>
                    <div className="w-full mt-2">
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full ${isCritical ? 'bg-[var(--text-muted)]' : 'bg-emerald-500'}`} style={{ width: `${Math.max(0, Math.min(100, (remains / (ing.currentStock || 1)) * 100))}%` }}></div>
                      </div>
                      <span className={`text-[8px] font-bold block mt-1 ${isCritical ? 'text-[var(--text-muted)]' : 'text-slate-400'}`}>
                        {remains.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {ing.unit} rest. {isCritical ? '(Crítico)' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              {inventoryImpact.rawIngredients.length === 0 && (
                <div className="col-span-2 text-center text-slate-400 text-xs py-4">No hay ingredientes consolidados.</div>
              )}
            </div>
          </div>

          {/* Suministros */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase text-[var(--accent-purple)] tracking-wider">Suministros de Domicilio</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {inventoryImpact.packaging.map(pkg => {
                const remains = pkg.currentStock - pkg.quantity;
                const isCritical = remains < pkg.limit;

                return (
                  <div key={pkg.name} className="p-3 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between h-20">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-xs font-bold text-white truncate max-w-[120px]">{pkg.name}</span>
                      <span className="text-xs font-black text-rose-500 shrink-0">-{pkg.quantity.toLocaleString('es-CO', { maximumFractionDigits: 1 })} {pkg.unit}</span>
                    </div>
                    <div className="w-full mt-2">
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full ${isCritical ? 'bg-[var(--text-muted)]' : 'bg-emerald-500'}`} style={{ width: `${Math.max(0, Math.min(100, (remains / (pkg.currentStock || 1)) * 100))}%` }}></div>
                      </div>
                      <span className={`text-[8px] font-bold block mt-1 ${isCritical ? 'text-[var(--text-muted)]' : 'text-slate-400'}`}>
                        {remains.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {pkg.unit} rest. {isCritical ? '(Crítico)' : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              {inventoryImpact.packaging.length === 0 && (
                <div className="col-span-2 text-center text-slate-400 text-xs py-4">No hay empaques consolidados.</div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
