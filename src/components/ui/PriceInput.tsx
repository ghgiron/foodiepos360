// src/components/ui/PriceInput.tsx
import React, { useState, useEffect } from 'react';
import { formatCurrencyWithCode } from '../../utils/formatters';

export interface PriceInputProps {
  value: number | '';
  onChange: (value: number | '') => void;
  placeholder?: string;
  className?: string;
  id?: string;
  currency?: string;
  locale?: string;
}

export const PriceInput: React.FC<PriceInputProps> = ({
  value,
  onChange,
  placeholder = 'Ej. 25900',
  className = '',
  id,
  currency = 'COP',
  locale = 'es-CO'
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState(value !== '' && value !== undefined && value !== null ? String(value) : '');

  useEffect(() => {
    if (!isFocused) {
      setRawText(value !== '' && value !== undefined && value !== null ? String(value) : '');
    }
  }, [value, isFocused]);

  const displayValue = isFocused
    ? rawText
    : value !== '' && value !== undefined && value !== null
      ? formatCurrencyWithCode(value, 0, currency, locale)
      : '';

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setRawText(value !== '' && value !== undefined && value !== null ? String(value) : '');
    // Select all for clean overwriting
    setTimeout(() => {
      e.target.select();
    }, 10);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const cleaned = rawText.replace(/[^\d.]/g, '');
    if (cleaned === '') {
      onChange('');
    } else {
      const parsed = parseFloat(cleaned);
      onChange(isNaN(parsed) ? '' : parsed);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only digits and decimal separator
    const cleaned = val.replace(/[^\d.]/g, '');
    setRawText(cleaned);
    if (cleaned === '') {
      onChange('');
    } else {
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      placeholder={placeholder}
      className={`w-full px-3.5 py-2.5 rounded-sm font-bold font-mono tabular-nums text-right outline-none transition-colors bg-inset text-content border border-line placeholder:text-content-tertiary focus:ring-2 focus:ring-action/25 focus:border-action shadow-sm ${className}`}
    />
  );
};

export default PriceInput;
