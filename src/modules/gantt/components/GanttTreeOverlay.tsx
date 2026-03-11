import { useMemo } from 'react';
import type { Project } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RowGeometry {
  y: number;
  depth: number;
  nameCellLeft: number;
}

const GAP_BELOW_CHEVRON = 8;
const LEAF_ELBOW_REDUCTION = 8;

export interface GanttTreeOverlayProps {
  /** Flat list of visible projects in hierarchical order */
  projects: Project[];
  /** Record mapping project.id → row DOM element */
  rowRefs: React.RefObject<Record<string, HTMLElement | null>>;
  /** The container element all rows are positioned relative to */
  hostEl: HTMLElement | null;
  /** Indent step per hierarchy level (px) */
  step?: number;
  /** Bump to force geometry recalculation */
  version?: number;
  /** CSS class for SVG lines */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GanttTreeOverlay({
  projects,
  rowRefs,
  hostEl,
  step = 12,
  version = 0,
  className = 'stroke-neutral-200/50',
}: GanttTreeOverlayProps) {
  /* ── 1. Geometry pass ───────────────────────────────────────────── */
  const geometry = useMemo(() => {
    if (!hostEl || projects.length === 0) return null;

    const hostRect = hostEl.getBoundingClientRect();
    const byId = new Map<string, RowGeometry>();
    let maxX = 0;
    let maxY = 0;

    for (const project of projects) {
      const rowEl = rowRefs.current?.[project.id];
      if (!rowEl) continue;

      const nameCell =
        rowEl.querySelector<HTMLElement>('[data-gantt-name-cell]') ??
        (rowEl.children.item(0) as HTMLElement | null);
      if (!nameCell) continue;

      const rowRect = rowEl.getBoundingClientRect();
      const cellRect = nameCell.getBoundingClientRect();
      const depth = project.hierarchyLevel ?? 0;
      const nameCellLeft = cellRect.left - hostRect.left;
      const y = rowRect.top - hostRect.top + rowRect.height / 2;

      byId.set(project.id, { y, depth, nameCellLeft });
      maxY = Math.max(maxY, rowRect.bottom - hostRect.top);

      if (depth > 0) {
        const x = nameCellLeft + (depth - 1) * step + Math.round(step / 2);
        maxX = Math.max(maxX, x + Math.max(6, step - 6));
      }
    }

    if (byId.size === 0) return null;

    return {
      byId,
      width: Math.max(maxX + 4, 1),
      height: Math.max(maxY + 2, 1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, rowRefs, hostEl, step, version]);

  /* ── 2. Line segments ───────────────────────────────────────────── */
  const segments = useMemo(() => {
    if (!geometry) return null;

    const segs = new Set<string>();
    const byParent = new Map<string, Project[]>();
    const indexById = new Map(projects.map((p, idx) => [p.id, idx]));
    const projectById = new Map(projects.map((p) => [p.id, p]));

    const isInSubtree = (candidate: Project, ancestorId: string): boolean => {
      let cursor = candidate.parentId ?? null;
      while (cursor) {
        if (cursor === ancestorId) return true;
        cursor = projectById.get(cursor)?.parentId ?? null;
      }
      return false;
    };

    // Group children by parent
    for (const project of projects) {
      if (!project.parentId) continue;
      const list = byParent.get(project.parentId) ?? [];
      list.push(project);
      byParent.set(project.parentId, list);
    }

    const parentIds = new Set<string>();
    for (const [parentId, children] of byParent.entries()) {
      if (children.length > 0) parentIds.add(parentId);
    }

    // Generate line segments
    for (const [parentId, children] of byParent.entries()) {
      const parentGeom = geometry.byId.get(parentId);
      if (!parentGeom || children.length === 0) continue;

      const childrenGeom: Array<{ id: string; y: number; x: number }> = children
        .map((child) => {
          const depth = child.hierarchyLevel ?? 0;
          if (depth <= 0) return null;
          const cg = geometry.byId.get(child.id);
          if (!cg) return null;
          const x = cg.nameCellLeft + (depth - 1) * step + Math.round(step / 2);
          return { id: child.id, y: cg.y, x };
        })
        .filter((v): v is { id: string; y: number; x: number } => Boolean(v))
        .sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0));

      if (childrenGeom.length === 0) continue;

      const railX = childrenGeom[0].x;
      const baseElbowArm = Math.max(4, step - 4);

      // Split into contiguous runs
      const runs: Array<Array<{ id: string; y: number; x: number }>> = [];
      let run: Array<{ id: string; y: number; x: number }> = [childrenGeom[0]];

      for (let i = 1; i < childrenGeom.length; i += 1) {
        const prev = childrenGeom[i - 1];
        const curr = childrenGeom[i];
        const pi = indexById.get(prev.id);
        const ci = indexById.get(curr.id);
        let broken = false;

        if (pi === undefined || ci === undefined || ci <= pi) {
          broken = true;
        } else {
          for (let ri = pi + 1; ri < ci; ri += 1) {
            const between = projects[ri];
            if (!between || !isInSubtree(between, parentId)) {
              broken = true;
              break;
            }
          }
        }

        if (broken) {
          runs.push(run);
          run = [curr];
        } else {
          run.push(curr);
        }
      }
      runs.push(run);

      // Vertical rail: parent center → first child center (with gap)
      const fc = runs[0][0];
      const topY = Math.min(parentGeom.y, fc.y);
      const botY = Math.max(parentGeom.y, fc.y);
      const gappedTopY = topY + GAP_BELOW_CHEVRON;
      if (botY > gappedTopY) {
        segs.add(`v:${railX}:${gappedTopY}:${botY}`);
      }

      // Per-run vertical rails + horizontal elbows
      for (const r of runs) {
        const first = r[0];
        const last = r[r.length - 1];
        if (last.y > first.y) {
          segs.add(`v:${railX}:${first.y}:${last.y}`);
        }
        for (const c of r) {
          const isLeaf = !parentIds.has(c.id);
          const elbowArm = Math.max(
            4,
            baseElbowArm - (isLeaf ? LEAF_ELBOW_REDUCTION : 0),
          );
          segs.add(`h:${railX}:${c.y}:${railX + elbowArm}`);
        }
      }
    }

    return segs.size > 0 ? segs : null;
  }, [geometry, projects, step]);

  /* ── 3. Render ──────────────────────────────────────────────────── */
  if (!geometry || !segments) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[60]"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      style={{
        transform: 'translateX(var(--gantt-scroll-x, 0px))',
      }}
    >
      {Array.from(segments).map((seg) => {
        const [kind, sa, sb, sc] = seg.split(':');
        const a = Number(sa);
        const b = Number(sb);
        const c = Number(sc);

        return kind === 'v' ? (
          <line
            key={seg}
            x1={a} y1={b} x2={a} y2={c}
            className={className}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            shapeRendering="geometricPrecision"
          />
        ) : (
          <line
            key={seg}
            x1={a} y1={b} x2={c} y2={b}
            className={className}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            shapeRendering="geometricPrecision"
          />
        );
      })}
    </svg>
  );
}
