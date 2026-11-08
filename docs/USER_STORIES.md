# Historias de Usuario de Foodie POS (User Stories Backlog)

Este documento registra las Historias de Usuario (Vertical Slices) implementadas en Foodie POS, sus criterios de aceptación técnicos y de negocio, contratos de arquitectura y estado de entrega.

---

## [US-09] Alertas de Stock Crítico y Generación Automática de Órdenes de Compra Sugeridas en Foodie POS

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-07
- **Módulo:** Inventario & Compras (Offline-First Dexie)
- **Skill Aplicada:** `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`)

### Historia de Usuario
**Como** Administrador de Foodie POS  
**Quiero** visualizar alertas priorizadas (Agotado vs Bajo Stock) y generar borradores de órdenes de compra agrupadas por proveedor  
**Para** reabastecer cocina y bar de forma automática sin cálculos manuales.

### Criterios de Aceptación
1. **Alertas Priorizadas:**
   - **Prioridad 1 (Rojo / Agotado):** `availableStock <= 0` ubicado estrictamente en la cabecera superior de la tabla y diagnóstico.
   - **Prioridad 2 (Ámbar / Mínimo):** `availableStock <= minStock` ubicado a continuación.
   - Badges de alta accesibilidad WCAG AAA (> 7:1) con señalización cromática + icono + etiqueta textual sin depender exclusivamente del color.
2. **Cálculo de Cantidad Sugerida:**
   - Botón operativo explícito: `[ 📦 Generar Órdenes de Compra Sugeridas ]`.
   - Fórmula matemática de abastecimiento:
     $$\text{suggestedQuantity} = \max(1, (\text{item.maxStock} \parallel \text{item.minStock} \times 2) - \text{item.availableStock})$$
3. **Agrupación y Persistencia Offline-First (Dexie):**
   - Agrupación automática de los insumos seleccionados o en alerta por proveedor (`supplierId`).
   - Asignación estricta del identificador y nombre `'POR DEFINIR'` cuando un insumo no tiene proveedor asignado.
   - Creación y persistencia de registros en la tabla Dexie `purchaseOrders` con estado `status: 'DRAFT'`.
   - Emisión de evento outbox `PurchaseOrdersDraftCreated` en `domainOutbox` para sincronización cloud bidireccional.
4. **Sistema de Diseño y Tokens (DESIGN.md):**
   - Consumo de tokens neutros puros (Dark: `#0A0A0A`, `#171717`, `#262626`; Light: `#FAFAFA`, `#FFFFFF`, `#F4F4F5`).
   - Radios de borde normalizados: inputs y selects a `8px` (`rounded-sm`), cards y contenedores a `16px` (`rounded-lg`), modales a `20px` (`rounded-xl`), botones de acción a píldora (`rounded-full`).
   - Tipografía con números tabulares (`font-mono tabular-nums`) en cantidades y costos estimados para evitar saltos visuales.

### Fuera de Alcance (Out-of-Scope)
- No implementar envíos directos por correo electrónico ni integraciones externas con mensajería (WhatsApp, Telegram, etc.).
- No modificar existencias físicas (`physicalStock`): el stock físico real únicamente se incrementa con la recepción formal de mercancía en `PurchaseOrderForm`.

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Stock Disponible:**
  $$\text{availableStock} = \max(0, \text{physicalStock} - (\text{stagedStock} \parallel 0))$$
  Garantizado mediante `calculateItemAvailableStock` y `getAvailableStock`.
- **Esquema de Base de Datos:** Versión 13 en `src/db/localDb.ts` agregando la tabla `purchaseOrders: 'id, supplierId, status, createdAt'`.
- **Servicio Aislado:** `src/services/purchaseOrderService.ts`.
- **Componente de Interfaz:** `src/components/inventoryAlerts.tsx`.

### Verificación Automatizada
- Suite de pruebas unitarias: `src/services/purchaseOrderService.test.ts` (4 pruebas superadas al 100%).
- Verificación estricta de compilador TypeScript (`npx tsc -b` / `npm run build`): 0 errores.

---

## [US-10A] Precarga desde Orden de Compra y Gestión de Insumos Nuevos en la pantalla de Entradas (Compras)

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-07
- **Módulo:** Entradas de Mercancía & Kardex (Offline-First Dexie)
- **Skill Aplicada:** `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`)

### Historia de Usuario
**Como** Administrador de Foodie POS  
**Quiero** precargar los insumos desde una Orden de Compra pendiente y resolver automáticamente las unidades de medida conocidas o derivar a creación si el insumo es nuevo  
**Para** registrar entradas de mercancía en segundos sin reconfigurar unidades ya existentes en el sistema.

