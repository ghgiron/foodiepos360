import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe, InventoryItem } from '../types';
import { saveSystemSetting, DEFAULT_SETTINGS } from '../db/settingsStore';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';

interface SubRecipeFormProps {
  onCancel: () => void;
  onSaved: () => void;
  subRecipeId?: string | null;
}

export default function SubRecipeForm({ onCancel, onSaved, subRecipeId }: SubRecipeFormProps) {
  // DB items
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

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

  // Form states (start empty per cleanup requirements)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [yieldQuantity, setYieldQuantity] = useState<number | ''>('');
  const [yieldUnit, setYieldUnit] = useState<string>('gr');
  const [quantityToProduce, setQuantityToProduce] = useState<number>(1);
  const [errorMarginPercentage, setErrorMarginPercentage] = useState<number>(5);
  const [operatingCost, setOperatingCost] = useState<number>(0);
  const [allergens, setAllergens] = useState<string[]>([]);

  // Selected ingredients state
  const [ingredients, setIngredients] = useState<Array<{
    inventoryItemId: string;
    quantity: number; // Standard qty
    unit: string;
  }>>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showItemDropdown, setShowItemDropdown] = useState<boolean>(false);

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

  // Expanded search results with details
  const filteredItems = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return inventoryItems.filter(item => 
      item.name.toLowerCase().includes(q) &&
      !ingredients.some(ing => ing.inventoryItemId === item.id)
    );
  }, [searchQuery, inventoryItems, ingredients]);

  // Dynamic cost calculations
  const ingredientDetails = useMemo(() => {
    let rawSum = 0;
    const details = ingredients.map(ing => {
      const item = inventoryItems.find(i => i.id === ing.inventoryItemId);
      
      let unitCost = 0;
      let nameStr = ing.inventoryItemId;

      if (item) {
        nameStr = item.name;
        if (item.costoUnitarioReal !== undefined) {
          unitCost = item.costoUnitarioReal;
        } else {
          unitCost = item.purchaseCost / (item.countUnit === 'Kilogramo' || item.countUnit === 'Kg' ? 1 : 1000); // cost per unit or gram/ml
          if (item.countUnit === 'unidad' || item.countUnit === 'Unidad') {
            unitCost = item.purchaseCost;
          }
        }
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
    const totalProductionCost = rawSum + errorMarginCost + operatingCost;
    const costPerPortion = totalProductionCost * quantityToProduce;
    const yieldQtyNum = Number(yieldQuantity) || 1;
    const costPerUnit = yieldQtyNum > 0 ? (totalProductionCost / yieldQtyNum) : 0;

    return {
      items: details,
      rawSum,
      errorMarginCost,
      totalProductionCost,
      costPerPortion,
      costPerUnit
    };
  }, [ingredients, inventoryItems, errorMarginPercentage, operatingCost, quantityToProduce, yieldQuantity]);

  // Ingredients handlers
  const addIngredient = (item: InventoryItem) => {
    setIngredients([
      ...ingredients,
      {
        inventoryItemId: item.id,
        quantity: 10,
        unit: item.countUnit
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
      id: subRecipeId || `subrec-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      category: 'BAR',
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
    <div className="p-8 space-y-8 transition-receitly font-sans text-slate-800 dark:text-slate-200">
      
      {/* Header Row */}
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
          <div className="bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-[var(--border-glow)] space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">info</span>
              </div>
              <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Información Básica</h3>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1">Nombre de la Subreceta</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Salsa de gulupa"
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-3 text-xs focus:ring-1 focus:ring-[var(--accent-purple)] outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block mb-1">Descripción</label>
              <textarea 
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detalles sobre la preparación o uso de esta subreceta..."
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-3 text-xs focus:ring-1 focus:ring-[var(--accent-purple)] outline-none"
              />
            </div>

            {/* Allergens selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">Alérgenos</label>
              <div className="flex flex-wrap items-center gap-2">
                {allergens.map(al => (
                  <span 
                    key={al}
                    className="bg-slate-100 dark:bg-[var(--card-color)] text-slate-700 dark:text-slate-200 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
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
                        <input
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
          <div className="bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-[var(--border-glow)] space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">equalizer</span>
              </div>
              <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Métricas de Producción</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">Cant. Obtenida</label>
                <input 
                  type="number" 
                  value={yieldQuantity}
                  onChange={e => setYieldQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ej. 150"
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none text-center focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">U. de Medida</label>
                <CustomSelect 
                  value={yieldUnit}
                  onChange={setYieldUnit}
                  options={officialUnits.map((unit: string) => ({ value: unit, label: unit }))}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-2.5 text-xs font-bold text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">A Producir</label>
                <input 
                  type="number" 
                  value={quantityToProduce}
                  onChange={e => setQuantityToProduce(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none text-center focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-1">Margen Error (%)</label>
                <input 
                  type="text" 
                  value={`${errorMarginPercentage}%`}
                  onChange={e => setErrorMarginPercentage(Number(e.target.value.replace('%', '')) || 0)}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] text-[var(--text-primary)] p-2.5 text-xs font-bold outline-none text-center focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
              </div>
            </div>
          </div>

          {/* 3. Insumos e Ingredientes */}
          <div className="bg-[var(--bg-surface)] p-6 rounded-3xl shadow-sm border border-[var(--border-glow)] space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Insumos e Ingredientes</h3>
              
              {/* Search input dropdown - full width w-full */}
              <div className="relative w-full">
                <div className="flex items-center gap-2 bg-[var(--bg-app)] border border-[var(--border-glow)] px-3 py-2.5 rounded-xl w-full">
                  <span className="material-symbols-outlined text-xs text-[var(--text-muted)]">search</span>
                  <input 
                    type="text" 
                    placeholder="Añadir Insumo..." 
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowItemDropdown(true);
                    }}
                    onFocus={() => setShowItemDropdown(true)}
                    className="bg-transparent border-none outline-none text-xs w-full font-semibold text-[var(--text-primary)]"
                  />
                </div>

                {/* Expanded search dropdown showing Name, Category, Stock, Unit - dark contrast */}
                {showItemDropdown && filteredItems.length > 0 && (
                  <div className="absolute left-0 right-0 top-11 w-full max-h-60 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-2xl shadow-2xl z-30 divide-y divide-slate-200 dark:divide-slate-800 text-[var(--text-primary)] animate-fade-in">
                    <div className="p-2.5 bg-[var(--bg-app)] text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider grid grid-cols-12 gap-1 border-b border-[var(--border-glow)] shrink-0">
                      <div className="col-span-5">Insumo</div>
                      <div className="col-span-3">Categoría</div>
                      <div className="col-span-2 text-right">Stock</div>
                      <div className="col-span-2 text-right">Unidad</div>
                    </div>
                    {filteredItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => addIngredient(item)}
                        className="w-full text-left p-3 text-[11px] hover:bg-[var(--bg-app)] font-bold text-[var(--text-primary)] grid grid-cols-12 gap-1 items-center transition-colors border-none cursor-pointer"
                      >
                        <div className="col-span-5 truncate">{item.name}</div>
                        <div className="col-span-3 truncate text-[var(--text-muted)] text-[10px]">{item.category}</div>
                        <div className="col-span-2 text-right text-[var(--text-secondary)]">{item.realPhysicalStock}</div>
                        <div className="col-span-2 text-right text-[var(--text-muted)]">{item.countUnit}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ingredients Table - scroll-x responsivo */}
            <div className="overflow-x-auto w-full border border-[var(--border-glow)] rounded-2xl">
              <table className="w-full text-left text-xs font-semibold min-w-[600px]">
                <thead>
                  <tr className="border-b border-[var(--border-glow)] text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-app)]">
                    <th className="p-3">Insumo</th>
                    <th className="p-3 text-center">Cant. Estándar</th>
                    <th className="p-3 text-center">Unidad</th>
                    <th className="p-3 text-right">Costo Real</th>
                    <th className="p-3 text-center">Cant. Prod.</th>
                    <th className="p-3 text-right">Costo Prod.</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[var(--text-secondary)]">
                  {ingredientDetails.items.map(ing => (
                    <tr key={ing.inventoryItemId}>
                      <td className="p-3 text-[var(--text-primary)] font-bold">{ing.name}</td>
                      <td className="p-3 text-center">
                        <input 
                          type="number"
                          value={ing.quantity}
                          onChange={e => updateQuantity(ing.inventoryItemId, Number(e.target.value) || 0)}
                          className="w-16 rounded-md bg-[var(--bg-app)] border border-[var(--border-glow)] p-1 text-center font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                        />
                      </td>
                      <td className="p-3 text-center text-slate-400">{ing.unit}</td>
                      <td className="p-3 text-right text-slate-800 dark:text-slate-200">${ing.unitCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td>
                      <td className="p-3 text-center text-slate-700 dark:text-slate-300">{ing.quantity} {ing.unit}</td>
                      <td className="p-3 text-right text-slate-900 dark:text-white font-bold">
                        ${ing.totalCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
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
              <span className="text-slate-900 dark:text-white font-black text-base">
                ${ingredientDetails.rawSum.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

        </div>

        {/* Right Results Panel */}
        <div className="lg:col-span-4 space-y-6 w-full animate-fade-in">
          
          {/* RESULTADOS */}
          <div className="bg-[var(--bg-surface)] text-[var(--text-primary)] p-6 rounded-3xl shadow-lg space-y-6 border border-[var(--border-glow)]">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-glow)]">
              <span className="material-symbols-outlined text-[var(--accent-purple)]">trending_up</span>
              <h3 className="text-sm font-black uppercase tracking-wider">Resultados</h3>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[var(--text-secondary)]">Costo total de insumos</span>
                <span className="font-bold text-[var(--text-primary)]">${ingredientDetails.rawSum.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[var(--text-secondary)]">Margen de error ({errorMarginPercentage}%)</span>
                <span className="font-bold text-[var(--text-primary)]">${ingredientDetails.errorMarginCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[var(--text-secondary)]">Costo Operativo</span>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)] font-bold">$</span>
                  <input 
                    type="number" 
                    value={operatingCost}
                    onChange={e => setOperatingCost(Number(e.target.value) || 0)}
                    className="w-16 bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-md px-1.5 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-[var(--accent-purple)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-glow)] flex justify-between items-center">
                <span className="text-xs font-black text-[var(--text-muted)]">Costo total de producción</span>
                <span className="text-2xl font-black text-[var(--accent-purple)]">${ingredientDetails.totalProductionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            <div className="bg-[var(--bg-app)] p-4 rounded-2xl space-y-3.5 pt-4 border border-[var(--border-glow)]">
              <span className="text-[9px] font-black tracking-wider uppercase text-[var(--text-muted)] block">Porción y Unidad</span>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[var(--text-secondary)]">Costo por porción</span>
                <span className="font-extrabold text-sm text-[var(--text-primary)]">${ingredientDetails.costPerPortion.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold pt-2.5 border-t border-[var(--border-glow)]">
                <span className="text-[var(--text-secondary)]">Costo por {yieldUnit}</span>
                <span className="font-black text-lg text-cyan-400">${ingredientDetails.costPerUnit.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <p className="text-[9px] text-[var(--text-muted)] italic mt-2">
              * El costo por porción se calcula como: Costo Total Producción × Cantidad a Producir. El costo por {yieldUnit} se divide por la cantidad obtenida.
            </p>

            <button 
              onClick={handleSave}
              className="w-full py-3.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-colors text-center block border-none"
            >
              Guardar Subreceta
            </button>
          </div>

        </div>

      </div>

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
