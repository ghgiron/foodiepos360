// src/components/inventoryAdjustment.tsx
import { useState, useEffect, useMemo } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import CustomSelect from './ui/CustomSelect';

import { useWasteReasons } from '../hooks/useCatalogs';

interface InventoryAdjustmentProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedItemId?: string | null;
}

type OutputType = 'Vencimiento' | 'Daño' | 'Error' | 'Cortesía' | 'Merma';

export default function InventoryAdjustment({
  isOpen,
  onClose,
  preselectedItemId
}: InventoryAdjustmentProps) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [outputType, setOutputType] = useState<OutputType>('Vencimiento');
  const [quantity, setQuantity] = useState<number>(0);
  const [justification, setJustification] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Live Query to get all inventory items & reactive waste reasons
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const wasteReasons = useWasteReasons();

  const itemOptions = useMemo(() => [
    { value: '', label: inventoryItems.length > 0 ? '-- Seleccione un insumo --' : 'No hay insumos registrados en inventario...' },
    ...inventoryItems.map(item => ({
      value: item.id,
      label: `${item.name} (Disponible: ${item.realPhysicalStock} ${item.countUnit})`
    }))
  ], [inventoryItems]);

  const outputTypeOptions = useMemo(() => {
    if (wasteReasons.length === 0) {
      return [{ value: '', label: 'No hay motivos configurados...' }];
    }
    return wasteReasons.map(reason => ({ value: reason, label: reason }));
  }, [wasteReasons]);

  // Prefill preselected item if available
  useEffect(() => {
    if (preselectedItemId) {
      setSelectedItemId(preselectedItemId);
    } else {
      setSelectedItemId('');
    }
  }, [preselectedItemId, isOpen]);

  if (!isOpen) return null;

  const selectedItem = inventoryItems.find(item => item.id === selectedItemId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedItemId) {
      toast.error('Debe seleccionar un insumo o producto.');
      return;
    }
    if (quantity <= 0) {
      toast.error('La cantidad de salida debe ser mayor que cero.');
      return;
    }
    if (!justification.trim()) {
      toast.error('La justificación es obligatoria.');
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirmAdjustment = async () => {
    if (!selectedItem) return;

    try {
      await db.transaction('rw', [db.inventoryItems, db.inventoryLogs, db.operationalLosses], async () => {
        const item = await db.inventoryItems.get(selectedItemId);
        if (item) {
          const currentStock = item.realPhysicalStock || 0;
          const currentTheoretical = item.theoreticalStock || 0;

          // Decrement physically and theoretically
          const newPhysical = Math.max(0, currentStock - quantity);
          const newTheoretical = Math.max(0, currentTheoretical - quantity);

          // Update stock in DB
          await db.inventoryItems.update(selectedItemId, {
            realPhysicalStock: newPhysical,
            theoreticalStock: newTheoretical,
            updatedAt: new Date().toISOString()
          });

          // Register in Inventory Logs
          await db.inventoryLogs.add({
            id: `log-adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            itemId: selectedItemId,
            itemName: item.name,
            type: 'Ajuste',
            quantity: -quantity,
            reason: `${outputType} - ${justification}`,
            user: 'Admin',
            timestamp: new Date().toISOString()
          });

          // If 'Daño', register as an operational loss (Gastos operativos / Pérdida)
          if (outputType === 'Daño') {
            await db.operationalLosses.add({
              id: `loss-adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              ticketId: 'MANUAL_ADJUSTMENT',
              recipeId: selectedItemId,
              name: item.name,
              quantity: quantity,
              cost: (item.purchaseCost || 0) * quantity,
              reason: `Baja manual por Daño: ${justification}`,
              cancelledAt: new Date().toISOString(),
              waiterId: 'Admin',
              operationZone: item.operationZone || 'Cocina'
            });
          }
        }
      });

      toast.success('Baja de inventario registrada con éxito.');
      setShowConfirm(false);
      // Reset form states
      setQuantity(0);
      setJustification('');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Ocurrió un error al procesar el ajuste de inventario.');
    }
  };

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div 
        className="bg-surface border border-[rgba(143,99,244,0.15)] rounded-[2rem] p-6 w-full max-w-lg shadow-2xl text-left transform transition-all duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-headline font-black text-lg text-content uppercase tracking-wider">
            Ajuste de Inventario (Baja Manual)
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-650 dark:hover:text-white transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item Selector */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
              Insumo / Producto a Ajustar
            </label>
            <CustomSelect
              value={selectedItemId}
              onChange={setSelectedItemId}
              options={itemOptions}
              disabled={!!preselectedItemId}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-bold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Output Type */}
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Tipo de Salida
              </label>
              <CustomSelect
                value={outputType}
                onChange={(val) => setOutputType(val as OutputType)}
                options={outputTypeOptions}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-bold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Cantidad a dar de baja
              </label>
              <input
                type="number"
                value={quantity || ''}
                onChange={(e) => setQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                placeholder={`ej. 5 ${selectedItem?.countUnit || ''}`}
              />
            </div>
          </div>

          {/* Current Stock Reference */}
          {selectedItem && (
            <div className="p-3.5 bg-inset rounded-2xl border border-[rgba(143,99,244,0.15)] flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-500">Stock Actual Físico:</span>
              <span className="font-mono text-content">
                {selectedItem.realPhysicalStock} {selectedItem.countUnit}
              </span>
            </div>
          )}

          {/* Justification Notes */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
              Justificación de la Baja *
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              required
              className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
              placeholder="Explique el motivo detallado de esta baja..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[rgba(143,99,244,0.15)]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-150 dark:bg-[var(--card-color)] text-content-secondary hover:bg-slate-200 dark:hover:bg-slate-750 text-xs font-bold rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/90 text-white text-xs font-black rounded-xl uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-[var(--accent-pink)]/15 active:scale-95 transition-all"
            >
              Confirmar Ajuste
            </button>
          </div>
        </form>
      </div>

      {showConfirm && selectedItem && (
        <ConfirmDialog
          isOpen={showConfirm}
          title="Confirmar Ajuste de Inventario"
          message={`¿Está seguro de que desea realizar una baja de ${quantity} ${selectedItem.countUnit} de "${selectedItem.name}" por motivo de "${outputType}"? Esta acción disminuirá el inventario registrado y no se puede deshacer.`}
          confirmText="Sí, Confirmar Baja"
          cancelText="No, Cancelar"
          onConfirm={handleConfirmAdjustment}
          onCancel={() => setShowConfirm(false)}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
