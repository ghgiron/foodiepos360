// src/components/ui/CreateCategoryModal.tsx
import React, { useState } from 'react';
import Modal from './Modal';
import { Input } from './Input';
import toast from 'react-hot-toast';
import { db, enqueueOfflineEvent } from '../../db/localDb';

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (categoryName: string) => void;
  categoryType?: 'INGREDIENT' | 'PRODUCT' | 'SUPPLY';
}

export function CreateCategoryModal({
  isOpen,
  onClose,
  onCategoryCreated,
  categoryType = 'INGREDIENT',
}: CreateCategoryModalProps) {
  const [categoryName, setCategoryName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = categoryName.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      // Map category type to Dexie table and systemSettings key
      const sysKey = categoryType === 'PRODUCT' ? 'menu_categories' : categoryType === 'SUPPLY' ? 'supply_categories' : 'ingredient_categories';
      const targetTable = categoryType === 'PRODUCT' ? db.menuCategories : categoryType === 'SUPPLY' ? db.supplyCategories : db.ingredientCategories;

      // 1. DEDUPLICATION CHECK (Case-insensitive query on db.categories & targetTable)
      const existingInCategories = await db.categories
        .filter(c => c.name.trim().toLowerCase() === trimmed.toLowerCase())
        .first();

      const existingInTable = await targetTable
        .filter(c => c.name.trim().toLowerCase() === trimmed.toLowerCase())
        .first();

      const sysRecord = await db.systemSettings.get(sysKey);
      const sysList: string[] = sysRecord?.value || [];
      const existingInSys = sysList.find(c => c.trim().toLowerCase() === trimmed.toLowerCase());

      const foundExisting = existingInCategories || existingInTable;

      if (foundExisting || existingInSys) {
        // Category ALREADY EXISTS
        const existingVal = foundExisting ? (foundExisting.name || foundExisting.id) : existingInSys!;
        toast('La categoría ya existe', { icon: 'ℹ️' });
        onCategoryCreated(existingVal);
        onClose();
        setCategoryName('');
        return;
      }

      // 2. CREATE NEW CATEGORY
      const prefix = categoryType === 'PRODUCT' ? 'cat-prod-' : categoryType === 'SUPPLY' ? 'cat-sup-' : 'cat-ing-';
      const newId = `${prefix}${Date.now()}`;
      await targetTable.put({ id: newId, name: trimmed });
      if (targetTable !== db.categories) {
        await db.categories.put({ id: newId, name: trimmed });
      }

      // Sync systemSettings
      if (!sysList.includes(trimmed)) {
        const updatedList = [...sysList, trimmed];
        await db.systemSettings.put({
          key: sysKey,
          value: updatedList,
          updatedAt: new Date().toISOString()
        });
      }

      // Emit Domain Event CategoryCreated to DomainOutbox
      await enqueueOfflineEvent('CategoryCreated', {
        id: newId,
        name: trimmed,
        categoryType,
        createdAt: new Date().toISOString()
      });

      toast.success(`Categoría "${trimmed}" creada exitosamente`);
      onCategoryCreated(trimmed);
      onClose();
      setCategoryName('');
    } catch (error) {
      console.error('Error al crear la categoría:', error);
      toast.error('Error al crear la categoría');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear Nueva Categoría">
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="space-y-4 p-4 text-left font-sans"
      >
        <div>
          <label className="block text-[10px] font-extrabold uppercase tracking-widest text-content-secondary mb-1.5">
            Nombre de la Categoría
          </label>
          <Input
            type="text"
            required
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e);
              }
            }}
            placeholder="Ej: Mariscos, Especias, Licores..."
            className="w-full bg-inset border border-line rounded-sm px-3.5 py-2.5 text-xs font-bold text-content placeholder:text-content-tertiary focus:border-action outline-none"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="px-5 py-2.5 bg-surface hover:bg-canvas text-content-secondary hover:text-content text-xs font-bold rounded-full border border-line cursor-pointer interactive-tap"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSubmitting || !categoryName.trim()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSubmit(e);
            }}
            className="px-5 py-2.5 bg-action hover:bg-action-hover disabled:opacity-50 text-action-text text-xs font-bold rounded-full shadow-md transition-all cursor-pointer border-none btn-press"
          >
            {isSubmitting ? 'Guardando...' : 'Guardar Categoría'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default CreateCategoryModal;
