import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import RecipeDetail from './recipeDetail';
import RecipeForm from './recipeForm';
import SubRecipeForm from './subRecipeForm';
import ComboForm from './comboForm';
import RecipeList from './recipeList';

type ViewState = 'list' | 'detail' | 'create_recipe' | 'create_subrecipe' | 'create_combo';

interface RecipeBookProps {
  initialRecipeId?: string | null;
  initialView?: 'list' | 'detail' | 'create_recipe' | 'create_subrecipe';
  onClearNav?: () => void;
}

export default function RecipeBook({ initialRecipeId, initialView, onClearNav }: RecipeBookProps) {
  const [view, setView] = useState<ViewState>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch all recipes from IndexedDB
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];

  // Load settings dynamically from IndexedDB systemSettings table
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const minUtilityMargin = systemSettings['min_utility_margin'] !== undefined ? Number(systemSettings['min_utility_margin']) : 35;
  const taxPercentage = systemSettings['taxPercentage'] !== undefined ? Number(systemSettings['taxPercentage']) : 8;

  // Handle external search navigation
  useEffect(() => {
    if (initialView) {
      setView(initialView);
      if (initialRecipeId !== undefined) {
        setSelectedId(initialRecipeId);
      }
      if (onClearNav) {
        onClearNav();
      }
    }
  }, [initialView, initialRecipeId, onClearNav]);

  // Dynamic KPI counts
  const kpis = useMemo(() => {
    const totalCount = recipes.filter(r => !r.isSubRecipe).length;
    // Low Margin Recipes count using correct division-based net margin
    const lowMarginCount = recipes.filter(r => {
      if (r.isSubRecipe || r.sellPrice <= 0) return false;
      const netMesaPVP = r.sellPrice / (1 + (taxPercentage / 100));
      const margin = ((netMesaPVP - r.costPrice) / netMesaPVP) * 100;
      return Math.round(margin) < minUtilityMargin;
    }).length;
    
    return {
      total: totalCount > 0 ? totalCount : 0,
      lowMargin: totalCount > 0 ? lowMarginCount : 0,
      lastUpdated: 'Sincronizado'
    };
  }, [recipes, taxPercentage, minUtilityMargin]);

  const handleEdit = (id: string, isSub: boolean, isCombo?: boolean) => {
    setSelectedId(id);
    if (isSub) {
      setView('create_subrecipe');
    } else if (isCombo) {
      setView('create_combo');
    } else {
      setView('create_recipe');
    }
  };

  // View state switcher router
  if (view === 'detail' && selectedId) {
    return (
      <RecipeDetail 
        recipeId={selectedId} 
        onBack={() => { setView('list'); setSelectedId(null); }} 
        onEdit={() => setView('create_recipe')}
      />
    );
  }

  if (view === 'create_recipe') {
    return (
      <RecipeForm 
        recipeId={selectedId}
        onCancel={() => { setView('list'); setSelectedId(null); }}
        onSaved={() => { setView('list'); setSelectedId(null); }}
      />
    );
  }

  if (view === 'create_subrecipe') {
    return (
      <SubRecipeForm 
        subRecipeId={selectedId || undefined}
        onCancel={() => { setView('list'); setSelectedId(null); }}
        onSaved={() => { setView('list'); setSelectedId(null); }}
      />
    );
  }

  if (view === 'create_combo') {
    return (
      <ComboForm 
        comboId={selectedId}
        onCancel={() => { setView('list'); setSelectedId(null); }}
        onSaved={() => { setView('list'); setSelectedId(null); }}
      />
    );
  }

  return (
    <div className="p-8 space-y-8 transition-receitly font-sans text-slate-800 dark:text-slate-200">
      
      {/* KPI Cards Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Recetas */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between h-32">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Recetas / Artículos</span>
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-none">
              {recipes.filter(r => !r.isSubRecipe).length}
            </h2>
            <span className="text-[9px] text-emerald-500 font-extrabold block mt-2">▲ Sincronizado</span>
          </div>
        </div>

        {/* Recetas con Bajo Margen */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between h-32 border-l-4 border-l-rose-500">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Rentabilidad Crítica</span>
          <div>
            <h2 className="text-3xl font-black text-rose-500 leading-none">{kpis.lowMargin}</h2>
            <span className="text-[9px] text-rose-500 font-extrabold block mt-2">▲ Requiere revisión de costos (Margen &lt; {minUtilityMargin}%)</span>
          </div>
        </div>

        {/* Estado */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between h-32 border-l-4 border-l-emerald-500">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</span>
          <div>
            <h2 className="text-lg font-black text-slate-850 dark:text-slate-200 leading-none">Hoy, Activo</h2>
            <span className="text-[9px] text-slate-500 font-semibold block mt-2">Sincronizado con base local IndexedDB</span>
          </div>
        </div>
      </section>

      <RecipeList
        onSelectRecipe={(id) => { setSelectedId(id); setView('detail'); }}
        onEditRecipe={handleEdit}
        onCreateRecipe={() => { setSelectedId(null); setView('create_recipe'); }}
        onCreateSubRecipe={() => { setSelectedId(null); setView('create_subrecipe'); }}
        onCreateCombo={() => { setSelectedId(null); setView('create_combo'); }}
      />
    </div>
  );
}
