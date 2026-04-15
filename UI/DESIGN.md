# Design System Specification: The Precision Ledger

## 1. Overview & Creative North Star
**Creative North Star: The Precision Ledger**
In the world of Quality Control, precision is the only currency. This design system rejects the cluttered, "spreadsheet-style" density of traditional enterprise tools in favor of an architectural, editorial experience. We treat QC data not as a chore, but as a narrative of excellence.

By leveraging **Intentional Asymmetry** and **Tonal Depth**, we transform data-heavy mobile screens into a series of breathable, logical layers. We break the "standard template" look by utilizing high-contrast typography scales and overlapping surface elements that guide the inspector's eye through the hierarchy of a report without the need for restrictive grids or heavy borders.

## 2. Colors & Surface Philosophy
This system moves away from flat color fills, favoring a sophisticated palette that communicates authority and technical rigor.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off content. Structural boundaries must be defined solely through background color shifts. Use `surface_container_low` (#f1f4f6) to define a section sitting on a `surface` (#f8f9fa) background. 

### Surface Hierarchy & Nesting
Treat the mobile UI as a physical stack of technical papers.
*   **Base Layer:** `surface` (#f8f9fa) or `background` (#f8f9fa).
*   **Section Layer:** `surface_container_low` (#f1f4f6) or `surface_container` (#eaeff1).
*   **Interactive/Priority Layer:** `surface_container_lowest` (#ffffff) for high-priority cards or input fields.
*   **The Nesting Rule:** An inner container must always be a lighter tier (e.g., `surface_container_lowest`) when sitting on a darker tier (e.g., `surface_container_high`) to create a natural, "lifted" focal point.

### The Glass & Gradient Rule
To achieve a premium feel, floating action buttons or navigation overlays should utilize **Glassmorphism**. Use `surface` colors at 80% opacity with a `20px` backdrop blur. For primary CTAs, avoid flat blue; apply a subtle linear gradient from `primary` (#005db6) to `primary_dim` (#0051a1) at a 135-degree angle to provide "visual soul."

## 3. Typography
The system employs a dual-typeface strategy to balance editorial character with technical legibility.

*   **The Statement (Manrope):** Used for `display`, `headline`, and `title` scales. Manrope’s geometric structure feels engineered and modern, providing an authoritative "header" for QC reports.
*   **The Data (Inter):** Used for `body` and `label` scales. Inter is selected for its high x-height and exceptional legibility in dense data environments (e.g., serial numbers, timestamps, and tolerances).

**Hierarchy Usage:**
*   **Display-LG (3.5rem):** Reserved for high-level dashboard metrics (e.g., % Pass Rate).
*   **Title-SM (1rem):** The workhorse for card titles and section headers.
*   **Label-MD (0.75rem):** Used for technical metadata, utilizing `on_surface_variant` (#586064) to maintain a secondary visual rank.

## 4. Elevation & Depth
We convey importance through **Tonal Layering** rather than traditional structural lines or heavy shadows.

*   **The Layering Principle:** Depth is achieved by stacking. A `surface_container_lowest` card sitting on a `surface_container_low` background creates a soft, natural lift.
*   **Ambient Shadows:** When an element must "float" (e.g., a modal or a primary action), use an extra-diffused shadow. 
    *   *Values:* `0px 8px 24px`
    *   *Color:* `on_surface` (#2b3437) at 6% opacity. This mimics natural light rather than a digital "drop shadow."
*   **The Ghost Border Fallback:** If a boundary is required for accessibility, use the **Ghost Border**: `outline_variant` (#abb3b7) at **15% opacity**. Never use 100% opaque borders.

## 5. Components

### Buttons
*   **Primary:** Uses the Primary-to-Primary-Dim gradient. `lg` (0.5rem) roundedness. No border.
*   **Secondary:** `surface_container_high` (#e3e9ec) background with `on_surface` text.
*   **Tertiary:** Transparent background with `primary` text. No container.

### Input Fields (QC Specific)
*   **Styling:** Forgo the bottom-line-only look. Use a filled `surface_container_lowest` container with a `md` (0.375rem) corner radius. 
*   **Focus State:** Instead of a thick border, use a 2px `primary` "Ghost Border" (20% opacity) and a subtle 4% `primary` tint fill.

### Cards & Data Lists
*   **Forbid Dividers:** Do not use horizontal lines to separate list items. Use 16px of vertical white space or alternating tonal shifts (e.g., `surface` to `surface_container_low`).
*   **The "Precision Strip":** For QC status (Pass/Fail), use a 4px vertical accent bar on the far left of the card using `primary` (Pass) or `error` (Fail).

### Chips
*   **Filter Chips:** Use `surface_container_highest` (#dbe4e7) with `on_surface_variant` text. When selected, transition to `primary_container` (#d6e3ff) with `on_primary_container` text.

### Tooltips & Annotations
*   **Styling:** Use `inverse_surface` (#0c0f10) with 90% opacity. Use `label-md` for the text. Tooltips should have an `sm` (0.125rem) corner radius to feel "sharper" and more technical than standard UI cards.

## 6. Do’s and Don’ts

### Do
*   **Do** use `surface_container` tiers to create a visual "nesting" of information.
*   **Do** utilize `headline-sm` for section titles to create an editorial, high-end feel.
*   **Do** allow for generous white space (minimum 24px) between major data groups to prevent cognitive overload on mobile.
*   **Do** use `primary_container` for subtle highlighting of key technical figures.

### Don't
*   **Don't** use 1px solid borders for sectioning; it creates visual noise and feels "cheap."
*   **Don't** use pure black (#000000) for text; use `on_surface` (#2b3437) to maintain a soft, premium contrast.
*   **Don't** use standard Material Design "Drop Shadows." Stick to the Ambient Shadow values defined in Section 4.
*   **Don't** crowd the screen. If data is heavy, use progressive disclosure (collapsible layers) using tonal shifts to indicate interactivity.