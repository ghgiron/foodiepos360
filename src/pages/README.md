# Paquete de Páginas (Pages)

## Visión General
El directorio `src/pages` contiene las vistas de página de nivel superior para FoodiePOS, encapsulando los paneles modulares de la interfaz con los contratos de navegación y enrutamiento del sistema.

## Interfaz
- `[settings.tsx:Settings]`: Componente React exportado por defecto que renderiza `<SettingsPanel />`.
- `[settings.tsx:SettingsPanel]`: Reexportación nombrada de `SettingsPanel` desde `../components/settingsPanel`.
- Subdirectorios:
  - [Páginas de Inventario](./inventory/README.md): Vistas que vinculan el enrutamiento y la extracción por voz con los formularios de ingredientes, productos y suministros.

## Invariantes
- Ninguna

## Efectos Secundarios
- Ninguno

## Verificación
- Ejecutar: `npm test`
