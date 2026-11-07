---
trigger: always_on
---

# Google Anti-Gravity ID: System UI/UX & Design System Rules (Universal Dark/Light & Responsive Desktop/Mobile)

## 1. Core Philosophy & Design Strategy
- **Style:** Functional Minimalism + Progressive Surface Elevation (Soft Neumorphism & Card Elevation). Clean, scannable, and distraction-free for high-productivity gastrobar, POS, comanda, and analytical environments.
- **Universal Multi-Theme & Multi-Device:** Mandatory full support for both **Dark Mode** and **Light Mode**, fully responsive across **Desktop, Tablet, and Mobile/Native** platforms.
- **Core Principle:** Visual aesthetics (color-mix shadows, borders, micro-interactions) must strictly serve usability, quick operation, visual hierarchy, sub-100ms tactile feedback, and strict accessibility (a11y) without performance bottlenecks.

---

## 2. Color System & Dual Theme Tokens (Desktop & Mobile)

Both themes must be seamlessly supported across Desktop, Tablet, and Mobile interfaces using semantic CSS tokens.

### 2.1 Dark Mode System (Pure Neutral Carbon)
- **Background (Level 0):** Pure Carbon Neutral (`#0A0A0A` / `--bg-canvas`).
- **Cards & Containers (Level 1):** Elevated dark neutral (`#171717` / `--bg-surface`).
- **Surface Raised / Modals (Level 2):** Elevated dark container (`#262626` / `--bg-raised`).
- **Inputs & Fields:** Deep contrast field (`#0A0A0A` / `--bg-inset`) with hairline border (`rgba(255,255,255,0.10)` / `--border-default`).
- **Accent Primary (POS Default):** Warm Cream (`#F5EFE6` / `--action-fill`) with dark ink text (`#0A0A0A`) for primary actions, uncoupling from kitchen thermal warnings.
- **Accents Palette (Configurable):** 6 accessible accent choices: Crema (`#F5EFE6`), Naranja Fuego (`#FF6B2C`), Rojo Carmesí (`#EF4444`), Púrpura Eléctrico (`#8F63F4`), Azul Cobalto (`#3B82F6`), Verde Esmeralda (`#10B981`).
- **Text & Contrast:** Pure high-contrast white (`#FAFAFA` / `--text-primary`) for titles (>19:1 AAA); muted slate/gray (`#A3A3A3` / `--text-secondary`) for labels; dimmed gray (`#8A8A8A` / `--text-tertiary`) for metadata.

### 2.2 Light Mode System (Anti-Glare Clean)
- **Background (Level 0):** Soft matte anti-glare (`#FAFAFA` / `#F1F5F9` / `--bg-canvas`).
- **Cards & Containers (Level 1):** Pure White (`#FFFFFF` / `--bg-surface`) with subtle clean border.
- **Surface Raised / Tinted (Level 2):** Subtle elevation tint (`#F4F4F5` / `--bg-raised`).
- **Inputs & Fields:** Clean white (`#FFFFFF` / `--bg-inset`) with crisp neutral border (`#D4D4D4` / `--border-default`).
- **Accent Primary (POS Default):** Dark Ink (`#0A0A0A` / `--action-fill`) with warm cream text (`#FBF7F0`).
- **Thermal Heat Exclusivity:** Orange (`--heat-hot: #FF6B2C / #C73E12`) is strictly reserved for kitchen/ticket preparation aging (`--heat-*`), never mixed with general button selections.
- **Text & Contrast:** Deep neutral (`#0A0A0A` / `--text-primary`) for titles (19:1 AAA); high-contrast slate (`#525252` / `--text-secondary`, 7.5:1 AAA) for body; slate gray (`#737373` / `--text-tertiary`, 4.7:1 AA) for secondary metadata. Prohibited light faded texts.

### 2.3 Semantic & Operational Colors (Universal)
- **Success / Ready / Sync (Green):** `#10B981` / `#059669` — Order served, paid, sync completed, stock in green.
- **Warning / Pending / Local (Amber):** `#F59E0B` / `#D97706` — Order cooking, pending local sync (outbox), stock warning.
- **Error / Urgent (Red):** `#EF4444` / `#DC2626` — Kitchen ticket overtime (>15 min), canceled item, sync error.
- **In-Transit / Active (Blue):** `#3B82F6` — Order dispatched, flying comanda.

---

## 3. Radii Geometry & Progressive Elevation

