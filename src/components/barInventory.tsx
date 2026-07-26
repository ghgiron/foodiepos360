import { useState } from 'react';
import { db } from '../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import CustomSelect from './ui/CustomSelect';
import { enqueueOfflineEvent } from '../db/localDb';

export default function BarInventory() {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [scaleWeight, setScaleWeight] = useState<number>(0);
  const [serialStatus, setSerialStatus] = useState<'DISCONNECTED' | 'CONNECTED' | 'READING' | 'ERROR'>('DISCONNECTED');
  const [errorMessage, setErrorMessage] = useState('');
  const [isManualFallback, setIsManualFallback] = useState<boolean>(true);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch liquors reactively from Dexie
  const liquors = useLiveQuery(() => 
    db.inventoryItems.filter(item => item.category === 'Licores').toArray()
  ) || [];

  const selectedItem = liquors.find(item => item.id === selectedItemId);

  // Web Serial API Connection logic
  const handleConnectScale = async () => {
    setIsManualFallback(false);
    if (!('serial' in navigator)) {
      console.warn('Web Serial API is not supported in this browser. Falling back to manual input.');
      setSerialStatus('DISCONNECTED');
      setIsManualFallback(true);
      setErrorMessage('Web Serial API no es soportada. Entrada manual activa.');
      return;
    }

    try {
      setSerialStatus('CONNECTED');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      setSerialStatus('READING');
      setIsManualFallback(false);

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      // Read loop
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }
        if (value) {
          // Parse numerical weight from scale output stream (e.g. "ST,GS,+01250.0 g")
          const cleanWeight = parseFloat(value.replace(/[^0-9.]/g, ''));
          if (!isNaN(cleanWeight)) {
            setScaleWeight(cleanWeight);
          }
        }
      }
    } catch (err: any) {
      console.warn('Silent Web Serial API fallback triggered:', err);
      // Capture error silently
      setSerialStatus('DISCONNECTED');
      setIsManualFallback(true);
      setErrorMessage('Balanza desconectada o permiso denegado. Entrada manual activa.');
    }
  };

  // Calculations
  const tareWeight = selectedItem ? selectedItem.bottleTareWeightGrams : 0;
  const density = selectedItem ? selectedItem.density : 1.0;
  const netWeight = Math.max(0, scaleWeight - tareWeight);
  const netMilliliters = Math.round((netWeight / density) * 10) / 10; // ml netos

  const theoreticalStock = selectedItem ? selectedItem.theoreticalStock : 0;
  const varianceMl = selectedItem ? netMilliliters - theoreticalStock : 0;
  const variancePercentage = theoreticalStock > 0 ? (varianceMl / theoreticalStock) * 100 : 0;

  // Submit physical count update to IndexedDB
  const handleSavePhysicalWeight = async () => {
    if (!selectedItem) return;

    await db.transaction('rw', [db.inventoryItems, db.domainOutbox], async () => {
      await db.inventoryItems.update(selectedItem.id, {
        realPhysicalStock: netMilliliters,
        updatedAt: new Date().toISOString()
      });

      // Enqueue inventory adjustment Domain Event
      await enqueueOfflineEvent('InventoryItemUpdated', {
        itemId: selectedItem.id,
        action: 'ADJUSTMENT',
        quantityChanged: varianceMl,
        newTheoreticalStock: theoreticalStock,
        newRealPhysicalStock: netMilliliters,
        updatedAt: new Date().toISOString()
      });
    });

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto flex-1 transition-receitly">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-headline font-black text-slate-900 dark:text-white">Control de Licores por Peso</h2>
          <p className="text-slate-500 font-semibold text-sm">Pesaje y auditoría de botellas abiertas en tiempo real mediante balanza USB.</p>
        </div>
        {showSuccess && (
          <div className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold animate-pulse shadow-md">
            Medición guardada y variación de merma registrada
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Scale Connection and Selection Panel */}
        <div className="panel-card space-y-6">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Pesaje de Botella</h3>

          {/* Web Serial API scale trigger */}
          <div className="p-4 bg-slate-50 dark:bg-[var(--card-color)]/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Balanza USB (Web Serial)</span>
            
            {serialStatus === 'DISCONNECTED' && (
              <button
                onClick={handleConnectScale}
                className="btn-receitly !bg-emerald-600 !hover:bg-emerald-700 !shadow-emerald-500/20 w-full py-3 text-xs justify-center gap-2 uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-lg">scale</span>
                Conectar Balanza
              </button>
            )}
            
            {serialStatus === 'CONNECTED' && (
              <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Puerto Serial Conectado
              </p>
            )}

            {serialStatus === 'READING' && (
              <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                Transmitiendo Peso...
              </p>
            )}

            {isManualFallback && errorMessage && (
              <div className="space-y-1">
                <p className="text-xs text-rose-500 font-semibold">{errorMessage}</p>
                <button
                  onClick={handleConnectScale}
                  className="text-[10px] text-emerald-600 font-bold underline"
                >
                  Intentar reconectar balanza
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Botella / Licor</label>
              <CustomSelect
                value={selectedItemId}
                onChange={setSelectedItemId}
                options={liquors.map(liq => ({ value: liq.id, label: `${liq.name} (Min: ${liq.stockMinLimit}ml)` }))}
                placeholder="Seleccionar botella..."
                className="w-full bg-white dark:bg-[var(--card-color)] border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-white"
              />
            </div>

            {/* Scale weight override (Manual Input Fallback) */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Peso Total Leído (Gramos)
              </label>
              <input
                type="number"
                value={scaleWeight}
                onChange={(e) => setScaleWeight(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border-slate-200 dark:border-slate-800 dark:bg-[var(--card-color)] dark:text-white p-3 text-sm focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
                placeholder="ej. 1250"
              />
            </div>
          </div>
        </div>

        {/* Calculations / Auditor variance Column (2/3 width) */}
        <div className="panel-card lg:col-span-2 flex flex-col justify-between min-h-[420px]">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Resultados del Pesaje</h3>
              {selectedItem && (
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  SKU: {selectedItem.id}
                </span>
              )}
            </div>

            {selectedItem ? (
              <div className="space-y-6">
                {/* Weight stats Bento row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-50 dark:bg-[var(--card-color)]/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Peso de Botella (Tara)</span>
                    <p className="text-xl font-headline font-black mt-1 text-slate-800 dark:text-slate-200">
                      {tareWeight} g
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-[var(--card-color)]/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Densidad del Líquido</span>
                    <p className="text-xl font-headline font-black mt-1 text-slate-800 dark:text-slate-200">
                      {density} g/ml
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-[var(--card-color)]/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Millilitros Netos Reales</span>
                    <p className="text-xl font-headline font-black mt-1 text-emerald-600 dark:text-emerald-400">
                      {netMilliliters} ml
                    </p>
                  </div>
                </div>

                {/* Stock Variance Calculator Card */}
                <div className="p-6 bg-slate-50 dark:bg-[var(--card-color)]/30 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cálculo de Variación Teórica vs Real</h4>
                  
                  <div className="grid grid-cols-2 gap-6 pt-2">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Inventario Teórico:</p>
                      <p className="text-lg font-bold text-slate-700 dark:text-slate-350">{theoreticalStock} ml</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Inventario Físico Real:</p>
                      <p className="text-lg font-bold text-slate-700 dark:text-slate-350">{netMilliliters} ml</p>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-4 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Diferencia de Merma:</p>
                      <p className={`text-xl font-black ${varianceMl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {varianceMl > 0 ? '+' : ''}{varianceMl.toFixed(1)} ml ({variancePercentage.toFixed(1)}%)
                      </p>
                    </div>
                    {varianceMl < -100 && (
                      <span className="bg-rose-500/15 text-rose-500 text-[10px] font-bold px-2 py-1 rounded">
                        ⚠️ ALTA MERMA
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 gap-3">
                <span className="material-symbols-outlined text-6xl">liquor</span>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Seleccionar botella para ver variaciones</p>
              </div>
            )}
          </div>

          {selectedItem && (
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end mt-6">
              <button
                onClick={handleSavePhysicalWeight}
                className="btn-receitly px-8 py-4 text-xs uppercase tracking-wider"
              >
                Guardar Ajuste Físico
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
