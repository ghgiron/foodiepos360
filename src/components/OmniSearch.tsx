import { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../db/localDb';
import type { Recipe, InventoryItem } from '../types';
import { formatCurrency } from '../utils/formatters';
import { flexibleMultiMatch } from '../utils/searchEngine';

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
    if (query.trim()) {
      unified = unified.filter(item => 
        flexibleMultiMatch([item.name, item.category, item.description], query)
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
        className="flex items-center gap-2 bg-inset rounded-full px-4 py-2 w-full h-10 shadow-sm focus-within:ring-2 focus-within:ring-action/30 transition-all border border-line focus-within:bg-surface focus-within:border-action"
      >
        <span className="material-symbols-outlined text-content-secondary text-lg" aria-hidden="true">search</span>
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
          className="bg-transparent border-none outline-none text-xs text-content w-full placeholder:text-content-tertiary font-semibold"
        />
        {query && (
          <button 
            aria-label="Limpiar búsqueda"
            onClick={() => setQuery('')}
            className="text-content-tertiary hover:text-content flex items-center justify-center cursor-pointer border-none bg-transparent"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">close</span>
          </button>
        )}
      </div>

      {/* Omnipresent Floating Results Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 glass bg-surface shadow-lg border border-line rounded-xl z-[999] overflow-hidden flex flex-col md:flex-row h-[28rem] w-full">
          
          {/* Left Filter Sidebar */}
          <div className="w-full md:w-[30%] bg-canvas/80 border-b md:border-b-0 md:border-r border-line p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-line">
                <span className="text-[10px] font-black uppercase text-content-secondary tracking-wider">Filtros</span>
                {(selectedCategory !== 'Todos' || costRange !== 'All' || stockAlertOnly) && (
                  <button 
                    onClick={handleResetFilters}
                    className="text-[9px] font-black text-danger hover:underline cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Category selector */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Categoría</label>
                <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left text-[10px] font-bold px-3 py-1 rounded-full block truncate transition-colors btn-press ${
                        selectedCategory === cat
                          ? 'bg-action text-action-text font-black'
                          : 'text-content-secondary hover:bg-raised hover:text-content'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost Ranges */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Rango de Costo</label>
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
                      className={`w-full text-left text-[10px] font-bold px-3 py-1 rounded-full block truncate transition-colors btn-press ${
                        costRange === range.id
                          ? 'bg-info-subtle text-info font-black'
                          : 'text-content-secondary hover:bg-raised hover:text-content'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alerts filters */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[9px] font-black uppercase text-content-secondary block mb-1">Alertas de Stock</label>
                <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-content">
                  <input
                    type="checkbox"
                    checked={stockAlertOnly}
                    onChange={(e) => setStockAlertOnly(e.target.checked)}
                    className="rounded-xs text-action focus:ring-action border-line bg-transparent"
                  />
                  <span>Stock Crítico</span>
                </label>
              </div>
            </div>

            <div className="text-[8px] text-content-tertiary font-bold border-t border-line pt-2.5 mt-4">
              Unified index: {recipes.length + inventoryItems.length} resources
            </div>
          </div>

          {/* Right Results Column */}
          <div className="w-full md:w-[70%] flex flex-col min-w-0 bg-surface">
            {/* Header / Results Count */}
            <div className="px-4 py-3 border-b border-line flex justify-between items-center bg-canvas/50 shrink-0">
              <span className="text-[10px] font-black uppercase text-content-secondary tracking-wider">
                Resultados ({filteredResults.length})
              </span>
              {query && (
                <span className="text-[9px] font-bold text-content-tertiary italic">
                  Búsqueda: "{query}"
                </span>
              )}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto divide-y divide-line-subtle">
              {filteredResults.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-4 hover:bg-raised transition-all flex items-center justify-between gap-4 group cursor-pointer border-none bg-transparent"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-content truncate transition-colors">
                        {item.name}
                      </span>
                      {/* Type Badge */}
                      <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        item.type === 'recipe'
                          ? 'bg-secondary-subtle text-secondary border-secondary/30'
                          : item.type === 'subrecipe'
                          ? 'bg-info-subtle text-info border-info/30'
                          : 'bg-success-subtle text-success border-success/30'
                      }`}>
                        {item.type === 'recipe' ? 'RECETA' : item.type === 'subrecipe' ? 'SUBRECETA' : 'INSUMO'}
                      </span>

                      {/* Category Badge */}
                      <span className="text-[9px] font-bold bg-raised text-content-secondary px-2.5 py-0.5 rounded-full border border-line truncate max-w-[100px]">
                        {item.category}
                      </span>
                    </div>

                    <p className="text-[10px] text-content-secondary truncate max-w-sm">
                      {item.description}
                    </p>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    {/* Cost / Price tag */}
                    <span className="text-sm font-black text-content block tabular-numbers tracking-tight">
                      {formatCurrency(item.price, 0)}
                    </span>
                    <span className="text-[10px] text-content-secondary font-bold block">
                      Costo: <span className="tabular-numbers tracking-tight">{formatCurrency(item.cost, 0)}</span>
                    </span>
                    
                    {/* Stock Warning indicator */}
                    {item.isLowStock && (
                      <span className="text-[9px] font-black text-danger flex items-center justify-end gap-0.5">
                        <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                        Stock Bajo
                      </span>
                    )}
                  </div>
                </button>
              ))}

              {filteredResults.length === 0 && (
                <div className="p-8 text-center text-content-secondary flex flex-col items-center justify-center h-full space-y-2">
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
