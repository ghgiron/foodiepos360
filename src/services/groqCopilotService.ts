// src/services/groqCopilotService.ts
import { getSystemSetting } from '../db/settingsStore';
import { normalizeUnitToOfficial } from '../utils/costEngine';
import type { 
  VoiceIngredientExtraction, 
  CopilotContextData, 
  CopilotMessage,
  OperationIntentType
} from '../types/voiceCopilot';

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const GROQ_PRIMARY_MODEL = DEFAULT_MODEL;
export const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-20b';
export const GROQ_CANDIDATE_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];
export const TIMEOUT_MS = 15000; // 15 seconds maximum timeout

/**
 * Retrieves the active Groq Cloud API Key following strict priority:
 * 1. localStorage.getItem('foodie_groq_api_key') (user configuration in app)
 * 2. import.meta.env.VITE_GROQ_API_KEY (optional environment variable fallback)
 */
export function getGroqApiKey(): string {
  // 1. localStorage.getItem('foodie_groq_api_key')
  if (typeof window !== 'undefined') {
    try {
      const localKey = localStorage.getItem('foodie_groq_api_key');
      if (localKey && localKey.trim()) {
        return localKey.trim();
      }
    } catch {
      // localStorage may fail in restricted sandboxes
    }
  }

  // 2. import.meta.env.VITE_GROQ_API_KEY
  const envKey = (import.meta as any).env?.VITE_GROQ_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }

  return '';
}

/**
 * Asynchronously resolves the Groq Cloud API Key.
 * Checks localStorage and Vite env first, then falls back to Dexie.js (db.systemSettings).
 * Syncs the key back into localStorage if found in Dexie for fast future synchronous lookups.
 */
export async function resolveGroqApiKey(): Promise<string> {
  const syncKey = getGroqApiKey();
  if (syncKey) return syncKey;

  // 3. Fallback to Dexie db.systemSettings
  try {
    const dexieKey = await getSystemSetting<string>('foodie_groq_api_key');
    if (dexieKey && dexieKey.trim()) {
      const cleanKey = dexieKey.trim();
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('foodie_groq_api_key', cleanKey);
        } catch {}
      }
      return cleanKey;
    }
  } catch (err) {
    console.warn('[groqCopilotService] Error reading foodie_groq_api_key from Dexie systemSettings:', err);
  }

  return '';
}

/**
 * Sets and persists the Groq Cloud API Key in localStorage.
 */
export function setGroqApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (!key || !key.trim()) {
      localStorage.removeItem('foodie_groq_api_key');
    } else {
      localStorage.setItem('foodie_groq_api_key', key.trim());
    }
  }
}

/**
 * Checks whether a Groq Cloud API Key is configured.
 */
export function hasGroqApiKey(): boolean {
  return getGroqApiKey().length > 0;
}

/**
 * Runs an asynchronous promise factory inside an AbortController with a 10s maximum timeout.
 * Rejects cleanly with a 'TIMEOUT_EXCEEDED' TimeoutError if the time limit is reached.
 */
