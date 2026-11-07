import React, { forwardRef } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', error, disabled, readOnly, ...props }, ref) => {
    const baseStyles = 'w-full rounded-sm border border-line bg-inset text-content min-h-[88px] px-3.5 py-2.5 text-sm transition-colors shadow-sm resize-y';
    const colorStyles = 'placeholder:text-content-tertiary';
    const focusStyles = 'focus:ring-2 focus:ring-action/25 focus:border-action outline-none';
    const disabledStyles = disabled || readOnly ? 'opacity-70 bg-surface text-content-tertiary border-line-subtle cursor-not-allowed' : '';
    const errorStyles = error ? 'border-danger focus:border-danger focus:ring-danger/25' : '';

    const finalClassName = `${baseStyles} ${colorStyles} ${focusStyles} ${disabledStyles} ${errorStyles} ${className}`.trim();

    return (
      <div className="w-full">
        <textarea
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          className={finalClassName}
          {...props}
        />
        {error && <span className="text-xs text-danger font-bold mt-1 block">{error}</span>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
