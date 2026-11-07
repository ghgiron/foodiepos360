# Paquete de Utilidades (Utils)

## Visión General
El directorio `src/utils` proporciona las utilidades centrales para FoodiePOS, incluyendo normalización y consolidación de existencias multisede, motores de cálculo de costo para recetas e insumos, asistentes de datos para IndexedDB/Dexie, rutinas transaccionales de purga y reinicio operativo, vaciado en lote en Cloud Firestore, formateadores de moneda y números (`es-CO`), configuración de proveedores de IA (Gemini/Groq en `localStorage`), algoritmo de emparejamiento difuso y métricas de reabastecimiento, navegación contextual segura, estandarización de zonas operativas y conversiones métricas.

## Interfaz
- `[branchhelper.ts:DEFAULT_BRANCH_ID]`: Identificador de la sede por defecto (`'SEDE-SAN-AGUST-N-2044'`).
- `[branchhelper.ts:getActiveBranchId]`: Consulta síncrona del identificador de la sede activa.
- `[branchhelper.ts:setActiveBranchId]`: Guarda la sede activa en `localStorage`.
- `[branchhelper.ts:consolidateSucursalStock]`: Normaliza y consolida existencias entre múltiples sedes.
- `[costengine.ts:calculateCostMetrics]`: Calcula rendimiento, merma, costo unitario real y factor de costo.
- `[costengine.ts:getItemUnitCost]`: Resuelve el costo unitario efectivo de un ítem de inventario.
- `[costengine.ts:calculateRecipeItemUnitCost]`: Resuelve el costo unitario de una línea de ingrediente en una receta.
- `[datahelper.ts:getItemResourceType]`: Clasifica un ítem en su tipo de recurso (`INGREDIENT`, `PRODUCT`, `SUPPLY`, etc.).
- `[databasereset.ts:resetOperationalData]`: Reseteo transaccional atómico de pedidos, ventas, mermas y logs operativos.
- `[databasereset.ts:purgeFirestoreOperationalCollections]`: Eliminación por lotes de documentos operativos en la nube.
- `[finance.ts:calculateGrossMargin]`: Calcula el porcentaje de margen bruto comercial.
- `[finance.ts:classifyProfitability]`: Clasifica el margen en rangos de rentabilidad del negocio.
- `[formatters.ts:formatCurrency]`: Da formato a importes monetarios en pesos colombianos (`$ #.###`).
- `[formatters.ts:formatDecimals]`: Da formato a cantidades numéricas respetando la localización `es-CO`.
- `[geminiconfig.ts:getGeminiApiKey]`: Lee la clave de API de Gemini en `localStorage`.
- `[geminiconfig.ts:getGroqApiKey]`: Lee la clave de API de Groq en `localStorage`.
- `[geminiconfig.ts:getActiveAIProvider]`: Obtiene el proveedor de IA preferido (`'gemini' | 'groq' | 'auto'`).
- `[inventorymatching.ts:findMatchingInventoryItem]`: Emparejamiento difuso entre comandos de voz y el inventario.
- `[inventorymatching.ts:calculateRestockMetrics]`: Calcula la cantidad de reabastecimiento sugerida según límites mínimos.
- `[navigation.ts:pushNavigationState]`: Administrador de historial de navegación que inyecta origen y precargas.
- `[navigation.ts:navigateContextualBack]`: Retorno inteligente al punto de origen con soporte de respaldo.
- `[operationalzones.tsx:normalizeOperationalZone]`: Estandariza nombres de zonas operativas.
- `[searchengine.ts:flexibleMultiMatch]`: Búsqueda multi-término flexible e insensible a acentos.
- `[unitconversion.ts:calculateUsableQuantityAndCost]`: Calcula conversión de rendimiento y costo por unidad utilizable.
- `[unitconversion.ts:convertUnits]`: Utilidad directa para conversión de unidades de medida.

