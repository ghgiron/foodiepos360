# Sistema de Diseño Oficial — Foodie POS 360 (Dark + Glass & Perfil POS de Restaurante)

> **Fuente de Verdad del Repositorio:** Este documento consolida la arquitectura de tokens (`src/styles/tokens.css`), el perfil especializado de punto de venta (`src/styles/tokens.pos.css`), el preset de Tailwind (`tailwind.preset.js`) y los requisitos normativos de hardware y ergonomía POS (`src/styles/REQUISITOS_POS.md`).

---

## 1. Filosofía y Decisiones Fundamentales

| Decisión | Elección Oficial | Regla / Justificación |
|---|---|---|
| **Escala Neutral** | **Neutros Puros AAA (`#000000` → `#FAFAFA`)** | **Eliminación explícita y total de la paleta Slate/Navy (`#090D16`, `#0F172A`, `#1E293B`)**. Ningún gris del sistema contiene tinte azulado. |
| **Acción Principal (Perfil POS)** | **Crema (`#F5EFE6`) con tinta (`#0A0A0A`)** en Dark/Glass · **Tinta (`#0A0A0A`) con crema (`#FBF7F0`)** en Light | Desacopla la selección e interacción primaria de las alertas térmicas de cocina (`C-01`). |
| **Reserva Semántica del Naranja** | **Exclusivo para Calor / Tiempos de Espera (`--heat-*`)** | El naranja (`#FF6B2C` / `#F26B0F`) indica urgencia, cocción y demora de tickets; no se mezcla con estados seleccionados de mesa o navegación. |
| **Acento Secundario / IA** | **Violeta (`#8B5CF6` / `#6D28D9` en Light)** | Reservado para analítica avanzada, asistente de voz/IA y métricas destacadas. |
| **Tipografía** | **Manrope** / **Plus Jakarta Sans** (Display/Títulos) + **Inter** (UI/Cuerpo) | Licencias abiertas OFL, alta legibilidad a distancia de brazo (50–70 cm) y soporte nativo de `tabular-nums`. |
| **Iconografía** | **Lucide React** (trazo `1.5px`) + **Material Symbols Outlined** | Siempre acompañados de etiqueta visible en acciones críticas de cajero/mesero (`U-04`). |
| **Temas y Efectos** | `dark` (sólido `#0A0A0A`), `light` (sólido AAA `#FAFAFA`), `glass` (`data-glass="true/false"` en capas flotantes) y `kds` (`#000000`) | Selección persistente de tema base (`Oscuro` / `Claro`) + interruptor independiente de **Efecto Glass** en Header y Configuración. |

---

## 2. Arquitectura de Tokens de 3 Capas

1. **Capa 1 — Primitivos (`src/styles/tokens.css`):**
   - Escala neutral pura: `--neutral-0` (`#000000`), `--neutral-950` (`#0A0A0A`), `--neutral-900` (`#171717`), `--neutral-800` (`#262626`), `--neutral-750` (`#303030`), `--neutral-700` (`#373737`), `--neutral-600` (`#525252`), `--neutral-500` (`#737373`), `--neutral-400` (`#8A8A8A`), `--neutral-300` (`#A3A3A3`), `--neutral-200` (`#D4D4D4`), `--neutral-100` (`#E5E5E5`), `--neutral-50` (`#FAFAFA`), `--white` (`#FFFFFF`).
   - Escala crema cálida (`--cream-50: #FBF7F0`, `--cream-100: #F5EFE6`, `--cream-200: #EAE0D2`).
   - Escala naranja (`#FFF4ED` a `#451407`; `--orange-500: #FF6B2C`, `--orange-700: #C73E12`).
   - Escala violeta (`--violet-400: #A78BFA`, `--violet-500: #8B5CF6`, `--violet-600: #7C3AED`).
   - Estados con variantes `-subtle` (14% alfa) y tonos `700` de alto contraste para fondo claro (`--green-700: #047857`, `--red-700: #C81E3A`, `--yellow-700: #8A5A00`, `--blue-700: #2549D8`).