export async function runWithAbortTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error('TIMEOUT_EXCEEDED'));
      const err = new Error('TIMEOUT_EXCEEDED');
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });

  try {
    const operationPromise = promiseFactory(controller.signal);
    const result = await Promise.race([operationPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (err: any) {
    if (timer) clearTimeout(timer);
    if (
      controller.signal.aborted ||
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      err?.message === 'TIMEOUT_EXCEEDED' ||
      String(err).includes('aborted')
    ) {
      const timeoutError = new Error('TIMEOUT_EXCEEDED');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw err;
  }
}

/**
 * Strips markdown code blocks and returns clean JSON text.
 */
export function cleanJsonOutput(raw: string): string {
  if (!raw) return '{}';
  let cleaned = raw.trim();

  // Strip markdown code fences anywhere in text
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Find outermost { and }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

/**
 * Safely parses and repairs JSON text produced by LLMs.
 * Removes trailing commas, comments, and uses regex fallback if necessary.
 */
export function safeParseJson(raw: string): any {
  if (!raw) return {};
  const cleaned = cleanJsonOutput(raw);

  try {
    return JSON.parse(cleaned);
  } catch (initialErr) {
    // Attempt repairs:
    // 1. Remove trailing commas before } or ]
    const repaired = cleaned
      .replace(/,\s*([}\]])/g, '$1')
      // 2. Remove JavaScript comments
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    try {
      return JSON.parse(repaired);
    } catch {
      // 3. Fallback: extraction via regex of key fields
      const extracted: any = {};
      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/i);
      if (nameMatch) extracted.name = nameMatch[1];

      const modeMatch = raw.match(/"mode"\s*:\s*"([^"]+)"/i);
      if (modeMatch) extracted.mode = modeMatch[1];

      const catMatch = raw.match(/"(?:category_id|category|categoria)"\s*:\s*"([^"]+)"/i);
      if (catMatch) extracted.category_id = catMatch[1];

      const priceMatch = raw.match(/"(?:purchase_price|precio|costo)"\s*:\s*(\d+)/i);
      if (priceMatch) extracted.purchase_price = parseInt(priceMatch[1], 10);

      const qtyMatch = raw.match(/"(?:purchase_quantity|cantidad)"\s*:\s*([\d.]+)/i);
      if (qtyMatch) extracted.purchase_quantity = parseFloat(qtyMatch[1]);

      const unitMatch = raw.match(/"(?:purchase_unit|unidad_compra)"\s*:\s*"([^"]+)"/i);
      if (unitMatch) extracted.purchase_unit = unitMatch[1];

      const useUnitMatch = raw.match(/"(?:use_unit|unidad_uso)"\s*:\s*"([^"]+)"/i);
      if (useUnitMatch) extracted.use_unit = useUnitMatch[1];

      const summaryMatch = raw.match(/"summary_message"\s*:\s*"([^"]+)"/i);
      if (summaryMatch) extracted.summary_message = summaryMatch[1];

      if (extracted.name || extracted.purchase_price) {
        return extracted;
      }

      throw initialErr;
    }
  }
}

/**
 * Builds the strict System Prompt for Groq Cloud (Llama 3.3 / Llama 3.1)
 * injecting Dexie master data context (categories, suppliers, units, stock samples).
 */
