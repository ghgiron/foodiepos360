import { useState, useRef, useEffect } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  onClear?: () => void;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Seleccione...',
  searchPlaceholder = 'Buscar...',
  disabled = false,
  className = '',
  onClear,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

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

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectOption = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    if (onClear) onClear();
  };

  const showSearch = options.length > 5;
  const hasValue = value !== '' && value !== null && value !== undefined;

  return (
    <div ref={containerRef} className="relative w-full text-left font-body">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        className={`h-11 w-full flex items-center justify-between px-3.5 rounded-sm border border-line bg-inset text-content outline-none focus:border-action focus:ring-2 focus:ring-action/25 transition-all cursor-pointer select-none text-sm ${className}`}
      >
        <span className={`truncate ${!selectedOption ? 'text-content-tertiary' : 'text-content font-semibold'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* Quick Clear 'X' Button */}
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="w-8 h-8 flex items-center justify-center text-content-tertiary hover:text-danger hover:bg-raised rounded-sm transition-colors cursor-pointer"
              title="Limpiar selección"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </span>
          )}

          {/* Chevron Icon */}
          <span className="material-symbols-outlined text-content-secondary select-none text-lg leading-none">
            {isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
          </span>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-2 z-[9999] min-w-full w-full rounded-sm border border-line bg-surface shadow-lg flex flex-col overflow-hidden text-content glass"
          style={{ maxHeight: '300px' }}
        >
          {/* Search Input Box */}
          {showSearch && (
            <div className="p-2.5 border-b border-line bg-canvas/60 shrink-0">
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
                {searchQuery !== '' && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-content-tertiary hover:text-content border-none bg-transparent cursor-pointer p-0.5"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                )}
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
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectOption(opt.value)}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-raised transition-colors border-none cursor-pointer text-xs ${
                      isSelected ? 'bg-[var(--bg-selected)] text-content font-bold' : 'text-content-secondary'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
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

export default Combobox;
