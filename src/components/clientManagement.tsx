// src/components/clientManagement.tsx
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import { deleteRecordFromFirestore, bulkDeleteRecords } from '../services/syncService';
import type { Client } from '../types';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import Modal from './ui/Modal';
import BulkActionBar from './ui/BulkActionBar';
import { flexibleMultiMatch } from '../utils/searchEngine';

export default function ClientManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // View States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [electronicInvoice, setElectronicInvoice] = useState(false);
  const [email, setEmail] = useState('');
  const [taxId, setTaxId] = useState('');

  // Dropdown menu active item ID
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Query clients from Dexie
  const dbClients = useLiveQuery(() => db.clients.toArray()) || [];

  // Statistics
  const stats = useMemo(() => {
    const total = dbClients.length;
    const totalElectronic = dbClients.filter(c => c.electronicInvoice).length;
    return {
      totalClients: total,
      totalElectronic
    };
  }, [dbClients]);

  // Filters logic
  const filteredClients = useMemo(() => {
    return dbClients.filter(item => {
      return flexibleMultiMatch([item.name, item.phone, item.address, item.email, item.taxId], searchTerm);
    });
  }, [dbClients, searchTerm]);

  // Pagination
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredClients, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / itemsPerPage));

  // Open Form for Creation
  const handleCreateClick = () => {
    setEditingClient(null);
    setName('');
    setPhone('');
    setAddress('');
    setElectronicInvoice(false);
    setEmail('');
    setTaxId('');
    setIsModalOpen(true);
  };

  // Open Form for Editing
  const handleEditClick = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setAddress(client.address);
    setElectronicInvoice(client.electronicInvoice);
    setEmail(client.email || '');
    setTaxId(client.taxId || '');
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  // Delete Action
  const handleDeleteClick = (id: string) => {
    setDeleteClientId(id);
    setActiveMenuId(null);
  };

  const confirmDelete = async () => {
    if (!deleteClientId) return;
    try {
      await deleteRecordFromFirestore('clients', deleteClientId);
      toast.success('Cliente eliminado exitosamente.');
    } catch (err) {
      console.error('Error deleting client:', err);
      toast.error('Error al eliminar el cliente.');
    } finally {
      setDeleteClientId(null);
    }
  };

  // Bulk Delete Clients Handler
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDeleteRecords('clients', selectedIds);
      toast.success(`${selectedIds.length} cliente(s) eliminado(s) exitosamente.`);
      setSelectedIds([]);
    } catch (err) {
      console.error('Error bulk deleting clients:', err);
      toast.error('Error al eliminar los clientes seleccionados.');
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  // Save/Submit Form Handler
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();

    // Strict validation
    if (!name.trim()) {
      toast.error('El nombre completo es obligatorio.');
      return;
    }
    if (!phone.trim()) {
      toast.error('El número celular es obligatorio.');
      return;
    }
    if (!address.trim()) {
      toast.error('La dirección es obligatoria.');
      return;
    }

    if (electronicInvoice) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error('Un correo electrónico válido es obligatorio para factura electrónica.');
        return;
      }
      if (!taxId.trim()) {
        toast.error('El NIT o Cédula es obligatorio para factura electrónica.');
        return;
      }
    }

    try {
      const clientData: Client = {
        id: editingClient ? editingClient.id : `cli-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        electronicInvoice,
        email: electronicInvoice ? email.trim() : (email.trim() || undefined),
        taxId: electronicInvoice ? taxId.trim() : (taxId.trim() || undefined),
        createdAt: editingClient ? editingClient.createdAt : new Date().toISOString()
      };

      await db.clients.put(clientData);
      toast.success(editingClient ? 'Cliente actualizado con éxito.' : 'Cliente registrado con éxito.');
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving client:', err);
      toast.error('Error al guardar el cliente.');
    }
  };

  return (
    <div className="p-8 space-y-8 transition-receitly overflow-y-auto flex-1 font-body text-[var(--text-secondary)]">
      
      {/* Top Header Breadcrumbs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-glow)]">
        <div>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
            <span>Inicio</span>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span className="text-[var(--accent-purple)]">Clientes</span>
          </div>

          <h2 className="text-3xl font-black text-[var(--text-primary)] mt-1">
            Gestión de Clientes
          </h2>
          <p className="text-[var(--text-muted)] font-semibold text-xs mt-0.5">
            Administra los clientes para facturación electrónica (DIAN) y pedidos para llevar.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreateClick}
            className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-black py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-md shadow-[var(--accent-purple)]/10 active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer border-none"
          >
            <span className="material-symbols-outlined text-sm font-bold">person_add</span>
            Nuevo Cliente
          </button>
        </div>
      </div>

      {/* Bento Stats Indicators Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Clientes */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">group</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block">Total Clientes</span>
            <h3 className="text-2xl font-black font-mono text-[var(--text-primary)] mt-1 leading-none">
              {stats.totalClients}
            </h3>
          </div>
        </div>

        {/* Factura Electrónica */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden">
          <div className="w-12 h-12 bg-pink-500/10 text-pink-600 dark:text-pink-455 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">receipt</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] block">Facturación Electrónica</span>
            <h3 className="text-2xl font-black font-mono text-[var(--text-primary)] mt-1 leading-none">
              {stats.totalElectronic}
            </h3>
          </div>
        </div>
      </section>

      {/* Table Card */}
      <section className="bg-[var(--bg-surface)] rounded-[2rem] border border-[var(--border-glow)] shadow-sm overflow-hidden">
        
        {/* Header Search */}
        <div className="p-6 border-b border-[var(--border-glow)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20 dark:bg-surface/10">
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Clientes Registrados
          </h3>
          <div className="flex items-center gap-2 bg-[var(--bg-app)] px-4 py-2.5 rounded-xl border border-[var(--border-glow)] w-64">
            <span className="material-symbols-outlined text-[var(--text-muted)] text-sm">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar por nombre, celular, NIT..."
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
                    checked={paginatedClients.length > 0 && paginatedClients.every(item => selectedIds.includes(item.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const pageIds = paginatedClients.map(item => item.id);
                        setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                      } else {
                        const pageIds = new Set(paginatedClients.map(item => item.id));
                        setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
                      }
                    }}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                  />
                </th>
                <th className="py-4 px-6">Nombre Completo</th>
                <th className="py-4 px-4">Celular</th>
                <th className="py-4 px-4">Dirección</th>
                <th className="py-4 px-4">Factura Electrónica</th>
                <th className="py-4 px-4">NIT / Cédula</th>
                <th className="py-4 px-4">Email</th>
                <th className="py-4 px-6 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glow)] text-xs">
              {paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 px-6 text-center text-[var(--text-muted)] italic">
                    No se encontraron clientes registrados.
                  </td>
                </tr>
              ) : (
                paginatedClients.map(item => (
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
                    {/* Nombre */}
                    <td className="py-4 px-6 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--bg-app)] flex items-center justify-center text-[var(--accent-purple)] shrink-0 border border-[var(--border-glow)]">
                        <span className="material-symbols-outlined text-xl">person</span>
                      </div>
                      <div>
                        <p className="font-bold text-[var(--text-primary)] leading-tight">{item.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.id}</p>
                      </div>
                    </td>

                    {/* Celular */}
                    <td className="py-4 px-4 text-[var(--text-secondary)] font-semibold">
                      {item.phone}
                    </td>

                    {/* Dirección */}
                    <td className="py-4 px-4 text-[var(--text-secondary)] font-medium max-w-xs truncate">
                      {item.address}
                    </td>

                    {/* FE Badge */}
                    <td className="py-4 px-4">
                      {item.electronicInvoice ? (
                        <span className="inline-flex bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                          Sí (DIAN)
                        </span>
                      ) : (
                        <span className="inline-flex bg-raised text-slate-500 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          No
                        </span>
                      )}
                    </td>

                    {/* NIT */}
                    <td className="py-4 px-4 text-[var(--text-secondary)] font-mono font-bold">
                      {item.taxId || '--'}
                    </td>

                    {/* Email */}
                    <td className="py-4 px-4 text-[var(--text-muted)] font-mono">
                      {item.email || '--'}
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
                            Editar Cliente
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
            Mostrando {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} clientes
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

      {/* Creation/Edition Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingClient ? "Editar Cliente" : "Registrar Cliente"}
          size="md"
        >
          <form onSubmit={handleSaveClient} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nombre Completo *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                placeholder="ej. María López"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Celular *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="ej. 3001234567"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Dirección *</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="ej. Calle 85 # 11-44"
                  required
                />
              </div>
            </div>

            {/* FE Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-inset border border-[var(--border-glow)]">
              <div>
                <span className="text-xs font-bold text-[var(--text-primary)] block">¿Requiere Factura Electrónica?</span>
                <span className="text-[10px] text-[var(--text-muted)]">Habilita campos requeridos por la DIAN (Email, NIT)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={electronicInvoice}
                  onChange={(e) => setElectronicInvoice(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-raised peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent-purple)]"></div>
              </label>
            </div>

            {electronicInvoice && (
              <div className="grid grid-cols-2 gap-4 animate-fade-in">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">NIT / Cédula *</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. 109876543-2"
                    required={electronicInvoice}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Correo Electrónico *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-glow)] bg-[var(--bg-app)] dark:bg-[var(--bg-input)] text-[var(--text-primary)] p-3 text-xs focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                    placeholder="ej. cliente@gmail.com"
                    required={electronicInvoice}
                  />
                </div>
              </div>
            )}

            <div className="pt-4 flex gap-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-[var(--bg-input)] text-slate-650 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider text-center cursor-pointer hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-[var(--accent-purple)] text-white font-black rounded-xl text-xs uppercase tracking-wider text-center hover:bg-[var(--accent-purple)]/90 shadow-md shadow-[var(--accent-purple)]/15 transition-all cursor-pointer"
              >
                Guardar Cliente
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Dialog */}
      {deleteClientId && (
        <ConfirmDialog
          isOpen={!!deleteClientId}
          title="Eliminar Cliente"
          message="¿Estás seguro de que deseas eliminar este cliente? Se borrará su historial de facturación local."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteClientId(null)}
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
          title="Eliminación Múltiple de Clientes"
          message={`¿Estás seguro de que deseas eliminar permanentemente ${selectedIds.length} cliente(s)? Esta acción eliminará los registros de forma transaccional tanto localmente como en la nube y no se puede deshacer.`}
          confirmText={`Eliminar ${selectedIds.length} clientes`}
          cancelText="Cancelar"
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
