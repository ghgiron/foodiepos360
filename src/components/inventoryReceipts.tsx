// src/components/inventoryReceipts.tsx
import { useState } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import CustomSelect from './ui/CustomSelect';

interface ReceiptLineItem {
  itemId: string;
  name: string;
  quantity: number;
  unitCost: number;
  historicalCost: number;
  variancePercentage: number; // calculated cost variance
}

export default function InventoryReceipts() {
  const [provider, setProvider] = useState('prov-diageo-colombia');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [receiptQuantity, setReceiptQuantity] = useState<number>(0);
  const [receiptCost, setReceiptCost] = useState<number>(0);

  const [receiptItems, setReceiptItems] = useState<ReceiptLineItem[]>([]);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Fetch inventory items reactively from Dexie
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  // Find currently selected item's historical cost to calculate live variance
  const selectedItem = inventoryItems.find(item => item.id === selectedItemId);
  const liveHistoricalCost = selectedItem ? selectedItem.purchaseCost : 0;
  const liveVariance = liveHistoricalCost > 0 
    ? ((receiptCost - liveHistoricalCost) / liveHistoricalCost) * 100 
    : 0;

  // Add line item to pending receipt list
  const handleAddLineItem = () => {
    if (!selectedItemId || receiptQuantity <= 0 || receiptCost <= 0) return;
    const item = inventoryItems.find(i => i.id === selectedItemId);
    if (!item) return;

    const variance = item.purchaseCost > 0 
      ? ((receiptCost - item.purchaseCost) / item.purchaseCost) * 100 
      : 0;

    const line: ReceiptLineItem = {
      itemId: item.id,
      name: item.name,
      quantity: receiptQuantity,
      unitCost: receiptCost,
      historicalCost: item.purchaseCost,
      variancePercentage: variance
    };

    setReceiptItems(prev => [...prev, line]);
    
    // Clear item inputs
    setSelectedItemId('');
    setReceiptQuantity(0);
    setReceiptCost(0);
  };

  // Submit complete invoice receipt and update IndexedDB stocks
  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (receiptItems.length === 0 || !invoiceNumber) return;

    // Run within a safe Dexie transaction
    await db.transaction('rw', [db.inventoryItems, db.domainOutbox], async () => {
      const extractedItemsPayload = [];

      for (const line of receiptItems) {
        const item = await db.inventoryItems.get(line.itemId);
        if (item) {
          const newTheoretical = item.theoreticalStock + line.quantity;
          const newPhysical = item.realPhysicalStock + line.quantity;
          
          // Update item's stock and cost price
          await db.inventoryItems.update(line.itemId, {
            theoreticalStock: newTheoretical,
            realPhysicalStock: newPhysical,
            purchaseCost: line.unitCost, // Update to new purchase cost
            updatedAt: new Date().toISOString()
          });

          extractedItemsPayload.push({
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitCost,
            totalCost: line.quantity * line.unitCost,
            matchedInventoryItemId: line.itemId
          });
        }
      }

      // Enqueue OCR/Purchase scanned Domain Event
      const totalAmount = receiptItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      
      await db.domainOutbox.put({
        eventId: `evt-purchaseocr-${Date.now()}`,
        eventType: 'PurchaseOcrScanned',
        payload: {
          invoiceId: invoiceNumber,
          supplierName: provider === 'prov-diageo-colombia' ? 'Diageo Colombia' : 'Carnes del Norte',
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

    // Reset layout state
    setReceiptItems([]);
    setInvoiceNumber('');
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  return (
    <div className="p-8 space-y-8 transition-receitly overflow-y-auto flex-1 font-body">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-headline font-black text-slate-900 dark:text-white">Ingreso de Mercancía</h2>
          <p className="text-slate-500 font-semibold text-sm">Registra facturas de compras y audita las variaciones de costo en tiempo real.</p>
        </div>
        {showSuccessToast && (
          <div className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold animate-pulse shadow-md">
            Ingreso guardado y stock actualizado con éxito
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Receipt Form Column */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Nueva Factura de Proveedor</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Proveedor</label>
              <CustomSelect
                value={provider}
                onChange={setProvider}
                options={[
                  { value: 'prov-diageo-colombia', label: 'Diageo Colombia S.A.S.' },
                  { value: 'prov-carnes-del-norte', label: 'Distribuidora Carnes del Norte' },
                  { value: 'prov-lacteos-italianos', label: 'Lácteos Italianos Premium' }
                ]}
                className="w-full bg-white dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Número de Factura / Cuenta</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-xl border-slate-200 dark:border-slate-800 dark:bg-[var(--card-color)] dark:text-white p-3 text-sm focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                placeholder="ej. FAC-80921"
              />
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Añadir Ingrediente / Insumo</h4>
              
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Insumo</label>
                <CustomSelect
                  value={selectedItemId}
                  onChange={setSelectedItemId}
                  options={inventoryItems.map(item => ({ value: item.id, label: `${item.name} (${item.countUnit})` }))}
                  placeholder="Seleccionar insumo..."
                  className="w-full bg-white dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cantidad Recibida</label>
                  <input
                    type="number"
                    value={receiptQuantity}
                    onChange={(e) => setReceiptQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border-slate-200 dark:border-slate-800 dark:bg-[var(--card-color)] dark:text-white p-3 text-sm focus:ring-2 focus:ring-[var(--accent-purple)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Costo Unitario FAC</label>
                  <input
                    type="number"
                    value={receiptCost}
                    onChange={(e) => setReceiptCost(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border-slate-200 dark:border-slate-800 dark:bg-[var(--card-color)] dark:text-white p-3 text-sm focus:ring-2 focus:ring-[var(--accent-purple)]"
                  />
                </div>
              </div>

              {/* Live Cost Variance Indicator (Disney Real-time Cost Watch) */}
              {selectedItemId && receiptCost > 0 && (
                <div className={`p-3 rounded-xl border ${
                  liveVariance > 5 
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                }`}>
                  <p className="text-xs font-bold flex justify-between">
                    <span>Costo Histórico:</span>
                    <span>${liveHistoricalCost.toLocaleString('es-CO')}</span>
                  </p>
                  <p className="text-xs font-bold flex justify-between mt-1">
                    <span>Variación de Costo:</span>
                    <span className="font-black">
                      {liveVariance > 0 ? '+' : ''}{liveVariance.toFixed(1)}%
                    </span>
                  </p>
                  {liveVariance > 5 && (
                    <p className="text-[10px] font-medium mt-1 leading-normal">
                      ⚠️ ¡Alerta! El incremento supera el 5% corporativo. Afectará negativamente al CMV.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddLineItem}
                disabled={!selectedItemId || receiptQuantity <= 0 || receiptCost <= 0}
                className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Añadir a la Fila
              </button>
            </div>
          </div>
        </div>

        {/* Invoice Summary and Cost Variance Auditor Column (2/3 width) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[480px]">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Auditoría de Insumos a Registrar</h3>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Proveedor: {provider === 'prov-diageo-colombia' ? 'Diageo' : 'Carnes'}
              </span>
            </div>

            {/* Receipt line items preview table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[var(--card-color)]/30 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-800">
                    <th className="py-3 px-4">Item</th>
                    <th className="py-3 px-4 text-right">Cant</th>
                    <th className="py-3 px-4 text-right">Unitario</th>
                    <th className="py-3 px-4 text-right">Histórico</th>
                    <th className="py-3 px-4 text-center">Variación</th>
                    <th className="py-3 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {receiptItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                        No hay insumos añadidos a este comprobante.
                      </td>
                    </tr>
                  ) : (
                    receiptItems.map((line, index) => {
                      const isHighVariance = line.variancePercentage > 5;
                      return (
                        <tr key={index} className={isHighVariance ? 'bg-rose-500/5' : ''}>
                          <td className="py-4 px-4 font-bold text-slate-800 dark:text-slate-200">{line.name}</td>
                          <td className="py-4 px-4 text-right font-mono font-bold">{line.quantity}</td>
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
                          <td className="py-4 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            ${(line.quantity * line.unitCost).toLocaleString('es-CO')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Form Actions Footer */}
          {receiptItems.length > 0 && (
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center mt-6">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Compra Net</p>
                <h4 className="text-2xl font-manrope font-black text-slate-900 dark:text-white">
                  ${receiptItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0).toLocaleString('es-CO')}
                </h4>
              </div>
              <button
                onClick={handleSubmitReceipt}
                disabled={!invoiceNumber}
                className="px-8 py-4 bg-slate-950 text-white font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
              >
                Registrar Entrada de Mercancía
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
