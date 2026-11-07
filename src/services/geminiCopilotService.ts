// src/services/geminiCopilotService.ts
import { GoogleGenAI } from '@google/genai';
import { normalizeUnitToOfficial } from '../utils/costEngine';
import type { VoiceIngredientExtraction, CopilotContextData, CopilotMessage } from '../types/voiceCopilot';

/**
 * Builds the system instruction prompt with live Dexie database context (categories, suppliers, units).
 */
function buildIngredientInstruction(context: CopilotContextData): string {
  const categoriesList = (context.existingCategories && context.existingCategories.length > 0)
    ? context.existingCategories.join(', ') 
    : 'Proteínas, Vegetales, Frutas, Lácteos, Abarrotes, Licores, Bebidas, Salsas, Empaques';

  const suppliersList = (context.existingSuppliers && context.existingSuppliers.length > 0)
    ? context.existingSuppliers.map(s => `"${s.name}" (ID: ${s.id})`).join(', ') 
    : 'Sin proveedores específicos';

  const unitsList = (context.configuredUnits && context.configuredUnits.length > 0)
    ? context.configuredUnits.map(u => `${u.name}`).join(', ')
    : 'Kilogramo, Gramo, Libra, Litro, Mililitro, Botella 750ml, Onza, Unidad';

  return `Eres "Foodie Voice Copilot" en FoodiePOS 360, asistente culinario de alta precisión para registro y costeo de Ingredientes.

CATÁLOGO ACTIVO DEL SISTEMA:
- Categorías existentes: [ ${categoriesList} ]
- Proveedores registrados: [ ${suppliersList} ]
- Unidades disponibles: [ ${unitsList} ]

REGLAS ESTRICTAS DE AUTO-CATEGORIZACIÓN Y EXTRACCIÓN:
1. AUTO-CATEGORIZACIÓN OBLIGATORIA:
   - SIEMPRE debes asignar automáticamente 'category' con la categoría MÁS AFÍN de la lista existente [ ${categoriesList} ].
   - Ejemplos: "Salmón" / "Pescado" / "Lomo" / "Carne" -> "Proteínas" o "Carnes"; "Huevos" -> "Proteínas" o "Abarrotes"; "Ajo" / "Cebolla" -> "Vegetales" o "Verduras"; "Leche" / "Queso" -> "Lácteos"; "Ginebra" -> "Licores".
   - NUNCA pongas 'category' en 'missing_fields' ni preguntes por ella al usuario. Asígnala de inmediato con total autonomía.

2. EXTRACCIÓN DE DATOS Y CLAVES JSON EN INGLÉS:
   - name: Nombre del ingrediente limpio y capitalizado (ej. "Salmón"). OBLIGATORIO.
   - category: Categoría asignada de la lista existente (ej. "Proteínas").
   - purchase_price: Precio total pagado en COP como número entero (ej. si dice "70 mil pesos" o "70 mil", pon 70000; si dice "25.000", pon 25000). NUNCA uses texto como "70 mil" ni signos de peso "$".
   - purchase_quantity: Cantidad numérica comprada (ej. si dice "10 kilos", pon 10; si dice "6 litros", pon 6). NUNCA dejes en 1 si el usuario dictó otra cantidad.
   - purchase_unit: Unidad normalizada ("Unidad", "Kilogramo", "Gramo", "Litro", "Mililitro", "Libra", "Botella 750ml").
   - use_unit: Unidad de uso en cocina ("Gramo", "Mililitro", "Onza", "Unidad").
   - conversion_multiplier: Factor de conversión a unidad de uso (1000 si de kg a g o litro a ml; 1 si es la misma unidad).
   - usable_quantity: Cantidad utilizable neta en unidad de uso. Si no indica merma, igual al total equivalente (ej. 10 kg -> 10000 g).
   - waste_percentage: % de merma (0 si no indica merma o dice "no tiene merma").
   - supplier_name: Nombre del proveedor si lo menciona (ej. "Fierro, Pitalito").

3. COMANDOS:
   - Si dice "guardar", "confirmar", "sí", "dale", "de acuerdo", "guárdalo", "crear", command_action = 'CONFIRM_SAVE'.
   - Si dice "limpiar", "borrar", command_action = 'CLEAR_FORM'.
   - De lo contrario, command_action = 'NONE'.

4. RESPUESTA CONVERSACIONAL (follow_up_question):
   - Si faltan datos indispensables (nombre, precio o cantidad), pregunta con calidez y brevedad (máx 1 frase).
   - Si los datos clave están listos, emite ÚNICAMENTE un encabezado directo: 'He preparado el registro de [Nombre]:'. NUNCA hagas preguntas de cierre redundantes como '¿Deseas confirmar y guardar?' ni '¿Deseas guardar?'.
   - NUNCA fuerces ni sugieras ir a un formulario si los datos ya fueron extraídos.
   - NUNCA incluyas 'category' en 'missing_fields'.

5. FORMATO DE SALIDA:
   - Devuelve EXCLUSIVAMENTE un JSON válido con las claves en inglés ('name', 'category', 'purchase_price', 'purchase_quantity', 'purchase_unit', 'use_unit', 'conversion_multiplier', 'usable_quantity', 'waste_percentage', 'supplier_name', 'follow_up_question'). NUNCA uses claves en español como 'nombre' o 'precio'.`;
}

