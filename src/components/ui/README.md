# Paquete de Componentes UI

## Visión General
El directorio `src/components/ui` contiene 17 componentes de interfaz reutilizables para FoodiePOS, incluyendo controles de formulario (`Input`, `Textarea`, `Select`, `CustomSelect`, `ComboBox`, `MultiSelectCombobox`, `DatePicker`, `PriceInput`, `Switch`, `CategorySelector`), modales y diálogos (`Modal`, `ConfirmDialog`, `DiscardChangesModal`, `CreateCategoryModal`, `CreateSupplierModal`) y barras de herramientas (`BulkActionBar`, `FormActionsBar`). Los componentes ofrecen estilos y comportamientos consistentes en todos los temas visuales, con persistencia local en Dexie integrada en `CreateCategoryModal`.

## Interfaz
- `[BulkActionBar.tsx:BulkActionBar]`: Barra flotante para acciones masivas sobre filas seleccionadas.
- `[CategorySelector.tsx:CategorySelector]`: Selector desplegable de categorías con enlace rápido de creación.
- `[ComboBox.tsx:Combobox]`: Selector individual con campo de búsqueda integrado.
- `[ConfirmDialog.tsx:ConfirmDialog]`: Modal de confirmación para acciones destructivas o críticas.
- `[CreateCategoryModal.tsx:CreateCategoryModal]`: Modal para crear y almacenar nuevas categorías en IndexedDB.
- `[CreateSupplierModal.tsx:CreateSupplierModal]`: Modal para registrar nuevos proveedores.
- `[CustomSelect.tsx:CustomSelect]`: Selector estilizado con soporte de temas visuales.
- `[DatePicker.tsx:DatePicker]`: Control de selección de fechas.
- `[DiscardChangesModal.tsx:DiscardChangesModal]`: Modal de advertencia ante cambios sin guardar.
- `[FormActionsBar.tsx:FormActionsBar]`: Barra inferior estándar para guardar o cancelar en formularios.
- `[Input.tsx:Input]`: Campo de texto estándar accesible.
- `[Modal.tsx:Modal]`: Base accesible para ventanas modales con capa de fondo.
- `[MultiSelectComboBox.tsx:MultiSelectCombobox]`: Selector de etiquetas múltiples con autocompletado.
- `[PriceInput.tsx:PriceInput]`: Campo de entrada monetaria con formato y cursor numérico.
- `[Select.tsx:Select]`: Envoltorio estilizado sobre el elemento nativo `select`.
- `[Switch.tsx:Switch]`: Interruptor accesible de activación/desactivación.
- `[Textarea.tsx:Textarea]`: Campo multilínea de texto.

## Invariantes
- `[BulkActionBar.tsx:selectedCount]`: Retorna `null` si `selectedCount === 0`.
- `[ConfirmDialog.tsx:isOpen]`: Retorna `null` si `!isOpen`.
- `[CreateCategoryModal.tsx:isOpen]`: Retorna `null` si `!isOpen`.
- `[CreateCategoryModal.tsx:trimmed]`: Exige un nombre de categoría no vacío antes de proceder a la creación.
- `[CreateSupplierModal.tsx:isOpen]`: Retorna `null` si `!isOpen`.
- `[DiscardChangesModal.tsx:isOpen]`: Retorna `null` si `!isOpen`.
- `[Modal.tsx:isOpen]`: Retorna `null` si `!isOpen`.

## Efectos Secundarios
- `[CategorySelector.tsx:handleClickOutside]`: Agrega y limpia la escucha `mousedown` en el documento para cerrar al hacer clic afuera.
- `[CategorySelector.tsx:timer]`: Programa `setTimeout` para enfocar automáticamente el campo de búsqueda al abrir.
- `[ComboBox.tsx:handleClickOutside]`: Agrega y limpia la escucha `mousedown` para cerrar al hacer clic afuera.
- `[ConfirmDialog.tsx:handleKeyDown]`: Escucha la tecla `Escape` en la ventana para cancelar el diálogo.
- `[CreateCategoryModal.tsx:handleSubmit]`: Escribe en tablas locales de Dexie (`targetTable.put`, `db.categories.put`, `db.systemSettings.put`).
- `[CreateCategoryModal.tsx:enqueueOfflineEvent]`: Encola el evento `CategoryCreated` en el outbox de IndexedDB.
- `[CreateCategoryModal.tsx:toast]`: Emite notificaciones con `react-hot-toast`.
- `[CustomSelect.tsx:handleClickOutside]`: Detecta clics fuera del contenedor para cerrar el menú.
- `[Modal.tsx:handleKeyDown]`: Permite el cierre mediante la tecla `Escape`.
- `[PriceInput.tsx:handleFocus]`: Selecciona todo el contenido numérico al recibir foco mediante `setTimeout`.

## Verificación
- Ejecutar: `npm test`
