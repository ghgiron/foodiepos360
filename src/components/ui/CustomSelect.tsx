import { useState, useRef, useEffect } from 'react';

export interface CustomSelectOption {
  value: string;
  label: string;
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
  placeholder = 'Seleccione una opción...',
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

  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options dynamically
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
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
        className={`w-full flex items-center justify-between transition-all cursor-pointer select-none ${className}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <span className="material-symbols-outlined text-slate-400 select-none text-lg leading-none">
          {isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-2 z-[9999] rounded-xl border border-[rgba(143,99,244,0.2)] bg-[var(--card-white)] dark:bg-[var(--card-dark)] backdrop-blur-[14px] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-white"
          style={{ maxHeight: '300px' }}
        >
          {/* Search Input Box */}
          {showSearch && (
            <div className="p-2.5 border-b border-[rgba(143,99,244,0.15)] bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[var(--bg-app)] border border-slate-200/60 dark:border-slate-800/80 rounded-lg px-2.5 py-1.5 w-full">
                <span className="material-symbols-outlined text-slate-400 text-xs select-none">search</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="bg-transparent border-none outline-none text-xs w-full font-semibold placeholder-slate-500 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Scrollable list of options */}
          <div className="overflow-y-auto flex-1 py-1 max-h-48 text-xs font-semibold">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-slate-500 dark:text-slate-400 italic text-center">
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
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors border-none cursor-pointer ${
                      isSelected ? 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] font-bold' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-sm text-[var(--accent-purple)] font-bold select-none leading-none">
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
