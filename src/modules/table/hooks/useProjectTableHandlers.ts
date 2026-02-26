import { useCallback } from 'react';

interface UseProjectTableHandlersProps {
  setColumnMenuOpenFor: (id: string | null) => void;
  setFixedHeaderMenuOpenFor: (id: string | null) => void;
  setCommentsOpen: (open: boolean) => void;
  bulkMenuOpen: boolean;
  bulkMenuRef: React.RefObject<HTMLDivElement | null>;
  contentScrollRef: React.RefObject<HTMLDivElement | null>;
  stickyToolsRef: React.RefObject<HTMLDivElement | null>;
  headerStickyRef: React.RefObject<HTMLTableSectionElement | null>;
  rowRefs: React.RefObject<Record<string, HTMLTableRowElement | null>>;
  resizingColumnRef: React.RefObject<{ key: string; startX: number; startWidth: number } | null>;
  dynamicReloadTimerRef: React.RefObject<number | null>;
  dynamicRequestSeqRef: React.RefObject<number>;
  dynamicAppliedSeqRef: React.RefObject<number>;
}

export function useProjectTableHandlers({
  setColumnMenuOpenFor,
  setFixedHeaderMenuOpenFor,
}: UseProjectTableHandlersProps) {
  const handleColumnMenuToggle = useCallback((columnId: string | null) => {
    setColumnMenuOpenFor(columnId);
  }, [setColumnMenuOpenFor]);

  const handleFixedHeaderMenuToggle = useCallback((menuId: string | null) => {
    setFixedHeaderMenuOpenFor(menuId);
  }, [setFixedHeaderMenuOpenFor]);

  const handlePresenceChange = useCallback((_rowId: string | null, _columnId?: string | null) => {
    // Placeholder intencional: en la versión modular no se persiste presencia remota aún.
  }, []);

  const handleShowGroupEditHint = useCallback(() => {
    // Placeholder intencional: se mantiene sin toast para evitar ruido UX.
  }, []);

  return {
    handleColumnMenuToggle,
    handleFixedHeaderMenuToggle,
    handlePresenceChange,
    handleShowGroupEditHint,
  };
}
