# Google Anti-Gravity ID: System UI/UX & Design System Rules (Universal Dark/Light & Responsive Desktop/Mobile)

## 1. Core Philosophy & Design Strategy
- **Style:** Functional Minimalism + Soft Neumorphism/Card Elevation. Clean, scannable, and distraction-free for high-productivity business, POS, comanda, and analytical environments.
- **Universal Multi-Theme & Multi-Device:** Mandatory full support for both **Dark Mode** and **Light Mode**, fully responsive across **Desktop, Tablet, and Mobile/Native** platforms.
- **Core Principle:** Visual aesthetics (blur, shadows, color) must strictly serve usability, quick operation, visual hierarchy, and strict accessibility (a11y) without performance bottlenecks.

---

## 2. Color System & Theme Models (Desktop & Mobile)

Both themes must be seamlessly supported across Desktop, Tablet, and Mobile interfaces.

### 2.1 Dark Mode System (Desktop & Mobile)
- **Background (Level 0):** Deep near-black or dark blue slate (`#0B0E14` or `#0F121C`).
- **Cards & Containers (Level 1):** Slightly elevated dark slate (`#161B26` / `#1A202C`) creating soft visual separation without harsh borders.
- **Hover/Active (Level 2):** Elevated interactive state with subtle lighter tone or thin border highlight.
- **Accent Color:** Vibrant Electric Purple (`#8B5CF6` / `#A855F7`) or Cyan for active navigation, key system actions, and focused states.
- **Text & Contrast:** Pure white (`#FFFFFF`) for primary titles; 70% opacity muted slate (`#94A3B8`) for secondary text/labels.

### 2.2 Light Mode System (Desktop & Mobile)
- **Background (Level 0):** Soft warm light gray (`#F8F9FA` or `#F4F5F7`) to eliminate screen glare during continuous use.
- **Cards & Containers (Level 1):** Pure White (`#FFFFFF`) with ultra-soft ambient drop shadows (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04)`).
- **Accent Color:** Warm Amber/Orange (`#FF5722` / `#F97316`) or Deep Crimson (`#EF4444`) for primary Call-to-Actions (CTAs) and interactive action elements.
- **Badges & Status Tags:** Light-tinted container fills with full-opacity bold text (e.g., light orange tag with deep orange text for pending items).
- **Text & Contrast:** Deep charcoal (`#1E293B`) for primary titles; muted slate gray (`#64748B`) for body text and metadata.

### 2.3 Semantic & Operational Colors (Universal)
- **Success / Ready (Green):** `#10B981` — Positive metrics, completed order, item ready/served, "In Stock".
- **Warning / Pending (Yellow/Orange):** `#F59E0B` — Item in preparation, pending confirmation, medium risk, low stock alert.
- **Error / Urgent (Red):** `#EF4444` — Canceled item, urgent alert, threat/risk indicator, critical state.
- **Data Visualization & Charts:** Colorblind-friendly secondary palettes (Cyan, Light Blue, Purple, Crimson) with subtle opacity fills in Light Mode or gradient fills under line charts.

---

## 3. Responsive Layout & Spatial Architecture

### 3.1 Mobile & Touch Viewports (Dark & Light Mode)
- **Border Radius:** Generous outer and card radii (`16px` to `24px`) for modern touch interfaces.
- **Thumb-Zone Ergonomics:**
  - Primary operational controls (e.g., "Adicionar a la comanda", "Confirmar pedido", "Ver comanda", "Guardar cambios") positioned in the lower-third screen area for rapid single-hand operation.
  - Floating or sticky bottom action bars / Bottom Navigation Bar for high-frequency tasks and main sections.
- **Touch Targets:** Minimum interactive area of `44x44px` (recommended `48x48px` for fast-paced order taking) for buttons, icons, and item modifiers (`+` / `-`).
- **Card Patterns:** Horizontal category/filter chips at the top; vertical stacked card lists or carousels for catalog items, active orders, or data lists.

### 3.2 Desktop & Tablet Viewports (Dark & Light Mode)
- **Split View Layout:**
  - Left/Center: Main catalog, tables, or analytical dashboards.
  - Right Panel (Fixed/Sticky): Active comanda summary, live order items, or detailed record view.
- **Navigation:** Collapsible Left Sidebar with clear icon + text hierarchy, switching seamlessly to a top bar or bottom bar on smaller screens.
- **Grid System:** Multi-column responsive layout (2, 3, or 4 columns) adapting dynamically according to screen resolution.
- **Top Bar:** Fixed top area for global search, user profile, notifications, and location/context pickers.

---

## 4. Typography, Hierarchy & Iconography

### 4.1 Typography Scale
- **Font Family:** Modern geometric sans-serif (e.g., Inter, Plus Jakarta Sans, SF Pro).
- **Dark Mode Contrast:** Pure white (`#FFFFFF`) for primary titles; 70% opacity muted slate (`#94A3B8`) for secondary text/labels.
- **Light Mode Contrast:** Deep charcoal (`#1E293B`) for primary titles; muted slate gray (`#64748B`) for body text and metadata.
- **Hierarchy:** Rely heavily on font weight variation (Bold/Semi-bold vs. Regular) and letter-spacing rather than excessive font-size jumps.

### 4.2 Iconography
- **Style:** Clean, consistent stroke line-art (Outline) for default states; Solid/Filled for active states.
- **Integration:** Icons must align perfectly with text labels (16px, 20px, 24px grid).
- **Floating & Badge Buttons:** Action icons (e.g., floating comanda badge, notification indicators) must use high-contrast primary accent fills with subtle shadows.

---

## 5. Operational Components, Order Flow & Interactions

### 5.1 Comanda & Item Modifiers
- **Item Action Buttons:** Explicit operational labels like "Adicionar ítem", "Modificar comanda", "Enviar a cocina", or "Tomar pedido".
- **Quantity Modifiers:** Prominent `+` and `-` controls with high visual contrast to eliminate misclicks during fast customer service.
- **Category Chips/Pills:** Rounded capsule buttons (`border-radius: 9999px`) for fast filtering. Active pills take full accent color fill with inverted high-contrast text.

### 5.2 Visual Progress & Status Indicators
- **Progress Bars:** Soft track background with high-contrast filled indicator. Always pair visual progress bars with clear numeric, percentage, or state text labels (e.g., "En preparación", "Comanda enviada").
- **Table / List Views:** Dense, readable tables with subtle zebra striping or soft card borders for rapid scannability.

### 5.3 Micro-Interactions & Feedback
- **Transitions:** Smooth, short animations (`150ms - 200ms ease-in-out`) on hover, press, tap, or state toggle to confirm user action.
- **Dark/Light Mode Toggle:** Seamless smooth-transition switcher, persisting theme preference across sessions.

---

## 6. Accessibility (a11y) & UX Guardrails (Universal)
- **WCAG 2.1 AA/AAA Compliance:**
  - Minimum text-to-background contrast ratio of **4.5:1** for secondary text and **7:1** for primary text across BOTH Dark and Light modes on all screen sizes.
  - Explicit `:focus-visible` ring/outline for touch screen and physical keyboard navigation.
- **Information Architecture:** Clear content grouping using elevated cards rather than harsh grid divider lines.
- **Scalable Imagery:** High-resolution asset containers with aspect-ratio locking and graceful skeleton loaders while images load.
- **Clear Commercial Vocabulary:** Use direct commercial and operational terminology tailored to customer service and order workflow (e.g., *comanda*, *cliente*, *pedido*, *ítem*).
