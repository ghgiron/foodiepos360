# Requisitos de diseño — POS para restaurante

Versión 1.0 · 2 de noviembre de 2026
Base: `tokens.css` + `tokens.pos.css` (perfil POS). Referencias visuales: app glassmorphism de comida, dashboard Apexify, escalas de grises AAA, sistema Telegraf.

Convención: **DEBE** = obligatorio · **DEBERÍA** = recomendado, se puede justificar su omisión · **NO DEBE** = prohibido.

---

## 1. Contexto y supuestos

**Producto:** software POS para restaurante, con identidad visual propia que no se parezca a los POS existentes.

**Usuarios y pantallas**

| Rol | Dispositivo (supuesto) | Pantallas principales |
|---|---|---|
| Mesero | Tablet | Plano de mesas, toma de orden |
| Cajero | Terminal de mostrador / tablet | Cuenta y cobro |
| Cocina | Pantalla fija (KDS) | Tickets con temporizador |
| Encargado | Tablet o escritorio | Plano en vivo, reportes |

**Condiciones de uso:** de pie, con prisa, manos mojadas o grasosas, reflejos de luz, lectura a un metro, turnos de 8 horas, hardware Android de gama baja.

**Supuestos pendientes de confirmar:** ver sección 9.

---

## 2. Principios

1. **Glass solo en lo que flota; sólido donde se trabaja.** El vidrio da identidad, pero la operación no puede depender de lo que haya detrás.
2. **El naranja significa calor.** Aparece solo para tiempo y urgencia. Nunca para botones, enlaces ni selección.
3. **El color comunica estado, no decora.** Todo estado lleva además icono y texto.
4. **Una acción principal por pantalla**, contextual.
5. **Los números son lo más importante** (precios, totales, mesas, tiempos): grandes y tabulares.

---

## 3. Requisitos visuales

### 3.1 Superficies y vidrio

| ID | Requisito |
|---|---|
| V-01 | El sistema DEBE tener tres niveles de superficie: **sólida** (operación), **glass** (capas flotantes) y **overlay** (fondo de modales). |
| V-02 | Glass DEBE usarse solo en: barra de navegación, panel de cuenta/carrito lateral, modales, menús de acciones y notificaciones. |
| V-03 | Glass NO DEBE usarse en: plano de mesas, lista de platos, teclado numérico, tickets, pantalla de cocina ni tablas. |
| V-04 | NO DEBE haber más de **2 capas de vidrio** apiladas. |
| V-05 | El sistema DEBE ofrecer un modo de **efectos reducidos** (`data-effects="reduced"`) que reemplaza el vidrio por superficies opacas. Se activa solo con `prefers-reduced-transparency`, `prefers-contrast: more` o por detección de rendimiento, y manualmente en ajustes. |
| V-06 | Todo texto sobre glass DEBE validarse contra el **peor fondo posible**, con `--glass-scrim` cuando haga falta. |

### 3.2 Color

| ID | Requisito |
|---|---|
| V-10 | El naranja (`--heat-*`) DEBE reservarse exclusivamente para **calor**: tiempo de espera y urgencia. |
| V-11 | El naranja NO DEBE usarse en botones, enlaces, pestañas activas, selección, foco ni decoración. |
| V-12 | La **acción principal** DEBE ser crema (`#F5EFE6`) con texto `#0A0A0A` en dark y glass, y tinta `#0A0A0A` con texto crema en light. |
| V-13 | La selección y el foco DEBEN usar crema (o tinta en light), nunca naranja. |
| V-14 | La **escala de calor** DEBE tener 4 niveles: `ok` (neutro), `warm` (naranja 300), `hot` (naranja 500) y `overdue` (naranja 600, relleno sólido). |
| V-15 | Los umbrales DEBEN calcularse como porcentaje del **tiempo objetivo** y ser configurables por restaurante. Valores iniciales: warm 50 %, hot 80 %, overdue 100 %. |
| V-16 | Cada nivel de calor DEBE ir acompañado de **icono y tiempo en texto** (por ejemplo `12:40`, o `+02:10` en retraso). El nivel `overdue` DEBE añadir relleno sólido y pulso. |
| V-17 | El pulso DEBE desactivarse con `prefers-reduced-motion`. |
| V-18 | Los estados de mesa DEBEN ser: libre, ocupada, cuenta pedida, plato listo y reservada, cada uno con color, **icono, etiqueta y estilo de borde** distintos (libre: punteado; reservada: doble). |
| V-19 | Los estados DEBEN distinguirse en **escala de grises** y con simulación de protanopía y deuteranopía. |
| V-20 | El calor DEBE dibujarse como anillo o fondo suave **independiente** del estado de la mesa, para que ambos se lean a la vez. |

