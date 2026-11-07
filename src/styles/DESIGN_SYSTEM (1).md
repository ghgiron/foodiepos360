# Sistema de diseño — Dark + Glass

Derivado de 8 referencias: app de comida glassmorphism (acento naranja), Blvck Tumbler (naranja sobre grafito), dashboard Apexify (violeta), paletas de grises Tailwind-neutral y slate, nombres Onyx/Graphite/Jet Black/Ash y el sistema Telegraf (primario, secundario, semánticos, tipografía).

## 1. Decisiones

| Decisión | Elección | Origen |
|---|---|---|
| Acento primario | Naranja `#FF6B2C` (500) | App de comida, Tumbler |
| Acento secundario | Violeta `#8B5CF6` | Dashboard Apexify |
| Neutros | Escala pura `#000 → #FAFAFA` | Paleta "Light/Dark AAA" |
| Semánticos | Verde, rojo, amarillo, azul | Telegraf |
| Tipografía | Manrope (títulos) + Inter (cuerpo), ambas gratis | Telegraf + SF Pro Text (equivalentes libres) |
| Iconos | Lucide, trazo 1.5 px | Iconos de línea de las referencias |
| Temas | `dark` (sólido), `light` (sólido claro) y `glass` (translúcido) | — |

Las escalas slate (`#0A0E15…`) y los nombres Onyx/Graphite no se usan como base; se descartaron para evitar mezclar matices de gris.

## 2. Arquitectura de tokens

1. **Primitivos** (`--neutral-*`, `--orange-*`): valores crudos, nunca se usan directo en componentes.
2. **Semánticos** (`--bg-*`, `--text-*`, `--border-*`, `--accent*`): cambian por tema.
3. **Componentes** (`.card`, `.btn`, `.input`…): consumen solo semánticos.

Cambiar `data-theme="dark"` por `"glass"` re-tematiza toda la UI sin tocar componentes.

## 3. Cuándo usar cada tema

- **dark**: dashboards, tablas, formularios largos, pantallas con mucho texto. Superficies opacas; la jerarquía se marca con tono (`canvas → surface → raised`) y borde.
- **glass**: pantallas hero, catálogos con fotografía, móvil, navegación flotante. Requiere un fondo con color o imagen detrás; sobre negro plano el vidrio no se ve.

Reglas de glass:
- Máximo **2 capas** de vidrio apiladas (el blur se acumula y se degrada el rendimiento).
- Nunca poner párrafos largos sobre vidrio sin `--glass-scrim` detrás.
- Blur: `sm 8` chips, `md 16` controles, `lg 24` tarjetas, `xl 40` sheets y nav.
- El borde superior iluminado (`--glass-highlight`) es lo que da la sensación de cristal; no omitirlo.
- Los bordes translúcidos no sustituyen el contraste del texto: el texto se valida contra el peor fondo posible.

## 3b. Modo light

`data-theme="light"` usa los mismos nombres de token que dark, así que los componentes no cambian. Lo que cambia:

| Token | Dark | Light |
|---|---|---|
| `--bg-canvas` / `--bg-surface` | `#0A0A0A` / `#171717` | `#FAFAFA` / `#FFFFFF` |
| `--text-primary` | `#FAFAFA` | `#0A0A0A` |
| `--text-secondary` | `#A3A3A3` | `#525252` (7.5:1) |
| `--text-tertiary` | `#8A8A8A` | `#737373` (4.5 a 4.7:1, solo sobre blanco o `#FAFAFA`) |
| `--text-accent` | naranja 400 | **naranja 700 `#C73E12`** (5.1:1 sobre blanco) |
| Estados (texto) | 500 | **700**: verde `#047857`, rojo `#C81E3A`, ámbar `#8A5A00`, azul `#2549D8` |
| Elevación | borde + sombra profunda | sombra suave + borde |

El relleno naranja del botón primario y su texto oscuro (`#0A0A0A`) son idénticos en ambos temas. El naranja 500 sobre blanco da solo 2.8:1, por eso en light nunca se usa como color de texto, solo como relleno.

Para seguir el sistema operativo:

```js
const mq = matchMedia('(prefers-color-scheme: dark)');
const apply = () => document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
apply(); mq.addEventListener('change', apply);
```

El tema `glass` es solo oscuro; no hay variante glass clara.

## 4. Color

### Neutros (dark)
`canvas #0A0A0A` · `surface #171717` · `raised #262626` · `inset #000`.
Texto: `primary #FAFAFA` · `secondary #A3A3A3` · `tertiary #8A8A8A` · `disabled #525252`.

### Acento naranja
Relleno de botón principal: gradiente `#FFA43D → #F26B0F`. Texto de acento y enlaces: `orange-400 #FF8A4C`.

### Regla crítica: texto sobre naranja
El blanco sobre `#FF6B2C` da **2.8:1** (falla); sobre el gradiente inferior `#F26B0F` da 3.0:1. Por eso `--text-on-accent` es `#0A0A0A` (7.0:1 sobre naranja 500, 10:1 arriba del gradiente). La referencia de la app de comida usa blanco sobre naranja; no se replicó ese detalle por accesibilidad. Si el diseño exige texto blanco, usar solo ≥ 24 px bold o `orange-700 #C73E12` de fondo.

### Estados
Éxito `#06C990` · Error `#FF4D67` · Aviso `#FFC533` · Info `#4F7DFF`. Cada uno tiene variante `-subtle` (14 % alfa) para badges y fondos de alerta. Nunca comunicar estado solo con color: añadir icono o texto.

