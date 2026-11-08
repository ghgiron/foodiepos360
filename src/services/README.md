# Paquete de Servicios (Services)

## Visión General
El directorio `src/services` contiene la lógica central de negocio, sincronización e integraciones externas con IA para FoodiePOS. Abarca la orquestación de LLMs (Groq Cloud Llama y Google Gemini Flash con límites de tiempo y conmutación por error), sincronización bidireccional offline-first con Cloud Firestore con marcas tombstone y resolución Last-Write-Wins, ingesta masiva de catálogos desde hojas de cálculo Excel, cálculo recursivo de listas de materiales (BOM) y disponibilidad de recetas por sede, asamblea y costeo de lotes de subrecetas con kardex transaccional, y motor de reservas con validación de colisiones de mesas.

## Interfaz
- `[aiProviderService.ts:processAiCopilotPrompt]`: Enrutador central de IA que consulta Groq y conmuta a Gemini ante contingencias.
- `[aiProviderService.ts:testGroqApiKey]`: Comprueba la validez de la clave de Groq mediante una solicitud de prueba.
- `[excelImportService.ts:parseInventoryExcel]`: Interpreta libros de Excel extrayendo candidatos estructurados de inventario.
- `[excelImportService.ts:commitInventoryExcelImport]`: Confirma la importación masiva escribiendo en Dexie y encolando eventos de sincronización.
- `[geminiCopilotService.ts:processVoiceIngredientPrompt]`: Usa Google Gemini Flash para analizar transcripciones de audio no estructuradas.
- `[groqCopilotService.ts:processVoicePromptWithGroq]`: Utiliza modelos Llama en Groq Cloud para análisis de lenguaje natural de ultra alta velocidad.
- `[inventoryBomService.ts:explodeItemRequirements]`: Desglosa recursivamente recetas y subrecetas hasta obtener la cantidad neta de insumos base.
- `[inventoryBomService.ts:checkRecipeAvailability]`: Calcula el número máximo de porciones preparables en una sucursal específica.
- `[reservationService.ts:saveReservationWithValidation]`: Valida conflictos de asignación de mesa antes de guardar una reserva.
- `[reservationService.ts:startReservationService]`: Convierte una reserva en una comanda activa en salón.
- `[purchaseOrderService.ts:getCriticalStockAlerts]`: Clasifica y prioriza alertas en Prioridad 1 (Agotado) y Prioridad 2 (Bajo stock) [US-09].
- `[purchaseOrderService.ts:calculateSuggestedQuantity]`: Calcula la cantidad sugerida de compra aplicando la fórmula de abastecimiento [US-09].
- `[purchaseOrderService.ts:generateSuggestedPurchaseOrders]`: Agrupa insumos críticos por proveedor, asigna `'POR DEFINIR'` a insumos huérfanos y persiste borradores en Dexie (`status: 'DRAFT'`) [US-09].
- `[purchaseOrderService.ts:cancelPurchaseOrder]`: [US-09C] Cancela una orden de compra en estado `'DRAFT'` u `'ORDERED'` y asienta evento en el outbox.
- `[purchaseOrderService.ts:updatePurchaseOrderStatus]`: [US-09C] Modifica el estado del ciclo de vida de una orden (`'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'`).
- `[purchaseOrderService.ts:getAllPurchaseOrders]`: [US-09C] Consulta todas las órdenes históricas ordenadas cronológicamente descendente.
- `[subRecipeProductionService.ts:checkSubRecipeFeasibility]`: Evalúa si existe stock suficiente de ingredientes antes de iniciar un lote de subreceta.
- `[subRecipeProductionService.ts:executeSubRecipeBatch]`: Deduce atómicamente los insumos base e incrementa el stock de la subreceta en Dexie.
- `[syncService.ts:startSyncService]`: Inicia escuchas en tiempo real con Firestore y temporizadores de sincronización en segundo plano.
- `[syncService.ts:syncRecordToFirestore]`: Publica mutaciones locales hacia Firestore o las añade al outbox si no hay conexión.
- `[syncService.ts:deleteRecordFromFirestore]`: Registra una marca tombstone y remueve el documento de Firestore.
- `[syncService.ts:forceResyncAll]`: Ejecuta la conciliación bidireccional completa entre IndexedDB y Firestore.

