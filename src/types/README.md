# Paquete de Tipos y Contratos de Dominio (Types)

## Visión General
El directorio `src/types` define las interfaces centrales del dominio, los contratos de TypeScript, las cargas útiles de eventos, los esquemas del copilot de voz y las funciones selectoras y de cálculo puro para inventario, recetas, comandas KDS, eventos del outbox offline y parámetros tributarios en FoodiePOS.

## Interfaz
- `[index.ts:InventoryItem]`: Contrato principal para ingredientes, productos terminados, empaques y activos fijos.
- `[index.ts:StockReservation]`: Contrato de reserva preventiva para pedidos de comandas.
- `[index.ts:Recipe]`: Contrato de recetas y subrecetas con BOM detallado y clasificación BCG.
- `[index.ts:KdsOrderTicket]`: Estructura de tickets y estados de preparación en cocina.
- `[index.ts:DomainOutbox]`: Registro de evento pendiente de sincronización en el outbox local.
- `[index.ts:getAvailableStock]`: Función selectora que calcula las existencias físicas descontando reservas.
- `[index.ts:getAvailableStockInBranch]`: Selector de disponibilidad de stock para una sede específica.
- `[index.ts:getSubRecipeAvailablePortionsInBranch]`: Selector de porciones disponibles de subrecetas por sede.
- `[settings.ts:SystemSettings]`: Esquema exhaustivo de configuración del sistema y parámetros operativos.
- `[settings.ts:getEffectiveImpoconsumoRate]`: Resuelve la tasa activa de Impoconsumo aplicable.
- `[voiceCopilot.ts:VoiceIngredientExtraction]`: Esquema de datos extraídos por el asistente de voz a partir de lenguaje natural.
- `[voiceCopilot.ts:CopilotContextData]`: Carga de contexto que se provee a los modelos de lenguaje multimodales.

## Invariantes
- `[index.ts:getAvailableStock]`: El stock disponible nunca es inferior a cero: `Math.max(0, físico - reservado)`.
- `[index.ts:getAvailableStockInBranch]`: El stock por sede nunca es inferior a cero: `Math.max(0, físico - reservado)`.
- `[index.ts:getSubRecipeAvailablePortionsInBranch]`: Las porciones de subreceta disponibles no pueden ser negativas: `Math.max(0, físico - reservado)`.
- `[settings.ts:getEffectiveImpoconsumoRate]`: Retorna `0` si `settings.enableImpoconsumo === false`; aplica `8` si no está configurado o el valor es `NaN`.

## Efectos Secundarios
- Ninguno

## Verificación
- Ejecutar: `npm test`