export function buildGroqSystemPrompt(context?: CopilotContextData): string {
  const categoriesList = (context?.existingCategories && context.existingCategories.length > 0)
    ? context.existingCategories.join(', ')
    : 'Proteínas, Vegetales, Frutas, Lácteos, Abarrotes, Licores, Bebidas, Salsas, Empaques, Desechables';

  const suppliersList = (context?.existingSuppliers && context.existingSuppliers.length > 0)
    ? context.existingSuppliers.map(s => `"${s.name}" (ID: ${s.id})`).join(', ')
    : 'Sin proveedores específicos';

  const unitsList = (context?.configuredUnits && context.configuredUnits.length > 0)
    ? context.configuredUnits.map(u => u.name).join(', ')
    : 'Kilogramo, Gramo, Libra, Litro, Mililitro, Botella 750ml, Onza, Unidad';

  const stockSummary = (context?.currentStockItems || [])
    .slice(0, 25)
    .map(i => `${i.name} (Stock: ${i.stock} ${i.unit})`)
    .join('; ');

  return `Eres "Foodie Bot", asistente culinario e inteligente de inventario para gastrobares y restaurantes en FoodiePOS 360.
Tu motor de inferencia es Groq Cloud (OpenAI GPT-OSS / Llama). Tu misión es procesar el dictado o texto del usuario y responder en formato JSON extrayendo los datos de inventario con máxima precisión.

CATÁLOGO ACTIVO DEL SISTEMA (DEXIE.JS):
- Categorías disponibles: [ ${categoriesList} ]
- Proveedores registrados: [ ${suppliersList} ]
- Unidades de medida oficiales: [ ${unitsList} ]
${stockSummary ? `- Muestra de existencias en local: [ ${stockSummary} ]` : ''}

REGLAS ESTRICTAS DE EXTRACCIÓN Y RESPUESTA:
1. DEBES responder EXCLUSIVAMENTE con un único objeto JSON válido (sin explicaciones previas ni posteriores, sin bloques markdown adicionales).
2. Estructura exacta y obligatoria del JSON:
{
  "mode": "RESTOCK" | "NEW_ITEM",
  "name": "Nombre limpio del ítem en mayúscula inicial (ej: Salmón, Cerveza Corona)",
  "category_id": "Categoría más afín autoseleccionada de la lista existente",
  "supplier_id": "ID del proveedor si coincide, o null",
  "supplier_name": "Nombre del proveedor mencionado o null",
  "purchase_quantity": 10,
  "purchase_unit": "Kilogramo",
  "purchase_price": 70000,
  "sale_price": null,
  "use_unit": "Gramo",
  "usable_quantity": 10000,
  "waste_percentage": 0,
  "summary_message": "He preparado el registro de Salmón:"
}

3. MODO DE OPERACIÓN ("mode"):
   - "RESTOCK": Si el usuario indica reabastecimiento, entrada o compra de un ítem existente en el inventario sin variantes o modificaciones distintivas.
   - "NEW_ITEM": Si es un elemento nuevo, una referencia distinta o si el usuario indica frases de corrección contextual como:
     "es un producto nuevo", "referencia distinta", "referencia diferente", "crear por separado", "no es ese producto", "guardar por separado".
     ANTE CUALQUIERA DE ESTAS FRASES O COMANDOS DE CORRECCIÓN CONTEXTUAL, DEBES FORZAR ESTRICTAMENTE "mode": "NEW_ITEM".

4. PRECIOS Y NÚMEROS:
   - "purchase_price": SIEMPRE como número entero puro en COP (ej: 70000, 18000). Si el usuario dice "70 mil", es 70000. Si dice "$18.000", es 18000. NUNCA uses strings con "mil" ni símbolos "$".
   - "purchase_quantity": SIEMPRE como número (ej: 10). Si dice "10 kilos", pon 10. NUNCA dejes en 1 si el usuario dictó otra cantidad.
   - "waste_percentage": Número puro (0 si no indica merma). Si dice "10% de merma", pon 10.
   - "sale_price": Precio de venta al público en COP como número entero si lo indica (ej: 12000), o null si es solo costo/ingrediente.

5. CATEGORIZACIÓN AUTÓNOMA ("category_id"):
   - SIEMPRE asigna de forma autónoma la categoría MÁS AFÍN de la lista existente [ ${categoriesList} ]. NUNCA la dejes vacía si puedes inferirla.

6. MENSAJE RESUMEN ("summary_message"):
   - Debe ser directo y profesional (ej: 'He preparado el registro de [Nombre]:'). NUNCA hagas preguntas de cierre redundantes como '¿Deseas guardar?'.
   - Si el usuario saluda o realiza una consulta abierta, proporciona una respuesta cordial en "summary_message" manteniendo el objeto JSON con name vacío y modo "NEW_ITEM".

7. MANEJO ESTRICTO DE VARIANTES Y REFERENCIAS:
   - Exige coincidencia estricta de modificadores clave: colores (ej: 'Roja' vs 'Negra', 'Dorada', 'Rubia'), formulaciones o tipos ('Light', 'Zero', 'Sin gas', 'Con gas', 'Doble Malta', 'Sin alcohol', 'Sin azúcar'), sabores o presentaciones no presentes exactamente en el ítem existente.
   - Si el texto incluye un adjetivo o atributo diferenciador no presente exactamente en el ítem del catálogo, DEBES clasificarlo prioritariamente como "mode": "NEW_ITEM" con su nombre completo y exacto (ej: 'Cerveza Club Colombia Negra').`;
}

/**
 * Builds the conversation prompt combining context and recent message turns.
 */
function buildUserConversationPrompt(
  userPrompt: string,
  context?: CopilotContextData,
  chatHistory: CopilotMessage[] = []
): string {
  const isDirectEntry = /\b(\d+|\$|compr[éeó]|kilos?|litros?|gramos?|unidades?|botellas?|paquetes?|pesos|cost[óo])\b/i.test(userPrompt);
  const maxHistoryTurns = isDirectEntry ? -2 : -4;

  const previousTurns = chatHistory
    .filter(m => m.sender === 'user' || m.sender === 'assistant')
    .slice(maxHistoryTurns)
    .map(m => `${m.sender === 'user' ? 'Usuario' : 'Foodie Bot'}: ${m.text}`)
    .join('\n');

  const currentFormContext = (context?.currentFormState && !isDirectEntry)
    ? `\nValores actuales en formulario: ${JSON.stringify(context.currentFormState)}`
    : '';

  return `${previousTurns ? `Historial reciente de conversación:\n${previousTurns}\n\n` : ''}${currentFormContext}Mensaje/orden del usuario: "${userPrompt}"\n\nResponde estrictamente en formato JSON con la información extraída.`;
}

