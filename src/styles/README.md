# Paquete de Estilos y Tokens de Diseño (Styles)

## Visión General
El directorio `src/styles` contiene las especificaciones, hojas de estilo y tokens de diseño para FoodiePOS. Comprende `tokens.css` (tokens neutrales y semánticos, paletas WCAG AA/AAA para modos oscuro, claro y efecto glass, y estilos de componentes base), `tokens.pos.css` (especialización para punto de venta de restaurantes con acción principal crema, semáforo térmico de tiempos `--heat-*`, estados de mesa, ergonomía táctil POS, modo cocina KDS, acentos cromáticos, escalado de fuentes y modo alto contraste), `tokens.classic.css` (tema clásico slate) y `tokens.pos.json` (especificación en formato W3C Design Token Community Group).

## Interfaz
- `[tokens.css::root]`: Definición de variables CSS globales y propiedades personalizadas.
- `[tokens.css:[data-theme="dark"]]`: Paletas de color y contrastes para el modo oscuro.
- `[tokens.css:[data-theme="light"]]`: Paletas de alta legibilidad para el modo claro anti-reflejo.
- `[tokens.pos.css:[data-theme="kds"]]`: Tema de alto contraste para pantallas de cocina a distancia.
- `[tokens.pos.css:[data-heat]]`: Semáforo térmico de urgencia en cocina (`warm`, `hot`, `overdue`).
- `[tokens.pos.css:[data-accent]]`: Modificadores de color de acento (`cream`, `orange`, `red`, `violet`, `blue`, `green`).
- `[tokens.pos.css:html[data-font-size]]`: Escalado dinámico de tipografía (`compact`, `normal`, `large`, `xlarge`).
- `[tokens.pos.css:html[data-contrast="high"]]`: Modo de alto contraste WCAG AAA.

## Invariantes
- `[tokens.css:--radius-lg]`: El radio de borde máximo está limitado a 16px en tarjetas, paneles, modales y hojas deslizantes.
- `[tokens.css:--text-on-accent]`: El texto sobre acentos se define en `#0A0A0A` en modo oscuro para garantizar el cumplimiento de contraste WCAG.
- `[tokens.pos.css:--touch-min]`: La dimensión táctil mínima de botones y controles interactivos se fija estrictamente en 56px (`--touch-min: 56px`).
- `[tokens.pos.css:--touch-gap]`: La separación física mínima entre controles adyacentes se fija en 8px.
- `[tokens.pos.css:@media (prefers-reduced-motion: reduce)]`: Desactiva por completo la animación `heat-pulse` cuando el usuario prefiere reducción de movimiento.
- `[tokens.pos.css:[data-accent="orange"]]`: Cuando el acento elegido es naranja o rojo, las alertas térmicas de cocina cambian a amarillo/ámbar para evitar conflicto visual con los botones de acción principal.
- `[tokens.pos.json:heatThresholds]`: Umbrales de calor fijados al 50% del tiempo meta para advertencia (warm), 80% para demorado (hot) y 100% para vencido (overdue).

## Efectos Secundarios
- `[tokens.css::root]`: Declara propiedades CSS en el elemento raíz y define `color-scheme: light dark`.
- `[tokens.css:body]`: Aplica estilos globales directos sobre el cuerpo del documento.
- `[tokens.pos.css:[data-theme="kds"] body]`: Incrementa la tipografía base a 1.25rem bajo el tema KDS de cocina.
- `[tokens.pos.css:html[data-font-size]]`: Altera el tamaño de fuente base en `html`, escalando proporcionalmente todas las unidades `rem` de la aplicación.

## Verificación
- Ejecutar: `npm test`