2. **Capa 2 — Semánticos por Tema (`src/styles/tokens.css` & `src/styles/tokens.pos.css`):**
   - Superficies: `--bg-canvas`, `--bg-surface`, `--bg-raised`, `--bg-inset`, `--bg-overlay`.
   - Texto: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled`, `--text-accent`, `--text-on-accent`.
   - Bordes: `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus`.
   - Perfil POS: `--action-bg`, `--action-bg-hover`, `--action-text`, `--selected-bg`, `--selected-border`, `--heat-*`, `--table-*`.
3. **Capa 3 — Utilidades Tailwind (`tailwind.preset.js` & `src/index.css`):**
   - Clases semánticas directas: `bg-canvas`, `bg-surface`, `bg-raised`, `bg-inset`, `border-line`, `border-line-subtle`, `border-line-strong`, `text-content`, `text-content-secondary`, `text-content-tertiary`, `bg-action`, `text-action-text`.

---

## 3. Especificación de Temas y Contraste WCAG 2.1 AA/AAA

### 3.1 Comparativa Dark Mode vs Light Mode

| Token Semántico | Clase Tailwind | Dark Mode (`data-theme="dark"`) | Light Mode (`data-theme="light"`) | Ratio WCAG |
|---|---|---|---|---|
| `--bg-canvas` | `bg-canvas` | `#0A0A0A` (Negro carbón puro) | `#FAFAFA` (Papel mate anti-reflejo) | Base |
| `--bg-surface` | `bg-surface` | `#171717` (Grafito oscuro) | `#FFFFFF` (Blanco puro) | Nivel 1 |
| `--bg-raised` | `bg-raised` | `#262626` (Contenedor elevado) | `#F4F4F5` (Elevación sutil) | Nivel 2 |
| `--bg-inset` | `bg-inset` | `#0A0A0A` (Campo de entrada) | `#FFFFFF` / `#F4F4F5` | Inputs |
| `--border-default` | `border-line` | `rgba(255,255,255,0.10)` | `rgba(10,10,10,0.14)` (`#D4D4D4`) | Nítido |
| `--text-primary` | `text-content` | `#FAFAFA` | `#0A0A0A` | **19.0:1 (AAA)** |
| `--text-secondary` | `text-content-secondary` | `#A3A3A3` | **`#525252`** | **7.5:1 (AAA)** |
| `--text-tertiary` | `text-content-tertiary` | `#8A8A8A` | **`#737373`** | **4.7:1 (AA)** |
| `--text-accent` | `text-content-accent` | `#FF8A4C` (`orange-400`) | **`#C73E12` (`orange-700`)** | **5.1:1 (AA)** |
| `--action-bg` | `bg-action` | `#F5EFE6` (`--cream-100`) | `#0A0A0A` (`--neutral-950`) | **> 14:1 (AAA)** |
| `--action-text` | `text-action-text` | `#0A0A0A` | `#FBF7F0` (`--cream-50`) | **> 14:1 (AAA)** |

### 3.2 Reglas de Accesibilidad en Modo Claro
- **Prohibición de textos descoloridos:** Queda prohibido usar `text-slate-400` o grises claros para etiquetas legibles sobre fondo blanco. Todo texto secundario usa `text-content-secondary` (`#525252`, ratio **7.5:1 AAA**) y el texto auxiliar usa `text-content-tertiary` (`#737373`, ratio **4.7:1 AA**).
- **Naranja sobre blanco:** El naranja `#FF6B2C` sobre blanco sólo alcanza `2.8:1` (falla WCAG). En modo claro, cualquier texto o badge de acento naranja usa obligatoriamente `--orange-700` (`#C73E12`, **5.1:1 AA**), y el texto sobre botones rellenos de naranja usa tinta oscura `#0A0A0A` (**7.0:1 AAA**).
- **Inputs y Controles Numéricos:** Fondo `bg-inset` blanco/nítido, texto `text-content` (`#0A0A0A`), borde `border-line` definido y radio de **8px (`rounded-sm`)**.

### 3.3 Efecto Glass (`data-glass="true"` vs `"false"`) y Modo Bajo Recurso (`V-01`, `V-02`)
- **Alcance restringido a capas flotantes (`V-02`):** El efecto vidrio (`backdrop-filter: blur(...)`, `--glass-bg-*`, `--glass-border`, `--glass-highlight`) se aplica **únicamente** en barras de navegación/header, modales, drawers, popovers y banners flotantes (`.glass`). Las grillas de productos, tablas de inventario, comandas y tarjetas de alta densidad permanecen opacas (`bg-surface`) para garantizar 60 fps.
- **Control de usuario:** El usuario puede alternar libremente entre **Modo Oscuro** y **Modo Claro**, y activar/desactivar el **Efecto Glass** desde el Header superior o desde **Configuración → Apariencia, Tema y Efecto Glass**.
- **Desactivación limpia (`data-glass="false"` / `data-effects="reduced"`):** Anula `backdrop-filter: none !important` y convierte las superficies `.glass` en `var(--bg-surface)` opaco con borde `var(--border-default)` para terminales POS con GPU integrada modesta (`Intel Celeron/N100`, `Rockchip`, tablets Android).

