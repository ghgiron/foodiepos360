# Paquete de Componentes de Inventario

## Visión General
El directorio `src/components/inventory` contiene componentes de diseño y modales operativos para la gestión de inventario en FoodiePOS: `InventoryLayout` provee el contexto de copilot de voz; `ListaDePrecios` muestra la tabla maestra de costos, rendimientos, mermas y exportación CSV; `ImportInventoryExcelModal` orquesta la importación y validación por fases de archivos Excel hacia IndexedDB/Dexie por sucursal; y `ProduceSubRecipeModal` evalúa la factibilidad de ingredientes y asienta la producción por lotes de subrecetas.

## Interfaz
- `[InventoryLayout.tsx:default]`: Exportación por defecto `InventoryLayout(props: InventoryLayoutProps)`.
- `[ListaDePrecios.tsx:default]`: Exportación por defecto `ListaDePrecios(props: ListaDePreciosProps)`.
- `[ImportInventoryExcelModal.tsx:default]`: Exportación por defecto `ImportInventoryExcelModal(props: ImportInventoryExcelModalProps)`.
- `[ProduceSubRecipeModal.tsx:default]`: Exportación por defecto `ProduceSubRecipeModal(props: ProduceSubRecipeModalProps)`.
- `[CompleteNewItemModal.tsx:default]`: Exportación por defecto `CompleteNewItemModal(props: CompleteNewItemModalProps)` para la configuración y alta inmediata de insumos nuevos detectados en recepción [US-10A].
- `[PurchaseOrderDetailModal.tsx:default]`: Exportación por defecto `PurchaseOrderDetailModal` para visualización completa de insumos, proveedor, fechas y flujo de cancelación [US-09C].
- `[ManualPurchaseOrderModal.tsx:default]`: Exportación por defecto `ManualPurchaseOrderModal` para creación manual de órdenes de compra (borrador o pedida) con selección de insumos y cálculo de totales [US-09D].
- `[PurchaseNavHeader.tsx:default]`: Exportación por defecto `PurchaseNavHeader` para navegación fluida tipo píldora entre Entradas, Alertas e Histórico [US-09C].

## Invariantes
- `[InventoryLayout.tsx:useEffect]`: Si `activeContext` tiene valor y `copilot.setMode` está definido, se invoca `copilot.setMode(activeContext)` al montar y ante cambios.
- `[InventoryLayout.tsx:InventoryLayout]`: Envuelve los elementos hijos en `VoiceCopilotProvider` con `initialMode={props.activeContext}`.
- `[ListaDePrecios.tsx:filteredItems]`: Filtra los registros comparando `flexibleMultiMatch` sobre nombre, categoría, proveedor y zona operativa.
- `[ListaDePrecios.tsx:avgCost]`: El costo de compra promedio evalúa a 0 si el listado está vacío; en caso contrario calcula `Math.round(suma / longitud)`.
- `[ImportInventoryExcelModal.tsx:isOpen]`: Retorna `null` si `isOpen` es falso.
- `[ImportInventoryExcelModal.tsx:processFile]`: Únicamente procesa archivos `.xlsx` o `.xls`; aborta si el conteo de filas válidas es 0.
- `[ProduceSubRecipeModal.tsx:isOpen]`: Retorna `null` si `isOpen` es falso.
- `[ProduceSubRecipeModal.tsx:batchesCount]`: La cantidad de lotes está acotada a un valor mínimo de 1.
- `[ProduceSubRecipeModal.tsx:handleProduce]`: Bloquea la producción si no hay subreceta seleccionada, los lotes son `<= 0` o `feasibility.canProduce` es falso.
- `[PurchaseOrderDetailModal.tsx:isCancellable]`: Solo permite cancelar órdenes cuyo estado sea estrictamente `'DRAFT'` o `'ORDERED'`. Retorna `null` si `isOpen` es falso o no hay orden.

## Efectos Secundarios
- `[InventoryLayout.tsx:useEffect]`: Sincroniza el modo del copilot llamando a `copilot.setMode(activeContext)`.
- `[ListaDePrecios.tsx:handleExportCSV]`: Genera un Blob en memoria, inserta un elemento `<a>` transitorio y activa la descarga del archivo CSV.
- `[ImportInventoryExcelModal.tsx:processFile]`: Invoca `parseInventoryExcel` para procesar la hoja de cálculo.
- `[ImportInventoryExcelModal.tsx:handleExecuteImport]`: Ejecuta `commitInventoryExcelImport`, escribiendo registros en Dexie y encolando eventos outbox.
- `[ProduceSubRecipeModal.tsx:handleProduce]`: Llama a `executeSubRecipeBatch`, descontando insumos e incrementando stock de la subreceta en IndexedDB.
- `[ProduceSubRecipeModal.tsx:toast]`: Muestra notificaciones visuales sobre validaciones y resultados del lote.

## Verificación
- Ejecutar: `npm test`
