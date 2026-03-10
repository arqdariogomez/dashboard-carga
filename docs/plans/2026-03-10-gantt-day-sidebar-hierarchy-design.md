# Gantt Day Sidebar Hierarchy (Design)

## Context
The Day Detail sidebar should show hierarchical grouping like the Project Table. Users are confused because groups and tasks look the same. We need clear hierarchy with indentation and collapsible groups (chevron), default expanded.

## Goals
- Show **real hierarchy** based on `parentId`/`hierarchyLevel` (same model as Project Table).
- In day sidebar: **active projects** render full cards; **group/parent rows** render title-only.
- Provide **indentation** per level for clarity.
- Provide **collapsible** groups with chevrons, default expanded.
- Keep behavior scoped to sidebar (no impact on Gantt/Table state).

## Non-Goals
- No changes to global grouping mode in Gantt.
- No new persistence layer for sidebar expansion (local state only).

## Data Model
- Use existing `Project` hierarchy via `parentId` and `hierarchyLevel`.
- Build tree from **active projects for the selected day** plus **all ancestor groups**.
- Each node has:
  - `id`, `name`, `parentId`, `hierarchyLevel`
  - `kind`: `group` or `project` (group inferred if node has children or if it is an ancestor-only node)
  - `children[]`

## Tree Construction
1. Filter active projects for the selected day.
2. Collect all ancestors for each active project.
3. Build a map of nodes by `id` (active + ancestors).
4. Link children by `parentId`.
5. Compute roots (`parentId == null` or missing in map).
6. Preserve ordering based on existing project order (use `state.projectOrder` or current list order).

## Rendering
- **Row layout**: inline row with indent padding `level * INDENT_PX`.
- **Group row**:
  - Chevron left (expand/collapse)
  - Title only (no metadata)
  - Subtle styling (lighter background, smaller font)
- **Project row**:
  - Full card content (current sidebar card)
- **Default state**: all groups expanded.

## Interactions
- Clicking chevron toggles group expand state.
- Clicking group title does not open project details (no action).

## Visual Tokens
- Indent: 14–16px per level.
- Group title font: 12–13px, semibold.
- Group row padding: compact, align with compressed sidebar.

## Testing / Verification
Manual checklist:
- Open day sidebar, see group headers with chevrons.
- Indentation matches hierarchy.
- Collapsing a group hides its children.
- Active projects still show full cards.

