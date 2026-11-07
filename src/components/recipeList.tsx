import { useState, useMemo } from 'react';
import { db } from '../db/localDb';
import { deleteRecordFromFirestore, bulkDeleteRecords } from '../services/syncService';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe } from '../types';
import { getEffectiveImpoconsumoRate } from '../types/settings';
import { DEFAULT_SETTINGS } from '../db/settingsStore';
import { calculateGrossMargin, classifyProfitability } from '../utils/finance';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';
import BulkActionBar from './ui/BulkActionBar';
import ProduceSubRecipeModal from './inventory/ProduceSubRecipeModal';
import { flexibleMultiMatch } from '../utils/searchEngine';

interface RecipeListProps {
  onSelectRecipe: (id: string) => void;
  onEditRecipe: (id: string, isSub: boolean, isCombo?: boolean) => void;
  onCreateRecipe: () => void;
  onCreateSubRecipe: () => void;
  onCreateCombo: () => void;
}

export default function RecipeList({
  onSelectRecipe,
  onEditRecipe,
  onCreateRecipe,
  onCreateSubRecipe,
  onCreateCombo
}: RecipeListProps) {
  // Load IndexedDB states reactively
  const recipes = useLiveQuery(() => db.recipes.toArray()) || [];
  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  const taxPercentage = getEffectiveImpoconsumoRate(systemSettings);
  const thresholdHigh = systemSettings['profitabilityThresholdHigh'] !== undefined ? Number(systemSettings['profitabilityThresholdHigh']) : 60;
  const thresholdMedium = systemSettings['profitabilityThresholdMedium'] !== undefined ? Number(systemSettings['profitabilityThresholdMedium']) : 30;
  const masterCategories = (systemSettings['master_categories'] as string[]) || DEFAULT_SETTINGS.master_categories;

  // Filter and Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'recipe' | 'subrecipe' | 'combo'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedProfitability, setSelectedProfitability] = useState<'ALL' | 'Alta' | 'Media' | 'Baja'>('ALL');
  const [hoveredTooltip, setHoveredTooltip] = useState<'recipe' | 'subrecipe' | 'combo' | null>(null);

  // Cost editing states
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [tempCost, setTempCost] = useState<number>(0);

  // Deletion and Preview states
  const [deleteRecipeId, setDeleteRecipeId] = useState<string | null>(null);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);

  // Subrecipe batch production modal state
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  const [produceSubRecipeId, setProduceSubRecipeId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'CARDS' | 'LIST'>('CARDS');

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedType('ALL');
    setSelectedCategory('Todos');
    setSelectedProfitability('ALL');
  };

  // Filter Logic over Dexie live query data
  const filteredList = useMemo(() => {
    return recipes.filter(item => {
      // 1. Text Search matching name, description, category or ID
      const matchesSearch = flexibleMultiMatch([item.name, item.description, item.category, item.id], searchQuery);

      // 2. Product Type matching
      let matchesType = true;
      if (selectedType === 'recipe') {
        matchesType = !item.isSubRecipe && !item.isCombo;
      } else if (selectedType === 'subrecipe') {
        matchesType = !!item.isSubRecipe;
      } else if (selectedType === 'combo') {
        matchesType = !!item.isCombo;
      }

      // 3. Category matching
      const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;

      // 4. Profitability matching
      let matchesProfitability = true;
      if (selectedProfitability !== 'ALL') {
        const margin = calculateGrossMargin(item.sellPrice || 0, item.costPrice || 0, taxPercentage);
        const classification = classifyProfitability(margin, thresholdHigh, thresholdMedium, !!item.isSubRecipe, item.sellPrice || 0);
        matchesProfitability = classification === selectedProfitability;
      }

      return matchesSearch && matchesType && matchesCategory && matchesProfitability;
    });
  }, [recipes, searchQuery, selectedType, selectedCategory, selectedProfitability, taxPercentage, thresholdHigh, thresholdMedium]);

  // Clone Recipe Handler
  const handleDuplicate = async (recipe: Recipe) => {
    try {
      const newId = `rec-${recipe.name.toLowerCase().replace(/\s+/g, '-')}-copy-${Date.now().toString().slice(-4)}`;
      const cloned: Recipe = {
        ...recipe,
        id: newId,
        name: `Copia de ${recipe.name}`,
        updatedAt: new Date().toISOString()
      };
      await db.recipes.put(cloned);
      toast.success(`Receta "${recipe.name}" duplicada exitosamente como "${cloned.name}".`);
    } catch (err) {
      console.error('Failed to duplicate recipe:', err);
      toast.error('Error al duplicar la receta en IndexedDB.');
    }
  };

  // Delete Recipe Handler
  const confirmDelete = async () => {
    if (!deleteRecipeId) return;
    try {
      await deleteRecordFromFirestore('recipes', deleteRecipeId);
      toast.success('Receta eliminada exitosamente.');
    } catch (err) {
      console.error('Failed to delete recipe:', err);
      toast.error('Error al eliminar la receta.');
    } finally {
      setDeleteRecipeId(null);
    }
  };

  // Bulk Delete Recipes Handler
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDeleteRecords('recipes', selectedIds);
      toast.success(`${selectedIds.length} elemento(s) eliminado(s) exitosamente.`);
      setSelectedIds([]);
    } catch (err) {
      console.error('Failed to bulk delete recipes:', err);
      toast.error('Error al eliminar los elementos seleccionados.');
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  const saveCostChange = async (id: string) => {
    try {
      await db.recipes.update(id, {
        costPrice: tempCost,
        updatedAt: new Date().toISOString()
      });
      setEditingCostId(null);
      toast.success('Costo actualizado exitosamente.');
    } catch (err) {
      console.error('Failed to update cost price:', err);
      toast.error('Error al guardar el nuevo costo.');
    }
  };

  // Calculate profitability status
  const getProfitabilityStatus = (item: any) => {
    if (item.isSubRecipe) {
      return {
        label: 'N/A',
        color: 'bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-450 border border-slate-200/50 dark:border-line',
        dotColor: 'bg-slate-450',
        level: 'N/A' as const
      };
    }
    const sellPrice = item.sellPrice || 0;
    if (sellPrice <= 0) {
      return {
        label: 'Sin Venta',
        color: 'bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-450 border border-slate-200/50 dark:border-line',
        dotColor: 'bg-slate-400',
        level: 'Sin Venta' as const
      };
    }

    const margin = calculateGrossMargin(sellPrice, item.costPrice || 0, taxPercentage);
    const classification = classifyProfitability(margin, thresholdHigh, thresholdMedium, !!item.isSubRecipe, sellPrice);

    if (classification === 'Alta') {
      return {
        label: `Alta (${Math.round(margin)}%)`,
        color: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 dark:border-emerald-500/10',
        dotColor: 'bg-[#22C55E]',
        level: 'Alta' as const
      };
    } else if (classification === 'Media') {
      return {
        label: `Media (${Math.round(margin)}%)`,
        color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-550 border border-yellow-500/20 dark:border-yellow-500/10',
        dotColor: 'bg-[#EAB308]',
        level: 'Media' as const
      };
    } else {
      return {
        label: `Baja (${Math.round(margin)}%)`,
        color: 'bg-rose-500/10 text-rose-500 border border-rose-500/20 dark:border-rose-500/10',
        dotColor: 'bg-[#EF4444]',
        level: 'Baja' as const
      };
    }
  };

  return (
    <div className="space-y-8">
      {/* Main Header Console Container */}
      <header className="bg-surface p-5 rounded-[2rem] border border-line shadow-sm flex flex-col gap-4">
        {/* Fila 1 (Superior) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 pb-4 border-b border-line-subtle">
          {/* Title & Subtitle */}
          <div className="flex flex-col justify-center shrink-0">
            <h1 className="text-2xl font-headline font-black text-content leading-none">
              Recetario
            </h1>
            <p className="text-content-secondary text-[10px] mt-1.5 font-semibold">
              Gestión de Costeo e Ingeniería de menús.
            </p>
          </div>

          {/* Search Bar (flex-1 to fill center space, ampliado un 30%) */}
          <div className="flex-1 min-w-[260px] max-w-[580px] lg:mx-4 flex items-center gap-2.5 bg-slate-50 dark:bg-[var(--card-color)] px-3.5 py-2 rounded-xl border border-slate-200/20 dark:border-line">
            <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Buscar recetas por nombre, SKU o ingredientes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder-slate-500 text-content"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-650 cursor-pointer">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          {/* Creation Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 lg:ml-auto">
            <button
              onClick={() => {
                setProduceSubRecipeId(undefined);
                setIsProduceModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-full shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
              title="Registrar producción de lotes de subrecetas"
            >
              <span className="material-symbols-outlined text-sm font-bold">skillet</span>
              + Producir Lote
            </button>
            <button
              onClick={onCreateRecipe}
              className="px-4 py-2 bg-[var(--accent-pink)] hover:opacity-90 text-white text-xs font-black rounded-full shadow-md shadow-[var(--accent-pink)]/20 cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-sm font-bold">add</span>
              Nueva Receta
            </button>
            <button
              onClick={onCreateSubRecipe}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-[var(--card-color)] dark:hover:bg-slate-750 dark:text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">rebase_edit</span>
              + Crear Subreceta
            </button>
            <button
              onClick={onCreateCombo}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-[var(--card-color)] dark:hover:bg-slate-750 dark:text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">layers</span>
              + Crear Combo
            </button>
          </div>
        </div>

        {/* Fila 2 (Inferior) - Disposición optimizada en una sola fila */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
            {/* Category Selector (Compacto para encajar en una sola fila) */}
            <div className="shrink-0 w-full sm:w-44 lg:w-48">
              <CustomSelect
                value={selectedCategory}
                onChange={setSelectedCategory}
                options={[
                  { value: 'Todos', label: 'Todas las Categorías' },
                  ...masterCategories.map(cat => ({ value: cat, label: cat }))
                ]}
                className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200/40 dark:border-line rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-350"
              />
            </div>

            {/* Chips Group */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* Tipología */}
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-[var(--card-color)]/60 p-1 rounded-xl border border-slate-200/20 dark:border-line">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1.5">Tipología:</span>
                <button
                  onClick={() => setSelectedType('ALL')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'ALL'
                      ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                    }`}
                >
                  Todos
                </button>

                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => setSelectedType('recipe')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'recipe'
                        ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    Recetas
                  </button>
                  <span
                    onMouseEnter={() => setHoveredTooltip('recipe')}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    onClick={() => setHoveredTooltip(hoveredTooltip === 'recipe' ? null : 'recipe')}
                    className="material-symbols-outlined text-[14px] text-slate-400 hover:text-[var(--accent-purple)] cursor-pointer shrink-0"
                  >
                    info
                  </span>
                  {hoveredTooltip === 'recipe' && (
                    <div className="absolute bottom-8 left-0 w-64 bg-neutral-900 text-white p-3 rounded-xl border border-line shadow-2xl z-50 text-[10px] leading-relaxed animate-fade-in">
                      <p className="font-bold text-[var(--accent-purple)] mb-1">Receta Técnica</p>
                      Plato final o trago de venta al cliente. Descuenta insumos del inventario automáticamente al facturarse.
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => setSelectedType('subrecipe')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'subrecipe'
                        ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    Subrecetas
                  </button>
                  <span
                    onMouseEnter={() => setHoveredTooltip('subrecipe')}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    onClick={() => setHoveredTooltip(hoveredTooltip === 'subrecipe' ? null : 'subrecipe')}
                    className="material-symbols-outlined text-[14px] text-slate-400 hover:text-[var(--accent-purple)] cursor-pointer shrink-0"
                  >
                    info
                  </span>
                  {hoveredTooltip === 'subrecipe' && (
                    <div className="absolute bottom-8 left-0 w-64 bg-neutral-900 text-white p-3 rounded-xl border border-line shadow-2xl z-50 text-[10px] leading-relaxed animate-fade-in">
                      <p className="font-bold text-cyan-400 mb-1">Subreceta</p>
                      Preparación intermedia producida por lotes (salsas, bases de bar, adobos) para formar parte de múltiples recetas del menú.
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => setSelectedType('combo')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'combo'
                        ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    Combos
                  </button>
                  <span
                    onMouseEnter={() => setHoveredTooltip('combo')}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    onClick={() => setHoveredTooltip(hoveredTooltip === 'combo' ? null : 'combo')}
                    className="material-symbols-outlined text-[14px] text-slate-400 hover:text-[var(--accent-purple)] cursor-pointer shrink-0"
                  >
                    info
                  </span>
                  {hoveredTooltip === 'combo' && (
                    <div className="absolute bottom-8 left-0 w-64 bg-neutral-900 text-white p-3 rounded-xl border border-line shadow-2xl z-50 text-[10px] leading-relaxed animate-fade-in">
                      <p className="font-bold text-purple-400 mb-1">Combo Promocional</p>
                      Agrupación comercial de múltiples platos y bebidas existentes para venderse juntos con un descuento o pack.
                    </div>
                  )}
                </div>
              </div>

              {/* Rentabilidad + Icono Limpiar Filtros */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-[var(--card-color)]/60 p-1 rounded-xl border border-slate-200/20 dark:border-line">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-1.5">Rentabilidad:</span>
                  <button
                    onClick={() => setSelectedProfitability('ALL')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedProfitability === 'ALL'
                        ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    Todos
                  </button>

                  <button
                    onClick={() => setSelectedProfitability('Alta')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${selectedProfitability === 'Alta'
                        ? 'bg-white dark:bg-slate-700 text-emerald-500 font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
                    Alta
                  </button>

                  <button
                    onClick={() => setSelectedProfitability('Media')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${selectedProfitability === 'Media'
                        ? 'bg-white dark:bg-slate-700 text-[#EAB308] font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308]"></span>
                    Media
                  </button>

                  <button
                    onClick={() => setSelectedProfitability('Baja')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${selectedProfitability === 'Baja'
                        ? 'bg-white dark:bg-slate-700 text-[#EF4444] font-black shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>
                    Baja
                  </button>
                </div>

                {(searchQuery || selectedType !== 'ALL' || selectedCategory !== 'Todos' || selectedProfitability !== 'ALL') && (
                  <button
                    onClick={handleResetFilters}
                    title="Limpiar filtros"
                    aria-label="Limpiar filtros"
                    className="p-1.5 border border-line/80 bg-inset hover:bg-rose-500/10 hover:border-rose-500/30 text-content-secondary hover:text-rose-500 rounded-xl transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined text-base">filter_alt_off</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions & View Mode Toggle */}
          <div className="xl:ml-auto shrink-0 flex items-center justify-end gap-2">
            {/* View Mode Toggle: Cards vs List */}
            <div className="flex items-center gap-1 bg-raised p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === 'CARDS'
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Vista Cuadrícula (Cards)"
              >
                <span className="material-symbols-outlined text-sm font-bold">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  viewMode === 'LIST'
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                title="Vista Lista (Tabla)"
              >
                <span className="material-symbols-outlined text-sm font-bold">table_rows</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Unified List Grid */}
      {recipes.length === 0 ? (
        <section className="bg-surface border border-line rounded-3xl p-12 flex flex-col items-center text-center max-w-xl mx-auto space-y-4 shadow-sm animate-fade-in">
          <div className="w-16 h-16 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl">menu_book</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-black text-content uppercase tracking-wider">No hay recetas creadas</h4>
            <p className="text-xs text-content-secondary max-w-sm">Haga clic en 'Nueva Receta', 'Subreceta' o 'Combo' para comenzar a catalogar sus platos y calcular costos en tiempo real.</p>
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              onClick={onCreateRecipe}
              className="px-5 py-2.5 bg-[var(--accent-pink)] hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-md shadow-[var(--accent-pink)]/20 cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm font-bold">add</span>
              Nueva Receta
            </button>
            <button
              onClick={onCreateSubRecipe}
              className="px-4 py-2.5 bg-slate-100 dark:bg-[var(--card-color)] text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm font-bold">soup_kitchen</span>
              Nueva Subreceta
            </button>
            <button
              onClick={onCreateCombo}
              className="px-4 py-2.5 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-xl cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm font-bold">fastfood</span>
              Nuevo Combo
            </button>
          </div>
        </section>
      ) : filteredList.length === 0 ? (
        <section className="bg-surface border border-line rounded-3xl p-12 flex flex-col items-center text-center max-w-xl mx-auto space-y-4 shadow-sm animate-fade-in">
          <div className="w-14 h-14 bg-raised text-slate-400 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">filter_alt_off</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-black text-content uppercase tracking-wider">No se encontraron artículos</h4>
            <p className="text-xs text-slate-500 max-w-sm">No existen recetas, subrecetas o combos que coincidan con los filtros aplicados.</p>
          </div>
          <div className="pt-2 flex gap-3">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-raised text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Limpiar Filtros
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {/* Header Selección Múltiple */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-inset rounded-xl border border-line text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filteredList.length > 0 && selectedIds.length === filteredList.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(filteredList.map(item => item.id));
                  } else {
                    setSelectedIds([]);
                  }
                }}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
              />
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Seleccionar todos ({filteredList.length})
              </span>
            </label>
            {selectedIds.length > 0 && (
              <span className="text-purple-600 dark:text-purple-400 font-bold text-xs">
                {selectedIds.length} seleccionados
              </span>
            )}
          </div>

          {viewMode === 'CARDS' ? (
            <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {filteredList.map(item => {
              const profitInfo = getProfitabilityStatus(item);

              // Item Type badge logic
              const typeLabel = item.isSubRecipe ? 'SUBRECETA' : item.isCombo ? 'COMBO' : 'RECETA';
              const typeBadgeColor = item.isSubRecipe 
                ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300' 
                : item.isCombo 
                  ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-300' 
                  : 'bg-slate-100 text-slate-700 dark:bg-raised dark:text-slate-300';

              const defaultImg = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';

              return (
                <div
                  key={item.id}
                  className={`bg-surface rounded-3xl overflow-hidden shadow-sm border ${
                    selectedIds.includes(item.id)
                      ? 'border-purple-500 ring-2 ring-purple-500/20'
                      : 'border-line/80'
                  } flex flex-col justify-between relative group hover:shadow-md transition-all duration-350 animate-fade-in`}
                >
                  {/* Image Box */}
                  <div className="w-full aspect-square relative overflow-hidden bg-slate-100 dark:bg-[var(--card-color)]">
                    <img
                      src={item.img || defaultImg}
                      alt={item.name}
                      onClick={() => onSelectRecipe(item.id)}
                      className="w-full h-full object-cover cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent pointer-events-none"></div>

                    {/* Floating Selection Checkbox */}
                    <label
                      className={`absolute top-3 right-3 z-10 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                        selectedIds.includes(item.id)
                          ? 'bg-purple-600 text-white shadow-md scale-105'
                          : 'bg-overlay hover:bg-overlay text-white backdrop-blur-sm'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedIds(prev =>
                            prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                          );
                        }}
                        className="hidden"
                      />
                      <span className="material-symbols-outlined text-[18px]">
                        {selectedIds.includes(item.id) ? 'check' : 'check_box_outline_blank'}
                      </span>
                    </label>

                    {/* Floating type badge */}
                    <span className={`absolute top-3 left-3 text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${typeBadgeColor}`}>
                      {typeLabel}
                    </span>

                    {/* Floating cost badge */}
                    <span className="absolute bottom-3 left-3 bg-overlay text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                      {item.isSubRecipe ? 'Subreceta Lote' : `$${(item.sellPrice || 0).toLocaleString('es-CO')}`}
                    </span>
                  </div>

                  {/* Content description */}
                  <div className="p-5 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          onClick={() => onSelectRecipe(item.id)}
                          className="text-sm font-black text-content truncate hover:text-[var(--accent-purple)] cursor-pointer transition-colors flex-1"
                        >
                          {item.name}
                        </h4>
                        {profitInfo.level !== 'N/A' && profitInfo.level !== 'Sin Venta' && (
                          <div className="group relative shrink-0">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full cursor-help"
                              style={{
                                backgroundColor: profitInfo.level === 'Alta' ? '#22C55E' : profitInfo.level === 'Media' ? '#EAB308' : '#EF4444'
                              }}
                            />
                            {profitInfo.level === 'Baja' && (
                              <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block w-48 bg-canvas text-white text-[9px] p-2 rounded-lg shadow-xl text-center z-35 font-semibold leading-snug">
                                Margen por debajo del umbral objetivo. Revisar costeo.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold truncate">Cat: {item.category}</p>

                      {/* Expose CMV cost detail */}
                      <div className="mt-2.5 flex items-center justify-between text-[10px] bg-slate-50 dark:bg-[var(--card-color)]/50 p-2 rounded-xl border border-slate-200/20 dark:border-line">
                        <span className="text-slate-400 font-semibold">Costo Prod:</span>
                        {editingCostId === item.id ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              type="number"
                              value={tempCost}
                              onChange={(e) => setTempCost(Number(e.target.value) || 0)}
                              className="w-16 bg-white dark:bg-slate-750 border border-line text-[10px] p-0.5 rounded text-right font-mono text-slate-950 dark:text-white"
                            />
                            <button onClick={() => saveCostChange(item.id)} className="text-emerald-500">
                              <span className="material-symbols-outlined text-sm font-bold">check</span>
                            </button>
                            <button onClick={() => setEditingCostId(null)} className="text-rose-500">
                              <span className="material-symbols-outlined text-sm font-bold">close</span>
                            </button>
                          </div>
                        ) : (
                          <span className="font-bold font-mono text-content-secondary">
                            ${(item.costPrice || 0).toLocaleString('es-CO')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Profitability Semaphore & Quick hover actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
                      {/* Semáforo badge */}
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Margen</span>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full mt-0.5 ${profitInfo.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${profitInfo.dotColor}`}></span>
                          {profitInfo.label}
                        </span>
                      </div>

                      {/* Standard operations buttons & Quick Hover actions */}
                      <div className="flex items-center gap-1">
                        {/* Quick Produce for subrecipes */}
                        {item.isSubRecipe && (
                          <button
                            onClick={() => {
                              setProduceSubRecipeId(item.id);
                              setIsProduceModalOpen(true);
                            }}
                            className="p-1 text-slate-450 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                            title="Producir lote de esta subreceta"
                          >
                            <span className="material-symbols-outlined text-sm font-bold">skillet</span>
                          </button>
                        )}

                        {/* Duplicate action */}
                        <button
                          onClick={() => handleDuplicate(item)}
                          className="p-1 text-slate-450 hover:text-cyan-500 hover:bg-slate-50 dark:hover:bg-raised rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                          title="Duplicar estructura de receta"
                        >
                          <span className="material-symbols-outlined text-sm">content_copy</span>
                        </button>

                        {/* Edit form */}
                        <button
                          onClick={() => onEditRecipe(item.id, item.isSubRecipe, item.isCombo)}
                          className="p-1 text-slate-450 hover:text-[var(--accent-purple)] hover:bg-slate-50 dark:hover:bg-raised rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                          title="Editar ficha completa"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteRecipeId(item.id)}
                          className="p-1 text-slate-450 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-raised rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                          title="Eliminar"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </section>
          ) : (
            <div className="bg-surface border border-line rounded-3xl shadow-sm overflow-hidden transition-all animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/95 dark:bg-surface/95 backdrop-blur-sm sticky top-0 z-10 text-[10px] font-extrabold uppercase tracking-wider text-content-secondary border-b border-line">
                    <tr>
                      <th className="py-4 px-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={filteredList.length > 0 && selectedIds.length === filteredList.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(filteredList.map(item => item.id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                        />
                      </th>
                      <th className="py-4 px-6">Plato / Receta</th>
                      <th className="py-4 px-4">Categoría</th>
                      <th className="py-4 px-4">Tipo</th>
                      <th className="py-4 px-4 text-right">Costo Prod.</th>
                      <th className="py-4 px-4 text-right">PVP (Mesa)</th>
                      <th className="py-4 px-4">Margen Bruto</th>
                      <th className="py-4 px-6 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/80 text-xs font-semibold">
                    {filteredList.map(item => {
                      const profitInfo = getProfitabilityStatus(item);
                      const typeLabel = item.isSubRecipe ? 'SUBRECETA' : item.isCombo ? 'COMBO' : 'RECETA';
                      const typeBadgeColor = item.isSubRecipe 
                        ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300' 
                        : item.isCombo 
                          ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-300' 
                          : 'bg-slate-100 text-slate-700 dark:bg-raised dark:text-slate-300';
                      const defaultImg = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';

                      return (
                        <tr
                          key={item.id}
                          onClick={() => onSelectRecipe(item.id)}
                          className={`hover:bg-slate-50 dark:hover:bg-raised/40 transition-colors cursor-pointer ${
                            selectedIds.includes(item.id) ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''
                          }`}
                        >
                          <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedIds(prev =>
                                  prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                                );
                              }}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                            />
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.img || defaultImg}
                                alt={item.name}
                                className="w-10 h-10 rounded-xl object-cover shrink-0 border border-line"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-content truncate hover:text-[var(--accent-purple)] transition-colors">
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-[10px] text-slate-400 truncate max-w-xs">{item.description}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-raised text-content-secondary text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-line">
                              {item.category || 'General'}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${typeBadgeColor}`}>
                              {typeLabel}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-bold text-content-secondary">
                            ${(item.costPrice || 0).toLocaleString('es-CO')}
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-black text-content">
                            {item.isSubRecipe ? (
                              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">Subreceta Lote</span>
                            ) : (
                              `$${(item.sellPrice || 0).toLocaleString('es-CO')}`
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${profitInfo.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${profitInfo.dotColor}`}></span>
                              {profitInfo.label}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {item.isSubRecipe && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProduceSubRecipeId(item.id);
                                    setIsProduceModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                                  title="Producir lote de subreceta"
                                >
                                  <span className="material-symbols-outlined text-base font-bold">skillet</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDuplicate(item)}
                                className="p-1.5 text-slate-400 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-raised rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                                title="Duplicar estructura de receta"
                              >
                                <span className="material-symbols-outlined text-base">content_copy</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditRecipe(item.id, item.isSubRecipe, item.isCombo)}
                                className="p-1.5 text-slate-400 hover:text-[var(--accent-purple)] hover:bg-slate-100 dark:hover:bg-raised rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                                title="Editar ficha completa"
                              >
                                <span className="material-symbols-outlined text-base">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteRecipeId(item.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-raised rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                                title="Eliminar"
                              >
                                <span className="material-symbols-outlined text-base">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lack of plates prompt card */}
      <section className="bg-slate-100/40 dark:bg-surface border border-slate-200/20 rounded-3xl p-8 flex flex-col items-center text-center max-w-xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-slate-200 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-350 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl">restaurant</span>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-black text-content uppercase tracking-wider">¿Falta algún plato?</h4>
          <p className="text-xs text-slate-500 max-w-sm">Agrega una nueva receta para sincronizar automáticamente con tu inventario y calcular márgenes.</p>
        </div>
        <button
          onClick={onCreateRecipe}
          className="text-xs font-black text-[var(--accent-purple)] hover:underline cursor-pointer flex items-center gap-1"
        >
          Agregar receta base
          <span className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
        </button>
      </section>
      {selectedFullImage && (
        <Modal title="Vista de Imagen" onClose={() => setSelectedFullImage(null)}>
          <div className="flex justify-center items-center p-2 bg-canvas/10 rounded-2xl">
            <img 
              src={selectedFullImage} 
              alt="Full Screen Recipe" 
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </Modal>
      )}

      {deleteRecipeId && (
        <ConfirmDialog
          isOpen={!!deleteRecipeId}
          title="Eliminar Receta"
          message="¿Estás seguro de que deseas eliminar esta receta? Esta acción no se puede deshacer."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteRecipeId(null)}
        />
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
      />

      {/* Bulk Delete Confirm Dialog */}
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          isOpen={showBulkDeleteConfirm}
          title="Eliminación Múltiple de Recetas"
          message={`¿Estás seguro de que deseas eliminar permanentemente ${selectedIds.length} elemento(s)? Esta acción eliminará los registros de forma transaccional tanto localmente como en la nube y no se puede deshacer.`}
          confirmText={`Eliminar ${selectedIds.length} elementos`}
          cancelText="Cancelar"
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
          variant="danger"
        />
      )}

      {/* Subrecipe Batch Production Modal */}
      {isProduceModalOpen && (
        <ProduceSubRecipeModal
          isOpen={isProduceModalOpen}
          onClose={() => {
            setIsProduceModalOpen(false);
            setProduceSubRecipeId(undefined);
          }}
          initialSubRecipeId={produceSubRecipeId}
        />
      )}
    </div>
  );
}
