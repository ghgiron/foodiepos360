// src/components/inventoryReceipts.tsx
import { useState, useMemo, useEffect } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import CustomSelect from './ui/CustomSelect';
import { useSuppliers } from '../hooks/useCatalogs';
import { getItemResourceType } from '../utils/dataHelper';
import { getPhysicalStockInBranch, type InventoryItem } from '../types';
import {
  getActiveBranchId,
  consolidateStockByBranch,
  consolidateSucursalStock,
  formatQuantityDecimals
} from '../utils/branchHelper';
import { syncRecordToFirestore } from '../services/syncService';
import { getItemUnitCost } from '../utils/costEngine';
import toast from 'react-hot-toast';

type ResourceFilter = 'ALL' | 'INGREDIENT' | 'PRODUCT' | 'PACKAGING';

interface ReceiptLineItem {
  itemId: string;
  name: string;
  resourceTypeLabel: string;
  countUnit: string;
  quantityAdded: number; // in countUnit
  unitCost: number; // total purchase cost per pack or per unit entered
  totalLineCost: number;
  historicalCost: number;
  variancePercentage: number;
}

export default function InventoryReceipts() {
  const suppliers = useSuppliers();
  const supplierOptions = useMemo(() => [
    { value: 'prov-general', label: 'Proveedor General / Compra Directa' },
    ...(suppliers || []).map(s => ({ value: s.id, label: s.name }))
  ], [suppliers]);

  const systemBranches = useLiveQuery(async () => {
    const setting = await db.systemSettings.get('system_branches');
    if (setting && Array.isArray(setting.value) && setting.value.length > 0) {
      return setting.value.filter((b: any) => b.isActive !== false);
    }
    const activeId = getActiveBranchId();
    return [{ id: activeId, name: activeId === 'SEDE-SAN-AGUST-N-2044' ? 'San Agustín' : 'Sede Principal', isMain: true, isActive: true }];
  }) || [];

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => getActiveBranchId());

  useEffect(() => {
    if (systemBranches.length > 0) {
      const exists = systemBranches.some((b: any) => b.id === selectedBranchId);
      if (!exists) {
        const activeId = getActiveBranchId();
        const matchActive = systemBranches.find((b: any) => b.id === activeId);
        setSelectedBranchId(matchActive ? matchActive.id : systemBranches[0].id);
      }
    }
  }, [systemBranches, selectedBranchId]);

  const branchOptions = useMemo(() =>
    systemBranches.map((b: any) => ({ value: b.id, label: `${b.name} (${b.id})` })),
    [systemBranches]
  );

  const selectedBranchObj = systemBranches.find((b: any) => b.id === selectedBranchId);
  const selectedBranchName = selectedBranchObj?.name || selectedBranchId;

  const [provider, setProvider] = useState('prov-general');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('ALL');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [entryMode, setEntryMode] = useState<'COUNT_UNIT' | 'PURCHASE_PACK'>('COUNT_UNIT');
  const [receiptQuantity, setReceiptQuantity] = useState<number>(0);
  const [receiptCost, setReceiptCost] = useState<number>(0);

  const [receiptItems, setReceiptItems] = useState<ReceiptLineItem[]>([]);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Fetch inventory items reactively from Dexie
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];

  const getTypeLabel = (item: InventoryItem) => {
    const t = getItemResourceType(item);
    if (t === 'PRODUCT') return 'Producto Único';
    if (t === 'PACKAGING') return 'Suministro';
    return 'Ingrediente';
  };

  // Filtered items by resource type (Ingredientes, Productos Únicos, Suministros)
  const filteredInventoryItems = useMemo(() => {
    return inventoryItems
      .filter(item => {
        const t = getItemResourceType(item);
        if (t === 'ASSET') return false;
        if (resourceFilter === 'ALL') return true;
        return t === resourceFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryItems, resourceFilter]);

  const itemOptions = useMemo(() => {
    return filteredInventoryItems.map(item => {
      const currentInBranch = getPhysicalStockInBranch(item, selectedBranchId);
      const unit = item.countUnit || item.purchaseUnit || 'und';
      return {
        value: item.id,
        label: `[${getTypeLabel(item)}] ${item.name} — Stock: ${formatQuantityDecimals(currentInBranch)} ${unit}`
      };
    });
  }, [filteredInventoryItems, selectedBranchId]);

  const selectedItem = inventoryItems.find(item => item.id === selectedItemId);

  // Auto-populate historical cost when selecting an item
  useEffect(() => {
    if (selectedItem) {
      const usableQty = Number(selectedItem.cantidadUtilizable || selectedItem.conversionMultiplier || 1) || 1;
      if (usableQty > 1) {
        setEntryMode('PURCHASE_PACK');
        setReceiptCost(Number(selectedItem.purchaseCost) || 0);
      } else {
        setEntryMode('COUNT_UNIT');
        setReceiptCost(Number(selectedItem.purchaseCost || getItemUnitCost(selectedItem)) || 0);
      }
    }
  }, [selectedItemId]);

  const packMultiplier = useMemo(() => {
    if (!selectedItem) return 1;
    if (entryMode === 'PURCHASE_PACK') {
      return Number(selectedItem.cantidadUtilizable || selectedItem.conversionMultiplier || 1) || 1;
    }
    return 1;
  }, [selectedItem, entryMode]);

  const effectiveUnitsToAdd = receiptQuantity * packMultiplier;

  const liveHistoricalCost = useMemo(() => {
    if (!selectedItem) return 0;
    if (entryMode === 'PURCHASE_PACK') {
      return Number(selectedItem.purchaseCost) || 0;
    }
    return getItemUnitCost(selectedItem) || Number(selectedItem.purchaseCost) || 0;
  }, [selectedItem, entryMode]);

  const liveVariance = liveHistoricalCost > 0 && receiptCost > 0
    ? ((receiptCost - liveHistoricalCost) / liveHistoricalCost) * 100
    : 0;

  // Add line item to pending receipt list
  const handleAddLineItem = () => {
    if (!selectedItemId || receiptQuantity <= 0 || receiptCost < 0) return;
    const item = inventoryItems.find(i => i.id === selectedItemId);
    if (!item) return;

    const unitsAdded = receiptQuantity * packMultiplier;
    const totalLineCost = receiptQuantity * receiptCost;

    const line: ReceiptLineItem = {
      itemId: item.id,
      name: item.name,
      resourceTypeLabel: getTypeLabel(item),
      countUnit: item.countUnit || item.purchaseUnit || 'Unidad',
      quantityAdded: unitsAdded,
      unitCost: receiptCost,
      totalLineCost,
      historicalCost: liveHistoricalCost,
      variancePercentage: liveVariance
    };

    setReceiptItems(prev => [...prev, line]);

    // Clear item inputs
    setSelectedItemId('');
    setReceiptQuantity(0);
    setReceiptCost(0);
  };

  const handleRemoveLineItem = (index: number) => {
    setReceiptItems(prev => prev.filter((_, i) => i !== index));
  };

  // Submit complete invoice receipt and update IndexedDB stocks + Firestore sync
  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (receiptItems.length === 0) {
      toast.error('Agrega al menos un elemento a la entrada de inventario.');
      return;
    }

    const effectiveInvoice = invoiceNumber.trim() || `ING-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();
    const updatedRecordsForSync: InventoryItem[] = [];

    try {
      await db.transaction('rw', [db.inventoryItems, db.inventoryLogs, db.domainOutbox], async () => {
        const extractedItemsPayload = [];

        for (const line of receiptItems) {
          const item = await db.inventoryItems.get(line.itemId);
          if (item) {
            const prevBranchPhysical = getPhysicalStockInBranch(item, selectedBranchId);
            const newBranchPhysical = Number((prevBranchPhysical + line.quantityAdded).toFixed(4));

            const updatedStockByBranch = consolidateStockByBranch({
              ...(item.stockByBranch || {}),
              [selectedBranchId]: newBranchPhysical
            });
            const updatedSucursalStock = consolidateSucursalStock([
              ...(item.sucursalStock || []).filter(s => s.sucursalId !== selectedBranchId),
              {
                sucursalId: selectedBranchId,
                stockActual: newBranchPhysical
              }
            ]);

            const totalGlobalStock = Number(
              Object.values(updatedStockByBranch).reduce((sum, val) => sum + (Number(val) || 0), 0).toFixed(4)
            );
            const totalGlobalReserved = Number(item.reservedStock) || 0;

            // Calculate updated purchaseCost if needed
            const usableQty = Number(item.cantidadUtilizable || item.conversionMultiplier || 1) || 1;
            const newPurchaseCost = line.unitCost > 0
              ? (usableQty > 1 && line.quantityAdded >= usableQty
                  ? Number(((line.totalLineCost / line.quantityAdded) * usableQty).toFixed(2))
                  : line.unitCost)
              : item.purchaseCost;

            const updatedItem: InventoryItem = {
              ...item,
              currentStock: totalGlobalStock,
              realPhysicalStock: totalGlobalStock,
              theoreticalStock: totalGlobalStock,
              availableStock: Math.max(0, totalGlobalStock - totalGlobalReserved),
              stockByBranch: updatedStockByBranch,
              sucursalStock: updatedSucursalStock,
              purchaseCost: newPurchaseCost,
              updatedAt: nowIso
            };

            await db.inventoryItems.put(updatedItem);
            updatedRecordsForSync.push(updatedItem);

            await db.inventoryLogs.add({
              id: `log-receipt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              itemId: item.id,
              itemName: item.name,
              quantity: line.quantityAdded,
              type: 'Compra',
              reason: `Ingreso de mercancía (${effectiveInvoice}) en ${selectedBranchName}`,
              user: 'Admin POS',
              timestamp: nowIso,
              unitPrice: line.unitCost,
              total: line.totalLineCost,
              previousCost: item.purchaseCost,
              newCost: newPurchaseCost,
              branchId: selectedBranchId
            });

            extractedItemsPayload.push({
              name: line.name,
              quantity: line.quantityAdded,
              unitPrice: line.unitCost,
              totalCost: line.totalLineCost,
              matchedInventoryItemId: line.itemId,
              branchId: selectedBranchId
            });
          }
        }

        const totalAmount = receiptItems.reduce((sum, item) => sum + item.totalLineCost, 0);
        const selectedSupplierObj = (suppliers || []).find(s => s.id === provider);

        await db.domainOutbox.put({
          eventId: `evt-purchaseocr-${Date.now()}`,
          eventType: 'PurchaseOcrScanned',
          payload: {
            invoiceId: effectiveInvoice,
            supplierName: selectedSupplierObj?.name || 'Proveedor General',
            branchId: selectedBranchId,
            invoiceDate: nowIso.split('T')[0],
            totalAmount,
            taxAmount: totalAmount * 0.08,
            extractedItems: extractedItemsPayload
          },
          status: 'PENDING',
          createdAt: nowIso,
          syncedAt: null
        });
      });

      for (const updatedItem of updatedRecordsForSync) {
        await syncRecordToFirestore('inventoryItems', updatedItem.id, updatedItem);
      }

      toast.success(`Entrada registrada (${updatedRecordsForSync.length} elementos) en ${selectedBranchName}.`);
      setReceiptItems([]);
      setInvoiceNumber('');
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3500);
    } catch (err) {
      console.error('[InventoryReceipts] Error saving receipt:', err);
      toast.error('Error al registrar el ingreso de inventario.');
    }
  };

  return (
    <div className="p-8 space-y-6 transition-receitly overflow-y-auto flex-1 font-body">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-headline font-black text-content">Ingreso de Mercancía a Inventario</h2>
          <p className="text-content-secondary font-semibold text-sm">
            Registra ingresos de Productos Únicos, Ingredientes y Suministros asignados por sucursal.
          </p>
        </div>
        {showSuccessToast && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Ingreso guardado y stock sincronizado en {selectedBranchName}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Receipt Form Column */}
        <div className="lg:col-span-1 bg-surface p-6 rounded-3xl border border-line shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-base font-bold text-content">Datos del Ingreso</h3>
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
              Sede: {selectedBranchName}
            </span>
          </div>

          <div className="space-y-4">
            {/* Selector de Sede / Sucursal */}
            <div>
              <label className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-1">
                Sede / Sucursal de Destino *
              </label>
              <CustomSelect
                value={selectedBranchId}
                onChange={setSelectedBranchId}
                options={branchOptions}
                className="w-full bg-inset border border-line rounded-xl p-3 text-sm text-content font-bold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-1">Proveedor</label>
                <CustomSelect
                  value={provider}
                  onChange={setProvider}
                  options={supplierOptions}
                  className="w-full bg-inset border border-line rounded-xl p-2.5 text-xs text-content font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider block mb-1">N° Factura / Ref.</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full rounded-xl border border-line bg-inset text-content p-2.5 text-xs font-semibold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  placeholder="ej. FAC-80921 (Opcional)"
                />
              </div>
            </div>

            <div className="border-t border-line pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Seleccionar Elemento de Inventario
                </h4>
              </div>

              {/* Filtro por Tipo de Recurso: Todos, Ingredientes, Productos Únicos, Suministros */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-inset p-1 rounded-xl border border-line">
                {([
                  { id: 'ALL', label: 'Todos' },
                  { id: 'INGREDIENT', label: 'Ingredientes' },
                  { id: 'PRODUCT', label: 'Prod. Únicos' },
                  { id: 'PACKAGING', label: 'Suministros' }
                ] as { id: ResourceFilter; label: string }[]).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setResourceFilter(tab.id);
                      setSelectedItemId('');
                    }}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      resourceFilter === tab.id
                        ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                        : 'text-content-secondary hover:text-content'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[10px] font-bold text-content-secondary uppercase block mb-1">
                  Elemento ({filteredInventoryItems.length} disponibles)
                </label>
                <CustomSelect
                  value={selectedItemId}
                  onChange={setSelectedItemId}
                  options={itemOptions}
                  placeholder="Seleccionar producto único, ingrediente o suministro..."
                  className="w-full bg-inset border border-line rounded-xl p-3 text-xs text-content font-semibold"
                />
              </div>

              {selectedItem && (
                <div className="p-3 rounded-xl bg-inset border border-line space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-content-secondary">Tipo:</span>
                    <span className="font-black text-[var(--accent-purple)] uppercase text-[10px]">
                      {getTypeLabel(selectedItem)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-content-secondary">Stock Actual ({selectedBranchName}):</span>
                    <span className="font-mono font-black text-content">
                      {formatQuantityDecimals(getPhysicalStockInBranch(selectedItem, selectedBranchId))} {selectedItem.countUnit || 'Unidad'}
                    </span>
                  </div>
                  {(Number(selectedItem.cantidadUtilizable || selectedItem.conversionMultiplier || 1) > 1) && (
                    <div className="pt-1 border-t border-line flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-content-secondary uppercase">Modo de Ingreso:</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEntryMode('PURCHASE_PACK')}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                            entryMode === 'PURCHASE_PACK'
                              ? 'bg-[var(--accent-purple)] text-white'
                              : 'bg-surface text-content-secondary border border-line'
                          }`}
                        >
                          Presentación ({selectedItem.cantidadUtilizable} {selectedItem.countUnit})
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryMode('COUNT_UNIT')}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                            entryMode === 'COUNT_UNIT'
                              ? 'bg-[var(--accent-purple)] text-white'
                              : 'bg-surface text-content-secondary border border-line'
                          }`}
                        >
                          Directo en {selectedItem.countUnit}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-content-secondary uppercase block mb-1">
                    Cantidad ({entryMode === 'PURCHASE_PACK' && packMultiplier > 1 ? 'Presentaciones' : (selectedItem?.countUnit || 'Unidades')})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={receiptQuantity || ''}
                    onChange={(e) => setReceiptQuantity(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-xl border border-line bg-inset text-content p-3 text-sm font-mono font-bold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-content-secondary uppercase block mb-1">
                    Costo Unitario ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={receiptCost || ''}
                    onChange={(e) => setReceiptCost(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-xl border border-line bg-inset text-content p-3 text-sm font-mono font-bold focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                  />
                </div>
              </div>

              {selectedItem && receiptQuantity > 0 && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between">
                  <span className="font-bold">Total a sumar en {selectedBranchName}:</span>
                  <span className="font-mono font-black">
                    +{formatQuantityDecimals(effectiveUnitsToAdd)} {selectedItem.countUnit || 'Unidad'}
                  </span>
                </div>
              )}

              {/* Live Cost Variance Indicator */}
              {selectedItemId && receiptCost > 0 && (
                <div className={`p-3 rounded-xl border ${
                  liveVariance > 5 
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                }`}>
                  <p className="text-xs font-bold flex justify-between">
                    <span>Costo Histórico Referencia:</span>
                    <span>${liveHistoricalCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
                  </p>
                  <p className="text-xs font-bold flex justify-between mt-1">
                    <span>Variación de Costo:</span>
                    <span className="font-black">
                      {liveVariance > 0 ? '+' : ''}{liveVariance.toFixed(1)}%
                    </span>
                  </p>
                  {liveVariance > 5 && (
                    <p className="text-[10px] font-medium mt-1 leading-normal">
                      ⚠️ ¡Alerta! El incremento supera el 5% corporativo. Afectará el costo real.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddLineItem}
                disabled={!selectedItemId || receiptQuantity <= 0}
                className="w-full py-3 bg-neutral-900 dark:bg-[var(--accent-purple)] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                + Añadir a la Lista de Entrada
              </button>
            </div>
          </div>
        </div>

        {/* Invoice Summary and Cost Variance Auditor Column (2/3 width) */}
        <div className="lg:col-span-2 bg-surface p-6 rounded-3xl border border-line shadow-sm flex flex-col justify-between min-h-[520px]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-base font-bold text-content">Elementos a Ingresar en Inventario</h3>
                <p className="text-xs text-content-secondary">
                  Sucursal destino: <strong className="text-content">{selectedBranchName}</strong>
                </p>
              </div>
              <span className="text-xs font-bold text-content-secondary uppercase tracking-widest bg-inset px-3 py-1.5 rounded-xl border border-line">
                {receiptItems.length} {receiptItems.length === 1 ? 'ítem listo' : 'ítems listos'}
              </span>
            </div>

            {/* Receipt line items preview table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-inset text-content-secondary text-[10px] font-bold uppercase tracking-wider border-b border-line">
                    <th className="py-3 px-4">Elemento</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-4 text-right">Ingreso (Stock)</th>
                    <th className="py-3 px-4 text-right">Costo</th>
                    <th className="py-3 px-4 text-center">Variación</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {receiptItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-content-secondary italic">
                        Selecciona Productos Únicos, Ingredientes o Suministros en el panel izquierdo para añadirlos al ingreso.
                      </td>
                    </tr>
                  ) : (
                    receiptItems.map((line, index) => {
                      const isHighVariance = line.variancePercentage > 5;
                      return (
                        <tr key={index} className={isHighVariance ? 'bg-rose-500/5' : ''}>
                          <td className="py-3.5 px-4 font-bold text-content">{line.name}</td>
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-raised border border-line text-[10px] font-bold text-content-secondary">
                              {line.resourceTypeLabel}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatQuantityDecimals(line.quantityAdded)} {line.countUnit}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono">
                            ${line.unitCost.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${
                              isHighVariance 
                                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                                : 'bg-emerald-500/10 text-emerald-600'
                            }`}>
                              {line.variancePercentage > 0 ? '+' : ''}{line.variancePercentage.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-content">
                            ${line.totalLineCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(index)}
                              className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                              title="Quitar de la lista"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
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

          {/* Form Actions Footer */}
          {receiptItems.length > 0 && (
            <div className="pt-6 border-t border-line flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-6">
              <div>
                <p className="text-[10px] text-content-secondary font-bold uppercase tracking-wider">Valor Total del Ingreso</p>
                <h4 className="text-2xl font-manrope font-black text-content tabular-nums">
                  ${receiptItems.reduce((sum, item) => sum + item.totalLineCost, 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                </h4>
              </div>
              <button
                onClick={handleSubmitReceipt}
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">inventory</span>
                Confirmar Ingreso en {selectedBranchName}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