### 3.4 Tema KDS de Cocina (`data-theme="kds"`, `T-03`)
- Diseñado para monitores a 2–4 metros con vapor, grasa y luz cenital intensa:
  - Fondo negro puro `#000000` (`--bg-canvas`), tarjetas `#141414` (`--bg-surface`), bordes de alto contraste `rgba(255,255,255,0.22)`, **cero transparencias (`backdrop-filter: none`)** y escala tipográfica `1.5x` (`--font-scale: 1.5`).

### 3.5 Matriz de Personalización Modular del Sistema de Diseño (`Configuración del Sistema`)
En lugar de un interruptor binario rígido, Foodie POS 360 unifica la identidad visual en una **matriz de personalización modular** gobernada por tokens semánticos en `src/styles/tokens.pos.css` y configurable directamente por el usuario administrador desde **Configuración del Sistema → Personalización y Sistema de Diseño**:

1. **Tema Visual Base (`data-theme`):**
   - **Oscuro (`dark`):** Modo oscuro profundo con neutros puros carbón (`#0A0A0A` a `#262626`).
   - **Claro (`light`):** Modo claro antirreflejo de alto contraste (`#F1F5F9` / `#FAFAFA`) diseñado para salones soleados y cajas iluminadas sin textos descoloridos.
2. **Efecto Glass / Cristal (`data-glass="true" | "false"`, `data-effects="full" | "reduced"`):**
   - **Activado:** Desenfoque translúcido (`backdrop-filter`) en barras flotantes, headers y modales.
   - **Desactivado:** Superficies 100% sólidas y opacas (`--bg-surface`) para máxima fluidez y ahorro de GPU en hardware POS de bajos recursos (Intel Celeron/N100, tablets Android).
3. **Color de Botones Primarios y Acento del Sistema (`data-accent`):**
   6 paletas ergonómicas con ratio de contraste WCAG AA/AAA:
   - **Crema / Tinta (`cream`):** Predeterminado POS gastronómico (`#F5EFE6` / `#0A0A0A`).
   - **Naranja Fuego (`orange`):** Enérgico (`#FF6B2C`). Incluye adaptación automática en cocina: los temporizadores KDS pasan a amarillo/ámbar para evitar colisión de color con los botones primarios.
   - **Rojo Carmesí (`red`):** Gourmet (`#EF4444`).
   - **Púrpura Eléctrico (`violet`):** Clásico (`#8F63F4`), integra de forma nativa la identidad de color del diseño clásico original.
   - **Azul Cobalto (`blue`):** Tecnológico (`#3B82F6`).
   - **Verde Esmeralda (`green`):** Fresco / Saludable (`#10B981`).
4. **Tamaño de Texto Global (`data-font-size`):**
   - `compact` (90%), `normal` (100%), `large` (112%), `xlarge` (125%), escalando dinámicamente las unidades `rem`.
5. **Nivel de Contraste (`data-contrast`):**
   - **Estándar (AA):** Transparencias suaves y contrastes naturales.
   - **Alto Contraste (AAA):** Bordes acentuados y fondos profundos hiperdefinidos.

Esta arquitectura garantiza coherencia estética total, cero duplicidad de componentes y accesibilidad óptima sin penalizar el rendimiento.

---

## 4. Perfil POS de Restaurante (`src/styles/tokens.pos.css`)

### 4.1 Semáforo de Calor y Tiempos de Espera (`C-01`, `C-04`)
El color naranja y rojo se reservan para el envejecimiento de tickets y comandas:
- `--heat-ok` (`< 5 min`): `--green-500` (`#06C990` en Dark / `#047857` en Light) — En tiempo.
- `--heat-warm` (`5–10 min`): `--yellow-500` (`#FFC533` / `#8A5A00`) — Atención.
- `--heat-hot` (`10–15 min`): `--orange-500` (`#FF6B2C` / `#C73E12`) — Demorado.
- `--heat-overdue` (`> 15 min`): `--red-500` (`#FF4D67` / `#C81E3A`) + animación `.heat-overdue` (`heat-pulse 1.6s`, única animación continua permitida en operación).

### 4.2 Estados de Mesa con Triple Codificación (`C-02`)
Toda mesa en el plano de salón (`SalonDeck`) comunica su estado mediante **Color + Icono + Etiqueta de texto** (nunca solo color):
1. **Libre (`--table-free`):** Neutro discreto (`--neutral-600`).
2. **Ocupada (`--table-occupied`):** Azul operativo (`--blue-500`).
3. **Pidiendo Cuenta (`--table-bill`):** Ámbar (`--yellow-500`).
4. **Comanda Lista para Servir (`--table-ready`):** Verde (`--green-500`).
5. **Reservada (`--table-reserved`):** Violeta (`--violet-500`).

