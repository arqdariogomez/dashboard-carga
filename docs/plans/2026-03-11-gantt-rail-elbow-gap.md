# Gantt Rail Leaf Elbow Gap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Shorten elbow endpoints by 8px only for leaf rows, giving more air near text without changing other rail geometry.

**Architecture:** Compute a `Set` of parent IDs from `byParent`, then use a per-child elbow arm length (`baseArm - 8` for leaf nodes, `baseArm` otherwise) when emitting horizontal elbow segments.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind

---

### Task 1: Adjust elbow arm for leaf rows

**Files:**
- Modify: `src/modules/gantt/components/GanttTreeOverlay.tsx`

**Step 1: Write the failing test**
No automated tests exist for this UI behavior. Skip.

**Step 2: Run test to verify it fails**
No test command available. Skip.

**Step 3: Write minimal implementation**
Update elbow segment emission to use a reduced arm for leaf nodes:

```tsx
const LEAF_ELBOW_REDUCTION = 8;

const parentIds = new Set<string>();
for (const [parentId, children] of byParent.entries()) {
  if (children.length > 0) parentIds.add(parentId);
}

// inside horizontal elbows loop
for (const c of r) {
  const isLeaf = !parentIds.has(c.id);
  const arm = Math.max(4, step - 4 - (isLeaf ? LEAF_ELBOW_REDUCTION : 0));
  addSeg({ kind: 'h', x1: railX, y: c.y, x2: railX + arm });
}
```

**Step 4: Run test to verify it passes**
Manual check in dev server: verify elbow endpoints for leaf rows shift ~8px left, parents unchanged.

**Step 5: Commit**
```bash
git add src/modules/gantt/components/GanttTreeOverlay.tsx
git commit -m "feat: shorten leaf elbow endpoints"
```
