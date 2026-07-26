import { useEffect } from 'react';

interface ConfirmDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmDialog({
  isOpen = true,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar'
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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 w-full max-w-md shadow-2xl text-left transform transition-all duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-headline font-black text-lg text-slate-900 dark:text-white mb-2 uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 font-semibold leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-750 text-xs font-bold rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              handleCancel();
            }}
            className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-xl uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-rose-500/10 active:scale-95"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
