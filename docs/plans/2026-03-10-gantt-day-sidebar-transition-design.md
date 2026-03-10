# Gantt Day Sidebar Transition Design

## Goal
When the Day Detail sidebar opens/closes, keep the Gantt timeline visually centered and animate both the sidebar width and the timeline scroll in a cohesive, Apple-like easing. Also remove the outline/border on the day navigation chevrons in the sidebar.

## Context
The Gantt view already recenters on close, but does not recenter on open. The sidebar is resizable and shown/hidden based on `dayDetails`.

## Proposed UX
- Sidebar width animates in/out quickly (~220–260ms) with a smooth cubic-bezier easing.
- Timeline “camera” recenters to the same anchor day with the same easing and duration.
- Anchor day selection logic:
  - If `selectedDate` exists, center that day.
  - Otherwise, keep the current visual center day stable.
- Day sidebar chevron buttons (prev/next) have no outline or border in all states.

## Technical Approach
### Timeline recentering
- Detect sidebar open/close and width changes.
- Compute the new visible width with the sidebar included.
- Recalculate `scrollLeft` so the anchor day remains centered.
- Animate `scrollLeft` over ~220–260ms using `requestAnimationFrame` and a cubic-bezier easing.

### Sidebar transition
- Apply a CSS transition to the day sidebar container width and related layout changes to make the opening/closing visually smooth.

### Chevron outline removal
- Update the Day Detail sidebar navigation button styles to remove border/outline in all states.

## Risks & Mitigations
- Risk: Scroll animation could fight user interaction.
  - Mitigation: Only run the animation on sidebar open/close and width changes; cancel animation on user scroll or drag.

## Acceptance Criteria
- Opening Day Detail sidebar does not shift the visual center unexpectedly.
- Closing Day Detail sidebar also maintains center.
- Both open/close and scroll recenter feel smooth and coherent.
- Prev/next chevrons in the day sidebar have no outline/border in all states.
