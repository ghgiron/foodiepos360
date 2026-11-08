import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './ui/Modal';
import ProduceSubRecipeModal from './inventory/ProduceSubRecipeModal';
import { getEffectiveImpoconsumoRate } from '../types/settings';
import { calculateAvailabilitySync } from '../services/inventoryBomService';
import { getActiveBranchId, formatQuantityDecimals } from '../utils/branchHelper';
import { getSubRecipePhysicalPortionsInBranch, getSubRecipeReservedPortionsInBranch } from '../types';
import { autoMigrateBranchStock } from '../db/inventoryEngine';

interface RecipeDetailProps {
  recipeId: string;
  onBack: () => void;
  onEdit: (isSub?: boolean) => void;
}

export default function RecipeDetail({ recipeId, onBack, onEdit }: RecipeDetailProps) {
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  // DB queries
  const liveRecipe = useLiveQuery(() => db.recipes.get(recipeId), [recipeId]);
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Active branch ID
  const activeBranchId = getActiveBranchId();

  useEffect(() => {
    autoMigrateBranchStock(activeBranchId).catch(() => {});
  }, [activeBranchId]);

  // Load settings dynamically from IndexedDB systemSettings table
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const minUtilityMargin = systemSettings['min_utility_margin'] !== undefined 
    ? Number(systemSettings['min_utility_margin']) 
    : 35;

  const taxPercentage = getEffectiveImpoconsumoRate(systemSettings);

  const safetyMarginPercentage = systemSettings['safetyMarginPercentage'] !== undefined 
    ? Number(systemSettings['safetyMarginPercentage']) 
    : (systemSettings['error_margin_pct'] !== undefined ? Number(systemSettings['error_margin_pct']) : 5);

  const operationalCostPercentage = systemSettings['operationalCostPercentage'] !== undefined 
    ? Number(systemSettings['operationalCostPercentage']) 
    : 14.95;

  const recipe = useMemo(() => {
    return liveRecipe || recipes.find(r => r.id === recipeId);
  }, [liveRecipe, recipes, recipeId]);

  const stockInfo = useMemo(() => {
    if (!recipe) return { portions: 0, physical: 0, reserved: 0, label: '0 porciones' };
    if (recipe.isSubRecipe) {
      const physical = getSubRecipePhysicalPortionsInBranch(recipe, activeBranchId);
      const reserved = getSubRecipeReservedPortionsInBranch(recipe, activeBranchId);
      const avail = Math.max(0, physical - reserved);
      const unit = recipe.yieldUnit || 'porc.';
      return { 
        portions: avail, 
        physical, 
        reserved, 
        label: reserved > 0
          ? `${formatQuantityDecimals(avail)} ${unit} disp. (${formatQuantityDecimals(physical)} fís.)`
          : `${formatQuantityDecimals(physical)} ${unit} en lote` 
      };
    }
    const avail = calculateAvailabilitySync(recipe.id, recipes, inventoryItems, 'dine_in');
    return { 
      portions: avail.availablePortions, 
      physical: avail.availablePortions,
      reserved: 0,
      label: avail.availablePortions >= 999 ? 'Disponible' : `${formatQuantityDecimals(avail.availablePortions)} porciones` 
    };
  }, [recipe, recipes, inventoryItems, activeBranchId]);

  // Calculations details
  const details = useMemo(() => {
    if (!recipe) return null;

    let totalPortionCost = 0;

    const list = recipe.ingredients.map(ing => {
      let unitCost = 0;
      let nameStr = ing.inventoryItemId;

      if (ing.type === 'subrecipe') {
        const sr = recipes.find(r => r.id === ing.inventoryItemId);
        if (sr) {
          nameStr = sr.name;
          unitCost = sr.costPrice || sr.costPerUnit || 0;
        } else {
          nameStr = (ing as any).name || 'Subreceta no encontrada';
          unitCost = (ing as any).cost || 0;
        }
      } else {
        const item = inventoryItems.find(i => i.id === ing.inventoryItemId);
        if (item) {
          nameStr = item.name;
          if (item.costoUnitarioReal !== undefined && item.costoUnitarioReal > 0) {
            unitCost = item.costoUnitarioReal;
          } else {
            unitCost = item.purchaseCost / (item.countUnit === 'Kilogramo' || item.countUnit === 'Kg' ? 1 : 1000);
            if (item.countUnit === 'Unidad' || item.countUnit === 'unidad') {
              unitCost = item.purchaseCost;
            }
          }
        } else {
          nameStr = (ing as any).name || 'Insumo no encontrado';
          unitCost = (ing as any).cost || 0;
        }
      }

      const totalCost = unitCost * ing.quantity;
      totalPortionCost += totalCost;

      return {
        ...ing,
        name: nameStr,
        cost: totalCost
      };
    });

    // Subrecipe specific checks
    const isSub = Boolean(recipe.isSubRecipe);
    const yieldQty = recipe.yieldQuantity && recipe.yieldQuantity > 0 ? recipe.yieldQuantity : 1;
    const rawIngredientsCost = totalPortionCost;

    const operatingCost = rawIngredientsCost * (operationalCostPercentage / 100);
    const errorMarginCost = rawIngredientsCost * (safetyMarginPercentage / 100);
    const totalProductionCost = rawIngredientsCost + operatingCost + errorMarginCost;
    const costPerUnit = yieldQty > 0 ? (totalProductionCost / yieldQty) : totalProductionCost;

    // Commercial dish calculations (only when NOT a subrecipe)
    const sellPrice = isSub ? 0 : (recipe.sellPrice > 0 ? recipe.sellPrice : 32900);
    const domesticPrice = isSub ? 0 : ((recipe.domesticPrice !== undefined && recipe.domesticPrice > 0) ? recipe.domesticPrice : 35900);

    // Packaging Cost sum
    const packagingCost = recipe.packaging ? recipe.packaging.reduce((sum, pkg) => sum + (pkg.cost * pkg.quantity), 0) : 0;
    const totalDomiCost = totalProductionCost + packagingCost;

    // Base Gravable: NetPrice Mesa = PVP_Mesa / (1 + (taxPercentage / 100))
    const netMesaPVP = taxPercentage > 0 ? (sellPrice / (1 + (taxPercentage / 100))) : sellPrice;
    const ipoconsumo = isSub ? 0 : (sellPrice - netMesaPVP);
    const grossMargin = (!isSub && netMesaPVP > 0) ? ((netMesaPVP - totalProductionCost) / netMesaPVP) * 100 : 0;
    const netUtility = isSub ? 0 : (netMesaPVP - totalProductionCost);

    // Base Gravable: NetPrice Domi = PVP_Domicilio / (1 + (taxPercentage / 100))
    const netDomiPVP = taxPercentage > 0 ? (domesticPrice / (1 + (taxPercentage / 100))) : domesticPrice;
    const domiUtility = isSub ? 0 : (netDomiPVP - totalDomiCost);
    const domiMarginPct = (!isSub && netDomiPVP > 0) ? (domiUtility / netDomiPVP) * 100 : 0;

    // Subrecipes NEVER trigger commercial low margin alerts because they are intermediate preparations
    const isMarginCritical = !isSub && (
      (sellPrice > 0 && Math.round(grossMargin) < minUtilityMargin) || 
      (domesticPrice > 0 && Math.round(domiMarginPct) < minUtilityMargin)
    );

    return {
      ingredientsList: list,
      portionCost: rawIngredientsCost,
      operatingCost,
      errorMarginCost,
      totalProductionCost,
      costPerUnit,
      packagingCost,
      totalDomiCost,
      sellPrice,
      domesticPrice,
      ipoconsumo,
      grossMargin,
      netUtility,
      domiUtility,
      domiMarginPct,
      isMarginCritical
    };

  }, [recipe, inventoryItems, recipes, minUtilityMargin, taxPercentage, safetyMarginPercentage, operationalCostPercentage]);

  if (!recipe || !details) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-500 font-medium">
        Cargando detalles de la receta...
      </div>
    );
  }

  // Fallback images
  const plateImage = recipe.img || (recipe.name.toLowerCase().includes('sushi')
    ? 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=600&q=80'
    : recipe.name.toLowerCase().includes('tacos')
    ? 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=600&q=80'
    : recipe.name.toLowerCase().includes('tonic')
    ? 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80'
    : 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80');

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-content">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white flex items-center justify-center p-1.5 rounded-xl border border-line transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <span className="text-xs font-bold uppercase text-content-secondary">Volver a recetas</span>
        </div>
        <div className="flex items-center gap-3">
          {recipe.isSubRecipe && (
            <button 
              onClick={() => setIsProduceModalOpen(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-full shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-2 active:scale-95 transition-all"
              title="Registrar producción interna de lotes"
            >
              <span className="material-symbols-outlined text-sm font-bold">skillet</span>
              Producir Lote
            </button>
          )}
          <button 
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-surface hover:bg-slate-50 dark:hover:bg-raised border border-line text-slate-700 dark:text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">print</span>
            Imprimir
          </button>
          <button 
            onClick={() => onEdit(recipe.isSubRecipe)}
            className="px-5 py-2.5 bg-[var(--accent-pink)] hover:opacity-90 text-white text-xs font-bold rounded-full shadow-md shadow-[var(--accent-pink)]/20 cursor-pointer flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm font-bold">edit</span>
            {recipe.isSubRecipe ? 'Editar Subreceta' : recipe.isCombo ? 'Editar Combo' : 'Editar Receta'}
          </button>
        </div>
      </div>

      {/* Critical Margin Alert (Only for Commercial Dishes) */}
      {details.isMarginCritical && (
        <div className="p-4 bg-rose-500/10 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl flex gap-3 items-start border border-rose-500/20 shadow-sm animate-pulse">
          <span className="material-symbols-outlined text-lg shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          <div className="text-xs">
            <span className="font-black block uppercase tracking-wider mb-1">Requiere revisión de costos</span>
            <p className="font-semibold">
              El margen bruto real de esta receta ({details.grossMargin.toFixed(1)}%) es inferior al margen mínimo permitido configurado de <strong>{minUtilityMargin}%</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Unified Recipe Header Card */}
      <div className="bg-surface rounded-[2rem] shadow-sm border border-line/80 p-6 flex flex-col md:flex-row gap-6 items-center md:items-start">
        {/* Compact Square Image Container */}
        <div className="w-36 h-36 md:w-44 md:h-44 shrink-0 rounded-[1.5rem] overflow-hidden bg-inset relative border border-line group shadow-sm">
          <img 
            src={plateImage} 
            alt={recipe.name} 
            onClick={() => onEdit(recipe.isSubRecipe)}
            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
            title={recipe.isSubRecipe ? 'Haga clic para editar la subreceta' : recipe.isCombo ? 'Haga clic para editar el combo' : 'Haga clic para editar la receta'}
          />
          {/* Floating Zoom Button (Visible on Hover) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFullImage(plateImage);
            }}
            className="absolute top-2.5 right-2.5 z-10 w-8 h-8 bg-overlay hover:bg-overlay text-white rounded-xl flex items-center justify-center transition-all cursor-pointer border-none shadow-sm active:scale-95 opacity-0 group-hover:opacity-100 duration-200"
            title="Ampliar imagen"
          >
            <span className="material-symbols-outlined text-sm font-bold">zoom_in</span>
          </button>
        </div>

        {/* Text & Stats Container */}
        <div className="flex-1 flex flex-col justify-between h-full space-y-4 text-center md:text-left w-full">
          <div>
            {/* Badges Row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
              <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider ${
                recipe.isSubRecipe 
                  ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300' 
                  : recipe.isCombo 
                    ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-300' 
                    : 'bg-slate-100 text-slate-700 dark:bg-raised/40 dark:text-[var(--text-secondary)]'
              }`}>
                {recipe.isSubRecipe ? 'SUBRECETA' : recipe.isCombo ? 'COMBO' : 'RECETA'}
              </span>
              <span className="bg-slate-100 dark:bg-[var(--card-color)] text-content-secondary text-[9px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider border border-slate-200/30 dark:border-line-subtle">
                {recipe.category || 'Recetario'}
              </span>
              {/* Allergens */}
              {(recipe.allergens || ['Gluten', 'Lácteos']).map(al => (
                <span 
                  key={al}
                  className="bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-[9px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider border border-rose-200 dark:border-rose-900/20"
                >
                  {al}
                </span>
              ))}
            </div>

            <h1 className="text-2xl md:text-3xl font-black text-content leading-tight">
              {recipe.name}
            </h1>
          </div>

          {/* Quick Stats Grid Row */}
          <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 w-full max-w-md mx-auto md:mx-0">
            <div className="flex flex-col items-center md:items-start">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="material-symbols-outlined text-sm text-[var(--text-secondary)]">schedule</span>
                <span className="text-[9px] font-black text-content-tertiary uppercase tracking-wider">Prep</span>
              </div>
              <span className="text-sm font-black text-content">{recipe.prepTime || 15} min</span>
            </div>

            <div className="flex flex-col items-center md:items-start border-x border-line px-4">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="material-symbols-outlined text-sm text-cyan-500 dark:text-cyan-400">equalizer</span>
                <span className="text-[9px] font-black text-content-tertiary uppercase tracking-wider">Dificultad</span>
              </div>
              <span className="text-sm font-black text-content">{recipe.difficulty || 'Media'}</span>
            </div>

            <div className="flex flex-col items-center md:items-start">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="material-symbols-outlined text-sm text-blue-500 dark:text-blue-400">inventory_2</span>
                <span className="text-[9px] font-black text-content-tertiary uppercase tracking-wider">Stock</span>
              </div>
              <span className="text-sm font-black text-content font-mono">{stockInfo.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side Content - Technical Documentation */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Table of Ingredients */}
          <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-line">
              <h3 className="text-sm font-black text-content uppercase tracking-wider">Tabla de Ingredientes</h3>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {recipe.isSubRecipe 
                  ? `Base: 1 Lote (${recipe.yieldQuantity || 1} ${recipe.yieldUnit || 'porciones'})` 
                  : 'Base: 1 Porción'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[9px] font-black uppercase text-content-tertiary tracking-wider">
                    <th className="py-2.5">Ingrediente</th>
                    <th className="py-2.5 text-center">Cantidad</th>
                    <th className="py-2.5 text-center">Unidad</th>
                    <th className="py-2.5 text-right">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-line font-semibold text-content-secondary">
                  {details.ingredientsList.map((ing, index) => (
                    <tr key={index}>
                      <td className="py-3.5 text-content font-bold">{ing.name}</td>
                      <td className="py-3.5 text-center font-mono tabular-nums">{ing.quantity > 0 ? ing.quantity : '--'}</td>
                      <td className="py-3.5 text-center text-content-secondary">{ing.unit}</td>
                      <td className="py-3.5 text-right text-content font-bold font-mono tabular-nums">
                        ${ing.cost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t border-line text-xs font-semibold">
              <div className="flex justify-between items-center text-slate-500">
                <span>Costo Total Insumos</span>
                <span>${details.portionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Costo Operativo ({operationalCostPercentage}%)</span>
                <span>${details.operatingCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Margen de Error ({safetyMarginPercentage}%)</span>
                <span>${details.errorMarginCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-line text-sm font-black text-content">
                <span>COSTO TOTAL PRODUCCIÓN</span>
                <span className="font-mono text-content tabular-nums">${details.totalProductionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>

          {/* Proceso de Preparación */}
          <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line space-y-4">
            <h3 className="text-sm font-black text-content uppercase tracking-wider">Proceso de Preparación</h3>
            
            <div className="space-y-4">
              {(recipe.steps || [
                'Sellar el pan brioche con mantequilla clarificada en la plancha hasta obtener un dorado uniforme.',
                'Cocinar la carne a término medio (65°C internos) salpimentando solo al momento de entrar a la plancha.'
              ]).map((step, idx) => (
                <div key={idx} className="flex gap-3 items-start font-semibold text-xs text-content-secondary">
                  <span className="w-5 h-5 rounded-full bg-raised text-content-secondary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Consejo del Chef */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 p-5 rounded-3xl border border-emerald-200 dark:border-emerald-800/40 space-y-2">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
              <h4 className="text-xs font-black uppercase tracking-wider">Consejo del Chef</h4>
            </div>
            <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200 leading-relaxed">
              {recipe.chefAdvice || 'Asegúrese de que los pepinillos estén a temperatura ambiente antes del montaje para no enfriar el queso fundido.'}
            </p>
          </div>

        </div>

        {/* Right Side Content - Business Analytics vs Subrecipe Production */}
        <div className="lg:col-span-4 space-y-6">
          {recipe.isSubRecipe ? (
            /* Subrecipe Technical Production Card */
            <div className="bg-white border border-slate-200 text-slate-900 shadow-sm dark:bg-surface dark:border-line dark:text-white p-6 rounded-3xl space-y-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10">
                <h3 className="text-xs font-black uppercase tracking-wider text-content-secondary flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-500 text-base">skillet</span>
                  Ficha Técnica de Producción
                </h3>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300">
                  Subreceta
                </span>
              </div>

              <div className="space-y-4">
                {/* Costo Unitario & Rendimiento */}
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-content-secondary block mb-0.5">
                      Costo por {recipe.yieldUnit ? (recipe.yieldUnit.endsWith('es') ? recipe.yieldUnit.slice(0, -2) : (recipe.yieldUnit.endsWith('s') ? recipe.yieldUnit.slice(0, -1) : recipe.yieldUnit)) : 'Porción'}
                    </span>
                    <span className="text-3xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                      ${details.costPerUnit.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black uppercase tracking-wider text-content-secondary block mb-0.5">
                      Rendimiento / Lote
                    </span>
                    <span className="text-base font-black font-mono tracking-tight text-content">
                      {recipe.yieldQuantity || 1} {recipe.yieldUnit || 'porciones'}
                    </span>
                  </div>
                </div>

                {/* Resumen de Costo de Producción del Lote */}
                <div className="bg-inset/60 p-4 rounded-2xl border border-line space-y-2.5 text-xs font-semibold">
                  <div className="flex justify-between items-center text-content-secondary">
                    <span className="text-[11px] font-bold">Costo Total del Lote</span>
                    <span className="font-mono font-black text-content tabular-nums">
                      ${details.totalProductionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-content-secondary pt-1.5 border-t border-line/60">
                    <span>Insumos Crudos</span>
                    <span className="font-mono tabular-nums">${details.portionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-content-secondary">
                    <span>Costos Operativos ({operationalCostPercentage}%)</span>
                    <span className="font-mono tabular-nums">${details.operatingCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-content-secondary">
                    <span>Margen de Merma ({safetyMarginPercentage}%)</span>
                    <span className="font-mono tabular-nums">${details.errorMarginCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>

                {/* Existencias y Stock Preparado en Cocina */}
                <div className="border-t border-slate-100 dark:border-white/10 pt-4 space-y-2.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-content-secondary block">
                    Control de Existencias en Lote
                  </span>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-inset rounded-xl border border-line">
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Físico</span>
                      <span className="text-sm font-black font-mono text-content">
                        {formatQuantityDecimals(stockInfo.physical)}
                      </span>
                    </div>
                    <div className="p-2.5 bg-inset rounded-xl border border-line">
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Reservado</span>
                      <span className="text-sm font-black font-mono text-amber-500">
                        {formatQuantityDecimals(stockInfo.reserved)}
                      </span>
                    </div>
                    <div className="p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200/50 dark:border-purple-800/50">
                      <span className="text-[9px] text-[var(--accent-purple)] uppercase font-bold block">Disponible</span>
                      <span className="text-sm font-black font-mono text-[var(--accent-purple)]">
                        {formatQuantityDecimals(stockInfo.portions)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botón de Acción Principal para Producir Lote */}
                <button
                  type="button"
                  onClick={() => setIsProduceModalOpen(true)}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-headline font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer active:scale-95 transition-all mt-4"
                >
                  <span className="material-symbols-outlined text-base font-bold">skillet</span>
                  <span>🍳 Registrar Producción de Lote</span>
                </button>
              </div>
            </div>
          ) : (
            /* Commercial Dish Profitability Analysis Card */
            <div className="bg-white border border-slate-200 text-slate-900 shadow-sm dark:bg-surface dark:border-line dark:text-white p-6 rounded-3xl space-y-5">
              <h3 className="text-xs font-black uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-white/10 text-content-secondary">Análisis de Rentabilidad</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-content-secondary block mb-0.5">PVP Mesa (Sugerido)</span>
                    <span className="text-3xl font-black font-mono tracking-tight text-content tabular-nums">${details.sellPrice.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black uppercase tracking-wider text-content-secondary block mb-0.5">Costo Unitario</span>
                    <span className="text-base font-black font-mono tracking-tight text-content-secondary tabular-nums">${details.totalProductionCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-white/10 pt-4">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-content-secondary block mb-0.5">Margen Bruto</span>
                    <span className="text-lg font-black font-mono tracking-tight text-cyan-600 dark:text-cyan-400 tabular-nums">{Math.round(details.grossMargin)}%</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-content-secondary block mb-0.5">
                      {taxPercentage > 0 ? `Impoconsumo (${taxPercentage}%)` : 'Impoconsumo (Exento / 0%)'}
                    </span>
                    <span className="text-lg font-bold font-mono tracking-tight text-content-secondary tabular-nums">
                      ${taxPercentage > 0 ? details.ipoconsumo.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '0'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-white/10 text-xs font-semibold">
                  <div>
                    <span className="text-content-secondary uppercase tracking-wider font-black text-[9px] block">
                      {taxPercentage > 0 ? 'Utilidad Neta en Caja' : 'Utilidad Bruta Directa'}
                    </span>
                    {taxPercentage > 0 && <span className="text-[8px] text-content-tertiary block font-normal">(Base gravable tras impoconsumo)</span>}
                  </div>
                  <span className="text-lg font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">${details.netUtility.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                </div>

                {/* Delivery price box */}
                <div className="bg-slate-50 dark:bg-white/5 p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/5 mt-2 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs font-bold text-content-secondary">
                      <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">delivery_dining</span>
                      <span>PVP DOMICILIO</span>
                    </div>
                    <span className="text-lg font-black font-mono tracking-tight text-content tabular-nums">${details.domesticPrice.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-200/80 dark:border-white/5 text-[10px]">
                    <div>
                      <span className="text-[9px] text-content-secondary block">Margen Domi</span>
                      <span className="font-bold font-mono text-content-secondary tabular-nums">{Math.round(details.domiMarginPct)}%</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-content-secondary block">Utilidad Domi</span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">${details.domiUtility.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {selectedFullImage && (
        <Modal title="Vista de Imagen" onClose={() => setSelectedFullImage(null)} size="image">
          <div className="flex justify-center items-center p-2 bg-canvas/10 rounded-2xl overflow-hidden">
            <img 
              src={selectedFullImage} 
              alt="Full Screen Recipe" 
              className="w-full max-h-[60vh] md:max-h-[70vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </Modal>
      )}

      {isProduceModalOpen && (
        <ProduceSubRecipeModal
          isOpen={isProduceModalOpen}
          onClose={() => setIsProduceModalOpen(false)}
          initialSubRecipeId={recipe.id}
        />
      )}
    </div>
  );
}
