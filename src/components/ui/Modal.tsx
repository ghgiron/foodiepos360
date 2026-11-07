import React, { useEffect } from 'react';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'image';
}

export default function Modal({ isOpen = true, onClose, title, children, size = '2xl' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    image: 'max-w-3xl'
  }[size];

  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div 
        className={`glass bg-raised border border-line rounded-xl p-6 w-full ${widthClass} shadow-lg text-left transform transition-all duration-300 scale-100`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-line mb-4">
          <h3 className="font-headline font-black text-lg text-content uppercase tracking-wider">
            {title}
          </h3>
          <button 
            onClick={onClose} 
            className="text-content-secondary hover:text-content cursor-pointer w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-surface transition-colors interactive-tap"
            title="Cerrar modal"
            aria-label="Cerrar modal"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[75vh]">{children}</div>
      </div>
    </div>
  );
}
