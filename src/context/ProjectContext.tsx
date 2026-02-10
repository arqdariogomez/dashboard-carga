import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import type { AppState, AppAction, Project } from '@/lib/types';
import { DEFAULT_STATE, DEFAULT_FILTERS } from '@/lib/constants';
import { calculateDailyWorkload, applyFilters, getPersons, getBranches, getActiveProjects, computeProjectFields } from '@/lib/workloadEngine';
import { getDateRange } from '@/lib/dateUtils';

const MAX_HISTORY = 50;

interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

// Check if action modifies project data (should be tracked in history)
function isUndoableAction(action: AppAction): boolean {
  return ['UPDATE_PROJECT', 'ADD_PROJECT', 'DELETE_PROJECT', 'REORDER_PROJECTS'].includes(action.type);
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return {
        ...state,
        projects: action.payload.projects,
        projectOrder: action.payload.projects.map(p => p.id),
        fileName: action.payload.fileName,
        lastUpdated: new Date(),
        hasUnsavedChanges: false,
      };
    case 'SET_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'RESET_FILTERS':
      return { ...state, filters: DEFAULT_FILTERS };
    case 'SET_VIEW':
      return { ...state, activeView: action.payload };
    case 'SET_GRANULARITY':
      return { ...state, granularity: action.payload };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'SET_LOAD_MODE':
      return { ...state, config: { ...state.config, loadMode: action.payload } };
    case 'UPDATE_PROJECT': {
      const { id, updates } = action.payload;
      const projects = state.projects.map(p => {
        if (p.id !== id) return p;
        const merged = { ...p, ...updates };
        // Recompute calculated fields
        return computeProjectFields(merged, state.config);
      });
      return { ...state, projects, hasUnsavedChanges: true };
    }
    case 'ADD_PROJECT': {
      const projects = [...state.projects, action.payload];
      const projectOrder = [...state.projectOrder, action.payload.id];
      return { ...state, projects, projectOrder, hasUnsavedChanges: true };
    }
    case 'DELETE_PROJECT': {
      const projects = state.projects.filter(p => p.id !== action.payload);
      const projectOrder = state.projectOrder.filter(id => id !== action.payload);
      return { ...state, projects, projectOrder, hasUnsavedChanges: true };
    }
    case 'REORDER_PROJECTS': {
      return { ...state, projectOrder: action.payload, hasUnsavedChanges: true };
    }
    case 'MARK_SAVED':
      return { ...state, hasUnsavedChanges: false };
    default:
      return state;
  }
}

function historyReducer(
  historyState: HistoryState,
  action: AppAction | { type: 'UNDO' } | { type: 'REDO' }
): HistoryState {
  const { past, present, future } = historyState;

  if (action.type === 'UNDO') {
    if (past.length === 0) return historyState;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    return {
      past: newPast,
      present: previous,
      future: [present, ...future],
    };
  }

  if (action.type === 'REDO') {
    if (future.length === 0) return historyState;
    const next = future[0];
    const newFuture = future.slice(1);
    return {
      past: [...past, present],
      present: next,
      future: newFuture,
    };
  }

  const newPresent = appReducer(present, action as AppAction);

  if (newPresent === present) return historyState;

  if (isUndoableAction(action as AppAction)) {
    const newPast = [...past, present].slice(-MAX_HISTORY);
    return {
      past: newPast,
      present: newPresent,
      future: [], // Clear redo stack on new action
    };
  }

  return {
    past,
    present: newPresent,
    future,
  };
}

function loadPersistedState(): Partial<AppState> {
  try {
    const saved = localStorage.getItem('workload-dashboard-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        activeView: parsed.activeView || 'grid',
        granularity: parsed.granularity || 'week',
        sidebarCollapsed: parsed.sidebarCollapsed || false,
        filters: parsed.filters ? {
          ...DEFAULT_FILTERS,
          ...parsed.filters,
          dateRange: parsed.filters.dateRange ? {
            start: new Date(parsed.filters.dateRange.start),
            end: new Date(parsed.filters.dateRange.end),
          } : null,
        } : DEFAULT_FILTERS,
        config: parsed.config ? {
          ...DEFAULT_STATE.config,
          ...parsed.config,
          holidays: parsed.config.holidays?.map((h: { date: string; reason: string; recurring: boolean }) => ({
            ...h,
            date: new Date(h.date),
          })) || DEFAULT_STATE.config.holidays,
        } : DEFAULT_STATE.config,
      };
    }
  } catch {
    // ignore
  }
  return {};
}

interface ProjectContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction | { type: 'UNDO' } | { type: 'REDO' }>;
  filteredProjects: Project[];
  orderedFilteredProjects: Project[];
  allPersons: string[];
  allBranches: string[];
  dateRange: { start: Date; end: Date } | null;
  workloadData: Map<string, import('@/lib/types').PersonWorkload[]>;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const persisted = loadPersistedState();
  const initialState: AppState = { ...DEFAULT_STATE, ...persisted };

  const [historyState, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialState,
    future: [],
  });

  const state = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const undoCount = historyState.past.length;

  // Persist state
  useEffect(() => {
    try {
      localStorage.setItem('workload-dashboard-state', JSON.stringify({
        activeView: state.activeView,
        granularity: state.granularity,
        sidebarCollapsed: state.sidebarCollapsed,
        filters: state.filters,
        config: state.config,
      }));
    } catch {
      // ignore
    }
  }, [state.activeView, state.granularity, state.sidebarCollapsed, state.filters, state.config]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          dispatch({ type: 'UNDO' });
        }
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        if (canRedo) {
          e.preventDefault();
          dispatch({ type: 'REDO' });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, canRedo]);

  const filteredProjects = useMemo(
    () => applyFilters(state.projects, state.filters),
    [state.projects, state.filters]
  );

  // Order filtered projects by projectOrder
  const orderedFilteredProjects = useMemo(() => {
    if (state.projectOrder.length === 0) return filteredProjects;
    const orderMap = new Map(state.projectOrder.map((id, idx) => [id, idx]));
    return [...filteredProjects].sort((a, b) => {
      const aIdx = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
  }, [filteredProjects, state.projectOrder]);

  const allPersons = useMemo(() => getPersons(state.projects), [state.projects]);
  const allBranches = useMemo(() => getBranches(state.projects), [state.projects]);

  const dateRange = useMemo(() => {
    if (state.filters.dateRange) return state.filters.dateRange;
    return getDateRange(getActiveProjects(state.projects));
  }, [state.projects, state.filters.dateRange]);

  const workloadData = useMemo(() => {
    if (!dateRange || filteredProjects.length === 0) return new Map();
    return calculateDailyWorkload(filteredProjects, state.config, dateRange);
  }, [filteredProjects, state.config, dateRange]);

  const value = useMemo(() => ({
    state,
    dispatch,
    filteredProjects,
    orderedFilteredProjects,
    allPersons,
    allBranches,
    dateRange,
    workloadData,
    canUndo,
    canRedo,
    undoCount,
  }), [state, dispatch, filteredProjects, orderedFilteredProjects, allPersons, allBranches, dateRange, workloadData, canUndo, canRedo, undoCount]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
