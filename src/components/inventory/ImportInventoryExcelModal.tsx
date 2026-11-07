// src/components/inventory/ImportInventoryExcelModal.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  X, 
  RefreshCw, 
  ChefHat, 
  Wine, 
  Blend, 
  PackageCheck, 
  Sparkles,
  BookOpen,
  Store
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/localDb';
import { getActiveBranchId } from '../../utils/branchHelper';
import { 
  parseInventoryExcel, 
  commitInventoryExcelImport, 
  type ExcelParsedInventoryData,
  type ExcelImportResult
} from '../../services/excelImportService';
import { formatCurrency } from '../../utils/formatters';
import { getOperationalZoneLabel } from '../../utils/operationalZones';
import toast from 'react-hot-toast';

interface ImportInventoryExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: ExcelImportResult) => void;
  onNavigateToRecipes?: () => void;
}

type ModalPhase = 'UPLOAD' | 'PARSING' | 'PREVIEW' | 'IMPORTING' | 'SUCCESS';

export default function ImportInventoryExcelModal({
  isOpen,
  onClose,
  onSuccess,
  onNavigateToRecipes
}: ImportInventoryExcelModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('UPLOAD');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ExcelParsedInventoryData | null>(null);
  const [importProgress, setImportProgress] = useState<{ percent: number; current: number; total: number }>({
    percent: 0,
    current: 0,
    total: 0
  });
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const selectedBranchObj = systemBranches.find((b: any) => b.id === selectedBranchId);
  const selectedBranchName = selectedBranchObj?.name || selectedBranchId;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setPhase('UPLOAD');
    setSelectedFile(null);
    setParsedData(null);
    setImportResult(null);
    setErrorMessage(null);
    setImportProgress({ percent: 0, current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const processFile = useCallback(async (file: File, targetBranch = selectedBranchId) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Por favor selecciona un archivo Excel (.xlsx o .xls)');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setPhase('PARSING');

    try {
      const data = await parseInventoryExcel(file, { branchId: targetBranch });
      if (data.validCount === 0) {
        throw new Error('No se detectaron filas válidas de insumos en el archivo Excel.');
      }
      setParsedData(data);
      setPhase('PREVIEW');
      toast.success(`${data.validCount} insumos listos para cargar en ${selectedBranchName}.`);
    } catch (err: any) {
      console.error('[ImportInventoryExcelModal] Error parsing Excel:', err);
      setErrorMessage(err?.message || 'Error al procesar el archivo Excel.');
      setPhase('UPLOAD');
      toast.error(err?.message || 'Error al procesar el archivo Excel.');
    }
  }, [selectedBranchId, selectedBranchName]);

  const handleBranchChange = async (newBranchId: string) => {
    setSelectedBranchId(newBranchId);
    if (selectedFile && phase === 'PREVIEW') {
      await processFile(selectedFile, newBranchId);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedData) return;

    setPhase('IMPORTING');
    setImportProgress({ percent: 0, current: 0, total: parsedData.validCount });

    try {
      const result = await commitInventoryExcelImport(
        parsedData,
        { branchId: selectedBranchId },
        (percent, current, total) => {
          setImportProgress({ percent, current, total });
        }
      );

      setImportResult(result);
      setPhase('SUCCESS');
      toast.success(`¡Carga masiva completada! ${result.totalProcessed} insumos cargados en sede ${selectedBranchName}.`);
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      console.error('[ImportInventoryExcelModal] Error committing import:', err);
      toast.error('Error al guardar insumos en la base de datos.');
      setErrorMessage(err?.message || 'Error desconocido durante la importación.');
      setPhase('PREVIEW');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-md flex items-center justify-center z-[120] p-4 animate-fade-in text-left">
      <div 
        className="bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col transform transition-all duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-glow)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                Carga Masiva de Insumos vía Excel
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30 uppercase tracking-widest">
                  Foodie POS
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Alimenta y actualiza automáticamente los ingredientes, rendimientos y mermas para el recetario.
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-[var(--bg-app)] border border-[var(--border-glow)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Selector de Sede / Sucursal de Destino */}
          {phase !== 'SUCCESS' && (
            <div className="p-4 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/25 flex items-center justify-center text-[var(--accent-purple)] shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)] block">
                    Sede / Sucursal de Destino *
                  </label>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Selecciona la sucursal a la cual se asignará el inventario cargado desde el Excel.
                  </p>
                </div>
              </div>

              <div className="sm:w-64 shrink-0">
                <select
                  value={selectedBranchId}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  disabled={phase === 'PARSING' || phase === 'IMPORTING'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-line text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)] cursor-pointer"
                >
                  {systemBranches.map((branch: any) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* PHASE 1: UPLOAD & DROPZONE */}
          {(phase === 'UPLOAD' || phase === 'PARSING') && (
            <div className="space-y-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10 scale-[1.01]'
                    : 'border-line bg-[var(--bg-app)] hover:border-[var(--accent-purple)]/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-3xl bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/25 flex items-center justify-center text-[var(--accent-purple)] mb-4">
                  {phase === 'PARSING' ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <UploadCloud className="w-8 h-8" />
                  )}
                </div>

                <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wide">
                  {phase === 'PARSING' ? 'Procesando archivo Excel...' : 'Arrastra tu archivo Excel aquí o haz clic para examinar'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-md">
                  Admite libros de Excel estructurados (.xlsx, .xls) con columnas de Proveedor, Línea de Producción, Insumos, Precios y Rendimientos.
                </p>

                <span className="mt-4 px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-glow)] rounded-full text-xs font-bold text-[var(--accent-purple)] shadow-sm">
                  Examinar archivos del equipo
                </span>
              </div>

              {/* Format Guide */}
              <div className="p-5 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--text-primary)] tracking-wide">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Columnas admitidas y mapeadas automáticamente:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-[var(--text-secondary)]">
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Proveedor</strong>
                    <span>Crea o vincula proveedor</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Linea de Produccion</strong>
                    <span>Cocina, Bar, Batidos, etc.</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Insumos</strong>
                    <span>Nombre de ingrediente</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Precio de compra</strong>
                    <span>Costo bruto unitario</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Peso bruto</strong>
                    <span>Cantidad comprada</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Peso neto</strong>
                    <span>Cantidad utilizable</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Unidad de medida</strong>
                    <span>gr, ml, oz, und, etc.</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-glow)]">
                    <strong className="text-[var(--text-primary)] block">Métricas automáticas</strong>
                    <span>Merma %, Factor, Costo real</span>
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-3 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* PHASE 2: PREVIEW */}
          {(phase === 'PREVIEW' || phase === 'IMPORTING') && parsedData && (
            <div className="space-y-6">
              {/* Summary Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)]">
                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">
                    Total Filas Válidas
                  </span>
                  <span className="text-xl font-black font-mono text-[var(--text-primary)] mt-1 block tabular-nums">
                    {parsedData.validCount}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider block">
                    Nuevos Insumos
                  </span>
                  <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 block tabular-nums">
                    +{parsedData.newCount}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/25">
                  <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-wider block">
                    Existentes a Actualizar
                  </span>
                  <span className="text-xl font-black font-mono text-blue-600 dark:text-blue-400 mt-1 block tabular-nums">
                    ↻ {parsedData.updateCount}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                  <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider block">
                    Proveedores Detectados
                  </span>
                  <span className="text-xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1 block tabular-nums">
                    {parsedData.suppliersDetected.length}
                  </span>
                </div>
              </div>

              {/* Station Breakdown Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mr-1">
                  Estaciones:
                </span>
                <span className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold border border-orange-500/20 flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5" />
                  Cocina: {parsedData.zoneBreakdown.cocina || 0}
                </span>
                <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 flex items-center gap-1.5">
                  <Wine className="w-3.5 h-3.5" />
                  Bar: {parsedData.zoneBreakdown.bar || 0}
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20 flex items-center gap-1.5">
                  <Blend className="w-3.5 h-3.5" />
                  Batidos: {parsedData.zoneBreakdown.licuadoras || 0}
                </span>
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20 flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5" />
                  Suministros: {parsedData.zoneBreakdown.general_operaciones || 0}
                </span>
              </div>

              {/* Preview Table of First 10 Items */}
              <div className="border border-[var(--border-glow)] rounded-2xl overflow-hidden bg-[var(--bg-app)]">
                <div className="p-3 bg-[var(--bg-surface)] border-b border-[var(--border-glow)] flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-primary)]">
                    Previsualización de los primeros {parsedData.previewItems.length} insumos
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Mostrando 1 a {parsedData.previewItems.length} de {parsedData.validCount}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-glow)] text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-app)]">
                        <th className="py-2.5 px-3">Insumo</th>
                        <th className="py-2.5 px-3">Estación</th>
                        <th className="py-2.5 px-3 text-center">Compra → Uso</th>
                        <th className="py-2.5 px-3 text-right">Precio Compra</th>
                        <th className="py-2.5 px-3 text-right">Peso Bruto / Neto</th>
                        <th className="py-2.5 px-3 text-right">Merma %</th>
                        <th className="py-2.5 px-3 text-right">Costo Uso (Receta)</th>
                        <th className="py-2.5 px-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-glow)]">
                      {parsedData.previewItems.map((candidate, idx) => (
                        <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                          <td className="py-2.5 px-3 font-bold text-[var(--text-primary)]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{candidate.item.name}</span>
                              {candidate.classification === 'product' && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                  Producto
                                </span>
                              )}
                              {candidate.classification === 'supply' && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                  Suministro
                                </span>
                              )}
                              {candidate.classification === 'ingredient' && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30">
                                  Ingrediente
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[var(--text-muted)] font-normal">{candidate.supplierName}</span>
                              {candidate.item.category && (
                                <span className="text-[9px] text-[var(--text-secondary)] font-semibold bg-[var(--bg-surface)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                                  {candidate.item.category}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-[var(--text-secondary)]">
                            {getOperationalZoneLabel(candidate.item.operationalZone)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-mono font-bold text-[var(--text-primary)]">
                              {candidate.item.purchaseUnit} → {candidate.item.usageUnit || candidate.item.purchaseUnit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-primary)] tabular-nums">
                            {formatCurrency(candidate.item.purchaseCost)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                            {candidate.item.cantidadComprada} / {candidate.item.cantidadUtilizable} {candidate.item.purchaseUnit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                            {(candidate.item.mermaPercentage || 0) > 0 ? (
                              <span className="text-amber-500">{candidate.item.mermaPercentage}%</span>
                            ) : (
                              <span className="text-[var(--text-muted)]">0%</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {formatCurrency(candidate.item.unitCostUsage || candidate.item.costoUnitarioReal || candidate.item.purchaseCost)}
                            <span className="text-[10px] text-[var(--text-muted)] font-semibold block">
                              /{candidate.item.usageUnit || candidate.item.purchaseUnit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {candidate.isNew ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase">
                                Nuevo
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 uppercase">
                                Actualizar
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress Bar during import execution */}
              {phase === 'IMPORTING' && (
                <div className="p-4 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)] space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent-purple)]" />
                      Procesando e insertando insumos en Dexie.js y sync_outbox...
                    </span>
                    <span className="font-mono tabular-nums">{importProgress.percent}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-raised rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[var(--accent-purple)] to-emerald-500 transition-all duration-200"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] text-right">
                    {importProgress.current} de {importProgress.total} registros
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PHASE 3: SUCCESS */}
          {phase === 'SUCCESS' && importResult && (
            <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-5 animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-wide">
                  ¡Catálogo de Insumos Importado con Éxito!
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                  Se indexaron {importResult.totalProcessed} registros en IndexedDB y quedaron sincronizados para alimentar fichas técnicas y comandas.
                </p>
              </div>

              {/* Success metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl w-full pt-2">
                <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)]">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Creados</span>
                  <span className="text-lg font-black font-mono text-emerald-500 mt-0.5 block tabular-nums">
                    +{importResult.importedCount}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)]">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Actualizados</span>
                  <span className="text-lg font-black font-mono text-blue-500 mt-0.5 block tabular-nums">
                    ↻ {importResult.updatedCount}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)]">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Categorías</span>
                  <span className="text-lg font-black font-mono text-purple-500 mt-0.5 block tabular-nums">
                    +{importResult.categoriesCreated}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-glow)]">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Proveedores</span>
                  <span className="text-lg font-black font-mono text-amber-500 mt-0.5 block tabular-nums">
                    +{importResult.suppliersCreated}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-glow)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-purple)] transition-all cursor-pointer shadow-sm"
                >
                  Ir al Inventario
                </button>

                {onNavigateToRecipes && (
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onNavigateToRecipes();
                    }}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[var(--accent-purple)] to-purple-600 hover:opacity-95 text-xs font-bold text-white transition-all cursor-pointer shadow-md shadow-purple-900/20 flex items-center gap-2"
                  >
                    <BookOpen className="w-4 h-4" />
                    Ir al Recetario (Fichas Técnicas)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {phase !== 'SUCCESS' && (
          <div className="p-4 px-6 bg-[var(--bg-surface)] border-t border-[var(--border-glow)] flex items-center justify-between shrink-0">
            {phase === 'PREVIEW' ? (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-5 py-2.5 bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold rounded-full uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cambiar Archivo
                </button>

                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={!parsedData || parsedData.validCount === 0}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-full uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-emerald-900/20 flex items-center gap-2 disabled:opacity-50"
                >
                  Confirmar e Importar {parsedData?.validCount} Insumos
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center justify-end w-full">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold rounded-full uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
