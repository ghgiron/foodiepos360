import React, { useEffect } from 'react';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'image';
}

export default function Modal({ isOpen = true, onClose, title, children, size = 'lg' }: ModalProps) {
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
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    image: 'max-w-3xl'
  }[size];

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div 
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 w-full ${widthClass} shadow-2xl text-left transform transition-all duration-300 scale-100`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800/80 mb-4">
          <h3 className="font-headline font-black text-lg text-slate-900 dark:text-white uppercase tracking-wider">
            {title}
          </h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-650 dark:hover:text-white cursor-pointer w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[75vh]">{children}</div>
      </div>
    </div>
  );
}
