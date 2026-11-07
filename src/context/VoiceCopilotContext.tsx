// src/context/VoiceCopilotContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import type { 
  CopilotContextMode, 
  CopilotContextData, 
  VoiceIngredientExtraction, 
  CopilotStockItem 
} from '../types/voiceCopilot';
import { getDropdownOptions } from '../utils/dataHelper';

export interface CopilotHandler {
  mode: CopilotContextMode;
  contextData: CopilotContextData;
  onApplyExtraction?: (extraction: VoiceIngredientExtraction) => void;
  onConfirmSave?: () => void;
  onClearForm?: () => void;
}

interface VoiceCopilotContextValue {
  mode: CopilotContextMode;
  setMode: (mode: CopilotContextMode) => void;
  contextData: CopilotContextData;
  applyExtraction: (extraction: VoiceIngredientExtraction) => void;
  confirmSave: () => void;
  clearForm: () => void;
  registerHandler: (id: string, handler: CopilotHandler) => () => void;
  isHandlerRegistered: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

const VoiceCopilotContext = createContext<VoiceCopilotContextValue | null>(null);

interface VoiceCopilotProviderProps {
  children: React.ReactNode;
  initialMode?: CopilotContextMode;
}

/**
 * Detects initial context mode from window.location.pathname if available
 */
function detectModeFromLocation(fallback: CopilotContextMode = 'DASHBOARD'): CopilotContextMode {
  if (typeof window === 'undefined') return fallback;
  const path = window.location.pathname.toLowerCase();
  if (path.includes('ingrediente')) return 'INGREDIENT';
  if (path.includes('producto')) return 'PRODUCT';
  if (path.includes('suministro')) return 'SUPPLY';
  if (path.includes('onboarding') || path.includes('/new') || path.includes('elemento')) return 'ONBOARDING';
  if (path.includes('inventory') || path.includes('dashboard')) return 'DASHBOARD';
  return fallback;
}

export function VoiceCopilotProvider({ children, initialMode }: VoiceCopilotProviderProps) {
  // If already inside an ancestor VoiceCopilotProvider, preserve single source of truth
  const parentContext = useContext(VoiceCopilotContext);
  if (parentContext) {
    return <>{children}</>;
  }

  const [activeMode, setActiveMode] = useState<CopilotContextMode>(() => {
    return initialMode || detectModeFromLocation('DASHBOARD');
  });

  const [isOpen, setIsOpen] = useState(false);
  const handlersMapRef = useRef<Map<string, CopilotHandler>>(new Map());
  const [, setHandlersTick] = useState(0);

  // Sync initialMode prop if changed
  useEffect(() => {
    if (initialMode && initialMode !== activeMode) {
      setActiveMode(initialMode);
    }
  }, [initialMode]);

  // Fetch reactive base database information for fallback/dashboard context
  const rawIngredients = useLiveQuery(() => db.ingredientCategories.toArray()) || [];
  const rawSupplies = useLiveQuery(() => db.supplyCategories.toArray()) || [];
  const rawMenu = useLiveQuery(() => db.menuCategories.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const inventoryItems = useLiveQuery(() => db.inventoryItems.toArray()) || [];
  const systemSettingsList = useLiveQuery(() => db.systemSettings.toArray()) || [];

  const systemSettings = useMemo(() => {
    return (systemSettingsList || []).reduce((acc: Record<string, any>, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
  }, [systemSettingsList]);

  // Combined categories
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    rawIngredients.forEach(c => set.add(c.name));
    rawSupplies.forEach(c => set.add(c.name));
    rawMenu.forEach(c => set.add(c.name));
    return Array.from(set);
  }, [rawIngredients, rawSupplies, rawMenu]);

  // Configured Units
  const configuredUnits = useMemo(() => {
    return (getDropdownOptions('UnitOfMeasure', systemSettings) || []).map((u: any) => ({
      name: typeof u === 'string' ? u : u.name || '',
      baseEquivalence: u.baseEquivalence || 1,
      baseUnit: u.baseUnit || 'g'
    }));
  }, [systemSettings]);

  // Live stock items for dashboard querying
  const currentStockItems = useMemo<CopilotStockItem[]>(() => {
    return (inventoryItems || []).map(item => ({
      id: item.id,
      name: item.name,
      stock: item.theoreticalStock ?? item.realPhysicalStock ?? 0,
      unit: item.purchaseUnit || item.countUnit || 'und',
      minLimit: item.stockMinLimit,
      category: item.category || item.supplyCategory || 'General',
      operationZone: item.operationZone
    }));
  }, [inventoryItems]);

  // Active handler registration
  const registerHandler = useCallback((id: string, handler: CopilotHandler) => {
    handlersMapRef.current.set(id, handler);
    setActiveMode(handler.mode);
    setHandlersTick(t => t + 1);

    return () => {
      handlersMapRef.current.delete(id);
      // If there are other handlers, pick the last one, otherwise revert to location/initial mode
      const remaining = Array.from(handlersMapRef.current.values());
      if (remaining.length > 0) {
        setActiveMode(remaining[remaining.length - 1].mode);
      } else {
        setActiveMode(initialMode || detectModeFromLocation('DASHBOARD'));
      }
      setHandlersTick(t => t + 1);
    };
  }, [initialMode]);

  // Get current active registered handler (most recent)
  const currentHandler = useMemo(() => {
    const list = Array.from(handlersMapRef.current.values());
    return list.length > 0 ? list[list.length - 1] : null;
  }, [handlersMapRef.current.size]);

  // Compute merged contextData
  const contextData = useMemo<CopilotContextData>(() => {
    if (currentHandler?.contextData) {
      return {
        ...currentHandler.contextData,
        mode: currentHandler.mode,
        currentStockItems: currentStockItems.length > 0 ? currentStockItems : currentHandler.contextData.currentStockItems
      };
    }

    return {
      mode: activeMode,
      existingCategories: allCategories,
      existingSuppliers: (suppliers || []).map(s => ({ id: s.id, name: s.name })),
      configuredUnits,
      currentStockItems
    };
  }, [currentHandler, activeMode, allCategories, suppliers, configuredUnits, currentStockItems]);

  const applyExtraction = useCallback((extraction: VoiceIngredientExtraction) => {
    if (currentHandler?.onApplyExtraction) {
      currentHandler.onApplyExtraction(extraction);
    }
  }, [currentHandler]);

  const confirmSave = useCallback(() => {
    if (currentHandler?.onConfirmSave) {
      currentHandler.onConfirmSave();
    }
  }, [currentHandler]);

  const clearForm = useCallback(() => {
    if (currentHandler?.onClearForm) {
      currentHandler.onClearForm();
    }
  }, [currentHandler]);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const value = useMemo<VoiceCopilotContextValue>(() => ({
    mode: currentHandler?.mode || activeMode,
    setMode: setActiveMode,
    contextData,
    applyExtraction,
    confirmSave,
    clearForm,
    registerHandler,
    isHandlerRegistered: !!currentHandler,
    isOpen,
    setIsOpen,
    toggleOpen
  }), [
    currentHandler,
    activeMode,
    contextData,
    applyExtraction,
    confirmSave,
    clearForm,
    registerHandler,
    isOpen,
    toggleOpen
  ]);

  return (
    <VoiceCopilotContext.Provider value={value}>
      {children}
    </VoiceCopilotContext.Provider>
  );
}

/**
 * Accesses the global VoiceCopilot context.
 */
export function useVoiceCopilot() {
  const context = useContext(VoiceCopilotContext);
  return context;
}

/**
 * Registers an active form (Ingredient, Product, Supply) with the global VoiceCopilotWidget.
 */
export function useVoiceCopilotRegistration(handler: CopilotHandler, enabled = true) {
  const context = useVoiceCopilot();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!context || !enabled) return;

    const id = `copilot-form-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const unregister = context.registerHandler(id, {
      mode: handlerRef.current.mode,
      contextData: handlerRef.current.contextData,
      onApplyExtraction: (ext) => handlerRef.current.onApplyExtraction?.(ext),
      onConfirmSave: () => handlerRef.current.onConfirmSave?.(),
      onClearForm: () => handlerRef.current.onClearForm?.()
    });

    return () => {
      unregister();
    };
  }, [context, enabled, handler.mode]);
}