### Criterios de Aceptación
1. **Precarga desde Orden de Compra (O.C.):**
   - En 'Datos de Facturación', selector reactivo: `'Precargar desde Orden de Compra Pendiente'`.
   - Al seleccionar una O.C. existente:
     * Carga automáticamente el proveedor y la sede de destino.
     * Puebla la tabla `'Auditoría de Insumos Facturados'` con los ítems, cantidades y costos acordados en la O.C.
     * Permite ajustar manualmente en la tabla si la cantidad física recibida o el precio unitario facturado variaron en la entrega real.
2. **Resolución de Unidades (Existente vs Nuevo):**
   - **Para insumos que YA existen en `inventoryItems`:**
     * Resuelve automáticamente la unidad de compra (`purchaseUnit`), la unidad de uso en recetas (`countUnit` / `usageUnit`) y factores de conversión previamente parametrizados.
   - **Para insumos NUEVOS (no encontrados en el catálogo):**
     * Muestra en la fila de auditoría un badge destacado de alta accesibilidad: `'⚠️ Insumo Nuevo'`.
     * Botón operativo en la fila `'[ + Completar Ficha ]'` que despliega el modal interactivo `CompleteNewItemModal` para configurar tipo (ingrediente, producto único o suministro), categoría, foto, unidad de compra, unidad de uso, factor de equivalencia y mermas antes de autorizar el ingreso.
3. **Asentamiento al Kardex:**
   - Al pulsar `'[ Confirmar Entrada al Inventario ]'`:
     * Valida que no queden insumos nuevos sin ficha configurada (bloquea la operación con notificación precisa si alguno está incompleto).
     * Incrementa existencias físicas (`physicalStock` / `currentStock` / `realPhysicalStock`) en `inventoryItems`.
     * Actualiza el último precio de compra (`lastPurchasePrice = line.unitCost`), el costo técnico y el precio promedio ponderado.
     * Registra el movimiento formal en el Kardex (`inventoryMovements` / `inventoryLogs`) con tipo `'ENTRADA_COMPRA'` desglosado por sede.
     * Si la entrada proviene de una O.C., actualiza su estado en Dexie a `'RECEIVED'`.
     * Encola el evento en `sync_outbox` (`domainOutbox`) para replicación cloud offline-first.

### Fuera de Alcance (Out-of-Scope)
- Escáner de cámara/OCR en tiempo real (reservado para US-10B).
- Bots o servicios de mensajería externa.

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Kardex:**
  La entrada formal incrementa `physicalStock` en `inventoryItems`, actualiza `lastPurchasePrice` y asienta un registro inmutable en `inventoryLogs`.
- **Esquema de Base de Datos:**
  Tablas Dexie `inventoryItems`, `purchaseOrders`, `inventoryLogs` (`inventoryMovements`), `domainOutbox` (`sync_outbox`).
- **Componentes:**
  - `src/components/purchaseOrderForm.tsx`: Pantalla principal de Entradas (Compras).
  - `src/components/inventory/CompleteNewItemModal.tsx`: Modal para completar ficha técnica de insumos nuevos.

### Verificación Automatizada
- Verificación estricta de compilador TypeScript (`npx tsc -b`): **0 errores**.
- Compilación de producción con Vite (`npm run build`): **0 errores (2.64s)**.

---

## [US-09B] Enlace Fluido Alertas-Compras y Humanización de Órdenes de Compra en Foodie POS

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-07
- **Módulo:** Inventario & Compras (Offline-First Dexie)
- **Skill Aplicada:** `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`)

### Historia de Usuario
**Como** Administrador de Foodie POS  
**Quiero** un enlace fluido entre la consola de alertas y la recepción de compras, visualizando siempre nombres comerciales legibles en lugar de identificadores técnicos  
**Para** auditar y recibir pedidos sugeridos en un solo clic con máxima claridad operativa sin fricción.

### Criterios de Aceptación
1. **Helper de Formateo Comercial de Órdenes (`src/utils/purchaseOrderUtils.ts`):**
   - Función pura `formatPurchaseOrderLabel(order: PurchaseOrder, suppliers: Supplier[]): string`:
     * Cruza `order.supplierId` con la lista de proveedores.
     * Si coincide: `${supplier.name} · ${order.items?.length || 0} ítems · ${formatCurrency(total)}`.
     * Si no tiene proveedor: `Proveedor por Definir · ${order.items?.length || 0} ítems${total > 0 ? ' · ' + formatCurrency(total) : ''}`.
     * **Invariante de Humanización:** NUNCA mostrar en la interfaz de usuario IDs técnicos crudos como `'po-draft-179409...'`.
   - Función auxiliar pura `getHumanizedPurchaseOrderSupplier(order, suppliers)` para titulares y banners contextuales.
