import { useState, useMemo } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe } from '../types';
import { DEFAULT_SETTINGS } from '../db/settingsStore';
import { calculateGrossMargin, classifyProfitability } from '../utils/finance';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';

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

  const taxPercentage = systemSettings['taxPercentage'] !== undefined ? Number(systemSettings['taxPercentage']) : 8;
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

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedType('ALL');
    setSelectedCategory('Todos');
    setSelectedProfitability('ALL');
  };

  // Mock data fallback if database is completely empty
  const mockRecipes = [
    {
      id: 'rec-hamburguesa-picara',
      name: 'Hamburguesa Pícara',
      description: 'Hamburguesa con salsa picante especial, cheddar y tocineta ahumada.',
      category: 'Burgers',
      costPrice: 11515,
      sellPrice: 32900,
      prepTime: 15,
      difficulty: 'Media',
      cmvPercentage: 35,
      isSubRecipe: false,
      isCombo: false,
      img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rec-sushi-especial',
      name: 'Sushi Roll Especial',
      description: 'Sushi uramaki con palmitos de cangrejo, aguacate, queso crema y sésamo.',
      category: 'Sushi',
      costPrice: 9200,
      sellPrice: 28000,
      prepTime: 25,
      difficulty: 'Alta',
      cmvPercentage: 33,
      isSubRecipe: false,
      isCombo: false,
      img: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80',
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rec-tacos-pastor',
      name: 'Tacos al Pastor',
      description: 'Tacos tradicionales mexicanos de cerdo adobado con piña, cilantro y cebolla.',
      category: 'Especiales del Chef',
      costPrice: 5800,
      sellPrice: 19500,
      prepTime: 10,
      difficulty: 'Baja',
      cmvPercentage: 30,
      isSubRecipe: false,
      isCombo: false,
      img: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=400&q=80',
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rec-gin-botanico',
      name: 'Gin Tonic Botánico',
      description: 'Cóctel refrescante con Ginebra premium, agua tónica, bayas de enebro y romero.',
      category: 'Cocteles',
      costPrice: 9500,
      sellPrice: 24900,
      prepTime: 5,
      difficulty: 'Baja',
      cmvPercentage: 38,
      isSubRecipe: false,
      isCombo: false,
      img: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
      ingredients: [],
      yieldFactor: 1,
      updatedAt: new Date().toISOString()
    }
  ];

  const displayList = recipes.length > 0 ? recipes : mockRecipes;

  // Filter Logic
  const filteredList = useMemo(() => {
    return displayList.filter(item => {
      // 1. Text Search matching name, description or category
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = q === '' ||
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q);

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
  }, [displayList, searchQuery, selectedType, selectedCategory, selectedProfitability, taxPercentage, thresholdHigh, thresholdMedium]);

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
      await db.recipes.delete(deleteRecipeId);
      toast.success('Receta eliminada exitosamente.');
    } catch (err) {
      console.error('Failed to delete recipe:', err);
      toast.error('Error al eliminar la receta.');
    } finally {
      setDeleteRecipeId(null);
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
        color: 'bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-450 border border-slate-200/50 dark:border-slate-700/50',
        dotColor: 'bg-slate-450',
        level: 'N/A' as const
      };
    }
    const sellPrice = item.sellPrice || 0;
    if (sellPrice <= 0) {
      return {
        label: 'Sin Venta',
        color: 'bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-450 border border-slate-200/50 dark:border-slate-700/50',
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
      <header className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/85 shadow-sm flex flex-col gap-4">
        {/* Fila 1 (Superior) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
          {/* Title & Subtitle */}
          <div className="flex flex-col justify-center shrink-0">
            <h1 className="text-2xl font-headline font-black text-slate-900 dark:text-white leading-none">
              Recetario
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-1.5 font-semibold">
              Gestión de Costeo e Ingeniería de menús.
            </p>
          </div>

          {/* Search Bar (flex-1 to fill center space) */}
          <div className="flex-1 min-w-[200px] max-w-md lg:mx-4 flex items-center gap-2.5 bg-slate-50 dark:bg-[var(--card-color)] px-3.5 py-2 rounded-xl border border-slate-200/20 dark:border-slate-700/60">
            <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Buscar recetas por nombre, SKU o ingredientes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder-slate-500 text-slate-900 dark:text-white"
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

        {/* Fila 2 (Inferior) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Category Selector */}
          <div className="shrink-0 w-full lg:w-48">
            <CustomSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={[
                { value: 'Todos', label: 'Todas las Categorías' },
                ...masterCategories.map(cat => ({ value: cat, label: cat }))
              ]}
              className="w-full bg-slate-50 dark:bg-[var(--card-color)] border border-slate-200/40 dark:border-slate-700/60 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-350"
            />
          </div>

          {/* Chips Group */}
          <div className="flex flex-wrap items-center gap-4 lg:gap-6">
            {/* Tipología */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-[var(--card-color)]/60 p-1 rounded-xl border border-slate-200/20 dark:border-slate-700/40">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2">Tipología:</span>
              <button
                onClick={() => setSelectedType('ALL')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                Todos
              </button>

              <div className="flex items-center gap-1 relative">
                <button
                  onClick={() => setSelectedType('recipe')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'recipe'
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
                  className="material-symbols-outlined text-[15px] text-slate-400 hover:text-[var(--accent-purple)] cursor-pointer shrink-0"
                >
                  info
                </span>
                {hoveredTooltip === 'recipe' && (
                  <div className="absolute bottom-8 left-0 w-64 bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-2xl z-50 text-[10px] leading-relaxed animate-fade-in">
                    <p className="font-bold text-[var(--accent-purple)] mb-1">Receta Técnica</p>
                    Plato final o trago de venta al cliente. Descuenta insumos del inventario automáticamente al facturarse.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 relative">
                <button
                  onClick={() => setSelectedType('subrecipe')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'subrecipe'
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
                  className="material-symbols-outlined text-[15px] text-slate-400 hover:text-[var(--accent-purple)] cursor-pointer shrink-0"
                >
                  info
                </span>
                {hoveredTooltip === 'subrecipe' && (
                  <div className="absolute bottom-8 left-0 w-64 bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-2xl z-50 text-[10px] leading-relaxed animate-fade-in">
                    <p className="font-bold text-cyan-400 mb-1">Subreceta</p>
                    Preparación intermedia producida por lotes (salsas, bases de bar, adobos) para formar parte de múltiples recetas del menú.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 relative">
                <button
                  onClick={() => setSelectedType('combo')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedType === 'combo'
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
                  className="material-symbols-outlined text-[15px] text-slate-400 hover:text-[var(--accent-purple)] cursor-pointer shrink-0"
                >
                  info
                </span>
                {hoveredTooltip === 'combo' && (
                  <div className="absolute bottom-8 left-0 w-64 bg-slate-900 text-white p-3 rounded-xl border border-slate-800 shadow-2xl z-50 text-[10px] leading-relaxed animate-fade-in">
                    <p className="font-bold text-purple-400 mb-1">Combo Promocional</p>
                    Agrupación comercial de múltiples platos y bebidas existentes para venderse juntos con un descuento o pack.
                  </div>
                )}
              </div>
            </div>

            {/* Rentabilidad */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-[var(--card-color)]/60 p-1 rounded-xl border border-slate-200/20 dark:border-slate-700/40">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2">Rentabilidad:</span>
              <button
                onClick={() => setSelectedProfitability('ALL')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${selectedProfitability === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-[var(--accent-purple)] font-black shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                Todos
              </button>

              <button
                onClick={() => setSelectedProfitability('Alta')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${selectedProfitability === 'Alta'
                    ? 'bg-white dark:bg-slate-700 text-emerald-500 font-black shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span>
                Alta
              </button>

              <button
                onClick={() => setSelectedProfitability('Media')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${selectedProfitability === 'Media'
                    ? 'bg-white dark:bg-slate-700 text-[#EAB308] font-black shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308]"></span>
                Media
              </button>

              <button
                onClick={() => setSelectedProfitability('Baja')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${selectedProfitability === 'Baja'
                    ? 'bg-white dark:bg-slate-700 text-[#EF4444] font-black shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>
                Baja
              </button>
            </div>
          </div>

          {/* Right: Clear Filters Button */}
          <div className="lg:ml-auto shrink-0 w-full lg:w-auto flex justify-end">
            {(searchQuery || selectedType !== 'ALL' || selectedCategory !== 'Todos' || selectedProfitability !== 'ALL') && (
              <button
                onClick={handleResetFilters}
                className="w-full lg:w-auto px-4 py-2 border border-slate-200/50 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-450 dark:hover:text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                Limpiar Filtros
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Unified List Grid */}
      {filteredList.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-3xl p-12 flex flex-col items-center text-center max-w-xl mx-auto space-y-4 shadow-sm">
          <div className="w-14 h-14 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">restaurant_menu</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">No se encontraron artículos</h4>
            <p className="text-xs text-slate-500 max-w-sm">No existen recetas, subrecetas o combos que coincidan con la búsqueda o filtros aplicados.</p>
          </div>
          <div className="pt-2 flex gap-3">
            <button
              onClick={onCreateRecipe}
              className="px-4 py-2 bg-[var(--accent-pink)] hover:opacity-90 text-white font-bold text-xs rounded-full shadow-md shadow-[var(--accent-pink)]/20 cursor-pointer transition-colors"
            >
              Crear Receta
            </button>
            <button
              onClick={onCreateSubRecipe}
              className="px-4 py-2 bg-slate-100 dark:bg-[var(--card-color)] text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
            >
              Crear Subreceta
            </button>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {filteredList.map(item => {
            const profitInfo = getProfitabilityStatus(item);

            // Item Type badge logic
            const typeLabel = item.isSubRecipe ? 'SUBRECETA' : item.isCombo ? 'COMBO' : 'RECETA';
            const typeBadgeColor = item.isSubRecipe 
              ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300' 
              : item.isCombo 
                ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-300' 
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

            const defaultImg = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-200/50 dark:border-slate-800/80 flex flex-col justify-between relative group hover:shadow-md transition-all duration-350 animate-fade-in"
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



                  {/* Floating type badge */}
                  <span className={`absolute top-3 left-3 text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${typeBadgeColor}`}>
                    {typeLabel}
                  </span>

                  {/* Floating cost badge */}
                  <span className="absolute bottom-3 left-3 bg-slate-950/80 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                    {item.isSubRecipe ? 'Subreceta Lote' : `$${(item.sellPrice || 0).toLocaleString('es-CO')}`}
                  </span>
                </div>

                {/* Content description */}
                <div className="p-5 flex flex-col justify-between flex-1">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        onClick={() => onSelectRecipe(item.id)}
                        className="text-sm font-black text-slate-900 dark:text-white truncate hover:text-[var(--accent-purple)] cursor-pointer transition-colors flex-1"
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
                            <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block w-48 bg-slate-950 text-white text-[9px] p-2 rounded-lg shadow-xl text-center z-35 font-semibold leading-snug">
                              Margen por debajo del umbral objetivo. Revisar costeo.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 font-semibold truncate">Cat: {item.category}</p>

                    {/* Expose CMV cost detail */}
                    <div className="mt-2.5 flex items-center justify-between text-[10px] bg-slate-50 dark:bg-[var(--card-color)]/50 p-2 rounded-xl border border-slate-200/20 dark:border-slate-800">
                      <span className="text-slate-400 font-semibold">Costo Prod:</span>
                      {editingCostId === item.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            value={tempCost}
                            onChange={(e) => setTempCost(Number(e.target.value) || 0)}
                            className="w-16 bg-white dark:bg-slate-750 border border-slate-300 dark:border-slate-700 text-[10px] p-0.5 rounded text-right font-mono text-slate-950 dark:text-white"
                          />
                          <button onClick={() => saveCostChange(item.id)} className="text-emerald-500">
                            <span className="material-symbols-outlined text-sm font-bold">check</span>
                          </button>
                          <button onClick={() => setEditingCostId(null)} className="text-rose-500">
                            <span className="material-symbols-outlined text-sm font-bold">close</span>
                          </button>
                        </div>
                      ) : (
                        <span className="font-bold font-mono text-slate-700 dark:text-slate-300">
                          ${(item.costPrice || 0).toLocaleString('es-CO')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Profitability Semaphore & Quick hover actions */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
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
                      {/* Duplicate action */}
                      <button
                        onClick={() => handleDuplicate(item)}
                        className="p-1 text-slate-450 hover:text-cyan-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                        title="Duplicar estructura de receta"
                      >
                        <span className="material-symbols-outlined text-sm">content_copy</span>
                      </button>

                      {/* Edit form */}
                      <button
                        onClick={() => onEditRecipe(item.id, item.isSubRecipe, item.isCombo)}
                        className="p-1 text-slate-450 hover:text-[var(--accent-purple)] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                        title="Editar ficha completa"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteRecipeId(item.id)}
                        className="p-1 text-slate-450 hover:text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors border-none bg-transparent"
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
      )}

      {/* Lack of plates prompt card */}
      <section className="bg-slate-100/40 dark:bg-slate-900 border border-slate-200/20 rounded-3xl p-8 flex flex-col items-center text-center max-w-xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-slate-200 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-350 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl">restaurant</span>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">¿Falta algún plato?</h4>
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
          <div className="flex justify-center items-center p-2 bg-slate-950/10 rounded-2xl">
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
    </div>
  );
}
