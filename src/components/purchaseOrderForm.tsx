// src/components/purchaseOrderForm.tsx
import React, { useState } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import ImageUploader from './ImageUploader';
import CustomSelect from './ui/CustomSelect';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import ProduceSubRecipeModal from './inventory/ProduceSubRecipeModal';
import { 
  getActiveBranchId, 
  normalizeBranchId,
  setBranchStockValue,
  setSucursalStockValue,
  areBranchIdsEqual,
  formatQuantityDecimals
} from '../utils/branchHelper';
import { getPhysicalStockInBranch, getReservedStockInBranch } from '../types';
import { getItemResourceType } from '../utils/dataHelper';
import { syncRecordToFirestore } from '../services/syncService';

import { useQualityRatings } from '../hooks/useCatalogs';

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
  lote?: string;
  fechaVencimiento?: string;
}

interface PurchaseOrderFormProps {
  initialSupplierId?: string;
  initialItems?: any[];
  onComplete?: () => void;
}

export default function PurchaseOrderForm({ initialSupplierId, initialItems, onComplete }: PurchaseOrderFormProps = {}) {
  const qualityRatingsList = useQualityRatings();
  const qualityOptions = React.useMemo(() => {
    return qualityRatingsList.map(q => ({ value: q, label: q }));
  }, [qualityRatingsList]);

  const activeBranch = getActiveBranchId();
  const [targetBranchId, setTargetBranchId] = useState(activeBranch);
  const [provider, setProvider] = useState(initialSupplierId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  const [resourceFilter, setResourceFilter] = useState<'ALL' | 'INGREDIENT' | 'PRODUCT' | 'PACKAGING'>('ALL');
  const [entryMode, setEntryMode] = useState<'COUNT_UNIT' | 'PACK_UNIT'>('COUNT_UNIT');
  
  // Selected Item Addition Form States
  const [selectedItemId, setSelectedItemId] = useState('');
  const [receiptQuantity, setReceiptQuantity] = useState<number>(0);
  const [receiptCost, setReceiptCost] = useState<number>(0);
  const [quality, setQuality] = useState<'Excelente' | 'Aceptable' | 'Defectuoso'>('Excelente');
  const [lote, setLote] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Line Items List State
  const [receiptItems, setReceiptItems] = useState<ReceiptLineItem[]>(() => {
    if (!initialItems || initialItems.length === 0) return [];
    return initialItems.map(item => ({
      itemId: item.itemId || item.id,
      name: item.name,
      quantity: item.quantity || item.qtyNeeded || 1,
      unitCost: item.unitCost || item.cost || item.purchaseCost || 0,
      historicalCost: item.historicalCost || item.purchaseCost || item.unitCost || 0,
      variancePercentage: 0,
      updateCost: true,
      quality: 'Excelente',
      lote: item.lote || '',
      fechaVencimiento: item.fechaVencimiento || ''
    }));
  });

  // Sync when initialSupplierId or initialItems change
  React.useEffect(() => {
    if (initialSupplierId) setProvider(initialSupplierId);
    if (initialItems && initialItems.length > 0) {
      setReceiptItems(initialItems.map(item => ({
        itemId: item.itemId || item.id,
        name: item.name,
        quantity: item.quantity || item.qtyNeeded || 1,
        unitCost: item.unitCost || item.cost || item.purchaseCost || 0,
        historicalCost: item.historicalCost || item.purchaseCost || item.unitCost || 0,
        variancePercentage: 0,
        updateCost: true,
        quality: 'Excelente',
        lote: item.lote || '',
        fechaVencimiento: item.fechaVencimiento || ''
      })));
    }
  }, [initialSupplierId, initialItems]);

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
  const branchSettings = useLiveQuery(() => db.systemSettings.get('system_branches'));
  const availableBranches = React.useMemo(() => {
    if (Array.isArray(branchSettings?.value) && branchSettings.value.length > 0) {
      return branchSettings.value.filter((b: any) => b.active !== false);
    }
    return [{ id: targetBranchId, name: 'Sede Principal' }];
  }, [branchSettings, targetBranchId]);

  // Automatically set default provider when loaded
  React.useEffect(() => {
    if (suppliers.length > 0 && !provider) {
      setProvider(suppliers[0].id);
    }
  }, [suppliers, provider]);

  // Selected item details for live variance feedback
  const filteredInventoryItems = React.useMemo(() => {
    const activeList = inventoryItems.filter(it => it.inventoryType !== 'ASSET');
    if (resourceFilter === 'ALL') return activeList;
    return activeList.filter(it => getItemResourceType(it) === resourceFilter);
  }, [inventoryItems, resourceFilter]);

  const selectedItem = inventoryItems.find(item => item.id === selectedItemId);
  const packFactor = selectedItem && Number(selectedItem.cantidadUtilizable) > 1
    ? Number(selectedItem.cantidadUtilizable)
    : 1;
  const effectiveAddedStockQty = entryMode === 'PACK_UNIT' && packFactor > 1
    ? Math.round((receiptQuantity * packFactor + Number.EPSILON) * 1000) / 1000
    : receiptQuantity;

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
        quantity: effectiveAddedStockQty,
        unitCost: entryMode === 'PACK_UNIT' && packFactor > 1
          ? Math.round(((receiptCost / packFactor) + Number.EPSILON) * 100) / 100
          : receiptCost,
        historicalCost: referencePrice,
        variancePercentage: variance,
        updateCost: shouldUpdateCost,
        quality,
        lote: lote.trim() || undefined,
        fechaVencimiento: fechaVencimiento || undefined,
        comment: quality === 'Defectuoso' ? comment : undefined,
        photoUrl: quality === 'Defectuoso' ? photoUrl : undefined
      };

      setReceiptItems(prev => [...prev, line]);

      // Reset item inputs
      setSelectedItemId('');
      setReceiptQuantity(0);
      setReceiptCost(0);
      setEntryMode('COUNT_UNIT');
      setQuality('Excelente');
      setLote('');
      setFechaVencimiento('');
      setComment('');
      setPhotoUrl('');
      setConfirmConfig(null);
      toast.success(`${item.name} (+${formatQuantityDecimals(effectiveAddedStockQty)} ${item.countUnit}) añadido a la lista.`);
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
          const cleanBranchId = normalizeBranchId(targetBranchId || activeBranch);
          const validBranchIds = new Set<string>(
            availableBranches.map((b: any) => normalizeBranchId(String(b.id)).toLowerCase().trim())
          );
          validBranchIds.add(cleanBranchId.toLowerCase().trim());
          const updatedItemsForCloud: any[] = [];

          await db.transaction('rw', [db.inventoryItems, db.inventoryLogs, db.supplierIncidents, db.domainOutbox], async () => {
            const extractedItemsPayload = [];

            for (const line of receiptItems) {
              const item = await db.inventoryItems.get(line.itemId);
              if (item) {
                const curBranchPhys = getPhysicalStockInBranch(item, cleanBranchId);
                const newBranchPhys = Math.round((curBranchPhys + line.quantity + Number.EPSILON) * 1000) / 1000;

                const stockByBranch = setBranchStockValue(
                  item.stockByBranch,
                  cleanBranchId,
                  newBranchPhys,
                  validBranchIds
                );
                const sucursalStock = setSucursalStockValue(
                  item.sucursalStock,
                  cleanBranchId,
                  newBranchPhys,
                  {
                    lote: line.lote || item.lote,
                    fechaVencimiento: line.fechaVencimiento || item.fechaVencimiento,
                    batchObservations: `Entrada compra fac: ${invoiceNumber.trim() || 'S/N'}`
                  },
                  validBranchIds
                );

                const newPhysical = Object.keys(stockByBranch).length > 0
                  ? Math.round(Object.values(stockByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0) * 1000) / 1000
                  : newBranchPhys;
                const reservedStock = getReservedStockInBranch(item, cleanBranchId);
                const newAvailable = Math.max(0, newPhysical - reservedStock);

                // Calculate weighted average price
                const currentPhysical = item.currentStock ?? item.realPhysicalStock ?? 0;
                const currentAveragePrice = item.averagePrice || item.purchaseCost || 0;
                const newAveragePrice = (currentPhysical + line.quantity) > 0
                  ? ((currentAveragePrice * currentPhysical) + (line.unitCost * line.quantity)) / (currentPhysical + line.quantity)
                  : line.unitCost;

                // Set new technical purchase cost if updateCost is flagged
                const newPurchaseCost = line.updateCost ? line.unitCost : (item.purchaseCost || line.unitCost);

                const updatedItemRecord = {
                  ...item,
                  theoreticalStock: newPhysical,
                  realPhysicalStock: newPhysical,
                  currentStock: newPhysical,
                  availableStock: newAvailable,
                  averagePrice: newAveragePrice,
                  purchaseCost: newPurchaseCost,
                  stockByBranch,
                  sucursalStock,
                  lote: line.lote || item.lote,
                  fechaVencimiento: line.fechaVencimiento || item.fechaVencimiento,
                  updatedAt: new Date().toISOString()
                };

                await db.inventoryItems.put(updatedItemRecord);
                updatedItemsForCloud.push(updatedItemRecord);

                // Record formal Kardex log
                await db.inventoryLogs.add({
                  id: `log-purchase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  itemId: line.itemId,
                  itemName: line.name,
                  type: 'ENTRADA_COMPRA',
                  quantity: line.quantity,
                  reason: `Entrada por Compra - Factura/Remisión ${invoiceNumber.trim() || 'S/N'}`,
                  user: 'Admin',
                  timestamp: new Date().toISOString(),
                  branchId: cleanBranchId
                });

                // Persist Supplier Quality Incidents if marked Defectuoso
                if (line.quality === 'Defectuoso') {
                  await db.supplierIncidents.add({
                    id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    supplierId: provider,
                    itemId: line.itemId,
                    invoiceNumber: invoiceNumber.trim(),
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
                  matchedInventoryItemId: line.itemId,
                  lote: line.lote,
                  fechaVencimiento: line.fechaVencimiento
                });
              }
            }

            // Enqueue Offline Sync Event
            await db.domainOutbox.put({
              eventId: `evt-purchase-${Date.now()}`,
              eventType: 'PurchaseOcrScanned',
              payload: {
                invoiceId: invoiceNumber.trim(),
                supplierName: suppliers.find(s => s.id === provider)?.name || provider,
                invoiceDate: new Date().toISOString().split('T')[0],
                totalAmount,
                taxAmount: totalAmount * 0.08, // 8% tax
                branchId: cleanBranchId,
                extractedItems: extractedItemsPayload
              },
              status: 'PENDING',
              createdAt: new Date().toISOString(),
              syncedAt: null
            });
          });

          if (updatedItemsForCloud.length > 0) {
            await Promise.all(
              updatedItemsForCloud.map(it => syncRecordToFirestore('inventoryItems', it.id, it))
            ).catch(() => {});
          }

          toast.success(`Factura registrada exitosamente para la sede ${cleanBranchId}. Stocks actualizados.`);
          setReceiptItems([]);
          setInvoiceNumber('');
          setConfirmConfig(null);
          onComplete?.();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-headline font-black text-content uppercase tracking-wider">
            Entradas Inteligentes (Compras)
          </h2>
          <p className="text-content-secondary font-semibold text-sm">
            Registra facturas de proveedores, evalúa la calidad de recepción y controla las desviaciones de precio en recetas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsProduceModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-95 shrink-0 self-start sm:self-auto"
          title="Registrar producción interna de lotes de subrecetas"
        >
          <span className="material-symbols-outlined text-sm font-bold">skillet</span>
          + Producir Lote Interno
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Purchase Order Details Form */}
        <div className="lg:col-span-1 bg-surface p-6 rounded-3xl border border-line shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-line pb-2">
              Datos de Facturación
            </h3>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Sede de Destino / Recepción
              </label>
              <CustomSelect
                value={targetBranchId}
                onChange={setTargetBranchId}
                options={availableBranches.map(b => ({
                  value: b.id,
                  label: `${b.name || b.id} ${areBranchIdsEqual(b.id, activeBranch) ? '⭐ (Activa)' : ''}`
                }))}
                className="w-full bg-surface border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-content"
              />
            </div>
            
            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Proveedor
              </label>
              <CustomSelect
                value={provider}
                onChange={setProvider}
                options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                placeholder={suppliers.length === 0 ? "Cargando proveedores..." : "Seleccionar Proveedor"}
                className="w-full bg-surface border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-content"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Número de Factura / Cuenta
              </label>
              <Input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                placeholder="ej. FAC-2026-981"
              />
            </div>

            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-line pt-4 pb-2">
              Añadir Insumo / Producto / Suministro
            </h3>

            {/* Resource Type Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'ALL', label: 'Todos' },
                { key: 'INGREDIENT', label: 'Ingredientes' },
                { key: 'PRODUCT', label: 'Productos Únicos' },
                { key: 'PACKAGING', label: 'Suministros' }
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setResourceFilter(tab.key as any);
                    setSelectedItemId('');
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                    resourceFilter === tab.key
                      ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                      : 'bg-inset text-content-secondary hover:text-content border border-line'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                Seleccionar Elemento de Inventario
              </label>
              <CustomSelect
                value={selectedItemId}
                onChange={(val) => {
                  setSelectedItemId(val);
                  const found = inventoryItems.find(it => it.id === val);
                  if (found) {
                    setReceiptCost(found.purchaseCost || found.averagePrice || 0);
                    setEntryMode('COUNT_UNIT');
                  }
                }}
                options={filteredInventoryItems.map(item => {
                  const rType = getItemResourceType(item);
                  const rLabel = rType === 'PRODUCT' ? 'Prod. Único' : rType === 'PACKAGING' ? 'Suministro' : 'Ingrediente';
                  return {
                    value: item.id,
                    label: `${item.name} (${item.countUnit}) · [${rLabel}]`
                  };
                })}
                placeholder="-- Seleccione un elemento --"
                className="w-full bg-surface border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-content"
              />
            </div>

            {selectedItem && (
              <div className="p-3 rounded-2xl bg-inset border border-line space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-content-secondary">Stock Actual en Sede:</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                    {formatQuantityDecimals(getPhysicalStockInBranch(selectedItem, targetBranchId))} {selectedItem.countUnit}
                  </span>
                </div>
                {packFactor > 1 && (
                  <div className="pt-1.5 border-t border-line space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-content-secondary block">Modo de Ingreso de Cantidad:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEntryMode('COUNT_UNIT')}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          entryMode === 'COUNT_UNIT'
                            ? 'bg-[var(--accent-purple)]/15 border-[var(--accent-purple)] text-[var(--accent-purple)]'
                            : 'bg-surface border-line text-content-secondary'
                        }`}
                      >
                        Directo ({selectedItem.countUnit})
                      </button>
                      <button
                        type="button"
                        onClick={() => setEntryMode('PACK_UNIT')}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          entryMode === 'PACK_UNIT'
                            ? 'bg-[var(--accent-purple)]/15 border-[var(--accent-purple)] text-[var(--accent-purple)]'
                            : 'bg-surface border-line text-content-secondary'
                        }`}
                      >
                        Por Empaque (x{packFactor} {selectedItem.countUnit})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  {entryMode === 'PACK_UNIT' && packFactor > 1
                    ? `Cant. Empaques (=${formatQuantityDecimals(effectiveAddedStockQty)} ${selectedItem?.countUnit || ''})`
                    : `Cantidad (${selectedItem?.countUnit || 'Unidad'})`}
                </label>
                <Input
                  type="number"
                  value={receiptQuantity || ''}
                  onChange={(e) => setReceiptQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  {entryMode === 'PACK_UNIT' && packFactor > 1 ? 'Costo por Empaque ($)' : 'Costo Unitario ($)'}
                </label>
                <Input
                  type="number"
                  value={receiptCost || ''}
                  onChange={(e) => setReceiptCost(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="$0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Lote / Batch (Opcional)
                </label>
                <Input
                  type="text"
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="ej. LOT-2026-X"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  Fecha Vencimiento (Opcional)
                </label>
                <Input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
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
                options={qualityOptions}
                className="w-full bg-surface border border-slate-200 dark:border-slate-850 rounded-xl p-3 text-xs font-bold text-content"
              />
            </div>

            {/* Incident logs conditional block */}
            {quality === 'Defectuoso' && (
              <div className="space-y-3 p-4 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-2xl animate-fade-in">
                <div>
                  <label className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider block mb-1">
                    Comentario de Proveedor *
                  </label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border-slate-200 dark:border-slate-850 dark:bg-canvas dark:text-white p-3 text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
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
            className="w-full mt-4 py-3 bg-neutral-900 hover:bg-slate-850 dark:bg-[var(--card-color)] dark:hover:bg-slate-750 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            Añadir Insumo
          </button>
        </div>

        {/* Invoice Summary and Audit List */}
        <div className="lg:col-span-2 bg-surface p-6 rounded-3xl border border-line shadow-sm flex flex-col justify-between min-h-[480px]">
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
                  <tr className="bg-inset text-slate-400 text-[10px] font-extrabold uppercase tracking-wider border-b border-line">
                    <th className="py-3 px-4">Item</th>
                    <th className="py-3 px-4 text-center">Calidad</th>
                    <th className="py-3 px-4 text-right">Cant</th>
                    <th className="py-3 px-4 text-left">Lote / Vto</th>
                    <th className="py-3 px-4 text-right">Unitario</th>
                    <th className="py-3 px-4 text-right">Histórico</th>
                    <th className="py-3 px-4 text-center">Variación</th>
                    <th className="py-3 px-4 text-center">Receta</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs font-semibold">
                  {receiptItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 italic">
                        No hay insumos añadidos a esta factura de compra.
                      </td>
                    </tr>
                  ) : (
                    receiptItems.map((line, index) => {
                      const isHighVariance = Math.abs(line.variancePercentage) > 10;
                      return (
                        <tr key={index} className={isHighVariance ? 'bg-rose-500/5' : ''}>
                          <td className="py-4 px-4 font-bold text-content">
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
                          <td className="py-4 px-4 text-left">
                            {line.lote || line.fechaVencimiento ? (
                              <div className="flex flex-col text-[10px]">
                                {line.lote && <span className="font-mono text-content-secondary font-bold">L: {line.lote}</span>}
                                {line.fechaVencimiento && <span className="text-slate-400">V: {line.fechaVencimiento}</span>}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px] italic">Sin lote</span>
                            )}
                          </td>
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
                          <td className="py-4 px-4 text-right font-mono font-bold text-content">
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
            <div className="pt-6 border-t border-line flex justify-between items-center mt-6">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Factura</p>
                <h4 className="text-2xl font-manrope font-black text-content">
                  ${totalAmount.toLocaleString('es-CO')}
                </h4>
              </div>
              <button
                type="button"
                onClick={handleSubmitReceipt}
                disabled={!invoiceNumber.trim()}
                className="px-8 py-4 bg-canvas hover:bg-slate-850 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
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

      {/* Subrecipe Batch Production Modal */}
      {isProduceModalOpen && (
        <ProduceSubRecipeModal
          isOpen={isProduceModalOpen}
          onClose={() => setIsProduceModalOpen(false)}
        />
      )}
    </div>
  );
}
