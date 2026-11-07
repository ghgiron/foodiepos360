// src/components/supplierManagementList.tsx
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import { deleteRecordFromFirestore, bulkDeleteRecords } from '../services/syncService';
import type { Supplier } from '../types';
import SupplierForm from './supplierForm';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import BulkActionBar from './ui/BulkActionBar';
import { flexibleMultiMatch } from '../utils/searchEngine';

export default function SupplierManagementList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // View States: 'list' | 'create' | 'edit'
  const [viewState, setViewState] = useState<'list' | 'create' | 'edit'>('list');
  const [currentSupplierId, setCurrentSupplierId] = useState<string | null>(null);

  // Dropdown menu active item ID
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [deleteSupplierId, setDeleteSupplierId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Query suppliers from Dexie
  const dbSuppliers = useLiveQuery(() => db.suppliers.toArray()) || [];

  // Statistics
  const stats = useMemo(() => {
    const total = dbSuppliers.length;
    // Count unique categories supplied
    const categoriesSet = new Set<string>();
    dbSuppliers.forEach(s => {
      (s.categoriesSupplied || []).forEach(cat => categoriesSet.add(cat));
    });
    return {
      totalSuppliers: total,
      totalCategories: categoriesSet.size
    };
  }, [dbSuppliers]);

  // Filters logic
  const filteredSuppliers = useMemo(() => {
    return dbSuppliers.filter(item => {
      return flexibleMultiMatch([item.name, item.id, item.contact, item.email, (item as any).phone, (item as any).taxId], searchTerm);
    });
  }, [dbSuppliers, searchTerm]);

  // Pagination
  const paginatedSuppliers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSuppliers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSuppliers, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / itemsPerPage));

  const handleEditClick = (supplier: Supplier) => {
    setCurrentSupplierId(supplier.id);
    setViewState('edit');
    setActiveMenuId(null);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteSupplierId(id);
    setActiveMenuId(null);
  };

  const confirmDelete = async () => {
    if (!deleteSupplierId) return;
    try {
      await deleteRecordFromFirestore('suppliers', deleteSupplierId);
      toast.success('Proveedor eliminado exitosamente.');
    } catch (err) {
      console.error('Error deleting supplier:', err);
      toast.error('Error al eliminar el proveedor.');
    } finally {
      setDeleteSupplierId(null);
    }
  };

  // Bulk Delete Suppliers Handler
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDeleteRecords('suppliers', selectedIds);
      toast.success(`${selectedIds.length} proveedor(es) eliminado(s) exitosamente.`);
      setSelectedIds([]);
    } catch (err) {
      console.error('Error bulk deleting suppliers:', err);
      toast.error('Error al eliminar los proveedores seleccionados.');
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  if (viewState !== 'list') {
    return (
      <div className="p-8">
        <SupplierForm
          supplierId={currentSupplierId}
          onCancel={() => {
            setViewState('list');
            setCurrentSupplierId(null);
          }}
          onSaved={() => {
            setViewState('list');
            setCurrentSupplierId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 transition-receitly overflow-y-auto flex-1 font-body text-[var(--text-secondary)]">
      
      {/* Top Header Breadcrumbs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-glow)]">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
            <span>Inventario</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-[var(--accent-purple)]">Proveedores</span>
          </div>

          <h2 className="text-3xl font-black text-[var(--text-primary)] mt-1">
            Gestión de Proveedores
          </h2>
          <p className="text-[var(--text-muted)] font-semibold text-xs mt-0.5">
            Administra los proveedores de materias primas, insumos y activos de tus sedes.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCurrentSupplierId(null);
              setViewState('create');
            }}
            className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-black py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-md shadow-[var(--accent-purple)]/10 active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer border-none"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
            Nuevo Proveedor
          </button>
        </div>
      </div>

      {/* Bento Stats Indicators Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Proveedores */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">handshake</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block">Total Proveedores</span>
            <h3 className="text-2xl font-black font-mono text-[var(--text-primary)] mt-1 leading-none">
              {stats.totalSuppliers}
            </h3>
          </div>
        </div>

        {/* Categorías Cubiertas */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-teal-500/10 text-teal-650 dark:text-teal-400 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">category</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block">Categorías Suministradas</span>
            <h3 className="text-2xl font-black font-mono text-[var(--text-primary)] mt-1 leading-none">
              {stats.totalCategories}
            </h3>
          </div>
        </div>
      </section>

      {/* Table Card */}
      <section className="bg-[var(--bg-surface)] rounded-[2rem] border border-[var(--border-glow)] shadow-sm overflow-hidden">
        
        {/* Header Search */}
        <div className="p-6 border-b border-[var(--border-glow)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20 dark:bg-surface/10">
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Listado de Proveedores
          </h3>
          <div className="flex items-center gap-2 bg-[var(--bg-app)] px-4 py-2.5 rounded-xl border border-[var(--border-glow)] w-64">
            <span className="material-symbols-outlined text-[var(--text-muted)] text-sm">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar por nombre, correo..."
              className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder-slate-500 dark:placeholder-slate-500 text-[var(--text-primary)]"
            />
          </div>
        </div>

        {/* Table list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[var(--bg-app)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-glow)]">
              <tr>
                <th className="py-4 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={paginatedSuppliers.length > 0 && paginatedSuppliers.every(item => selectedIds.includes(item.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const pageIds = paginatedSuppliers.map(item => item.id);
                        setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                      } else {
                        const pageIds = new Set(paginatedSuppliers.map(item => item.id));
                        setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
                      }
                    }}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                  />
                </th>
                <th className="py-4 px-6">Empresa</th>
                <th className="py-4 px-4">Contacto</th>
                <th className="py-4 px-4">Email</th>
                <th className="py-4 px-4">Términos Pago</th>
                <th className="py-4 px-4">Categorías</th>
                <th className="py-4 px-6 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glow)] text-xs">
              {paginatedSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-6 text-center text-[var(--text-muted)] italic">
                    No se encontraron proveedores registrados.
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map(item => (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-[var(--bg-app)]/30 transition-all ${
                      selectedIds.includes(item.id) ? 'bg-purple-500/10' : ''
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
                    {/* Empresa */}
                    <td className="py-4 px-6 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-app)] flex items-center justify-center text-[var(--accent-purple)] shrink-0 border border-[var(--border-glow)]">
                        <span className="material-symbols-outlined text-xl">handshake</span>
                      </div>
                      <div>
                        <p className="font-bold text-[var(--text-primary)] leading-tight">{item.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.id}</p>
                      </div>
                    </td>

                    {/* Contacto */}
                    <td className="py-4 px-4 text-[var(--text-secondary)] font-semibold">
                      {item.contact}
                    </td>

                    {/* Email */}
                    <td className="py-4 px-4 text-[var(--text-muted)] font-mono">
                      {item.email}
                    </td>

                    {/* Términos Pago */}
                    <td className="py-4 px-4 text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                      {item.paymentTerms}
                    </td>

                    {/* Categorías */}
                    <td className="py-4 px-4 max-w-xs truncate">
                      <div className="flex flex-wrap gap-1">
                        {(item.categoriesSupplied || []).map(cat => (
                          <span key={cat} className="bg-[var(--bg-app)] text-[var(--text-secondary)] text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border border-[var(--border-glow)]">
                            {cat}
                          </span>
                        ))}
                        {(!item.categoriesSupplied || item.categoriesSupplied.length === 0) && (
                          <span className="text-[var(--text-muted)] italic text-[10px]">Ninguna</span>
                        )}
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="py-4 px-6 text-center relative">
                      <button
                        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                        className="p-1.5 hover:bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer transition-colors border-none bg-transparent"
                      >
                        <span className="material-symbols-outlined text-base">more_vert</span>
                      </button>

                      {activeMenuId === item.id && (
                        <div className="absolute right-6 top-10 w-44 bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-xl shadow-xl z-30 py-1 text-left animate-fade-in">
                          <button
                            type="button"
                            onClick={() => handleEditClick(item)}
                            className="w-full px-4 py-2 hover:bg-[var(--bg-app)] text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer border-none bg-transparent"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            Editar Proveedor
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteClick(item.id)}
                            className="w-full px-4 py-2 hover:bg-rose-500/10 text-xs font-semibold text-rose-500 flex items-center gap-2 cursor-pointer border-t border-[var(--border-glow)] bg-transparent"
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
        <div className="p-6 border-t border-[var(--border-glow)] flex items-center justify-between bg-slate-50/20 dark:bg-surface/10">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
            Mostrando {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredSuppliers.length)} de {filteredSuppliers.length} proveedores
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg border border-[var(--border-glow)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-app)] disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer bg-transparent"
            >
              <span className="material-symbols-outlined text-sm font-bold">chevron_left</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                  currentPage === page
                    ? 'bg-[var(--accent-purple)] text-white shadow-md shadow-[var(--accent-purple)]/20'
                    : 'border border-[var(--border-glow)] text-[var(--text-secondary)] hover:bg-[var(--bg-app)] bg-transparent'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 rounded-lg border border-[var(--border-glow)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-app)] disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer bg-transparent"
            >
              <span className="material-symbols-outlined text-sm font-bold">chevron_right</span>
            </button>
          </div>
        </div>

      </section>

      {deleteSupplierId && (
        <ConfirmDialog
          isOpen={!!deleteSupplierId}
          title="Eliminar Proveedor"
          message="¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteSupplierId(null)}
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
          title="Eliminación Múltiple de Proveedores"
          message={`¿Estás seguro de que deseas eliminar permanentemente ${selectedIds.length} proveedor(es)? Esta acción eliminará los registros de forma transaccional tanto localmente como en la nube y no se puede deshacer.`}
          confirmText={`Eliminar ${selectedIds.length} proveedores`}
          cancelText="Cancelar"
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