## Invariantes
- `[branchhelper.ts:normalizeBranchId]`: Retorna `DEFAULT_BRANCH_ID` si la sede recibida está vacía o equivale a `'MAIN'`.
- `[branchhelper.ts:areBranchIdsEqual]`: Retorna `false` si algún parámetro falta; de lo contrario compara sin distinción de mayúsculas.
- `[branchhelper.ts:consolidateSucursalStock]`: Descarta registros con sucursal `'MAIN'` si existen sedes reales registradas, evitando duplicidad.
- `[branchhelper.ts:setBranchStockValue]`: Limita el stock a valores no negativos y redondea a 3 cifras decimales.
- `[costengine.ts:getDynamicUnitEquivalence]`: Retorna `1.00` cuando la unidad de compra y la de uso son idénticas.
- `[costengine.ts:calculateCostMetrics]`: Retorna rendimiento del 100% si la cantidad equivalente o el costo de compra es `<= 0`.
- `[databasereset.ts:purgeFirestoreOperationalCollections]`: Agrupa eliminaciones en Firestore en lotes de máximo 400 documentos por compromiso.
- `[databasereset.ts:resetOperationalStorageAndCursors]`: Protege estrictamente claves de autenticación y tokens en `localStorage` de cualquier borrado.
- `[finance.ts:calculateGrossMargin]`: Retorna `0` si el precio de venta es menor o igual a cero.
- `[inventorymatching.ts:hasVariantModifierMismatch]`: Detecta diferencias en modificadores de variantes (ej. *'zero'*, *'light'*) para evitar emparejamientos erróneos.
- `[navigation.ts:pushNavigationState]`: Fija `state.from` en el origen actual o fallback `'/inventory'` e inyecta la marca temporal.
- `[operationalzones.tsx:normalizeOperationalZone]`: Asigna `'general_operaciones'` si la zona especificada no existe en el catálogo.
- `[searchengine.ts:flexibleMultiMatch]`: Todos los términos de la consulta deben estar presentes en el destino evaluado (operación AND lógica).
- `[unitconversion.ts:calculateUsableQuantityAndCost]`: Marca `isCompatible: false` si las unidades pertenecen a magnitudes distintas (ej. gramos vs. mililitros).

## Efectos Secundarios
- `[branchhelper.ts:getActiveBranchId]`: Escribe en `localStorage` la clave `'foodiepos_active_branch_id'`.
- `[branchhelper.ts:setActiveBranchId]`: Actualiza múltiples claves de sede en `localStorage`.
- `[branchhelper.ts:getActiveBranchIdAsync]`: Consulta `db.systemSettings` y actualiza `localStorage`.
- `[datahelper.ts:useDropdownOptions]`: Activa suscripciones reactivas con `useLiveQuery` en Dexie.
- `[databasereset.ts:purgeFirestoreOperationalCollections]`: Ejecuta borrado masivo por lotes en colecciones de Cloud Firestore.
- `[databasereset.ts:resetOperationalStorageAndCursors]`: Remueve marcas y estados operativos en `localStorage`.
- `[databasereset.ts:resetOperationalData]`: Limpia 13 tablas operativas en Dexie dentro de una transacción atómica, añade un log y emite el evento `'foodiepos:operational-reset'`.
- `[geminiconfig.ts:setGeminiApiKey]`: Guarda o elimina la clave de Gemini en `localStorage`.
- `[geminiconfig.ts:setGroqApiKey]`: Guarda o elimina la clave de Groq en `localStorage`.
- `[geminiconfig.ts:setActiveAIProvider]`: Persiste la preferencia de motor de IA en `localStorage`.
- `[geminiconfig.ts:setVoiceFeedbackEnabled]`: Persiste la preferencia de síntesis de voz en `localStorage`.
- `[navigation.ts:pushNavigationState]`: Modifica el historial de sesión mediante `window.history.pushState`.
- `[navigation.ts:navigateContextualBack]`: Retrocede en el historial con `window.history.back()` o reubica `window.location.href`.

## Verificación
- Ejecutar: `npm test`