function buildProductInstruction(context: CopilotContextData): string {
  const categoriesList = (context.existingCategories && context.existingCategories.length > 0)
    ? context.existingCategories.join(', ') 
    : 'Bebidas, Cervezas, Vinos, Licores, Cócteles, Aguas, Gaseosas, Snacks, Café';

  const suppliersList = (context.existingSuppliers && context.existingSuppliers.length > 0)
    ? context.existingSuppliers.map(s => `"${s.name}" (ID: ${s.id})`).join(', ') 
    : 'Sin proveedores específicos';

  return `Eres "Foodie Voice Copilot" en FoodiePOS 360, asistente para alta directa de "PRODUCTO ÚNICO" (venta directa al público sin transformación, ej: cervezas, botellas, aguas, snacks).

CATÁLOGO ACTIVO:
- Categorías disponibles: [ ${categoriesList} ]
- Proveedores: [ ${suppliersList} ]

REGLAS DE AUTO-CATEGORIZACIÓN Y EXTRACCIÓN ZERO-FORM:
1. AUTO-CATEGORIZACIÓN OBLIGATORIA:
   - SIEMPRE debes asignar automáticamente 'category' con la categoría más afín de la lista disponible: [ ${categoriesList} ].
   - NUNCA pongas 'category' en 'missing_fields' ni preguntes por ella.
2. EXTRACCIÓN:
   - name: Nombre comercial del producto.
   - category: Categoría asignada automáticamente.
   - sale_price: Precio de venta al público (PVP) en COP (número entero).
   - purchase_price: Costo de compra unitario en COP (si lo indica).
   - purchase_quantity: Stock inicial (ej. 24, 12, 1).
   - purchase_unit: Unidad ("Unidad", "Botella", "Lata").
   - command_action: 'CONFIRM_SAVE' si dice guardar/confirmar/sí/dale, 'CLEAR_FORM' si dice limpiar, o 'NONE'.
3. follow_up_question: Encabezado directo: 'He preparado el registro de [Nombre]:'. NUNCA hagas preguntas de cierre redundantes como '¿Deseas confirmar y guardar?'.
4. Responde EXCLUSIVAMENTE con un objeto JSON válido.`;
}

