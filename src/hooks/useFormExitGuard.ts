// src/hooks/useFormExitGuard.ts
import { useState, useCallback } from 'react';
import { useNavigate } from './useNavigate';

export interface UseFormExitGuardOptions {
  isDirty: boolean;
  destination?: string;
  onExitCallback?: () => void;
}

export function useFormExitGuard({ isDirty, destination: _destination = '/inventory', onExitCallback }: UseFormExitGuardOptions) {
  const navigate = useNavigate();
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const performExit = useCallback(() => {
    if (onExitCallback) {
      onExitCallback();
    } else {
      navigate(-1);
    }
  }, [navigate, onExitCallback]);

  const handleSafeExit = useCallback(() => {
    if (isDirty) {
      setShowDiscardModal(true);
    } else {
      performExit();
    }
  }, [isDirty, performExit]);

  const confirmExit = useCallback(() => {
    setShowDiscardModal(false);
    performExit();
  }, [performExit]);

  const cancelExit = useCallback(() => {
    setShowDiscardModal(false);
  }, []);

  return {
    showDiscardModal,
    setShowDiscardModal,
    isConfirmExitOpen: showDiscardModal,
    setIsConfirmExitOpen: setShowDiscardModal,
    handleSafeExit,
    confirmExit,
    cancelExit,
    performExit
  };
}

export default useFormExitGuard;
