# Paquete de Diagnóstico de Sincronización

## Visión General
El directorio `src/components/sync` proporciona la interfaz modal para diagnósticos y administración de sincronización entre IndexedDB local (Dexie.js) y Google Cloud Firestore. Exporta `SyncDiagnosticsModal`, que permite auditar conteos de entidades, examinar registros de sincronización en tiempo real, ejecutar pruebas de salud y latencia contra Firestore, gestionar credenciales del proyecto y disparar procesos manuales de carga, descarga o resincronización bidireccional forzada.

## Interfaz
- `[SyncDiagnosticsModal.tsx:SyncDiagnosticsModal]`: Componente de diálogo modal `React.FC<SyncDiagnosticsModalProps>` para monitoreo y administración de sincronización.

## Invariantes
- `[SyncDiagnosticsModal.tsx:isOpen]`: El componente retorna `null` si `isOpen` es falso.
- `[SyncDiagnosticsModal.tsx:handlePullFromCloud]`: Aborta si ya hay una carga o descarga activa (`isPulling || isPushing`) o si no hay conexión a internet (`!navigator.onLine`).
- `[SyncDiagnosticsModal.tsx:handlePushToCloud]`: Aborta si ya hay una transferencia en curso o el navegador está fuera de línea.
- `[SyncDiagnosticsModal.tsx:handleFullResync]`: Aborta si hay operaciones de sincronización en curso o si no hay conexión.
- `[SyncDiagnosticsModal.tsx:activeTab]`: La navegación interna se restringe estrictamente a `'matrix' | 'logs' | 'config'`.

## Efectos Secundarios
- `[SyncDiagnosticsModal.tsx:useEffect]`: Se suscribe al flujo de logs mediante `subscribeSyncLogs` al montar y cancela la suscripción al desmontar.
- `[SyncDiagnosticsModal.tsx:useEffect]`: Consulta la comparativa de entidades con `getDetailedSyncComparison` y lee credenciales con `getFirebaseConfig` al abrir el modal.
- `[SyncDiagnosticsModal.tsx:handlePullFromCloud]`: Descarga datos desde Firestore hacia Dexie mediante `pullDataFromFirestore` y emite notificaciones.
- `[SyncDiagnosticsModal.tsx:handlePushToCloud]`: Sube datos locales a Firestore con `pushDataToFirestore` y notifica al usuario.
- `[SyncDiagnosticsModal.tsx:handleFullResync]`: Ejecuta `forceResyncAll` para conciliar el estado completo entre Dexie y Firestore.
- `[SyncDiagnosticsModal.tsx:handleTestHealth]`: Ejecuta `checkFirestoreHealth` para verificar latencia y conectividad con la nube.
- `[SyncDiagnosticsModal.tsx:handleSaveConfig]`: Guarda configuraciones de Firebase en almacenamiento mediante `saveFirebaseConfig`.
- `[SyncDiagnosticsModal.tsx:handleResetConfig]`: Restaura la configuración predeterminada con `resetFirebaseConfig`.
- `[SyncDiagnosticsModal.tsx:navigator.clipboard.writeText]`: Copia las reglas de seguridad de Firestore al portapapeles del sistema.

## Verificación
- Ejecutar: `npm test`