---

## 5. Escala Oficial de Radios (`borderRadius`)

| Token CSS | Clase Tailwind | Valor | Uso Oficial en Foodie POS |
|---|---|---|---|
| `--radius-xs` | `rounded-xs` | `6px` | Badges compactos, indicadores internos, celdas numéricas densas. |
| **`--radius-sm`** | **`rounded-sm` / `rounded-input`** | **`8px`** | **Estándar obligatorio para todos los `<input>`, `<select>`, `Combobox`, `PriceInput` y `<textarea>`.** |
| `--radius-md` | `rounded-md` | `12px` | Botones secundarios, filas interactivas, tarjetas anidadas. |
| **`--radius-lg`** | **`rounded-lg` / `rounded-card`** | **`16px`** | **Tarjetas de catálogo, KPIs, paneles de formulario y tickets KDS.** |
| **`--radius-xl`** | **`rounded-xl`** | **`20px`** | **Contenedores principales, modales (`Modal`), drawers y paneles maestros.** |
| `--radius-full` | `rounded-full` / `rounded-pill` | `9999px` | Chips de filtro, barra OmniSearch, badges de estado y pills de navegación. |

---

## 6. Estándares Táctiles POS y Tipografía Financiera

### 6.1 Ergonomía Táctil (`F-01`, `F-02`, `F-03`, `F-04`)
- **Objetivos táctiles mínimos:**
  - `--touch-min: 56px` (`h-touch` / `min-h-touch`): Botones de producto, modificadores y acciones de barra.
  - `--touch-lg: 64px` (`h-touch-lg`): CTA principal de cobro (`Cobrar`, `Enviar a cocina`).
  - `--touch-key: 72px` (`h-touch-key`): Teclado numérico de importe y PIN.
- **Separación física (`--touch-gap`):** Mínimo `8px` entre controles táctiles adyacentes para prevenir toques accidentales con dedos húmedos o guantes.
- **Feedback táctil sub-80ms (`F-03`):** Compresión inmediata `:active { transform: scale(0.97); }` sin depender de estados `:hover`.

### 6.2 Cifras Tabulares Obligatorias (`U-01`)
- Todos los precios, subtotales, impuestos (Impoconsumo), costos de receta, porcentajes de margen, cantidades de stock y cronómetros KDS aplican obligatoriamente:
  ```css
  font-variant-numeric: tabular-nums;
  ```
  (clases `.num`, `.tabular-nums`, `.tabular-numbers`), garantizando alineación vertical perfecta y evitando saltos visuales cuando cambian los dígitos.

---

## 7. Regla de Oro de Preservación de Lógica de Negocio

> [!IMPORTANT]
> **Contrato Inmutable de Dominio y Datos:**
> Cualquier intervención presente o futura en el sistema de diseño, componentes UI o temas debe respetar íntegramente los motores transaccionales y financieros de Foodie POS 360:
> 1. **Motor Universal de Conversión de Unidades (`src/utils/unitConversion.ts`, `dataHelper.ts`):** Equivalencias exactas (`ml → oz` `29.574`, `kg → gr`, `lb → gr`) y factores parametrizados en `systemSettings`.
> 2. **Fórmulas de Costeo Gastronómico (`recipeForm.tsx`, `subRecipeForm.tsx`, `comboForm.tsx`):** Cálculo de Costo Real, Margen de Error %, Costo Operativo %, Mermas y Suministros diferenciados (Mesa vs Domicilio/Llevar).
> 3. **Parametrización Tributaria (Impoconsumo):** Régimen responsable vs no responsable, desglose de base gravable y utilidad neta real.
> 4. **Ciclo de Inventario con Staging / Soft-Lock:** Reserva atómica (`committedStock`) al confirmar pedido y descuento físico definitivo en Kardex (`InventoryMovement`) al despachar en KDS.
> 5. **Motor de Búsqueda Flexible (`src/utils/searchUtils.ts`):** `normalizeSearchText` y `flexibleMultiMatch` tolerantes a tildes, signos y orden de palabras.
> 6. **Persistencia Offline-First (`src/db/database.ts`, `src/services/syncEngine.ts`):** Transacciones ACID en Dexie.js y encolamiento garantizado en `sync_outbox` hacia Firebase Firestore.
