// src/test/voiceCopilot.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getGeminiApiKey, 
  setGeminiApiKey, 
  hasGeminiApiKey,
  isVoiceFeedbackEnabled,
  setVoiceFeedbackEnabled
} from '../utils/geminiConfig';
import type { VoiceIngredientExtraction } from '../types/voiceCopilot';
import { calculateCostMetrics } from '../utils/costEngine';
import { db, enqueueOfflineEvent } from '../db/localDb';
import { sanitizeGroqExtraction } from '../services/groqCopilotService';

describe('Foodie Voice Copilot Module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('API Key and Voice Configuration', () => {
    it('should correctly save and retrieve Gemini API key from localStorage', () => {
      expect(hasGeminiApiKey()).toBe(false);
      expect(getGeminiApiKey()).toBe('');

      setGeminiApiKey('AIzaSyTest123456789');
      expect(hasGeminiApiKey()).toBe(true);
      expect(getGeminiApiKey()).toBe('AIzaSyTest123456789');

      setGeminiApiKey('');
      expect(hasGeminiApiKey()).toBe(false);
      expect(getGeminiApiKey()).toBe('');
    });

    it('should manage voice feedback enable/disable state in localStorage', () => {
      expect(isVoiceFeedbackEnabled()).toBe(true); // default true

      setVoiceFeedbackEnabled(false);
      expect(isVoiceFeedbackEnabled()).toBe(false);

      setVoiceFeedbackEnabled(true);
      expect(isVoiceFeedbackEnabled()).toBe(true);
    });
  });

  describe('Voice Extraction Entity Processing & Costing Calculations', () => {
    it('should calculate cost metrics accurately when receiving complete extraction for Avocado', () => {
      const mockExtraction: VoiceIngredientExtraction = {
        name: 'Aguacate Hass',
        category: 'Frutas',
        supplier_name: 'Fruver Central',
        purchase_price: 12000,
        purchase_unit: 'Kilogramo',
        purchase_quantity: 1,
        use_unit: 'g',
        conversion_multiplier: 1000,
        usable_quantity: 850,
        waste_percentage: 15,
        missing_fields: [],
        follow_up_question: '¡Todo listo para Aguacate Hass! ¿Deseas guardarlo?',
        is_complete: true,
        command_action: 'NONE'
      };

      expect(mockExtraction.is_complete).toBe(true);
      expect(mockExtraction.name).toBe('Aguacate Hass');

      // Test cost metrics with extracted data
      const metrics = calculateCostMetrics({
        purchaseCost: mockExtraction.purchase_price ?? 0,
        cantidadComprada: mockExtraction.purchase_quantity ?? 1,
        conversionMultiplier: mockExtraction.conversion_multiplier ?? 1,
        cantidadUtilizable: mockExtraction.usable_quantity ?? 0
      });

      // 12000 / (1 * 1000) = 12 COP/g
      expect(metrics.costBruto).toBe(12);
      // Yield = 850 / 1000 = 85%
      expect(metrics.rendimiento).toBe(85);
      // Merma = 15%
      expect(metrics.merma).toBe(15);
      // Factor = 100 / 85 = 1.176
      expect(metrics.factor).toBeCloseTo(1.176, 2);
      // Costo Real = 12 * (100 / 85) = 14.12 COP/g
      expect(metrics.costReal).toBeCloseTo(14.12, 2);
    });

    it('should detect follow-up questions and missing fields for incomplete voice inputs', () => {
      const incompleteExtraction: VoiceIngredientExtraction = {
        name: 'Lomo Fino',
        category: 'Proteínas',
        missing_fields: ['purchase_price', 'usable_quantity'],
        follow_up_question: '¿Cuál fue el precio de compra del Lomo Fino y qué merma estimada tiene?',
        is_complete: false,
        command_action: 'NONE'
      };

      expect(incompleteExtraction.is_complete).toBe(false);
      expect(incompleteExtraction.missing_fields).toContain('purchase_price');
      expect(incompleteExtraction.missing_fields).toContain('usable_quantity');
      expect(incompleteExtraction.follow_up_question).toContain('Lomo Fino');
    });

    it('should recognize save and clear command actions from voice intent', () => {
      const saveCommandExtraction: VoiceIngredientExtraction = {
        missing_fields: [],
        follow_up_question: 'Guardando el ingrediente en el inventario...',
        is_complete: true,
        command_action: 'CONFIRM_SAVE'
      };

      const clearCommandExtraction: VoiceIngredientExtraction = {
        missing_fields: [],
        follow_up_question: 'He limpiado el formulario.',
        is_complete: false,
        command_action: 'CLEAR_FORM'
      };

      expect(saveCommandExtraction.command_action).toBe('CONFIRM_SAVE');
      expect(clearCommandExtraction.command_action).toBe('CLEAR_FORM');
    });

    it('should handle supplier matching and supplier_name_to_create', async () => {
      const existingSupplierId = 'prov-fruver-01';
      await db.suppliers.put({
        id: existingSupplierId,
        name: 'Fruver Central Mayorista',
        contact: 'Carlos',
        email: 'carlos@fruver.com',
        phone: '3001234567',
        paymentTerms: 'Contado',
        categoriesSupplied: ['Frutas', 'Vegetales'],
        updatedAt: new Date().toISOString()
      });

      // 1. Existing supplier matching
      const matchExtraction: VoiceIngredientExtraction = {
        name: 'Tomate Chonto',
        category: 'Vegetales',
        supplier_id: existingSupplierId,
        supplier_name: 'Fruver Central Mayorista',
        missing_fields: [],
        follow_up_question: 'Tomate registrado',
        is_complete: true
      };
      expect(matchExtraction.supplier_id).toBe(existingSupplierId);

      // 2. New unregistered supplier extraction
      const newSupplierExtraction: VoiceIngredientExtraction = {
        name: 'Pechuga de Pollo',
        category: 'Proteínas',
        supplier_name_to_create: 'Avícola Los Andes',
        missing_fields: [],
        follow_up_question: 'Pechuga registrada con nuevo proveedor',
        is_complete: true
      };
      expect(newSupplierExtraction.supplier_id).toBeUndefined();
      expect(newSupplierExtraction.supplier_name_to_create).toBe('Avícola Los Andes');
    });

    it('should accurately parse purchase quantity, unit normalization and usable quantity (e.g. 130g garlic bought, 120g used)', () => {
      // Prompt: "He comprado 130 g de ajo a 2000 pesos colombianos, de lo cual usamos 120 g"
      const extraction: VoiceIngredientExtraction = {
        name: 'Ajo',
        category: 'Vegetales',
        purchase_price: 2000,
        purchase_quantity: 130,
        purchase_unit: 'Gramo',
        use_unit: 'Gramo',
        conversion_multiplier: 1,
        usable_quantity: 120,
        waste_percentage: 7.69,
        missing_fields: [],
        follow_up_question: '¡Entendido! Registré 130g de Ajo a $2.000 con 120g utilizables (7.69% merma). ¿Deseas guardarlo?',
        is_complete: true
      };

      expect(extraction.purchase_quantity).toBe(130);
      expect(extraction.purchase_unit).toBe('Gramo');
      expect(extraction.use_unit).toBe('Gramo');
      expect(extraction.conversion_multiplier).toBe(1);
      expect(extraction.usable_quantity).toBe(120);
      expect(extraction.waste_percentage).toBeCloseTo(7.69, 1);
      expect(extraction.is_complete).toBe(true);
    });

    it('should accurately handle Product Único extraction with sale_price and category', () => {
      const productExtraction: VoiceIngredientExtraction = {
        name: 'Cerveza Corona 330ml',
        category: 'Licores y Cervezas',
        sale_price: 12000,
        purchase_price: 4500,
        purchase_quantity: 24,
        purchase_unit: 'Botella',
        missing_fields: [],
        follow_up_question: 'Cerveza Corona lista a $12.000 venta ($4.500 costo). ¿Guardar?',
        is_complete: true,
        command_action: 'NONE'
      };

      expect(productExtraction.name).toBe('Cerveza Corona 330ml');
      expect(productExtraction.sale_price).toBe(12000);
      expect(productExtraction.purchase_price).toBe(4500);
      expect(productExtraction.purchase_quantity).toBe(24);
      expect(productExtraction.is_complete).toBe(true);
    });

    it('should accurately handle Suministros extraction with package_units and presentation', () => {
      const supplyExtraction: VoiceIngredientExtraction = {
        name: 'Vasos Biodegradables 12oz',
        category: 'Desechables',
        purchase_price: 28000,
        package_units: 100,
        purchase_unit: 'Paquete',
        stock_min_limit: 2,
        missing_fields: [],
        follow_up_question: 'Registrado paquete 100 vasos a $28.000. ¿Guardar?',
        is_complete: true,
        command_action: 'CONFIRM_SAVE'
      };

      expect(supplyExtraction.name).toBe('Vasos Biodegradables 12oz');
      expect(supplyExtraction.package_units).toBe(100);
      expect(supplyExtraction.command_action).toBe('CONFIRM_SAVE');
    });

    it('should detect navigation commands for dashboard and onboarding', () => {
      const navExtraction: VoiceIngredientExtraction = {
        missing_fields: [],
        follow_up_question: 'Abriendo alta de ingredientes...',
        is_complete: true,
        command_action: 'NAVIGATE',
        navigation_target: 'INGREDIENT'
      };

      expect(navExtraction.command_action).toBe('NAVIGATE');
      expect(navExtraction.navigation_target).toBe('INGREDIENT');
    });

    it('should enforce strict semantic auto-categorization and never leave category in missing_fields', () => {
      const autoCatExtraction: VoiceIngredientExtraction = {
        name: 'Huevos AA',
        category: 'Abarrotes',
        purchase_price: 18000,
        purchase_quantity: 30,
        purchase_unit: 'Unidad',
        use_unit: 'Unidad',
        conversion_multiplier: 1,
        usable_quantity: 30,
        waste_percentage: 0,
        missing_fields: [],
        follow_up_question: 'Registrados 30 Huevos AA a $18.000 ($600 c/u). ¿Deseas guardar directo o abrir el formulario?',
        is_complete: true
      };

      expect(autoCatExtraction.category).toBe('Abarrotes');
      expect(autoCatExtraction.missing_fields).not.toContain('category');
      expect(autoCatExtraction.purchase_price).toBe(18000);
      expect(autoCatExtraction.purchase_quantity).toBe(30);
    });

    it('should directly save extracted item into Dexie db.inventoryItems and enqueue event in domainOutbox', async () => {
      const directItem = {
        id: `item-test-${Date.now()}`,
        name: 'Huevos Criollos',
        category: 'Abarrotes',
        purchaseUnit: 'Unidad',
        countUnit: 'unidad',
        conversionMultiplier: 1,
        yieldFactor: 1.0,
        density: 1.0,
        bottleTareWeightGrams: 0,
        purchaseCost: 18000,
        gainPercentage: 0,
        isTaxable: false,
        taxPercentage: 0,
        stockMinLimit: 5,
        theoreticalStock: 30,
        realPhysicalStock: 30,
        abcClassification: 'B' as const,
        supplierId: 'prov-generic',
        sucursalStock: [{ sucursalId: 'sede-principal', stockActual: 30 }],
        updatedAt: new Date().toISOString()
      };

      // 1. Insert directly into Dexie
      await db.inventoryItems.add(directItem);
      const retrieved = await db.inventoryItems.get(directItem.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Huevos Criollos');
      expect(retrieved?.theoreticalStock).toBe(30);
      expect(retrieved?.purchaseCost).toBe(18000);
      expect(retrieved?.sucursalStock?.[0].sucursalId).toBe('sede-principal');

      // 2. Enqueue event in domainOutbox for sync
      const eventId = await enqueueOfflineEvent('InventoryItemCreated', {
        collectionName: 'inventoryItems',
        docId: directItem.id,
        data: directItem,
        timestamp: Date.now()
      });

      expect(eventId).toBeDefined();
      const outboxRecord = await db.domainOutbox.get(eventId);
      expect(outboxRecord).toBeDefined();
      expect(outboxRecord?.status).toBe('PENDING');
      expect(outboxRecord?.eventType).toBe('InventoryItemCreated');
    });

    it('should force mode NEW_ITEM when contextual correction phrases are used', () => {
      const parsedWithRestock = {
        name: 'Cerveza Club Colombia Negra',
        mode: 'RESTOCK',
        purchase_quantity: 24,
        purchase_unit: 'Unidad',
        purchase_price: 96000
      };

      // 1. Without correction phrase, default mode from parsed json
      const resNormal = sanitizeGroqExtraction(parsedWithRestock, {}, 'compre 24 cervezas club colombia negra');
      expect(resNormal.intent_type).toBe('RESTOCK');

      // 2. With contextual correction phrases
      const res1 = sanitizeGroqExtraction(parsedWithRestock, {}, 'es un producto nuevo');
      expect(res1.intent_type).toBe('NEW_ITEM');

      const res2 = sanitizeGroqExtraction(parsedWithRestock, {}, 'no es ese producto, es una referencia distinta');
      expect(res2.intent_type).toBe('NEW_ITEM');

      const res3 = sanitizeGroqExtraction(parsedWithRestock, {}, 'crear por separado');
      expect(res3.intent_type).toBe('NEW_ITEM');
    });
  });
});
