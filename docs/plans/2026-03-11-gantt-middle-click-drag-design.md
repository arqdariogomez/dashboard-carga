# Gantt Middle-Click Pan vs Bar Drag - Design

**Date:** 2026-03-11

## Goal
Prevent Gantt bars/milestones from moving when the user is panning with middle-click. Only left-click should initiate bar/milestone drag, while middle-click pan should work freely.

## User Intent
- Middle-click drag should pan the Gantt without affecting bars.
- Left-click drag should still move/resize bars and milestones.

## Scope
- Apply to bar move, bar resize, and milestone drag.
- Mouse-only behavior; touch/pointer devices are out of scope for now.

## Design
### Behavior
- If `e.button !== 0` (not left click), do **nothing** in bar/milestone drag handlers.
- Only when `e.button === 0` do we call `preventDefault/stopPropagation` and start drag state.

### Implementation Points
- Update handlers in `src/components/dashboard/GanttTimeline.tsx`:
  - `handleStartBarMove`
  - `handleStartBarResize`
  - `handleStartMilestoneDrag`

### Event Handling
- For non-left clicks: return early without calling `preventDefault` or `stopPropagation`, preserving middle-click pan behavior.
- For left clicks: keep current logic unchanged.

## Testing
- Manual check in the Gantt:
  - Middle-click drag pans the timeline without moving bars.
  - Left-click drag still moves/resizes bars and milestones.

## Risks
Low. Change is a simple guard and does not alter drag logic for left clicks.

## Out of Scope
- Touch/pointer gesture changes.
- Keyboard modifiers.
