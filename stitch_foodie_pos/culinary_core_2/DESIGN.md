# Design System Document: The Culinary Conductor

## 1. Overview & Creative North Star
The North Star for this design system is **"The Digital Maitre'd."** 

In the high-velocity environment of a modern kitchen or front-of-house, software should not feel like a static spreadsheet; it should feel like a rhythmic, orchestrated service. We move beyond "standard POS" aesthetics by embracing an editorial, high-end approach that balances the efficiency of a jet cockpit with the warmth of a Michelin-starred dining room. 

This system rejects the "boxed-in" look of traditional software. We utilize **Intentional Asymmetry**, **Tonal Layering**, and **Breathing Room** to guide the eye. By breaking the grid with overlapping elements and a dramatic typography scale, we transform a management tool into a signature digital experience.

---

## 2. Colors: Depth & Appetite
Our palette is anchored in professional stability with "flavor-burst" accents.

### The Palette (Material Design Tokens)
*   **Primary (`#000000` / `#131b2e`):** The "Black Tie" foundation. We use deep charcoal and navy containers for grounding.
*   **Secondary (`#9d4300` / `#fd761a`):** The "Flame." An energetic orange used for momentum, primary actions, and "Hot" status.
*   **Tertiary (`#00201d` / `#0c9488`):** The "Fresh Mint." A sophisticated teal used for success states and secondary highlights.
*   **Surface Hierarchy:**
    *   `surface-container-lowest`: #ffffff (The highlight)
    *   `surface`: #f7f9fb (The base canvas)
    *   `surface-container-high`: #e6e8ea (The structural depth)

### The "No-Line" Rule
**Borders are a design failure.** To maintain a premium feel, designers are prohibited from using 1px solid borders to section off content. Boundaries must be defined solely through background color shifts. 
*   *Example:* A list of active orders (`surface-container-lowest`) should sit on a background of `surface-container-low` to create a soft, natural edge.

### The "Glass & Gradient" Rule
For "Hero" moments—like a high-revenue alert or a featured menu item—use **Signature Textures**. 
*   Apply a linear gradient from `secondary` to `secondary_container`.
*   For floating overlays (modals or dropdowns), use **Glassmorphism**: A semi-transparent `surface_container_lowest` with a 20px backdrop-blur. This ensures the vibrant colors of the "kitchen floor" bleed through, keeping the UI feeling alive.

---

## 3. Typography: Editorial Authority
We pair **Manrope** (Headlines) with **Inter** (Data/Body) to create a "Tech-Forward Editorial" vibe.

*   **Display (Manrope, 3.5rem - 2.25rem):** Used for large-scale data like "Daily Total Revenue." These should feel authoritative and celebratory.
*   **Headline (Manrope, 2rem - 1.5rem):** Used for section titles. Give these space; they are the "chapters" of the restaurant's day.
*   **Title & Body (Inter, 1.375rem - 0.875rem):** Inter provides surgical precision for order items and seat numbers. 
*   **Label (Inter, 0.75rem):** All-caps with increased letter-spacing (0.05em) when used for status indicators (e.g., "PREPPING").

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "software-generic." We define importance through **Tonal Stacking**.

*   **The Layering Principle:** 
    *   Level 0: `surface` (The table)
    *   Level 1: `surface-container-low` (The tray)
    *   Level 2: `surface-container-lowest` (The plate/content card)
*   **Ambient Shadows:** If a floating element (like a Notification) requires a shadow, it must be "Atmospheric." Use a 32px blur, 0px offset, and 6% opacity of the `on_surface` color. It shouldn't look like a shadow; it should look like a soft glow of depth.
*   **The "Ghost Border" Fallback:** In high-density data tables where color shifts aren't enough, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components: Precision Utensils

### Buttons
*   **Primary:** High-radii (`rounded-lg`), using the `secondary` (Orange) fill. Use a subtle gradient to add "soul."
*   **Tertiary:** Transparent backgrounds with `on_surface` text. These should feel like part of the layout, not a "button."

### Cards & Order Lists
*   **Forbid dividers.** To separate menu items, use `16px` of vertical white space or a subtle shift from `surface` to `surface-container-low`.
*   **Rounding:** Use `xl` (1.5rem) for main dashboard cards and `md` (0.75rem) for nested items. This creates a "nested organic" feel.

### Input Fields
*   Floated labels using `label-md`. 
*   Focus state: Do not use a blue ring. Use a 2px "Ghost Border" of `secondary` (Orange) to signal the field is active and "hot."

### Contextual Components (The "Foodie" Specials)
*   **The "Heat" Indicator:** A progress bar component using a gradient from `tertiary` (Cool/Teal) to `secondary` (Hot/Orange) to show order wait times.
*   **The "Table Map" Nodes:** Circular elements (`rounded-full`) using Glassmorphism to represent tables, changing tonal depth based on occupancy.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts. A large display metric on the left balanced by a compact list on the right feels more premium than two equal columns.
*   **Do** use `on_primary_container` for secondary text to maintain a sophisticated, low-contrast hierarchy.
*   **Do** embrace the "friendly" rounded corners. Every corner should feel "smooth to the touch."

### Don't
*   **Don't** use pure black `#000000` for text; use `on_surface` (#191c1e) to keep the "Editorial" softness.
*   **Don't** use 1px dividers. If you feel you need a line, use more white space instead.
*   **Don't** use standard "Warning Yellow." Use our `secondary` (Orange) for alerts—it feels intentional and brand-aligned rather than a system error.