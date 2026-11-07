// src/hooks/useFormDirty.ts
import { useState, useCallback, useRef } from 'react';
import { useNavigate } from './useNavigate';

/**
 * Normalizes values recursively so that null, undefined, and empty string
 * compare as equal, avoiding false positive dirty states from async DB loads.
 */
export function normalizeFormValue(val: any): any {
  if (val === null || val === undefined || val === '') {
    return '';
  }
  if (typeof val === 'number') {
    return isNaN(val) ? '' : val;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(normalizeFormValue);
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    const keys = Object.keys(val).sort();
    for (const k of keys) {
      out[k] = normalizeFormValue(val[k]);
    }
    return out;
  }
  return val;
}

export function areFormValuesEqual(a: any, b: any): boolean {
  const normA = JSON.stringify(normalizeFormValue(a));
  const normB = JSON.stringify(normalizeFormValue(b));
  return normA === normB;
}

export interface UseFormDirtyOptions {
  isDirty?: boolean;
  onExitCallback?: () => void;
  destinationFallback?: string;
}

/**
 * Universal hook for tracking dirty form state, safe exit confirmation,
 * and universal navigate(-1) routing.
 */
export function useFormDirty(options?: UseFormDirtyOptions) {
  const navigate = useNavigate();
  const [isConfirmExitOpen, setIsConfirmExitOpen] = useState(false);
  const [initialSnapshot, setInitialSnapshotState] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasUserModifiedRef = useRef(false);

  const performExit = useCallback(() => {
    if (options?.onExitCallback) {
      options.onExitCallback();
    } else {
      navigate(-1);
    }
  }, [navigate, options]);

  const setInitialSnapshot = useCallback((data: any) => {
    setInitialSnapshotState(data);
    setIsInitialized(true);
    hasUserModifiedRef.current = false;
  }, []);

  const markUserTouched = useCallback(() => {
    hasUserModifiedRef.current = true;
  }, []);

  const checkIsDirty = useCallback((currentData: any): boolean => {
    if (options?.isDirty !== undefined) {
      return options.isDirty;
    }
    if (!isInitialized || initialSnapshot === null) {
      return false;
    }
    return !areFormValuesEqual(currentData, initialSnapshot);
  }, [isInitialized, initialSnapshot, options?.isDirty]);

  const handleSafeExit = useCallback((customIsDirty?: boolean) => {
    const dirty = customIsDirty !== undefined ? customIsDirty : (options?.isDirty ?? false);
    if (dirty) {
      setIsConfirmExitOpen(true);
    } else {
      performExit();
    }
  }, [options?.isDirty, performExit]);

  // Modal actions
  const cancelExit = useCallback(() => {
    setIsConfirmExitOpen(false);
  }, []);

  const confirmExit = useCallback(() => {
    setIsConfirmExitOpen(false);
    performExit();
  }, [performExit]);

  return {
    isConfirmExitOpen,
    setIsConfirmExitOpen,
    showDiscardModal: isConfirmExitOpen,
    setShowDiscardModal: setIsConfirmExitOpen,
    handleSafeExit,
    confirmExit,
    cancelExit,
    setInitialSnapshot,
    markUserTouched,
    checkIsDirty,
    performExit
  };
}

export default useFormDirty;