### Verificación de contraste (WCAG, calculado)
| Par | Ratio | Nivel |
|---|---|---|
| text-primary / canvas | 19.0 | AAA |
| text-secondary / canvas | 7.8 | AAA |
| text-secondary / raised | 6.0 | AA |
| text-tertiary / canvas | 5.7 | AA |
| text-accent / canvas | 8.5 | AAA |
| on-accent / orange-500 | 7.0 | AAA (límite) |
| success / error / warning / info sobre canvas | 9.2 / 6.1 / 12.5 / 5.4 | AAA / AA / AAA / AA |
| violet-500 / canvas | 4.7 | AA (usar en texto ≥ 14 px bold o como relleno) |
| text-disabled / canvas | 2.5 | Exento (elementos deshabilitados) |

En glass, `secondary` y `tertiary` suben un escalón (`neutral-200` / `neutral-300`) para mantener ≥ 4.5:1 sobre fondos claros.

## 5. Tipografía

- **Display / títulos**: **Manrope** (gratis, licencia OFL, Google Fonts). Sustituye a Telegraf, que es de pago y no se usa.
- **Cuerpo / UI**: **Inter** (gratis, licencia OFL, Google Fonts). Sustituye a SF Pro Text, limitada a plataformas Apple.
- Carga en el `<head>`:
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap">`
- Si Google Fonts no carga, la pila cae a la fuente del sistema y nada se rompe.
- Pesos: 400, 500, 600, 700 (800 solo display).

| Estilo | Tamaño | Peso | Interlineado | Tracking |
|---|---|---|---|---|
| display | 56 | 700 | 1.1 | -0.02em |
| h1 | 40 | 700 | 1.1 | -0.02em |
| h2 | 32 | 700 | 1.25 | -0.01em |
| h3 | 20 | 600 | 1.25 | 0 |
| body | 16 | 400 | 1.5 | 0 |
| body-sm | 14 | 400 | 1.5 | 0 |
| label | 14 | 600 | 1.25 | 0 |
| caption | 12 | 500 | 1.25 | 0 |

Patrón de titular de las referencias: dos líneas, una palabra clave en acento (`Good Food / Good **Mood!**`).

## 6. Espaciado, radios, elevación

- Espaciado base **4 px** (4, 8, 12, 16, 20, 24, 32, 40, 48, 64).
- Radios: `md 12` inputs/dashboard · `lg 16` tarjetas densas · `2xl 28` tarjetas glass y sheets · `full` botones, chips, toggles, búsqueda.
- Dark: la elevación se logra con **borde + sombra profunda**, no con sombras claras.
- Glass: elevación = más opacidad de relleno + más blur + highlight superior.

## 7. Componentes (extraídos de las capturas)

| Componente | Especificación |
|---|---|
| Botón primario | Pill, 44 px, gradiente naranja, texto oscuro, glow naranja |
| Botón secundario | Pill, relleno `raised`, borde `default` |
| Búsqueda | Pill 48 px, fondo `inset`, icono de filtros a la derecha |
| Chip de categoría | Radio 16, icono + etiqueta; seleccionado: borde y fondo naranja subtle |
| Tarjeta de producto | Radio 28 (glass) / 16 (dark), imagen arriba, precio, botón "+" naranja cuadrado 32 px |
| Toggle | 48×28, activo naranja, inactivo `neutral-700` |
| Segmentado de tamaño | Pills; activa con borde naranja |
| Nav inferior | Pill flotante glass, icono activo naranja |
| KPI card (dashboard) | Radio 16, valor 32/700, delta como badge de estado; tarjeta destacada en gradiente violeta |
| Tabla | Cabecera `inset`, filas con separador `subtle`, estado como badge |
| Barra de progreso | Altura 6, pista `raised`, relleno acento |

## 8. Accesibilidad y fallbacks

- `@supports not (backdrop-filter)` → superficies opacas al 92 %.
- `prefers-reduced-transparency` y `prefers-contrast: more` → glass se vuelve sólido con borde fuerte.
- Foco visible: anillo doble (separación de canvas + naranja 400), 2 px.
- Objetivos táctiles ≥ 44 px.
- Respetar `prefers-reduced-motion`: reducir `--duration-*` a 0 en animaciones de entrada.

## 9. Uso

```html
<html data-theme="glass">
  <body> ... </body>
</html>
```

```js
// tailwind.config.js
module.exports = { presets: [require('./tailwind.preset.js')], content: ['./src/**/*.{html,js,tsx}'] }
```

```html
<button class="bg-accent-gradient text-content-on-accent rounded-full h-11 px-6 shadow-glow-accent">Add to Cart</button>
<div class="glass rounded-2xl p-5">Tarjeta de vidrio</div>
```

## 10. Iconos (Lucide)

```bash
npm i lucide-react      # o lucide (vanilla), lucide-vue-next, lucide-svelte
```

```jsx
import { Search, SlidersHorizontal, Home, Tag, ShoppingBag, Heart } from 'lucide-react';
<Search size={20} strokeWidth={1.5} color="currentColor" />
```

- Tamaños: 16 / 20 / 24 (`--icon-size-*`). Trazo `1.5` (`--icon-stroke`) para igualar las referencias; Lucide usa 2 por defecto.
- Siempre `currentColor`, para que el icono herede el color del texto y cambie con el tema.
- Equivalencias con las capturas: búsqueda `Search`, filtros `SlidersHorizontal`, inicio `House`, ofertas `Tag`, pedidos `ShoppingBag`, favoritos `Heart`, atrás `ChevronLeft`, menú `Menu`, calificación `Star`.
- Icono solo (sin texto) lleva `aria-label`.
