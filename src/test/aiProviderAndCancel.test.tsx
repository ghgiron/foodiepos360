// src/test/aiProviderAndCancel.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../db/localDb';
import { 
  runWithAbortTimeout, 
  processVoicePromptWithGroq,
  buildGroqSystemPrompt,
  sanitizeGroqExtraction,
  safeParseJson,
  getGroqApiKey, 
  setGroqApiKey, 
  hasGroqApiKey,
  resolveGroqApiKey 
} from '../services/groqCopilotService';
import { 
  getActiveAIProvider, 
  setActiveAIProvider, 
  hasAnyAiApiKey 
} from '../utils/geminiConfig';
import { VoiceCopilotProvider } from '../context/VoiceCopilotContext';
import VoiceCopilotWidget from '../components/voice/VoiceCopilotWidget';
import FoodieBotHeaderButton from '../components/voice/FoodieBotHeaderButton';
import SettingsPanel from '../components/settingsPanel';
import * as groqCopilotService from '../services/groqCopilotService';

describe('Foodie Bot - Groq Cloud (Llama 3.3 / 3.1), AbortController Timeout & Cancel Draft', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.inventoryItems.clear();
    await db.inventoryLogs.clear();
    await db.domainOutbox.clear();
    await db.systemSettings.clear();
    vi.restoreAllMocks();
  });

  describe('1. AbortController Timeout Utility (runWithAbortTimeout)', () => {
    it('should resolve normally when the operation completes before the timeout', async () => {
      const result = await runWithAbortTimeout(async (signal) => {
        expect(signal.aborted).toBe(false);
        return 'success_payload';
      }, 500);

      expect(result).toBe('success_payload');
    });

    it('should abort signal and throw TIMEOUT_EXCEEDED when operation exceeds timeout', async () => {
      let signalAborted = false;

      const promise = runWithAbortTimeout(async (signal) => {
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            signalAborted = true;
          });
          // Intentionally never resolve before timeout
          setTimeout(() => resolve('too_late'), 500);
        });
      }, 50);

      await expect(promise).rejects.toThrow('TIMEOUT_EXCEEDED');
      expect(signalAborted).toBe(true);
    });
  });

  describe('2. Groq Cloud Config & State Store', () => {
    it('should store and retrieve Groq Cloud API Key in foodie_groq_api_key', () => {
      expect(hasGroqApiKey()).toBe(false);
      expect(hasAnyAiApiKey()).toBe(false);

      setGroqApiKey('gsk_test_123456789');
      expect(getGroqApiKey()).toBe('gsk_test_123456789');
      expect(hasGroqApiKey()).toBe(true);
      expect(hasAnyAiApiKey()).toBe(true);
      expect(localStorage.getItem('foodie_groq_api_key')).toBe('gsk_test_123456789');

      setActiveAIProvider('groq');
      expect(getActiveAIProvider()).toBe('groq');

      setActiveAIProvider('gemini');
      expect(getActiveAIProvider()).toBe('gemini');

      setActiveAIProvider('auto');
      expect(getActiveAIProvider()).toBe('auto');
    });

    it('should resolve key from Dexie db.systemSettings and sync to localStorage', async () => {
      localStorage.clear();
      expect(getGroqApiKey()).toBe('');

      await db.systemSettings.put({ key: 'foodie_groq_api_key', value: 'gsk_dexie_persisted_key' });

      const resolved = await resolveGroqApiKey();
      expect(resolved).toBe('gsk_dexie_persisted_key');
      expect(localStorage.getItem('foodie_groq_api_key')).toBe('gsk_dexie_persisted_key');
      expect(getGroqApiKey()).toBe('gsk_dexie_persisted_key');
    });
  });

  describe('3. Groq Cloud Prompt & Strict JSON Schema', () => {
    it('should generate system prompt enforcing strict JSON with mode, category_id and summary_message', () => {
      const prompt = buildGroqSystemPrompt({
        existingCategories: ['Proteínas', 'Bebidas'],
        existingSuppliers: [{ id: 'prov-1', name: 'Bavaria' }],
        configuredUnits: [{ name: 'Kilogramo', baseEquivalence: 1000, baseUnit: 'g' }]
      });

      expect(prompt).toContain('"mode": "RESTOCK" | "NEW_ITEM"');
      expect(prompt).toContain('"category_id"');
      expect(prompt).toContain('"summary_message"');
      expect(prompt).toContain('Proteínas, Bebidas');
      expect(prompt).toContain('Bavaria');
    });

    it('should sanitize strict JSON extraction into complete VoiceIngredientExtraction', () => {
      const parsedFromGroq = {
        mode: 'NEW_ITEM',
        name: 'Carne Molida Especial',
        category_id: 'Proteínas',
        supplier_id: 'prov-1',
        supplier_name: 'Carnes San José',
        purchase_quantity: 10,
        purchase_unit: 'Kilogramo',
        purchase_price: 150000,
        use_unit: 'Gramo',
        usable_quantity: 9500,
        waste_percentage: 5,
        summary_message: 'He preparado el registro de Carne Molida Especial:'
      };

      const result = sanitizeGroqExtraction(parsedFromGroq);
      expect(result.name).toBe('Carne Molida Especial');
      expect(result.intent_type).toBe('NEW_ITEM');
      expect(result.category).toBe('Proteínas');
      expect(result.purchase_price).toBe(150000);
      expect(result.purchase_quantity).toBe(10);
      expect(result.purchase_unit).toBe('Kilogramo');
      expect(result.use_unit).toBe('Gramo');
      expect(result.conversion_multiplier).toBe(1000);
      expect(result.usable_quantity).toBe(9500);
      expect(result.waste_percentage).toBe(5);
      expect(result.supplier_name).toBe('Carnes San José');
      expect(result.follow_up_question).toBe('He preparado el registro de Carne Molida Especial:');
    });

    it('should throw clear error when no Groq API Key is configured', async () => {
      await expect(processVoicePromptWithGroq('Compre 5 kilos de arroz')).rejects.toThrow(
        /No se encontró una API Key de Groq Cloud configurada/i
      );
    });

    it('should execute primary model openai/gpt-oss-120b and fallback to openai/gpt-oss-20b on 429', async () => {
      setGroqApiKey('gsk_valid_key');

      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options: any) => {
        callCount++;
        const body = JSON.parse(options.body);

        if (callCount === 1) {
          expect(body.model).toBe('openai/gpt-oss-120b');
          // Primary model rate-limited (429)
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limit reached'
          } as any;
        }

        // Fallback model
        expect(body.model).toBe('openai/gpt-oss-20b');
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    mode: 'NEW_ITEM',
                    name: 'Cerveza Aguila',
                    category_id: 'Bebidas',
                    purchase_quantity: 30,
                    purchase_unit: 'Unidad',
                    purchase_price: 75000,
                    use_unit: 'Unidad',
                    usable_quantity: 30,
                    waste_percentage: 0,
                    summary_message: 'He preparado el registro de Cerveza Aguila:'
                  })
                }
              }
            ]
          })
        } as any;
      });

      const result = await processVoicePromptWithGroq('Compré 30 cervezas aguila a 75000');
      expect(callCount).toBe(2);
      expect(result.name).toBe('Cerveza Aguila');
      expect(result.purchase_price).toBe(75000);
    });
  });

  describe('4. Cancel / Descartar Button in Foodie Bot Draft Card', () => {
    it('should discard current draft on clicking [✕ Cancelar] without writing to Dexie', async () => {
      setGroqApiKey('gsk_mock_test_key');

      // Mock processVoicePromptWithGroq to return a draft item
      vi.spyOn(groqCopilotService, 'processVoicePromptWithGroq').mockResolvedValue({
        name: 'Pechuga de Pollo',
        category: 'Carnes',
        purchase_quantity: 5,
        purchase_unit: 'Kilogramo',
        purchase_price: 65000,
        conversion_multiplier: 1000,
        usable_quantity: 4500,
        waste_percentage: 10,
        intent_type: 'NEW_ITEM',
        command_action: 'NONE',
        missing_fields: [],
        follow_up_question: 'He preparado el registro de "Pechuga de Pollo":',
        is_complete: true
      });

      render(
        <VoiceCopilotProvider initialMode="DASHBOARD">
          <div>
            <FoodieBotHeaderButton />
            <VoiceCopilotWidget />
          </div>
        </VoiceCopilotProvider>
      );

      // Open Foodie Bot
      const openBtn = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
      fireEvent.click(openBtn);

      // Type and send message
      const input = screen.getByPlaceholderText(/escribe o dicta/i);
      fireEvent.change(input, { target: { value: 'Compré 5 kilos de pechuga a 65000' } });

      const sendBtn = screen.getByRole('button', { name: /enviar texto a foodie bot/i });
      fireEvent.click(sendBtn);

      // Wait for the draft card to render
      await waitFor(() => {
        expect(screen.getByText('Pechuga de Pollo')).toBeDefined();
        expect(screen.getByText(/guardar/i)).toBeDefined();
      });

      // Find and click the Cancel button
      const cancelBtn = screen.getByText(/cancelar/i);
      expect(cancelBtn).toBeDefined();
      fireEvent.click(cancelBtn);

      // Verify cancellation notice is displayed
      await waitFor(() => {
        expect(screen.getByText(/operación cancelada\. el chat está listo para recibir una nueva orden/i)).toBeDefined();
      });

      // Verify NO item was saved in Dexie
      const count = await db.inventoryItems.count();
      expect(count).toBe(0);

      const logsCount = await db.inventoryLogs.count();
      expect(logsCount).toBe(0);
    });
  });

  describe('5. Timeout Error Handling in VoiceCopilotWidget', () => {
    it('should display timeout warning when LLM request times out with AbortController', async () => {
      setGroqApiKey('gsk_mock_test_key');

      // Mock processVoicePromptWithGroq to throw timeout
      vi.spyOn(groqCopilotService, 'processVoicePromptWithGroq').mockRejectedValue(
        new Error('TIMEOUT_EXCEEDED')
      );

      render(
        <VoiceCopilotProvider initialMode="DASHBOARD">
          <div>
            <FoodieBotHeaderButton />
            <VoiceCopilotWidget />
          </div>
        </VoiceCopilotProvider>
      );

      // Open Foodie Bot
      const openBtn = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
      fireEvent.click(openBtn);

      // Type and send message
      const input = screen.getByPlaceholderText(/escribe o dicta/i);
      fireEvent.change(input, { target: { value: 'Cualquier cosa' } });

      const sendBtn = screen.getByRole('button', { name: /enviar texto a foodie bot/i });
      fireEvent.click(sendBtn);

      // Wait for error notice
      await waitFor(() => {
        expect(screen.getByText(/tiempo de espera agotado\. por favor intenta de nuevo/i)).toBeDefined();
      });

      // Verify input and processing states are restored
      expect(input.getAttribute('disabled')).toBeNull();
    });
  });

  describe('6. Missing API Key Guided Chat Message & Settings Navigation', () => {
    it('should show guided message with interactive settings button when no Groq key exists and navigate on click', async () => {
      localStorage.clear();
      await db.systemSettings.clear();

      let navigatedTarget: string | null = null;
      const navListener = (e: any) => {
        navigatedTarget = e?.detail?.target;
      };
      let openSettingsFired = false;
      const openSettingsListener = () => {
        openSettingsFired = true;
      };
      window.addEventListener('copilot-navigate', navListener);
      window.addEventListener('open-settings', openSettingsListener);

      render(
        <VoiceCopilotProvider initialMode="DASHBOARD">
          <div>
            <FoodieBotHeaderButton />
            <VoiceCopilotWidget />
          </div>
        </VoiceCopilotProvider>
      );

      // Open Foodie Bot
      const openBtn = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
      fireEvent.click(openBtn);

      // Try sending a message with no API key configured
      const input = screen.getByPlaceholderText(/escribe o dicta/i);
      fireEvent.change(input, { target: { value: 'Compré 10 kilos de arroz' } });
      const sendBtn = screen.getByRole('button', { name: /enviar texto a foodie bot/i });
      fireEvent.click(sendBtn);

      // Verify guided assistant message is rendered in the chat
      await waitFor(() => {
        expect(screen.getByText(/no se encontró una api key de groq cloud configurada/i)).toBeDefined();
      });

      // Verify interactive button to open settings is present
      const settingsBtn = screen.getByRole('button', { name: /abrir ajustes de configuración/i });
      expect(settingsBtn).toBeDefined();

      // Click the settings button
      fireEvent.click(settingsBtn);

      // Verify navigation events fired
      expect(navigatedTarget).toBe('SETTINGS');
      expect(openSettingsFired).toBe(true);

      window.removeEventListener('copilot-navigate', navListener);
      window.removeEventListener('open-settings', openSettingsListener);
    });
  });

  describe('7. SettingsPanel Groq API Key Configuration', () => {
    it('should display Groq API Key input, password visibility toggle, console.groq.com link, and persist to localStorage and Dexie on save', async () => {
      localStorage.clear();
      await db.systemSettings.clear();

      render(<SettingsPanel />);

      // Verify Groq API Key input exists
      const groqInput = screen.getByPlaceholderText('gsk_...');
      expect(groqInput).toBeDefined();
      expect(groqInput.getAttribute('type')).toBe('password');

      // Verify direct link to console.groq.com
      const groqLinks = screen.getAllByRole('link', { name: /console\.groq\.com/i });
      expect(groqLinks.length).toBeGreaterThanOrEqual(1);
      groqLinks.forEach(link => {
        expect(link.getAttribute('href')).toBe('https://console.groq.com');
        expect(link.getAttribute('target')).toBe('_blank');
      });

      // Toggle password visibility
      const toggleVisibilityBtn = screen.getByTitle(/mostrar clave groq/i);
      expect(toggleVisibilityBtn).toBeDefined();
      fireEvent.click(toggleVisibilityBtn);
      expect(groqInput.getAttribute('type')).toBe('text');

      fireEvent.click(toggleVisibilityBtn);
      expect(groqInput.getAttribute('type')).toBe('password');

      // Enter new Groq API Key
      fireEvent.change(groqInput, { target: { value: 'gsk_live_testing_key_settings_888' } });

      // Click "Guardar Configuración IA"
      const saveBtn = screen.getByRole('button', { name: /guardar configuración ia/i });
      fireEvent.click(saveBtn);

      // Verify stored in localStorage
      expect(localStorage.getItem('foodie_groq_api_key')).toBe('gsk_live_testing_key_settings_888');

      // Verify persisted in Dexie db.systemSettings
      await waitFor(async () => {
        const dexieSetting = await db.systemSettings.get('foodie_groq_api_key');
        expect(dexieSetting?.value).toBe('gsk_live_testing_key_settings_888');
      });
    });

    it('should test Groq connection and display green badge "✓ Conexión exitosa" on success', async () => {
      localStorage.clear();
      render(<SettingsPanel />);

      const groqInput = screen.getByPlaceholderText('gsk_...');
      fireEvent.change(groqInput, { target: { value: 'gsk_valid_key_123' } });

      const testSpy = vi.spyOn(groqCopilotService, 'testGroqApiKey').mockResolvedValueOnce({
        success: true,
        message: '✓ Conexión exitosa con Groq (GPT-OSS 120B)'
      });

      const testBtn = screen.getByTestId('test-groq-btn');
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(testSpy).toHaveBeenCalledWith('gsk_valid_key_123');
        const successBadge = screen.getByTestId('groq-success-badge');
        expect(successBadge).toBeDefined();
        expect(successBadge.textContent).toContain('✓ Conexión exitosa con Groq (GPT-OSS 120B)');
      });
    });

    it('should test Groq connection and display error message and JSON details on failure', async () => {
      localStorage.clear();
      render(<SettingsPanel />);

      const groqInput = screen.getByPlaceholderText('gsk_...');
      fireEvent.change(groqInput, { target: { value: 'gsk_invalid_key_456' } });

      const testSpy = vi.spyOn(groqCopilotService, 'testGroqApiKey').mockResolvedValueOnce({
        success: false,
        message: 'Groq rechazó la clave (HTTP 401): "Invalid API Key". Verifica tu clave en console.groq.com.',
        details: { error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } }
      });

      const testBtn = screen.getByTestId('test-groq-btn');
      fireEvent.click(testBtn);

      await waitFor(() => {
        expect(testSpy).toHaveBeenCalledWith('gsk_invalid_key_456');
        const errorCard = screen.getByTestId('groq-error-card');
        expect(errorCard).toBeDefined();
        expect(errorCard.textContent).toContain('Error de conexión con Groq Cloud');
        expect(errorCard.textContent).toContain('Invalid API Key');
        expect(errorCard.textContent).toContain('invalid_request_error');
      });
    });
  });

  describe('8. testGroqApiKey endpoint verification and error extraction', () => {
    it('should execute a real minimal ping against chat/completions with openai/gpt-oss-120b', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '¡Hola!' } }] })
      } as any);

      const result = await groqCopilotService.testGroqApiKey('gsk_test_key');
      expect(result.success).toBe(true);
      expect(result.message).toBe('✓ Conexión exitosa con Groq (GPT-OSS 120B)');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer gsk_test_key',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'Hola' }],
            max_tokens: 5
          })
        })
      );
    });

    it('should ensure model IDs contain only pure ASCII hyphens (code 45) and no typographic dashes', () => {
      expect(groqCopilotService.DEFAULT_MODEL).toBe('openai/gpt-oss-120b');
      expect(groqCopilotService.GROQ_FALLBACK_MODEL).toBe('openai/gpt-oss-20b');
      expect(groqCopilotService.TIMEOUT_MS).toBe(15000);

      // Verify every character in DEFAULT_MODEL is ASCII
      for (const char of groqCopilotService.DEFAULT_MODEL) {
        expect(char.charCodeAt(0)).toBeLessThan(128);
        if (char === '-') {
          expect(char.charCodeAt(0)).toBe(45); // ASCII hyphen-minus
        }
      }

      // Verify every character in GROQ_FALLBACK_MODEL is ASCII
      for (const char of groqCopilotService.GROQ_FALLBACK_MODEL) {
        expect(char.charCodeAt(0)).toBeLessThan(128);
        if (char === '-') {
          expect(char.charCodeAt(0)).toBe(45); // ASCII hyphen-minus
        }
      }

      // Verify all candidate models contain clean ASCII
      for (const model of groqCopilotService.GROQ_CANDIDATE_MODELS) {
        for (const char of model) {
          expect(char.charCodeAt(0)).toBeLessThan(128);
          if (char === '-') {
            expect(char.charCodeAt(0)).toBe(45);
          }
        }
      }
    });

    it('should extract error JSON and return details on HTTP 404 or 401', async () => {
      const errorPayload = {
        error: {
          message: 'The model `invalid_model` does not exist or you do not have access to it.',
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => errorPayload
      } as any);

      const result = await groqCopilotService.testGroqApiKey('gsk_test_key');
      expect(result.success).toBe(false);
      expect(result.message).toContain('404');
      expect(result.details).toEqual(errorPayload);
    });
  });

  describe('9. safeParseJson & Descriptive Groq Cloud Error Exposure', () => {
    it('should parse JSON wrapped in markdown, trailing commas and comments', () => {
      const rawWithFences = '```json\n{\n  "mode": "NEW_ITEM",\n  "name": "Vino Malbec",\n  "purchase_price": 45000,\n}\n```';
      const parsed = safeParseJson(rawWithFences);
      expect(parsed.name).toBe('Vino Malbec');
      expect(parsed.purchase_price).toBe(45000);
      expect(parsed.mode).toBe('NEW_ITEM');
    });

    it('should use regex fallback when JSON is malformed but contains target fields', () => {
      const partiallyBroken = 'Here is the extraction: {"name": "Ron Medellín 8 Años", "purchase_price": 60000, unclosed_syntax';
      const parsed = safeParseJson(partiallyBroken);
      expect(parsed.name).toBe('Ron Medellín 8 Años');
      expect(parsed.purchase_price).toBe(60000);
    });

    it('should display descriptive error message in VoiceCopilotWidget when Groq returns HTTP 400', async () => {
      setGroqApiKey('gsk_test_key_400');

      vi.spyOn(groqCopilotService, 'processVoicePromptWithGroq').mockRejectedValueOnce(
        Object.assign(new Error('Groq HTTP 400: Failed to generate JSON'), {
          status: 400,
          detail: 'Failed to generate JSON: schema violation'
        })
      );

      render(
        <VoiceCopilotProvider initialMode="DASHBOARD">
          <div>
            <FoodieBotHeaderButton />
            <VoiceCopilotWidget />
          </div>
        </VoiceCopilotProvider>
      );

      const openBtn = screen.getByRole('button', { name: /foodie bot \(asistente de voz ia\)/i });
      fireEvent.click(openBtn);

      const input = screen.getByPlaceholderText(/escribe o dicta/i);
      fireEvent.change(input, { target: { value: 'Registrar producto' } });

      const sendBtn = screen.getByRole('button', { name: /enviar texto a foodie bot/i });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByText(/Error en solicitud a Groq Cloud \(HTTP 400\)/i)).toBeDefined();
      });
    });
  });
});
