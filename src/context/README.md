# Paquete de Contexto (Context)

## Visión General
El directorio `src/context` administra el estado global del cliente para la personalización estética del sistema (`ThemeContext`) y el asistente de voz con IA (`VoiceCopilotContext`), proveyendo proveedores de React, hooks de consumo y sincronización con `localStorage`, atributos del DOM y tablas de IndexedDB en Dexie.

## Interfaz
- `[ThemeContext.tsx:Theme]`: Tipado de modo de tema (`'light' | 'dark'`).
- `[ThemeContext.tsx:DesignSystem]`: Tipado de sistema de diseño (`'restaurant-pos'`).
- `[ThemeContext.tsx:AccentColor]`: Opciones de acento cromático (`'cream' | 'orange' | 'red' | 'violet' | 'blue' | 'green'`).
- `[ThemeContext.tsx:FontSize]`: Tipado de escala tipográfica (`'compact' | 'normal' | 'large' | 'xlarge'`).
- `[ThemeContext.tsx:ContrastMode]`: Niveles de contraste (`'normal' | 'high'`).
- `[ThemeContext.tsx:ThemeProvider]`: Proveedor de React que inyecta tokens y manipula atributos en `document.documentElement`.
- `[ThemeContext.tsx:useTheme]`: Hook para consultar y modificar el tema visual activo.
- `[VoiceCopilotContext.tsx:CopilotHandler]`: Interfaz para manejadores contextuales de vistas.
- `[VoiceCopilotContext.tsx:VoiceCopilotProvider]`: Proveedor del asistente de voz, estado de dictado y modales.
- `[VoiceCopilotContext.tsx:useVoiceCopilot]`: Hook de acceso al contexto global del copilot de voz.
- `[VoiceCopilotContext.tsx:useVoiceCopilotRegistration]`: Hook para que componentes registren manejadores según su ruta o formulario.

## Invariantes
- `[ThemeContext.tsx:theme]`: Usa `'dark'` por defecto si `window` no está definido o el valor guardado no es `'light'` ni `'dark'`.
- `[ThemeContext.tsx:glassEnabled]`: Se activa (`true`) por defecto a menos que esté expresamente guardado como `'false'`.
- `[ThemeContext.tsx:accentColor]`: Usa `'cream'` si el valor guardado no pertenece a las opciones permitidas.
- `[ThemeContext.tsx:fontSize]`: Aplica `'normal'` si el valor guardado no coincide con los tamaños admitidos.
- `[ThemeContext.tsx:contrast]`: Aplica `'normal'` si el valor guardado no es `'normal'` o `'high'`.
- `[ThemeContext.tsx:designSystem]`: Fija el perfil unificado en `'restaurant-pos'` y sincroniza el esquema de color nativo del navegador (`style.colorScheme`).
- `[ThemeContext.tsx:useTheme]`: Retorna un contexto seguro de respaldo (`FALLBACK_THEME_CONTEXT`) si se invoca fuera de un `ThemeProvider`.
- `[VoiceCopilotContext.tsx:VoiceCopilotProvider]`: Evita inicializaciones redundantes si ya existe un proveedor padre en el árbol.
- `[VoiceCopilotContext.tsx:detectModeFromLocation]`: Usa `'DASHBOARD'` por defecto si la ruta no coincide con palabras clave de navegación.

## Efectos Secundarios
- `[ThemeContext.tsx:useEffect]`: Persiste `theme`, `glassEnabled`, `accentColor`, `fontSize`, `contrast` y `designSystem` en `localStorage`.
- `[ThemeContext.tsx:useEffect]`: Modifica atributos `dataset` en `document.documentElement` y conmuta la clase CSS `'dark'`.
- `[VoiceCopilotContext.tsx:useLiveQuery]`: Se suscribe de forma reactiva a colecciones de Dexie (`categories`, `suppliers`, `inventoryItems`, `systemSettings`).
- `[VoiceCopilotContext.tsx:detectModeFromLocation]`: Lee la ruta actual en `window.location.pathname` al inicializar.

## Verificación
- Ejecutar: `npm test`