function buildSupplyInstruction(context: CopilotContextData): string {
  const categoriesList = (context.existingCategories && context.existingCategories.length > 0)
    ? context.existingCategories.join(', ') 
    : 'Desechables, Empaques Delivery, Vasos y Copas, Aseo y Limpieza, Papelería, Menaje';

  const suppliersList = (context.existingSuppliers && context.existingSuppliers.length > 0)
    ? context.existingSuppliers.map(s => `"${s.name}" (ID: ${s.id})`).join(', ') 
    : 'Sin proveedores específicos';

  return `Eres "Foodie Voice Copilot" en FoodiePOS 360, asistente para alta directa de "SUMINISTROS Y EMPAQUES" (recursos no comestibles para operación: vasos, servilletas, bolsas, térmicos).

CATÁLOGO ACTIVO:
- Categorías disponibles: [ ${categoriesList} ]
- Proveedores: [ ${suppliersList} ]

REGLAS DE AUTO-CATEGORIZACIÓN Y EXTRACCIÓN ZERO-FORM:
1. AUTO-CATEGORIZACIÓN OBLIGATORIA:
   - SIEMPRE asigna automáticamente la categoría de insumo más afín de [ ${categoriesList} ].
   - NUNCA pongas 'category' en 'missing_fields' ni preguntes por ella.
2. EXTRACCIÓN:
   - name: Nombre del suministro.
   - category: Categoría asignada automáticamente.
   - purchase_price: Costo total pagado en COP.
   - package_units: Unidades por paquete/bulto (ej. 100).
   - purchase_unit: Unidad de presentación ("Paquete", "Caja", "Bulto", "Unidad").
   - stock_min_limit: Alerta de stock mínimo si se indica.
   - command_action: 'CONFIRM_SAVE' si dice guardar/confirmar/sí/dale, 'CLEAR_FORM' o 'NONE'.
3. follow_up_question: Encabezado directo: 'He preparado el registro de [Nombre]:'. NUNCA hagas preguntas de cierre redundantes como '¿Deseas confirmar y guardar?'.
4. Responde EXCLUSIVAMENTE con un objeto JSON válido.`;
}

