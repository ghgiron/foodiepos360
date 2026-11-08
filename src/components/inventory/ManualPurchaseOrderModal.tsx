// src/components/inventory/ManualPurchaseOrderModal.tsx
import { useState, useMemo } from 'react';
import { db, enqueueOfflineEvent } from '../../db/localDb';
import type { InventoryItem, PurchaseOrder, Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getActiveBranchId } from '../../utils/branchHelper';
import CustomSelect from '../ui/CustomSelect';
import { toast } from 'react-hot-toast';

interface ManualOrderLine {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  estimatedCost: number;
}

interface ManualPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (order: PurchaseOrder) => void;
  onNavigateSection?: (section: 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY') => void;
  suppliers?: Supplier[];
  inventoryItems?: InventoryItem[];
}

/**
 * [US-09D] Modal de Creación Manual de Órdenes de Compra
 * Permite seleccionar proveedor, agregar insumos con cantidad y costos sugeridos,
 * calcular totales estimados y guardar en Dexie como 'DRAFT' o 'ORDERED'.
 */
export default function ManualPurchaseOrderModal({
  isOpen,
  onClose,
  onOrderCreated,
  onNavigateSection,
  suppliers = [],
  inventoryItems = []
}: ManualPurchaseOrderModalProps) {
  // Form Header State
  const [supplierId, setSupplierId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Items List State
  const [lines, setLines] = useState<ManualOrderLine[]>([]);

  // Current Line Input State
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter selectable items (exclude assets)
  const availableItems = useMemo(() => {
    return inventoryItems.filter(it => it.inventoryType !== 'ASSET');
  }, [inventoryItems]);

  // When selectedItemId changes, auto-suggest unit cost and default unit
  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    if (!itemId) {
      setUnitCost(0);
      return;
    }
    const item = availableItems.find(i => i.id === itemId);
    if (item) {
      const suggestedCost = item.purchaseCost || item.costoUnitarioReal || item.averagePrice || 0;
      setUnitCost(suggestedCost);
      // If supplier is not set yet and item has a known supplier, suggest it
      if (!supplierId && item.supplierId && item.supplierId !== 'default-supplier') {
        const matchingSupplier = suppliers.find(s => s.id === item.supplierId);
        if (matchingSupplier) {
          setSupplierId(matchingSupplier.id);
        }
      }
    }
  };

  const selectedItemObj = useMemo(() => {
    return availableItems.find(i => i.id === selectedItemId);
  }, [availableItems, selectedItemId]);

  // Add line to order
  const handleAddLine = () => {
    if (!selectedItemId || !selectedItemObj) {
      toast.error('Seleccione un insumo del catálogo.');
      return;
    }
    if (quantity <= 0) {
      toast.error('La cantidad debe ser mayor a 0.');
      return;
    }
    if (unitCost < 0) {
      toast.error('El costo unitario no puede ser negativo.');
      return;
    }

    const estimatedCost = Math.round(quantity * unitCost);

    // If item already in lines, update it
    setLines(prev => {
      const existingIdx = prev.findIndex(l => l.itemId === selectedItemId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + quantity;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          unitCost: unitCost > 0 ? unitCost : updated[existingIdx].unitCost,
          estimatedCost: Math.round(newQty * (unitCost > 0 ? unitCost : updated[existingIdx].unitCost))
        };
        return updated;
      }
      return [
        ...prev,
        {
          itemId: selectedItemId,
          name: selectedItemObj.name,
          quantity,
          unit: selectedItemObj.countUnit || 'und',
          unitCost,
          estimatedCost
        }
      ];
    });

    // Reset current item inputs
    setSelectedItemId('');
    setQuantity(1);
    setUnitCost(0);
  };

  const handleRemoveLine = (itemId: string) => {
    setLines(prev => prev.filter(l => l.itemId !== itemId));
  };

  const totalOrderAmount = useMemo(() => {
    return lines.reduce((sum, l) => sum + l.estimatedCost, 0);
  }, [lines]);

  // Persist order in Dexie and domainOutbox (Status: ORDERED)
  const handleSaveOrder = async () => {
    if (lines.length === 0) {
      toast.error('Debe agregar al menos un insumo a la orden de compra.');
      return;
    }

    try {
      setIsSubmitting(true);
      const status: 'ORDERED' = 'ORDERED';
      const now = new Date().toISOString();
      const resolvedSupplier = suppliers.find(s => s.id === supplierId);
      const supplierName = resolvedSupplier ? resolvedSupplier.name : 'Proveedor por Definir';
      const orderId = `po-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const branchId = getActiveBranchId() || 'principal';

      const newOrder: PurchaseOrder = {
        id: orderId,
        supplierId: supplierId || 'POR DEFINIR',
        supplierName,
        status,
        items: lines.map(line => ({
          itemId: line.itemId,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          estimatedCost: line.estimatedCost,
          currentStock: 0,
          availableStock: 0,
          minStock: 0,
          maxStock: 0,
          priority: 2
        })),
        totalEstimatedCost: totalOrderAmount,
        itemsCount: lines.length,
        createdAt: now,
        updatedAt: now,
        notes: notes.trim() || 'Orden de compra manual',
        branchId,
        createdBy: 'Administrador Foodie POS'
      };

      await db.transaction('rw', [db.purchaseOrders, db.domainOutbox], async () => {
        await db.purchaseOrders.put(newOrder);
        await enqueueOfflineEvent('PurchaseOrderCreated', {
          orderId: newOrder.id,
          supplierId: newOrder.supplierId,
          supplierName: newOrder.supplierName,
          status: newOrder.status,
          itemsCount: newOrder.itemsCount,
          totalEstimatedCost: newOrder.totalEstimatedCost,
          createdAt: now
        });
      });

      toast.success(
        `¡Orden de compra confirmada y marcada como PEDIDA a ${supplierName}!`,
        { icon: '🚀' }
      );

      onOrderCreated?.(newOrder);
      if (onNavigateSection) {
        onNavigateSection('PURCHASE_ORDERS_HISTORY');
      }
      handleClose();
    } catch (err: any) {
      console.error('Error guardando orden de compra manual:', err);
      toast.error('Ocurrió un error al guardar la orden de compra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSupplierId('');
    setNotes('');
    setLines([]);
    setSelectedItemId('');
    setQuantity(1);
    setUnitCost(0);
    onClose();
  };

  if (!isOpen) return null;

  // Options for CustomSelect components
  const supplierOptions = [
    { value: '', label: '-- Proveedor por Definir --' },
    ...suppliers.map(s => ({ value: s.id, label: s.name }))
  ];

  const itemOptions = [
    { value: '', label: '-- Seleccione un Insumo --' },
    ...availableItems.map(i => ({
      value: i.id,
      label: `${i.name} (${i.category}) · Stock: ${i.currentStock ?? i.realPhysicalStock ?? 0} ${i.countUnit}`
    }))
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in font-body">
      <div 
        className="bg-surface border border-line rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-order-title"
      >
        {/* Header */}
        <div className="p-5 border-b border-line flex items-center justify-between bg-slate-50/50 dark:bg-raised/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
            </div>
            <div>
              <h2 id="manual-order-title" className="text-xl font-headline font-black text-content tracking-tight">
                Nueva Orden de Compra Manual
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Genera un pedido libre o cotización para tus proveedores.
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-content hover:bg-raised rounded-full transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-content">
          
          {/* Header Configuration: Supplier and Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-raised/20 rounded-lg border border-line">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Proveedor Destino
              </label>
              <CustomSelect
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                placeholder="Seleccione proveedor..."
                searchPlaceholder="Buscar proveedor..."
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Notas / Referencia de Pedido (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Pedido semanal urgente cocina..."
                className="h-11 w-full bg-surface border border-line rounded-sm px-3.5 text-xs font-semibold text-content outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
              />
            </div>
          </div>

          {/* Add Item Form Bar (Using CustomSelect) */}
          <div className="p-4 bg-raised/30 rounded-lg border border-line space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">post_add</span>
              Agregar Insumo a la Orden
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              {/* Item Selector */}
              <div className="sm:col-span-6">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Insumo del Catálogo
                </label>
                <CustomSelect
                  value={selectedItemId}
                  onChange={handleItemSelect}
                  options={itemOptions}
                  placeholder="Buscar insumo..."
                  searchPlaceholder="Escribe el nombre del insumo..."
                />
              </div>

              {/* Quantity */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Cantidad ({selectedItemObj?.countUnit || 'und'})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                  className="h-11 w-full bg-surface border border-line rounded-sm px-3 text-xs font-mono tabular-nums font-bold text-content text-right outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
              </div>

              {/* Unit Cost */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Costo Unitario ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={unitCost}
                  onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                  className="h-11 w-full bg-surface border border-line rounded-sm px-3 text-xs font-mono tabular-nums font-bold text-content text-right outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
                />
              </div>

              {/* Add Button */}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={!selectedItemId}
                  className="h-11 w-full bg-action text-action-text hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm active:scale-[0.97]"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span>Añadir</span>
                </button>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">format_list_bulleted</span>
                Ítems de la Orden ({lines.length})
              </h3>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLines([])}
                  className="text-[11px] text-red-500 hover:underline font-bold cursor-pointer"
                >
                  Vaciar lista
                </button>
              )}
            </div>

            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-raised/60 border-b border-line text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Insumo</th>
                    <th className="py-2.5 px-3 text-right">Cantidad</th>
                    <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((line) => (
                    <tr key={line.itemId} className="hover:bg-raised/20 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-content">
                        {line.name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-content">
                        {line.quantity} {line.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                        {formatCurrency(line.unitCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[var(--accent-purple)]">
                        {formatCurrency(line.estimatedCost)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.itemId)}
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-danger hover:bg-raised rounded-full transition-colors cursor-pointer mx-auto"
                          title="Eliminar ítem"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}

                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        <span className="material-symbols-outlined text-2xl text-slate-300 dark:text-slate-600 block mb-1">
                          post_add
                        </span>
                        <p className="text-xs font-semibold">
                          Aún no has añadido insumos a esta orden.
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Usa el selector superior para agregar los productos que deseas pedir.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {lines.length > 0 && (
                  <tfoot className="bg-slate-50/80 dark:bg-raised/40 font-bold border-t border-line">
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-right text-xs uppercase tracking-wider text-slate-400">
                        Total Estimado de la Orden:
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-sm text-[var(--accent-purple)]">
                        {formatCurrency(totalOrderAmount)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-line bg-slate-50/50 dark:bg-raised/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-semibold">
            {lines.length > 0 ? (
              <span>{lines.length} {lines.length === 1 ? 'insumo agregado' : 'insumos agregados'}</span>
            ) : (
              <span>Orden vacía</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="py-2.5 px-4 rounded-full text-xs font-bold text-slate-500 hover:text-content hover:bg-raised transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {/* Crear y Confirmar Pedido Directo */}
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={isSubmitting || lines.length === 0}
              className="py-2.5 px-6 rounded-full text-xs font-black uppercase tracking-wider bg-action text-action-text hover:opacity-90 transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-[0.97]"
            >
              <span>🚀</span>
              <span>{isSubmitting ? 'Guardando...' : 'Crear Orden de Compra'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

