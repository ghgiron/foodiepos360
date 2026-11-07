import React, { forwardRef } from 'react';
import { Calendar } from 'lucide-react';

export interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className = '', error, disabled, readOnly, value, onChange, ...props }, ref) => {
    const baseStyles = 'h-11 w-full rounded-sm border border-line bg-inset text-content placeholder:text-content-tertiary [color-scheme:light] dark:[color-scheme:dark] text-sm pl-3.5 pr-10 transition-all focus:border-action focus:ring-2 focus:ring-action/25 outline-none shadow-sm [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full';
    const disabledStyles = disabled || readOnly ? 'opacity-70 bg-surface text-content-tertiary border-line-subtle cursor-not-allowed' : '';
    const errorStyles = error ? 'border-danger focus:border-danger focus:ring-danger/25' : '';

    const finalClassName = `${baseStyles} ${disabledStyles} ${errorStyles} ${className}`.trim();

    return (
      <div className="w-full relative">
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="date"
            disabled={disabled}
            readOnly={readOnly}
            value={value}
            onChange={onChange}
            className={finalClassName}
            {...props}
          />
          <div className="pointer-events-none absolute right-3 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-content-secondary stroke-[1.75]" />
          </div>
        </div>
        {error && <span className="text-xs text-danger font-bold mt-1 block">{error}</span>}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';

export default DatePicker;