function buildDashboardInstruction(context: CopilotContextData): string {
  const stockSummary = (context.currentStockItems || [])
    .slice(0, 25)
    .map(i => `${i.name}: ${i.stock} ${i.unit} (Mín: ${i.minLimit ?? '--'})`)
    .join('; ');

  const categoriesList = (context.existingCategories && context.existingCategories.length > 0)
    ? context.existingCategories.join(', ') 
    : 'Proteínas, Vegetales, Frutas, Lácteos, Abarrotes, Licores, Bebidas, Salsas, Empaques, Desechables';

  return `Eres "Foodie Voice Copilot" en FoodiePOS 360, copiloto ejecutivo de Control de Inventario y Registro en Segundo Plano (Zero-Form Registration).

CONTEXTO ACTUAL DEL SISTEMA:
- Modo: DASHBOARD / ZERO-FORM REGISTRATION
- Categorías disponibles: [ ${categoriesList} ]
- Resumen de existencias en local (muestra): [ ${stockSummary || 'Inventario en línea'} ]

CAPACIDADES Y REGLAS:
1. REGISTRO DIRECTO EN SEGUNDO PLANO (ZERO-FORM):
   - Si el usuario menciona una compra, entrada de stock o nuevo artículo (ej. "Compre 10 kilos de salmon en 70 mil pesos, en Fierro, Pitalito no tiene merma", "Compré 30 unidades de huevos a 18.000", "Llegaron 24 cervezas corona a 4500", "Compré 5 kilos de lomo a 140.000"):
     * NO fuerces la navegación ni redirijas a un formulario.
     * Extrae inmediatamente:
       - name: Nombre del artículo (ej. "Salmón").
       - category: Categoría autoseleccionada más afín de [ ${categoriesList} ] (ej. "Proteínas" para salmón o carnes).
       - purchase_price: Precio total en COP como número entero (ej. "70 mil pesos" -> 70000; "$18.000" -> 18000). NUNCA uses texto con palabras como 'mil'.
       - purchase_quantity: Cantidad numérica (ej. 10 kilos -> 10). NUNCA dejes en 1 si el usuario especificó otra cantidad.
       - purchase_unit: Unidad normalizada ("Kilogramo", "Gramo", "Litro", "Unidad", etc.).
       - use_unit: Unidad de uso ("Gramo", "Mililitro", "Unidad").
       - conversion_multiplier: Factor de conversión (1000 para kg/litro; 1 para unidad).
       - usable_quantity: Cantidad utilizable.
       - waste_percentage: % de merma (0 si no tiene merma).
       - supplier_name: Proveedor si lo dice (ej. "Fierro, Pitalito").
     * En 'follow_up_question': Emite únicamente el encabezado directo 'He preparado el registro de [Nombre]:' sin preguntas de cierre redundantes.
     * 'is_complete' = true.
2. CONSULTAS DE STOCK:
   - Si pregunta por existencias ("¿Cuánto stock tenemos de X?"), responde con cantidad y unidad.
   - Si pregunta por stock bajo o alertas, lista los críticos.
3. DETECCIÓN DE COMANDOS:
   - Si dice "guardar", "confirmar", "sí", "dale", "de acuerdo", "guárdalo ya": command_action = 'CONFIRM_SAVE'.
   - Si dice "limpiar", "borrar": command_action = 'CLEAR_FORM'.
   - Si dice explícitamente "abrir formulario" o "formulario": command_action = 'NAVIGATE', navigation_target = 'INGREDIENT'.
   - De lo contrario, command_action = 'NONE'.
4. FORMATO: Responde EXCLUSIVAMENTE con un objeto JSON válido con las claves en inglés ('name', 'category', 'purchase_price', 'purchase_quantity', 'purchase_unit', 'use_unit', 'conversion_multiplier', 'usable_quantity', 'waste_percentage', 'supplier_name', 'follow_up_question').`;
}

/**
 * Builds the mode-aware system instruction prompt with live Dexie database context.
 */
export function buildSystemInstruction(context: CopilotContextData): string {
  const mode = context.mode || 'INGREDIENT';
  if (mode === 'PRODUCT') {
    return buildProductInstruction(context);
  }
  if (mode === 'SUPPLY') {
    return buildSupplyInstruction(context);
  }
  if (mode === 'DASHBOARD' || mode === 'ONBOARDING') {
    return buildDashboardInstruction(context);
  }
  return buildIngredientInstruction(context);
}

/**
 * Strips potential markdown code block wrappers from LLM output.
 */
