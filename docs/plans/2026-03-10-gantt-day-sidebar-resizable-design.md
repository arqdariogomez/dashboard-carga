# Gantt Day Sidebar Resizable Layout (Design)

## Context
The Gantt timeline currently shows a day inspection sidebar on the right. The user wants:
- Sidebar to stay on the right.
- Sidebar to be ~10% thinner than before and content compressed.
- Sidebar width adjustable within reasonable limits.
- Timeline should be "aplastado" (reserved width) rather than overlaid.
- Left name sidebar should also be resizable within a range.

## Goals
- Keep Gantt visible while day inspection is open.
- Use layout that reserves width (no overlay blocking the chart).
- Provide a resizable right day-inspection sidebar with min/max bounds.
- Provide a resizable left names sidebar with min/max bounds.
- Maintain UX consistency with existing Gantt and design tokens.

## Non-Goals
- No new modal system.
- No redesign of Gantt bars or dependency UI.
- No changes to selection logic beyond layout.

## Proposed UI/UX
- Layout: parent container uses flex row when the day sidebar is open.
- Right sidebar width: user adjustable via drag handle; default reduced by ~10% (e.g., 342px). Bounds example: min 300px, max 420px.
- Left sidebar width: already resizable; enforce reasonable bounds and allow drag; keep collapse behavior intact.
- Timeline area: flex: 1; min-width: 0; automatically shrinks when right sidebar opens.
- Sidebar content compression:
  - Reduce padding in header and list.
  - Reduce card padding and gaps.
  - Slightly reduce typography sizes by 1px where needed.

## Data/State
- Introduce `daySidebarWidth` state (or reuse existing pattern like `sidebarWidth`).
- Track drag state for day sidebar resizing with mousemove/mouseup listeners.
- Persist optional width in localStorage (optional, if pattern exists).

## Components Impacted
- `src/components/dashboard/GanttTimeline.tsx`
  - Wrap timeline and right sidebar in a flex row.
  - Add resizable handle for right sidebar.
  - Manage `daySidebarWidth` state and clamp.
- `src/components/dashboard/DayDetailSidebar.tsx`
  - Accept `width` prop.
  - Update styles for compressed layout.
  - Add optional resize handle if placed inside.

## Error Handling
- Guard against drag when sidebar collapsed.
- Clamp widths within min/max to avoid layout break.

## Testing/Verification
- Manual: open sidebar, drag resize handle left/right, verify min/max.
- Ensure timeline remains visible and zoom bar stays in place.
- Ensure clicks on bars still ignored for selection.

## Open Questions
- Persist right sidebar width per board? (default: no persistence)

