import React from 'react';

export interface DiscardChangesModalProps {
  isOpen: boolean;
  onContinueEditing?: () => void;
  onDiscardAndExit?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const DiscardChangesModal: React.FC<DiscardChangesModalProps> = ({
  isOpen,
  onContinueEditing,
  onDiscardAndExit,
  onConfirm,
  onCancel
}) => {
  const handleContinue = onContinueEditing || onCancel || (() => {});
  const handleDiscard = onDiscardAndExit || onConfirm || (() => {});

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-overlay animate-fade-in">
      <div 
        className="glass w-full max-w-md bg-raised border border-line rounded-xl p-6 shadow-lg space-y-5 text-left"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-modal-title"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-danger-subtle border border-danger/30 flex items-center justify-center shrink-0 text-danger">
            <span className="material-symbols-outlined text-xl">warning</span>
          </div>
          <div className="space-y-1">
            <h3 id="discard-modal-title" className="text-base font-extrabold text-content leading-tight">
              ¿Descartar cambios no guardados?
            </h3>
            <p className="text-xs text-content-secondary leading-relaxed font-medium">
              Tienes información parcialmente digitada. Si sales ahora, perderás los datos ingresados.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-subtle">
          <button
            type="button"
            onClick={handleContinue}
            className="px-5 py-2.5 bg-surface hover:bg-canvas text-content-secondary hover:text-content text-xs font-bold rounded-full transition-colors border border-line cursor-pointer interactive-tap"
          >
            Continuar editando
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="px-5 py-2.5 bg-danger hover:opacity-90 text-white text-xs font-bold rounded-full transition-colors shadow-md cursor-pointer border-none btn-press"
          >
            Descartar y salir
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiscardChangesModal;
