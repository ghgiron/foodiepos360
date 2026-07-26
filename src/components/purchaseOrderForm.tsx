// src/components/purchaseOrderForm.tsx
import React, { useState } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import ImageUploader from './ImageUploader';
import CustomSelect from './ui/CustomSelect';

interface ReceiptLineItem {
  itemId: string;
  name: string;
  quantity: number;
  unitCost: number;
  historicalCost: number;
  variancePercentage: number;
  updateCost: boolean;
  quality: 'Excelente' | 'Aceptable' | 'Defectuoso';
  comment?: string;
  photoUrl?: string;
}

export default function PurchaseOrderForm() {
  const [provider, setProvider] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  
  // Selected Item Addition Form States
  const [selectedItemId, setSelectedItemId] = useState('');
  const [receiptQuantity, setReceiptQuantity] = useState<number>(0);
  const [receiptCost, setReceiptCost] = useState<number>(0);
  const [quality, setQuality] = useState<'Excelente' | 'Aceptable' | 'Defectuoso'>('Excelente');
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Line Items List State
  const [receiptItems, setReceiptItems] = useState<ReceiptLineItem[]>([]);

  // Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Live query data from database
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Automatically set default provider when loaded
  React.useEffect(() => {
    if (suppliers.length > 0 && !provider) {
      setProvider(suppliers[0].id);
    }
  }, [suppliers, provider]);

  // Selected item details for live variance feedback
  const selectedItem = inventoryItems.find(item => item.id === selectedItemId);
  const referencePrice = selectedItem 
    ? (selectedItem.averagePrice || selectedItem.purchaseCost || 0)
    : 0;

  const liveVariance = referencePrice > 0 
    ? ((receiptCost - referencePrice) / referencePrice) * 100 
    : 0;

  // Add item to list with variation logic check
  const handleAddLineItem = () => {
    if (!selectedItemId || receiptQuantity <= 0 || receiptCost <= 0) {
      toast.error('Por favor complete todos los campos obligatorios del insumo.');
      return;
    }
    const item = inventoryItems.find(i => i.id === selectedItemId);
    if (!item) return;

    if (quality === 'Defectuoso' && !comment.trim()) {
      toast.error('El comentario del proveedor es obligatorio cuando la recepción es defectuosa.');
      return;
    }

    const variance = referencePrice > 0 
      ? ((receiptCost - referencePrice) / referencePrice) * 100 
      : 0;

    const commitLine = (shouldUpdateCost: boolean) => {
      const line: ReceiptLineItem = {
        itemId: item.id,
        name: item.name,
        quantity: receiptQuantity,
        unitCost: receiptCost,
        historicalCost: referencePrice,
        variancePercentage: variance,
        updateCost: shouldUpdateCost,
        quality,
        comment: quality === 'Defectuoso' ? comment : undefined,
        photoUrl: quality === 'Defectuoso' ? photoUrl : undefined
      };

      setReceiptItems(prev => [...prev, line]);

      // Reset item inputs
      setSelectedItemId('');
      setReceiptQuantity(0);
      setReceiptCost(0);
      setQuality('Excelente');
      setComment('');
      setPhotoUrl('');
      setConfirmConfig(null);
      toast.success(`${item.name} añadido a la fila.`);
    };

    // If variance is > 10% (positive or negative), show ConfirmDialog
    if (referencePrice > 0 && Math.abs(variance) > 10) {
      setConfirmConfig({
        isOpen: true,
        title: 'Alerta de Variación de Precio',
        message: `El precio del insumo "${item.name}" varió un ${variance.toFixed(1)}% con respecto al precio promedio ($${referencePrice.toLocaleString('es-CO')}). ¿Desea actualizar el costo base de la receta?`,
        confirmText: 'Sí, actualizar costo',
        cancelText: 'No, mantener costo base',
        onConfirm: () => commitLine(true),
        onCancel: () => commitLine(false)
      });
    } else {
      // Under 10% change, update the cost base by default
      commitLine(true);
    }
  };

  const handleRemoveLineItem = (index: number) => {
    setReceiptItems(prev => prev.filter((_, i) => i !== index));
    toast.success('Insumo removido de la fila.');
  };

  const totalAmount = receiptItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  // Submit complete order to DB
  const handleSubmitReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (receiptItems.length === 0) {
      toast.error('Debe añadir al menos un insumo a la factura.');
      return;
    }
    if (!invoiceNumber.trim()) {
      toast.error('El número de factura es obligatorio.');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'Confirmar Registro de Compra',
      message: `¿Está seguro de registrar este ingreso de mercancía por un total de $${totalAmount.toLocaleString('es-CO')}? Esto modificará los stocks y costos de recetas correspondientes.`,
      confirmText: 'Registrar Ingreso',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        try {
          await db.transaction('rw', [db.inventoryItems, db.inventoryLogs, db.supplierIncidents, db.domainOutbox], async () => {
            const extractedItemsPayload = [];

            for (const line of receiptItems) {
              const item = await db.inventoryItems.get(line.itemId);
              if (item) {
                const currentStock = item.realPhysicalStock || 0;
                const newTheoretical = (item.theoreticalStock || 0) + line.quantity;
                const newPhysical = currentStock + line.quantity;

                // Calculate weighted average price
                const currentAveragePrice = item.averagePrice || item.purchaseCost || 0;
                const newAveragePrice = (currentStock + line.quantity) > 0
                  ? ((currentAveragePrice * currentStock) + (line.unitCost * line.quantity)) / (currentStock + line.quantity)
                  : line.unitCost;

                // Set new technical purchase cost if updateCost is flagged
                const newPurchaseCost = line.updateCost ? line.unitCost : (item.purchaseCost || line.unitCost);

                await db.inventoryItems.update(line.itemId, {
                  theoreticalStock: newTheoretical,
                  realPhysicalStock: newPhysical,
                  averagePrice: newAveragePrice,
                  purchaseCost: newPurchaseCost,
                  updatedAt: new Date().toISOString()
                });

                // Record log
                await db.inventoryLogs.add({
                  id: `log-purchase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  itemId: line.itemId,
                  itemName: line.name,
                  type: 'Compra',
                  quantity: line.quantity,
                  reason: `Compra - Factura ${invoiceNumber}`,
                  user: 'Admin',
                  timestamp: new Date().toISOString()
                });

                // Persist Supplier Quality Incidents if marked Defectuoso
                if (line.quality === 'Defectuoso') {
                  await db.supplierIncidents.add({
                    id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    supplierId: provider,
                    itemId: line.itemId,
                    invoiceNumber: invoiceNumber,
                    quality: line.quality,
                    comment: line.comment || '',
                    photoUrl: line.photoUrl || '',
                    recordedAt: new Date().toISOString()
                  });
                }

                extractedItemsPayload.push({
                  name: line.name,
                  quantity: line.quantity,
                  unitPrice: line.unitCost,
                  totalCost: line.quantity * line.unitCost,
                  matchedInventoryItemId: line.itemId
                });
              }
            }

            // Enqueue Offline Sync Event
            await db.domainOutbox.put({
              eventId: `evt-purchase-${Date.now()}`,
              eventType: 'PurchaseOcrScanned',
              payload: {
                invoiceId: invoiceNumber,
                supplierName: suppliers.find(s => s.id === provider)?.name || provider,
                invoiceDate: new Date().toISOString().split('T')[0],
                totalAmount,
                taxAmount: totalAmount * 0.08, // 8% mock tax
                extractedItems: extractedItemsPayload
              },
              status: 'PENDING',
              createdAt: new Date().toISOString(),
              syncedAt: null
            });
          });

          toast.success('Factura registrada y stocks actualizados exitosamente.');
          setReceiptItems([]);
          setInvoiceNumber('');
          setConfirmConfig(null);
        } catch (error) {
          console.error(error);
          toast.error('Ocurrió un error al registrar la compra en la base de datos.');
        }
      }
    });
  };

  return (
    <div className="p-8 space-y-8 transition-receitly overflow-y-auto flex-1 font-body">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-headline font-black text-slate-900 dark:text-white uppercase tracking-wider">
          Entradas Inteligentes (Compras)
        </h2>
        <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">
          Registra facturas de proveedores, evalúa la calidad de recepción y controla las desviaciones de precio en recetas.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Purchase Order Details Form */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
              Datos de Facturación
            </h3>
            
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Proveedor
              </label>
              <CustomSelect
                value={provider}
                onChange={setProvider}
                options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                placeholder={suppliers.length === 0 ? "Cargando proveedores..." : "Seleccionar Proveedor"}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Número de Factura / Cuenta
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-slate-950 dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                placeholder="ej. FAC-2026-981"
              />
            </div>

            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pt-4 pb-2">
              Añadir Insumo
            </h3>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Seleccionar Insumo / Ingrediente
              </label>
              <CustomSelect
                value={selectedItemId}
                onChange={setSelectedItemId}
                options={inventoryItems.map(item => ({ value: item.id, label: `${item.name} (${item.countUnit})` }))}
                placeholder="-- Seleccione un insumo --"
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  value={receiptQuantity || ''}
                  onChange={(e) => setReceiptQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-slate-950 dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Costo Unitario
                </label>
                <input
                  type="number"
                  value={receiptCost || ''}
                  onChange={(e) => setReceiptCost(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-slate-950 dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="$0.00"
                />
              </div>
            </div>

            {/* Quality Control Fields */}
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Calidad de Recepción
              </label>
              <CustomSelect
                value={quality}
                onChange={(val) => setQuality(val as any)}
                options={[
                  { value: 'Excelente', label: 'Excelente' },
                  { value: 'Aceptable', label: 'Aceptable' },
                  { value: 'Defectuoso', label: 'Defectuoso' }
                ]}
                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* Incident logs conditional block */}
            {quality === 'Defectuoso' && (
              <div className="space-y-3 p-4 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-2xl animate-fade-in">
                <div>
                  <label className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider block mb-1">
                    Comentario de Proveedor *
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-slate-950 dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                    placeholder="Escriba el motivo del descarte o desperfecto..."
                  />
                </div>
                <div>
                  <ImageUploader
                    value={photoUrl}
                    onChange={(base64) => setPhotoUrl(base64)}
                    label="Foto de Evidencia"
                    helperText="Evidencia fotográfica para reclamos al proveedor."
                    className="p-4"
                  />
                </div>
              </div>
            )}

            {/* Live Price Deviation Audit Alert Card */}
            {selectedItemId && receiptCost > 0 && (
              <div className={`p-4 rounded-2xl border ${
                Math.abs(liveVariance) > 10 
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500'
              }`}>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span>Costo Histórico Ref:</span>
                  <span className="font-mono">${referencePrice.toLocaleString('es-CO')}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold mt-1">
                  <span>Variación Costo:</span>
                  <span className="font-mono font-black">
                    {liveVariance > 0 ? '+' : ''}{liveVariance.toFixed(1)}%
                  </span>
                </div>
                {Math.abs(liveVariance) > 10 && (
                  <p className="text-[10px] font-medium mt-1 leading-normal">
                    ⚠️ ¡Alerta! La variación supera el 10%. Esto activará el diálogo de actualización de costos al añadirlo.
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddLineItem}
            className="w-full mt-4 py-3 bg-slate-900 hover:bg-slate-850 dark:bg-[var(--card-color)] dark:hover:bg-slate-750 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            Añadir Insumo
          </button>
        </div>

        {/* Invoice Summary and Audit List */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[480px]">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-extrabold text-slate-850 dark:text-slate-200 uppercase tracking-wider">
                Auditoría de Insumos Facturados
              </h3>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Líneas: {receiptItems.length}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-800">
                    <th className="py-3 px-4">Item</th>
                    <th className="py-3 px-4 text-center">Calidad</th>
                    <th className="py-3 px-4 text-right">Cant</th>
                    <th className="py-3 px-4 text-right">Unitario</th>
                    <th className="py-3 px-4 text-right">Histórico</th>
                    <th className="py-3 px-4 text-center">Variación</th>
                    <th className="py-3 px-4 text-center">Receta</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold">
                  {receiptItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                        No hay insumos añadidos a esta factura de compra.
                      </td>
                    </tr>
                  ) : (
                    receiptItems.map((line, index) => {
                      const isHighVariance = Math.abs(line.variancePercentage) > 10;
                      return (
                        <tr key={index} className={isHighVariance ? 'bg-rose-500/5' : ''}>
                          <td className="py-4 px-4 font-bold text-slate-800 dark:text-slate-200">
                            {line.name}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              line.quality === 'Excelente' ? 'bg-emerald-500/10 text-emerald-600' :
                              line.quality === 'Aceptable' ? 'bg-sky-500/10 text-sky-600' :
                              'bg-rose-500/10 text-rose-600'
                            }`}>
                              {line.quality}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right font-mono">{line.quantity}</td>
                          <td className="py-4 px-4 text-right font-mono">${line.unitCost.toLocaleString('es-CO')}</td>
                          <td className="py-4 px-4 text-right font-mono text-slate-400">${line.historicalCost.toLocaleString('es-CO')}</td>
                          <td className="py-4 px-4 text-center">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${
                              isHighVariance 
                                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                                : 'bg-emerald-500/10 text-emerald-600'
                            }`}>
                              {line.variancePercentage > 0 ? '+' : ''}{line.variancePercentage.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              line.updateCost ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-450' : 'bg-slate-100 text-slate-700 dark:bg-[var(--card-color)] dark:text-slate-400'
                            }`}>
                              {line.updateCost ? 'Actualiza' : 'Mantiene'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            ${(line.quantity * line.unitCost).toLocaleString('es-CO')}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(index)}
                              className="text-rose-500 hover:text-rose-650 cursor-pointer font-bold transition-all text-xs"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save/Register Purchase Actions */}
          {receiptItems.length > 0 && (
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center mt-6">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Factura</p>
                <h4 className="text-2xl font-manrope font-black text-slate-900 dark:text-white">
                  ${totalAmount.toLocaleString('es-CO')}
                </h4>
              </div>
              <button
                type="button"
                onClick={handleSubmitReceipt}
                disabled={!invoiceNumber.trim()}
                className="px-8 py-4 bg-slate-950 hover:bg-slate-850 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
              >
                Registrar Entrada de Mercancía
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog Component */}
      {confirmConfig && (
        <ConfirmDialog
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          cancelText={confirmConfig.cancelText}
          onConfirm={confirmConfig.onConfirm}
          onCancel={confirmConfig.onCancel}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}