2. **Mejora en Pantalla de Alertas (`src/components/inventoryAlerts.tsx` / `src/pages/inventory/AlertasDeStock.tsx`):**
   - En la tarjeta KPI `'Borradores O.C. (Dexie)'`:
     * Muestra la última O.C. generada con su etiqueta comercial legible vía `formatPurchaseOrderLabel`.
     * Botón operativo directo: `[ ⚡ Recibir Pedido / Ver Borrador ]`.
     * Al hacer clic, navega fluidamente hacia la vista de compras pasando el ID por query param y estado: `/inventario/compras?orderId=${order.id}`.
   - En el modal de visualización de borradores, se ocultan todos los identificadores crudos y se humanizan los títulos.
3. **Navegación y Precarga Automática en Compras (`src/components/purchaseOrderForm.tsx` / `src/pages/inventory/EntradasCompras.tsx`):**
   - En el selector reactivo `'PRECARGAR DESDE ORDEN DE COMPRA PENDIENTE'`:
     * Renderiza las opciones del desplegable usando `formatPurchaseOrderLabel` en lugar del ID alfanumérico.
   - Detección reactiva de URL query params (`?orderId=...`) o `history.state.orderId`:
     * Selecciona y activa automáticamente la O.C. correspondiente sin exigir interacción manual.
     * Puebla de inmediato la tabla `'Auditoría de Insumos Facturados'` con los ítems, cantidades y precios acordados.
     * Despliega en la parte superior un banner informativo contextual accesible:
       * *'Mostrando borrador de [Nombre Proveedor] derivado de alerta de stock crítico. (X insumos precargados listos para auditar y recibir)'*.
       * Incluye botón para descartar la precarga y regresar al modo de entrada manual libre si se desea.
4. **Sistema de Diseño y Tokens (DESIGN.md):**
   - Consumo de tokens neutros (`#0A0A0A`, `#171717`, `#262626`, `#FAFAFA`).
   - Botón directo de recepción con radio píldora (`rounded-full`), tarjetas con `rounded-lg` (16px) e inputs/selects con `rounded-sm` (8px).

### Fuera de Alcance (Out-of-Scope)
- No alterar esquemas de base de datos ni romper la reactividad de `useLiveQuery`.
- No modificar el flujo de escáner OCR o tickets físicos externos.

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Humanización UI:**
  Todo ID de orden de compra en pantalla es interceptado y reemplazado por la combinación de proveedor, conteo de ítems y total estimado.
- **Invariante de Kardex:**
  Al confirmar la recepción de la O.C., el estado pasa a `'RECEIVED'` y los insumos se asientan formalmente al Kardex mediante transacción atómica en Dexie.
- **Componentes y Módulos:**
  - `src/utils/purchaseOrderUtils.ts`
  - `src/utils/purchaseOrderUtils.test.ts`
  - `src/components/inventoryAlerts.tsx`
  - `src/components/purchaseOrderForm.tsx`
  - `src/pages/inventory/AlertasDeStock.tsx`
  - `src/pages/inventory/EntradasCompras.tsx`

### Verificación Automatizada
- Suite de pruebas unitarias: `src/utils/purchaseOrderUtils.test.ts` (3 pruebas superadas al 100%).
- Suite de servicios: `src/services/purchaseOrderService.test.ts` (4 pruebas superadas al 100%).
- Verificación estricta de tipos TypeScript (`npx tsc -b`): **0 errores**.
- Compilación de producción con Vite (`npm run build`): **0 errores**.

---

## [US-09C] Historial, Filtros y Gestión de Ciclo de Vida de Órdenes de Compra en Foodie POS

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-07
- **Módulo:** Inventario & Compras (Offline-First Dexie)
- **Skill Aplicada:** `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`)

### Historia de Usuario
**Como** Administrador de Foodie POS  
**Quiero** consultar el historial completo de órdenes de compra con filtros avanzados por proveedor, rango de fechas, estado y búsqueda de insumos, además de gestionar su ciclo de vida y cancelación  
**Para** auditar las adquisiciones de cocina y bar, tener control de costos históricos y cancelar órdenes obsoletas sin afectar el inventario.

### Criterios de Aceptación
1. **Actualización de la Consulta del Selector de Recepción (`src/components/purchaseOrderForm.tsx`):**
   - Modificación de la consulta reactiva `useLiveQuery` en el selector `'Precargar desde Orden de Compra Pendiente'`:
     * Filtrado estricto: `order.status !== 'RECEIVED' && order.status !== 'CANCELLED'` (solo se listan órdenes activas en `DRAFT` u `ORDERED`).
     * Al asentar la entrada al inventario y marcarla `RECEIVED`, la orden desaparece inmediatamente del desplegable de recepción y se guardan `receivedAt` e `invoiceNumber`.
