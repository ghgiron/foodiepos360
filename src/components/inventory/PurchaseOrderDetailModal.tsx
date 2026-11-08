// src/components/inventory/PurchaseOrderDetailModal.tsx
import { useState } from 'react';
import type { PurchaseOrder, Supplier } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getHumanizedPurchaseOrderSupplier } from '../../utils/purchaseOrderUtils';
import { cancelPurchaseOrder } from '../../services/purchaseOrderService';
import { toast } from 'react-hot-toast';

interface PurchaseOrderDetailModalProps {
  order: PurchaseOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onReceiveOrder?: (order: PurchaseOrder) => void;
  onOrderCancelled?: (orderId: string) => void;
  suppliers?: Supplier[];
}

export default function PurchaseOrderDetailModal({
  order,
  isOpen,
  onClose,
  onReceiveOrder,
  onOrderCancelled,
  suppliers = []
}: PurchaseOrderDetailModalProps) {
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('Cancelada por el administrador');
  const [isCancelling, setIsCancelling] = useState(false);

  if (!isOpen || !order) return null;

  const supplierName = getHumanizedPurchaseOrderSupplier(order, suppliers);
  const isCancellable = order.status === 'DRAFT' || order.status === 'ORDERED';
  const totalAmount = order.totalEstimatedCost ?? (order as any).totalAmount ?? (order as any).estimatedTotal ?? (order as any).total ?? 0;

  const formatDateSafe = (dateVal: any): string => {
    if (!dateVal) return 'Sin fecha';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return 'Fecha no disponible';
      return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return 'Sin fecha';
    }
  };

  // Status Badge Styling
  const renderStatusBadge = (status: PurchaseOrder['status']) => {
    switch (status) {
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Recibida en Inventario
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Cancelada
          </span>
        );
      case 'ORDERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Pedida al Proveedor
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Borrador Sugerido
          </span>
        );
    }
  };

  const handleConfirmCancel = async () => {
    try {
      setIsCancelling(true);
      await cancelPurchaseOrder(order.id, cancelReason);
      toast.success('Orden de compra cancelada exitosamente.', { icon: '🛑' });
      setIsConfirmingCancel(false);
      onOrderCancelled?.(order.id);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'No fue posible cancelar la orden de compra.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in font-body">
      <div 
        className="bg-surface border border-line rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
      >
        {/* Header */}
        <div className="p-5 border-b border-line flex items-start justify-between gap-4 bg-slate-50/50 dark:bg-raised/20">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 id="order-detail-title" className="text-xl font-headline font-black text-content tracking-tight">
                Orden de Compra: {supplierName}
              </h2>
              {renderStatusBadge(order.status)}
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Registro creado el {formatDateSafe(order.createdAt)}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-content hover:bg-raised rounded-full transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-content">
          
          {/* Metadata Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-raised/30 rounded-lg border border-line">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                Proveedor
              </span>
              <span className="text-xs font-bold text-content truncate block" title={supplierName}>
                {supplierName}
              </span>
            </div>

            <div className="p-3 bg-raised/30 rounded-lg border border-line">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                Total Insumos
              </span>
              <span className="text-xs font-mono font-bold tabular-nums text-content block">
                {order.items?.length || order.itemsCount || 0} ítems
              </span>
            </div>

            <div className="p-3 bg-raised/30 rounded-lg border border-line">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                Importe Total
              </span>
              <span className="text-xs font-mono font-black tabular-nums text-[var(--accent-purple)] block">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            <div className="p-3 bg-raised/30 rounded-lg border border-line">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                Factura Vinculada
              </span>
              <span className="text-xs font-bold text-content truncate block">
                {order.invoiceNumber ? `Fac #${order.invoiceNumber}` : 'Sin factura'}
              </span>
            </div>
          </div>

          {/* Conditional Alerts: Received or Cancelled */}
          {order.status === 'RECEIVED' && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-lg flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>
                Esta orden fue recibida formalmente en el inventario el{' '}
                <strong>
                  {formatDateSafe(order.receivedAt)}
                </strong>. Los stocks fueron actualizados en el Kardex.
              </span>
            </div>
          )}

          {order.status === 'CANCELLED' && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-lg space-y-1 text-xs text-red-600 dark:text-red-400 font-semibold">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">cancel</span>
                <span>
                  Orden cancelada el{' '}
                  <strong>
                    {formatDateSafe(order.cancelledAt)}
                  </strong>.
                </span>
              </div>
              {order.cancellationReason && (
                <p className="text-[11px] text-slate-500 pl-6">
                  Motivo: "{order.cancellationReason}"
                </p>
              )}
            </div>
          )}

          {/* Items Table */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">inventory_2</span>
              Desglose de Insumos ({order.items?.length || 0})
            </h3>
            
            <div className="border border-line rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-raised/50 border-b border-line text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Insumo</th>
                    <th className="py-2.5 px-3 text-right">Cant. Solicitada</th>
                    <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {order.items?.map((item, idx) => (
                    <tr key={item.itemId || idx} className="hover:bg-raised/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-content">{item.name}</span>
                          {item.priority === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-500/15 text-red-600">
                              Agotado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-content">
                        {item.quantity} {item.unit || 'und'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                        {formatCurrency(item.unitCost || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-content">
                        {formatCurrency(item.estimatedCost || (item.quantity * (item.unitCost || 0)))}
                      </td>
                    </tr>
                  ))}
                  {(!order.items || order.items.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        No hay ítems registrados en esta orden.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50/80 dark:bg-raised/40 font-bold border-t border-line">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3 text-right text-[11px] uppercase tracking-wider text-slate-400">
                      Total Estimado:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-sm text-[var(--accent-purple)]">
                      {formatCurrency(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Cancellation Confirmation Box (Inline) */}
          {isConfirmingCancel && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3 animate-fade-in">
              <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                <span className="material-symbols-outlined text-lg">warning</span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">
                    ¿Confirmas la cancelación de esta orden de compra?
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Esta acción marcará la orden como CANCELLED de forma permanente y ya no podrá ser precargada en Entradas.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Motivo de Cancelación
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ej. Insumos ya comprados por otra vía, error de cotización..."
                  className="w-full bg-surface border border-line rounded-sm p-2 text-xs font-semibold text-content outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsConfirmingCancel(false)}
                  disabled={isCancelling}
                  className="py-1.5 px-3 rounded-full text-xs font-bold text-slate-500 hover:text-content hover:bg-raised transition-colors cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isCancelling}
                  className="py-1.5 px-4 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelando...' : 'Sí, Cancelar Orden'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 border-t border-line bg-slate-50/50 dark:bg-raised/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            {isCancellable && !isConfirmingCancel && (
              <button
                type="button"
                onClick={() => setIsConfirmingCancel(true)}
                className="py-2 px-4 rounded-full text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/25 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">cancel</span>
                <span>Cancelar Orden</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-full text-xs font-bold text-slate-500 hover:text-content hover:bg-raised transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            {isCancellable && onReceiveOrder && (
              <button
                type="button"
                onClick={() => {
                  onReceiveOrder(order);
                  onClose();
                }}
                className="py-2.5 px-6 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-md shadow-emerald-600/20 active:scale-[0.97] transition-all cursor-pointer"
              >
                <span>⚡</span>
                <span>Recibir en Compras</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

