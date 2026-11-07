import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, disabled, readOnly, ...props }, ref) => {
    const baseStyles = 'h-11 w-full rounded-sm border border-line bg-inset text-content px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-action/25 focus:border-action transition-colors shadow-sm';
    const colorStyles = 'placeholder:text-content-tertiary';
    const disabledStyles = disabled || readOnly ? 'opacity-70 bg-surface text-content-tertiary border-line-subtle cursor-not-allowed' : '';
    const errorStyles = error ? 'border-danger focus:border-danger focus:ring-danger/25' : '';
    
    const isDate = props.type === 'date' || props.type === 'datetime-local';
    const dateStyles = isDate ? '[color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80' : '';

    const finalClassName = `${baseStyles} ${colorStyles} ${disabledStyles} ${errorStyles} ${dateStyles} ${className}`.trim();

    const titleValue = props.title !== undefined ? props.title : (typeof props.value === 'string' && props.value.length > 0 ? props.value : undefined);

    return (
      <div className="w-full">
        <input
          ref={ref}
          disabled={disabled}
          readOnly={readOnly}
          title={titleValue}
          className={finalClassName}
          {...props}
        />
        {error && <span className="text-xs text-danger font-bold mt-1 block">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
