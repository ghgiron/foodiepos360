# PROTOCOLO ODD ADAPTADO — FOODIE POS 360 AGENT RULES
*Basado en Organic Driven Development (Alan Buscaglia) adaptado para arquitectura Offline-First PWA (React 19 + TypeScript + Dexie.js + Firebase)*

Tu principio fundacional es: **El proceso crece con el problema**.
- No ejecutes ceremonias burocráticas innecesarias para cambios atómicos o de UI.
- No uses atajos ni confíes a ciegas en código crítico de costeo, inventario o base de datos.
- Mantén siempre al humano en el bucle directivo (**Human-in-the-loop**): El humano decide, tú ejecutas, la evidencia responde.

---

## REGLAS CRÍTICAS DE ENTORNO PARA FOODIE POS 360

1. **PROHIBICIÓN DE TESTS EN SEGUNDO PLANO (NO HANGING PROCESSES):**
   - NUNCA ejecutes `vitest` o `jest` en modo interactivo/watch ni en comandos abiertos de terminal que bloqueen la sesión.
   - La regla técnica de verificación obligatoria es SIEMPRE:
     `npx tsc --noEmit` o `npm run build`.
   - Si se requiere ejecutar un test unitario puntual, debe ser explícitamente finalizado con flag única: `npx vitest run [archivo_específico]`.

2. **PROHIBICIÓN DE BÚSQUEDA RECURSIVA DE ARCHIVOS EXTERNOS:**
   - NUNCA realices escaneos globales en el disco ni en `home directories` buscando archivos como `.xlsx` o assets locales. El código opera como software receptor (`file: File` en tiempo de ejecución del navegador).

3. **TOLERANCIA CERO A LA SUPOSICIÓN MATEMÁTICA Y DE COSTEO:**
   - En fórmulas de inventario, mermas o conversión de unidades (ej. mililitros a onzas):
     * NUNCA redondees ni trunques valores intermedios a 2 decimales (como usar `0.03`).
     * Lee siempre los factores dinámicos desde `systemSettings` (ej. Onza = 29.574 ml).
     * Si una fórmula de costeo o porcentaje es ambigua, DETENTE y consulta.

4. **INTEGRIDAD DE BASE DE DATOS DUAL (DEXIE.JS + FIRESTORE):**
   - Cuando se solicite una purga o borrado transaccional, debes considerar la sincronización:
     * Si se limpia Dexie local, deben limpiarse o marcarse los registros en Firebase Firestore y resetear los cursores de pull (`lastSyncTimestamp`) para evitar re-hidrataciones indeseadas.
     * NUNCA toques ni borres `systemSettings` ni `branches` (datos de sede y configuración) a menos que se indique expresamente.

---

## CLASIFICACIÓN DE TAREAS (TEST DE CONTINUIDAD)

Antes de editar código, evalúa el impacto:
- **CHICO (Riesgo mínimo / Localizado):**
  * Ajustes de CSS / Tailwind (como bordes a 8px o modo oscuro).
  * Textos, traducciones o correcciones de typos.
  * *Acción:* Ejecución directa, rápida y verificación con `tsc`.
- **GRANDE (Riesgo estructural / Continuidad en riesgo):**
  * Modificaciones en el motor de sincronización (`sync_outbox`, Firestore, Dexie schema).
  * Lógica matemática de conversión de unidades o costeo de recetas.
  * Motores de búsqueda globales o importadores masivos de archivos.
  * *Acción:* **OBLIGATORIO** presentar el bloque `### 📋 PLAN ODD` y solicitar confirmación antes de modificar los archivos.

---

## FORMATO DE PLAN ODD (PARA TAREAS GRANDES)

```odd-plan
### 📋 PLAN ODD: [Nombre de la Tarea]
- **Objetivo:** [Qué existirá o funcionará al terminar en 1 frase]
- **Alcance Incluido:** [Archivos y componentes específicos a intervenir]
- **Límites (Out-of-Scope):** [Qué NO se va a tocar bajo ninguna circunstancia]
- **Criterio de Validación:** [Comando tsc/build y verificación manual exacta]

#### Pasos de Ejecución:
1. [Subtarea atómica 1]
2. [Subtarea atómica 2]