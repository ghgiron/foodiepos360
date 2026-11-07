# Blueprint de Código Fuente (src)

## Visión General del Sistema
El directorio `src` constituye la capa frontend de la aplicación FoodiePOS. Integra una arquitectura de cliente *offline-first* sobre IndexedDB (Dexie.js), sincronización bidireccional en tiempo real con Google Cloud Firestore, un bus de eventos de dominio reactivo en memoria, motores de costeo y explosión de listas de materiales (BOM) para recetas multisede, flujos operativos de cocina (KDS), interacción por voz con IA multimodal y tokens de diseño accesibles optimizados para pantallas táctiles de hostelería.

## Interfaz Local e Invariantes
- `[App.tsx:App]`: Componente raíz que orquesta el enrutamiento por pestañas, inicialización de la base de datos local, ciclo de sincronización y escuchas globales de cobro de comandas.
- `[firebase.ts:app]`: Instancia singleton de `FirebaseApp`.
- `[firebase.ts:firestore]`: Instancia singleton de `Firestore` configurada con caché persistente multitestaña en IndexedDB.
- `[main.tsx:createRoot]`: Monta el árbol de React en el contenedor `#root` del DOM envuelto en `StrictMode` y `ThemeProvider`.
- Invariantes:
  - El esquema de base de datos local debe contener la tabla `'reservas'` al iniciar; de lo contrario, arroja un error crítico.
  - La persistencia offline multitestaña es obligatoria al inicializar Firestore.
- Efectos Secundarios:
  - Inicializa y siembra la base de datos Dexie al cargar la aplicación.
  - Registra escuchas en `window` y `eventBus` para eventos de cobro y navegación.

## Subdirectorios y Límites del Sistema
- [Componentes](./components/README.md): Vistas de presentación, modales, formularios, terminales de comandas y KDS.
- [Configuración](./config/README.md): Resolución de credenciales Firebase, persistencia y diagnósticos de conexión.
- [Contexto](./context/README.md): Contextos globales de React para temas visuales y estado del asistente de voz.
- [Base de Datos y Almacenamiento](./db/README.md): Esquemas de IndexedDB, datos de siembra, equivalencias de unidades y motor de reservas.
- [Eventos de Dominio](./events/README.md): Bus tipado de publicación/suscripción en memoria.
- [Hooks](./hooks/README.md): Hooks reutilizables para suscripciones a catálogos reactivos, guardas de formularios y reconocimiento de voz.
- [Páginas](./pages/README.md): Controladores de vista principales vinculados a las rutas operativas.
- [Servicios](./services/README.md): Orquestación de IA, sincronización con Firestore, importación de Excel y cálculo de BOM.
- [Estilos y Tokens de Diseño](./styles/README.md): Tokens de diseño, hojas de estilo CSS y ergonomía POS accesible.
- [Tipos](./types/README.md): Interfaces de dominio, cargas útiles de eventos y utilidades de cálculo.
- [Utilidades](./utils/README.md): Motores de costo, normalización de stock por sucursal, rutinas de depuración y formateadores.

## Invariantes Globales
- *Offline-first*: Las operaciones críticas (comandas, ajustes, creación de ítems) se confirman síncronamente en Dexie antes de replicarse a Firestore.
- El stock disponible es estrictamente no negativo: `Math.max(0, físico - reservado)`.
- Todos los valores monetarios aplican formato numérico tabular y convenciones del peso colombiano (`es-CO`).

## Efectos Secundarios Globales
- Lectura y escritura en `IndexedDB` (`foodiepos_db`) y `localStorage`.
- Sincronización continua de lectura y escritura con Google Cloud Firestore.
- Emisión de eventos personalizados en el DOM para comunicación entre módulos.

## Verificación del Sistema
- Ejecutar: `npm test`
