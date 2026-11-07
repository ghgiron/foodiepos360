---
name: creador-de-agentes
description: >-
  Skill especializada para diseñar, estructurar, definir y generar Custom Agents (Agentes Personalizados), Subagentes y Skills en Google Antigravity.
  Usar esta habilidad cuando el usuario solicite crear un nuevo agente, subagente, rol especializado, asistente a la medida o nueva habilidad/runbook para la plataforma Antigravity.
---

# Creador de Agentes (Google Antigravity Custom Agents & Skills)

Esta habilidad fue aprendida a partir de la especificación oficial de **Google Antigravity ("Introducing Custom Agents")**. Permite estructurar, diseñar y desplegar agentes personalizados y habilidades a la medida que resuelven las limitaciones de los asistentes generales (falta de especialización y saturación del context window).

---

## 1. Filosofía y Arquitectura de Custom Agents

Los **Custom Agents** en Google Antigravity permiten evolucionar de un asistente general monolítico a una red de agentes especializados que colaboran con un contexto de memoria limpio y aislado.

### Ventajas Clave
1. **Especialización Radical:** Cada agente posee instrucciones específicas de su dominio (ej. arquitectura backend, auditoría de seguridad, diseñador UI, tester E2E).
2. **Optimización del Context Window:** Evita cargar prompts gigantescos e irrelevantes en la conversación principal.
3. **Persistencia en Equipo:** Al almacenarse en el directorio del proyecto (`.agents/agents/` o `.agents/skills/`), se comparten automáticamente vía control de versiones con todo el equipo.

---

## 2. Tipos de Personalizaciones en Antigravity

| Tipo | Ubicación Estándar | Carga / Invocación | Propósito |
| :--- | :--- | :--- | :--- |
| **Custom Agent** | `.agents/agents/<nombre>.md` | Vía `invoke_subagent` o slash commands | Agente autónomo especializado con su propio prompt de sistema, modelo y herramientas. |
| **Skill** | `.agents/skills/<nombre>/SKILL.md` | Divulgación progresiva (On-Demand) | Procedimientos paso a paso, comandos, runbooks e instrucciones operativas completas. |
| **Rule** | `.agents/rules/<nombre>.md` | Jerárquica / Siempre activa | Normas de estilo, restricciones de código y directrices del proyecto. |

---

## 3. Estructura y Especificación de un Custom Agent

Un Custom Agent se define en un archivo Markdown (`.md`) con un encabezado **YAML Frontmatter**:

```markdown
---
name: nombre-del-agente
description: >-
  Descripción concisa del propósito del agente y de los casos de uso en los que debe activarse.
role: "Título o Rol Breve del Agente"
model: inherit | flash | pro
workspace: inherit | branch | share
tools:
  - list_dir
  - view_file
  - replace_file_content
  - run_command
---

# Sistema y Directrices del Agente: [Nombre]

## 1. Identidad y Propósito
Definición clara de la especialidad del agente y sus metas en la tarea.

## 2. Responsabilidades Principales
- Tarea 1...
- Tarea 2...

## 3. Workflow de Operación
1. Inspección y diagnóstico inicial.
2. Ejecución modular.
3. Verificación y reporte final.

## 4. Reglas y Restricciones
- Restricción 1...
- Restricción 2...
```

---

## 4. Estructura y Especificación de una Skill

Una Skill requiere una carpeta dedicada en `.agents/skills/<nombre_skill>/` con un archivo principal `SKILL.md`:

```markdown
---
name: nombre-de-la-skill
description: >-
  Instrucción clara en tercera persona explicando QUÉ hace la skill y CUÁNDO debe ser utilizada por el agente.
argument-hint: "[opción] [argumentos]"
---

# Nombre de la Skill

Descripción operativa de la habilidad.

## Guía Paso a Paso

1. **Paso 1:** Inspeccionar archivos relevantes.
2. **Paso 2:** Ejecutar comandos de soporte:
   `node scripts/mi-script.js`
3. **Paso 3:** Validar el resultado final.

## Referencias
- [Documentación Adicional](./references/guia.md)
```

---

## 5. Workflow para Crear un Nuevo Agente o Skill (Paso a Paso)

Cuando el usuario pida *"Crea un agente para [X]"* o *"Crea una habilidad para [Y]"*:

1. **Analizar la Necesidad:**
   - ¿Requiere ejecución autónoma aislada en segundo plano? -> **Custom Agent**
   - ¿Es un procedimiento reutilizable o runbook paso a paso? -> **Skill**
   - ¿Es una norma de código que siempre se debe respetar? -> **Rule**

2. **Diseñar el Frontmatter:**
   - Elegir un `name` en minúsculas y separado por guiones (`kebab-case`).
   - Redactar una `description` clara indicando los activadores explícitos.

3. **Escribir las Instrucciones del Sistema / Procedimiento:**
   - Mantener concisión, claridad y reglas sin ambigüedades.
   - Incorporar criterios de validación obligatorios.

4. **Guardar en el Proyecto:**
   - Agente: `.agents/agents/<nombre>.md`
   - Skill: `.agents/skills/<nombre>/SKILL.md`

5. **Registrar dinámicamente si es necesario:**
   - Si se requiere uso inmediato en la conversación actual, invocar `define_subagent`.

---

## 6. Ejemplo Práctico: Plantilla de Creación Rápida

Para generar un nuevo agente en un solo comando de escritura:
- Ruta: `.agents/agents/analizador-db.md`
- Contenido:
  - Name: `analizador-db`
  - Role: `Database Architect & Performance Optimizer`
  - Model: `pro`
  - Instructions: Inspección de esquemas SQL, índices y optimización de queries.
