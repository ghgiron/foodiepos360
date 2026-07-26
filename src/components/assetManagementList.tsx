// src/components/assetManagementList.tsx
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import type { FixedAsset } from '../types';
import AssetForm from './assetForm';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';

export default function AssetManagementList() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'Dotación' | 'Menaje' | 'Mobiliario'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // View States: 'list' | 'create' | 'edit' | 'damage_report'
  const [viewState, setViewState] = useState<'list' | 'create' | 'edit' | 'damage_report'>('list');
  const [currentAsset, setCurrentAsset] = useState<FixedAsset | null>(null);

  // Dropdown menu active item ID
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);

  // Query fixed assets from Dexie
  const dbAssets = useLiveQuery(() => db.fixedAssets.toArray()) || [];

  // KPI Calculations
  const stats = useMemo(() => {
    let totalStock = 0;
    let lowStockCount = 0;
    let totalValuation = 0;

    dbAssets.forEach(item => {
      totalStock += item.stockActual || 0;
      if (item.stockActual <= item.stockMinLimit) {
        lowStockCount += 1;
      }
      totalValuation += (item.stockActual || 0) * (item.purchaseCost || 0);
    });

    return {
      totalItems: totalStock,
      lowStock: lowStockCount,
      valuation: totalValuation
    };
  }, [dbAssets]);

  // Filters logic
  const filteredAssets = useMemo(() => {
    return dbAssets.filter(item => {
      // Tab filter
      if (activeTab !== 'ALL') {
        const tabLower = activeTab.toLowerCase();
        const catLower = (item.category || '').toLowerCase();
        if (!catLower.includes(tabLower)) return false;
      }

      // Search term filter
      const matchesSearch = 
        (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      // Location filter
      if (selectedLocation !== 'ALL' && item.location !== selectedLocation) {
        return false;
      }

      // Advanced Category filter
      if (selectedCategory !== 'ALL') {
        const itemCat = (item.category || '').toLowerCase();
        const selectedCat = selectedCategory.toLowerCase();
        if (!itemCat.includes(selectedCat)) return false;
      }

      return true;
    });
  }, [dbAssets, activeTab, searchTerm, selectedLocation, selectedCategory]);

  // Pagination
  const paginatedAssets = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAssets.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAssets, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / itemsPerPage));

  const getStatusBadge = (item: FixedAsset) => {
    if (item.status === 'En Mantenimiento') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          Maintenance
        </span>
      );
    }
    if (item.stockActual <= item.stockMinLimit) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[var(--text-muted)]/15 text-[var(--text-muted)] border border-[rgba(143,99,244,0.15)] uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]"></span>
          Low Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Healthy
      </span>
    );
  };

  const handleEditClick = (item: FixedAsset) => {
    setCurrentAsset(item);
    setViewState('edit');
    setActiveMenuId(null);
  };

  const handleDamageReportClick = (item: FixedAsset) => {
    setCurrentAsset(item);
    setViewState('damage_report');
    setActiveMenuId(null);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteAssetId(id);
    setActiveMenuId(null);
  };

  const confirmDelete = async () => {
    if (!deleteAssetId) return;
    try {
      await db.fixedAssets.delete(deleteAssetId);
      toast.success('Activo eliminado exitosamente.');
    } catch (err) {
      console.error('Error deleting asset:', err);
      toast.error('Error al eliminar el activo.');
    } finally {
      setDeleteAssetId(null);
    }
  };

  if (viewState !== 'list') {
    return (
      <AssetForm
        view={viewState}
        asset={currentAsset}
        onBack={() => {
          setViewState('list');
          setCurrentAsset(null);
        }}
      />
    );
  }

  return (
    <div className="p-8 space-y-8 transition-receitly overflow-y-auto flex-1 font-body text-slate-800 dark:text-slate-200">
      
      {/* Top Header Breadcrumbs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/50 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Inventario</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-[var(--accent-purple)]">Dotación y Mobiliario</span>
          </div>

          <h2 className="text-3xl font-headline font-black text-slate-900 dark:text-white mt-1">
            Gestión de Inventario, activos fijos
          </h2>
          <p className="text-slate-500 dark:text-slate-500 font-semibold text-xs mt-0.5">
            Control de activos fijos: menaje, mobiliario, uniformes del staff, etc.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCurrentAsset(null);
              setViewState('damage_report');
            }}
            className="border border-slate-200/80 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all text-xs uppercase tracking-wider cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-sm font-bold text-rose-500">warning</span>
            Reportar Daño
          </button>
          
          <button
            onClick={() => {
              setCurrentAsset(null);
              setViewState('create');
            }}
            className="bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white font-black py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            Nuevo Elemento
          </button>
        </div>
      </div>

      {/* Bento Stats Indicators Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Items */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/85 p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">category</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Total Items</span>
            <h3 className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 leading-none">
              {stats.totalItems.toLocaleString()}
            </h3>
          </div>
        </div>

        {/* Stock Bajo */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/85 p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">warning</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Stock Bajo</span>
            <h3 className="text-2xl font-black font-mono text-rose-500 mt-1 leading-none">
              {stats.lowStock}
            </h3>
          </div>
        </div>

        {/* Valor de Activos */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/85 p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">payments</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">Valor de Activos</span>
            <h3 className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 leading-none">
              ${stats.valuation.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>
      </section>

      {/* Advanced Filters and Table Card */}
      <section className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/85 shadow-sm overflow-hidden">
        
        {/* Navigation Tabs & Search */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20 dark:bg-slate-900/50">
          
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b md:border-none border-slate-100 dark:border-slate-800 pb-2 md:pb-0 overflow-x-auto">
            <button
              onClick={() => { setActiveTab('ALL'); setCurrentPage(1); }}
              className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => { setActiveTab('Dotación'); setCurrentPage(1); }}
              className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                activeTab === 'Dotación'
                  ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Dotación
            </button>
            <button
              onClick={() => { setActiveTab('Menaje'); setCurrentPage(1); }}
              className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                activeTab === 'Menaje'
                  ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Menaje
            </button>
            <button
              onClick={() => { setActiveTab('Mobiliario'); setCurrentPage(1); }}
              className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                activeTab === 'Mobiliario'
                  ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Mobiliario/Activos
            </button>
          </div>

          {/* Quick Search and Filter Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100/70 dark:bg-[var(--card-color)] px-4 py-2.5 rounded-xl border border-slate-200/30 dark:border-slate-800/30 w-64">
              <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Buscar en mobiliario o dotación..."
                className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder-slate-500 dark:placeholder-slate-500 text-slate-900 dark:text-white"
              />
            </div>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                showAdvancedFilters
                  ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border-[rgba(143,99,244,0.15)]'
                  : 'bg-white dark:bg-[var(--card-color)] border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-base">filter_list</span>
              Filtros Avanzados
            </button>
          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvancedFilters && (
          <div className="p-6 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Location Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Ubicación</label>
                <CustomSelect
                  value={selectedLocation}
                  onChange={(val) => { setSelectedLocation(val); setCurrentPage(1); }}
                  options={[
                    { value: 'ALL', label: 'Todas las Ubicaciones (Salón, Cocina, Barra, Terraza)' },
                    { value: 'Salón', label: 'Salón' },
                    { value: 'Cocina', label: 'Cocina' },
                    { value: 'Barra', label: 'Barra' },
                    { value: 'Terraza', label: 'Terraza' }
                  ]}
                  className="w-full bg-white dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs font-bold text-slate-700 dark:text-slate-300"
                />
            </div>

            {/* Sub-Category Filter */}
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Categoría Específica</label>
                <CustomSelect
                  value={selectedCategory}
                  onChange={(val) => { setSelectedCategory(val); setCurrentPage(1); }}
                  options={[
                    { value: 'ALL', label: 'Todas las Categorías' },
                    { value: 'Electrodomésticos', label: 'Electrodomésticos / Maquinaria' },
                    { value: 'Menaje', label: 'Menaje / Cristalería' },
                    { value: 'Mobiliario', label: 'Mobiliario' },
                    { value: 'Dotación', label: 'Dotación / Uniformes' },
                    { value: 'Ambientación', label: 'Ambientación' }
                  ]}
                  className="w-full bg-white dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs font-bold text-slate-700 dark:text-slate-300"
                />
            </div>
          </div>
        )}

        {/* Table list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-[var(--card-color)]/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-4 px-6">Elemento</th>
                <th className="py-4 px-4">Categoría</th>
                <th className="py-4 px-4 text-center">Stock Actual</th>
                <th className="py-4 px-4 text-center">Unidad</th>
                <th className="py-4 px-4 text-right">Valor Unit.</th>
                <th className="py-4 px-4">Estado</th>
                <th className="py-4 px-6 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-6 text-center text-slate-400 italic">
                    No se encontraron activos fijos catalogados en bodega.
                  </td>
                </tr>
              ) : (
                paginatedAssets.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/30 transition-all">
                    
                    {/* Elemento */}
                    <td className="py-4 px-6 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[var(--card-color)] flex items-center justify-center text-[var(--accent-purple)] shrink-0 border border-slate-200/50 dark:border-slate-700/50">
                        <span className="material-symbols-outlined text-xl">
                          {item.category.includes('Electro') ? 'microwave' : 
                           item.category.includes('Menaje') ? 'local_bar' : 
                           item.category.includes('Mobiliario') ? 'table_restaurant' : 'apparel'}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{item.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.description || item.id}</p>
                      </div>
                    </td>

                    {/* Categoría */}
                    <td className="py-4 px-4">
                      <span className="bg-slate-100 dark:bg-[var(--card-color)] text-slate-1000 dark:text-slate-350 text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-slate-200/30 dark:border-slate-700/30">
                        {item.category.includes('/') ? item.category.split('/')[0].trim() : item.category}
                      </span>
                    </td>

                    {/* Stock Actual */}
                    <td className="py-4 px-4 text-center font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
                      {item.stockActual}
                    </td>

                    {/* Unidad */}
                    <td className="py-4 px-4 text-center text-slate-400 font-extrabold uppercase text-[9px] tracking-wider">
                      {item.unitOfMeasure || 'Unidades'}
                    </td>

                    {/* Valor Unit */}
                    <td className="py-4 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                      ${item.purchaseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Estado Badge */}
                    <td className="py-4 px-4">
                      {getStatusBadge(item)}
                    </td>

                    {/* Acciones */}
                    <td className="py-4 px-6 text-center relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">more_vert</span>
                      </button>

                      {activeMenuId === item.id && (
                        <div className="absolute right-6 top-10 w-44 bg-white dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-750 rounded-xl shadow-xl z-30 py-1 text-left animate-fade-in">
                          <button
                            type="button"
                            onClick={() => handleEditClick(item)}
                            className="w-full px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            Editar Activo
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleDamageReportClick(item)}
                            className="w-full px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">warning</span>
                            Reportar Daño
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteClick(item.id)}
                            className="w-full px-4 py-2 hover:bg-rose-500/10 text-xs font-semibold text-rose-500 flex items-center gap-2 cursor-pointer border-t border-slate-100 dark:border-slate-800"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/20 dark:bg-slate-900/50">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
            Mostrando {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredAssets.length)} de {filteredAssets.length} activos fijos
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-slate-300/50 dark:border-slate-700/50 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">chevron_left</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentPage === page
                    ? 'bg-[var(--accent-purple)] text-white shadow-md'
                    : 'border border-slate-300/50 dark:border-slate-700/50 text-slate-650 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-slate-300/50 dark:border-slate-700/50 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">chevron_right</span>
            </button>
          </div>
        </div>

      </section>

      {deleteAssetId && (
        <ConfirmDialog
          isOpen={!!deleteAssetId}
          title="Eliminar Activo"
          message="¿Estás seguro de que deseas eliminar este activo fijo? Esta acción no se puede deshacer."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteAssetId(null)}
        />
      )}
    </div>
  );
}
