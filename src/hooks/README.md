# Paquete de Hooks

## Visión General
El directorio `src/hooks` provee hooks personalizados de React para suscripciones reactivas a catálogos maestros desde IndexedDB (`useCatalogs`), control de modificaciones en formularios y advertencias de salida (`useFormDirty`, `useFormExitGuard`), navegación unificada basada en historial del navegador (`useNavigate`), e integración con la API de voz nativa del navegador (`useVoiceRecognition`).

## Interfaz
- `[useCatalogs.ts:useSystemSettings]`: Suscripción reactiva a la configuración general del sistema.
- `[useCatalogs.ts:useProductionZones]`: Catálogo de áreas de producción en cocina.
- `[useCatalogs.ts:useOperatingZones]`: Catálogo de zonas de servicio y mesas.
- `[useCatalogs.ts:useOfficialUnits]`: Catálogo de unidades de medida estándar.
- `[useCatalogs.ts:useUnitEquivalences]`: Factores de conversión entre unidades de compra y uso.
- `[useCatalogs.ts:useSuppliers]`: Directorio de proveedores activos.
- `[useCatalogs.ts:useIngredientCategories]`: Categorías de ingredientes culinarios.
- `[useCatalogs.ts:useSupplyCategories]`: Categorías de insumos no consumibles o suministros.
- `[useCatalogs.ts:useMenuCategories]`: Categorías de platos y bebidas de la carta.
- `[useCatalogs.ts:useAssetCategories]`: Clasificación de maquinaria y activos fijos.
- `[useCatalogs.ts:useAssetLocations]`: Ubicaciones físicas de activos.
- `[useCatalogs.ts:useTaxOptions]`: Opciones tributarias de IVA e Impoconsumo.
- `[useCatalogs.ts:useWasteReasons]`: Motivos estandarizados de merma y baja.
- `[useCatalogs.ts:useSystemBranches]`: Sucursales o sedes operativas activas.
- `[useCatalogs.ts:usePaymentTerms]`: Condiciones y plazos de pago a proveedores.
- `[useCatalogs.ts:useQualityRatings]`: Calificaciones de calidad en recepción de insumos.
- `[useCatalogs.ts:useRecipeDifficulties]`: Niveles de dificultad técnica en recetas.
- `[useCatalogs.ts:useAssetStatuses]`: Estados operativos de activos fijos.
- `[useFormDirty.ts:normalizeFormValue]`: Normalización recursiva para comparaciones de cambios en formularios.
- `[useFormDirty.ts:useFormDirty]`: Hook de detección de modificaciones en formularios.
- `[useFormExitGuard.ts:useFormExitGuard]`: Hook de bloqueo de navegación ante datos sin guardar.
- `[useNavigate.ts:useNavigate]`: Hook de navegación con memoria contextual y retorno seguro.
- `[useVoiceRecognition.ts:useVoiceRecognition]`: Hook para captura de audio y síntesis de voz en el navegador.

## Invariantes
- `[useCatalogs.ts:useOperatingZones]`: Convierte objetos de zona extrayendo `z.name` mientras preserva cadenas directas.
- `[useCatalogs.ts:useIngredientCategories]`: Combina categorías de la tabla `db.ingredientCategories` con las de `systemSettings` en un conjunto sin duplicados.
- `[useCatalogs.ts:useSystemBranches]`: Filtra las sedes para conservar exclusivamente las activas (`b.active !== false`).
- `[useFormDirty.ts:normalizeFormValue]`: Trata de manera equivalente `null`, `undefined`, cadenas vacías `''` y `NaN`, ordenando recursivamente las claves de los objetos.
- `[useFormDirty.ts:handleSafeExit]`: Despliega el modal de confirmación si el formulario ha sido modificado; de lo contrario ejecuta la salida inmediata.
- `[useNavigate.ts:useNavigate]`: Si el desplazamiento es `-1`, invoca `navigateContextualBack()` para respetar el flujo de origen.
- `[useVoiceRecognition.ts:useVoiceRecognition]`: Configura idioma por defecto en `'es-ES'` y tiempo de silencio en 1600ms.
- `[useVoiceRecognition.ts:useEffect]`: Establece `isSupported: false` si el navegador no cuenta con `SpeechRecognition` ni `webkitSpeechRecognition`.

## Efectos Secundarios
- `[useCatalogs.ts:useSystemSettings]`: Mantiene consultas reactivas activas con `useLiveQuery` sobre Dexie.
- `[useFormDirty.ts:performExit]`: Ejecuta la función de salida o retrocede en el historial del navegador (`navigate(-1)`).
- `[useNavigate.ts:useNavigate]`: Altera el historial del navegador mediante `window.history.pushState` o `window.history.back()`.
- `[useVoiceRecognition.ts:useEffect]`: Instancia el motor de reconocimiento de voz y suscribe escuchas de eventos de audio.
- `[useVoiceRecognition.ts:speakText]`: Reproduce síntesis de voz mediante `window.speechSynthesis.speak`.

## Verificación
- Ejecutar: `npm test`
