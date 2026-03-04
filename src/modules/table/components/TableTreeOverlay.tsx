import { useMemo } from 'react';
import type { Project } from '@/lib/types';

interface TableTreeOverlayProps {
  projects: Project[];
  rowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
  hostRef: React.RefObject<HTMLDivElement | null>;
  version?: number;
  step?: number;
  className?: string;
}

interface RowGeometry {
  y: number;
  depth: number;
  projectCellLeft: number;
}

export function TableTreeOverlay({
  projects,
  rowRefs,
  hostRef,
  version = 0,
  step = 24,
  className = 'stroke-neutral-300/80',
}: TableTreeOverlayProps) {
  const geometry = useMemo(() => {
    const hostEl = hostRef.current;
    if (!hostEl || projects.length === 0) return null;

    const hostRect = hostEl.getBoundingClientRect();
    const byId = new Map<string, RowGeometry>();
    let maxX = 0;
    let maxY = 0;

    for (const project of projects) {
      const rowEl = rowRefs.current[project.id];
      if (!rowEl) continue;

      const projectCell = rowEl.children.item(1) as HTMLElement | null;
      if (!projectCell) continue;

      const rowRect = rowEl.getBoundingClientRect();
      const cellRect = projectCell.getBoundingClientRect();
      const depth = project.hierarchyLevel ?? 0;
      const projectCellLeft = cellRect.left - hostRect.left + 8; // match px-2 of ExpandableCell
      const y = rowRect.top - hostRect.top + rowRect.height / 2;
      byId.set(project.id, { y, depth, projectCellLeft });
      maxY = Math.max(maxY, rowRect.bottom - hostRect.top);

      if (depth > 0) {
        const x = projectCellLeft + (depth - 1) * step + Math.round(step / 2);
        maxX = Math.max(maxX, x + Math.max(6, step - 6));
      }
    }

    return {
      byId,
      width: Math.max(maxX + 4, 1),
      height: Math.max(maxY + 2, 1),
    };
  }, [projects, rowRefs, hostRef, step, version]);

  if (!geometry) return null;

  const elbowArm = Math.max(6, step - 6);
  const segments = new Set<string>();
  const byParent = new Map<string, Project[]>();
  const indexById = new Map(projects.map((p, idx) => [p.id, idx]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const isInParentSubtree = (candidate: Project, parentId: string): boolean => {
    let cursor = candidate.parentId ?? null;
    while (cursor) {
      if (cursor === parentId) return true;
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
        const childGeom = geometry.byId.get(child.id);
        if (!childGeom) return null;
        const x = childGeom.projectCellLeft + (depth - 1) * step + Math.round(step / 2);
        return { id: child.id, y: childGeom.y, x };
      })
      .filter((v): v is { id: string; y: number; x: number } => Boolean(v))
      .sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0));

    if (childrenGeom.length === 0) continue;

    const railX = childrenGeom[0].x;
    const runs: typeof childrenGeom[] = [];
    let currentRun: typeof childrenGeom = [childrenGeom[0]];

    for (let i = 1; i < childrenGeom.length; i += 1) {
      const prev = childrenGeom[i - 1];
      const curr = childrenGeom[i];
      const prevIdx = indexById.get(prev.id);
      const currIdx = indexById.get(curr.id);
      let breaksRun = false;

      if (prevIdx === undefined || currIdx === undefined || currIdx <= prevIdx) {
        breaksRun = true;
      } else {
        for (let rowIdx = prevIdx + 1; rowIdx < currIdx; rowIdx += 1) {
          const between = projects[rowIdx];
          if (!between || !isInParentSubtree(between, parentId)) {
            breaksRun = true;
            break;
          }
        }
      }

      if (breaksRun) {
        runs.push(currentRun);
        currentRun = [curr];
      } else {
        currentRun.push(curr);
      }
    }
    runs.push(currentRun);

    const firstRun = runs[0];
    const firstChild = firstRun[0];
    segments.add(`v:${railX}:${Math.min(parentGeom.y, firstChild.y)}:${Math.max(parentGeom.y, firstChild.y)}`);

    for (const run of runs) {
      const runFirst = run[0];
      const runLast = run[run.length - 1];
      if (runLast.y > runFirst.y) {
        segments.add(`v:${railX}:${runFirst.y}:${runLast.y}`);
      }
      for (const child of run) {
        segments.add(`h:${railX}:${child.y}:${railX + elbowArm}`);
      }
    }
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[1]"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    >
      {Array.from(segments).map((segment) => {
        const [kind, a, b, c] = segment.split(':');
        if (kind === 'v') {
          return (
            <line
              key={segment}
              x1={Number(a)}
              y1={Number(b)}
              x2={Number(a)}
              y2={Number(c)}
              className={className}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              shapeRendering="geometricPrecision"
            />
          );
        }
        return (
          <line
            key={segment}
            x1={Number(a)}
            y1={Number(b)}
            x2={Number(c)}
            y2={Number(b)}
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