2. **Componente y Pantalla de Historial (`src/pages/inventory/HistoricoOrdenesCompra.tsx`):**
   - **Barra de Filtros Reactivos en la cabecera:**
     * Rango de fechas: `Fecha Desde` y `Fecha Hasta` en inputs estándar.
     * Proveedor: Selector reactivo con catálogo de proveedores registrados más opciones `'Todos'` y `'Proveedor por Definir'`.
     * Estado: Botones píldora de filtro rápido con contadores en tiempo real: `'Todas'`, `'Borrador'`, `'Pedidas'`, `'Recibidas'`, `'Canceladas'`.
     * Campo de búsqueda por texto libre: filtra por insumos contenidos en la orden, nombre de proveedor, número de factura o notas.
   - **Métricas KPI en la parte superior:**
     * Total órdenes históricas, órdenes recibidas, pendientes/borradores e importe total invertido.
   - **Tabla Histórica con Cifras Tabulares:**
     * Columnas: Fecha, Proveedor, Total Ítems, Importe Estimado/Facturado, Factura Vinculada (si aplica), Estado (Badge semántico), Acciones.
     * Cifras monetarias y cantidades formateadas con números tabulares (`font-mono tabular-nums`).
     * Badges semánticos accesibles: Verde para `RECEIVED`, Rojo para `CANCELLED`, Ámbar para `DRAFT`, Azul para `ORDERED`.
3. **Modal de Detalle y Cancelación (`src/components/inventory/PurchaseOrderDetailModal.tsx`):**
   - Botón `'[ Ver Detalle ]'` abre el modal interactivo con desglose de:
     * Nombre comercial del proveedor, fecha de creación, fecha de recepción, factura vinculada y tabla pormenorizada de insumos, cantidades, costo unitario y subtotal.
   - Botón `'[ Cancelar Orden ]'`:
     * Habilitado **estrictamente** si el estado es `DRAFT` u `ORDERED`. Oculto/deshabilitado para órdenes `RECEIVED` o `CANCELLED`.
     * Flujo de confirmación accesible con campo opcional para motivo de cancelación.
     * Al confirmar: muta el estado a `'CANCELLED'`, registra marca temporal `cancelledAt` y encola evento `PurchaseOrderCancelled` en `domainOutbox`.
   - Botón `'[ ⚡ Recibir en Compras ]'`:
     * Permite precargar y asentar la orden directamente en el formulario de Entradas.
4. **Navegación y Accesos Rápidos (`src/components/inventory/PurchaseNavHeader.tsx`):**
   - Barra de pestañas tipo píldora integrada en la cabecera de `Entradas (Compras)`, `Alertas de Stock` e `Histórico de Órdenes` para alternancia inmediata con contadores de insumos críticos y borradores activos.
   - Enlace directo a `'Histórico de Órdenes'` en el submenú de Inventario del sidebar principal y soporte de ruta directa (`/inventario/historico`).

### Fuera de Alcance (Out-of-Scope)
- Revertir recepciones ya asentadas en el Kardex (las devoluciones a proveedor se gestionan mediante módulo de notas de crédito/mermas).
- Envíos por correo electrónico o APIs de proveedores.

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Exclusión en Entradas:**
  El selector de precarga excluye incondicionalmente órdenes con `status === 'RECEIVED'` o `status === 'CANCELLED'`.
- **Invariante de Cancelación:**
  No es posible cancelar órdenes con `status === 'RECEIVED'` o re-cancelar órdenes `'CANCELLED'`. Solo `DRAFT` u `ORDERED` pueden cancelarse.
- **Invariante de Trazabilidad Offline-First:**
  Toda mutación de estado (`CANCELLED`, `ORDERED`, `RECEIVED`) actualiza `updatedAt` y encola un evento en `domainOutbox` para replicación en la nube.
- **Componentes y Módulos:**
  - `src/types/index.ts` (campos `receivedAt`, `invoiceNumber`, `cancelledAt`, `cancellationReason`)
  - `src/services/purchaseOrderService.ts` (`cancelPurchaseOrder`, `updatePurchaseOrderStatus`, `getAllPurchaseOrders`)
  - `src/services/purchaseOrderService.test.ts`
  - `src/components/inventory/PurchaseNavHeader.tsx`
  - `src/components/inventory/PurchaseOrderDetailModal.tsx`
  - `src/pages/inventory/HistoricoOrdenesCompra.tsx`
  - `src/components/purchaseOrderForm.tsx`
  - `src/components/inventoryAlerts.tsx`
  - `src/pages/inventory/AlertasDeStock.tsx`
  - `src/pages/inventory/EntradasCompras.tsx`
  - `src/App.tsx`