/**
 * Normalizes and validates the extracted JSON from Groq into a complete VoiceIngredientExtraction.
 */
export function sanitizeGroqExtraction(
  parsed: any, 
  _context?: CopilotContextData, 
  userPrompt?: string
): VoiceIngredientExtraction {
  const rawName = (parsed.name || parsed.nombre || '').trim();
  const finalName = rawName 
    ? rawName.charAt(0).toUpperCase() + rawName.slice(1) 
    : undefined;

  // Contextual correction command check: forces NEW_ITEM if user indicates it's a new item or different reference
  const isCorrectionToNewItem = Boolean(userPrompt && /(es\s+(un\s+)?(producto|item|art[íi]culo|referencia)\s+nuev[oa]|referencia\s+(distinta|diferente|nueva|otra)|crear\s+por\s+(separado|aparte)|guardar\s+por\s+(separado|aparte)|no\s+es\s+es[te]\s+producto|otra\s+referencia|por\s+separado)/i.test(userPrompt));

  // Mode / Intent
  const modeStr = String(parsed.mode || parsed.intent_type || '').toUpperCase();
  let intent_type: OperationIntentType = modeStr === 'RESTOCK' ? 'RESTOCK' : 'NEW_ITEM';
  if (isCorrectionToNewItem) {
    intent_type = 'NEW_ITEM';
  }

  // Category
  const finalCategory = (parsed.category_id || parsed.category || parsed.categoria || 'Abarrotes').trim();

  // Units & multipliers
  const purchaseUnit = parsed.purchase_unit || parsed.unidad_compra || 'Unidad';
  const normPurchaseUnit = normalizeUnitToOfficial(purchaseUnit);
  const useUnit = parsed.use_unit || parsed.unidad_uso || normPurchaseUnit;
  const normUseUnit = normalizeUnitToOfficial(useUnit);

  let multiplier = Number(parsed.conversion_multiplier);
  if (isNaN(multiplier) || multiplier <= 0) {
    if (normPurchaseUnit === 'Kilogramo' && normUseUnit === 'Gramo') multiplier = 1000;
    else if (normPurchaseUnit === 'Litro' && normUseUnit === 'Mililitro') multiplier = 1000;
    else if (normPurchaseUnit === 'Libra' && normUseUnit === 'Gramo') multiplier = 500;
    else multiplier = 1;
  }

  // Quantities & price
  const purchaseQty = typeof parsed.purchase_quantity === 'number' 
    ? parsed.purchase_quantity 
    : Number(String(parsed.purchase_quantity || 1).replace(/[^0-9.-]+/g, '')) || 1;

  const purchasePrice = typeof parsed.purchase_price === 'number'
    ? parsed.purchase_price
    : Number(String(parsed.purchase_price || 0).replace(/[^0-9.-]+/g, '')) || 0;

  const wastePct = typeof parsed.waste_percentage === 'number'
    ? Math.max(0, Math.min(100, parsed.waste_percentage))
    : Number(String(parsed.waste_percentage || 0).replace(/[^0-9.-]+/g, '')) || 0;

  let usableQty = typeof parsed.usable_quantity === 'number'
    ? parsed.usable_quantity
    : (purchaseQty * multiplier * (1 - wastePct / 100));

  if (isNaN(usableQty) || usableQty <= 0) {
    usableQty = purchaseQty * multiplier;
  }

  const supplierName = (parsed.supplier_name || parsed.proveedor || '').trim() || undefined;
  const supplierId = parsed.supplier_id || undefined;

  // Command action detection from affirmative words in prompt or JSON
  let commandAction: 'CONFIRM_SAVE' | 'CLEAR_FORM' | 'NAVIGATE' | 'NONE' = 'NONE';
  if (userPrompt && /^(s[íi]|confirmar|confirmo|guardar|gu[áa]rdalo|dale|listo|de acuerdo|adelante|ok|yes)$/i.test(userPrompt.trim())) {
    commandAction = 'CONFIRM_SAVE';
  } else if (userPrompt && /^(limpiar|borrar|cancelar\s+formulario)$/i.test(userPrompt.trim())) {
    commandAction = 'CLEAR_FORM';
  }

  const summaryMessage = (parsed.summary_message || '').trim();
  const followUp = summaryMessage || (finalName 
    ? `He preparado el registro de "${finalName}":` 
    : 'He procesado tus indicaciones.');

  return {
    id: parsed.id || undefined,
    name: finalName,
    category: finalCategory,
    supplier_id: supplierId,
    supplier_name: supplierName,
    supplier_name_to_create: (!supplierId && supplierName) ? supplierName : undefined,
    purchase_price: purchasePrice,
    sale_price: parsed.sale_price !== undefined ? Number(parsed.sale_price) : undefined,
    package_units: parsed.package_units !== undefined ? Number(parsed.package_units) : undefined,
    operation_zone: parsed.operation_zone || undefined,
    purchase_unit: normPurchaseUnit,
    purchase_quantity: purchaseQty,
    use_unit: normUseUnit,
    conversion_multiplier: multiplier,
    usable_quantity: usableQty,
    waste_percentage: wastePct,
    description: parsed.description || undefined,
    missing_fields: [],
    follow_up_question: followUp,
    query_response: summaryMessage || undefined,
    is_complete: Boolean(finalName && purchasePrice > 0),
    command_action: commandAction,
    intent_type,
    reasoning: parsed.reasoning || undefined
  };
}

