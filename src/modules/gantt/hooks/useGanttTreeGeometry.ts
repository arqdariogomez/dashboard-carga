import { useCallback, useRef, useState } from 'react';

/**
 * Manages row element refs and a version counter for GanttTreeOverlay.
 *
 * Usage:
 * - Call `registerRow(projectId)` as a ref callback on each row element.
 * - Call `registerGroupHost(groupId)` as a ref callback on each group container.
 * - Call `invalidate()` after expand/collapse/resize to trigger recalculation.
 * - Read `groupHostEls[groupId]` to get host element for each group.
 */
export function useGanttTreeGeometry() {
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const [groupHostEls, setGroupHostEls] = useState<Record<string, HTMLDivElement | null>>({});
  const [version, setVersion] = useState(0);

  const registerRow = useCallback(
    (projectId: string) => (el: HTMLElement | null) => {
      if (el) {
        rowRefs.current[projectId] = el;
      } else {
        delete rowRefs.current[projectId];
      }
    },
    [],
  );

  const registerGroupHost = useCallback(
    (groupId: string) => (el: HTMLDivElement | null) => {
      setGroupHostEls((prev) => {
        if (prev[groupId] === el) return prev;
        const next = { ...prev };
        if (el) {
          next[groupId] = el;
        } else {
          delete next[groupId];
        }
        return next;
      });
    },
    [],
  );

  const invalidate = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return {
    rowRefs,
    groupHostEls,
    version,
    registerRow,
    registerGroupHost,
    invalidate,
  } as const;
}