### Verificación Automatizada
- Suite de pruebas unitarias: `src/services/purchaseOrderService.test.ts` (8 pruebas superadas al 100%).
- Verificación estricta de tipos TypeScript (`npx tsc -b`): **0 errores**.
- Compilación de producción con Vite (`npm run build`): **0 errores**.

---

## [US-09D] Limpieza UI/UX, Corrección de Z-Index, Layout Horizontal de Compras y Estandarización de Órdenes de Compra [IMPLEMENTED]

**Como** Administrador de Foodie POS  
**Quiero** una interfaz limpia, sin textos técnicos internos, con selectores flotantes correctos (z-index), disposición horizontal en compras y creación directa de órdenes manuales  
**Para** agilizar el flujo de reabastecimiento sin fricciones visuales ni pasos redundantes.

### Criterios de Aceptación Cumplidos:
1. **Corrección de Z-Index y Selects Flotantes (`src/components/ui/CustomSelect.tsx` & `src/components/inventoryAlerts.tsx`):**
   - El contenedor activo de `CustomSelect` eleva su capa con `z-30` cuando está desplegado y su menú flotante utiliza `z-50 shadow-2xl`.
   - Se removió el recorte visual `overflow-hidden` del panel de filtros en `InventoryAlerts` y se asignó `relative z-30`, garantizando que el menú desplegable flote libremente por encima de la tarjeta de *Alertas Priorizadas*.
2. **Limpieza Visual en Pantalla de Alertas (`src/components/inventoryAlerts.tsx`):**
   - Eliminados los checkboxes de selección por fila en la tabla de *Alertas Priorizadas* (simplificando la operativa y evitando selecciones innecesarias).
   - Incorporado el botón primario `[ + Nueva Orden Manual ]` en la barra superior de acciones junto a `[ 📦 Generar Órdenes de Compra Sugeridas ]`.
   - Removidas todas las etiquetas técnicas internas de títulos y subtítulos (`[US-09]`, `Offline-First Dexie`, `(Borradores en Dexie)`), asegurando textos 100% comerciales y orientados al usuario final.
3. **Flujo de Creación Manual de O.C. (`src/components/inventory/ManualPurchaseOrderModal.tsx`):**
   - Creación directa con estado `ORDERED` (eliminando la fricción de estado intermedio `DRAFT`).
   - Al confirmar el pedido, persiste inmediatamente en Dexie y encola el evento `PurchaseOrderCreated` en `domainOutbox`.
   - Cierra el modal y refresca reactivamente las listas sin abrir automáticamente el modal de detalle.
4. **Limpieza en Histórico de Órdenes (`src/pages/inventory/HistoricoOrdenesCompra.tsx`):**
   - Removido el botón `'Registrar Entrada'` de las filas del histórico (la recepción de mercancía se realiza exclusivamente en la pantalla de Entradas/Compras).
   - Acciones de fila estandarizadas a `[ Ver Detalle ]` y `[ Cancelar ]` (para órdenes pendientes `DRAFT` u `ORDERED` mediante `handleCancelOrderDirect`).
   - Eliminadas etiquetas técnicas visibles (`Ciclo de Vida [US-09C]` reemplazado por `Trazabilidad y Auditoría`).
5. **Limpieza y Layout Horizontal en Entradas/Compras (`src/components/purchaseOrderForm.tsx`):**
   - Reorganizado el layout a una grilla horizontal balanceada (`grid-cols-1 lg:grid-cols-12 gap-6 items-start` con proporción 4/8 en pantallas grandes).
   - Eliminado el banner verde redundante de precarga (*"Mostrando borrador de Proveedor..."*), permitiendo una precarga limpia y silenciosa en la tabla de auditoría.
   - Eliminadas etiquetas técnicas en subtítulos (`[US-10A]`).
6. **Limpieza de Sidebar (`src/App.tsx`):**
   - En el submenú de Inventario, en la opción `'Compras'`, se eliminó el icono chevron (`arrow_forward_ios`) que desalineaba visualmente la lista respecto al resto de ítems.

### Fuera de Alcance (Out-of-Scope)
- No alterar las fórmulas de costeo ni el staging de inventario.
- No implementar OCR fotográfico aún (reservado para US-10B).

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Ciclo de Vida Directo:**
  Las órdenes de compra creadas manualmente se asientan directamente con `status === 'ORDERED'`.
- **Invariante de Apilamiento Visual:**
  Todos los menús flotantes de formulario poseen elevación superior a las tarjetas de contenido subsiguientes (`z-30` en contenedor, `z-50` en dropdown).
- **Archivos Modificados:**
  - `src/components/ui/CustomSelect.tsx`
  - `src/components/inventoryAlerts.tsx`
  - `src/components/inventory/ManualPurchaseOrderModal.tsx`
  - `src/pages/inventory/HistoricoOrdenesCompra.tsx`
  - `src/components/purchaseOrderForm.tsx`
  - `src/App.tsx`
  - `docs/USER_STORIES.md`