/**
 * Invokes Groq Cloud chat completions endpoint with structured JSON mode and abort signal.
 */
async function executeGroqRequest(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<any> {
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2048
    }),
    signal
  });

  if (!response.ok) {
    let errorDetail = '';
    let parsedBody: any = null;
    try {
      parsedBody = await response.json();
      errorDetail = parsedBody?.error?.message || parsedBody?.message || JSON.stringify(parsedBody);
    } catch {
      errorDetail = await response.text().catch(() => '');
    }

    if (response.status === 401) {
      const err = new Error('GROQ_KEY_INVALID');
      (err as any).status = 401;
      (err as any).detail = errorDetail || 'API Key no autorizada';
      throw err;
    }
    if (response.status === 429) {
      const err = new Error('GROQ_QUOTA_EXCEEDED');
      (err as any).status = 429;
      (err as any).detail = errorDetail || 'Cuota de peticiones excedida temporalmente en Groq';
      throw err;
    }
    if (response.status === 404) {
      const err = new Error(`Groq HTTP 404 (Endpoint o modelo no encontrado): ${errorDetail || 'Verifica la URL https://api.groq.com/openai/v1/chat/completions y el modelo'}`);
      (err as any).status = 404;
      (err as any).detail = errorDetail;
      throw err;
    }
    const err = new Error(`Groq HTTP ${response.status}: ${errorDetail || response.statusText}`);
    (err as any).status = response.status;
    (err as any).detail = errorDetail || response.statusText;
    throw err;
  }

  const json = await response.json();
  const rawText = json?.choices?.[0]?.message?.content || '{}';
  return safeParseJson(rawText);
}

/**
 * Main inference function for Foodie Bot powered by Groq Cloud (Llama 3.3 70B with 3.1 8B fallback).
 * Enforces a strict 10s AbortController timeout and handles API key validation.
 */