### 3.1 Strict Border Radius Scale
- **`rounded-full` (`9999px`):** Mandatory for primary interactive controls: operational action buttons, quantity toggles (`+` / `-`), filter chips, search bars (`OmniSearch`), and state badges.
- **`rounded-xl` (`20px`):** Main containers, modal dialogs (`Modal`), sliding drawers, and payment checkout sheets.
- **`rounded-lg` (`16px`):** Product catalog cards, KDS kitchen tickets, financial KPI containers, and form panels.
- **`rounded-md` (`12px`):** Secondary buttons, nested card elements, interactive list rows.
- **`rounded-sm` / `rounded-input` (`8px`):** Mandatory standard for all form fields: `<input>`, `<select>`, `Combobox`, `PriceInput`, `<textarea>`.
- **`rounded-none` (`0px`):** Dividers, hairline separators, and breakdown table rows.

### 3.2 Chromatic Shadows & Elevation
- **Light Mode Progressive Lift:** Avoid muddy black shadows. Use brand/text-tinted shadows via `color-mix`:
  - Card rest: `0 8px 24px rgba(15, 23, 42, 0.04)`
  - Card hover (desktop): `0 16px 32px -10px color-mix(in srgb, #0F172A 15%, transparent)`
- **Dark Mode Elevation:** Rely primarily on surface lightness stepping (`--bg-app` -> `--bg-surface` -> `--bg-surface-raised`) paired with 1px hairline borders (`--border-subtle`). Reserve glows exclusively for active/focus states.

---

## 4. Responsive Layout & Spatial Architecture

### 4.1 Mobile & Touch Viewports (Dark & Light Mode)
- **Thumb-Zone Ergonomics:** High-frequency controls ("Adicionar ítem", "Confirmar pedido", "Ver comanda", "Cobrar") strictly placed in the lower-third viewport.
- **Sticky Bottom Action Bar:** Persistent floating pill or bottom summary bar (`"3 ítems · $45,000 COP → Ver Comanda"`).
- **Touch Targets:** Minimum interactive area of `48x48px` with at least `8px` physical gap between adjacent buttons (`+` / `-`).
- **Filter Chips:** Horizontally scrollable pill chips with smooth momentum scrolling.

### 4.2 Desktop & Tablet Viewports (Dark & Light Mode)
- **Split View Layout:**
  - Left / Center: Product catalog grid (2-4 cols), interactive tables, or analytical views.
  - Right Panel (Fixed/Sticky): Live active comanda, guest selector, dish modifiers, and direct checkout controls.
- **Navigation:** Collapsible left sidebar with clear icon + text hierarchy, adapting to top/bottom bar on smaller touch devices.

---

## 5. Typography, Financial Formatting & Iconography

### 5.1 Typography Scale & Tabular Numbers
- **Font Family:** `Plus Jakarta Sans` as primary font; tabular fallback.
- **Financial & Price Formatting:** All monetary totals, table numbers, and item prices MUST enforce `font-variant-numeric: tabular-nums` and tight tracking (`letter-spacing: -0.02em` to `-0.03em`) in Bold/Semi-Bold (`600` / `700` / `800`) to ensure fast, stable scanning without visual jumping.
- **Contrast Ratios:** WCAG 2.1 AA/AAA mandatory: > 7:1 for primary titles/prices, > 4.5:1 for secondary labels.

### 5.2 Micro-Interactions & Dual-State Feedback
- **Desktop/Mouse Hover:** Smooth lift `transform: translateY(-2px)` on buttons, `translateY(-4px)` on catalog cards.
- **Touch / Mobile / POS Press:** Instant haptic feedback via tactile compression `:active { transform: scale(0.97); }` (80ms-100ms duration) prior to action dispatch.
- **Transitions:** Short, crisp animations (`150ms - 200ms ease-out`). Avoid long decorative delays.

### 5.3 Iconography
- **Style:** Clean 2px stroke outline (`Lucide Icons` / `Material Symbols Outlined`) on a 20px / 24px grid. Solid for active state.

---

## 6. Accessibility (a11y) & UX Guardrails
- **Focus Rings:** Mandatory `:focus-visible` with 2px solid outline in primary accent (`--accent-purple` in Dark, `--accent-orange` in Light) and 2px offset.
- **Long Text Clamping:** Truncate dish names with `truncate` / `line-clamp-2` so prices and touch buttons are never pushed off-screen.
- **Commercial Vocabulary:** Use strict restaurant & hospitality terms: *comanda*, *mesa*, *cliente*, *ítem*, *enviar a cocina*, *cierre de turno*, *arqueo*. Never generic terms.