---

## [US-09E] Pulido UI/UX: Contraste de Botones, Navegación de Órdenes y Limpieza Visual [IMPLEMENTED]

**Como** Administrador de Foodie POS  
**Quiero** botones con contraste nítido en temas claro y oscuro, navegación automática al Histórico tras crear una orden, y una cabecera de compras limpia  
**Para** operar el reabastecimiento con visibilidad impecable y verificar de inmediato las órdenes generadas.

### Criterios de Aceptación Cumplidos:
1. **Contraste y Estilos de Botones (`src/components/purchaseOrderForm.tsx`):**
   - El botón `'Añadir Insumo a la Factura'` consume los tokens semánticos del sistema (`bg-action hover:bg-action-hover active:bg-action-pressed text-action-text font-black rounded-full shadow-md`).
   - Modo Oscuro: fondo crema cálido (`#F5EFE6`) con texto dark ink (`#0A0A0A`) logrando un contraste superior a 18:1 (WCAG AAA).
   - Modo Claro: fondo dark ink (`#0A0A0A`) con texto crema (`#FBF7F0`) con contraste superior a 19:1 (WCAG AAA).
   - Comportamiento hover/mouse-over: transiciones de contraste definidas sin fundidos apagados ni bordes oscurecidos.
2. **Eliminación de Elementos Innecesarios:**
   - Cabecera de Compras: Eliminado por completo el badge/etiqueta técnica `'Kardex v13'` junto al título `'Entradas Inteligentes (Compras)'`.
   - Histórico de Órdenes: Verificación de cero botones residuales `'Registrar Entrada'` dentro de las filas de la tabla histórica.
3. **Flujo de Redirección al Crear Orden Manual (`src/components/inventory/ManualPurchaseOrderModal.tsx` & `inventoryAlerts.tsx`):**
   - Al guardar la orden: persiste en Dexie con estado `'ORDERED'` y encola el evento `PurchaseOrderCreated`.
   - Cierra el modal y redirige/navega inmediatamente a la vista de `'Histórico de Órdenes'`, actualizando el tab activo de `PurchaseNavHeader` para mostrar la orden generada al instante en el tope de la tabla.
4. **Layout Horizontal Balanceado en Compras (`src/components/purchaseOrderForm.tsx`):**
   - Panel Superior (completo horizontal `w-full`):
     * *Datos de Facturación*: cuadrícula horizontal responsive de 4 columnas (Precarga O.C., Sede, Proveedor, Factura).
     * *Añadir Insumo Manual*: subgrilla horizontal integrada con filtros de insumos, selector de catálogo, cantidades, costos, lote, vencimiento y botón de acción principal alineado.
   - Panel Inferior (completo horizontal `w-full`):
     * *Auditoría de Insumos Facturados*: tabla completa aprovechando el 100% del ancho de pantalla.
     * Barra inferior con *Total Factura* y botón principal de confirmación de entrada al Kardex.

### Fuera de Alcance (Out-of-Scope)
- No modificar lógica de Kardex ni de costeo de inventario.
- No implementar el OCR de cámara todavía (reservado para US-10B).

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Contraste Operativo:**
  Todo control primario de acción debe superar un ratio de contraste mínimo de 4.5:1 (WCAG AA) y 7:1 (WCAG AAA) en ambos temas.
- **Invariante de Navegación Contextual:**
  La creación de una orden de compra manual siempre conmuta el estado de sección a `'PURCHASE_ORDERS_HISTORY'`.
- **Archivos Modificados:**
  - `src/components/purchaseOrderForm.tsx`
  - `src/components/inventory/ManualPurchaseOrderModal.tsx`
  - `src/components/inventoryAlerts.tsx`
  - `src/pages/inventory/HistoricoOrdenesCompra.tsx`
  - `docs/USER_STORIES.md`

---

## [US-09F] Densidad Visual Compacta y Reubicación de Filtros en Compras [IMPLEMENTED]

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-07
- **Módulo:** Compras y Entradas al Inventario (Offline-First Dexie)
- **Skill Aplicada:** `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`)

### Historia de Usuario
**Como** Administrador de Foodie POS  
**Quiero** que los formularios de facturación y captura de insumos sean visualmente compactos y que los filtros de categoría estén integrados sobre el selector de catálogo  
**Para** registrar compras de forma ágil en una sola pantalla sin scrolls innecesarios ni controles sobredimensionados.

