import { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../db/localDb';
import type { Recipe, InventoryItem } from '../types';

interface OmniSearchProps {
  onSelectRecipe?: (id: string, isSub: boolean) => void;
  onSelectInventoryItem?: (id: string) => void;
}

export default function OmniSearch({ onSelectRecipe, onSelectInventoryItem }: OmniSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Database states
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [globalMinStock, setGlobalMinStock] = useState<number>(10);

  // Load data from Dexie IndexedDB
  useEffect(() => {
    async function loadSearchData() {
      try {
        const rList = await db.recipes.toArray();
        const iList = await db.inventoryItems.toArray();
        const sList = await db.systemSettings.toArray();
        const settingsMap = sList.reduce((acc, curr) => {
          acc[curr.key] = curr.value;
          return acc;
        }, {} as Record<string, any>);
        setRecipes(rList);
        setInventoryItems(iList);
        setGlobalMinStock(settingsMap['min_stock_alert_threshold'] !== undefined ? Number(settingsMap['min_stock_alert_threshold']) : 10);
      } catch (err) {
        console.error('Failed to load search data from IndexedDB:', err);
      }
    }

    if (isOpen) {
      loadSearchData();
    }
  }, [isOpen]);

  // Click outside to close handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [costRange, setCostRange] = useState<'All' | 'Low' | 'Medium' | 'Premium'>('All');
  const [stockAlertOnly, setStockAlertOnly] = useState<boolean>(false);

  // Available categories for filtering
  const categories = useMemo(() => {
    const cats = new Set<string>();
    recipes.forEach(r => {
      if (r.category) cats.add(r.isSubRecipe ? 'Subreceta' : r.category);
    });
    inventoryItems.forEach(i => {
      if (i.category) cats.add(i.category);
    });
    return ['Todos', ...Array.from(cats)];
  }, [recipes, inventoryItems]);

  // Unified Search indexing
  const filteredResults = useMemo(() => {
    const q = query.toLowerCase().trim();

    // 1. Process Recipes and Subrecipes
    const recipeResults = recipes.map(r => {
      const displayPrice = r.sellPrice > 0 ? r.sellPrice : (r.costPrice || 0);
      const isLowStock = false; // Recipes don't directly have stock constraints in this view
      return {
        id: r.id,
        name: r.name,
        type: r.isSubRecipe ? ('subrecipe' as const) : ('recipe' as const),
        category: r.isSubRecipe ? 'Subreceta' : r.category,
        cost: r.costPrice,
        price: displayPrice,
        unit: r.yieldUnit || 'und',
        isLowStock,
        description: r.description || ''
      };
    });

    // 2. Process Raw Inventory Items
    const inventoryResults = inventoryItems.map(i => {
      const minLimit = i.stockMinLimit ?? globalMinStock;
      const isLowStock = i.realPhysicalStock <= minLimit;
      return {
        id: i.id,
        name: i.name,
        type: 'item' as const,
        category: i.category,
        cost: i.purchaseCost,
        price: i.purchaseCost,
        unit: i.countUnit,
        isLowStock,
        description: `Stock: ${i.realPhysicalStock} / Min Global: ${minLimit}`
      };
    });

    // Unified List
    let unified = [...recipeResults, ...inventoryResults];

    // Apply text search
    if (q) {
      unified = unified.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }

    // Apply Category Filter
    if (selectedCategory !== 'Todos') {
      unified = unified.filter(item => item.category === selectedCategory);
    }

    // Apply Cost Range Filter
    // Low: < $5,000 | Medium: $5,000 - $25,000 | Premium: > $25,000
    if (costRange !== 'All') {
      unified = unified.filter(item => {
        if (costRange === 'Low') return item.cost < 5000;
        if (costRange === 'Medium') return item.cost >= 5000 && item.cost <= 25000;
        if (costRange === 'Premium') return item.cost > 25000;
        return true;
      });
    }

    // Apply Stock Alert Filter (Items below or at minimum stock)
    if (stockAlertOnly) {
      unified = unified.filter(item => item.isLowStock);
    }

    return unified;
  }, [query, recipes, inventoryItems, selectedCategory, costRange, stockAlertOnly]);

  const handleItemClick = (item: any) => {
    setIsOpen(false);
    setQuery('');
    if (item.type === 'recipe' || item.type === 'subrecipe') {
      if (onSelectRecipe) {
        onSelectRecipe(item.id, item.type === 'subrecipe');
      }
    } else if (item.type === 'item') {
      if (onSelectInventoryItem) {
        onSelectInventoryItem(item.id);
      }
    }
  };

  const handleResetFilters = () => {
    setSelectedCategory('Todos');
    setCostRange('All');
    setStockAlertOnly(false);
  };

  return (
    <div 
      role="search"
      aria-label="Búsqueda Unificada de Recetas e Insumos"
      className={`relative transition-all duration-300 ease-in-out select-none max-w-full h-10 ${
        isOpen ? 'w-full md:w-[80%]' : 'w-full md:w-[50%]'
      }`} 
      ref={dropdownRef}
    >
      {/* Search Input Box */}
      <div 
        className="flex items-center gap-2 bg-[var(--bg-input)] rounded-xl px-4 py-2 w-full h-10 shadow-sm focus-within:ring-2 focus-within:ring-[var(--accent-purple)]/50 transition-all border border-transparent focus-within:bg-[var(--bg-surface)] focus-within:border-[var(--border-glow)]"
      >
        <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-lg" aria-hidden="true">search</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-label="Buscar recetas, subrecetas o insumos"
          placeholder="Buscar recetas, subrecetas o insumos..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] w-full placeholder:text-[var(--text-muted)] font-semibold"
        />
        {query && (
          <button 
            aria-label="Limpiar búsqueda"
            onClick={() => setQuery('')}
            className="text-slate-400 hover:text-slate-650 dark:hover:text-white flex items-center justify-center cursor-pointer border-none bg-transparent"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">close</span>
          </button>
        )}
      </div>

      {/* Omnipresent Floating Results Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-card shadow-2xl !p-0 bg-[var(--bg-surface)]/95 dark:bg-[var(--bg-surface)]/85 backdrop-blur-[14px] border border-[var(--border-glow)] rounded-[var(--radius-md)] z-[999] overflow-hidden flex flex-col md:flex-row h-[28rem] w-full">
          
          {/* Left Filter Sidebar (Mercado Libre style layout) */}
          <div className="w-full md:w-[30%] bg-slate-50/50 dark:bg-slate-950/30 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Filtros</span>
                {(selectedCategory !== 'Todos' || costRange !== 'All' || stockAlertOnly) && (
                  <button 
                    onClick={handleResetFilters}
                    className="text-[9px] font-black text-rose-500 hover:underline cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Category selector */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Categoría</label>
                <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left text-[10px] font-bold px-2 py-1 rounded-lg block truncate ${
                        selectedCategory === cat
                          ? 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost Ranges */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Rango de Costo</label>
                <div className="space-y-0.5">
                  {[
                    { id: 'All', label: 'Todos' },
                    { id: 'Low', label: 'Bajo (< $5k)' },
                    { id: 'Medium', label: 'Medio ($5k - $25k)' },
                    { id: 'Premium', label: 'Premium (> $25k)' }
                  ].map(range => (
                    <button
                      key={range.id}
                      onClick={() => setCostRange(range.id as any)}
                      className={`w-full text-left text-[10px] font-bold px-2 py-1 rounded-lg block truncate ${
                        costRange === range.id
                          ? 'bg-cyan-500/10 text-cyan-500'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alerts filters */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Alertas de Stock</label>
                <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-slate-600 dark:text-slate-350">
                  <input
                    type="checkbox"
                    checked={stockAlertOnly}
                    onChange={(e) => setStockAlertOnly(e.target.checked)}
                    className="rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-slate-300 dark:border-slate-700 bg-transparent"
                  />
                  <span>Stock Crítico</span>
                </label>
              </div>
            </div>

            <div className="text-[8px] text-slate-400 font-semibold border-t border-slate-200 dark:border-slate-800 pt-2.5 mt-4">
              Unified index: {recipes.length + inventoryItems.length} resources
            </div>
          </div>

          {/* Right Results Column */}
          <div className="w-full md:w-[70%] flex flex-col min-w-0">
            {/* Header / Results Count */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/20 dark:bg-slate-900/30 shrink-0">
              <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Resultados ({filteredResults.length})
              </span>
              {query && (
                <span className="text-[9px] font-bold text-slate-400 italic">
                  Búsqueda: "{query}"
                </span>
              )}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredResults.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-all flex items-center justify-between gap-4 group cursor-pointer"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-[var(--accent-purple)] transition-colors">
                        {item.name}
                      </span>
                      {/* Type Badge */}
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${
                        item.type === 'recipe'
                          ? 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]'
                          : item.type === 'subrecipe'
                          ? 'bg-cyan-500/10 text-cyan-500'
                          : 'bg-purple-500/10 text-purple-500'
                      }`}>
                        {item.type === 'recipe' ? 'RECETA' : item.type === 'subrecipe' ? 'SUBRECETA' : 'INSUMO'}
                      </span>

                      {/* Category Badge */}
                      <span className="text-[8px] font-bold bg-slate-100 dark:bg-[var(--card-color)] text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-md truncate max-w-[80px]">
                        {item.category}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 truncate max-w-sm">
                      {item.description}
                    </p>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    {/* Cost / Price tag */}
                    <span className="text-xs font-black text-slate-950 dark:text-white block">
                      ${Math.round(item.price).toLocaleString('es-CO')}
                    </span>
                    <span className="text-[9px] text-slate-400 font-semibold block">
                      Costo: ${Math.round(item.cost).toLocaleString('es-CO')}
                    </span>
                    
                    {/* Stock Warning indicator */}
                    {item.isLowStock && (
                      <span className="text-[8px] font-black text-rose-500 flex items-center justify-end gap-0.5">
                        <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                        Stock Bajo
                      </span>
                    )}
                  </div>
                </button>
              ))}

              {filteredResults.length === 0 && (
                <div className="p-8 text-center text-slate-500 dark:text-slate-500 flex flex-col items-center justify-center h-full space-y-2">
                  <span className="material-symbols-outlined text-3xl">search_off</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Sin Resultados</span>
                  <p className="text-[10px] max-w-xs">No encontramos ningún recurso que coincida con la consulta y filtros especificados.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
