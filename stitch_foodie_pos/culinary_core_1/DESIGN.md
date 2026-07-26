# Design System Document: The Culinary Architect

## 1. Overview & Creative North Star
**Creative North Star: "The Orchestrated Flow"**

In the high-pressure environment of restaurant management, software must act as a silent, sophisticated partner. This design system rejects the cluttered, "spreadsheet-heavy" aesthetic of legacy POS systems in favor of **The Orchestrated Flow**. We move beyond standard UI by treating the interface as a premium editorial layout—using intentional white space, high-contrast typography, and tonal layering to guide the eye without the "noise" of traditional borders and grids.

The goal is a signature experience that feels as intentional as a Michelin-starred menu: professional, calm, and impeccably organized. We achieve this through **Asymmetric Balance** (placing heavy data against wide, airy margins) and **Tonal Depth** (using color shifts rather than lines to define structure).

---

## 2. Colors: Tonal Sophistication
Our palette is anchored in deep, slate-heavy neutrals with a vibrant, "Emerald" primary accent (`#006c49`) that signals action and growth.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. 
*   **The Technique:** Boundaries are defined solely through background shifts. A `surface-container-low` (`#f0f3ff`) card must sit on a `surface` (`#f9f9ff`) background. If you feel the need for a line, increase the contrast between your surface tiers instead.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine stationery.
*   **Base Layer:** `surface` (#f9f9ff) – The primary canvas.
*   **Secondary Sections:** `surface-container` (#e7eeff) – Used for sidebars or secondary navigation.
*   **Interactive Cards:** `surface-container-lowest` (#ffffff) – The highest "elevation" for data entry and order details.

### The "Glass & Gradient" Rule
To elevate the system from "utility" to "premium," use **Glassmorphism** for floating overlays (e.g., Modals or Toast notifications). Use `surface_variant` at 80% opacity with a `24px` backdrop blur. 
*   **Signature Textures:** Apply a subtle linear gradient from `primary` (#006c49) to `primary_container` (#10b981) on high-level action buttons (e.g., "Complete Order"). This adds "soul" and depth that flat hex codes lack.

---

## 3. Typography: Editorial Authority
We utilize a dual-font strategy to balance character with high-speed legibility.

*   **Display & Headlines (Manrope):** Chosen for its geometric, modern structure. Used for numbers, table headers, and section titles to provide a professional, "architectural" feel.
    *   *Headline-LG:* 2rem / Manrope (The "Hero" stat of the dashboard).
*   **Body & UI (Inter):** Chosen for its exceptional x-height and readability in fast-paced environments (kitchen screens, dim lighting).
    *   *Body-MD:* 0.875rem / Inter (The workhorse for order items).
*   **Label-SM:** 0.6875rem / Inter (Used for metadata like timestamps or table numbers).

Hierarchy is conveyed through **Scale, not just Weight**. A `Display-LG` number next to a `Body-SM` label creates an immediate, authoritative focal point.

---

## 4. Elevation & Depth
Depth in this system is organic, mimicking natural light.

### The Layering Principle
Do not use shadows to create hierarchy; use **Tonal Layering**. 
*   Place a `surface-container-lowest` (#ffffff) card on top of a `surface-container-high` (#dee8ff) section. The shift in "brightness" naturally lifts the content.

### Ambient Shadows
When an element must "float" (e.g., a dragged order item), use **Ambient Shadows**:
*   `Shadow:` 0px 12px 32px 0px.
*   `Color:` Use `on-surface` (#111c2d) at **6% opacity**. 
*   Avoid pure black/grey shadows; the tint must match the surface for a "soft glow" effect.

### The "Ghost Border" Fallback
If accessibility requires a container boundary, use the `outline-variant` token at **15% opacity**. This creates a "Ghost Border" that defines space without cluttering the visual field.

---

## 5. Components: Tactile Precision

### Cards & Lists (The Core)
*   **Forbid dividers.** To separate a list of orders, use `16px` of vertical white space or alternating backgrounds (`surface` to `surface-container-low`). 
*   **Roundedness:** Use `xl` (1.5rem) for large containers and `md` (0.75rem) for internal interactive elements.

### Interactive Elements
*   **Buttons:**
    *   *Primary:* Gradient-filled (Primary to Primary-Container), `full` (pill) roundedness. Min-height: `48px` (touch-ready).
    *   *Secondary:* `secondary-container` background, no border.
*   **Input Fields:**
    *   Use `surface-container-highest` for the background. 
    *   Active state: Transition to a `Ghost Border` using the `primary` color.
*   **Order Chips:**
    *   Use `tertiary_container` (#fc7c78) for "Urgent/Late" status.
    *   Use `primary_fixed` (#6ffbbe) for "Ready to Serve."

### Signature Component: The "Live Ticket"
A specialized card for kitchen orders using a `surface-container-lowest` base, a `primary` left-accent bar (4px wide), and `Display-SM` typography for the Table Number. This maximizes visibility from 5 feet away.

---

## 6. Do's and Don'ts

### Do
*   **DO** use whitespace as a structural element. If a screen feels busy, increase the padding, don't add a line.
*   **DO** ensure every touch target is at least `44px` square, even if the visual element (like an icon) is smaller.
*   **DO** use the `emerald green` (`primary`) sparingly. If everything is green, nothing is important.

### Don't
*   **DON'T** use 100% black (#000000). Use `on-surface` (#111c2d) for text to maintain the sophisticated "Slate" aesthetic.
*   **DON'T** use standard Material Design "Drop Shadows." They are too heavy for this refined system.
*   **DON'T** use "Dividers" (Horizontal Rules). Separate content using the `surface-container` nesting logic.