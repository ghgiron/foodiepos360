// src/components/purchaseOrderForm.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import ConfirmDialog from './ui/ConfirmDialog';
import ImageUploader from './ImageUploader';
import CustomSelect from './ui/CustomSelect';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import CustomDatePicker from './ui/CustomDatePicker';
import CompleteNewItemModal from './inventory/CompleteNewItemModal';
import {
  getActiveBranchId,
  normalizeBranchId,
  setBranchStockValue,
  setSucursalStockValue,
  areBranchIdsEqual,
  formatQuantityDecimals
} from '../utils/branchHelper';
import { getPhysicalStockInBranch, getReservedStockInBranch } from '../types';
import type { InventoryItem } from '../types';
import { getItemResourceType } from '../utils/dataHelper';
import { syncRecordToFirestore } from '../services/syncService';
import { useQualityRatings } from '../hooks/useCatalogs';
import {
  formatPurchaseOrderLabel
} from '../utils/purchaseOrderUtils';
import PurchaseNavHeader from './inventory/PurchaseNavHeader';

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
  unit?: string;
  isNew?: boolean;
}

interface PurchaseOrderFormProps {
  initialSupplierId?: string;
  initialItems?: any[];
  initialPurchaseOrderId?: string;
  onComplete?: () => void;
  onNavigateSection?: (section: 'INVENTORY_RECEIPTS' | 'INVENTORY_ALERTS' | 'PURCHASE_ORDERS_HISTORY') => void;
}

