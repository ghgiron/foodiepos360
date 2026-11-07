// src/components/voice/VoiceCopilotWidget.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Bot, X, PlusCircle } from 'lucide-react';
import { 
  isVoiceFeedbackEnabled,
  setVoiceFeedbackEnabled,
  getGeminiApiKey
} from '../../utils/geminiConfig';
import { 
  processVoicePromptWithGroq, 
  getGroqApiKey,
  resolveGroqApiKey 
} from '../../services/groqCopilotService';
import { processAiCopilotPrompt } from '../../services/aiProviderService';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import type { 
  VoiceIngredientExtraction, 
  CopilotMessage, 
  CopilotContextData,
  CopilotContextMode 
} from '../../types/voiceCopilot';
import { formatCurrency } from '../../utils/formatters';
import { useVoiceCopilot } from '../../context/VoiceCopilotContext';
import { db, enqueueOfflineEvent } from '../../db/localDb';
import { syncRecordToFirestore } from '../../services/syncService';
import { pushNavigationState } from '../../utils/navigation';
import { findMatchingInventoryItem, calculateRestockMetrics } from '../../utils/inventoryMatching';
import type { InventoryItem, InventoryLog } from '../../types';
import toast from 'react-hot-toast';

interface VoiceCopilotWidgetProps {
  contextData?: CopilotContextData;
  onApplyExtraction?: (extraction: VoiceIngredientExtraction) => void;
  onConfirmSave?: () => void;
  onClearForm?: () => void;
  mode?: CopilotContextMode;
}

