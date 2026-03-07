import { useCallback, useRef, useState } from 'react';

export function useGanttTreeGeometry() {
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const groupHostRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [version, setVersion] = useState(0);

  // Stable callback caches — same function identity across renders
  const rowCallbackCache = useRef<Record<string, (el: HTMLElement | null) => void>>({});
  const groupCallbackCache = useRef<Record<string, (el: HTMLDivElement | null) => void>>({});

  const registerRow = useCallback((projectId: string) => {
    if (!rowCallbackCache.current[projectId]) {
      rowCallbackCache.current[projectId] = (el: HTMLElement | null) => {
        if (el) {
          rowRefs.current[projectId] = el;
        } else {
          delete rowRefs.current[projectId];
        }
      };
    }
    return rowCallbackCache.current[projectId];
  }, []);

  const registerGroupHost = useCallback((groupId: string) => {
    if (!groupCallbackCache.current[groupId]) {
      groupCallbackCache.current[groupId] = (el: HTMLDivElement | null) => {
        if (el) {
          groupHostRefs.current[groupId] = el;
        } else {
          delete groupHostRefs.current[groupId];
        }
        // No setState here — just mutate ref silently
      };
    }
    return groupCallbackCache.current[groupId];
  }, []);

  const invalidate = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return {
    rowRefs,
    groupHostRefs,
    version,
    registerRow,
    registerGroupHost,
    invalidate,
  } as const;
}
