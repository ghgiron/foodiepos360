import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { getEffectiveImpoconsumoRate } from '../types/settings';
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
  const taxPercentage = getEffectiveImpoconsumoRate(systemSettings);

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

  // Safeguard: If view is 'create_recipe' but the target item is a subrecipe, route to 'create_subrecipe'
  useEffect(() => {
    if (view === 'create_recipe' && selectedId) {
      const rec = recipes.find(r => r.id === selectedId);
      if (rec?.isSubRecipe) {
        setView('create_subrecipe');
      } else if (rec?.isCombo) {
        setView('create_combo');
      }
    }
  }, [view, selectedId, recipes]);

  // View state switcher router
  if (view === 'detail' && selectedId) {
    const selectedRecipe = recipes.find(r => r.id === selectedId);
    return (
      <RecipeDetail 
        recipeId={selectedId} 
        onBack={() => { setView('list'); setSelectedId(null); }} 
        onEdit={(isSub?: boolean) => {
          if (isSub || selectedRecipe?.isSubRecipe) {
            setView('create_subrecipe');
          } else if (selectedRecipe?.isCombo) {
            setView('create_combo');
          } else {
            setView('create_recipe');
          }
        }}
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
    <div className="p-8 space-y-8 transition-receitly font-sans text-content">
      
      {/* KPI Cards Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Recetas */}
        <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between h-32">
          <span className="text-[10px] font-black uppercase tracking-wider text-content-secondary">Total Recetas / Artículos</span>
          <div>
            <h2 className="text-3xl font-black text-content leading-none">
              {recipes.filter(r => !r.isSubRecipe).length}
            </h2>
            <span className="text-[9px] text-emerald-500 font-extrabold block mt-2">▲ Sincronizado</span>
          </div>
        </div>

        {/* Recetas con Bajo Margen */}
        <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between h-32 border-l-4 border-l-rose-500">
          <span className="text-[10px] font-black uppercase tracking-wider text-content-secondary">Rentabilidad Crítica</span>
          <div>
            <h2 className="text-3xl font-black text-rose-500 leading-none">{kpis.lowMargin}</h2>
            <span className="text-[9px] text-rose-500 font-extrabold block mt-2">▲ Requiere revisión de costos (Margen &lt; {minUtilityMargin}%)</span>
          </div>
        </div>

        {/* Estado */}
        <div className="bg-surface p-6 rounded-3xl shadow-sm border border-line flex flex-col justify-between h-32 border-l-4 border-l-emerald-500">
          <span className="text-[10px] font-black uppercase tracking-wider text-content-secondary">Estado</span>
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