### 3.3 Temas

| ID | Requisito |
|---|---|
| V-30 | DEBE haber 4 temas: `dark`, `light`, `glass` y `kds`. |
| V-31 | El tema DEBE poder cambiar **automáticamente por turno** (horario configurable) y manualmente. |
| V-32 | La pantalla de cocina DEBE usar siempre `kds`: fondo `#000`, sin vidrio, números 1.5 veces más grandes y texto secundario más claro. |
| V-33 | `glass` NO DEBE tener variante clara. |

### 3.4 Tipografía, números e iconos

| ID | Requisito |
|---|---|
| V-40 | Títulos en **Manrope** y cuerpo en **Inter** (ambas gratis, Google Fonts). Con respaldo de fuente del sistema. |
| V-41 | Todo número operativo DEBE usar **cifras tabulares**. |
| V-42 | Tamaños mínimos: número de mesa 24 px, precio de línea 32 px, temporizador 32 px, total a cobrar 48 px (en KDS: 32 / 48 / 72). |
| V-43 | Iconos de **Lucide**, trazo 1.5, `currentColor`. Los controles de acción DEBEN llevar icono y etiqueta; un icono solo DEBE llevar `aria-label`. |

### 3.5 Contraste

| ID | Requisito |
|---|---|
| V-50 | Todo texto DEBE cumplir **AA** (4.5:1); el texto operativo DEBERÍA cumplir AAA (7:1). |
| V-51 | Los anillos, bordes de estado e iconos informativos DEBEN cumplir **3:1**. |
| V-52 | El texto sobre naranja NO DEBE ser blanco en dark. En light, solo blanco sobre naranja 800. |

---

## 4. Requisitos de interacción

| ID | Requisito |
|---|---|
| I-01 | Todo control táctil DEBE medir **56 px o más**; las acciones principales y filas de orden 64 px; las teclas del teclado numérico 72 px. |
| I-02 | La separación entre controles táctiles DEBE ser de **8 px o más**. |
| I-03 | Cada pantalla DEBE tener **una sola acción principal**, con etiqueta contextual: "Enviar a cocina", "Pedir cuenta", "Cobrar". |
| I-04 | En tablet, las acciones principales DEBEN estar en la mitad inferior de la pantalla (zona del pulgar). |
| I-05 | Los gestos (deslizar, mantener) DEBEN ser **atajos**, nunca la única vía para una acción. |
| I-06 | Las acciones destructivas (anular, descontar, borrar) DEBEN confirmarse dentro de la misma pantalla, sin diálogos nativos. |
| I-07 | El toque DEBE dar respuesta visual en **menos de 100 ms**. |
| I-08 | El estado de **conexión** y de **envío a cocina** DEBE estar siempre visible. |
| I-09 | El POS DEBE seguir siendo usable sin conexión (guardar y enviar después) y avisarlo con claridad. |

---

## 5. Requisitos por pantalla

### 5.1 Plano de mesas
- Mapa de calor: cada mesa muestra su estado (V-18) y su calor (V-20).
- El tiempo de ocupación DEBE verse en cada mesa.
- Filtros por zona y por estado. Resumen superior: mesas libres, ocupadas, en retraso.

### 5.2 Toma de orden
- Menú en superficie sólida. Panel de cuenta lateral en glass (V-02).
- Un solo botón principal contextual (I-03).
- Modificadores de plato con objetivos de 56 px o más.

