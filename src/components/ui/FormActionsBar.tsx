import React from 'react';

interface FormActionsBarProps {
  children: React.ReactNode;
  className?: string;
}

export const FormActionsBar: React.FC<FormActionsBarProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`sticky bottom-0 left-0 right-0 w-full glass bg-surface/95 border-t border-line p-4 z-30 shadow-lg flex items-center justify-end gap-3 ${className}`}
    >
      {children}
    </div>
  );
};
