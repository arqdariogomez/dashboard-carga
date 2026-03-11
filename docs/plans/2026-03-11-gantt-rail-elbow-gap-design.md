# Gantt Rail Elbow Gap (Leaf Rows)

## Goal
Add ~8px extra visual air by shortening the elbow endpoint for rows that are not parents (leaf nodes), without changing rail geometry elsewhere.

## Approach
- Detect which project IDs are parents (have children) while building `byParent`.
- When emitting horizontal elbow segments, use a reduced elbow arm length for children that are **not** parents.
- Keep vertical segments and parent elbows unchanged.

## Scope
- File: `src/modules/gantt/components/GanttTreeOverlay.tsx`
- No changes to rendering order, only elbow endpoint length per leaf row.
