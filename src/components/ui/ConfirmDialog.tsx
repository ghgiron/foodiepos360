import { useEffect } from 'react';

export interface ConfirmDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | string;
}

export default function ConfirmDialog({
  isOpen = true,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger'
}: ConfirmDialogProps) {
  const handleCancel = onCancel || onClose || (() => {});

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleCancel();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div 
        className="glass bg-raised border border-line rounded-xl p-6 w-full max-w-md shadow-lg text-left transform transition-all duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-headline font-black text-lg text-content mb-2 uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-xs text-content-secondary mb-6 font-semibold leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 bg-surface text-content-secondary hover:text-content border border-line text-xs font-bold rounded-full uppercase tracking-wider transition-colors cursor-pointer interactive-tap"
          >
            {cancelText}
          </button>
          <button
            onClick={async () => {
              await onConfirm();
              handleCancel();
            }}
            className={`px-6 py-2.5 ${variant === 'danger' ? 'bg-danger text-white' : 'bg-action text-action-text'} hover:opacity-90 text-xs font-black rounded-full uppercase tracking-wider transition-all cursor-pointer shadow-md btn-press`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
