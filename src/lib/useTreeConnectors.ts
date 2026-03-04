import { useMemo } from 'react';
import type { Project } from '@/lib/types';

export interface TreeConnectorData {
  ancestorContinuations: boolean[];
  hasNextSibling: boolean;
  hasPrevSibling: boolean;
  hasParentConnector: boolean;
}

export function computeTreeConnectors(
  currentProject: Project,
  visibleOrderedProjects: Project[],
): TreeConnectorData {
  const depth = currentProject.hierarchyLevel ?? 0;
  if (depth === 0) {
    return {
      ancestorContinuations: [],
      hasNextSibling: false,
      hasPrevSibling: false,
      hasParentConnector: false,
    };
  }

  const currentIdx = visibleOrderedProjects.findIndex((p) => p.id === currentProject.id);
  if (currentIdx === -1) {
    return {
      ancestorContinuations: [],
      hasNextSibling: false,
      hasPrevSibling: false,
      hasParentConnector: false,
    };
  }

  const rowsAfter = visibleOrderedProjects.slice(currentIdx + 1);
  const rowsBefore = visibleOrderedProjects.slice(0, currentIdx);
  const byId = new Map(visibleOrderedProjects.map((p) => [p.id, p]));

  const ancestors: Project[] = [];
  let cursor: string | null = currentProject.parentId ?? null;
  while (cursor) {
    const parent = byId.get(cursor);
    if (!parent) break;
    ancestors.push(parent);
    cursor = parent.parentId ?? null;
  }
  ancestors.reverse();

  // Ancestor rails should continue only when that ancestor itself has a later sibling.
  // This keeps rails aligned with branch continuity and avoids long phantom rails.
  const ancestorContinuations = ancestors.slice(0, -1).map((ancestor) => {
    const ancestorParentId = ancestor.parentId ?? null;
    if (ancestorParentId === null) return false;
    const ancestorLevel = ancestor.hierarchyLevel ?? 0;
    return rowsAfter.some(
      (row) =>
        row.id !== ancestor.id &&
        (row.parentId ?? null) === ancestorParentId &&
        (row.hierarchyLevel ?? 0) === ancestorLevel,
    );
  });

  const currentParentId = currentProject.parentId ?? null;
  const currentLevel = currentProject.hierarchyLevel ?? 0;
  const parentProject = currentParentId ? byId.get(currentParentId) ?? null : null;
  const hasParentConnector = Boolean(parentProject);
  const hasNextSibling = rowsAfter.some(
    (row) =>
      (row.parentId ?? null) === currentParentId &&
      (row.hierarchyLevel ?? 0) === currentLevel,
  );
  const hasPrevSibling = rowsBefore.some(
    (row) =>
      (row.parentId ?? null) === currentParentId &&
      (row.hierarchyLevel ?? 0) === currentLevel,
  );

  return { ancestorContinuations, hasNextSibling, hasPrevSibling, hasParentConnector };
}

export function useTreeConnectors(
  currentProject: Project,
  visibleOrderedProjects: Project[],
): TreeConnectorData {
  return useMemo(
    () => computeTreeConnectors(currentProject, visibleOrderedProjects),
    [currentProject, visibleOrderedProjects],
  );
}
