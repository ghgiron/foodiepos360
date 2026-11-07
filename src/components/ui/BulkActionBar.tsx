import React from 'react';

export interface BulkActionBarProps {
  selectedCount: number;
  itemLabel?: string;
  onClear?: () => void;
  onDelete?: () => void;
  onClearSelection?: () => void;
  onBulkDelete?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  itemLabel = 'elementos',
  onClear,
  onDelete,
  onClearSelection,
  onBulkDelete
}) => {
  const handleClear = onClear || onClearSelection || (() => {});
  const handleDelete = onDelete || onBulkDelete || (() => {});

  if (selectedCount === 0) return null;

  return (
    <aside 
      aria-label="Barra de acciones masivas"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass bg-raised text-content shadow-lg border border-line rounded-full px-5 py-2.5 flex items-center gap-4 animate-fade-in"
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-action animate-pulse" />
        <span className="text-xs font-bold tracking-wide">
          <strong className="text-content font-black text-sm tabular-nums">{selectedCount}</strong> {itemLabel} seleccionado{selectedCount > 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-4 w-[1px] bg-line" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="text-xs font-semibold text-content-secondary hover:text-content px-3 py-1.5 rounded-full transition-colors cursor-pointer border-none bg-transparent hover:bg-surface active:scale-95"
        >
          Deseleccionar
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="bg-danger hover:opacity-90 text-white font-bold text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-md transition-all cursor-pointer border-none active:scale-95"
        >
          <span className="material-symbols-outlined text-sm font-bold">delete</span>
          Eliminar seleccionados ({selectedCount})
        </button>
      </div>
    </aside>
  );
};

export default BulkActionBar;
