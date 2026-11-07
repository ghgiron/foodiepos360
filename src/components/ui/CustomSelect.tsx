import { useState, useRef, useEffect } from 'react';
import { normalizeUnit } from '../../services/excelImportService';
import { flexibleMultiMatch } from '../../utils/searchEngine';

export interface CustomSelectOption {
  value: string;
  label: string;
  id?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccione...',
  disabled = false,
  className = '',
  searchPlaceholder = 'Buscar...',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Toggle dropdown visibility
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Autofocus the search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const valStr = String(value || '');
  const valLower = valStr.trim().toLowerCase();

  const selectedOption = 
    options.find((opt) => opt.value === value) ||
    options.find((opt) => opt.id && opt.id === value) ||
    (valLower ? options.find((opt) => opt.value.toLowerCase() === valLower) : undefined) ||
    (valLower ? options.find((opt) => opt.id?.toLowerCase() === valLower) : undefined) ||
    (valLower ? options.find((opt) => opt.label.toLowerCase() === valLower) : undefined) ||
    (valLower ? options.find((opt) => {
      try {
        const normVal = normalizeUnit(valStr);
        const normOpt = normalizeUnit(opt.value || opt.label);
        return Boolean(normVal && normOpt && normVal === normOpt);
      } catch {
        return false;
      }
    }) : undefined);

  // Filter options dynamically with flexibleMultiMatch
  const filteredOptions = options.filter((opt) =>
    flexibleMultiMatch([opt.label, opt.value], searchQuery)
  );

  const handleSelectOption = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  // Render search filter input if options list exceeds 5 choices
  const showSearch = options.length > 5;

  return (
    <div ref={containerRef} className="relative w-full text-left font-body">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        className={`h-11 w-full flex items-center justify-between px-3.5 py-2.5 rounded-sm border border-line bg-inset text-content text-sm outline-none focus:ring-2 focus:ring-action/25 focus:border-action transition-colors cursor-pointer select-none ${className}`}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0 flex items-center">{selectedOption.icon}</span>}
          <span className={`truncate ${!selectedOption ? 'text-content-tertiary' : 'text-content font-semibold'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* Quick Clear 'X' Button */}
          {value !== '' && value !== null && value !== undefined && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="w-6 h-6 flex items-center justify-center text-content-tertiary hover:text-danger hover:bg-raised rounded-xs transition-colors cursor-pointer"
              title="Limpiar selección"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </span>
          )}

          <span className="material-symbols-outlined text-content-secondary select-none text-lg leading-none">
            {isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
          </span>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1.5 z-[9999] min-w-full w-full rounded-sm border border-line bg-surface shadow-lg flex flex-col overflow-hidden text-content glass"
          style={{ maxHeight: '300px' }}
        >
          {/* Search Input Box */}
          {showSearch && (
            <div className="p-2 border-b border-line bg-canvas/60 shrink-0">
              <div className="flex items-center gap-2 bg-inset border border-line rounded-sm px-2.5 py-1.5 w-full">
                <span className="material-symbols-outlined text-content-tertiary text-xs select-none">search</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder:text-content-tertiary text-content"
                />
              </div>
            </div>
          )}

          {/* Scrollable list of options */}
          <div className="overflow-y-auto flex-1 py-1 max-h-48 text-xs font-semibold">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-content-secondary italic text-center">
                No se encontraron resultados
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedOption ? (opt.value === selectedOption.value) : (opt.value === value);
                return (
                  <button
                    key={opt.id || opt.value}
                    type="button"
                    onClick={() => handleSelectOption(opt.value)}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-raised transition-colors border-none cursor-pointer ${
                      isSelected ? 'bg-[var(--bg-selected)] text-content font-bold' : 'text-content-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined text-sm text-content font-bold select-none leading-none">
                        check
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
