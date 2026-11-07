import { useState, useEffect, useMemo } from 'react';
import { db } from '../../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { 
  checkSubRecipeFeasibility, 
  executeSubRecipeBatch, 
  type SubRecipeFeasibilityResult 
} from '../../services/subRecipeProductionService';
import { getActiveBranchId, formatQuantityDecimals } from '../../utils/branchHelper';

interface ProduceSubRecipeModalProps {
  isOpen?: boolean;
  onClose: () => void;
  initialSubRecipeId?: string;
  onSuccess?: () => void;
  branchId?: string;
}

export default function ProduceSubRecipeModal({
  isOpen = true,
  onClose,
  initialSubRecipeId,
  onSuccess,
  branchId
}: ProduceSubRecipeModalProps) {
  const [selectedSubRecipeId, setSelectedSubRecipeId] = useState<string>(initialSubRecipeId || '');
  const [batchesCount, setBatchesCount] = useState<number>(1);
  const [searchFilter, setSearchFilter] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [feasibility, setFeasibility] = useState<SubRecipeFeasibilityResult | null>(null);
  const [isLoadingFeasibility, setIsLoadingFeasibility] = useState(false);

  // Load subrecipes from Dexie
  const subRecipes = useLiveQuery(() => 
    db.recipes.filter(r => Boolean(r.isSubRecipe)).toArray()
  ) || [];

  // Active branch
  const activeBranchId = branchId || getActiveBranchId();

  // Branch display name
  const branchSettings = useLiveQuery(() => db.systemSettings.get('system_branches'));
  const activeBranchName = useMemo(() => {
    if (Array.isArray(branchSettings?.value)) {
      const match = branchSettings.value.find((b: any) => b.id?.toLowerCase().trim() === activeBranchId.toLowerCase().trim());
      if (match?.name) return match.name;
    }
    return 'San Agustín';
  }, [branchSettings, activeBranchId]);

  // Sync initial selection
  useEffect(() => {
    if (initialSubRecipeId) {
      setSelectedSubRecipeId(initialSubRecipeId);
    } else if (subRecipes.length > 0 && !selectedSubRecipeId) {
      setSelectedSubRecipeId(subRecipes[0].id);
    }
  }, [initialSubRecipeId, subRecipes, selectedSubRecipeId]);

  // Selected subrecipe object
  const currentSubRecipe = useMemo(() => {
    return subRecipes.find(r => r.id === selectedSubRecipeId);
  }, [subRecipes, selectedSubRecipeId]);

  // Filtered subrecipes for dropdown
  const filteredSubRecipes = useMemo(() => {
    if (!searchFilter.trim()) return subRecipes;
    const q = searchFilter.toLowerCase();
    return subRecipes.filter(r => 
      r.name.toLowerCase().includes(q) || 
      (r.category && r.category.toLowerCase().includes(q))
    );
  }, [subRecipes, searchFilter]);

  // Recalculate feasibility when subrecipe, batches, or branch change
  useEffect(() => {
    if (!selectedSubRecipeId) {
      setFeasibility(null);
      return;
    }

    let isMounted = true;
    setIsLoadingFeasibility(true);

    checkSubRecipeFeasibility(selectedSubRecipeId, batchesCount, db, activeBranchId)
      .then((res) => {
        if (isMounted) {
          setFeasibility(res);
          setIsLoadingFeasibility(false);
        }
      })
      .catch((err) => {
        console.error('[ProduceSubRecipeModal] Feasibility check error:', err);
        if (isMounted) {
          setFeasibility(null);
          setIsLoadingFeasibility(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubRecipeId, batchesCount, activeBranchId]);

  // Handler for batch submission
  const handleProduce = async () => {
    if (!selectedSubRecipeId) {
      toast.error('Seleccione una subreceta para producir.');
      return;
    }
    if (batchesCount <= 0) {
      toast.error('La cantidad de lotes debe ser de al menos 1.');
      return;
    }

    if (feasibility && !feasibility.canProduce) {
      toast.error('No hay suficiente inventario disponible para completar este lote.');
      return;
    }

    setIsExecuting(true);
    try {
      const result = await executeSubRecipeBatch(selectedSubRecipeId, batchesCount, db, activeBranchId);
      if (result.success) {
        toast.success(
          `¡Producción registrada! Se añadieron ${result.producedQuantity} ${result.yieldUnit} de '${result.subRecipeName}'.`,
          { duration: 4500 }
        );
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || 'No fue posible registrar la producción del lote.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Error al ejecutar la producción de subreceta.');
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registro de Producción / Lotes de Subrecetas"
      size="2xl"
    >
      <div className="space-y-6 text-content font-sans">
        
        {/* Selector de Subreceta */}
        <div className="space-y-1.5 relative">
          <label className="text-[10px] font-black uppercase tracking-wider text-content-tertiary">
            Subreceta a Producir
          </label>
          
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between p-3 bg-surface border border-line rounded-2xl shadow-sm hover:border-[var(--accent-purple)] transition-all cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-raised shrink-0 border border-slate-200/50 dark:border-line">
                  {currentSubRecipe?.img ? (
                    <img src={currentSubRecipe.img} alt={currentSubRecipe.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <span className="material-symbols-outlined text-lg">skillet</span>
                    </div>
                  )}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-content truncate">
                      {currentSubRecipe?.name || 'Seleccione una subreceta'}
                    </span>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300">
                      SUBRECETA
                    </span>
                  </div>
                  <span className="text-xs text-content-secondary font-medium">
                    {currentSubRecipe 
                      ? `Rendimiento: ${currentSubRecipe.yieldQuantity || 1} ${currentSubRecipe.yieldUnit || 'porciones'} por lote`
                      : 'Haga clic para buscar en el recetario'}
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-400 transition-transform duration-200" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none' }}>
                expand_more
              </span>
            </button>

            {/* Subrecipes Dropdown with Search */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                <div className="p-2 border-b border-line flex items-center gap-2 bg-inset/50">
                  <span className="material-symbols-outlined text-slate-400 text-sm pl-2">search</span>
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Buscar subreceta por nombre..."
                    className="w-full p-1.5 bg-transparent border-none outline-none text-xs text-content font-medium"
                    autoFocus
                  />
                  {searchFilter && (
                    <button 
                      type="button" 
                      onClick={() => setSearchFilter('')}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-line/60">
                  {filteredSubRecipes.map((sr) => (
                    <div
                      key={sr.id}
                      onClick={() => {
                        setSelectedSubRecipeId(sr.id);
                        setIsDropdownOpen(false);
                        setSearchFilter('');
                      }}
                      className={`p-3 flex items-center justify-between hover:bg-purple-50/50 dark:hover:bg-purple-950/20 cursor-pointer transition-colors ${
                        sr.id === selectedSubRecipeId ? 'bg-purple-50 dark:bg-purple-950/30' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-raised shrink-0">
                          {sr.img ? (
                            <img src={sr.img} alt={sr.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <span className="material-symbols-outlined text-sm">skillet</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-content block">{sr.name}</span>
                          <span className="text-[10px] text-content-secondary">
                            Rendimiento: {sr.yieldQuantity || 1} {sr.yieldUnit || 'porciones'}
                          </span>
                        </div>
                      </div>
                      {sr.id === selectedSubRecipeId && (
                        <span className="material-symbols-outlined text-[var(--accent-purple)] text-sm">check</span>
                      )}
                    </div>
                  ))}
                  {filteredSubRecipes.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No se encontraron subrecetas activas.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cantidad de Lotes a Producir */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-inset p-4 rounded-2xl border border-line">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-content-tertiary block mb-1">
              Cantidad de Lotes a Producir
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBatchesCount(prev => Math.max(1, prev - 1))}
                className="w-10 h-10 rounded-xl bg-inset border border-line font-bold text-base flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer active:scale-95 transition-all"
                title="Disminuir un lote"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={batchesCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setBatchesCount(isNaN(val) || val < 1 ? 1 : val);
                }}
                className="w-20 text-center py-2 px-3 bg-surface border border-line rounded-xl text-base font-black font-mono text-content focus:ring-2 focus:ring-[var(--accent-purple)] outline-none"
              />
              <button
                type="button"
                onClick={() => setBatchesCount(prev => prev + 1)}
                className="w-10 h-10 rounded-xl bg-inset border border-line font-bold text-base flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer active:scale-95 transition-all"
                title="Aumentar un lote"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Info & Max Possible Batches */}
          <div className="flex flex-col sm:items-end justify-center">
            {feasibility && (
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">
                  Capacidad con stock actual
                </span>
                {feasibility.maxPossibleBatches > 0 ? (
                  <button
                    type="button"
                    onClick={() => setBatchesCount(feasibility.maxPossibleBatches)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition-all cursor-pointer"
                    title="Aplicar máximo posible"
                  >
                    <span className="material-symbols-outlined text-xs">tune</span>
                    Máximo: {feasibility.maxPossibleBatches} lote{feasibility.maxPossibleBatches > 1 ? 's' : ''}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-500">
                    <span className="material-symbols-outlined text-xs">error</span>
                    Sin stock suficiente para 1 lote
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Previsualización del Rendimiento y Costo */}
        {feasibility && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-500/20 dark:border-purple-800/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--accent-purple)] block mb-0.5">
                Rendimiento Estimado
              </span>
              <p className="text-base font-black text-content">
                Se generarán <span className="text-[var(--accent-purple)] font-mono">{formatQuantityDecimals(feasibility.totalProducedYield)} {feasibility.yieldUnit}</span> de {feasibility.subRecipe.name}
              </p>
              <span className="text-xs text-content-secondary">
                ({formatQuantityDecimals(feasibility.yieldPerBatch)} {feasibility.yieldUnit} × {batchesCount} lote{batchesCount > 1 ? 's' : ''})
              </span>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                Costo Total Estimado
              </span>
              <span className="text-xl font-black font-mono text-content tabular-nums block">
                ${feasibility.totalCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[11px] font-semibold text-content-secondary font-mono">
                ~${feasibility.costPerYieldUnit.toLocaleString('es-CO', { maximumFractionDigits: 0 })} / {feasibility.yieldUnit.slice(0, -1) || 'unidad'}
              </span>
            </div>
          </div>
        )}

        {/* Resumen de Validación Previa de Ingredientes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-content flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[var(--accent-purple)]">checklist</span>
              Desglose de Insumos Requeridos vs. Stock
              <span className="text-[10px] font-bold text-[var(--accent-purple)] bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full border border-purple-200/50 dark:border-purple-800/40">
                Sede: {activeBranchName}
              </span>
            </h4>
            {feasibility && (
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                feasibility.canProduce 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' 
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
              }`}>
                {feasibility.canProduce ? 'Stock Disponible' : 'Faltan Insumos'}
              </span>
            )}
          </div>

          <div className="border border-line rounded-2xl overflow-hidden bg-surface max-h-96 overflow-y-auto">
            {isLoadingFeasibility ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Verificando inventario y costos...
              </div>
            ) : feasibility && feasibility.items.length > 0 ? (
              <table className="w-full text-xs text-left">
                <thead className="bg-inset text-[9px] font-black uppercase text-content-tertiary tracking-wider border-b border-line sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Insumo</th>
                    <th className="py-2 px-2 text-center">Requerido</th>
                    <th className="py-2 px-2 text-center">Disponible</th>
                    <th className="py-2 px-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium">
                  {feasibility.items.map((item) => (
                    <tr key={item.id} className={!item.isSufficient ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''}>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-content block">{item.name}</span>
                        <span className="text-[10px] text-slate-400">{item.type === 'subrecipe' ? 'Subreceta' : 'Materia Prima'}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-content-secondary tabular-nums">
                        {formatQuantityDecimals(item.totalRequired)} {item.unit}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-content-secondary tabular-nums">
                        {formatQuantityDecimals(item.availableStock)} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {item.isSufficient ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <span className="material-symbols-outlined text-xs">check_circle</span>
                            Suficiente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-600 dark:text-rose-400">
                            <span className="material-symbols-outlined text-xs">cancel</span>
                            Faltan {formatQuantityDecimals(item.missingQuantity)} {item.unit}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 italic">
                Esta subreceta no tiene ingredientes asignados.
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="pt-4 border-t border-line flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-raised dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleProduce}
            disabled={isExecuting || !feasibility || !feasibility.canProduce || feasibility.items.length === 0}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-full font-headline font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
              !feasibility || !feasibility.canProduce || feasibility.items.length === 0
                ? 'bg-slate-300 dark:bg-raised text-content-tertiary cursor-not-allowed shadow-none'
                : 'bg-[var(--accent-purple)] hover:opacity-95 text-white shadow-[var(--accent-purple)]/25 active:scale-95'
            }`}
          >
            {isExecuting ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                <span>Registrando en Kardex...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">skillet</span>
                <span>🍳 Registrar Producción</span>
              </>
            )}
          </button>
        </div>

      </div>
    </Modal>
  );
}