### Criterios de Aceptación Cumplidos:
1. **Reubicación y Escala de Filtros de Catálogo (`src/components/purchaseOrderForm.tsx`):**
   - Grupo de píldoras (`'Todos'`, `'Ingredientes'`, `'Productos Únicos'`, `'Suministros'`) ubicado en la misma fila horizontal al lado del título de sección `'Añadir Insumo Manual'`.
   - Permite conmutar el tipo de recurso con tamaño mini (`text-[11px] py-1 px-2.5 rounded-full font-bold`) sin saturar los selectores individuales.
2. **Compacidad en Datos de Facturación (`src/components/purchaseOrderForm.tsx`):**
   - Grilla compacta de 4 columnas en desktop (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`).
   - Labels estandarizados a `text-[11px] font-medium uppercase tracking-wider text-neutral-400 mb-1`.
   - Controles `CustomSelect` e `Input` calibrados a altura compacta `h-10` (40px) y texto `text-sm px-3 py-1.5`.
3. **Layout Horizontal en 1 Sola Fila Completa de 12 Columnas en Añadir Insumo Manual (`src/components/purchaseOrderForm.tsx`):**
   - Todos los campos y el botón de acción se consolidan en una única fila horizontal perfectamente alineada (`gap-2.5 items-end`):
     * `lg:col-span-2`: Selector de catálogo (`h-10 text-xs px-2.5`).
     * `lg:col-span-2`: Cantidad (`h-10 text-sm text-right px-3 py-1.5`).
     * `lg:col-span-2`: Costo Unitario (`h-10 text-sm text-right px-3 py-1.5`).
     * `lg:col-span-1`: Calidad de Recepción (`h-10 text-xs px-2`).
     * `lg:col-span-2`: Lote / Batch (`h-10 text-sm px-2.5 py-1.5`).
     * `lg:col-span-2`: Fecha Vencimiento (`CustomDatePicker` a `h-10 text-xs px-2.5`).
     * `lg:col-span-1`: Botón **"Agregar"** a altura uniforme `h-10`, `rounded-full`, alto contraste AAA (`bg-action text-action-text font-black hover:bg-action-hover active:bg-action-pressed`).
4. **Soporte de Alturas y Paddings Personalizados en Componentes UI Base:**
   - `src/components/ui/Input.tsx`: Soporta clases personalizadas de altura `h-*`, `py-*` y `px-*` sin colisión con la clase predeterminada `h-11`.
   - `src/components/ui/CustomSelect.tsx`: Detecta `h-*`, `py-*` y `px-*` personalizados para alineación precisa a 40px (`h-10`).
   - `src/components/ui/CustomDatePicker.tsx`: Aplica `h-*`, `py-*` y `px-*` personalizados asegurando paridad visual exacta con inputs y selects.

### Fuera de Alcance (Out-of-Scope)
- No modificar el algoritmo de cálculo de costos promedio ni fórmulas de inventario.
- No alterar esquemas de la base de datos Dexie.

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Alineación Geométrica:**
  Todos los controles de entrada de formulario y botones de acción en una misma fila deben compartir una altura idéntica de `40px` (`h-10`) con bordes normalizados a `8px` (`rounded-sm`).
- **Archivos Modificados:**
  - `src/components/purchaseOrderForm.tsx`
  - `src/components/ui/Input.tsx`
  - `src/components/ui/CustomSelect.tsx`
  - `src/components/ui/CustomDatePicker.tsx`
  - `docs/USER_STORIES.md`

---

## [US-09G] Limpieza Reactiva de Precarga y Grilla Estricta de 12 Columnas en Foodie POS [IMPLEMENTED]

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-08
- **Módulo:** Compras y Entradas al Inventario (Offline-First Dexie)
- **Skill Aplicada:** `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`)

### Historia de Usuario
**Como** Administrador de Foodie POS  
**Quiero** una precarga silenciosa de órdenes de compra, ocultar automáticamente la captura manual cuando una orden esté activa y contar con una grilla estricta de 12 columnas con botón "AGREGAR"  
**Para** auditar y recibir órdenes de compra sin distracciones visuales ni controles redundantes en pantalla.

### Criterios de Aceptación Cumplidos:
1. **Silenciamiento de Precarga de Órdenes (`src/components/purchaseOrderForm.tsx`):**
   - Eliminadas todas las notificaciones toast (`toast.success` / `toast.info`) al seleccionar una orden de compra pendiente.
   - Eliminado cualquier texto o badge verde residual (`✓ ARA · 1 ítem · $37.450,00`) bajo el selector de orden de compra.
   - La precarga en la tabla de auditoría se ejecuta de forma 100% limpia, instantánea y silenciosa.
2. **Visibilidad Condicional de 'Añadir Insumo Manual' (`src/components/purchaseOrderForm.tsx`):**
   - La sección *Añadir Insumo Manual* se renderiza única y exclusivamente cuando el valor seleccionado en la O.C. sea nulo, vacío o `'-- Ninguna (Entrada manual) --'` (`!selectedPurchaseOrderId`).
   - Al seleccionar una orden de compra pendiente activa, la sección manual se oculta por completo, enfocando la pantalla exclusivamente en la *Auditoría de Insumos Facturados*.
3. **Distribución Horizontal en Grilla Estricta de 12 Columnas (`src/components/purchaseOrderForm.tsx`):**
   - En la sección *Añadir Insumo Manual*, los controles se organizan en `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-end`:
     * `lg:col-span-3`: Catálogo / Insumo con las píldoras de filtro (`Todos`, `Ingredientes`, `Productos Únicos`, `Suministros`) integradas en la cabecera del label.
     * `lg:col-span-1`: Cantidad con clases `py-1.5 px-2 text-center text-sm font-mono tabular-nums`.
     * `lg:col-span-1`: Costo Unitario con clases `py-1.5 px-2 text-right text-sm font-mono tabular-nums`.
     * `lg:col-span-2`: Calidad de Recepción (`CustomSelect` a `h-10 text-xs px-2`).
     * `lg:col-span-1`: Lote / Batch (`Input` con placeholder breve `'ej. L-2026'`).
     * `lg:col-span-3`: Fecha Vencimiento (`CustomDatePicker` popover).
     * `lg:col-span-1`: Botón de acción con rótulo estricto `'AGREGAR'` (sin iconos ni símbolos), altura `h-10`, `w-full`, fuente `text-xs uppercase font-bold tracking-wider`, y estilo de alto contraste `bg-[#F5EFE6] text-neutral-900 hover:bg-white active:scale-95 transition-all`.

### Fuera de Alcance (Out-of-Scope)
- No alterar las fórmulas de costeo ni el staging de inventario.
- No modificar el esquema de base de datos de Dexie.

### Contratos de Arquitectura & EGM Invariants
- **Invariante de Contexto Operativo:**
  La recepción de O.C. formal y la captura manual de insumos son modos mutuamente excluyentes en la cabecera de entrada.
- **Invariante de Grilla Estricta:**
  La suma de anchos de columna en pantallas `lg` suma exactamente 12 unidades (3 + 1 + 1 + 2 + 1 + 3 + 1 = 12).
- **Archivos Modificados:**
  - `src/components/purchaseOrderForm.tsx`
  - `src/pages/inventory/HistoricoOrdenesCompra.tsx`
  - `src/components/inventoryAlerts.tsx`
  - `src/components/inventoryDashboard.tsx`
  - `src/components/recipeDetail.tsx`
  - `docs/USER_STORIES.md`

---

## [REMEDIATION] Eliminación de Datos Ficticios (Fake / Mock) y Adopción Estricta de SSoT Dexie [IMPLEMENTED]

- **Estado:** `[IMPLEMENTED]`
- **Fecha de Implementación:** 2026-11-08
- **Módulos:** Inventario, Alertas, Recetas y Dashboard
- **Principio:** Cero datos estáticos o simulados; 100% fuentes de datos reales desde IndexedDB/Dexie y registros operativos del Kardex.

### Criterios Cumplidos:
1. **Alertas de Vencimiento HACCP 100% Dinámicas (`src/components/inventoryAlerts.tsx`):**
   - Eliminado el array estático de prueba (`expirationAlerts` con Queso Burrata Fresco, Tomate Cherry, Solomillo de Ternera).
   - Sustituido por cálculo reactivo en vivo sobre `inventoryItems` y `sucursalStock`:
     * Se evalúan las fechas reales `fechaVencimiento` registradas en el catálogo o lotes de entrada.
     * Si no hay insumos con vencimiento próximo en la base de datos, no se muestra ninguna alerta ficticia.
2. **Eliminación de Mockup Fallbacks en Costeo de Recetas (`src/components/recipeDetail.tsx`):**
   - Eliminados los fallbacks fijos por ID (`ins-pan-brioche`, `ins-beef-angus`, `ins-cheddar-madurado`, `ins-tocineta-ahumada`, `subrec-salsa-picara`).
   - Eliminada la inyección forzada del ingrediente estático `"Cebolla Roja & Salsas"` en recetas con identificador "pícara".
   - Todo costo y nombre de ingrediente se resuelve estrictamente desde las entidades persistidas en `inventoryItems` y `recipes`.
3. **Generación Dinámica de Fechas y Control en Gestión de Inventario (`src/components/inventoryDashboard.tsx`):**
   - Eliminado el array estático `dateOptions` con meses fijos de 2026. Ahora se genera dinámicamente a partir del mes y año en curso.
   - Eliminada la etiqueta estática de última fecha de control (`24 Oct 2026`). Se calcula de forma reactiva a partir de la marca temporal (`timestamp`) del último movimiento registrado en `inventoryLogs`.







