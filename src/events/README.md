# Paquete de Eventos de Dominio (Events)

## Visión General
El directorio `src/events` proporciona un bus de eventos de dominio tipado en memoria (`eventBus`) y definiciones de cargas útiles (`DomainEvents`, `EventCallback`) para el despacho y manejo desacoplado de eventos a lo largo de la aplicación FoodiePOS.

## Interfaz
- `[eventBus.ts:DomainEvents]`: Interfaz que asocia nombres de eventos de dominio (`'SubscriptionUpdated'`, `'OrderPlaced'`, `'OrderPaid'`, `'InventoryItemUpdated'`, `'HaccpAlertTriggered'`, `'PurchaseOcrScanned'`) a sus estructuras de datos correspondientes.
- `[eventBus.ts:EventCallback]`: Definición de función receptora genérica `(payload: T) => void | Promise<void>`.
- `[eventBus.ts:eventBus]`: Instancia singleton de `DomainEventBus` que expone los métodos `on`, `off` y `emit`.

## Invariantes
- `[eventBus.ts:on]`: Inicializa el arreglo de escuchas si el evento aún no tenía receptores registrados.
- `[eventBus.ts:off]`: Retorna de inmediato si no hay escuchas; remueve receptores por igualdad de referencia.
- `[eventBus.ts:emit]`: Retorna sin acción si no hay suscriptores registrados para el evento emitido.
- `[eventBus.ts:emit]`: Envuelve los retornos de las funciones escuchas mediante `Promise.resolve()`.
- `[eventBus.ts:emit]`: Captura errores en receptores individuales para garantizar que un fallo en un suscriptor no impida la ejecución de los demás ni rechace la promesa principal.

## Efectos Secundarios
- `[eventBus.ts:on]`: Modifica el mapa interno agregando funciones receptoras.
- `[eventBus.ts:off]`: Reasigna la entrada del evento con el arreglo filtrado de receptores.
- `[eventBus.ts:emit]`: Ejecuta concurrentemente los callbacks suscritos con la carga útil suministrada.
- `[eventBus.ts:emit]`: Registra mensajes de error en `console.error` ante excepciones en suscriptores.

## Verificación
- Ejecutar: `npm test`
