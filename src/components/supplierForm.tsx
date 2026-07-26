// src/components/supplierForm.tsx
import { useState, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Supplier } from '../types';
import { getDropdownOptions } from '../utils/dataHelper';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';

interface SupplierFormProps {
  onCancel: () => void;
  onSaved: (newId?: string) => void;
  supplierId?: string | null;
}

export default function SupplierForm({ onCancel, onSaved, supplierId }: SupplierFormProps) {
  const isEdit = !!supplierId;

  // DB queries
  const existingSupplier = useLiveQuery(async () => {
    if (!supplierId) return null;
    return await db.suppliers.get(supplierId);
  }, [supplierId]);

  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  // Get dynamic categories to choose from
  const supplyCategories = getDropdownOptions('supply_categories', systemSettings);
  const ingredientCategories = getDropdownOptions('ingredient_categories', systemSettings);
  const allAvailableCategories = Array.from(new Set([...supplyCategories, ...ingredientCategories]));

  // Form states
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Contado');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Load supplier for editing
  useEffect(() => {
    if (existingSupplier) {
      setName(existingSupplier.name);
      setContact(existingSupplier.contact);
      setEmail(existingSupplier.email);
      setPaymentTerms(existingSupplier.paymentTerms);
      setSelectedCategories(existingSupplier.categoriesSupplied || []);
    }
  }, [existingSupplier]);

  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre es obligatorio.');
      return;
    }

    const finalId = isEdit && supplierId ? supplierId : `prov-${Date.now().toString().slice(-4)}`;
    const newSupplier: Supplier = {
      id: finalId,
      name: name.trim(),
      contact: contact.trim(),
      email: email.trim(),
      paymentTerms,
      categoriesSupplied: selectedCategories,
      updatedAt: new Date().toISOString()
    };

    try {
      await db.suppliers.put(newSupplier);
      toast.success(`Proveedor "${name}" guardado exitosamente.`);
      onSaved(finalId);
    } catch (err) {
      console.error('Error saving supplier:', err);
      toast.error('Error al guardar el proveedor.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left font-body text-[var(--text-secondary)]">
      
      {/* Header breadcrumbs */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-glow)]">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[var(--text-muted)] hover:text-[var(--accent-purple)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:underline cursor-pointer bg-transparent border-none"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            REGRESAR
          </button>
          
          <h2 className="text-3xl font-black text-[var(--text-primary)] mt-2">
            {isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h2>
          <p className="text-[var(--text-muted)] font-semibold text-xs mt-0.5">
            Ingresa la información comercial y de contacto del proveedor.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column (8 Cols): Fields */}
          <div className="lg:col-span-8 bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-lg">info</span>
              <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                Información del Proveedor
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                  Nombre de la Empresa / Comercial
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-450"
                  placeholder="Ej. Diageo Colombia S.A.S."
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                  Nombre de Contacto / Teléfono
                </label>
                <input
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-450"
                  placeholder="Ej. Juan Pérez - +57 300 123 4567"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-purple)] outline-none text-[var(--text-primary)] placeholder-slate-450"
                  placeholder="contacto@proveedor.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
                  Términos de Pago
                </label>
                <CustomSelect
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  options={[
                    { value: 'Contado', label: 'Contado / Inmediato' },
                    { value: '8 días', label: 'Crédito 8 días' },
                    { value: '15 días', label: 'Crédito 15 días' },
                    { value: '30 días', label: 'Crédito 30 días' },
                    { value: '60 días', label: 'Crédito 60 días' }
                  ]}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl p-3.5 text-xs font-bold text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Right Column (4 Cols): Category checklist */}
          <div className="lg:col-span-4 bg-[var(--bg-surface)] border border-[var(--border-glow)] p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-glow)]">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">category</span>
              <h3 className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider">
                Categorías que Suministra
              </h3>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {allAvailableCategories.map((category) => (
                <label
                  key={category}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bg-app)]/50 cursor-pointer text-xs font-bold text-[var(--text-secondary)] border border-transparent hover:border-[var(--border-glow)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCategoryToggle(category)}
                    className="w-4 h-4 rounded text-[var(--accent-purple)] focus:ring-[var(--accent-purple)] border-[var(--border-glow)]"
                  />
                  <span>{category}</span>
                </label>
              ))}
              {allAvailableCategories.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] italic">No hay categorías configuradas en el sistema.</p>
              )}
            </div>

            <div className="pt-4 border-t border-[var(--border-glow)] flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-3 bg-[var(--bg-app)] hover:bg-[var(--bg-app)]/80 text-[var(--text-secondary)] font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors text-center border-none"
              >
                Cancelar
              </button>
              
              <button
                type="submit"
                className="flex-1 py-3 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-[var(--accent-purple)]/10 transition-colors text-center border-none"
              >
                {isEdit ? 'Actualizar Proveedor' : 'Crear Proveedor'}
              </button>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
