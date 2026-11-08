// src/components/ui/CustomDatePicker.tsx
import { useState, useRef, useEffect, useMemo } from 'react';

export interface CustomDatePickerProps {
  value?: string; // Formato YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: string;
  maxDate?: string;
  label?: string;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

/**
 * [US-09D] Selector de Fechas Popover Custom (Dark/Glass)
 * Elimina la invocación del widget nativo del SO.
 * Diseñado con tokens neutros (#171717 / #262626), feedback táctil y botones 'Hoy' y 'Limpiar'.
 */
export default function CustomDatePicker({
  value = '',
  onChange,
  placeholder = 'Seleccionar fecha...',
  disabled = false,
  className = '',
  minDate,
  maxDate,
  label
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or default to today
  const parsedDate = useMemo(() => {
    if (!value) return null;
    try {
      const parts = value.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m, d);
        if (!isNaN(dateObj.getTime())) return { year: y, month: m, day: d, date: dateObj };
      }
    } catch {
      // Fallback
    }
    return null;
  }, [value]);

  const today = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      str: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    };
  }, []);

  // Browse month/year state
  const [viewYear, setViewYear] = useState<number>(() => parsedDate ? parsedDate.year : today.year);
  const [viewMonth, setViewMonth] = useState<number>(() => parsedDate ? parsedDate.month : today.month);

  // Sync view when value changes externally
  useEffect(() => {
    if (parsedDate) {
      setViewYear(parsedDate.year);
      setViewMonth(parsedDate.month);
    }
  }, [parsedDate]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Generate days grid (Monday-first: 0=Lu, 6=Do)
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // In JS: 0=Sunday, 1=Monday... We need Monday=0, Sunday=6
    const leadingPadding = (firstDayIndex + 6) % 7;

    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      dateStr: string;
      isSelected: boolean;
      isToday: boolean;
      isDisabled: boolean;
    }> = [];

    // Leading days from previous month
    for (let i = leadingPadding - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateStr,
        isSelected: value === dateStr,
        isToday: today.str === dateStr,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate))
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        dateStr,
        isSelected: value === dateStr,
        isToday: today.str === dateStr,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate))
      });
    }

    // Trailing days from next month to complete standard 35 or 42 grid
    const totalRendered = days.length;
    const targetCount = totalRendered <= 35 ? 35 : 42;
    const trailingPadding = targetCount - totalRendered;

    for (let d = 1; d <= trailingPadding; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateStr,
        isSelected: value === dateStr,
        isToday: today.str === dateStr,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate))
      });
    }

    return days;
  }, [viewYear, viewMonth, value, today.str, minDate, maxDate]);

  // Format display label
  const formattedDisplay = useMemo(() => {
    if (!parsedDate) return null;
    return `${parsedDate.day} ${MONTH_NAMES[parsedDate.month].slice(0, 3)} ${parsedDate.year}`;
  }, [parsedDate]);

  const handleSelectDay = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled) return;
    onChange(dateStr);
    setIsOpen(false);
  };

  const handleSetToday = () => {
    onChange(today.str);
    setViewYear(today.year);
    setViewMonth(today.month);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const hasCustomHeight = className.includes('h-');
  const heightCls = hasCustomHeight ? '' : 'h-11';
  const hasCustomPy = className.includes('py-');
  const pyCls = hasCustomPy ? '' : 'py-2.5';
  const hasCustomPx = className.includes('px-');
  const pxCls = hasCustomPx ? '' : 'px-3.5';

  return (
    <div ref={containerRef} className="relative w-full text-left font-body">
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button (8px rounded-sm, neutral surface) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`${heightCls} w-full flex items-center justify-between ${pxCls} ${pyCls} rounded-sm border border-line bg-surface hover:bg-raised text-content text-xs font-semibold outline-none focus:ring-2 focus:ring-action/25 focus:border-action transition-all cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="material-symbols-outlined text-slate-400 text-base select-none">
            calendar_today
          </span>
          <span className={`truncate ${!formattedDisplay ? 'text-slate-400 font-normal' : 'text-content font-bold font-mono'}`}>
            {formattedDisplay || placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* Quick Clear 'X' */}
          {value !== '' && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-danger hover:bg-raised rounded-xs transition-colors cursor-pointer"
              title="Limpiar fecha"
            >
              <span className="material-symbols-outlined text-xs">close</span>
            </span>
          )}

          <span className={`material-symbols-outlined text-slate-400 select-none text-base transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
            keyboard_arrow_down
          </span>
        </div>
      </button>

      {/* Popover Calendar (Dark / Glass tokens, z-[9999]) */}
      {isOpen && (
        <div 
          className="absolute left-0 mt-1.5 z-[9999] w-72 rounded-lg border border-line bg-surface dark:bg-[#171717] shadow-2xl p-4 text-content glass animate-scale-up"
          role="dialog"
          aria-label="Selector de fecha"
        >
          {/* Month / Year Navigation Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-line">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-raised text-slate-400 hover:text-content transition-colors cursor-pointer"
              aria-label="Mes anterior"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </button>

            <div className="text-xs font-bold font-headline text-content">
              <span>{MONTH_NAMES[viewMonth]}</span>{' '}
              <span className="font-mono text-slate-400">{viewYear}</span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-raised text-slate-400 hover:text-content transition-colors cursor-pointer"
              aria-label="Mes siguiente"
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          </div>

          {/* Weekday Names Header */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {WEEKDAY_NAMES.map((wd) => (
              <span key={wd} className="text-[10px] font-black uppercase tracking-wider text-slate-400 py-1">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((d, idx) => {
              const isSelected = d.isSelected;
              return (
                <button
                  key={`${d.dateStr}-${idx}`}
                  type="button"
                  disabled={d.isDisabled}
                  onClick={() => handleSelectDay(d.dateStr, d.isDisabled)}
                  className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full text-xs font-mono font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-action text-action-text font-black shadow-sm scale-105'
                      : d.isToday
                        ? 'border border-[var(--accent-purple)] text-content font-bold'
                        : d.isCurrentMonth
                          ? 'text-content hover:bg-raised'
                          : 'text-slate-400/40 hover:bg-raised/40'
                  } ${d.isDisabled ? 'opacity-20 cursor-not-allowed hover:bg-transparent' : ''}`}
                  title={d.dateStr}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          {/* Action Shortcuts Footer */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-line text-xs font-bold">
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] text-slate-400 hover:text-danger hover:underline cursor-pointer"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={handleSetToday}
              className="text-[11px] font-black uppercase tracking-wider text-[var(--accent-purple)] hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Hoy</span>
              <span className="text-[9px] font-mono text-slate-400">({today.day})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