export default function PurchaseOrderForm({
  initialSupplierId,
  initialItems,
  initialPurchaseOrderId,
  onComplete,
  onNavigateSection
}: PurchaseOrderFormProps = {}) {
  const qualityRatingsList = useQualityRatings();
  const qualityOptions = useMemo(() => {
    return qualityRatingsList.map(q => ({ value: q, label: q }));
  }, [qualityRatingsList]);

  const activeBranch = getActiveBranchId();
  const [targetBranchId, setTargetBranchId] = useState(activeBranch);
  const [provider, setProvider] = useState(initialSupplierId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<string>(initialPurchaseOrderId || '');
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

  // Complete New Item Modal State [US-10A]
  const [newItemModalConfig, setNewItemModalConfig] = useState<{
    isOpen: boolean;
    lineIndex: number;
    initialName: string;
    initialCost: number;
  } | null>(null);

  // Live queries from Dexie
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const branchSettings = useLiveQuery(() => db.systemSettings.get('system_branches'));

  // Pending purchase orders for reactive preloading [US-10A / US-09C]
  // Strict filter: exclusion of RECEIVED and CANCELLED orders
  const pendingPurchaseOrders = useLiveQuery(
    () => db.purchaseOrders
      .where('status')
      .anyOf('DRAFT', 'ORDERED', 'PENDING')
      .filter(order => order.status !== 'RECEIVED' && order.status !== 'CANCELLED')
      .reverse()
      .sortBy('createdAt')
  ) || [];

  const availableBranches = useMemo(() => {
    if (Array.isArray(branchSettings?.value) && branchSettings.value.length > 0) {
      return branchSettings.value.filter((b: any) => b.active !== false);
    }
    return [{ id: targetBranchId, name: 'Sede Principal' }];
  }, [branchSettings, targetBranchId]);

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
      fechaVencimiento: item.fechaVencimiento || '',
      unit: item.unit || 'und',
      isNew: false
    }));
  });

  // Sync when initialSupplierId, initialItems or initialPurchaseOrderId change
  useEffect(() => {
    if (initialSupplierId) setProvider(initialSupplierId);
    if (initialPurchaseOrderId) setSelectedPurchaseOrderId(initialPurchaseOrderId);
    if (initialItems && initialItems.length > 0) {
      setReceiptItems(initialItems.map(item => {
        const found = inventoryItems.find(
          it => it.id === (item.itemId || item.id) || it.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        );
        const refCost = found ? (found.averagePrice || found.purchaseCost || 0) : (item.unitCost || item.cost || 0);
        return {
          itemId: found ? found.id : (item.itemId || item.id || ''),
          name: item.name,
          quantity: item.quantity || item.qtyNeeded || 1,
          unitCost: item.unitCost || item.cost || item.purchaseCost || 0,
          historicalCost: refCost,
          variancePercentage: 0,
          updateCost: true,
          quality: 'Excelente',
          lote: item.lote || '',
          fechaVencimiento: item.fechaVencimiento || '',
          unit: found ? found.countUnit : (item.unit || 'und'),
          isNew: !found
        };
      }));
    }
  }, [initialSupplierId, initialItems, initialPurchaseOrderId, inventoryItems]);

  // Automatically set default provider when loaded if empty
  useEffect(() => {
    if (suppliers.length > 0 && !provider) {
      setProvider(suppliers[0].id);
    }
  }, [suppliers, provider]);

  // [US-09B] Detección reactiva de ?orderId=... o location.state.orderId para precarga automática inmediata
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const orderIdFromUrl = urlParams.get('orderId');
    const orderIdFromState = (window.history.state as any)?.orderId;
    const targetOrderId = orderIdFromUrl || orderIdFromState || initialPurchaseOrderId;

    if (targetOrderId && pendingPurchaseOrders.length > 0) {
      if (selectedPurchaseOrderId !== targetOrderId) {
        handleSelectPurchaseOrder(targetOrderId);
      }
    }
  }, [pendingPurchaseOrders, initialPurchaseOrderId]);

  // Confirmation Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Selected item details for live variance feedback
  const filteredInventoryItems = useMemo(() => {
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

  /**
   * CRITERIO 1: Precarga desde Orden de Compra (O.C.)
   * Al seleccionar una O.C. existente:
   * - Carga automáticamente el proveedor
   * - Puebla 'Auditoría de Insumos Facturados' con los ítems, cantidades y costos
   */
  const handleSelectPurchaseOrder = (orderId: string) => {
    setSelectedPurchaseOrderId(orderId);
    if (!orderId) return;

    const order = pendingPurchaseOrders.find(o => o.id === orderId);
    if (!order) return;

    // Cargar proveedor automáticamente si está definido
    if (order.supplierId && order.supplierId !== 'POR DEFINIR') {
      setProvider(order.supplierId);
    }
    if (order.branchId) {
      setTargetBranchId(order.branchId);
    }

    // Mapear insumos y resolver automáticamente si existen en catálogo o son nuevos
    const mappedItems: ReceiptLineItem[] = order.items.map(item => {
      const found = inventoryItems.find(
        it => it.id === item.itemId || it.name.trim().toLowerCase() === item.name.trim().toLowerCase()
      );
      const refCost = found ? (found.averagePrice || found.purchaseCost || 0) : item.unitCost;
      const variance = refCost > 0 ? ((item.unitCost - refCost) / refCost) * 100 : 0;

      return {
        itemId: found ? found.id : (item.itemId || ''),
        name: item.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        historicalCost: refCost,
        variancePercentage: variance,
        updateCost: true,
        quality: 'Excelente',
        unit: found ? found.countUnit : (item.unit || 'und'),
        isNew: !found
      };
    });

    setReceiptItems(mappedItems);
  };

  // Add individual manual item
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
        photoUrl: quality === 'Defectuoso' ? photoUrl : undefined,
        unit: item.countUnit,
        isNew: false
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
      commitLine(true);
    }
  };

  // Adjustments directly in the audit table rows
  const handleUpdateLineQuantity = (index: number, newQty: number) => {
    setReceiptItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(0, newQty) } : item));
  };

  const handleUpdateLineCost = (index: number, newCost: number) => {
    setReceiptItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const ref = item.historicalCost || 0;
      const variance = ref > 0 ? ((newCost - ref) / ref) * 100 : 0;
      return {
        ...item,
        unitCost: Math.max(0, newCost),
        variancePercentage: variance
      };
    }));
  };

  const handleRemoveLineItem = (index: number) => {
    setReceiptItems(prev => prev.filter((_, i) => i !== index));
    toast.success('Insumo removido de la fila.');
  };

  // Open modal to configure new item card [US-10A]
  const handleOpenCompleteNewItem = (lineIndex: number, line: ReceiptLineItem) => {
    setNewItemModalConfig({
      isOpen: true,
      lineIndex,
      initialName: line.name,
      initialCost: line.unitCost
    });
  };

  // On new item card completed and saved in catalog
  const handleNewItemSaved = (createdItem: InventoryItem) => {
    if (!newItemModalConfig) return;
    const idx = newItemModalConfig.lineIndex;
    setReceiptItems(prev => prev.map((line, i) => {
      if (i !== idx) return line;
      return {
        ...line,
        itemId: createdItem.id,
        name: createdItem.name,
        unit: createdItem.countUnit,
        historicalCost: createdItem.purchaseCost,
        isNew: false
      };
    }));
    setNewItemModalConfig(null);
  };

  const totalAmount = receiptItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  /**
   * CRITERIO 3: Asentamiento al Kardex
   * Al pulsar '[ Confirmar Entrada al Inventario ]':
   * - Valida que no queden insumos nuevos sin ficha configurada
   * - Incrementa 'physicalStock' en 'inventoryItems' y actualiza 'lastPurchasePrice'
   * - Registra en el Kardex ('inventoryMovements' / 'inventoryLogs') tipo 'ENTRADA_COMPRA'
   * - Si vino de una O.C., actualiza su estado a 'RECEIVED'
   * - Encola en 'sync_outbox'
   */
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

    // Validar que no queden insumos nuevos sin ficha configurada
    const unconfiguredLines = receiptItems.filter(
      line => !line.itemId || !inventoryItems.some(it => it.id === line.itemId)
    );
    if (unconfiguredLines.length > 0) {
      toast.error(
        `Hay ${unconfiguredLines.length} insumo(s) nuevo(s) sin ficha técnica configurada. Por favor pulsa "+ Completar Ficha" antes de autorizar el ingreso.`,
        { duration: 6000 }
      );
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'Confirmar Entrada al Inventario',
      message: `¿Está seguro de registrar este ingreso de mercancía por un total de $${totalAmount.toLocaleString('es-CO')}? Esto incrementará las existencias físicas en el Kardex y actualizará el último precio de compra.${selectedPurchaseOrderId ? ` La orden ${selectedPurchaseOrderId} pasará a estado RECIBIDA (RECEIVED).` : ''
        }`,
      confirmText: 'Confirmar Entrada al Inventario',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        try {
          const cleanBranchId = normalizeBranchId(targetBranchId || activeBranch);
          const validBranchIds = new Set<string>(
            availableBranches.map((b: any) => normalizeBranchId(String(b.id)).toLowerCase().trim())
          );
          validBranchIds.add(cleanBranchId.toLowerCase().trim());
          const updatedItemsForCloud: any[] = [];

          await db.transaction('rw', [db.inventoryItems, db.inventoryLogs, db.supplierIncidents, db.domainOutbox, db.purchaseOrders], async () => {
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

                // Calcular precio promedio ponderado
                const currentPhysical = item.currentStock ?? item.realPhysicalStock ?? 0;
                const currentAveragePrice = item.averagePrice || item.purchaseCost || 0;
                const newAveragePrice = (currentPhysical + line.quantity) > 0
                  ? ((currentAveragePrice * currentPhysical) + (line.unitCost * line.quantity)) / (currentPhysical + line.quantity)
                  : line.unitCost;

                const newPurchaseCost = line.updateCost ? line.unitCost : (item.purchaseCost || line.unitCost);

                // INVARIANTE DE KARDEX: Incrementa physicalStock y actualiza lastPurchasePrice
                const updatedItemRecord: InventoryItem = {
                  ...item,
                  theoreticalStock: newPhysical,
                  realPhysicalStock: newPhysical,
                  currentStock: newPhysical,
                  availableStock: newAvailable,
                  averagePrice: newAveragePrice,
                  purchaseCost: newPurchaseCost,
                  lastPurchasePrice: line.unitCost, // Actualiza último precio de compra
                  stockByBranch,
                  sucursalStock,
                  lote: line.lote || item.lote,
                  fechaVencimiento: line.fechaVencimiento || item.fechaVencimiento,
                  updatedAt: new Date().toISOString()
                };

                await db.inventoryItems.put(updatedItemRecord);
                updatedItemsForCloud.push(updatedItemRecord);

                // Registrar asiento formal en Kardex (inventoryLogs / inventoryMovements) tipo 'ENTRADA_COMPRA'
                await db.inventoryLogs.add({
                  id: `log-purchase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  itemId: line.itemId,
                  itemName: line.name,
                  type: 'ENTRADA_COMPRA',
                  quantity: line.quantity,
                  reason: `Entrada por Compra - Factura/Remisión ${invoiceNumber.trim() || 'S/N'}${selectedPurchaseOrderId ? ` · O.C. (${selectedPurchaseOrderId})` : ''
                    }`,
                  user: 'Admin',
                  timestamp: new Date().toISOString(),
                  branchId: cleanBranchId
                });

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

            // Si vino de una O.C., actualizar su estado a 'RECEIVED' [US-09C]
            if (selectedPurchaseOrderId) {
              await db.purchaseOrders.update(selectedPurchaseOrderId, {
                status: 'RECEIVED',
                receivedAt: new Date().toISOString(),
                invoiceNumber: invoiceNumber.trim(),
                updatedAt: new Date().toISOString()
              });
            }

            // Encolar en sync_outbox (domainOutbox)
            await db.domainOutbox.put({
              eventId: `evt-purchase-${Date.now()}`,
              eventType: 'PurchaseOrderReceived',
              payload: {
                invoiceId: invoiceNumber.trim(),
                purchaseOrderId: selectedPurchaseOrderId || null,
                supplierName: suppliers.find(s => s.id === provider)?.name || provider,
                invoiceDate: new Date().toISOString().split('T')[0],
                totalAmount,
                taxAmount: totalAmount * 0.08,
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
            ).catch(() => { });
          }

          toast.success(`Entrada confirmada al inventario en sede ${cleanBranchId}. Stocks asentados al Kardex.`);
          setReceiptItems([]);
          setInvoiceNumber('');
          setSelectedPurchaseOrderId('');
          setConfirmConfig(null);
          onComplete?.();
        } catch (error) {
          console.error('Error al asentar entrada al Kardex:', error);
          toast.error('Ocurrió un error al registrar la compra en la base de datos.');
        }
      }
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1 font-body text-content">

      {/* Subnavigation Bar entre Módulos de Compras [US-09C] */}
      <PurchaseNavHeader
        activeSection="INVENTORY_RECEIPTS"
        onNavigateSection={onNavigateSection}
        draftCount={pendingPurchaseOrders.length}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-line">
        <div>
          <h2 className="text-2xl md:text-3xl font-headline font-black text-content tracking-tight">
            Entradas (Compras)
          </h2>
          <p className="text-slate-500 font-semibold text-xs md:text-sm mt-1">
            Registro de compras y recepción de productos.
          </p>
        </div>
      </div>

      <div className="space-y-6">

        {/* Panel Superior: Datos de Facturación y Añadir Insumo (Completo Horizontal) */}
        <div className="w-full bg-surface p-5 md:p-6 rounded-lg border border-line shadow-sm space-y-6 relative z-20">

          {/* 1. Datos de Facturación */}
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
              <span className="material-symbols-outlined text-sm text-neutral-400">receipt_long</span>
              <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                Datos de Facturación
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                  <span>📦</span>
                  Seleccione la orden de compra o entrada manual
                </label>
                <CustomSelect
                  value={selectedPurchaseOrderId}
                  onChange={handleSelectPurchaseOrder}
                  options={[
                    { value: '', label: '-- Entrada manual --' },
                    ...pendingPurchaseOrders.map(po => ({
                      value: po.id,
                      label: formatPurchaseOrderLabel(po, suppliers)
                    }))
                  ]}
                  className="w-full h-10 text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                  Sede de Destino / Bodega
                </label>
                <CustomSelect
                  value={targetBranchId}
                  onChange={setTargetBranchId}
                  options={availableBranches.map(b => ({
                    value: b.id,
                    label: `${b.name || b.id} ${areBranchIdsEqual(b.id, activeBranch) ? '⭐ (Activa)' : ''}`
                  }))}
                  className="w-full h-10 text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                  Proveedor
                </label>
                <CustomSelect
                  value={provider}
                  onChange={setProvider}
                  options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                  placeholder={suppliers.length === 0 ? "Cargando proveedores..." : "Seleccionar Proveedor"}
                  className="w-full h-10 text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1">
                  Número de Factura (dato obligatorio))
                </label>
                <Input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full h-10 text-sm px-3 py-1.5"
                  placeholder="ej. FAC-2026-981"
                />
              </div>
            </div>
          </div>

          {/* 2. Añadir Insumo Manual (Sólo visible si NO hay una O.C. precargada activa) */}
          {!selectedPurchaseOrderId && (
            <div className="pt-4 border-t border-line space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-line">
                <span className="material-symbols-outlined text-sm text-neutral-400">add_circle</span>
                <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest whitespace-nowrap">
                  Añadir Insumo Manual
                </h3>
              </div>

              {/* Layout Horizontal en Grilla Estricta de 12 Columnas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                {/* lg:col-span-3: Catálogo / Insumo con filtros en cabecera de label */}
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    {/* <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block truncate" title="Seleccionar Elemento del Catálogo">
                      Catálogo / Insumo
                    </label> */}
                    {/* Píldoras de filtro en la cabecera del label */}
                    <div className="flex items-center gap-1">
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
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${resourceFilter === tab.key
                            ? 'bg-[var(--accent-purple)] text-white shadow-xs'
                            : 'bg-raised text-content-secondary hover:text-content border border-line'
                            }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
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
                    placeholder="-- Seleccione un insumo --"
                    className="w-full h-10 text-xs px-2.5"
                  />
                </div>

                {/* lg:col-span-1: Cantidad */}
                <div className="md:col-span-1 lg:col-span-1">
                  <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title={entryMode === 'PACK_UNIT' && packFactor > 1 ? `Cant. Empaque (=${formatQuantityDecimals(effectiveAddedStockQty)} ${selectedItem?.countUnit || ''})` : `Cantidad (${selectedItem?.countUnit || 'Unidad'})`}>
                    {entryMode === 'PACK_UNIT' && packFactor > 1
                      ? `Cant. Emp.`
                      : `Cant.`}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={receiptQuantity || ''}
                    onChange={(e) => setReceiptQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full h-10 py-1.5 px-2 text-center text-sm font-mono tabular-nums"
                    placeholder="0.00"
                  />
                </div>

                {/* lg:col-span-1: Costo Unitario */}
                <div className="md:col-span-1 lg:col-span-1">
                  <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title={entryMode === 'PACK_UNIT' && packFactor > 1 ? 'Costo Empaque ($)' : 'Costo Unitario ($)'}>
                    {entryMode === 'PACK_UNIT' && packFactor > 1 ? 'Costo Emp.' : 'Costo ($)'}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={receiptCost || ''}
                    onChange={(e) => setReceiptCost(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full h-10 py-1.5 px-2 text-right text-sm font-mono tabular-nums"
                    placeholder="$0.00"
                  />
                </div>

                {/* lg:col-span-2: Calidad de Recepción */}
                <div className="md:col-span-1 lg:col-span-2">
                  <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Calidad de Recepción">
                    Calidad
                  </label>
                  <CustomSelect
                    value={quality}
                    onChange={(val) => setQuality(val as any)}
                    options={qualityOptions}
                    className="w-full h-10 text-xs px-2"
                  />
                </div>

                {/* lg:col-span-1: Lote / Batch */}
                <div className="md:col-span-1 lg:col-span-1">
                  <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Lote / Batch">
                    Lote
                  </label>
                  <Input
                    type="text"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    className="w-full h-10 text-xs px-2 py-1.5"
                    placeholder="ej. L-2026"
                  />
                </div>

                {/* lg:col-span-3: Fecha Vencimiento */}
                <div className="md:col-span-1 lg:col-span-2">
                  <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider block mb-1 truncate" title="Fecha Vencimiento">
                    Vencimiento
                  </label>
                  <CustomDatePicker
                    value={fechaVencimiento}
                    onChange={setFechaVencimiento}
                    placeholder="dd/mm/aaaa"
                    className="h-10 text-xs px-2.5"
                  />
                </div>

                {/* lg:col-span-1: Botón de acción AGREGAR */}
                <div className="md:col-span-1 lg:col-span-2">
                  <label className="text-[11px] font-medium block mb-1 opacity-0 select-none hidden lg:block">
                    Acción
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="w-full h-10 bg-[#F5EFE6] text-neutral-900 hover:bg-white active:scale-95 transition-all font-bold rounded-full text-xs uppercase tracking-wider cursor-pointer shadow-md flex items-center justify-center px-1"
                    title="Agregar insumo a la factura"
                  >
                    AGREGAR
                  </button>
                </div>
              </div>

              {/* Auxiliary info: stock actual & modo de empaque */}
              {selectedItem && (
                <div className="p-3 rounded-lg bg-slate-50/50 dark:bg-raised/20 border border-line space-y-2 text-xs">
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
                          className={`py-1.5 px-2 rounded-sm text-[10px] font-bold border transition-all cursor-pointer ${entryMode === 'COUNT_UNIT'
                            ? 'bg-[var(--accent-purple)]/15 border-[var(--accent-purple)] text-[var(--accent-purple)]'
                            : 'bg-surface border-line text-content-secondary'
                            }`}
                        >
                          Directo ({selectedItem.countUnit})
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryMode('PACK_UNIT')}
                          className={`py-1.5 px-2 rounded-sm text-[10px] font-bold border transition-all cursor-pointer ${entryMode === 'PACK_UNIT'
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

              {/* Live Price Deviation Audit Alert Card */}
              {selectedItemId && receiptCost > 0 && (
                <div className={`p-3 rounded-sm border text-xs ${Math.abs(liveVariance) > 10
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  }`}>
                  <div className="flex justify-between items-center font-bold">
                    <span>Costo Histórico Ref:</span>
                    <span className="font-mono tabular-nums">${referencePrice.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold mt-1">
                    <span>Variación Costo:</span>
                    <span className="font-mono font-black tabular-nums">
                      {liveVariance > 0 ? '+' : ''}{liveVariance.toFixed(1)}%
                    </span>
                  </div>
                  {Math.abs(liveVariance) > 10 && (
                    <p className="text-[10px] font-medium mt-1 leading-normal">
                      ⚠️ ¡Alerta! La variación supera el 10%. Esto activará confirmación al añadirlo.
                    </p>
                  )}
                </div>
              )}

              {quality === 'Defectuoso' && (
                <div className="space-y-3 p-3 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-lg animate-fade-in">
                  <div>
                    <label className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider block mb-1">
                      Comentario de Proveedor *
                    </label>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      className="w-full rounded-sm border-line dark:bg-canvas dark:text-white p-2.5 text-xs font-semibold focus:ring-1 focus:ring-rose-500 outline-none"
                      placeholder="Escriba el motivo del descarte o desperfecto..."
                    />
                  </div>
                  <div>
                    <ImageUploader
                      value={photoUrl}
                      onChange={(base64) => setPhotoUrl(base64)}
                      label="Foto de Evidencia"
                      helperText="Evidencia fotográfica para reclamos al proveedor."
                      className="p-3"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel Inferior: Auditoría de Insumos Facturados (Completo Horizontal) */}
        <div className="w-full bg-surface p-5 md:p-6 rounded-lg border border-line shadow-sm flex flex-col justify-between min-h-[480px]">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
              <div>
                <h3 className="text-base font-extrabold text-content uppercase tracking-wider">
                  Detalle de Insumos recibidos
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Verifica cantidades, precios acordados y completa fichas de insumos nuevos.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
                {receiptItems.length} {receiptItems.length === 1 ? 'línea' : 'líneas'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-raised/30 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider border-b border-line">
                    <th className="py-3 px-3">Insumo</th>
                    <th className="py-3 px-3 text-center">Calidad</th>
                    <th className="py-3 px-3 text-right">Cant. Recibida</th>
                    <th className="py-3 px-3 text-left">Lote</th>
                    <th className="py-3 px-3 text-right">Unitario ($)</th>
                    <th className="py-3 px-3 text-right">Histórico</th>
                    <th className="py-3 px-3 text-center">Variación</th>
                    <th className="py-3 px-3 text-right">Subtotal</th>
                    <th className="py-3 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs font-semibold">
                  {receiptItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-slate-400 italic">
                        No hay insumos añadidos a esta factura de compra.
                        <br />
                        <span className="text-xs text-slate-500 not-italic mt-1 inline-block">
                          Puedes seleccionar una Orden de Compra arriba o añadir insumos manualmente.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    receiptItems.map((line, index) => {
                      const isHighVariance = Math.abs(line.variancePercentage) > 10;
                      const matchedItem = inventoryItems.find(
                        it => it.id === line.itemId || it.name.trim().toLowerCase() === line.name.trim().toLowerCase()
                      );
                      const isNewItem = !matchedItem || !line.itemId;

                      return (
                        <tr
                          key={index}
                          className={`hover:bg-slate-50/50 dark:hover:bg-raised/10 transition-colors ${isNewItem ? 'bg-amber-500/[0.04]' : isHighVariance ? 'bg-rose-500/[0.02]' : ''
                            }`}
                        >
                          {/* CRITERIO 2: Resolución de Unidades (Existente vs Nuevo) */}
                          <td className="py-3 px-3">
                            <div className="space-y-1">
                              <p className="font-bold text-content leading-tight">{line.name}</p>

                              {isNewItem ? (
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                                    ⚠️ Insumo Nuevo
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCompleteNewItem(index, line)}
                                    className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-0.5"
                                  >
                                    [ + Completar Ficha ]
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Catálogo</span>
                                  <span>·</span>
                                  <span>Uso: {matchedItem.countUnit}</span>
                                  {matchedItem.purchaseUnit && matchedItem.purchaseUnit !== matchedItem.countUnit && (
                                    <>
                                      <span>·</span>
                                      <span>Compra: {matchedItem.purchaseUnit}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Calidad Selector */}
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${line.quality === 'Excelente' ? 'bg-emerald-500/10 text-emerald-600' :
                              line.quality === 'Aceptable' ? 'bg-sky-500/10 text-sky-600' :
                                'bg-rose-500/10 text-rose-600'
                              }`}>
                              {line.quality}
                            </span>
                          </td>

                          {/* Cantidad Editable */}
                          <td className="py-3 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.quantity}
                              onChange={(e) => handleUpdateLineQuantity(index, parseFloat(e.target.value) || 0)}
                              className="w-20 text-right font-mono font-bold rounded-sm border border-line bg-transparent p-1 text-xs focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                            />
                            <span className="text-[10px] text-slate-400 ml-1 uppercase">{line.unit || 'und'}</span>
                          </td>

                          {/* Lote / Vto */}
                          <td className="py-3 px-3 text-left">
                            {line.lote || line.fechaVencimiento ? (
                              <div className="flex flex-col text-[10px]">
                                {line.lote && <span className="font-mono text-content-secondary font-bold">L: {line.lote}</span>}
                                {line.fechaVencimiento && <span className="text-slate-400">V: {line.fechaVencimiento}</span>}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px] italic">Sin lote</span>
                            )}
                          </td>

                          {/* Costo Unitario Editable */}
                          <td className="py-3 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={line.unitCost}
                              onChange={(e) => handleUpdateLineCost(index, parseFloat(e.target.value) || 0)}
                              className="w-24 text-right font-mono font-bold rounded-sm border border-line bg-transparent p-1 text-xs focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                            />
                          </td>

                          {/* Costo Histórico */}
                          <td className="py-3 px-3 text-right font-mono text-slate-400 tabular-nums">
                            ${line.historicalCost.toLocaleString('es-CO')}
                          </td>

                          {/* Variación Porcentual */}
                          <td className="py-3 px-3 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tabular-nums ${isHighVariance
                              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-600'
                              }`}>
                              {line.variancePercentage > 0 ? '+' : ''}{line.variancePercentage.toFixed(1)}%
                            </span>
                          </td>

                          {/* Subtotal */}
                          <td className="py-3 px-3 text-right font-mono font-black tabular-nums text-content">
                            ${(line.quantity * line.unitCost).toLocaleString('es-CO')}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(index)}
                              className="text-rose-500 hover:text-rose-400 cursor-pointer font-bold text-xs p-1"
                              title="Remover línea"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
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

          {/* CRITERIO 3: Asentamiento al Kardex & Botón '[ Confirmar Entrada al Inventario ]' */}
          {receiptItems.length > 0 && (
            <div className="pt-4 border-t border-line flex flex-col sm:flex-row justify-between items-center gap-4 mt-6">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Factura</p>
                <h4 className="text-2xl font-mono font-black text-content tabular-nums">
                  ${totalAmount.toLocaleString('es-CO')}
                </h4>
              </div>

              <button
                type="button"
                onClick={handleSubmitReceipt}
                disabled={!invoiceNumber.trim()}
                className="w-full sm:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-full text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-600/20 cursor-pointer active:scale-[0.97] flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">inventory</span>
                Confirmar Entrada al Inventario
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Complete New Item Modal [US-10A] */}
      {newItemModalConfig && (
        <CompleteNewItemModal
          isOpen={newItemModalConfig.isOpen}
          initialName={newItemModalConfig.initialName}
          initialUnitCost={newItemModalConfig.initialCost}
          initialSupplierId={provider}
          onClose={() => setNewItemModalConfig(null)}
          onSaveSuccess={handleNewItemSaved}
        />
      )}

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
