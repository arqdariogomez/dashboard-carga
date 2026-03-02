import React, { createContext, useContext, useReducer, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { AppState, AppAction, Project } from '@/lib/types';
import { DEFAULT_STATE, DEFAULT_FILTERS } from '@/lib/constants';
import { calculateDailyWorkload, applyFilters, getPersons, getBranches, getActiveProjects, computeProjectFields } from '@/lib/workloadEngine';
import { getDateRange } from '@/lib/dateUtils';
import { setDateDisplayFormat } from '@/lib/dateUtils';
import { validateNoCircles, aggregateFromChildren, calculateHierarchyLevel } from '@/lib/hierarchyEngine';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { loadBoardProjects, saveBoardProjects } from '@/lib/cloudBoardRepository';
import { ensureDefaultWorkspaceBoard } from '@/lib/cloudBootstrap';
import { insertBoardVersionRow, loadBoardVersionRows } from '@/lib/versionHistoryRepository';
import { useAuth } from '@/context/AuthContext';

const MAX_HISTORY = 50;
const LAST_BOARD_ID_KEY = 'workload-dashboard-last-board-id';
const VERSION_HISTORY_PREFIX = 'workload-dashboard-version-history-v1';
const MAX_VERSION_HISTORY = 60;

type VersionSnapshotStored = {
  id: string;
  createdAt: string;
  createdById: string | null;
  createdByLabel: string;
  reason: string;
  projectCount: number;
  changedProjects: number;
  fingerprint: string;
  projects: Project[];
  projectOrder: string[];
};

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const asString = String(value);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asString);
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0, 0)
    : new Date(asString);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalISODate(value: Date | null): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

// Check if action modifies project data (should be tracked in history)
function isUndoableAction(action: AppAction): boolean {
  return ['UPDATE_PROJECT', 'BULK_UPDATE_PROJECTS', 'ADD_PROJECT', 'DELETE_PROJECT', 'REORDER_PROJECTS', 'UPDATE_HIERARCHY', 'TOGGLE_EXPANSION'].includes(action.type);
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      // Recompute calculated fields with hierarchy awareness and set accurate hierarchy levels
      {
        const incoming = action.payload.projects || [];
        const projects = incoming.map(p => ({ ...p }));

        // Compute fields with knowledge of all projects
        const computed = projects.map(p => computeProjectFields(p, state.config, projects));

        // Try to restore persisted expansion map from localStorage
        let persistedExpansion: Record<string, boolean> | null = null;
        try {
          const raw = localStorage.getItem('workload-dashboard-expanded');
          if (raw) persistedExpansion = JSON.parse(raw);
        } catch {
          persistedExpansion = null;
        }

        // Calculate proper hierarchyLevel for each project
        const withLevels = computed.map(p => ({
          ...p,
          hierarchyLevel: calculateHierarchyLevel(p.id, computed),
          isExpanded: (persistedExpansion && typeof persistedExpansion[p.id] === 'boolean')
            ? persistedExpansion[p.id]
            : (typeof p.isExpanded === 'boolean' ? p.isExpanded : true),
        }));

        return {
          ...state,
          projects: withLevels,
          projectOrder: incoming.map(p => p.id),
          fileName: action.payload.fileName,
          lastUpdated: new Date(),
          hasUnsavedChanges: false,
        };
      }
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
      let projects = state.projects.map(p => {
        if (p.id !== id) return p;
        const merged = { ...p, ...updates };
        // Recompute calculated fields with hierarchy awareness
        return computeProjectFields(merged, state.config, state.projects);
      });
      
      // If a parent's children changed, re-aggregate the parent
      const updated = projects.find(p => p.id === id);
      if (updated?.parentId) {
        const parentIndex = projects.findIndex(p => p.id === updated.parentId);
        if (parentIndex !== -1) {
          projects = projects.map((p, idx) => {
            if (idx !== parentIndex) return p;
            return computeProjectFields(p, state.config, projects);
          });
        }
      }
      
      // Recalculate hierarchy levels after updates
      projects = projects.map(p => ({ ...p, hierarchyLevel: calculateHierarchyLevel(p.id, projects) }));

      return { ...state, projects, hasUnsavedChanges: true };
    }
    case 'BULK_UPDATE_PROJECTS': {
      const updatesById = action.payload || {};
      const updateIds = new Set(Object.keys(updatesById));
      if (updateIds.size === 0) return state;

      let projects = state.projects.map((p) => {
        if (!updateIds.has(p.id)) return p;
        const merged = { ...p, ...(updatesById[p.id] || {}) };
        return computeProjectFields(merged, state.config, state.projects);
      });

      projects = projects.map((p) => {
        if (!p.parentId) return p;
        if (!updateIds.has(p.id) && !updateIds.has(p.parentId)) return p;
        return computeProjectFields(p, state.config, projects);
      });

      projects = projects.map((p) => ({ ...p, hierarchyLevel: calculateHierarchyLevel(p.id, projects) }));
      return { ...state, projects, hasUnsavedChanges: true };
    }
    case 'ADD_PROJECT': {
      let projects = [...state.projects, action.payload];
      const projectOrder = [...(state.projectOrder || []), action.payload.id];
      projects = projects.map(p => ({ ...p, hierarchyLevel: calculateHierarchyLevel(p.id, projects) }));
      return { ...state, projects, projectOrder, hasUnsavedChanges: true };
    }
    case 'DELETE_PROJECT': {
      let projects = state.projects.filter(p => p.id !== action.payload);
      const projectOrder = (state.projectOrder || []).filter(id => id !== action.payload);
      projects = projects.map(p => ({ ...p, hierarchyLevel: calculateHierarchyLevel(p.id, projects) }));
      return { ...state, projects, projectOrder, hasUnsavedChanges: true };
    }
    case 'REORDER_PROJECTS': {
      return { ...state, projectOrder: action.payload, hasUnsavedChanges: true };
    }
    case 'UPDATE_HIERARCHY': {
      const { projectId, newParentId } = action.payload;
      
      // Validate no circular dependency
      if (!validateNoCircles(projectId, newParentId, state.projects)) {
        console.warn('Cannot move project: would create circular dependency');
        return state;
      }

      let projects = state.projects.map(p => {
        if (p.id !== projectId) return p;
        return { ...p, parentId: newParentId };
      });

      // Re-aggregate parent if it exists
      if (newParentId) {
        const parentIndex = projects.findIndex(p => p.id === newParentId);
        if (parentIndex !== -1) {
          const aggregated = aggregateFromChildren(newParentId, projects, state.config);
          projects[parentIndex] = computeProjectFields(
            { ...projects[parentIndex], ...aggregated },
            state.config
          );
        }
      }

      // Recalculate hierarchy levels after change
      projects = projects.map(p => ({ ...p, hierarchyLevel: calculateHierarchyLevel(p.id, projects) }));

      return { ...state, projects, hasUnsavedChanges: true };
    }
    case 'TOGGLE_EXPANSION': {
      const projectId = action.payload;
      const projects = state.projects.map(p => {
        if (p.id !== projectId) return p;
        return { ...p, isExpanded: !p.isExpanded };
      });
      return { ...state, projects, hasUnsavedChanges: true };
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
      const parsedRangeStart = safeDate(parsed?.filters?.dateRange?.start);
      const parsedRangeEnd = safeDate(parsed?.filters?.dateRange?.end);
      const parsedDateRange =
        parsedRangeStart && parsedRangeEnd && parsedRangeStart <= parsedRangeEnd
          ? { start: parsedRangeStart, end: parsedRangeEnd }
          : null;
      return {
        activeView: parsed.activeView === 'grid' ? 'table' : (parsed.activeView || 'table'),
        granularity: parsed.granularity || 'week',
        sidebarCollapsed: parsed.sidebarCollapsed || false,
        filters: parsed.filters ? {
          ...DEFAULT_FILTERS,
          ...parsed.filters,
          dateRange: parsedDateRange,
        } : DEFAULT_FILTERS,
        config: parsed.config ? {
          ...DEFAULT_STATE.config,
          ...parsed.config,
          holidays: parsed.config.holidays?.map((h: { date: string; reason: string; recurring: boolean }) => ({
            ...h,
            date: safeDate(h.date) || new Date(),
          })) || DEFAULT_STATE.config.holidays,
        } : DEFAULT_STATE.config,
      };
    }
  } catch {
    // ignore
  }
  return {};
}

