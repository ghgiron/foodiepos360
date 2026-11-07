import React, { forwardRef } from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  options?: { value: string | number; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', error, disabled, children, options, ...props }, ref) => {
    const baseStyles = 'h-11 w-full rounded-sm border border-line bg-inset text-content text-sm px-3.5 py-2.5 transition-colors outline-none focus:outline-none focus:ring-2 focus:ring-action/25 focus:border-action shadow-sm appearance-none';
    const colorStyles = 'placeholder:text-content-tertiary';
    const disabledStyles = disabled ? 'opacity-70 bg-surface text-content-tertiary border-line-subtle cursor-not-allowed' : '';
    const errorStyles = error ? 'border-danger focus:border-danger focus:ring-danger/25' : '';

    const finalClassName = `${baseStyles} ${colorStyles} ${disabledStyles} ${errorStyles} ${className}`.trim();

    return (
      <div className="w-full relative">
        <select
          ref={ref}
          disabled={disabled}
          className={finalClassName}
          {...props}
        >
          {children ? (
            children
          ) : (
            <>
              <option value="" disabled selected hidden>Seleccione...</option>
              {options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </>
          )}
        </select>
        {/* Custom arrow for select */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-content-secondary">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
        {error && <span className="text-xs text-danger font-bold mt-1 block">{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