export function cleanJsonOutput(raw: string): string {
  if (!raw) return '{}';
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

export function parseNumericValue(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const str = String(val).trim();

  // Match expressions like "70 mil", "70 mil pesos", "70k", "70mil", "1.5 mil"
  const milMatch = str.match(/^([\d.,]+)\s*(?:mil|k)\b/i);
  if (milMatch) {
    let cleanBase = milMatch[1].replace(/\./g, '').replace(/,/g, '.');
    const base = Number(cleanBase);
    if (!isNaN(base)) return Math.round(base * 1000);
  }

  let cleaned = str.replace(/[^\d.,-]/g, '');
  if (/^\d{1,3}\.\d{3}(\.\d{3})*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (/^\d{1,3},\d{3}(,\d{3})*$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else {
    cleaned = cleaned.replace(/,/g, '.');
  }
  const num = Number(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Intelligent semantic category resolver for gastrobar & culinary items.
 */
function inferBestCategory(name: string, rawCat: string | undefined, categories: string[]): string {
  if (rawCat && rawCat.trim()) {
    const cleanRaw = rawCat.trim().toLowerCase();
    const exact = categories.find(c => c.toLowerCase() === cleanRaw);
    if (exact) return exact;
    const partial = categories.find(c => c.toLowerCase().includes(cleanRaw) || cleanRaw.includes(c.toLowerCase()));
    if (partial) return partial;
  }

  const n = (name || '').toLowerCase();
  
  if (/\b(salm[oó]n|pescado|at[uú]n|camar[oó]n|marisco|mariscos|langostinos?|tilapia|trucha|r[oó]balo|filete|pulpo)\b/i.test(n)) {
    const found = categories.find(c => /pescado|marisco|prote[ií]na|carne/i.test(c));
    if (found) return found;
  }
  if (/\b(lomo|res|cerdo|pollo|pechuga|costilla|carne|carnes|tocino|tocineta|jam[oó]n|chorizo|morcilla|alitas?|milanesa)\b/i.test(n)) {
    const found = categories.find(c => /carne|prote[ií]na/i.test(c));
    if (found) return found;
  }
  if (/\b(cerveza|corona|club\s*colombia|poker|aguila|heineken|vino|ginebra|ron|vodka|whisky|tequila|licor|licores|aguardiente|tanqueray|smirnoff|baileys)\b/i.test(n)) {
    const found = categories.find(c => /licor|bebida|cerveza|vino/i.test(c));
    if (found) return found;
  }
  if (/\b(leche|queso|mantequilla|crema|yogur|parmesano|mozzarella|crema\s*de\s*leche)\b/i.test(n)) {
    const found = categories.find(c => /l[aá]cteo/i.test(c));
    if (found) return found;
  }
  if (/\b(cebolla|tomate|ajo|papa|lechuga|zanahoria|aguacate|lim[oó]n|cilantro|perejil|piment[oó]n|champi[nñ][oó]n|verdura|verduras|vegetal|vegetales)\b/i.test(n)) {
    const found = categories.find(c => /verdura|vegetal|fruver/i.test(c));
    if (found) return found;
  }
  if (/\b(caja|cajas|empaque|empaques|vaso|vasos|bolsa|bolsas|servilleta|servilletas|desechable|desechables|tapa|pitillo|domicilio|papeler[ií]a|limpieza|detergente)\b/i.test(n)) {
    const found = categories.find(c => /empaque|desechable|suministro|aseo/i.test(c));
    if (found) return found;
  }
  if (/\b(arroz|aceite|harina|az[uú]car|sal|pimienta|pasta|lenteja|frijol|frijoles|salsa|pan|mayonesa|mostaza|huevo|huevos)\b/i.test(n)) {
    const found = categories.find(c => /abarrote|despensa|grano/i.test(c));
    if (found) return found;
  }

  if (rawCat && rawCat.trim()) return rawCat.trim();
  if (categories && categories.length > 0) {
    return categories[0];
  }
  return 'Abarrotes';
}

/**
 * Direct heuristic extraction from user text to complement or fallback LLM outputs.
 */
function extractFieldsFromPrompt(prompt: string): Partial<VoiceIngredientExtraction> {
  const result: Partial<VoiceIngredientExtraction> = {};
  if (!prompt) return result;
  const p = prompt.trim();

  // Price match: "en 70 mil pesos", "a 70 mil", "en 70.000", "$70000", "70 mil pesos"
  const priceMatch = p.match(/(?:en|a|\$)\s*([\d.,]+)\s*(?:mil|k)?\s*(?:pesos|cop)?/i) ||
                     p.match(/([\d.,]+)\s*(?:mil|k)\s*pesos/i);
  if (priceMatch) {
    const pStr = priceMatch[1];
    if (priceMatch[0].toLowerCase().includes('mil') || priceMatch[0].toLowerCase().includes('k')) {
      const base = Number(pStr.replace(/\./g, '').replace(/,/g, '.'));
      if (!isNaN(base)) result.purchase_price = Math.round(base * 1000);
    } else {
      result.purchase_price = parseNumericValue(pStr);
    }
  }

  // Quantity and unit match: "10 kilos", "6 litros", "500g", "200 cajas", "24 cervezas", "30 unidades"
  const qtyUnitMatch = p.match(/(\d+(?:[.,]\d+)?)\s*(kilos?|kg|litros?|l|gramos?|g|libras?|lb|onzas?|oz|unidades?|und|paquetes?|cajas?|botellas?|latas?)\b/i);
  if (qtyUnitMatch) {
    result.purchase_quantity = Number(qtyUnitMatch[1].replace(/,/g, '.'));
    result.purchase_unit = normalizeUnitToOfficial(qtyUnitMatch[2]);
  }

  // Waste percentage match: "no tiene merma", "sin merma", "0% de merma", "0 merma"
  if (/no\s+tiene\s+merma|sin\s+merma|0%?\s*(?:de\s*)?merma/i.test(p)) {
    result.waste_percentage = 0;
  } else {
    const wasteMatch = p.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s*)?merma/i);
    if (wasteMatch) {
      result.waste_percentage = Number(wasteMatch[1].replace(/,/g, '.'));
    }
  }

  // Supplier match: "en Fierro, Pitalito", "de Bavaria", "en Makro"
  const supplierMatch = p.match(/(?:en|de|proveedor)\s+([A-ZÁÉÍÓÚ][a-záéíóúñA-ZÁÉÍÓÚ\s,]+?)(?:\s+(?:no tiene|sin|con|\$|\d|usamos)\b|$)/i);
  if (supplierMatch) {
    const sName = supplierMatch[1].trim();
    if (sName && !/^(kilos?|litros?|pesos|efectivo|caja|unidad)/i.test(sName)) {
      result.supplier_name = sName;
    }
  }

  // Name match: "Compre 10 kilos de salmon", "10 kilos de salmon", "compre 24 cervezas"
  const nameMatch = p.match(/(?:compr[éeó]|llegar?on|entr[óo])\s+(?:\d+\s+[a-záéíóúñ]+\s+de\s+|\d+\s+)?([a-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+(?:en|a|\$|con|por|de|sin|no)\b|$)/i) ||
                    p.match(/(?:\d+\s+[a-záéíóúñ]+\s+de\s+)([a-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+(?:en|a|\$|con|por|de|sin|no)\b|$)/i);
  if (nameMatch) {
    const rawName = nameMatch[1].trim();
    if (rawName && rawName.length > 1 && !/^(kilos?|litros?|gramos?|unidades?|cajas?)$/i.test(rawName)) {
      result.name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    }
  }

  return result;
}

/**
 * Normalizes and sanitizes parsed extraction object with comprehensive English & Spanish key support.
 */
export function sanitizeExtraction(parsed: any, context?: CopilotContextData, userPrompt?: string): VoiceIngredientExtraction {
  const promptHints = userPrompt ? extractFieldsFromPrompt(userPrompt) : {};

  // 1. Name: Check all English and Spanish aliases, follow_up_question, and prompt hints
  let rawName = (
    parsed.name ??
    parsed.nombre ??
    parsed.item ??
    parsed.producto ??
    parsed.ingrediente ??
    parsed.articulo ??
    parsed.elemento ??
    parsed.titulo ??
    promptHints.name
  );

  if (!rawName && typeof parsed.follow_up_question === 'string') {
    const match = parsed.follow_up_question.match(/He preparado el registro de\s*["“]?([^"”:]+)["”]?/i);
    if (match && match[1]?.trim()) {
      rawName = match[1].trim();
    }
  }

  const finalName = rawName ? String(rawName).trim() : undefined;

  // 2. Category: Infer culinary category with smart keywords
  const rawCat = (
    parsed.category ??
    parsed.categoria ??
    parsed.tipo ??
    parsed.rubro
  );
  const finalCategory = inferBestCategory(finalName || '', rawCat, context?.existingCategories || []);

  // 3. Purchase Unit: Normalize
  const rawUnit = (
    parsed.purchase_unit ||
    parsed.unit ||
    parsed.unidad ||
    parsed.unidad_compra ||
    parsed.medida ||
    promptHints.purchase_unit
  );
  const normPurchaseUnit = rawUnit ? normalizeUnitToOfficial(rawUnit) : 'Unidad';

  // 4. Use Unit: kitchen consumption unit
  const rawUseUnit = (
    parsed.use_unit ||
    parsed.unidad_uso ||
    parsed.unidad_consumo
  );
  const normUseUnit = rawUseUnit ? normalizeUnitToOfficial(rawUseUnit) : (
    normPurchaseUnit === 'Kilogramo' ? 'Gramo' :
    normPurchaseUnit === 'Litro' ? 'Mililitro' :
    normPurchaseUnit
  );

  // 5. Purchase Quantity: ensure non-zero number
  const rawQty = parseNumericValue(
    parsed.purchase_quantity ??
    parsed.quantity ??
    parsed.qty ??
    parsed.cantidad ??
    parsed.cant ??
    parsed.unidades ??
    parsed.kilos ??
    parsed.litros ??
    promptHints.purchase_quantity
  );
  const purchaseQty = (rawQty !== undefined && rawQty > 0) ? rawQty : 1;

  // 6. Conversion Multiplier
  let multiplier = parseNumericValue(
    parsed.conversion_multiplier ??
    parsed.multiplier ??
    parsed.multiplicador ??
    parsed.factor
  );

  if (!multiplier) {
    if (normPurchaseUnit === 'Kilogramo' && normUseUnit === 'Gramo') multiplier = 1000;
    else if (normPurchaseUnit === 'Litro' && normUseUnit === 'Mililitro') multiplier = 1000;
    else if (normPurchaseUnit === normUseUnit) multiplier = 1;
    else multiplier = 1;
  }

  // 7. Purchase Price
  const purchasePrice = parseNumericValue(
    parsed.purchase_price ??
    parsed.price ??
    parsed.cost ??
    parsed.precio ??
    parsed.costo ??
    parsed.total ??
    parsed.valor ??
    parsed.precio_compra ??
    promptHints.purchase_price
  );

  // 8. Waste percentage & Usable quantity
  let wastePct = parseNumericValue(
    parsed.waste_percentage ??
    parsed.merma ??
    parsed.waste ??
    parsed.porcentaje_merma ??
    promptHints.waste_percentage
  );
  if (wastePct === undefined && promptHints.waste_percentage !== undefined) {
    wastePct = promptHints.waste_percentage;
  }

  let usableQty = parseNumericValue(
    parsed.usable_quantity ??
    parsed.usable ??
    parsed.cantidad_utilizable ??
    parsed.utilizable
  );

  const totalEquivalent = purchaseQty * (multiplier || 1);

  if (usableQty !== undefined && wastePct === undefined && totalEquivalent > 0) {
    const diff = totalEquivalent - usableQty;
    wastePct = diff > 0 ? Number(((diff / totalEquivalent) * 100).toFixed(2)) : 0;
  } else if (wastePct !== undefined && usableQty === undefined && totalEquivalent > 0) {
    usableQty = Math.round(totalEquivalent * (1 - wastePct / 100));
  } else if (wastePct === undefined && usableQty === undefined) {
    wastePct = 0;
    usableQty = totalEquivalent;
  }

  // 9. Supplier
  const supplierName = (
    parsed.supplier_name ??
    parsed.supplier ??
    parsed.proveedor ??
    parsed.proveedor_nombre ??
    promptHints.supplier_name
  );

  // 10. Missing Fields
  const cleanedMissingFields = (Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [])
    .filter((field: string) => field !== 'category' && field !== 'categoria');

  // 11. Follow up Question
  const followUp = finalName 
    ? `He preparado el registro de "${finalName}":`
    : (parsed.follow_up_question || 'He procesado tus indicaciones.');

  return {
    id: parsed.id || undefined,
    name: finalName,
    category: finalCategory,
    supplier_id: parsed.supplier_id || undefined,
    supplier_name: supplierName || undefined,
    supplier_name_to_create: parsed.supplier_name_to_create || undefined,
    purchase_price: purchasePrice,
    sale_price: parseNumericValue(parsed.sale_price ?? parsed.pvp ?? parsed.precio_venta),
    package_units: parseNumericValue(parsed.package_units ?? parsed.units ?? parsed.unidades_paquete),
    operation_zone: parsed.operation_zone || undefined,
    purchase_unit: normPurchaseUnit,
    purchase_quantity: purchaseQty,
    use_unit: normUseUnit,
    conversion_multiplier: multiplier,
    usable_quantity: usableQty,
    waste_percentage: wastePct,
    description: parsed.description || parsed.descripcion || undefined,
    density: parseNumericValue(parsed.density ?? parsed.densidad),
    bottle_tare_weight: parseNumericValue(parsed.bottle_tare_weight ?? parsed.tara),
    stock_min_limit: parseNumericValue(parsed.stock_min_limit ?? parsed.stock_minimo),
    stock_max_limit: parseNumericValue(parsed.stock_max_limit ?? parsed.stock_maximo),
    fecha_vencimiento: parsed.fecha_vencimiento || undefined,
    query_response: parsed.query_response || undefined,
    navigation_target: parsed.navigation_target || undefined,
    missing_fields: cleanedMissingFields,
    follow_up_question: followUp,
    is_complete: Boolean(parsed.is_complete || (finalName && purchasePrice !== undefined)),
    command_action: parsed.command_action || 'NONE',
    reasoning: parsed.reasoning || undefined
  };
}

import { processAiCopilotPrompt } from './aiProviderService';
import { testGroqApiKey } from './groqCopilotService';

/**
 * Processes a voice/text prompt using Multi-Provider AI (Gemini Flash or Groq Cloud Llama)
 * with structured JSON output, 10s AbortController timeout, and automatic failover.
 */
export async function processVoiceIngredientPrompt(
  userPrompt: string,
  context: CopilotContextData,
  chatHistory: CopilotMessage[] = []
): Promise<VoiceIngredientExtraction> {
  return processAiCopilotPrompt(userPrompt, context, chatHistory);
}

export const processVoiceCopilotPrompt = processVoiceIngredientPrompt;
export { testGroqApiKey };

/**
 * Tests an API Key against Google Gemini to verify its validity.
 */
export async function testGeminiApiKey(key: string): Promise<{ success: boolean; message: string }> {
  if (!key || !key.trim()) {
    return { success: false, message: 'Por favor ingresa una API Key para probar.' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: key.trim() });
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: 'Responde solo la palabra "CONEXION_OK"',
      config: {
        temperature: 0.1,
      }
    });

    if (response.text) {
      return { success: true, message: '¡Conexión exitosa! Tu API Key de Google Gemini Flash es válida y está activa.' };
    }
    return { success: false, message: 'No se recibió respuesta del modelo Gemini.' };
  } catch (err: any) {
    console.warn('[Gemini Test Key Error]:', err);
    const msg = String(err?.message || err || '');
    const upper = msg.toUpperCase();

    if (upper.includes('API KEY NOT VALID') || upper.includes('API_KEY_INVALID') || upper.includes('INVALID_ARGUMENT')) {
      return { 
        success: false, 
        message: 'Google rechazó la clave: "API key not valid". Verifica tu clave en Google AI Studio (aistudio.google.com).' 
      };
    }
    if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('QUOTA') || err?.status === 429) {
      return { success: false, message: 'Límite de cuota alcanzado en tu cuenta de Google AI Studio.' };
    }
    return { success: false, message: `Error de Google Gemini: ${msg}` };
  }
}
