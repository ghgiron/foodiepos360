# Paquete de Configuración (Config)

## Visión General
El directorio `src/config` centraliza la configuración y diagnósticos de conexión para Firebase y Cloud Firestore. Gestiona la recuperación jerárquica de credenciales (`localStorage` -> variables de entorno -> valores predeterminados), el almacenamiento de parámetros personalizados y la prueba activa de conectividad y latencia contra el servidor remoto.

## Interfaz
- `[firebaseConfig.ts:FirebaseAppConfig]`: Interfaz con la estructura de credenciales Firebase (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
- `[firebaseConfig.ts:STORAGE_FIREBASE_CONFIG_KEY]`: Constante de clave de persistencia en `localStorage` (`'foodie_firebase_config'`).
- `[firebaseConfig.ts:DEFAULT_FIREBASE_CONFIG]`: Configuración predeterminada de respaldo para desarrollo local.
- `[firebaseConfig.ts:getFirebaseConfig]`: Función que resuelve la configuración activa siguiendo la jerarquía de precedencia.
- `[firebaseConfig.ts:saveFirebaseConfig]`: Guarda personalizaciones parciales o totales de configuración en `localStorage`.
- `[firebaseConfig.ts:resetFirebaseConfig]`: Elimina la configuración personalizada de `localStorage` para restaurar los valores base.
- `[firebaseConfig.ts:FirestoreHealthResult]`: Estructura del resultado de salud (`ok`, `projectId`, `latencyMs`, `message`, `errorCode`, `errorDetails`).
- `[firebaseConfig.ts:checkFirestoreHealth]`: Función asíncrona que ejecuta un ping con límite de 4 segundos sobre el documento `_health_check/ping`.

## Invariantes
- `[firebaseConfig.ts:getFirebaseConfig]`: La configuración de `localStorage` solo se aplica si tanto `projectId` como `apiKey` contienen valores no vacíos.
- `[firebaseConfig.ts:getFirebaseConfig]`: Precedencia estricta: 1. `localStorage`, 2. `import.meta.env` (`VITE_FIREBASE_*`), 3. `DEFAULT_FIREBASE_CONFIG`.
- `[firebaseConfig.ts:saveFirebaseConfig]`: Protegido contra entornos SSR (`typeof window === 'undefined'`) y fusiona cambios sobre la configuración activa.
- `[firebaseConfig.ts:checkFirestoreHealth]`: Aplica una carrera de tiempo con límite máximo de 4000ms para evitar bloqueos por desconexión.

## Efectos Secundarios
- `[firebaseConfig.ts:saveFirebaseConfig]`: Almacena la configuración serializada en `localStorage`.
- `[firebaseConfig.ts:resetFirebaseConfig]`: Remueve la clave de configuración en `localStorage`.
- `[firebaseConfig.ts:checkFirestoreHealth]`: Envía una petición de lectura de red a Cloud Firestore.
- `[firebaseConfig.ts:checkFirestoreHealth]`: Emite advertencias en consola (`console.warn`) en caso de fallo de conexión.

## Verificación
- Ejecutar: `npm test`