## Invariantes
- `[aiProviderService.ts:runWithAbortTimeout]`: Peticiones que superen los 15000ms se rechazan con `TimeoutError`.
- `[aiProviderService.ts:processAiCopilotPrompt]`: Conmutación automática entre Groq y Gemini ante errores recuperables (código 429, límites de cuota o caídas de red).
- `[excelImportService.ts:convertQuantity]`: Retorna la cantidad sin alterar si las unidades pertenecen a dimensiones físicas incompatibles (volumen vs. peso vs. unidades discretas).
- `[excelImportService.ts:readExcelFileRows]`: Arroja un error explícito si el libro no contiene hojas de datos válidas.
- `[inventoryBomService.ts:explodeItemRequirements]`: Detecta dependencias circulares mediante un conjunto `depthVisited` y detiene la recursión con advertencia en consola.
- `[inventoryBomService.ts:checkRecipeAvailability]`: La disponibilidad base es 999 si no hay requerimientos; evalúa a `isAvailable = false` si algún insumo tiene existencia `<= 0`.
- `[reservationService.ts:validateReservationAvailability]`: Impide reservar mesas que ya tienen comandas abiertas o reservas confirmadas en el mismo horario.
- `[purchaseOrderService.ts:generateSuggestedPurchaseOrders]`: No altera `physicalStock` en ningún escenario; solo asienta borradores `status: 'DRAFT'` en `purchaseOrders`.
- `[purchaseOrderService.ts:cancelPurchaseOrder]`: Invariante de ciclo de vida: Arroja error si el estado es `'RECEIVED'` o `'CANCELLED'`. Solo se permite cancelar órdenes en estado `'DRAFT'` u `'ORDERED'`.
- `[subRecipeProductionService.ts:executeSubRecipeBatch]`: Exige `batchesCount > 0` y se detiene si la prueba de factibilidad resulta negativa.
- `[syncService.ts:pullDataFromFirestore]`: Ignora documentos en Firestore que coincidan con identificadores tombstone activos o cuya fecha sea anterior a la última purga.
- `[syncService.ts:deleteRecordFromFirestore]`: Siempre persiste una marca `'RecordDeleted'` en `domainOutbox` antes de intentar el borrado remoto en Firestore.
- `[syncService.ts:startSyncService]`: Resolución Last-Write-Wins: aplica cambios remotos si la marca de tiempo remota es mayor o igual a la local.

## Efectos Secundarios
- `[aiProviderService.ts:callGemini]`: Ejecuta peticiones HTTPS externas a la API de Google Gemini.
- `[aiProviderService.ts:callGroq]`: Ejecuta peticiones HTTPS externas a la API de Groq Cloud.
- `[excelImportService.ts:commitInventoryExcelImport]`: Altera múltiples tablas en Dexie e inserta eventos outbox.
- `[reservationService.ts:saveReservationWithValidation]`: Inserta reservas y genera notificaciones programadas en `db.notifications`.
- `[subRecipeProductionService.ts:executeSubRecipeBatch]`: Ejecuta transacción de lectura y escritura modificando `inventoryItems`, `recipes`, `inventoryLogs` y `domainOutbox`.
- `[syncService.ts:syncRecordToFirestore]`: Realiza escrituras directas sobre Cloud Firestore.
- `[syncService.ts:startSyncService]`: Activa 12 escuchas `onSnapshot` sobre colecciones de Firestore e inicia un intervalo de 8 segundos para procesar el outbox.

## Verificación
- Ejecutar: `npm test`
