// src/components/ui/MultiSelectCombobox.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check, ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectComboboxProps {
  selectedValues: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelectCombobox({
  selectedValues = [],
  onChange,
  options = [],
  placeholder = 'Seleccionar categorías...',
  searchPlaceholder = 'Buscar categoría...',
  disabled = false,
  className = ''
}: MultiSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const timer = setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const removeValue = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedValues.filter(v => v !== val));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div ref={containerRef} className="relative w-full text-left font-body">
      {/* Trigger Area */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`min-h-[44px] w-full flex items-center justify-between p-2 rounded-sm border border-line bg-inset text-content outline-none focus-within:border-action transition-all cursor-pointer select-none text-xs gap-2 ${className}`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {selectedValues.length === 0 ? (
            <span className="text-content-tertiary font-medium px-1">
              {placeholder}
            </span>
          ) : (
            selectedValues.map((val) => {
              const opt = options.find((o) => o.value === val || o.label === val);
              const label = opt ? opt.label : val;
              return (
                <span
                  key={val}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-bold bg-raised text-content border border-line shadow-sm transition-all"
                >
                  <span className="truncate max-w-[140px]">{label}</span>
                  <button
                    type="button"
                    onClick={(e) => removeValue(val, e)}
                    className="p-0.5 hover:bg-surface rounded text-content-secondary hover:text-danger transition-colors cursor-pointer border-none"
                    title="Remover"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          {selectedValues.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="p-1 text-content-tertiary hover:text-danger rounded-xs hover:bg-raised transition-colors cursor-pointer border-none"
              title="Limpiar selecciones"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-content-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[60] mt-1.5 w-full bg-surface border border-line rounded-lg shadow-lg py-2 animate-fade-in divide-y divide-line-subtle glass">
          {/* Search Header */}
          <div className="px-3 pb-2 pt-1">
            <div className="flex items-center gap-2 bg-inset px-3 py-1.5 rounded-sm border border-line">
              <Search className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
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

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = selectedValues.includes(opt.value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={`flex items-center justify-between px-3 py-2 rounded-sm text-xs font-semibold cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[var(--bg-selected)] text-content font-bold'
                        : 'text-content-secondary hover:bg-raised'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    <div
                      className={`w-4 h-4 rounded-xs border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-action border-action text-action-text'
                          : 'border-line bg-inset'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-content-secondary font-medium">
                No se encontraron categorías
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
