// src/components/ui/CategorySelector.tsx
import React, { useState, useRef, useEffect } from 'react';
import CreateCategoryModal from './CreateCategoryModal';
import { flexibleMultiMatch } from '../../utils/searchEngine';

export interface CategoryOption {
  value: string;
  label: string;
}

interface CategorySelectorProps {
  value: string;
  onChange: (value: string) => void;
  options: CategoryOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  onClear?: () => void;
  categoryType?: 'INGREDIENT' | 'PRODUCT' | 'SUPPLY';
}

export function CategorySelector({
  value,
  onChange,
  options,
  placeholder = 'Buscar categoría...',
  searchPlaceholder = 'Buscar categoría...',
  disabled = false,
  className = '',
  onClear,
  categoryType = 'INGREDIENT',
}: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const selectedOption = options.find((opt) => opt.value === value || opt.label === value);
  const displayLabel = selectedOption ? selectedOption.label : (value || '');

  const filteredOptions = options.filter((opt) =>
    flexibleMultiMatch([opt.label, opt.value], searchQuery)
  );

  const handleSelectOption = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange('');
    setSearchQuery('');
    if (onClear) onClear();
    setIsOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
  };

  const hasValue = (value !== '' && value !== null && value !== undefined) || searchQuery !== '';

  return (
    <div ref={containerRef} className="relative w-full text-left font-body">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        className={`h-11 w-full flex items-center justify-between px-3.5 rounded-sm border border-line bg-inset text-content outline-none focus:border-action focus:ring-2 focus:ring-action/25 transition-all cursor-pointer select-none text-sm ${className}`}
      >
        <span className={`truncate ${!displayLabel ? 'text-content-tertiary' : 'text-content font-semibold'}`}>
          {displayLabel || placeholder}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* Quick Clear [x] Button */}
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleClear(e);
              }}
              className="w-7 h-7 flex items-center justify-center text-content-tertiary hover:text-danger hover:bg-raised rounded-full transition-colors cursor-pointer"
              title="Limpiar categoría"
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
          {/* Top Option: + Crear Categoría */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowCreateModal(true);
              setIsOpen(false);
            }}
            className="w-full text-left p-3 text-xs hover:bg-raised font-extrabold text-content transition-colors border-b border-line flex items-center gap-1.5 cursor-pointer bg-transparent shrink-0"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            + Crear Categoría
          </button>

          {/* Search Input Box */}
          <div className="p-2.5 border-b border-line bg-canvas/60 shrink-0">
            <div className="flex items-center gap-2 bg-inset border border-line rounded-sm px-3 py-1.5 w-full">
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

          {/* Scrollable list of options */}
          <div className="overflow-y-auto flex-1 py-1 max-h-48 text-xs font-semibold">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-content-secondary italic text-center">
                No se encontraron categorías
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectOption(opt.value)}
                  className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between hover:bg-raised transition-colors border-none cursor-pointer bg-transparent ${
                    value === opt.value || displayLabel === opt.label ? 'bg-[var(--bg-selected)] text-content font-bold' : 'text-content-secondary'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {(value === opt.value || displayLabel === opt.label) && (
                    <span className="material-symbols-outlined text-content text-sm font-bold">check</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal for Creating Category Inline */}
      <CreateCategoryModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCategoryCreated={(newCat) => {
          onChange(newCat);
        }}
        categoryType={categoryType}
      />
    </div>
  );
}

export default CategorySelector;
