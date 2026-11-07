// src/components/inventory/ListaDePrecios.tsx
import { useState, useMemo } from 'react';
import { db } from '../../db/localDb';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../utils/formatters';
import { getOperationalZoneLabel } from '../../utils/operationalZones';
import ImportInventoryExcelModal from './ImportInventoryExcelModal';
import { flexibleMultiMatch } from '../../utils/searchEngine';
import { 
  FileSpreadsheet, 
  Download, 
  Plus, 
  Search, 
  ChefHat, 
  Wine, 
  Blend, 
  PackageCheck, 
  DollarSign,
  TrendingDown,
  Layers
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ListaDePreciosProps {
  onIngreso?: () => void;
  onNavigateToRecipes?: () => void;
  onEditItem?: (itemId: string) => void;
}

export default function ListaDePrecios({
  onIngreso,
  onNavigateToRecipes,
  onEditItem
}: ListaDePreciosProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [showImportModal, setShowImportModal] = useState(false);

  // Live Query inventory items from Dexie
  const items = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    suppliers.forEach(s => map.set(s.id, s.name));
    return map;
  }, [suppliers]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const supplierName = item.supplierId ? (supplierMap.get(item.supplierId) || '') : '';
      const matchSearch = flexibleMultiMatch([
        item.name,
        item.category,
        item.supplierId,
        supplierName,
        item.operationalZone,
        item.operationZone
      ], searchTerm);

      const matchZone =
        selectedZone === 'ALL' ||
        item.operationalZone === selectedZone ||
        item.operationZone?.toLowerCase().includes(selectedZone.toLowerCase());

      return matchSearch && matchZone;
    });
  }, [items, searchTerm, selectedZone]);

  // Summary Metrics
  const totalItemsCount = items.length;
  const avgCost = useMemo(() => {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, i) => acc + (i.purchaseCost || 0), 0);
    return Math.round(sum / items.length);
  }, [items]);

  const itemsWithWaste = useMemo(() => {
    return items.filter(i => (i.mermaPercentage || 0) > 0).length;
  }, [items]);

  // CSV Export utility
  const handleExportCSV = () => {
    if (items.length === 0) {
      toast.error('No hay insumos para exportar.');
      return;
    }

    const headers = ['Insumo', 'Zona Operativa', 'Categoría', 'Proveedor', 'Unidad', 'Costo Compra', 'Peso Bruto', 'Peso Neto', 'Merma %', 'Costo Real', 'Stock'];
    const rows = items.map(i => [
      `"${i.name.replace(/"/g, '""')}"`,
      `"${getOperationalZoneLabel(i.operationalZone)}"`,
      `"${i.category || ''}"`,
      `"${supplierMap.get(i.supplierId) || i.supplierId || ''}"`,
      `"${i.purchaseUnit || ''}"`,
      i.purchaseCost || 0,
      i.cantidadComprada || 0,
      i.cantidadUtilizable || 0,
      i.mermaPercentage || 0,
      i.costoUnitarioReal || i.purchaseCost || 0,
      i.theoreticalStock || 0
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Lista_De_Precios_FoodiePOS_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Lista de precios exportada exitosamente.');
  };

  return (
    <div className="p-8 space-y-6 text-left animate-fade-in font-sans">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-glow)] pb-4">
        <div>
          <h1 className="text-xl font-black text-[var(--text-primary)] leading-tight flex items-center gap-2">
            Lista de Precios e Insumos
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30 uppercase tracking-widest">
              Costeo Maestro
            </span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Supervisión de costos de adquisición, factores de corrección, mermas y rendimientos operativos.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-app)] text-[var(--text-primary)] border border-[var(--border-glow)] text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-sm transition-all"
          >
            <Download className="w-4 h-4 text-[var(--text-secondary)]" />
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            data-testid="btn-open-excel-import"
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-900/20 transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Excel
          </button>

          {onIngreso && (
            <button
              type="button"
              onClick={onIngreso}
              className="px-4 py-2.5 bg-[var(--accent-purple)] hover:opacity-95 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-md shadow-purple-900/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Nuevo Insumo
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-glow)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Insumos Catalogados</span>
            <span className="text-xl font-black font-mono text-[var(--text-primary)] tabular-nums">{totalItemsCount}</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-glow)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Costo Promedio</span>
            <span className="text-xl font-black font-mono text-[var(--text-primary)] tabular-nums">{formatCurrency(avgCost)}</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-glow)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Insumos con Merma</span>
            <span className="text-xl font-black font-mono text-amber-500 tabular-nums">{itemsWithWaste}</span>
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-glow)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Proveedores Activos</span>
            <span className="text-xl font-black font-mono text-blue-500 tabular-nums">{suppliers.length}</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[var(--bg-surface)] p-3 rounded-2xl border border-[var(--border-glow)]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por insumo, categoría o proveedor..."
            className="w-full bg-[var(--bg-app)] border border-[var(--border-glow)] rounded-xl py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-purple)]"
          />
        </div>

        {/* Operational Zone Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'Todas' },
            { id: 'cocina', label: 'Cocina', icon: ChefHat },
            { id: 'bar', label: 'Bar', icon: Wine },
            { id: 'licuadoras', label: 'Batidos', icon: Blend },
            { id: 'general_operaciones', label: 'Suministros', icon: PackageCheck }
          ].map((z) => {
            const Icon = z.icon;
            const isSelected = selectedZone === z.id;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => setSelectedZone(z.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-glow)]'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {z.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Price List Table */}
      <div className="border border-[var(--border-glow)] rounded-3xl overflow-hidden bg-[var(--bg-surface)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-glow)] bg-[var(--bg-app)] text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-3 px-4">Insumo</th>
                <th className="py-3 px-3">Estación</th>
                <th className="py-3 px-3">Proveedor</th>
                <th className="py-3 px-3 text-center">Unidad</th>
                <th className="py-3 px-3 text-right">Peso Bruto / Neto</th>
                <th className="py-3 px-3 text-right">Merma %</th>
                <th className="py-3 px-3 text-right">Costo Bruto</th>
                <th className="py-3 px-3 text-right">Costo Real</th>
                <th className="py-3 px-3 text-right">Stock</th>
                {onEditItem && <th className="py-3 px-4 text-center">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-glow)] font-semibold">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={onEditItem ? 10 : 9} className="py-12 px-6 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FileSpreadsheet className="w-10 h-10 text-[var(--text-muted)]" />
                      <p className="font-bold text-sm text-[var(--text-primary)]">No se encontraron insumos</p>
                      <p className="text-xs text-[var(--text-muted)] max-w-sm">
                        Puedes importar tu catálogo desde Excel o crear nuevos ingredientes de forma manual.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowImportModal(true)}
                        className="px-5 py-2 bg-[var(--accent-purple)] text-white text-xs font-bold rounded-full shadow-sm hover:opacity-95 cursor-pointer mt-1"
                      >
                        Importar Excel de Insumos
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const supplierName = supplierMap.get(item.supplierId) || item.supplierId || 'Por definir';
                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-[var(--bg-app)]/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <strong className="text-[var(--text-primary)] block">{item.name}</strong>
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">{item.category}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-app)] border border-[var(--border-glow)] text-[var(--text-secondary)]">
                          {getOperationalZoneLabel(item.operationalZone)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[var(--text-secondary)]">
                        {supplierName}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-[var(--text-secondary)]">
                        {item.purchaseUnit || 'und'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {item.cantidadComprada || '-'} / {item.cantidadUtilizable || '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums">
                        {(item.mermaPercentage || 0) > 0 ? (
                          <span className="text-amber-500">{(item.mermaPercentage || 0).toFixed(1)}%</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">0%</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text-primary)] tabular-nums">
                        {formatCurrency(item.purchaseCost)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(item.costoUnitarioReal || item.purchaseCost)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {item.theoreticalStock || 0}
                      </td>
                      {onEditItem && (
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => onEditItem(item.id)}
                            className="px-2.5 py-1 text-[11px] font-bold text-[var(--accent-purple)] hover:underline cursor-pointer"
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Import */}
      <ImportInventoryExcelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onNavigateToRecipes={onNavigateToRecipes}
      />
    </div>
  );
}