export async function processVoicePromptWithGroq(
  userPrompt: string,
  context?: CopilotContextData,
  chatHistory: CopilotMessage[] = []
): Promise<VoiceIngredientExtraction> {
  let apiKey = getGroqApiKey();
  if (!apiKey) {
    apiKey = await resolveGroqApiKey();
  }

  if (!apiKey) {
    const error = new Error('NO_GROQ_API_KEY');
    error.message = 'No se encontró una API Key de Groq Cloud configurada. Ve a Configuración / Ajustes del Sistema para añadir tu clave gratuita.';
    throw error;
  }

  const systemPrompt = buildGroqSystemPrompt(context);
  const formattedPrompt = buildUserConversationPrompt(userPrompt, context, chatHistory);

  return runWithAbortTimeout(async (signal) => {
    let lastErr: any = null;
    for (const model of GROQ_CANDIDATE_MODELS) {
      try {
        const parsedJson = await executeGroqRequest(
          apiKey,
          model,
          systemPrompt,
          formattedPrompt,
          signal
        );
        return sanitizeGroqExtraction(parsedJson, context, userPrompt);
      } catch (err: any) {
        if (signal.aborted || err?.message === 'TIMEOUT_EXCEEDED' || err?.name === 'TimeoutError') {
          throw err;
        }
        if (err?.message === 'GROQ_KEY_INVALID' || err?.status === 401) {
          throw err;
        }
        console.warn(`[GroqCopilotService] Modelo "${model}" no disponible (${err?.message || err}). Intentando siguiente candidato...`);
        lastErr = err;
      }
    }
    throw lastErr || new Error('GROQ_GENERATION_FAILED');
  }, TIMEOUT_MS);
}

/**
 * Drop-in alias for compatibility with VoiceCopilotWidget and legacy callers.
 */
export const processVoiceIngredientPrompt = processVoicePromptWithGroq;

/**
 * Tests an API Key against Groq Cloud by executing a real minimal ping against active models:
 * Iterates through GROQ_CANDIDATE_MODELS ('openai/gpt-oss-120b', 'openai/gpt-oss-20b', etc.)
 */
export async function testGroqApiKey(key: string): Promise<{ success: boolean; message: string; details?: any; activeModel?: string }> {
  const cleanKey = key?.trim();
  if (!cleanKey) {
    return { success: false, message: 'Por favor ingresa una API Key de Groq para probar.' };
  }

  let lastErrorDetail = '';
  let lastErrorData: any = null;

  for (const model of GROQ_CANDIDATE_MODELS) {
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hola' }],
          max_tokens: 5
        })
      });

      if (res.ok) {
        const displayNames: Record<string, string> = {
          'openai/gpt-oss-120b': 'GPT-OSS 120B',
          'openai/gpt-oss-20b': 'GPT-OSS 20B',
          'qwen/qwen3.8-27b': 'Qwen 3.8 27B',
          'llama-3.3-70b-versatile': 'Llama 3.3 70B',
          'llama-3.1-8b-instant': 'Llama 3.1 8B'
        };
        const modelLabel = displayNames[model] || model;
        return {
          success: true,
          message: `✓ Conexión exitosa con Groq (${modelLabel})`,
          activeModel: model
        };
      }

      // Parse error response JSON from Groq
      let errorDetail = '';
      let errorData: any = null;
      try {
        errorData = await res.json();
        errorDetail = errorData?.error?.message || errorData?.message || JSON.stringify(errorData);
      } catch {
        errorDetail = await res.text().catch(() => res.statusText);
      }

      lastErrorDetail = errorDetail;
      lastErrorData = errorData;

      if (res.status === 401) {
        return {
          success: false,
          message: `Groq rechazó la clave (HTTP 401): "${errorDetail || 'Invalid API Key'}". Verifica tu clave en console.groq.com.`,
          details: errorData || errorDetail
        };
      }

      if (res.status === 404) {
        // Model not found on this tier; try next candidate model
        console.warn(`[Groq testKey] Modelo "${model}" no disponible (HTTP 404): ${errorDetail}. Probando siguiente modelo...`);
        continue;
      }

      if (res.status === 429) {
        return {
          success: false,
          message: `Límite de cuota alcanzado (HTTP 429): "${errorDetail || 'Rate limit excedido temporalmente'}".`,
          details: errorData || errorDetail
        };
      }

      return {
        success: false,
        message: `Error de Groq Cloud (HTTP ${res.status}): ${errorDetail}`,
        details: errorData || errorDetail
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error de conexión con Groq Cloud: ${err?.message || String(err)}`
      };
    }
  }

  return {
    success: false,
    message: `Error 404 en Groq Cloud (Modelo no disponible): "${lastErrorDetail || 'Los modelos solicitados no están disponibles en este plan de Groq'}"`,
    details: lastErrorData || lastErrorDetail
  };
}
