import React, { createContext, useContext, useReducer, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, AppAction, Project } from '@/lib/types';
import { DEFAULT_STATE, DEFAULT_FILTERS } from '@/lib/constants';
import { calculateDailyWorkload, applyFilters, getPersons, getBranches, getActiveProjects, computeProjectFields } from '@/lib/workloadEngine';
import { getDateRange } from '@/lib/dateUtils';
import { validateNoCircles, aggregateFromChildren, calculateHierarchyLevel } from '@/lib/hierarchyEngine';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { loadBoardProjects, saveBoardProjects } from '@/lib/cloudBoardRepository';
import { ensureDefaultWorkspaceBoard } from '@/lib/cloudBootstrap';
import { useAuth } from '@/context/AuthContext';

const MAX_HISTORY = 50;

interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

// Check if action modifies project data (should be tracked in history)
function isUndoableAction(action: AppAction): boolean {
  return ['UPDATE_PROJECT', 'ADD_PROJECT', 'DELETE_PROJECT', 'REORDER_PROJECTS', 'UPDATE_HIERARCHY', 'TOGGLE_EXPANSION'].includes(action.type);
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
    case 'ADD_PROJECT': {
      let projects = [...state.projects, action.payload];
      const projectOrder = [...state.projectOrder, action.payload.id];
      projects = projects.map(p => ({ ...p, hierarchyLevel: calculateHierarchyLevel(p.id, projects) }));
      return { ...state, projects, projectOrder, hasUnsavedChanges: true };
    }
    case 'DELETE_PROJECT': {
      let projects = state.projects.filter(p => p.id !== action.payload);
      const projectOrder = state.projectOrder.filter(id => id !== action.payload);
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
  boards: { id: string; name: string }[];
  activeBoardId: string | null;
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
  announceEditingRow: (rowId: string | null) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const persisted = loadPersistedState();
  const initialState: AppState = { ...DEFAULT_STATE, ...persisted };
  const envBoardId = import.meta.env.VITE_SUPABASE_BOARD_ID;
  const urlBoardId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('board')
    : null;

  const [historyState, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialState,
    future: [],
  });
  const [activeBoardId, setActiveBoardId] = useState<string | null>(urlBoardId || envBoardId || null);
  const hasLoadedCloudRef = useRef(false);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const ignoreRealtimeUntilRef = useRef<number>(0);
  const realtimeChannelRef = useRef<any>(null);
  const [remoteEditingByRow, setRemoteEditingByRow] = useState<Record<string, { userId: string; label: string; ts: number }>>({});

  const state = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const undoCount = historyState.past.length;

  useEffect(() => {
    if (!activeBoardId || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('board') === activeBoardId) return;
    url.searchParams.set('board', activeBoardId);
    window.history.replaceState({}, '', url.toString());
  }, [activeBoardId]);

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
    if (!isSupabaseConfigured || !supabase || !user || !activeBoardId) return;

    let cancelled = false;
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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Cloud load skipped/failed:', err);
      } finally {
        hasLoadedCloudRef.current = true;
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeBoardId, user, state.config]);

  // Resolve default board and refresh board list after login.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user) return;
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
  }, [user, activeBoardId, refreshBoards]);

  // Keep an active board selected whenever board list is available.
  useEffect(() => {
    if (boards.length === 0) return;
    if (!activeBoardId || !boards.some((b) => b.id === activeBoardId)) {
      hasLoadedCloudRef.current = false;
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  // Autosave to cloud when project data changes.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) return;
    if (!hasLoadedCloudRef.current || !state.hasUnsavedChanges) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        ignoreRealtimeUntilRef.current = Date.now() + 2000;
        await saveBoardProjects(activeBoardId, state.projects, state.projectOrder);
        dispatch({ type: 'MARK_SAVED' });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Cloud save failed:', err);
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeBoardId, user, state.projects, state.projectOrder, state.hasUnsavedChanges]);

  // Realtime sync: refresh board when tasks change from other tabs/users.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !activeBoardId || !user) return;
    const sb = supabase;

    const channel = sb
      .channel(`tasks-board-${activeBoardId}`)
      .on('broadcast', { event: 'row-editing' }, ({ payload }) => {
        const p = payload as { rowId?: string | null; userId?: string; label?: string; ts?: number } | null;
        if (!p?.userId || p.userId === user.id) return;
        setRemoteEditingByRow((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            if (next[k]?.userId === p.userId) delete next[k];
          });
          if (p.rowId) {
            next[p.rowId] = {
              userId: p.userId,
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
        async () => {
          if (Date.now() < ignoreRealtimeUntilRef.current) return;
          try {
            const cloud = await loadBoardProjects(activeBoardId, state.config);
            dispatch({
              type: 'SET_PROJECTS',
              payload: { projects: cloud.projects, fileName: 'Supabase' },
            });
            dispatch({ type: 'REORDER_PROJECTS', payload: cloud.projectOrder });
            dispatch({ type: 'MARK_SAVED' });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('Realtime sync failed:', err);
          }
        }
      )
      .subscribe();
    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
      sb.removeChannel(channel);
    };
  }, [activeBoardId, user, state.config]);

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
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const selectBoard = useMemo(
    () => (boardId: string) => {
      if (!boardId || boardId === activeBoardId) return;
      hasLoadedCloudRef.current = false;
      setActiveBoardId(boardId);
    },
    [activeBoardId]
  );

  const createBoard = useMemo(
    () => async (name: string) => {
      if (!supabase || !user) return;
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
      // New boards start with a copy of current local state so shared links open meaningful content immediately.
      ignoreRealtimeUntilRef.current = Date.now() + 2000;
      await saveBoardProjects(boardId, state.projects, state.projectOrder);
      hasLoadedCloudRef.current = false;
      setActiveBoardId(created.id);
      await refreshBoards(workspaceId);
    },
    [activeBoardId, boards, user, refreshBoards, state.projects, state.projectOrder]
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
      ignoreRealtimeUntilRef.current = Date.now() + 2000;
      await saveBoardProjects(activeBoardId, state.projects, state.projectOrder);
      dispatch({ type: 'MARK_SAVED' });
    },
    [activeBoardId, user, state.projects, state.projectOrder]
  );

  const renameActiveBoard = useMemo(
    () => async (name: string) => {
      if (!supabase || !user || !activeBoardId) return;
      const sb = supabase;
      const trimmed = name.trim();
      if (!trimmed) return;

      const { error } = await sb.from('boards').update({ name: trimmed }).eq('id', activeBoardId);
      if (error) throw error;

      setBoards((prev) => prev.map((b) => (b.id === activeBoardId ? { ...b, name: trimmed } : b)));
    },
    [activeBoardId, user]
  );

  const renameBoardById = useMemo(
    () => async (boardId: string, name: string) => {
      if (!supabase || !user || !boardId) return;
      const sb = supabase;
      const trimmed = name.trim();
      if (!trimmed) return;

      const { error } = await sb.from('boards').update({ name: trimmed }).eq('id', boardId);
      if (error) throw error;
      setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name: trimmed } : b)));
    },
    [user]
  );

  const duplicateActiveBoard = useMemo(
    () => async (name?: string) => {
      if (!supabase || !user || !activeBoardId) return;
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
    [activeBoardId, boards, user, state.projects, state.projectOrder, refreshBoards]
  );

  const duplicateBoardById = useMemo(
    () => async (boardId: string, name?: string) => {
      if (!supabase || !user || !boardId) return;
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
    [activeBoardId, user, state.projects, state.projectOrder, state.config, refreshBoards]
  );

  const deleteActiveBoard = useMemo(
    () => async () => {
      if (!supabase || !user || !activeBoardId) return;
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
    [activeBoardId, user, refreshBoards]
  );

  const deleteBoardById = useMemo(
    () => async (boardId: string) => {
      if (!supabase || !user || !boardId) return;
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
    [activeBoardId, user, refreshBoards]
  );

  const inviteMemberByEmail = useMemo(
    () => async (email: string, role: 'editor' | 'viewer') => {
      if (!supabase || !user || !activeBoardId) return;
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
    [activeBoardId, user]
  );

  const announceEditingRow = useMemo(
    () => (rowId: string | null) => {
      const channel = realtimeChannelRef.current;
      if (!channel || !user) return;
      const label = (user.user_metadata?.full_name as string | undefined) || user.email || 'Usuario';
      channel.send({
        type: 'broadcast',
        event: 'row-editing',
        payload: {
          rowId,
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
    boards,
    activeBoardId,
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
    announceEditingRow,
  }), [
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
    boards,
    activeBoardId,
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
    announceEditingRow,
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
