# Paquete de Componentes (Components)

## Visión General
El directorio `src/components` alberga los componentes de presentación, formularios, terminales de punto de venta (POS), control de inventarios y gestión de salones para FoodiePOS. Unifica la toma de pedidos, pantallas KDS de cocina, altas y recepciones de mercancía, tableros financieros, recetarios y configuración general del sistema.

## Interfaz
- `[clientManagement.tsx:ClientManagement]`: Directorio de clientes y perfiles para facturación electrónica.
- `[comboForm.tsx:ComboForm]`: Formulario de creación y costeo de combos de menú.
- `[financialDashboard.tsx:FinancialDashboard]`: Panel de indicadores financieros (ventas brutas/netas, CMV, costo de arriendo, márgenes).
- `[inventoryAdjustment.tsx:InventoryAdjustment]`: Registro de ajustes manuales, mermas y bajas por daño.
- `[inventoryAlerts.tsx:InventoryAlerts]`: Consola de alertas de desabastecimiento y recetas inhabilitadas.
- `[inventoryDashboard.tsx:InventoryDashboard]`: Tabla maestra de inventario con semáforos de stock, exportación CSV y acciones por lote.
- `[inventoryOnboardingForm.tsx:InventoryOnboardingForm]`: Modal de alta y edición multisede de ingredientes y productos.
- `[inventoryReceipts.tsx:InventoryReceipts]`: Recepción de órdenes de compra e ingreso de existencias.
- `[itemOnboarding.tsx:ItemOnboarding]`: Flujo de onboarding operativo de inventario con clasificación ABC.
- `[kdsDisplay.tsx:KdsDisplay]`: Pantalla de cocina (KDS) con seguimiento de estados por estación de preparación.
- `[orderFlow.tsx:OrderFlow]`: Flujo de comanda y pedidos para salón y domicilio con validación de reservas.
- `[orderTaking.tsx:OrderTaking]`: Terminal de toma de comandas y despacho para meseros.
- `[purchaseOrderForm.tsx:PurchaseOrderForm]`: Elaboración de órdenes de compra con control de calidad y alertas por variación de costo.
- `[recipeBook.tsx:RecipeBook]`: Catálogo navegable de recetas clasificadas por categoría.
- `[recipeDetail.tsx:RecipeDetail]`: Ficha técnica de receta con desglose de ingredientes y cálculo de margen.
- `[recipeForm.tsx:RecipeForm]`: Formulario de alta y edición de recetas estándar.
- `[recipeList.tsx:RecipeList]`: Vista de lista de recetas con duplicación y borrado masivo.
- `[salonDeck.tsx:SalonDeck]`: Plano interactivo de mesas de salón y control de comandas activas.
- `[settingsPanel.tsx:SettingsPanel]`: Consola de configuración de sucursales, mesas, impresoras, llaves de IA y purga operativa.
- `[subRecipeForm.tsx:SubRecipeForm]`: Formulario de diseño y costeo de subrecetas o preparaciones base.
- `[supplierForm.tsx:SupplierForm]`: Formulario de contacto y condiciones comerciales de proveedores.
- `[supplierManagementList.tsx:SupplierManagementList]`: Directorio y listado de proveedores.
- `[supplyOnboardingForm.tsx:SupplyOnboardingForm]`: Formulario de alta para suministros operativos no comestibles.
- `[EditarIngredienteForm.tsx:default]`: Envoltorio para edición rápida de ingredientes.
- `[ExcelImporter.tsx:ExcelImporter]`: Reexportación del modal de importación masiva de Excel.
- `[ImageUploader.tsx:default]`: Componente de carga y validación de imágenes con soporte arrastrar y soltar.
- `[InventoryItemDetail.tsx:default]`: Vista detallada de ítem con existencias consolidadas por sucursal.
- `[OmniSearch.tsx:default]`: Buscador global instantáneo sobre recetas, insumos y suministros.
- `[SplashScreen.tsx:SplashScreen]`: Pantalla inicial de carga con botón de recuperación de base de datos ante errores.
- `[SyncStatusBadge.tsx:SyncStatusBadge]`: Indicador de estado de sincronización con Firestore en cabecera.
- `[assetForm.tsx:default]`: Registro de activos fijos y reportes de daños o bajas.
- `[assetManagementList.tsx:default]`: Inventario de activos fijos y estado de mantenimiento.
- `[barInventory.tsx:default]`: Integración con báscula USB por Web Serial para auditoría de botellas de licor.
- Subdirectorios:
  - [Componentes de Inventario](./inventory/README.md): Vistas de lista de precios, importación de Excel y producción de subrecetas.
  - [Diagnóstico de Sincronización](./sync/README.md): Consola de monitoreo, logs y conciliación de Firestore.
  - [Componentes UI](./ui/README.md): Elementos de formulario accesibles, modales, selectores y barras de acción.
  - [Copilot de Voz](./voice/README.md): Botón de activación, widget flotante e interacción por voz.

