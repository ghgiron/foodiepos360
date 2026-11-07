// src/components/supplierForm.tsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from '../hooks/useNavigate';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Supplier } from '../types';
import { getDropdownOptions } from '../utils/dataHelper';
import toast from 'react-hot-toast';
import CustomSelect from './ui/CustomSelect';
import { Input } from './ui/Input';
import { MultiSelectCombobox, type MultiSelectOption } from './ui/MultiSelectCombobox';
import { usePaymentTerms } from '../hooks/useCatalogs';
import useFormExitGuard from '../hooks/useFormExitGuard';
import DiscardChangesModal from './ui/DiscardChangesModal';

interface SupplierFormProps {
  onCancel?: () => void;
  onSaved: (newId?: string) => void;
  supplierId?: string | null;
}

export default function SupplierForm({ onCancel, onSaved, supplierId }: SupplierFormProps) {
  const isEdit = !!supplierId;
  const paymentTermsList = usePaymentTerms();

  const paymentTermsOptions = useMemo(() => {
    if (paymentTermsList.length === 0) {
      return [{ value: '', label: 'No hay términos de pago configurados...' }];
    }
    return paymentTermsList.map(term => ({ value: term, label: term }));
  }, [paymentTermsList]);

  // DB queries
  const existingSupplier = useLiveQuery(async () => {
    if (!supplierId) return null;
    return await db.suppliers.get(supplierId);
  }, [supplierId]);

  const dbCategories = useLiveQuery(async () => {
    return await db.categories.toArray();
  }) || [];

  const systemSettings = useLiveQuery(async () => {
    const list = await db.systemSettings.toArray();
    return list.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  }) || {};

  // Combine categories from db.categories and systemSettings
  const categoryOptions: MultiSelectOption[] = useMemo(() => {
    const names = new Set<string>();
    
    // 1. From Dexie categories table
    dbCategories.forEach(c => {
      if (c.name) names.add(c.name);
    });

    // 2. From systemSettings catalog
    const supplyCategories = getDropdownOptions('supply_categories', systemSettings);
    const ingredientCategories = getDropdownOptions('ingredient_categories', systemSettings);
    supplyCategories.forEach(c => names.add(c));
    ingredientCategories.forEach(c => names.add(c));

    return Array.from(names).sort().map(cat => ({
      value: cat,
      label: cat
    }));
  }, [dbCategories, systemSettings]);

  // Form states
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Contado');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  // Load supplier for editing
  useEffect(() => {
    if (existingSupplier) {
      setName(existingSupplier.name || '');
      setContact(existingSupplier.contact || '');
      setEmail(existingSupplier.email || '');
      setPhone(existingSupplier.phone || '');
      setPaymentTerms(existingSupplier.paymentTerms || 'Contado');
      setSelectedCategories(existingSupplier.categoriesSupplied || []);
      setInitialSnapshot(JSON.stringify({
        name: (existingSupplier.name || '').trim(),
        contact: (existingSupplier.contact || '').trim(),
        email: (existingSupplier.email || '').trim(),
        phone: (existingSupplier.phone || '').trim(),
        paymentTerms: existingSupplier.paymentTerms || 'Contado',
        categories: (existingSupplier.categoriesSupplied || []).slice().sort()
      }));
    } else if (!isEdit && initialSnapshot === null) {
      setInitialSnapshot(JSON.stringify({
        name: '',
        contact: '',
        email: '',
        phone: '',
        paymentTerms: 'Contado',
        categories: []
      }));
    }
  }, [existingSupplier, isEdit, initialSnapshot]);

  const currentSnapshot = JSON.stringify({
    name: name.trim(),
    contact: contact.trim(),
    email: email.trim(),
    phone: phone.trim(),
    paymentTerms,
    categories: (selectedCategories || []).slice().sort()
  });

  const isDirty = initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const navigate = useNavigate();
  const { showDiscardModal, handleSafeExit, confirmExit, cancelExit } = useFormExitGuard({
    isDirty,
    onExitCallback: onCancel || (() => navigate(-1))
  });

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
      phone: phone.trim(),
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
    <div className="space-y-6 animate-fade-in text-left font-body text-content w-full max-w-2xl mx-auto p-1">
      
      {/* Header breadcrumbs */}
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div>
          <button
            type="button"
            onClick={handleSafeExit}
            className="text-slate-400 hover:text-[var(--accent-purple)] text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:underline cursor-pointer bg-transparent border-none"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            REGRESAR
          </button>
          
          <h2 className="text-2xl font-black text-content mt-2">
            {isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h2>
          <p className="text-content-secondary font-semibold text-xs mt-0.5">
            Ingresa la información comercial y de contacto del proveedor.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          
          {/* Main Info Section */}
          <div className="bg-surface border border-line p-6 rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-line">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">info</span>
              <h3 className="text-xs font-black text-content uppercase tracking-wider">
                Información del Proveedor
              </h3>
            </div>

            <div className="space-y-4">
              {/* Nombre de la Empresa (Full width) */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Nombre de la Empresa / Comercial *
                </label>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-inset border border-line rounded-xl p-3 text-xs font-semibold focus:border-violet-500 focus:ring-0 outline-none text-content placeholder-slate-400"
                  placeholder="Ej. Diageo Colombia S.A.S."
                />
              </div>

              {/* Nombre de Contacto (Full width) */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Nombre de Contacto
                </label>
                <Input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full bg-inset border border-line rounded-xl p-3 text-xs font-semibold focus:border-violet-500 focus:ring-0 outline-none text-content placeholder-slate-400"
                  placeholder="Ej. Juan Pérez"
                />
              </div>

              {/* 2-Column Grid: Celular & Correo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Número de Celular / WhatsApp
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-inset border border-line rounded-xl p-3 text-xs font-semibold focus:border-violet-500 focus:ring-0 outline-none text-content placeholder-slate-400"
                    placeholder="Ej. +57 300 123 4567"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Correo Electrónico (Opcional)
                  </label>
                  <Input
                    type="email"
                    required={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-inset border border-line rounded-xl p-3 text-xs font-semibold focus:border-violet-500 focus:ring-0 outline-none text-content placeholder-slate-400"
                    placeholder="contacto@proveedor.com"
                  />
                </div>
              </div>

              {/* Términos de Pago (Full width) */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Términos de Pago
                </label>
                <CustomSelect
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  options={paymentTermsOptions}
                  className="w-full bg-inset border border-line rounded-xl px-3 py-2 text-xs font-bold text-content"
                />
              </div>
            </div>
          </div>

          {/* Category Combobox */}
          <div className="bg-surface border border-line p-6 rounded-3xl shadow-sm space-y-4 relative">
            <div className="flex items-center gap-2 pb-3 border-b border-line">
              <span className="material-symbols-outlined text-[var(--accent-purple)] text-lg">category</span>
              <h3 className="text-xs font-black text-content uppercase tracking-wider">
                Categorías que Suministra
              </h3>
            </div>

            <p className="text-xs text-content-secondary font-medium">
              Busca y selecciona las categorías de suministros o ingredientes que distribuye este proveedor.
            </p>

            <MultiSelectCombobox
              selectedValues={selectedCategories}
              onChange={setSelectedCategories}
              options={categoryOptions}
              placeholder="Seleccionar categorías que suministra..."
              searchPlaceholder="Buscar por nombre de categoría..."
            />
          </div>

          {/* Inline Action Buttons */}
          <div className="pt-6 mt-4 border-t border-line flex justify-end gap-3 pb-8">
            <button
              type="button"
              onClick={handleSafeExit}
              className="px-5 py-2.5 bg-slate-100 hover:bg-raised dark:hover:bg-slate-700 text-content-secondary font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors border-none"
            >
              Cancelar
            </button>
            
            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-[var(--accent-purple)]/20 transition-all border-none"
            >
              {isEdit ? 'Actualizar Proveedor' : 'Guardar Proveedor'}
            </button>
          </div>

        </div>
      </form>

      <DiscardChangesModal
        isOpen={showDiscardModal}
        onContinueEditing={cancelExit}
        onDiscardAndExit={confirmExit}
      />
    </div>
  );
}
