# Paquete de Páginas de Inventario

## Visión General
El directorio `src/pages/inventory` contiene envoltorios de página ligeros en React que conectan el estado de navegación y los datos precargados por IA hacia los componentes de formulario (`EditarIngredienteForm`, `ItemOnboarding`, `InventoryOnboardingForm` y `SupplyOnboardingForm`).

## Interfaz
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