## Invariantes
- `[kdsDisplay.tsx:handleUpdateItemStatus]`: No se permite pasar un ticket de `'ORDEN TOMADA'` a estados distintos de `'PREPARANDO'` u `'ORDEN TOMADA'`.
- `[orderFlow.tsx:handleAddToCart]`: Se bloquea la adición al carrito si el cálculo de disponibilidad indica falta de porciones.
- `[orderTaking.tsx:updateQuantity]`: No se permite reducir cantidad ni eliminar ítems que ya fueron despachados a cocina (`sent: true`).
- `[orderTaking.tsx:handleCancelOrder]`: La cancelación de una comanda activa exige un motivo no vacío (`cancelReason`).
- `[purchaseOrderForm.tsx:handleAddLineItem]`: Los ítems ingresados requieren `selectedItemId`, `receiptQuantity > 0` y `receiptCost > 0`; variaciones mayores al 10% solicitan confirmación.
- `[inventoryAdjustment.tsx:handleConfirmAdjustment]`: El descuento físico está acotado a cero mediante `Math.max(0, actual - cantidad)`.
- `[inventoryOnboardingForm.tsx:newItem.id]`: Genera identificadores con prefijos semánticos (`'ins-prd'`, `'ins-ing'`, `'ins-pkg'`, `'ins-ast'`).
- `[financialDashboard.tsx:calculations]`: Aplica la deducción del 8% de Impoconsumo (`TAX_RATE = 0.08`), calculando `netSales = grossSales * 0.92`.
- `[barInventory.tsx:BarInventory]`: Calcula el peso neto como `Math.max(0, pesoBáscula - tara)` y los mililitros netos dividiendo por densidad.

## Efectos Secundarios
- `[orderFlow.tsx:handleProcessPayment]`: Emite `'OrderPaid'` en `eventBus`, encola evento en el outbox y marca el pedido como `'CERRADA'`.
- `[orderFlow.tsx:handleFinalSubmit]`: Ejecuta `stageComandaStock` y emite `'OrderPlaced'` en `eventBus`.
- `[orderTaking.tsx:handleProcessPayment]`: Confirma descuentos con `commitComandaStock` y sincroniza con Firestore.
- `[purchaseOrderForm.tsx:handleSubmitReceipt]`: Ejecuta transacción en Dexie actualizando existencias, kardex, incidencias y outbox.
- `[salonDeck.tsx:handleProcessPayment]`: Actualiza el estado de la mesa, procesa pago y aplica deducción de stock.
- `[settingsPanel.tsx:handleSaveSettings]`: Guarda parámetros en `db.systemSettings` y actualiza las API keys de IA.
- `[barInventory.tsx:handleConnectScale]`: Abre conexión serie con el puerto USB a 9600 baudios.
- `[inventoryReceipts.tsx:handleSubmitReceipt]`: Incrementa inventario físico e inicia sincronización cloud.

## Verificación
- Ejecutar: `npm test`
