import { useMemo } from 'react';
import type { Project } from '@/lib/types';

interface RowGeometry {
  y: number;
  depth: number;
  nameCellLeft: number;
}

export interface GanttTreeOverlayProps {
  projects: Project[];
  rowRefs: React.RefObject<Record<string, HTMLElement | null>>;
  groupHostRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  groupId: string;
  step?: number;
  version?: number;
  className?: string;
}

export function GanttTreeOverlay({
  projects,
  rowRefs,
  groupHostRefs,
  groupId,
  step = 12,
  version = 0,
  className = 'stroke-neutral-300/75',
}: GanttTreeOverlayProps) {
  const geometry = useMemo(() => {
    // Read from ref at computation time — no state dependency
    const hostEl = groupHostRefs.current?.[groupId];
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
  }, [projects, groupId, step, version]);

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

    for (const project of projects) {
      if (!project.parentId) continue;
      const list = byParent.get(project.parentId) ?? [];
      list.push(project);
      byParent.set(project.parentId, list);
    }

    for (const [parentId, children] of byParent.entries()) {
      const parentGeom = geometry.byId.get(parentId);
      if (!parentGeom || children.length === 0) continue;

      const childrenGeom = children
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
      const elbowArm = Math.max(4, step - 4);

      const runs: Array<{ id: string; y: number; x: number }>[] = [];
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

      const fc = runs[0][0];
      segs.add(
        `v:${railX}:${Math.min(parentGeom.y, fc.y)}:${Math.max(parentGeom.y, fc.y)}`,
      );

      for (const r of runs) {
        const first = r[0];
        const last = r[r.length - 1];
        if (last.y > first.y) {
          segs.add(`v:${railX}:${first.y}:${last.y}`);
        }
        for (const c of r) {
          segs.add(`h:${railX}:${c.y}:${railX + elbowArm}`);
        }
      }
    }

    return segs.size > 0 ? segs : null;
  }, [geometry, projects, step]);

  if (!geometry || !segments) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[5]"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
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
