# Paquete de Copilot de Voz (Voice Copilot)

## Visión General
El directorio `src/components/voice` contiene los componentes de interfaz para la interacción por voz y copilot multimodal con IA en FoodiePOS. Comprende el botón disparador `FoodieBotHeaderButton` y el widget modal flotante `VoiceCopilotWidget`, montado directamente en `document.body` vía `createPortal`. Este widget procesa entradas de audio y texto mediante Groq Cloud o Google Gemini, identifica intenciones de reabastecimiento vs. creación de nuevos productos, persiste modificaciones directamente en IndexedDB/Dexie, encola eventos de sincronización y dirige la navegación a formularios con datos precargados.

## Interfaz
- `[FoodieBotHeaderButton.tsx:FoodieBotHeaderButton]`: Botón de cabecera que conmuta la visibilidad del copilot.
- `[FoodieBotHeaderButton.tsx:default]`: Exportación por defecto de `FoodieBotHeaderButton`.
- `[VoiceCopilotWidget.tsx:default]`: Componente de widget modal flotante del asistente.

## Invariantes
- `[FoodieBotHeaderButton.tsx:className]`: La propiedad `className` usa una cadena vacía `''` como valor predeterminado.
- `[FoodieBotHeaderButton.tsx:isOpen]`: `isOpen` evalúa a `false` si el contexto `useVoiceCopilot()` no está definido.
- `[FoodieBotHeaderButton.tsx:aria-expanded]`: El atributo `aria-expanded` refleja el valor booleano exacto de `isOpen`.
- `[VoiceCopilotWidget.tsx:typeof document === 'undefined' || !isOpen]`: Retorna `null` en renderizado de servidor o cuando `isOpen` es falso.
- `[VoiceCopilotWidget.tsx:effectiveMode]`: El modo se resuelve jerárquicamente: `mode || contextData?.mode || globalCopilot?.mode || 'DASHBOARD'`.
- `[VoiceCopilotWidget.tsx:effectiveContextData]`: Los datos de contexto usan una estructura vacía si no se proveen en props ni en el contexto global.
- `[VoiceCopilotWidget.tsx:useEffect[isOpen]]`: `isMinimized` se restablece a `false` automáticamente cuando `isOpen` pasa a ser verdadero.
- `[VoiceCopilotWidget.tsx:sanitizeNumber]`: Elimina caracteres no numéricos y recurre al valor de respaldo si la entrada es nula, vacía o `NaN`.
- `[VoiceCopilotWidget.tsx:!groqKey && !geminiKey]`: El procesamiento se detiene y muestra instrucciones de configuración si no hay ninguna API key registrada.
- `[VoiceCopilotWidget.tsx:isCorrectionToNewItem]`: Si la transcripción contiene frases de aclaración (ej. *'es un producto nuevo'*, *'otra referencia'*), anula coincidencias previas y fuerza `intent_type = 'NEW_ITEM'`.
- `[VoiceCopilotWidget.tsx:findMatchingInventoryItem]`: Nombres reconocidos en base de datos establecen `intent_type = 'RESTOCK'` con métricas de reabastecimiento; de lo contrario asignan `intent_type = 'NEW_ITEM'`.

## Efectos Secundarios
- `[FoodieBotHeaderButton.tsx:onClick]`: Invoca `copilot.toggleOpen()` al pulsar el botón.
- `[VoiceCopilotWidget.tsx:createPortal]`: Inserta el árbol DOM del widget flotante en `document.body`.
- `[VoiceCopilotWidget.tsx:addEventListener('keydown')]`: Registra y limpia la escucha de la tecla `Escape` para alternar la visibilidad.
- `[VoiceCopilotWidget.tsx:addEventListener('foodie-ai-key-updated')]`: Escucha eventos de actualización de credenciales de Groq en la ventana.
- `[VoiceCopilotWidget.tsx:dispatchEvent('copilot-navigate')]`: Despacha el evento DOM `'copilot-navigate'` con la ruta y datos extraídos.
- `[VoiceCopilotWidget.tsx:dispatchEvent('open-settings')]`: Despacha el evento `'open-settings'` para abrir la pantalla de configuración.
- `[VoiceCopilotWidget.tsx:pushNavigationState]`: Modifica el historial de navegación inyectando datos de formulario precargados.
- `[VoiceCopilotWidget.tsx:useVoiceRecognition]`: Inicia, detiene y conmuta la captura de audio y reconocimiento de voz del navegador.
- `[VoiceCopilotWidget.tsx:speakText]`: Sintetiza respuestas de audio usando la API SpeechSynthesis del navegador.
- `[VoiceCopilotWidget.tsx:processVoicePromptWithGroq]`: Envía peticiones HTTPS a la API de Groq Cloud para análisis de lenguaje natural.
- `[VoiceCopilotWidget.tsx:processAiCopilotPrompt]`: Envía peticiones HTTPS a Google Gemini como mecanismo de respaldo.
- `[VoiceCopilotWidget.tsx:db.inventoryItems.put / add]`: Inserta o actualiza registros de existencias en Dexie.
- `[VoiceCopilotWidget.tsx:db.inventoryLogs.add]`: Registra movimientos de kardex en `db.inventoryLogs`.
- `[VoiceCopilotWidget.tsx:enqueueOfflineEvent]`: Encola eventos en el outbox para sincronización offline.
- `[VoiceCopilotWidget.tsx:toast]`: Despacha alertas visuales mediante `react-hot-toast`.

## Verificación
- Ejecutar: `npm test`