export default function VoiceCopilotWidget({
  contextData,
  onApplyExtraction,
  onConfirmSave,
  onClearForm,
  mode
}: VoiceCopilotWidgetProps = {}) {
  const globalCopilot = useVoiceCopilot();

  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isOpen = globalCopilot ? globalCopilot.isOpen : localIsOpen;
  const setIsOpen = globalCopilot ? globalCopilot.setIsOpen : setLocalIsOpen;

  const [isMinimized, setIsMinimized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');
  const [voiceMuted, setVoiceMuted] = useState(!isVoiceFeedbackEnabled());
  const [latestExtraction, setLatestExtraction] = useState<VoiceIngredientExtraction | null>(null);

  // Restore expansion whenever reopened from header
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
    }
  }, [isOpen]);

  // Fallback defaults if context is not present
  const effectiveMode: CopilotContextMode = 
    mode || contextData?.mode || globalCopilot?.mode || 'DASHBOARD';

  const effectiveContextData: CopilotContextData = useMemo(() => {
    return contextData || globalCopilot?.contextData || {
      mode: effectiveMode,
      existingCategories: [],
      existingSuppliers: [],
      configuredUnits: []
    };
  }, [contextData, globalCopilot?.contextData, effectiveMode]);

  const handleApplyExtraction = onApplyExtraction || globalCopilot?.applyExtraction;
  const handleConfirmSave = onConfirmSave || globalCopilot?.confirmSave;
  const handleClearForm = onClearForm || globalCopilot?.clearForm;

  // Mode Metadata: title, icon, badge, welcome prompt, and quick chips for Foodie Bot
  const modeMetadata = useMemo(() => {
    switch (effectiveMode) {
      case 'PRODUCT':
        return {
          title: 'Producto Único',
          badge: 'Venta Directa',
          icon: 'liquor',
          welcomeText: '¡Hola! Soy Foodie Bot, tu copiloto para Producto Único de venta directa. Menciona tus artículos (ej. "Compré 24 cervezas a $60.000 en Bavaria").',
          quickPrompts: [
            'Compré 24 cervezas a $60.000 en Bavaria',
            'Cerveza Corona venta 12.000 costo 4.500 en Licores',
            'Agua mineral 300ml venta 5000 costo 1800',
            '24 latas de Red Bull a 120.000 con venta a 10.000'
          ]
        };
      case 'SUPPLY':
        return {
          title: 'Suministro / Empaque',
          badge: 'Insumo Operativo',
          icon: 'inventory',
          welcomeText: '¡Hola! Soy Foodie Bot, tu copiloto de suministros y empaques. Menciona tus artículos (ej. "Compré 200 cajas para hamburguesa a $40.000").',
          quickPrompts: [
            'Compré 200 cajas para hamburguesa a $40.000',
            'Paquete 100 vasos biodegradables 12oz a 28000',
            'Bolsas kraft delivery por 50 a 15000',
            'Servilletas ecológicas bulto a 45000'
          ]
        };
      case 'ONBOARDING':
        return {
          title: 'Nuevo Elemento',
          badge: 'Alta en Inventario',
          icon: 'add_circle',
          welcomeText: '¡Hola Chef! Soy Foodie Bot. Te asisto para dar de alta ingredientes, productos de venta directa o suministros con registro Zero-Form.',
          quickPrompts: [
            'Compré 130g de ajo a $2000, usamos 120g',
            'Compré 24 cervezas a $60.000 en Bavaria',
            'Compré 200 cajas para hamburguesa a $40.000',
            '30 unidades de huevos a $18.000'
          ]
        };
      case 'DASHBOARD':
        return {
          title: 'Control de Inventario',
          badge: 'Zero-Form & Stock',
          icon: 'analytics',
          welcomeText: '¡Hola Chef! Soy Foodie Bot. Registra ingredientes, productos o suministros directamente, o consulta existencias de stock.',
          quickPrompts: [
            'Compré 130g de ajo a $2000, usamos 120g',
            'Compré 24 cervezas a $60.000 en Bavaria',
            'Compré 200 cajas para hamburguesa a $40.000',
            '30 unidades de huevos a $18.000'
          ]
        };
      case 'INGREDIENT':
      default:
        return {
          title: 'Ingrediente Culinario',
          badge: 'Costeo & Merma',
          icon: 'eco',
          welcomeText: '¡Hola Chef! Soy Foodie Bot, tu copiloto culinario. Dicta o escribe tus compras para registrarlas directamente en inventario.',
          quickPrompts: [
            'Compré 130g de ajo a $2000, usamos 120g',
            'Compré 5 kilos de Lomo Fino a 140.000 de Carnes San Martín con 12% de merma',
            'Botella Ginebra Tanqueray 750ml a 95.000, usamos en onzas',
            'Bolsa 400g de Gulupa a 6000 pesos de Fruver'
          ]
        };
    }
  }, [effectiveMode]);

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome-init',
      sender: 'assistant',
      text: modeMetadata.welcomeText,
      timestamp: Date.now()
    }
  ]);

  const [showCheatSheet, setShowCheatSheet] = useState(false);

  // Helper to copy template into input and focus without auto-submitting
  const handleSelectExamplePrompt = (exampleText: string) => {
    setTypedMessage(exampleText);
    if (inputRef.current) {
      inputRef.current.focus();
    }
    toast('Plantilla copiada al campo de texto', { icon: '✍️', duration: 2500 });
  };

  // Contextual Example Chips prioritized by current active module
  const contextualExampleChips = useMemo(() => {
    switch (effectiveMode) {
      case 'PRODUCT':
        return [
          { prompt: 'Compré 24 cervezas a $60.000 en Bavaria', label: 'Cervezas en pack', icon: 'local_bar' },
          { prompt: 'Cerveza Corona venta 12.000 costo 4.500 en Licores', label: 'PVP y Costo', icon: 'sell' },
          { prompt: 'Agua mineral 300ml venta 5000 costo 1800', label: 'Bebida individual', icon: 'water_drop' },
          { prompt: '24 latas de Red Bull a 120.000 con venta a 10.000', label: 'Pack energético', icon: 'bolt' }
        ];
      case 'SUPPLY':
        return [
          { prompt: 'Compré 200 cajas para hamburguesa a $40.000', label: 'Cajas delivery', icon: 'inventory_2' },
          { prompt: 'Paquete 100 vasos biodegradables 12oz a 28000', label: 'Vasos descartables', icon: 'local_cafe' },
          { prompt: 'Bolsas kraft delivery por 50 a 15000', label: 'Bolsas empaque', icon: 'shopping_bag' },
          { prompt: 'Servilletas ecológicas bulto a 45000', label: 'Servilletas bulto', icon: 'cleaning_services' }
        ];
      case 'INGREDIENT':
        return [
          { prompt: 'Compré 130g de ajo a $2000, usamos 120g', label: 'Materia prima y uso', icon: 'eco' },
          { prompt: '5 kilos de Lomo Fino a 140.000 de Carnes San Martín con 12% de merma', label: 'Carne con merma', icon: 'restaurant' },
          { prompt: 'Botella Ginebra Tanqueray 750ml a 95.000, usamos en onzas', label: 'Botella en onzas', icon: 'liquor' },
          { prompt: 'Bolsa 400g de Gulupa a 6000 pesos de Fruver', label: 'Fruta por bolsa', icon: 'nutrition' }
        ];
      case 'DASHBOARD':
      case 'ONBOARDING':
      default:
        return [
          { prompt: 'Compré 130g de ajo a $2000, usamos 120g', label: 'Ingrediente culinario', icon: 'eco' },
          { prompt: 'Compré 24 cervezas a $60.000 en Bavaria', label: 'Producto venta directa', icon: 'local_bar' },
          { prompt: 'Compré 200 cajas para hamburguesa a $40.000', label: 'Suministro / empaque', icon: 'inventory_2' },
          { prompt: '30 unidades de huevos a $18.000', label: 'Compra directa sin formulario', icon: 'egg' }
        ];
    }
  }, [effectiveMode]);

  // Update initial message when mode changes (if user hasn't messaged yet)
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].id.startsWith('welcome-')) {
        return [{
          id: `welcome-${effectiveMode}-${Date.now()}`,
          sender: 'assistant',
          text: modeMetadata.welcomeText,
          timestamp: Date.now()
        }];
      }
      return prev;
    });
  }, [effectiveMode, modeMetadata.welcomeText]);

  // Container ref for chat messages
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollChatToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollChatToBottom();
      const timer = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMinimized, messages, scrollChatToBottom]);

  // Keyboard shortcut: close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Synchronize AI keys dynamically when updated from SettingsPanel
  useEffect(() => {
    const handleKeyUpdated = () => {
      resolveGroqApiKey().catch(() => {});
    };
    window.addEventListener('foodie-ai-key-updated', handleKeyUpdated);
    return () => window.removeEventListener('foodie-ai-key-updated', handleKeyUpdated);
  }, []);

  // Handle final user speech from recognition
  const handleFinalSpeech = useCallback((speechText: string) => {
    if (!speechText || !speechText.trim()) return;
    handleSendMessage(speechText.trim());
  }, []);

  const {
    isListening,
    interimTranscript,
    isSupported,
    audioLevel,
    isSpeaking,
    stopListening,
    toggleListening,
    speakText,
    stopSpeaking
  } = useVoiceRecognition({
    onFinalTranscript: handleFinalSpeech,
    silenceTimeoutMs: 1600
  });

  // Toggle voice feedback
  const handleToggleVoiceMute = () => {
    const next = !voiceMuted;
    setVoiceMuted(next);
    setVoiceFeedbackEnabled(!next);
    if (next) {
      stopSpeaking();
    }
  };

  // Helper to sanitize numeric inputs from voice/text extraction
  const sanitizeNumber = (val: any, fallback = 0): number => {
    if (val === null || val === undefined || val === '') return fallback;
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    const cleaned = Number(String(val).replace(/[^0-9.-]+/g, ''));
    return isNaN(cleaned) ? fallback : cleaned;
  };

  // Direct Save handler: Zero-Form direct background registration into Dexie.js and domainOutbox
  const handleDirectSave = async (extraction: VoiceIngredientExtraction) => {
    if (!extraction) {
      toast.error('No hay datos válidos para registrar en el inventario.');
      return;
    }

    const rawName = (extraction.name || 'Nuevo Ingreso').trim();

    try {
      const currentBranchId = (contextData as any)?.branchId || 'main';
      const totalQty = sanitizeNumber(extraction.purchase_quantity, 1);
      const mult = sanitizeNumber(extraction.conversion_multiplier, 1);
      const totalStock = totalQty * mult;
      const cleanPurchasePrice = sanitizeNumber(extraction.purchase_price, 0);
      const cleanSalePrice = extraction.sale_price !== undefined ? sanitizeNumber(extraction.sale_price, 0) : undefined;
      const isProduct = effectiveMode === 'PRODUCT' || (cleanSalePrice !== undefined && cleanSalePrice > 0);
      const isSupply = effectiveMode === 'SUPPLY' || extraction.package_units !== undefined;

      // Auto-link or auto-create supplier if named
      let finalSupplierId = extraction.supplier_id || 'prov-generic';
      if (extraction.supplier_name && extraction.supplier_name.trim()) {
        const cleanSupName = extraction.supplier_name.trim();
        const existingSupplier = await db.suppliers
          .filter(s => (s.name || '').trim().toLowerCase() === cleanSupName.toLowerCase())
          .first();
        if (existingSupplier) {
          finalSupplierId = existingSupplier.id;
        } else {
          finalSupplierId = `prov-${Date.now()}`;
          await db.suppliers.put({
            id: finalSupplierId,
            name: cleanSupName,
            contact: 'Contacto comercial',
            email: '',
            paymentTerms: 'Contado',
            categoriesSupplied: extraction.category ? [extraction.category] : [],
            updatedAt: new Date().toISOString()
          });
        }
      }

      // Check if existing item via extraction.existing_match or search in db
      let existing: InventoryItem | null | undefined = null;
      if (extraction.existing_match?.id) {
        existing = await db.inventoryItems.get(extraction.existing_match.id);
      }
      if (!existing && rawName) {
        const allItems = await db.inventoryItems.toArray();
        existing = findMatchingInventoryItem(rawName, allItems);
      }

      if (existing) {
        // --- 1. RESTOCK TRANSACTION (Reabastecimiento de Existencias) ---
        const matchMetrics = extraction.existing_match || calculateRestockMetrics(existing, extraction);
        const addedStock = matchMetrics.addedStock;
        const newStock = matchMetrics.newCalculatedStock;
        const newUnitCost = matchMetrics.newUnitCost;
        const weightedCost = matchMetrics.weightedAverageCost;

        let updatedSucursalStock = existing.sucursalStock ? [...existing.sucursalStock] : [];
        const targetBranchId = currentBranchId || existing.branchId || 'main';
        const branchIdx = updatedSucursalStock.findIndex(
          s => s.sucursalId === targetBranchId || s.sucursalId === 'sede-principal' || s.sucursalId === 'main'
        );
        if (branchIdx >= 0) {
          updatedSucursalStock[branchIdx] = {
            ...updatedSucursalStock[branchIdx],
            stockActual: sanitizeNumber(updatedSucursalStock[branchIdx].stockActual, 0) + addedStock
          };
        } else {
          updatedSucursalStock.push({
            sucursalId: targetBranchId,
            stockActual: newStock,
            batchObservations: 'Reabastecimiento vía Foodie Bot'
          });
        }

        const updatedItem: InventoryItem = {
          ...existing,
          supplierId: (finalSupplierId !== 'prov-generic') ? finalSupplierId : existing.supplierId,
          purchaseCost: newUnitCost,
          lastPurchasePrice: newUnitCost,
          averagePrice: weightedCost,
          theoreticalStock: newStock,
          realPhysicalStock: sanitizeNumber(existing.realPhysicalStock, 0) + addedStock,
          resourceType: existing.resourceType || 'INVENTORY_ITEM',
          branchId: existing.branchId || currentBranchId,
          updatedAt: Date.now(),
          sucursalStock: updatedSucursalStock
        };
        await db.inventoryItems.put(updatedItem);

        // Audit Log in db.inventoryLogs
        const movementId = `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const logEntry: InventoryLog = {
          id: movementId,
          itemId: existing.id,
          itemName: existing.name,
          type: 'PURCHASE',
          quantity: totalQty,
          unitPrice: newUnitCost,
          total: cleanPurchasePrice || (newUnitCost * totalQty),
          supplierId: finalSupplierId,
          previousCost: matchMetrics.previousCost,
          newCost: newUnitCost,
          reason: `Reabastecimiento vía Foodie Bot (+${totalQty} ${extraction.purchase_unit || existing.purchaseUnit})`,
          user: 'Foodie Bot',
          timestamp: new Date().toISOString(),
          synced: false
        };
        await db.inventoryLogs.add(logEntry);

        // Enqueue to domainOutbox (sync_outbox) for Firestore replication
        await enqueueOfflineEvent('InventoryItemUpdated', {
          collectionName: 'inventoryItems',
          docId: updatedItem.id,
          data: updatedItem,
          timestamp: Date.now()
        });

        await enqueueOfflineEvent('InventoryMovementCreated', {
          collectionName: 'inventoryLogs',
          docId: logEntry.id,
          data: logEntry,
          timestamp: Date.now()
        });

        try {
          await syncRecordToFirestore('inventoryItems', updatedItem.id, updatedItem);
          await syncRecordToFirestore('inventoryLogs', logEntry.id, logEntry);
        } catch (syncErr) {
          console.warn('[Foodie Bot] Direct Firestore sync deferred to outbox:', syncErr);
        }

        toast.success(`Entrada registrada: +${totalQty} ${extraction.purchase_unit || existing.purchaseUnit} a "${existing.name}"`, {
          icon: '📦',
          duration: 3500
        });

        // Reset bot extraction state & append positive confirmation message ready for next item
        setLatestExtraction(null);
        const friendlyNotice = `✅ ¡Entrada registrada! Se han sumado +${totalQty} ${extraction.purchase_unit || existing.purchaseUnit} a "${existing.name}". Stock actual: ${newStock}. Costo ponderado: ${formatCurrency(weightedCost)}. Estoy listo para el siguiente elemento.`;
        setMessages(prev => [
          ...prev,
          {
            id: `saved-${Date.now()}`,
            sender: 'assistant',
            text: friendlyNotice,
            timestamp: Date.now()
          }
        ]);

        if (!voiceMuted) {
          speakText(`Entrada registrada con éxito para ${existing.name}.`);
        }
      } else {
        // --- 2. NEW ITEM CREATION (Alta desde cero) ---
        const purchaseUnit = extraction.purchase_unit || (isProduct ? 'Unidad' : 'Kilogramo');
        const countUnit = extraction.use_unit || (purchaseUnit === 'Kilogramo' ? 'g' : purchaseUnit === 'Litro' ? 'ml' : 'unidad');
        const unitCost = (cleanPurchasePrice > 0 && totalQty > 0) ? Math.round(cleanPurchasePrice / totalQty) : cleanPurchasePrice;

        const newItemId = extraction.id || (
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        );

        const newItem: InventoryItem = {
          id: newItemId,
          name: rawName,
          category: extraction.category || (isProduct ? 'Bebidas' : isSupply ? 'Desechables' : 'Proteínas'),
          purchaseUnit,
          countUnit,
          conversionMultiplier: mult,
          yieldFactor: 1.0,
          density: sanitizeNumber(extraction.density, 1.0),
          bottleTareWeightGrams: sanitizeNumber(extraction.bottle_tare_weight, 0),
          purchaseCost: unitCost,
          lastPurchasePrice: unitCost,
          averagePrice: unitCost,
          gainPercentage: (cleanSalePrice && unitCost) ? Math.max(0, Math.round(((cleanSalePrice - unitCost) / cleanSalePrice) * 100)) : 0,
          sellPrice: cleanSalePrice,
          isTaxable: false,
          taxPercentage: 0,
          stockMinLimit: sanitizeNumber(extraction.stock_min_limit, 5),
          stockMaxLimit: extraction.stock_max_limit !== undefined ? sanitizeNumber(extraction.stock_max_limit, 0) : undefined,
          theoreticalStock: totalStock,
          realPhysicalStock: totalStock,
          abcClassification: 'B',
          supplierId: finalSupplierId,
          branchId: currentBranchId,
          resourceType: 'INVENTORY_ITEM',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sucursalStock: [
            {
              sucursalId: currentBranchId,
              stockActual: totalStock,
              batchObservations: 'Alta inicial vía Foodie Bot'
            }
          ],
          inventoryType: 'CONSUMABLE',
          description: extraction.description || 'Alta directa por Foodie Bot (Zero-Form)',
          showInOnlineStore: isProduct,
          isActive: true,
          activo_catalogo: isProduct,
          visible_tienda_online: isProduct,
          cantidadComprada: totalQty,
          cantidadUtilizable: extraction.usable_quantity !== undefined ? sanitizeNumber(extraction.usable_quantity, totalStock) : totalStock,
          usable_quantity: extraction.usable_quantity !== undefined ? sanitizeNumber(extraction.usable_quantity, totalStock) : totalStock,
          equivalencia: mult,
          mermaPercentage: sanitizeNumber(extraction.waste_percentage, 0)
        };

        await db.inventoryItems.add(newItem);

        // Audit Log in db.inventoryLogs
        const movementId = `mov-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const logEntry: InventoryLog = {
          id: movementId,
          itemId: newItem.id,
          itemName: newItem.name,
          type: 'PURCHASE',
          quantity: totalQty,
          unitPrice: unitCost,
          total: cleanPurchasePrice,
          supplierId: finalSupplierId,
          previousCost: 0,
          newCost: unitCost,
          reason: 'Alta inicial en inventario vía Foodie Bot',
          user: 'Foodie Bot',
          timestamp: new Date().toISOString(),
          synced: false
        };
        await db.inventoryLogs.add(logEntry);

        // Enqueue to domainOutbox (sync_outbox) for Firestore replication
        await enqueueOfflineEvent('InventoryItemCreated', {
          collectionName: 'inventoryItems',
          docId: newItem.id,
          data: newItem,
          timestamp: Date.now()
        });

        await enqueueOfflineEvent('InventoryMovementCreated', {
          collectionName: 'inventoryLogs',
          docId: logEntry.id,
          data: logEntry,
          timestamp: Date.now()
        });

        try {
          await syncRecordToFirestore('inventoryItems', newItem.id, newItem);
          await syncRecordToFirestore('inventoryLogs', logEntry.id, logEntry);
        } catch (syncErr) {
          console.warn('[Foodie Bot] Direct Firestore sync deferred to outbox:', syncErr);
        }

        toast.success(`"${rawName}" guardado en el inventario exitosamente`, {
          icon: '✅',
          duration: 3500
        });

        // Reset bot extraction state & append positive confirmation message ready for next item
        setLatestExtraction(null);
        const friendlyNotice = `✅ ¡Guardado! "${rawName}" ha sido dado de alta en el inventario. Estoy listo para el siguiente elemento.`;
        setMessages(prev => [
          ...prev,
          {
            id: `saved-${Date.now()}`,
            sender: 'assistant',
            text: friendlyNotice,
            timestamp: Date.now()
          }
        ]);

        if (!voiceMuted) {
          speakText(`Elemento ${rawName} guardado en el inventario.`);
        }
      }

      // If active form callback is provided, invoke it
      if (handleConfirmSave) {
        try {
          handleConfirmSave();
        } catch {}
      }
    } catch (err: any) {
      console.error('Detalle error guardado Dexie:', err);
      toast.error('Error: ' + (err?.message || String(err)));
    }
  };

  // Prefilled Form Navigation handler: navigates to appropriate form route passing prefillData in state
  const handleOpenFormWithPrefill = (extraction: VoiceIngredientExtraction) => {
    let target: 'INGREDIENT' | 'PRODUCT' | 'SUPPLY' = 'INGREDIENT';
    let path = '/inventory/ingredient/new';

    if (effectiveMode === 'PRODUCT' || (extraction.sale_price !== undefined && extraction.sale_price > 0)) {
      target = 'PRODUCT';
      path = '/inventory/product/new';
    } else if (effectiveMode === 'SUPPLY' || extraction.package_units !== undefined) {
      target = 'SUPPLY';
      path = '/inventory/supply/new';
    }

    // 1. Contextual browser history push with prefillData state
    pushNavigationState(path, {
      prefillData: extraction,
      target
    });

    // 2. Dispatch custom event for immediate tab/form routing
    window.dispatchEvent(new CustomEvent('copilot-navigate', {
      detail: {
        target,
        prefillData: extraction
      }
    }));

    // 3. If matching form is already open, apply extraction directly
    if (handleApplyExtraction) {
      handleApplyExtraction(extraction);
    }

    toast.success(`Abriendo formulario de ${target === 'PRODUCT' ? 'Producto Único' : target === 'SUPPLY' ? 'Suministro' : 'Ingrediente'} con datos prellenados`, {
      icon: '📝',
      duration: 3000
    });
  };

  // Discard / Cancel current draft handler
  const handleCancelDraft = () => {
    setLatestExtraction(null);
    const cancelMsg: CopilotMessage = {
      id: `cancel-${Date.now()}`,
      sender: 'assistant',
      text: '❌ Operación cancelada. El chat está listo para recibir una nueva orden.',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, cancelMsg]);
    toast('Operación cancelada', { icon: '🛑' });
  };

  // Converts an active restock draft to a NEW_ITEM draft with the exact dictated name
  const handleConvertToNewItem = (msgId?: string, extractionToConvert?: VoiceIngredientExtraction) => {
    const baseExtraction = extractionToConvert || latestExtraction;
    if (!baseExtraction) return;

    const exactName = baseExtraction.name || baseExtraction.existing_match?.name || 'Nuevo Producto';
    
    const converted: VoiceIngredientExtraction = {
      ...baseExtraction,
      name: exactName,
      intent_type: 'NEW_ITEM',
      existing_match: undefined,
      is_complete: Boolean(exactName && (baseExtraction.purchase_price || 0) > 0),
      follow_up_question: `Convertido a nuevo producto independiente: "${exactName}".`,
      query_response: `He preparado el alta de "${exactName}" como referencia nueva:`
    };

    setLatestExtraction(converted);

    setMessages(prev => prev.map(m => {
      if ((msgId && m.id === msgId) || (!msgId && m.extraction && m.extraction.intent_type === 'RESTOCK')) {
        return {
          ...m,
          text: `He preparado el alta de "${exactName}" como referencia nueva:`,
          extraction: converted
        };
      }
      return m;
    }));

    if (handleApplyExtraction) {
      handleApplyExtraction(converted);
    }

    toast.success(`Convertido a nuevo producto: "${exactName}"`, {
      icon: '✨'
    });
  };

  // Open Settings handler
  const handleOpenSettings = () => {
    window.dispatchEvent(new CustomEvent('copilot-navigate', {
      detail: { target: 'SETTINGS' }
    }));
    window.dispatchEvent(new CustomEvent('open-settings'));
    toast('Abriendo Ajustes del Sistema...', { icon: '⚙️', duration: 2500 });
  };

  // Main processing pipeline powered by Groq Cloud (Llama 3.3 / Llama 3.1)
  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    // Instant Zero-Latency Affirmative response check ("sí", "confirmar", "dale", "guardar", "guárdalo")
    const isAffirmative = /^(s[íi]|confirmar|confirmo|guardar|gu[áa]rdalo|dale|listo|de acuerdo|adelante|ok|yes)$/i.test(trimmed);
    if (isAffirmative && latestExtraction) {
      stopListening();
      const userMsg: CopilotMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, userMsg]);
      setTypedMessage('');
      await handleDirectSave(latestExtraction);
      return;
    }

    // Verify key existence with priority: Groq (localStorage -> Vite env -> Dexie) or Gemini fallback
    let groqKey = getGroqApiKey();
    if (!groqKey) {
      groqKey = await resolveGroqApiKey();
    }
    const geminiKey = getGeminiApiKey();

    if (!groqKey && !geminiKey) {
      stopListening();
      const userMsg: CopilotMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: Date.now()
      };
      const guidedMsg: CopilotMessage = {
        id: `no-groq-key-${Date.now()}`,
        sender: 'assistant',
        text: '🔑 **No se encontró una API Key de Groq Cloud configurada.**\n\nPara interactuar con Foodie Bot (procesamiento ultrarrápido con modelos Llama 3.3 / Llama 3.1 100% gratuito), por favor ingresa tu clave en la vista de Ajustes del Sistema.',
        timestamp: Date.now() + 1,
        showSettingsButton: true
      };
      setMessages(prev => [...prev, userMsg, guidedMsg]);
      setTypedMessage('');
      if (!voiceMuted) {
        speakText('Por favor configura tu API Key de Groq en los Ajustes del Sistema.');
      }
      return;
    }

    stopListening();

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setTypedMessage('');
    setIsProcessing(true);

    try {
      let extraction: VoiceIngredientExtraction;
      if (groqKey) {
        try {
          extraction = await processVoicePromptWithGroq(trimmed, effectiveContextData, messages);
        } catch (groqErr: any) {
          // Si Groq falla y existe clave de Gemini configurada, conmutar transparentemente como respaldo
          if (geminiKey && !groqErr?.message?.includes('TIMEOUT_EXCEEDED')) {
            console.warn('[Foodie Bot] Groq Cloud falló, conmutando automáticamente a Google Gemini como respaldo...', groqErr);
            toast('Conmutando a Gemini como respaldo...', { icon: '🔄' });
            extraction = await processAiCopilotPrompt(trimmed, effectiveContextData || {}, messages);
          } else {
            throw groqErr;
          }
        }
      } else {
        extraction = await processAiCopilotPrompt(trimmed, effectiveContextData || {}, messages);
      }

      // Contextual correction command check (e.g. "es un producto nuevo", "referencia distinta", "no es ese producto")
      const isCorrectionToNewItem = /(es\s+(un\s+)?(producto|item|art[íi]culo|referencia)\s+nuev[oa]|referencia\s+(distinta|diferente|nueva|otra)|crear\s+por\s+(separado|aparte)|guardar\s+por\s+(separado|aparte)|no\s+es\s+es[te]\s+producto|otra\s+referencia|por\s+separado)/i.test(trimmed);

      // Real-time Dexie.js search & matching (RESTOCK vs NEW_ITEM detection)
      if (isCorrectionToNewItem) {
        if (!extraction.name && latestExtraction?.name) {
          extraction.name = latestExtraction.name;
          extraction.purchase_price = latestExtraction.purchase_price;
          extraction.purchase_quantity = latestExtraction.purchase_quantity;
          extraction.purchase_unit = latestExtraction.purchase_unit;
          extraction.category = latestExtraction.category;
        }
        extraction.intent_type = 'NEW_ITEM';
        extraction.existing_match = undefined;
      } else if (extraction.name) {
        try {
          const allItems = await db.inventoryItems.toArray();
          const matchedItem = findMatchingInventoryItem(extraction.name, allItems);
          if (matchedItem) {
            extraction.intent_type = 'RESTOCK';
            extraction.existing_match = calculateRestockMetrics(matchedItem, extraction);
          } else {
            extraction.intent_type = 'NEW_ITEM';
            extraction.existing_match = undefined;
          }
        } catch (matchErr) {
          console.warn('[Foodie Bot] Error durante matching de inventario en Dexie:', matchErr);
          extraction.intent_type = 'NEW_ITEM';
        }
      }

      setLatestExtraction(extraction);

      // Reactive form update in real-time while user watches the main form
      if (handleApplyExtraction) {
        handleApplyExtraction(extraction);
      }

      // Conversational confirmation message: adapts dynamically to RESTOCK vs NEW_ITEM
      const confirmationText = extraction.intent_type === 'RESTOCK' && extraction.existing_match
        ? `He detectado existencias de "${extraction.existing_match.name}". He preparado el reabastecimiento:`
        : extraction.name 
        ? `He preparado el alta de "${extraction.name}" en inventario:`
        : (extraction.follow_up_question || 'He procesado tus indicaciones.');

      const assistantMsg: CopilotMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: confirmationText,
        timestamp: Date.now(),
        extraction
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Command handling
      if (extraction.command_action === 'CONFIRM_SAVE') {
        const itemToSave = extraction.name ? extraction : (latestExtraction || extraction);
        if (itemToSave && itemToSave.name) {
          await handleDirectSave(itemToSave);
        } else {
          toast('No hay un elemento detectado para guardar.', { icon: 'ℹ️' });
        }
      } else if (extraction.command_action === 'CLEAR_FORM') {
        toast('Formulario reiniciado', { icon: '🧹' });
        if (handleClearForm) handleClearForm();
      } else if (extraction.command_action === 'NAVIGATE' && extraction.navigation_target) {
        handleOpenFormWithPrefill(extraction);
      }

      // Voice output if not muted
      if (!voiceMuted) {
        speakText(confirmationText);
      }
    } catch (err: any) {
      console.error('Error in Foodie Bot (Groq):', err);
      const rawMsg = err?.detail || err?.message || String(err || '');
      let errorText = 'Ocurrió un error al comunicarse con Groq Cloud.';

      if (
        rawMsg.includes('TIMEOUT_EXCEEDED') || 
        rawMsg.includes('aborted') || 
        rawMsg.includes('Timeout') || 
        rawMsg.includes('Tiempo de espera')
      ) {
        errorText = '⚠️ Tiempo de espera agotado. Por favor intenta de nuevo.';
      } else if (rawMsg === 'GROQ_KEY_INVALID' || rawMsg.includes('401') || rawMsg.includes('Invalid API Key')) {
        errorText = 'Tu API Key de Groq Cloud no es válida. Ve a Configuración / Ajustes del Sistema para actualizarla.';
      } else if (rawMsg === 'NO_GROQ_API_KEY' || rawMsg.includes('NO_API_KEY')) {
        errorText = 'Configura tu Groq API Key gratuita en Ajustes del Sistema para activar Foodie Bot.';
      } else if (rawMsg.includes('429') || rawMsg.includes('QUOTA') || rawMsg.includes('GROQ_QUOTA_EXCEEDED')) {
        errorText = 'Límite de peticiones excedido temporalmente en Groq Cloud. Espera un momento.';
      } else if (rawMsg.includes('Failed to fetch') || rawMsg.includes('network') || rawMsg.includes('ENOTFOUND')) {
        errorText = 'Error de conexión de red con Groq Cloud. Revisa tu acceso a internet.';
      } else if (rawMsg.includes('400') || rawMsg.includes('Failed to generate JSON') || rawMsg.includes('json_validate_failed')) {
        errorText = `Error en solicitud a Groq Cloud (HTTP 400): ${err?.detail || err?.message || 'Formato de mensaje no aceptado'}`;
      } else if (err?.detail || err?.message) {
        const detailMsg = err?.detail || err?.message;
        errorText = detailMsg.startsWith('Groq') || detailMsg.startsWith('Error')
          ? detailMsg
          : `Error en Groq Cloud: ${detailMsg}`;
      }

      const isMissingKey = rawMsg === 'NO_GROQ_API_KEY' || rawMsg.includes('NO_API_KEY');
      const errMsg: CopilotMessage = {
        id: `err-${Date.now()}`,
        sender: isMissingKey ? 'assistant' : 'system',
        text: errorText.startsWith('⚠️') ? errorText : `⚠️ ${errorText}`,
        timestamp: Date.now(),
        showSettingsButton: isMissingKey
      };
      setMessages(prev => [...prev, errMsg]);
      toast.error(errorText);
    } finally {
      setIsProcessing(false);
    }
  };

  if (typeof document === 'undefined' || !isOpen) {
    return null;
  }

  return createPortal(
    <aside 
      className={`fixed bottom-6 left-6 z-[9999] w-[390px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border border-line bg-surface/95 backdrop-blur-xl flex flex-col overflow-hidden transition-all duration-300 animate-slide-up-fade select-text ${
        isMinimized ? 'h-[52px]' : 'h-[580px] max-h-[72vh]'
      }`}
      aria-label="Foodie Bot Asistente Flotante"
      role="complementary"
    >
      {/* 1. Header Bar (Fixed height 52px with title, context badge, minimize & close) */}
      <div 
        className="h-[52px] px-3.5 bg-slate-50/90 dark:bg-surface/90 border-b border-line flex items-center justify-between shrink-0 select-none cursor-pointer"
        onClick={() => {
          if (isMinimized) setIsMinimized(false);
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-orange-500 flex items-center justify-center text-white shadow-sm shadow-purple-500/25 shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-black text-content uppercase tracking-wider whitespace-nowrap">
              Foodie Bot
            </h3>
            {!isMinimized && (
              <p className="text-[10px] text-content-secondary font-medium truncate">
                {modeMetadata.title}
              </p>
            )}
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Cheat Sheet Toggle ('?') */}
          <button
            type="button"
            onClick={() => setShowCheatSheet(prev => !prev)}
            className={`p-1.5 rounded-lg transition-colors btn-press cursor-pointer ${
              showCheatSheet 
                ? 'text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/60 font-black' 
                : 'text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-raised'
            }`}
            title="Guía de estructura y sintaxis (Cheat Sheet)"
            aria-label="Guía de dictado Cheat Sheet"
          >
            <span className="material-symbols-outlined text-base">help_outline</span>
          </button>

          {/* Voice Mute Toggle */}
          <button
            type="button"
            onClick={handleToggleVoiceMute}
            className={`p-1.5 rounded-lg transition-colors btn-press cursor-pointer ${
              voiceMuted 
                ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-raised' 
                : 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60'
            }`}
            title={voiceMuted ? 'Activar voz de Foodie Bot' : 'Silenciar voz de Foodie Bot'}
            aria-label={voiceMuted ? 'Activar voz' : 'Silenciar voz'}
          >
            <span className="material-symbols-outlined text-base">
              {voiceMuted ? 'volume_off' : 'volume_up'}
            </span>
          </button>

          {/* Minimize / Restore button */}
          <button
            type="button"
            onClick={() => setIsMinimized(prev => !prev)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-raised transition-colors btn-press cursor-pointer"
            title={isMinimized ? "Restaurar Foodie Bot" : "Minimizar Foodie Bot"}
            aria-label={isMinimized ? "Restaurar Foodie Bot" : "Minimizar Foodie Bot"}
          >
            <span className="material-symbols-outlined text-base">
              {isMinimized ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
            </span>
          </button>

          {/* Close button ('X') */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors btn-press cursor-pointer"
            title="Cerrar Foodie Bot"
            aria-label="Cerrar Foodie Bot"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </div>

      {/* 2. Expanded Body (Only rendered when not minimized) */}
      {!isMinimized && (
        <>
          {/* Visual Syntax Guide (Cheat Sheet Accordion) */}
          {showCheatSheet && (
            <div className="mx-3 mt-2.5 p-3 rounded-2xl bg-gradient-to-br from-purple-50/95 to-slate-50/90 dark:from-purple-950/40 dark:to-slate-900/90 border border-purple-200/90 dark:border-purple-800/70 shadow-sm text-xs space-y-2.5 shrink-0 animate-fadeIn select-text">
              <div className="flex items-center justify-between border-b border-purple-200/60 dark:border-purple-800/60 pb-1.5">
                <div className="flex items-center gap-1.5 text-purple-950 dark:text-purple-200 font-extrabold text-xs">
                  <span className="material-symbols-outlined text-sm text-amber-500">lightbulb</span>
                  <span>¿Cómo dictar a Foodie Bot?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCheatSheet(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors btn-press cursor-pointer"
                  title="Cerrar guía"
                  aria-label="Cerrar guía"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              {/* Recommended Syntax Formula */}
              <div className="p-2 rounded-xl bg-white/90 dark:bg-surface/90 border border-purple-200/60 dark:border-purple-800/50 font-mono text-[10px] text-slate-700 dark:text-slate-200 leading-relaxed shadow-xs">
                <div className="text-[9px] uppercase tracking-wider text-purple-700 dark:text-purple-300 font-bold mb-0.5">
                  Fórmula Sintáctica Recomendada:
                </div>
                <span className="font-semibold text-purple-700 dark:text-purple-300">[Cantidad] [Unidad]</span> de <span className="font-bold text-content">[Nombre]</span> a <span className="font-semibold text-emerald-600 dark:text-emerald-400">$[Precio]</span> <span className="text-content-tertiary">[Proveedor / Uso opcional]</span>
              </div>

              {/* 3 Main Intentions */}
              <div className="space-y-1.5 text-[11px]">
                {/* Ingredientes */}
                <div className="flex items-start gap-1.5 bg-white/80 dark:bg-surface/80 p-2 rounded-xl border border-slate-200/70 dark:border-line shadow-2xs">
                  <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">eco</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[10.5px] text-content truncate">Ingredientes (materia prima)</span>
                      <button
                        type="button"
                        onClick={() => handleSelectExamplePrompt('Compré 130g de ajo a $2000, usamos 120g')}
                        className="text-[9.5px] text-purple-600 dark:text-purple-400 hover:text-purple-700 font-bold flex items-center gap-0.5 btn-press cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[11px]">content_paste_go</span> Probar
                      </button>
                    </div>
                    <p className="text-[10px] text-content-secondary italic font-sans truncate">
                      "Compré 130g de ajo a $2000, usamos 120g"
                    </p>
                  </div>
                </div>

                {/* Productos directos */}
                <div className="flex items-start gap-1.5 bg-white/80 dark:bg-surface/80 p-2 rounded-xl border border-slate-200/70 dark:border-line shadow-2xs">
                  <span className="material-symbols-outlined text-sm text-amber-500 shrink-0 mt-0.5">liquor</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[10.5px] text-content truncate">Productos directos (reventa)</span>
                      <button
                        type="button"
                        onClick={() => handleSelectExamplePrompt('Compré 24 cervezas a $60.000 en Bavaria')}
                        className="text-[9.5px] text-purple-600 dark:text-purple-400 hover:text-purple-700 font-bold flex items-center gap-0.5 btn-press cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[11px]">content_paste_go</span> Probar
                      </button>
                    </div>
                    <p className="text-[10px] text-content-secondary italic font-sans truncate">
                      "Compré 24 cervezas a $60.000 en Bavaria"
                    </p>
                  </div>
                </div>

                {/* Suministros */}
                <div className="flex items-start gap-1.5 bg-white/80 dark:bg-surface/80 p-2 rounded-xl border border-slate-200/70 dark:border-line shadow-2xs">
                  <span className="material-symbols-outlined text-sm text-indigo-500 shrink-0 mt-0.5">inventory</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[10.5px] text-content truncate">Suministros (desechables/empaques)</span>
                      <button
                        type="button"
                        onClick={() => handleSelectExamplePrompt('Compré 200 cajas para hamburguesa a $40.000')}
                        className="text-[9.5px] text-purple-600 dark:text-purple-400 hover:text-purple-700 font-bold flex items-center gap-0.5 btn-press cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[11px]">content_paste_go</span> Probar
                      </button>
                    </div>
                    <p className="text-[10px] text-content-secondary italic font-sans truncate">
                      "Compré 200 cajas para hamburguesa a $40.000"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages Container (Self-contained scroll) */}
          <div 
            ref={chatContainerRef}
            className="flex-1 p-3 overflow-y-auto space-y-3 text-xs overscroll-contain scroll-smooth bg-slate-50/40 dark:bg-canvas/30"
          >
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`rounded-2xl p-2.5 shadow-sm ${
                    msg.extraction ? 'w-full max-w-[96%]' : 'max-w-[88%]'
                  } ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-br-none'
                      : msg.sender === 'system'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                      : 'bg-inset/90 text-content rounded-bl-none border border-slate-200/80 dark:border-line shadow-sm'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                  {/* Zero-Form Structured Interactive Preview Card (Adaptive: RESTOCK vs NEW_ITEM) */}
                  {msg.extraction ? (() => {
                    const isRestock = msg.extraction.intent_type === 'RESTOCK' && !!msg.extraction.existing_match;
                    const match = msg.extraction.existing_match;

                    if (isRestock && match) {
                      return (
                        <div className="mt-2.5 rounded-xl bg-indigo-50/70 dark:bg-surface/90 border border-indigo-200/90 dark:border-indigo-800/80 p-3 shadow-sm space-y-2.5 text-content">
                          {/* 1. Header with Matched Name & Mode Badges */}
                          <div className="flex items-center justify-between gap-2 border-b border-indigo-200/60 dark:border-indigo-800/60 pb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-base shrink-0">archive</span>
                              <span className="font-bold text-xs truncate text-content" title={match.name}>
                                {match.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                                Reabastecimiento
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-xs tabular-nums">
                                +{match.addedStock} {match.unit} al stock
                              </span>
                            </div>
                          </div>

                          {/* 2. Structured Metrics Grid: Stock Previo vs Nuevo, Costo & Delta, Costo Ponderado, Proveedor */}
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {/* Stock Previo vs Nuevo */}
                            <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-indigo-100 dark:border-line">
                              <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Stock Previo → Nuevo</span>
                              <div className="flex items-center gap-1.5 font-bold font-mono text-xs">
                                <span className="text-slate-400 line-through tabular-nums">{match.currentStock}</span>
                                <span className="material-symbols-outlined text-[11px] text-indigo-500">arrow_forward</span>
                                <span className="text-indigo-600 dark:text-indigo-400 font-extrabold tabular-nums">
                                  {match.newCalculatedStock} {match.unit}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-400 truncate">
                                +{match.addedStock} {match.unit} sumadas
                              </span>
                            </div>

                            {/* Costo Anterior vs Nuevo Costo (+ Variación) */}
                            <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-indigo-100 dark:border-line">
                              <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Costo Anterior vs Nuevo</span>
                              <div className="flex items-center gap-1 font-bold font-mono text-xs tabular-nums">
                                <span className="text-slate-400 tabular-nums">{formatCurrency(match.previousCost)}</span>
                                <span className="material-symbols-outlined text-[11px] text-slate-400">arrow_forward</span>
                                <span className="text-content tabular-nums">{formatCurrency(match.newUnitCost)}</span>
                              </div>
                              <div className="mt-0.5">
                                {match.previousCost > 0 && match.costDifference > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded-full border border-rose-200/60 dark:border-rose-900/40 tabular-nums">
                                    ↑ Subió {formatCurrency(match.costDifference)}/{match.unit}
                                  </span>
                                ) : match.previousCost > 0 && match.costDifference < 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-900/40 tabular-nums">
                                    ↓ Bajó {formatCurrency(Math.abs(match.costDifference))}/{match.unit}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-content-secondary font-medium">
                                    = Mismo costo anterior
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Costo Promedio Ponderado */}
                            <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-indigo-100 dark:border-line">
                              <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Costo Ponderado</span>
                              <span className="font-bold font-mono text-indigo-700 dark:text-indigo-300 text-xs tabular-nums">
                                {formatCurrency(match.weightedAverageCost)}
                              </span>
                              <span className="text-[9px] text-slate-400 truncate">
                                Promedio ({match.newCalculatedStock} {match.unit})
                              </span>
                            </div>

                            {/* Proveedor & Sede */}
                            <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-indigo-100 dark:border-line">
                              <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Proveedor & Sede</span>
                              <span className="font-medium text-slate-700 dark:text-slate-200 truncate text-[11px]" title={msg.extraction.supplier_name || match.supplierName || 'Proveedor Habitual'}>
                                {msg.extraction.supplier_name || match.supplierName || 'Proveedor Habitual'}
                              </span>
                              <span className="text-[9px] text-slate-400 truncate">Sede Activa</span>
                            </div>
                          </div>

                          {/* 3. Actions: 'Registrar Entrada' & 'Cancelar' */}
                          {msg.sender === 'assistant' && (
                            <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60 flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDirectSave(msg.extraction!)}
                                  className="flex-1 py-2 px-3.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all btn-press cursor-pointer shadow-sm shadow-indigo-600/25"
                                  title="Registrar entrada de existencias en Dexie.js con un clic"
                                >
                                  <span className="material-symbols-outlined text-sm">archive</span>
                                  ✓ Registrar Entrada
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelDraft}
                                  className="py-2 px-3.5 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-raised dark:hover:bg-slate-700 text-content-secondary font-semibold text-xs flex items-center justify-center gap-1.5 transition-all btn-press cursor-pointer border border-slate-300/60 dark:border-line-strong shadow-2xs"
                                  title="Cancelar y descartar este registro"
                                >
                                  <X size={16} />
                                  Cancelar
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleConvertToNewItem(msg.id, msg.extraction)}
                                className="w-full py-1.5 px-3 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all btn-press cursor-pointer shadow-2xs"
                                title="Crear este ítem como una referencia/producto nuevo e independiente"
                              >
                                <PlusCircle size={14} className="text-emerald-600 dark:text-emerald-400" />
                                + Crear como nuevo producto
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenFormWithPrefill(msg.extraction!)}
                                className="w-full py-1 px-2.5 rounded-full text-content-secondary hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-white dark:hover:bg-raised text-[11px] font-medium flex items-center justify-center gap-1 transition-all btn-press cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800/40"
                                title="Abrir en formulario para configuraciones avanzadas"
                              >
                                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                                Abrir en formulario
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // --- NEW ITEM (ALTA DESDE CERO) CARD ---
                    return (
                      <div className="mt-2.5 rounded-xl bg-emerald-50/50 dark:bg-surface/90 border border-emerald-200/80 dark:border-emerald-800/70 p-3 shadow-sm space-y-2.5 text-content">
                        {/* 1. Header with Name and Auto-Selected Category */}
                        <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 dark:border-emerald-800/60 pb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base shrink-0">add_circle</span>
                            <span className="font-bold text-xs truncate text-content">
                              {msg.extraction.name || 'Nuevo Elemento'}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
                            {msg.extraction.category || 'Nuevo'}
                          </span>
                        </div>

                        {/* 2. Structured Metrics Grid: Cantidad, Costo/Precio, Rendimiento/Merma, Proveedor */}
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {/* Cantidad y Unidad de Compra */}
                          <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-emerald-100 dark:border-line">
                            <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Cantidad de Compra</span>
                            <span className="font-bold font-mono text-content text-xs tabular-nums">
                              {msg.extraction.purchase_quantity || 1} {msg.extraction.purchase_unit || 'Unidad'}
                            </span>
                            <span className="text-[9px] text-slate-400 truncate">
                              {msg.extraction.package_units ? `(${msg.extraction.package_units} unds/paquete)` : 'Entrada directa'}
                            </span>
                          </div>

                          {/* Precio Total y Costo Unitario */}
                          <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-emerald-100 dark:border-line">
                            <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Precio / Costo</span>
                            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-xs tabular-nums">
                              {formatCurrency(msg.extraction.purchase_price || 0)}
                            </span>
                            <span className="text-[9.5px] font-semibold text-content-secondary tabular-nums">
                              {formatCurrency(
                                (msg.extraction.purchase_price && (msg.extraction.purchase_quantity || 1) > 0)
                                  ? Math.round(msg.extraction.purchase_price / (msg.extraction.purchase_quantity || 1))
                                  : (msg.extraction.purchase_price || 0)
                              )} por {msg.extraction.purchase_unit || msg.extraction.use_unit || 'und'}
                            </span>
                          </div>

                          {/* Rendimiento / Merma */}
                          <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-emerald-100 dark:border-line">
                            <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Rendimiento / Merma</span>
                            <span className="font-bold font-mono text-amber-600 dark:text-amber-400 text-xs tabular-nums">
                              {msg.extraction.waste_percentage ?? 0}% de merma
                            </span>
                            <span className="text-[9.5px] font-medium text-content-secondary truncate">
                              {msg.extraction.usable_quantity !== undefined 
                                ? `${msg.extraction.usable_quantity} ${msg.extraction.use_unit || msg.extraction.purchase_unit || 'und'}`
                                : `${((msg.extraction.purchase_quantity || 1) * (msg.extraction.conversion_multiplier || 1))} ${msg.extraction.use_unit || msg.extraction.purchase_unit || 'und'}`} utilizables
                            </span>
                          </div>

                          {/* Proveedor & Sede */}
                          <div className="flex flex-col bg-white/80 dark:bg-raised/80 p-2 rounded-lg border border-emerald-100 dark:border-line">
                            <span className="text-[9px] uppercase tracking-wider text-content-tertiary font-bold">Proveedor & Sede</span>
                            <span className="font-medium text-slate-700 dark:text-slate-200 truncate text-[11px]" title={msg.extraction.supplier_name || 'Proveedor General'}>
                              {msg.extraction.supplier_name || 'Proveedor General'}
                            </span>
                            <span className="text-[9px] text-slate-400 truncate">Sede Principal</span>
                          </div>
                        </div>

                        {/* 3. Actions: 'Guardar en Inventario' & 'Cancelar' */}
                        {msg.sender === 'assistant' && (
                          <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDirectSave(msg.extraction!)}
                                className="flex-1 py-2 px-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all btn-press cursor-pointer shadow-sm shadow-emerald-600/25"
                                title="Guardar directamente en inventario Dexie.js con un clic"
                              >
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                ✓ Guardar
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelDraft}
                                className="py-2 px-3.5 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-raised dark:hover:bg-slate-700 text-content-secondary font-semibold text-xs flex items-center justify-center gap-1.5 transition-all btn-press cursor-pointer border border-slate-300/60 dark:border-line-strong shadow-2xs"
                                title="Cancelar y descartar este registro"
                              >
                                <X size={16} />
                                Cancelar
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenFormWithPrefill(msg.extraction!)}
                              className="w-full py-1 px-2.5 rounded-full text-content-secondary hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-white dark:hover:bg-raised text-[11px] font-medium flex items-center justify-center gap-1 transition-all btn-press cursor-pointer border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800/40"
                              title="Abrir en formulario para configuraciones avanzadas"
                            >
                              <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                              Abrir en formulario
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })() : null}

                  {/* Guided interactive button to open Settings directly if API Key is missing */}
                  {msg.showSettingsButton && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-line flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleOpenSettings}
                        className="w-full py-2.5 px-4 rounded-full bg-[var(--accent-purple)] hover:brightness-110 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all btn-press cursor-pointer shadow-md shadow-purple-600/20"
                        title="Abrir módulo de Ajustes del Sistema"
                      >
                        <span className="material-symbols-outlined text-sm">settings</span>
                        ⚙️ Abrir Ajustes de Configuración
                      </button>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-center text-[10.5px] text-orange-500 hover:underline font-semibold flex items-center justify-center gap-1"
                      >
                        Obtener clave gratis en console.groq.com ↗
                      </a>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {/* Contextual Interactive Example Pills (Initial / Empty Chat State) */}
            {messages.length <= 1 && (
              <div className="p-3 rounded-2xl bg-gradient-to-b from-purple-50/70 to-indigo-50/40 dark:from-purple-950/30 dark:to-slate-900/60 border border-purple-200/70 dark:border-purple-800/50 shadow-xs space-y-2 select-text">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">auto_awesome</span>
                    Ejemplos recomendados ({modeMetadata.title}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCheatSheet(true)}
                    className="text-[9.5px] text-purple-600 dark:text-purple-400 hover:underline font-semibold flex items-center gap-0.5 btn-press cursor-pointer"
                  >
                    Ver guía (?)
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {contextualExampleChips.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectExamplePrompt(chip.prompt)}
                      className="w-full text-left p-2 rounded-xl bg-inset/90 hover:bg-purple-50/80 dark:hover:bg-purple-900/40 border border-slate-200/80 dark:border-line hover:border-purple-300 dark:hover:border-purple-600 transition-all btn-press cursor-pointer group flex items-center justify-between gap-2 shadow-2xs"
                      title="Copiar plantilla al campo de texto"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="material-symbols-outlined text-xs text-purple-500 group-hover:scale-110 transition-transform shrink-0">
                          {chip.icon}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-content-tertiary">
                            {chip.label}
                          </span>
                          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 group-hover:text-purple-700 dark:group-hover:text-purple-300 truncate">
                            {chip.prompt}
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[13px] text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 shrink-0">
                        content_paste_go
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center gap-1.5 p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-xl w-fit border border-purple-200/50 dark:border-purple-800/50">
                <span className="material-symbols-outlined text-sm animate-spin text-purple-600">sync</span>
                <span className="text-[10px] font-bold">Foodie Bot está procesando...</span>
              </div>
            )}

            {isSpeaking && (
              <div className="flex items-center gap-1 px-2.5 py-0.5 bg-raised rounded-full w-fit text-[9px] text-content-secondary">
                <span className="material-symbols-outlined text-xs text-purple-500 animate-pulse">volume_up</span>
                <span>Hablando...</span>
              </div>
            )}
          </div>

          {/* Quick Suggestions Chips (One-Tap Prompts) */}
          <div className="px-3 py-1.5 bg-slate-100/60 dark:bg-surface/60 border-t border-line overflow-x-auto flex gap-1 no-scrollbar shrink-0 select-none">
            {modeMetadata.quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectExamplePrompt(prompt)}
                disabled={isProcessing}
                className="shrink-0 text-[9px] font-semibold bg-inset text-content-secondary hover:text-purple-600 dark:hover:text-purple-300 hover:border-purple-400 px-2 py-0.5 rounded-full border border-line transition-all cursor-pointer truncate max-w-[200px] btn-press"
                title="Copiar plantilla al campo de texto"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Live Audio Visualizer Waves & Real-Time Live Transcription */}
          {isListening && (
            <div className="px-3 py-1.5 bg-purple-950/90 text-white flex items-center justify-between border-t border-purple-800/80 animate-fade-in shrink-0 select-none">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="text-[10px] font-bold text-purple-200 truncate">
                  {interimTranscript ? `"${interimTranscript}"` : 'Escuchando tu voz...'}
                </span>
              </div>

              {/* Sound Wave Bars */}
              <div className="flex items-center gap-0.5 h-4 shrink-0">
                {[20, 50, 90, 100, 70, 40, 75].map((h, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-gradient-to-t from-purple-400 to-rose-400 rounded-full transition-all duration-150"
                    style={{ height: `${Math.max(3, (h / 100) * 16 * Math.max(0.3, audioLevel))}px` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="p-2.5 bg-surface border-t border-line flex flex-col gap-2 shrink-0">
            {/* Multimodal Text Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(typedMessage);
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder={isListening ? 'Escuchando tu voz...' : 'Escribe o dicta aquí...'}
                  disabled={isProcessing}
                  className="w-full bg-raised/90 border border-line text-content text-xs rounded-full px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {typedMessage && (
                  <button
                    type="button"
                    onClick={() => setTypedMessage('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <span className="material-symbols-outlined text-sm">cancel</span>
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!typedMessage.trim() || isProcessing}
                className="w-7 h-7 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center transition-all btn-press cursor-pointer shrink-0 shadow-sm"
                aria-label="Enviar texto a Foodie Bot"
              >
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </form>

            {/* Bottom Row Controls */}
            <div className="flex items-center justify-between select-none">
              {/* Voice Mute Toggle */}
              <button
                type="button"
                onClick={handleToggleVoiceMute}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all btn-press cursor-pointer border ${
                  voiceMuted
                    ? 'text-slate-400 border-line hover:bg-slate-100 dark:hover:bg-raised'
                    : 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800'
                }`}
                title={voiceMuted ? 'Activar voz de Foodie Bot' : 'Silenciar voz de Foodie Bot'}
              >
                <span className="material-symbols-outlined text-sm">
                  {voiceMuted ? 'volume_off' : 'volume_up'}
                </span>
                <span>{voiceMuted ? 'Mute' : 'Voz'}</span>
              </button>

              {/* Central Prominent Mic Button */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={!isSupported || isProcessing}
                className={`relative w-10 h-10 rounded-full flex items-center justify-center text-white transition-all transform btn-press cursor-pointer shadow-md ${
                  isListening
                    ? 'bg-rose-500 shadow-rose-500/40 animate-pulse scale-105'
                    : 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 shadow-purple-500/25 hover:scale-105'
                }`}
                title={isListening ? 'Detener grabación' : 'Hablar con Foodie Bot'}
                aria-label={isListening ? 'Detener grabación' : 'Hablar con Foodie Bot'}
              >
                {isListening && (
                  <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-60 pointer-events-none" />
                )}
                <span className="material-symbols-outlined text-lg relative z-10" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isListening ? 'mic_off' : 'mic'}
                </span>
              </button>

              {/* Visual Balance Spacer (replaces duplicate bottom Guardar button) */}
              <div className="w-[62px]" aria-hidden="true" />
            </div>
          </div>
        </>
      )}
    </aside>,
    document.body
  );
}