### 5.3 Cuenta y cobro
- Total en 48 px, cifras tabulares.
- Teclado numérico con teclas de 72 px.
- Confirmación de cobro y anulaciones dentro de la pantalla (I-06).

### 5.4 Cocina (KDS)
- Tema `kds` fijo (V-32).
- Cada ticket muestra su temporizador con nivel de calor y orden por urgencia.
- Texto legible a **un metro** de distancia.

---

## 6. Accesibilidad

| ID | Requisito |
|---|---|
| A-01 | Foco visible en todo control (anillo doble de 2 px). |
| A-02 | Ninguna información DEBE depender solo del color. |
| A-03 | Respetar `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`. |
| A-04 | Etiquetas accesibles en iconos, toggles y estados de mesa. |

---

## 7. Rendimiento

| ID | Requisito |
|---|---|
| R-01 | El scroll del menú y del plano DEBE mantenerse fluido (objetivo 60 fps) en la **tablet de gama más baja** que se vaya a soportar. |
| R-02 | Si no se logra con vidrio, el sistema DEBE caer a efectos reducidos (V-05) automáticamente. |
| R-03 | Las animaciones DEBEN limitarse al pulso de `overdue` y a transiciones de 120 a 360 ms. |

---

## 8. Criterios de aceptación

1. **Naranja:** una búsqueda en el código no encuentra `--orange-*` ni `--heat-*` fuera de componentes de calor.
2. **Escala de grises:** capturas del plano de mesas en escala de grises permiten distinguir los 5 estados.
3. **Daltonismo:** simulación de protanopía y deuteranopía permite distinguir los 5 estados.
4. **Contraste:** el script de contraste del repositorio pasa para todos los pares de texto y gráficos (referencia en `DESIGN_SYSTEM.md`).
5. **Táctil:** ningún control mide menos de 56 px (revisión automática en pruebas visuales).
6. **Dispositivo real:** en la tablet de gama baja, el plano y el menú se desplazan sin tirones con glass; si no, el modo reducido se activa solo.
7. **Distancia:** un número de mesa y un temporizador de cocina se leen a 1 metro.
8. **Una acción principal:** cada pantalla tiene exactamente un botón primario crema.

---

## 9. Pendientes y decisiones abiertas

| # | Pendiente | Impacto |
|---|---|---|
| 1 | **Dispositivos reales** (marca, tamaño de pantalla, versión de Android): tablet, terminal de mostrador o ambos. | Define R-01 y los tamaños del plano. |
| 2 | **Tiempos objetivo** por plato, categoría y mesa, y si los define el restaurante. | Define los umbrales de calor (V-15). |
| 3 | **Horario de los turnos** para el cambio automático de tema. | V-31. |
| 4 | **Propinas, división de cuenta y descuentos**: flujos y pantallas. | Amplía 5.3. |
| 5 | **Idiomas** y si hay moneda con decimales y miles locales. | Anchos de las cifras. |
| 6 | **Marca**: nombre, logotipo y si necesita un color de identidad aparte del crema. | Hoy la marca vive en el vidrio y el calor, no en un color. |

---

## 10. Archivos del sistema

| Archivo | Función |
|---|---|
| `tokens.css` | Sistema base: primitivos, temas dark, light y glass, componentes. |
| `tokens.pos.css` | Perfil POS: acción crema, escala de calor, estados de mesa, tamaños táctiles, tema KDS, efectos reducidos. Se carga después de `tokens.css`. |
| `tokens.json` y `tokens.pos.json` | Los mismos tokens en formato W3C. |
| `tailwind.preset.js` | Preset con colores `action`, `heat`, `table`, `cream` y espaciados `touch`. |
| `DESIGN_SYSTEM.md` | Especificación del sistema base y contrastes. |

**Uso mínimo**

```html
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="tokens.pos.css">
<html data-theme="glass" data-effects="full"> ... </html>

<button class="btn btn-primary btn-lg">Enviar a cocina</button>
<div class="table-tile" data-status="occupied" data-heat="hot">
  <span class="num">12</span>
  <span class="heat-badge" data-heat="hot">12:40</span>
</div>
```