function loadLastBoardId(): string | null {
  try {
    const saved = localStorage.getItem(LAST_BOARD_ID_KEY);
    if (saved && typeof saved === 'string') return saved;
  } catch {
    // ignore
  }
  return null;
}

function persistLastBoardId(boardId: string | null): void {
  if (!boardId) return;
  try {
    localStorage.setItem(LAST_BOARD_ID_KEY, boardId);
  } catch {
    // ignore
  }
}

function serializeProjectForFingerprint(project: Project): string {
  const startDate = toLocalISODate(project.startDate);
  const endDate = toLocalISODate(project.endDate);
  return JSON.stringify({
    id: project.id,
    name: project.name,
    branch: project.branch,
    startDate,
    endDate,
    assignees: project.assignees,
    daysRequired: project.daysRequired,
    priority: project.priority,
    type: project.type,
    blockedBy: project.blockedBy,
    blocksTo: project.blocksTo,
    reportedLoad: project.reportedLoad,
    parentId: project.parentId || null,
    isExpanded: !!project.isExpanded,
  });
}

function buildSnapshotFingerprint(projects: Project[], projectOrder: string[]): string {
  const byId = new Map(projects.map((p) => [p.id, serializeProjectForFingerprint(p)]));
  return projectOrder.map((id) => `${id}:${byId.get(id) || ''}`).join('|');
}

function estimateChangedProjects(
  previous: VersionSnapshotStored | null,
  currentProjects: Project[],
  currentOrder: string[]
): number {
  if (!previous) return currentProjects.length;
  const prevById = new Map(previous.projects.map((p) => [p.id, serializeProjectForFingerprint(p)]));
  const currById = new Map(currentProjects.map((p) => [p.id, serializeProjectForFingerprint(p)]));
  const allIds = new Set([...prevById.keys(), ...currById.keys()]);
  let changed = 0;
  allIds.forEach((id) => {
    if ((prevById.get(id) || '') !== (currById.get(id) || '')) changed += 1;
  });
  if ((previous.projectOrder || []).join('|') !== currentOrder.join('|')) changed += 1;
  return changed;
}

function restoreProjectDates(project: Project): Project {
  const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    const asString = String(value);
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asString);
    const date = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0, 0)
      : new Date(asString);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  return {
    ...project,
    startDate: toDate(project.startDate),
    endDate: toDate(project.endDate),
  };
}

