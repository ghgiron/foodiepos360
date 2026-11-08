# Paquete de Páginas de Inventario

## Visión General
El directorio `src/pages/inventory` contiene envoltorios de página ligeros en React que conectan el estado de navegación y los datos precargados por IA hacia los componentes de formulario (`EditarIngredienteForm`, `ItemOnboarding`, `InventoryOnboardingForm` y `SupplyOnboardingForm`).

## Interfaz
- `[HistoricoOrdenesCompra.tsx:HistoricoOrdenesCompra]`: Pantalla de historial de órdenes de compra [US-09C], con filtros multidimensionales (rango de fechas, proveedor, estado y búsqueda de texto), métricas KPI y tabla de trazabilidad operativa.
- `[AlertasDeStock.tsx:AlertasDeStock]`: Componente de página que renderiza `InventoryAlerts` [US-09/US-09B], gestionando filtros iniciales y navegación contextual con parámetros de orden de compra hacia `/inventario/compras?orderId=...`.
- `[EntradasCompras.tsx:EntradasCompras]`: Componente de página que renderiza `PurchaseOrderForm` [US-10A/US-09B], conectando precarga desde órdenes de compra y resolución de insumos nuevos.
- `[EditarIngrediente.tsx:EditarIngrediente]`: Componente de página que renderiza `EditarIngredienteForm` con navegación de retorno asistida.
- `[NuevoElementoInventario.tsx:NuevoElementoInventario]`: Envoltorio de página para `ItemOnboarding` con retorno contextual seguro.
- `[NuevoIngrediente.tsx:NuevoIngrediente]`: Componente que renderiza `InventoryOnboardingForm` preconfigurado para tipo `INGREDIENT` con datos de voz precargados.
- `[NuevoProductoUnico.tsx:NuevoProductoUnico]`: Componente que renderiza `InventoryOnboardingForm` preconfigurado para tipo `PRODUCT` con datos precargados.
- `[NuevoSuministro.tsx:NuevoSuministro]`: Componente que renderiza `SupplyOnboardingForm` con datos de formulario precargados.

## Invariantes
- Ninguna

## Efectos Secundarios
- Ninguno

## Verificación
- Ejecutar: `npm test`
