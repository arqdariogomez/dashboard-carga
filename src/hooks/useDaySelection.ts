import { useState, useCallback, useMemo } from 'react';
import { startOfDay, addDays, subDays } from 'date-fns';

// ── Tipos compartidos ──
export interface DayProject {
  id: string;
  name: string;
  assignee: string;
  branch?: string;
  type?: string;
  priority: 'low' | 'medium' | 'high';
  startDate: Date;
  endDate: Date;
}

export interface DayDetails {
  date: Date;
  projects: DayProject[];
  hierarchy: DayHierarchyNode[];
}

export interface DayHierarchyNode {
  id: string;
  name: string;
  kind: 'group' | 'project';
  level: number;
  parentId: string | null;
  project?: DayProject;
  children: DayHierarchyNode[];
}

interface UseDaySelectionOptions {
  projects: Array<{
    id: string;
    name: string;
    assignee?: string | string[];
    branch?: string | string[];
    type?: string;
    priority?: number; // Cambiado de 1 | 2 | 3 a number
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    parentId?: string | null;
    hierarchyLevel?: number;
  }>;
  rangeStart?: Date;
  rangeEnd?: Date;
}

export function useDaySelection({
  projects,
  rangeStart,
  rangeEnd,
}: UseDaySelectionOptions) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // ── Proyectos activos en el día seleccionado ──
  const dayDetails = useMemo((): DayDetails | null => {
    if (!selectedDate || !projects.length) return null;

    const sel = startOfDay(selectedDate).getTime();

    const activeProjects = projects
      .filter((p) => {
        if (!p.startDate || !p.endDate) return false;
        const start = startOfDay(new Date(p.startDate)).getTime();
        const end = startOfDay(new Date(p.endDate)).getTime();
        return sel >= start && sel <= end;
      })
      .map(
        (p): DayProject => ({
          id: p.id,
          name: p.name,
          assignee: Array.isArray(p.assignee) 
            ? (p.assignee[0] || 'Sin asignar')
            : (p.assignee || 'Sin asignar'),
          branch: Array.isArray(p.branch) ? p.branch[0] : p.branch,
          type: p.type,
          priority: p.priority === 1 
            ? 'low' 
            : p.priority === 2 
            ? 'medium' 
            : 'high',
          startDate: new Date(p.startDate!),
          endDate: new Date(p.endDate!),
        })
      );

    const projectById = new Map(projects.map((p) => [p.id, p]));
    const activeIds = new Set(activeProjects.map((p) => p.id));
    const nodeIds = new Set<string>(activeIds);

    // Collect ancestors for active projects
    activeProjects.forEach((p) => {
      let current = projectById.get(p.id);
      while (current?.parentId) {
        const parentId = current.parentId;
        if (!parentId) break;
        nodeIds.add(parentId);
        current = projectById.get(parentId);
      }
    });

    const orderIndex = new Map<string, number>();
    projects.forEach((p, idx) => orderIndex.set(p.id, idx));

    const nodes = new Map<string, DayHierarchyNode>();
    nodeIds.forEach((id) => {
      const base = projectById.get(id);
      if (!base) return;
      const isActive = activeIds.has(id);
      const level =
        typeof base.hierarchyLevel === 'number'
          ? base.hierarchyLevel
          : (() => {
              let l = 0;
              let cur = base;
              while (cur?.parentId) {
                const parent = projectById.get(cur.parentId);
                if (!parent) break;
                l += 1;
                cur = parent;
              }
              return l;
            })();
      nodes.set(id, {
        id,
        name: base.name,
        kind: isActive ? 'project' : 'group',
        level,
        parentId: base.parentId ?? null,
        project: isActive ? activeProjects.find((p) => p.id === id) : undefined,
        children: [],
      });
    });

    // Link children
    nodes.forEach((node) => {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      }
    });

    // Sort children by original order
    nodes.forEach((node) => {
      node.children.sort((a, b) => {
        const ai = orderIndex.get(a.id) ?? 0;
        const bi = orderIndex.get(b.id) ?? 0;
        return ai - bi;
      });
    });

    // Roots
    const roots = Array.from(nodes.values())
      .filter((n) => !n.parentId || !nodes.has(n.parentId))
      .sort((a, b) => {
        const ai = orderIndex.get(a.id) ?? 0;
        const bi = orderIndex.get(b.id) ?? 0;
        return ai - bi;
      });

    return { date: selectedDate, projects: activeProjects, hierarchy: roots };
  }, [selectedDate, projects]);

  // ── Seleccionar día (con toggle) ──
  const selectDate = useCallback(
    (date: Date) => {
      const incoming = startOfDay(date).getTime();

      // Toggle: mismo día → cerrar
      if (selectedDate && startOfDay(selectedDate).getTime() === incoming) {
        setSelectedDate(null);
        return;
      }

      // Validar rango si se proporcionó
      if (rangeStart && incoming < startOfDay(rangeStart).getTime()) return;
      if (rangeEnd && incoming > startOfDay(rangeEnd).getTime()) return;

      setSelectedDate(date);
    },
    [selectedDate, rangeStart, rangeEnd]
  );

  // ── Navegación ──
  const navigateDay = useCallback(
    (direction: 'prev' | 'next') => {
      if (!selectedDate) return;

      const newDate =
        direction === 'prev'
          ? subDays(selectedDate, 1)
          : addDays(selectedDate, 1);

      const newTime = startOfDay(newDate).getTime();
      if (rangeStart && newTime < startOfDay(rangeStart).getTime()) return;
      if (rangeEnd && newTime > startOfDay(rangeEnd).getTime()) return;

      setSelectedDate(newDate);
    },
    [selectedDate, rangeStart, rangeEnd]
  );

  // ── Cerrar ──
  const clearSelection = useCallback(() => setSelectedDate(null), []);

  // ── Checks de límite (para deshabilitar botones) ──
  const canNavigatePrev = useMemo(() => {
    if (!selectedDate) return false;
    if (!rangeStart) return true;
    return startOfDay(selectedDate).getTime() > startOfDay(rangeStart).getTime();
  }, [selectedDate, rangeStart]);

  const canNavigateNext = useMemo(() => {
    if (!selectedDate) return false;
    if (!rangeEnd) return true;
    return startOfDay(selectedDate).getTime() < startOfDay(rangeEnd).getTime();
  }, [selectedDate, rangeEnd]);

  return {
    selectedDate,
    dayDetails,
    selectDate,
    navigateDay,
    clearSelection,
    canNavigatePrev,
    canNavigateNext,
  };
}
