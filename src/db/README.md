# Paquete de Base de Datos y Persistencia Local (DB)

## Visión General
El directorio `src/db` implementa la capa de persistencia *offline-first* sobre IndexedDB y el motor de dominio local para FoodiePOS mediante Dexie.js. Gestiona las versiones y esquemas de la base de datos (`localDb.ts`), los parámetros de configuración y equivalencias métricas (`settingsStore.ts`), la inicialización y sanitización de datos de prueba (`seedData.ts`), y el motor transaccional de reservas de stock, kardex e inventario multisede (`inventoryEngine.ts`).

## Interfaz
- `[localDb.ts:FoodiePOSDatabase]`: Clase base de IndexedDB Dexie que define tablas (versiones 8 a 13, incluyendo `purchaseOrders`) y métodos de acceso.
- `[localDb.ts:db]`: Instancia singleton exportada de `FoodiePOSDatabase`.
- `[localDb.ts:enqueueOfflineEvent]`: Encola eventos de dominio en `domainOutbox` para replicación remota.
- `[localDb.ts:getPendingOfflineEvents]`: Obtiene eventos pendientes del outbox ordenados por fecha (`FIFO`).
- `[localDb.ts:updateEventStatus]`: Actualiza el estado y marca de tiempo de sincronización de un evento.
- `[localDb.ts:recordPhysicalCount]`: Asienta el conteo físico real de existencias y genera el evento de sincronización correspondiente.
- `[inventoryEngine.ts:getItemZone]`: Función utilitaria que clasifica un ítem o categoría en una zona operativa (`'Cocina' | 'Bar' | 'Zona de Jugos'`).
- `[inventoryEngine.ts:stageComandaStock]`: Reserva preventivamente stock en tiempo real por sucursal al tomar comandas.
- `[inventoryEngine.ts:commitComandaStock]`: Confirma descuentos físicos definitivos, libera reservas, asienta logs de kardex y dispara sincronización cloud.
- `[inventoryEngine.ts:releaseComandaStock]`: Libera reservas temporales sin alterar existencias físicas ante cancelaciones de pedidos.
- `[inventoryEngine.ts:processOrderPaidInventory]`: Confirma descuentos pendientes al registrarse el pago de una cuenta.
- `[inventoryEngine.ts:reconcileReservedInventory]`: Concilia existencias apartadas contra comandas activas y purga reservas huérfanas.
- `[inventoryEngine.ts:autoMigrateBranchStock]`: Rutina autorreparadora que concilia existencias entre sedes y elimina categorías duplicadas.
- `[seedData.ts:seedDatabase]`: Siembra datos iniciales seguros (alérgenos, proveedores, clientes y configuración base).
- `[seedData.ts:sanitizeVirginDatabase]`: Elimina tickets, recetas y pérdidas de demostración residuales.
- `[settingsStore.ts:initializeSettings]`: Llena parámetros ausentes y ejecuta migraciones de formato en la configuración del sistema.
- `[settingsStore.ts:getSystemSetting]`: Lee un parámetro de configuración con valor de respaldo en caso de omisión.
- `[settingsStore.ts:saveSystemSetting]`: Persiste un ajuste en `systemSettings` y encola un evento outbox.

## Invariantes
- `[localDb.ts:updateEventStatus]`: Arroja un error si el identificador `eventId` no existe en `domainOutbox`.
- `[localDb.ts:getPendingOfflineEvents]`: Retorna exclusivamente registros con estado `'PENDING'` en orden ascendente de creación.
- `[localDb.ts:FoodiePOSDatabase]`: El stock disponible está acotado a valores no negativos: `Math.max(0, actual - reservado)`.
- `[inventoryEngine.ts:stageComandaStock]`: Revierte de forma idempotente reservas previas del ticket antes de crear nuevos registros; los activos fijos (`inventoryType === 'ASSET'`) no generan reservas.
- `[inventoryEngine.ts:commitComandaStock]`: Los activos fijos quedan excluidos de deducciones de stock y asientos de kardex.
- `[inventoryEngine.ts:releaseComandaStock]`: Solo las reservas en estado `'staged'` son liberadas, descontando del apartado sin tocar el stock físico.
- `[inventoryEngine.ts:reconcileReservedInventory]`: Solo los pedidos con estado distinto de `'CERRADA'` y `'CANCELADA'` pueden conservar reservas activas. Las reservas huérfanas se eliminan.
- `[inventoryEngine.ts:autoMigrateBranchStock]`: Suma invariante: `currentStock`, `realPhysicalStock` y `theoreticalStock` se igualan a la suma exacta de las existencias de todas las sucursales válidas.
- `[seedData.ts:seedDatabase]`: Omite la siembra si las banderas de `localStorage` indican inicialización previa o si ya existen registros en tablas maestras.

## Efectos Secundarios
- `[localDb.ts:FoodiePOSDatabase]`: Abre y versiona la base de datos Dexie en el navegador.
- `[localDb.ts:enqueueOfflineEvent]`: Inserta nuevos registros en la tabla `domainOutbox`.
- `[inventoryEngine.ts:stageComandaStock]`: Modifica `inventoryItems`, `recipes` y `stockReservations` dentro de una transacción Dexie.
- `[inventoryEngine.ts:commitComandaStock]`: Escribe en `inventoryLogs`, actualiza `kdsOrderTickets` y envía datos a Firestore vía `syncRecordToFirestore`.
- `[inventoryEngine.ts:releaseComandaStock]`: Actualiza el estado de las reservas a `'released'` y sincroniza con Firestore.
- `[inventoryEngine.ts:autoMigrateBranchStock]`: Corrige la sucursal activa en `localStorage`, actualiza existencias e inicia sincronización.
- `[seedData.ts:sanitizeVirginDatabase]`: Borra en lote registros de prueba en `kdsOrderTickets`, `recipes` y `inventoryItems`.
- `[settingsStore.ts:saveSystemSetting]`: Modifica `systemSettings` y llama a `enqueueOfflineEvent` con `'RecordUpdated'`.

## Verificación
- Ejecutar: `npm test`