function loadVersionHistory(boardId: string | null): VersionSnapshotStored[] {
  if (!boardId) return [];
  try {
    const raw = localStorage.getItem(`${VERSION_HISTORY_PREFIX}-${boardId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === 'string' && Array.isArray(x.projects) && Array.isArray(x.projectOrder))
      .map((x) => ({
        ...x,
        projects: (x.projects as Project[]).map(restoreProjectDates),
      }));
  } catch {
    return [];
  }
}

function persistVersionHistory(boardId: string | null, entries: VersionSnapshotStored[]): void {
  if (!boardId) return;
  try {
    localStorage.setItem(`${VERSION_HISTORY_PREFIX}-${boardId}`, JSON.stringify(entries.slice(0, MAX_VERSION_HISTORY)));
  } catch {
    // ignore
  }
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
  versionHistory: {
    id: string;
    createdAt: string;
    createdById: string | null;
    createdByLabel: string;
    reason: string;
    projectCount: number;
    changedProjects: number;
  }[];
  createVersionSnapshot: (reason?: string) => void;
  restoreVersionSnapshot: (versionId: string) => Promise<boolean>;
  getVersionSnapshot: (versionId: string) => {
    id: string;
    createdAt: string;
    createdByLabel: string;
    reason: string;
    projectCount: number;
    changedProjects: number;
    projects: Project[];
    projectOrder: string[];
  } | null;
  versionHistorySync: 'cloud' | 'local';
  boards: { id: string; name: string }[];
  activeBoardId: string | null;
  activeBoardRole: 'owner' | 'editor' | 'viewer' | null;
  canEditActiveBoard: boolean;
  isBoardLoading: boolean;
  realtimeSyncState: 'disabled' | 'live' | 'degraded';
  selectBoard: (boardId: string) => void;
  createBoard: (name: string) => Promise<void>;
  renameBoardById: (boardId: string, name: string) => Promise<void>;
  duplicateBoardById: (boardId: string, name?: string) => Promise<void>;
  deleteBoardById: (boardId: string) => Promise<void>;
  renameActiveBoard: (name: string) => Promise<void>;
  duplicateActiveBoard: (name?: string) => Promise<void>;
  deleteActiveBoard: () => Promise<void>;
  saveActiveBoardNow: () => Promise<void>;
  copyBoardLink: () => Promise<void>;
  inviteMemberByEmail: (email: string, role: 'editor' | 'viewer') => Promise<void>;
  remoteEditingByRow: Record<string, { userId: string; label: string; ts: number }>;
  remoteEditingByColumn: Record<string, { userId: string; label: string; ts: number }>;
  announceEditingPresence: (rowId: string | null, columnId?: string | null) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const persisted = loadPersistedState();
  const initialState: AppState = { ...DEFAULT_STATE, ...persisted };
  const envBoardId = import.meta.env.VITE_SUPABASE_BOARD_ID;
  const lastBoardId = typeof window !== 'undefined' ? loadLastBoardId() : null;
  const urlBoardId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('board')
    : null;

  const [historyState, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialState,
    future: [],
  });
  const [activeBoardId, setActiveBoardId] = useState<string | null>(urlBoardId || envBoardId || lastBoardId || null);
  const hasLoadedCloudRef = useRef(false);
  const [isBoardLoading, setIsBoardLoading] = useState(() => isSupabaseConfigured && !!(urlBoardId || envBoardId));
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [activeBoardRole, setActiveBoardRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [realtimeSyncState, setRealtimeSyncState] = useState<'disabled' | 'live' | 'degraded'>('disabled');
  const saveTimerRef = useRef<number | null>(null);
  const realtimeReloadTimerRef = useRef<number | null>(null);
  const realtimeRequestSeqRef = useRef(0);
  const realtimeAppliedSeqRef = useRef(0);
  const ignoreRealtimeUntilRef = useRef<number>(0);
  const realtimeChannelRef = useRef<any>(null);
  const [remoteEditingByRow, setRemoteEditingByRow] = useState<Record<string, { userId: string; label: string; ts: number }>>({});
  const [remoteEditingByColumn, setRemoteEditingByColumn] = useState<Record<string, { userId: string; label: string; ts: number }>>({});
  const [versionHistory, setVersionHistory] = useState<VersionSnapshotStored[]>([]);
  const [versionHistorySync, setVersionHistorySync] = useState<'cloud' | 'local'>('local');
  const lastAutoSnapshotAtRef = useRef<number>(0);
  const hasUnsavedChangesRef = useRef<boolean>(false);
  const localRevisionRef = useRef<number>(0);
  const lastSyncedRevisionRef = useRef<number>(0);

  const state = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const undoCount = historyState.past.length;
  const canEditActiveBoard = !isSupabaseConfigured || !user || activeBoardRole !== 'viewer';
  const versionHistoryUi = useMemo(
    () => versionHistory.map((v) => ({
      id: v.id,
      createdAt: v.createdAt,
      createdById: v.createdById,
      createdByLabel: v.createdByLabel,
      reason: v.reason,
      projectCount: v.projectCount,
      changedProjects: v.changedProjects,
    })),
    [versionHistory]
  );

  useEffect(() => {
    hasUnsavedChangesRef.current = state.hasUnsavedChanges;
  }, [state.hasUnsavedChanges]);

  const guardedDispatch = useCallback<React.Dispatch<AppAction | { type: 'UNDO' } | { type: 'REDO' }>>(
    (action) => {
      const mutatingActionTypes = new Set([
        'UPDATE_PROJECT',
        'BULK_UPDATE_PROJECTS',
        'ADD_PROJECT',
        'DELETE_PROJECT',
        'REORDER_PROJECTS',
        'UPDATE_HIERARCHY',
        'TOGGLE_EXPANSION',
      ]);
      if ('type' in action && mutatingActionTypes.has(action.type) && !canEditActiveBoard) return;
      if ('type' in action && mutatingActionTypes.has(action.type)) {
        localRevisionRef.current += 1;
      }
      dispatch(action);
    },
    [canEditActiveBoard]
  );

  const createVersionSnapshot = useCallback((reason = 'Snapshot manual') => {
    if (!activeBoardId) return;
    const fingerprint = buildSnapshotFingerprint(state.projects, state.projectOrder);
    setVersionHistory((prev) => {
      const latest = prev[0] || null;
      if (latest?.fingerprint === fingerprint) return prev;
      const entry: VersionSnapshotStored = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        createdById: user?.id || null,
        createdByLabel: (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Local',
        reason,
        projectCount: state.projects.length,
        changedProjects: estimateChangedProjects(latest, state.projects, state.projectOrder),
        fingerprint,
        projects: state.projects.map((p) => ({ ...p })),
        projectOrder: [...state.projectOrder],
      };
      const next = [entry, ...prev].slice(0, MAX_VERSION_HISTORY);
      persistVersionHistory(activeBoardId, next);
      if (isSupabaseConfigured && supabase && user) {
        void insertBoardVersionRow({
          boardId: activeBoardId,
          createdBy: user.id,
          createdByLabel: entry.createdByLabel,
          reason: entry.reason,
          projectCount: entry.projectCount,
          changedProjects: entry.changedProjects,
          fingerprint: entry.fingerprint,
          payload: {
            projects: entry.projects,
            projectOrder: entry.projectOrder,
          },
        }).catch(() => {
          // ignore remote version persistence errors; local history still works
          setVersionHistorySync('local');
        });
      }
      return next;
    });
  }, [activeBoardId, state.projects, state.projectOrder, user]);

  const restoreVersionSnapshot = useCallback(async (versionId: string): Promise<boolean> => {
    if (!canEditActiveBoard) return false;
    const target = versionHistory.find((v) => v.id === versionId);
    if (!target) return false;
    dispatch({
      type: 'SET_PROJECTS',
      payload: {
        projects: target.projects.map((p) => restoreProjectDates({ ...p })),
        fileName: `Version: ${target.reason}`,
      },
    });
    dispatch({ type: 'REORDER_PROJECTS', payload: [...target.projectOrder] });
    return true;
  }, [canEditActiveBoard, versionHistory]);

  const getVersionSnapshot = useCallback((versionId: string) => {
    const target = versionHistory.find((v) => v.id === versionId);
    if (!target) return null;
    return {
      id: target.id,
      createdAt: target.createdAt,
      createdByLabel: target.createdByLabel,
      reason: target.reason,
      projectCount: target.projectCount,
      changedProjects: target.changedProjects,
      projects: target.projects.map((p) => restoreProjectDates({ ...p })),
      projectOrder: [...target.projectOrder],
    };
  }, [versionHistory]);

  useEffect(() => {
    if (!activeBoardId || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('board') === activeBoardId) return;
    url.searchParams.set('board', activeBoardId);
    window.history.replaceState({}, '', url.toString());
  }, [activeBoardId]);

  useEffect(() => {
    setDateDisplayFormat(state.config.dateFormat);
  }, [state.config.dateFormat]);

  useEffect(() => {
    persistLastBoardId(activeBoardId);
  }, [activeBoardId]);

  useEffect(() => {
    const local = loadVersionHistory(activeBoardId);
    setVersionHistory(local);
    setVersionHistorySync('local');
    if (!activeBoardId || !isSupabaseConfigured || !supabase || !user) return;
    let cancelled = false;
    void loadBoardVersionRows(activeBoardId)
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        const mapped: VersionSnapshotStored[] = rows.map((row) => {
          const payload = (row.payload || {}) as { projects?: Project[]; projectOrder?: string[] };
          return {
            id: row.id,
            createdAt: row.created_at,
            createdById: row.created_by,
            createdByLabel: row.created_by_label || 'Usuario',
            reason: row.reason || 'Snapshot',
            projectCount: Number(row.project_count || 0),
            changedProjects: Number(row.changed_projects || 0),
            fingerprint: row.fingerprint || '',
            projects: (payload.projects || []).map((p) => restoreProjectDates(p)),
            projectOrder: Array.isArray(payload.projectOrder) ? payload.projectOrder : [],
          };
        });
        setVersionHistory(mapped);
        persistVersionHistory(activeBoardId, mapped);
        setVersionHistorySync('cloud');
      })
      .catch(() => {
        // ignore; local history remains available
        setVersionHistorySync('local');
      });
    return () => {
      cancelled = true;
    };
  }, [activeBoardId, user]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user || !activeBoardId) {
      setActiveBoardRole(null);
      return;
    }
    const sb = supabase;
    let cancelled = false;
    const run = async () => {
      const { data: boardRow, error: boardErr } = await sb
        .from('boards')
        .select('workspace_id,created_by')
        .eq('id', activeBoardId)
        .maybeSingle();
      if (cancelled) return;
      if (boardErr) {
        setActiveBoardRole(null);
        return;
      }
      const workspaceId = boardRow?.workspace_id as string | undefined;
      const createdBy = boardRow?.created_by as string | undefined;
      if (createdBy && createdBy === user.id) {
        setActiveBoardRole('owner');
        return;
      }
      if (!workspaceId) {
        setActiveBoardRole(null);
        return;
      }
      const { data: membership } = await sb
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = membership?.role as 'owner' | 'editor' | 'viewer' | undefined;
      setActiveBoardRole(role || null);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeBoardId, user]);

  const refreshBoards = useMemo(
    () => async (workspaceIdHint?: string) => {
      if (!supabase || !user) return;

      let workspaceIds: string[] = [];
      if (workspaceIdHint) {
        workspaceIds = [workspaceIdHint];
      } else {
        const { data: memberships, error: membershipsError } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id);
        if (membershipsError) throw membershipsError;
        workspaceIds = (memberships || []).map((m) => m.workspace_id as string);
      }

      if (workspaceIds.length === 0) {
        setBoards([]);
        return;
      }

      const { data: boardRows, error: boardsError } = await supabase
        .from('boards')
        .select('id,name')
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: true });

      if (boardsError) throw boardsError;
      setBoards((boardRows || []).map((b) => ({ id: b.id as string, name: (b.name as string) || 'Sin nombre' })));
    },
    [user]
  );

  // Initial cloud load (optional): only when Supabase is configured, board id exists, and user is authenticated.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId) {
      setIsBoardLoading(false);
      return;
    }
    if (authLoading) {
      setIsBoardLoading(true);
      return;
    }
    if (!user) {
      setIsBoardLoading(false);
      return;
    }

    let cancelled = false;
    setIsBoardLoading(true);
    localRevisionRef.current = 0;
    lastSyncedRevisionRef.current = 0;
    const run = async () => {
      try {
        const cloud = await loadBoardProjects(activeBoardId, state.config);
        if (cancelled) return;
        dispatch({
          type: 'SET_PROJECTS',
          payload: { projects: cloud.projects, fileName: 'Supabase' },
        });
        dispatch({ type: 'REORDER_PROJECTS', payload: cloud.projectOrder });
        dispatch({ type: 'MARK_SAVED' });
        lastSyncedRevisionRef.current = localRevisionRef.current;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Cloud load skipped/failed:', err);
      } finally {
        if (!cancelled) setIsBoardLoading(false);
        hasLoadedCloudRef.current = true;
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeBoardId, user, authLoading, state.config]);

  // Resolve default board and refresh board list after login.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || authLoading || !user) return;
    const sb = supabase;
    let cancelled = false;
    const run = async () => {
      try {
        const resolved = await ensureDefaultWorkspaceBoard(user);
        if (cancelled) return;
        if (!activeBoardId) setActiveBoardId(resolved);

        const { data: board } = await sb
          .from('boards')
          .select('workspace_id')
          .eq('id', resolved)
          .maybeSingle();
        const workspaceId = board?.workspace_id as string | undefined;
        await refreshBoards(workspaceId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Board bootstrap failed:', err);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, activeBoardId, refreshBoards]);

  // Keep an active board selected whenever board list is available.
  useEffect(() => {
    if (boards.length === 0) return;
    if (!activeBoardId || !boards.some((b) => b.id === activeBoardId)) {
      const persistedBoardId = loadLastBoardId();
      const nextBoardId = (persistedBoardId && boards.some((b) => b.id === persistedBoardId))
        ? persistedBoardId
        : boards[0].id;
      hasLoadedCloudRef.current = false;
      setIsBoardLoading(true);
      setActiveBoardId(nextBoardId);
    }
  }, [boards, activeBoardId]);

  // Autosave to cloud when project data changes.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) return;
    if (!canEditActiveBoard) return;
    if (!hasLoadedCloudRef.current || !state.hasUnsavedChanges) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        ignoreRealtimeUntilRef.current = Date.now() + 2000;
        await saveBoardProjects(activeBoardId, state.projects, state.projectOrder);
        if (Date.now() - lastAutoSnapshotAtRef.current > 90_000) {
          createVersionSnapshot('Auto-guardado');
          lastAutoSnapshotAtRef.current = Date.now();
        }
        dispatch({ type: 'MARK_SAVED' });
        lastSyncedRevisionRef.current = localRevisionRef.current;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Cloud save failed:', err);
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeBoardId, user, canEditActiveBoard, state.projects, state.projectOrder, state.hasUnsavedChanges, createVersionSnapshot]);

  // Realtime sync: refresh board when tasks change from other tabs/users.
  const syncBoardFromCloud = useMemo(
    () => async () => {
      if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) return;
      if (Date.now() < ignoreRealtimeUntilRef.current) return;
      // Never pull remote snapshots over local in-progress edits.
      if (hasUnsavedChangesRef.current) return;
      // If local revision has not been acknowledged by a successful save yet, skip remote apply.
      if (localRevisionRef.current !== lastSyncedRevisionRef.current) return;
      const requestSeq = ++realtimeRequestSeqRef.current;
      try {
        const cloud = await loadBoardProjects(activeBoardId, state.config);
        if (requestSeq < realtimeAppliedSeqRef.current) return;
        realtimeAppliedSeqRef.current = requestSeq;
        dispatch({
          type: 'SET_PROJECTS',
          payload: { projects: cloud.projects, fileName: 'Supabase' },
        });
        dispatch({ type: 'REORDER_PROJECTS', payload: cloud.projectOrder });
        dispatch({ type: 'MARK_SAVED' });
        lastSyncedRevisionRef.current = localRevisionRef.current;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Cloud sync failed:', err);
      }
    },
    [activeBoardId, user, state.config]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) {
      setRealtimeSyncState('disabled');
      return;
    }
    const sb = supabase;
    setRealtimeSyncState('degraded');

    const scheduleRealtimeReload = () => {
      if (realtimeReloadTimerRef.current) window.clearTimeout(realtimeReloadTimerRef.current);
      realtimeReloadTimerRef.current = window.setTimeout(() => {
        void syncBoardFromCloud();
      }, 120);
    };

    const channel = sb
      .channel(`tasks-board-${activeBoardId}`)
      .on('broadcast', { event: 'row-editing' }, ({ payload }) => {
        const p = payload as { rowId?: string | null; columnId?: string | null; userId?: string; label?: string; ts?: number } | null;
        const remoteUserId = p?.userId;
        if (!remoteUserId || remoteUserId === user.id) return;
        setRemoteEditingByRow((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            if (next[k]?.userId === remoteUserId) delete next[k];
          });
          if (p.rowId) {
            next[p.rowId] = {
              userId: remoteUserId,
              label: p.label || 'Usuario',
              ts: p.ts || Date.now(),
            };
          }
          return next;
        });
        setRemoteEditingByColumn((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            if (next[k]?.userId === remoteUserId) delete next[k];
          });
          if (p.columnId) {
            next[p.columnId] = {
              userId: remoteUserId,
              label: p.label || 'Usuario',
              ts: p.ts || Date.now(),
            };
          }
          return next;
        });
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `board_id=eq.${activeBoardId}`,
        },
        async () => { scheduleRealtimeReload(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeSyncState('live');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeSyncState('degraded');
        }
      });
    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
      sb.removeChannel(channel);
    };
  }, [activeBoardId, user, syncBoardFromCloud]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setRemoteEditingByRow((prev) => {
        let changed = false;
        const next: Record<string, { userId: string; label: string; ts: number }> = {};
        Object.entries(prev).forEach(([rowId, data]) => {
          if (now - data.ts < 12000) next[rowId] = data;
          else changed = true;
        });
        return changed ? next : prev;
      });
      setRemoteEditingByColumn((prev) => {
        let changed = false;
        const next: Record<string, { userId: string; label: string; ts: number }> = {};
        Object.entries(prev).forEach(([colId, data]) => {
          if (now - data.ts < 12000) next[colId] = data;
          else changed = true;
        });
        return changed ? next : prev;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) return;
    const onFocus = async () => {
      await syncBoardFromCloud();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeBoardId, user, syncBoardFromCloud]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) return;
    if (realtimeSyncState === 'live') return;
    const id = window.setInterval(() => {
      void syncBoardFromCloud();
    }, 12000);
    return () => window.clearInterval(id);
  }, [activeBoardId, user, realtimeSyncState, syncBoardFromCloud]);

  const selectBoard = useMemo(
    () => (boardId: string) => {
      if (!boardId || boardId === activeBoardId) return;
      hasLoadedCloudRef.current = false;
      setIsBoardLoading(true);
      setActiveBoardId(boardId);
    },
    [activeBoardId]
  );

  const createBoard = useMemo(
    () => async (name: string) => {
      if (!supabase || !user) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;
      const trimmed = name.trim();
      if (!trimmed) return;

      let workspaceId: string | null = null;
      const currentBoard = boards.find((b) => b.id === activeBoardId);
      if (currentBoard) {
        const { data: boardRow } = await sb
          .from('boards')
          .select('workspace_id')
          .eq('id', currentBoard.id)
          .maybeSingle();
        workspaceId = (boardRow?.workspace_id as string | undefined) ?? null;
      }
      if (!workspaceId) {
        const { data: memberships } = await sb
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1);
        workspaceId = (memberships?.[0]?.workspace_id as string | undefined) ?? null;
      }
      if (!workspaceId) {
        const fallbackBoardId = await ensureDefaultWorkspaceBoard(user);
        const { data: fallbackBoard, error: fallbackBoardErr } = await sb
          .from('boards')
          .select('workspace_id')
          .eq('id', fallbackBoardId)
          .maybeSingle();
        if (fallbackBoardErr) throw fallbackBoardErr;
        workspaceId = (fallbackBoard?.workspace_id as string | undefined) ?? null;
      }
      if (!workspaceId) throw new Error('No se pudo resolver el workspace para crear tablero.');

      const boardId = crypto.randomUUID();
      const { error } = await sb
        .from('boards')
        .insert({ id: boardId, workspace_id: workspaceId, name: trimmed, created_by: user.id });
      if (error) throw error;

      const created = { id: boardId, name: trimmed };
      setBoards((prev) => [...prev, created]);
      // New boards start with a single placeholder row instead of cloning current board data.
      const placeholderBase: Project = {
        id: `proj-new-${Date.now()}`,
        name: 'Proyecto de prueba',
        branch: [],
        startDate: null,
        endDate: null,
        assignees: [],
        daysRequired: 0,
        priority: 0,
        type: 'Proyecto',
        blockedBy: null,
        blocksTo: null,
        reportedLoad: null,
        parentId: null,
        isExpanded: true,
        hierarchyLevel: 0,
        assignedDays: 0,
        balanceDays: 0,
        dailyLoad: 0,
        totalHours: 0,
      };
      const placeholder = computeProjectFields(placeholderBase, state.config, [placeholderBase]);
      ignoreRealtimeUntilRef.current = Date.now() + 2000;
      await saveBoardProjects(boardId, [placeholder], [placeholder.id]);
      hasLoadedCloudRef.current = false;
      setActiveBoardId(created.id);
      await refreshBoards(workspaceId);
    },
    [activeBoardId, boards, user, canEditActiveBoard, refreshBoards, state.projects, state.projectOrder]
  );

  const copyBoardLink = useMemo(
    () => async () => {
      if (!activeBoardId || typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('board', activeBoardId);
      await navigator.clipboard.writeText(url.toString());
    },
    [activeBoardId]
  );

  const saveActiveBoardNow = useMemo(
    () => async () => {
      if (!supabase || !user || !activeBoardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      ignoreRealtimeUntilRef.current = Date.now() + 2000;
      await saveBoardProjects(activeBoardId, state.projects, state.projectOrder);
      createVersionSnapshot('Guardado manual');
      dispatch({ type: 'MARK_SAVED' });
      lastSyncedRevisionRef.current = localRevisionRef.current;
    },
    [activeBoardId, user, canEditActiveBoard, state.projects, state.projectOrder, createVersionSnapshot]
  );

  const renameActiveBoard = useMemo(
    () => async (name: string) => {
      if (!supabase || !user || !activeBoardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;
      const trimmed = name.trim();
      if (!trimmed) return;

      const { error } = await sb.from('boards').update({ name: trimmed }).eq('id', activeBoardId);
      if (error) throw error;

      setBoards((prev) => prev.map((b) => (b.id === activeBoardId ? { ...b, name: trimmed } : b)));
    },
    [activeBoardId, user, canEditActiveBoard]
  );

  const renameBoardById = useMemo(
    () => async (boardId: string, name: string) => {
      if (!supabase || !user || !boardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;
      const trimmed = name.trim();
      if (!trimmed) return;

      const { error } = await sb.from('boards').update({ name: trimmed }).eq('id', boardId);
      if (error) throw error;
      setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name: trimmed } : b)));
    },
    [user, canEditActiveBoard]
  );

  const duplicateActiveBoard = useMemo(
    () => async (name?: string) => {
      if (!supabase || !user || !activeBoardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;
      const source = boards.find((b) => b.id === activeBoardId);

      const { data: sourceBoard, error: sourceErr } = await sb
        .from('boards')
        .select('workspace_id,name')
        .eq('id', activeBoardId)
        .maybeSingle();
      if (sourceErr) throw sourceErr;

      const workspaceId = sourceBoard?.workspace_id as string | undefined;
      if (!workspaceId) throw new Error('No se encontró workspace del tablero actual.');

      const newBoardId = crypto.randomUUID();
      const duplicateName = (name?.trim() || `${source?.name || sourceBoard?.name || 'Tablero'} (copia)`).trim();
      const { error: createErr } = await sb.from('boards').insert({
        id: newBoardId,
        workspace_id: workspaceId,
        name: duplicateName,
        created_by: user.id,
      });
      if (createErr) throw createErr;

      ignoreRealtimeUntilRef.current = Date.now() + 2000;
      await saveBoardProjects(newBoardId, state.projects, state.projectOrder);
      await refreshBoards(workspaceId);
      hasLoadedCloudRef.current = false;
      setActiveBoardId(newBoardId);
    },
    [activeBoardId, boards, user, canEditActiveBoard, state.projects, state.projectOrder, refreshBoards]
  );

  const duplicateBoardById = useMemo(
    () => async (boardId: string, name?: string) => {
      if (!supabase || !user || !boardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;

      const { data: sourceBoard, error: sourceErr } = await sb
        .from('boards')
        .select('workspace_id,name')
        .eq('id', boardId)
        .maybeSingle();
      if (sourceErr) throw sourceErr;
      const workspaceId = sourceBoard?.workspace_id as string | undefined;
      if (!workspaceId) throw new Error('No se encontró workspace del tablero origen.');

      const newBoardId = crypto.randomUUID();
      const duplicateName = (name?.trim() || `${(sourceBoard?.name as string | undefined) || 'Tablero'} (copia)`).trim();
      const { error: createErr } = await sb.from('boards').insert({
        id: newBoardId,
        workspace_id: workspaceId,
        name: duplicateName,
        created_by: user.id,
      });
      if (createErr) throw createErr;

      const cloud = boardId === activeBoardId
        ? { projects: state.projects, projectOrder: state.projectOrder }
        : await loadBoardProjects(boardId, state.config);
      ignoreRealtimeUntilRef.current = Date.now() + 2000;
      await saveBoardProjects(newBoardId, cloud.projects, cloud.projectOrder);

      await refreshBoards(workspaceId);
      hasLoadedCloudRef.current = false;
      setActiveBoardId(newBoardId);
    },
    [activeBoardId, user, canEditActiveBoard, state.projects, state.projectOrder, state.config, refreshBoards]
  );

  const deleteActiveBoard = useMemo(
    () => async () => {
      if (!supabase || !user || !activeBoardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;
      const currentId = activeBoardId;

      const { data: boardRow, error: boardErr } = await sb
        .from('boards')
        .select('workspace_id')
        .eq('id', currentId)
        .maybeSingle();
      if (boardErr) throw boardErr;

      const workspaceId = boardRow?.workspace_id as string | undefined;
      if (!workspaceId) throw new Error('No se encontró workspace del tablero a eliminar.');

      const { data: boardRows, error: listErr } = await sb
        .from('boards')
        .select('id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });
      if (listErr) throw listErr;
      if ((boardRows || []).length <= 1) {
        throw new Error('Debes conservar al menos un tablero.');
      }

      const nextId = (boardRows || []).map((r) => r.id as string).find((id) => id !== currentId) || null;
      const { error: deleteErr } = await sb.from('boards').delete().eq('id', currentId);
      if (deleteErr) throw deleteErr;

      await refreshBoards(workspaceId);
      hasLoadedCloudRef.current = false;
      if (nextId) setActiveBoardId(nextId);
    },
    [activeBoardId, user, canEditActiveBoard, refreshBoards]
  );

  const deleteBoardById = useMemo(
    () => async (boardId: string) => {
      if (!supabase || !user || !boardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;

      const { data: boardRow, error: boardErr } = await sb
        .from('boards')
        .select('workspace_id')
        .eq('id', boardId)
        .maybeSingle();
      if (boardErr) throw boardErr;

      const workspaceId = boardRow?.workspace_id as string | undefined;
      if (!workspaceId) throw new Error('No se encontró workspace del tablero a eliminar.');

      const { data: boardRows, error: listErr } = await sb
        .from('boards')
        .select('id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });
      if (listErr) throw listErr;
      if ((boardRows || []).length <= 1) {
        throw new Error('Debes conservar al menos un tablero.');
      }

      const nextId = (boardRows || []).map((r) => r.id as string).find((id) => id !== boardId) || null;
      const { error: deleteErr } = await sb.from('boards').delete().eq('id', boardId);
      if (deleteErr) throw deleteErr;

      await refreshBoards(workspaceId);
      hasLoadedCloudRef.current = false;
      if (activeBoardId === boardId && nextId) setActiveBoardId(nextId);
    },
    [activeBoardId, user, canEditActiveBoard, refreshBoards]
  );

  const inviteMemberByEmail = useMemo(
    () => async (email: string, role: 'editor' | 'viewer') => {
      if (!supabase || !user || !activeBoardId) return;
      if (!canEditActiveBoard) throw new Error('No tienes permisos de edición en este tablero.');
      const sb = supabase;
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return;

      const { data: boardRow, error: boardErr } = await sb
        .from('boards')
        .select('workspace_id')
        .eq('id', activeBoardId)
        .maybeSingle();
      if (boardErr) throw boardErr;
      const workspaceId = boardRow?.workspace_id as string | undefined;
      if (!workspaceId) throw new Error('No se encontró el workspace del tablero.');

      const { data: profile, error: profileErr } = await sb
        .from('profiles')
        .select('id,email')
        .ilike('email', trimmed)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile?.id) throw new Error('No se encontró usuario con ese correo.');

      const { error: memberErr } = await sb.from('workspace_members').upsert(
        {
          workspace_id: workspaceId,
          user_id: profile.id as string,
          role,
        },
        { onConflict: 'workspace_id,user_id' }
      );
      if (memberErr) throw memberErr;
    },
    [activeBoardId, user, canEditActiveBoard]
  );

  const announceEditingPresence = useMemo(
    () => (rowId: string | null, columnId?: string | null) => {
      const channel = realtimeChannelRef.current;
      if (!channel || !user) return;
      const label = (user.user_metadata?.full_name as string | undefined) || user.email || 'Usuario';
      channel.send({
        type: 'broadcast',
        event: 'row-editing',
        payload: {
          rowId,
          columnId: columnId || null,
          userId: user.id,
          label,
          ts: Date.now(),
        },
      });
    },
    [user]
  );

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

  // Persist expand/collapse map separately so it survives reloads and imports
  useEffect(() => {
    try {
      const map: Record<string, boolean> = {};
      state.projects.forEach(p => {
        if (p.id) map[p.id] = !!p.isExpanded;
      });
      localStorage.setItem('workload-dashboard-expanded', JSON.stringify(map));
    } catch {
      // ignore
    }
  }, [state.projects]);

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
    () => applyFilters(state.projects, state.filters, state.config),
    [state.projects, state.filters, state.config]
  );

  // Order filtered projects by projectOrder
  const orderedFilteredProjects = useMemo(() => {
    if (!state.projectOrder || state.projectOrder.length === 0) return filteredProjects;
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
    dispatch: guardedDispatch,
    filteredProjects,
    orderedFilteredProjects,
    allPersons,
    allBranches,
    dateRange,
    workloadData,
    canUndo,
    canRedo,
    undoCount,
    versionHistory: versionHistoryUi,
    createVersionSnapshot,
    restoreVersionSnapshot,
    getVersionSnapshot,
    versionHistorySync,
    boards,
    activeBoardId,
    activeBoardRole,
    canEditActiveBoard,
    isBoardLoading,
    realtimeSyncState,
    selectBoard,
    createBoard,
    renameBoardById,
    duplicateBoardById,
    deleteBoardById,
    renameActiveBoard,
    duplicateActiveBoard,
    deleteActiveBoard,
    saveActiveBoardNow,
    copyBoardLink,
    inviteMemberByEmail,
    remoteEditingByRow,
    remoteEditingByColumn,
    announceEditingPresence,
  }), [
    state,
    guardedDispatch,
    filteredProjects,
    orderedFilteredProjects,
    allPersons,
    allBranches,
    dateRange,
    workloadData,
    canUndo,
    canRedo,
    undoCount,
    versionHistoryUi,
    createVersionSnapshot,
    restoreVersionSnapshot,
    getVersionSnapshot,
    versionHistorySync,
    boards,
    activeBoardId,
    activeBoardRole,
    canEditActiveBoard,
    isBoardLoading,
    realtimeSyncState,
    selectBoard,
    createBoard,
    renameBoardById,
    duplicateBoardById,
    deleteBoardById,
    renameActiveBoard,
    duplicateActiveBoard,
    deleteActiveBoard,
    saveActiveBoardNow,
    copyBoardLink,
    inviteMemberByEmail,
    remoteEditingByRow,
    remoteEditingByColumn,
    announceEditingPresence,
  ]);

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
