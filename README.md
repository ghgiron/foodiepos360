# Blueprint de FoodiePOS 360

## Visión General del Sistema
FoodiePOS 360 es un sistema de punto de venta (POS) y control de inventarios *offline-first* para gastrobares y restaurantes, construido con React, TypeScript, Vite, Tailwind CSS, Dexie.js (IndexedDB) y Google Cloud Firestore. La aplicación gestiona salones, mesas, comandas, pantallas de cocina (KDS), explosión automática de listas de materiales (BOM) para recetas, control de stock multisede, analítica financiera y asistencia copilot multimodal por voz mediante Groq y Gemini.

## Interfaz Local e Invariantes
- `[vite.config.ts]`: Configuración del empaquetador Vite con soporte para React y plugins de desarrollo.
- `[vitest.config.ts]`: Configuración del motor de pruebas unitarias bajo entorno `jsdom` y setup global.
- `[firestore.rules]`: Reglas de seguridad para el acceso a colecciones y documentos en Cloud Firestore.
- `[tailwind.preset.js]`: Preset del sistema de diseño Tailwind con tokens de color y tipografía de restaurante POS.

## Subdirectorios y Límites del Sistema
- [Código Fuente de la Aplicación (src)](./src/README.md): Capa principal de la aplicación, abarcando componentes visuales, persistencia Dexie, servicios de IA, tokens de estilo y utilidades de dominio.

## Invariantes Globales
- **Persistencia Offline-First**: Todas las mutaciones transaccionales (pedidos, ajustes de stock, recetas, configuración) se guardan primero de forma síncrona en IndexedDB local antes de encolar eventos de sincronización en segundo plano.
- **Deducción de Inventario en Dos Fases**: La toma de pedidos aparta reservas no negativas (`Math.max(0, físico - reservado)`); el descuento físico real se ejecuta al iniciar preparación o al cerrar la cuenta.
- **Integridad de Datos y Cálculos Fiscales**: Importes monetarios y stock aplican formato numérico estricto (`es-CO`), cálculo de Impoconsumo al 8% y límites inferiores sin stock negativo.
- **Respaldo Dual de IA**: Las consultas al asistente de voz priorizan la inferencia rápida con Groq Cloud, ejecutando conmutación por error automática a Google Gemini Flash ante saturación de cuota o límites de tasa.

## Efectos Secundarios Globales
- Almacenamiento local: Persistencia estructurada en la base de datos IndexedDB `foodiepos_db` y preferencias de usuario en `localStorage`.
- Red en la nube: Suscripciones en tiempo real y escrituras por lotes hacia colecciones de Google Cloud Firestore.
- APIs externas: Peticiones HTTPS a las APIs de Groq Cloud y Google Gemini para extracción de lenguaje natural y acciones copilot.
- APIs de hardware: Conexión mediante Web Serial API para pesaje físico y auditoría de botellas en bar con báscula USB.

## Verificación del Sistema
- Ejecutar: `npm test`
