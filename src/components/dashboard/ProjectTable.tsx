import { Fragment, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { useUiFeedback } from '@/context/UiFeedbackContext';
import { usePersonProfiles } from '@/context/PersonProfilesContext';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { formatDateShort, format, isValidDateValue } from '@/lib/dateUtils';
import { exportToExcel, copyAsCSV } from '@/lib/exportUtils';
import { validateNoCircles, getCollapsedMetricsSummary, getAncestors, getDescendants } from '@/lib/hierarchyEngine';
import {
  Search, ChevronDown, ChevronRight, Plus, Trash2,
  Download, ClipboardCopy, Check, GripVertical, AlertTriangle, Copy, MessageSquare, Star, ArrowRightLeft, ChevronLeft, MoreHorizontal,
} from 'lucide-react';
import type { Project } from '@/lib/types';
import type { DynamicColumn, DynamicCellValue } from '@/lib/types';
import {
  listBoardColumns,
  listTaskColumnValues,
  createBoardColumn,
  updateBoardColumn,
  deleteBoardColumn,
  upsertTaskColumnValue,
  deleteTaskColumnValue,
} from '@/lib/dynamicColumnsRepository';
import { supabase } from '@/lib/supabaseClient';
import { addTaskComment, deleteTaskComment, listTaskComments, type TaskComment } from '@/lib/taskCommentsRepository';
import { loadPersonProfiles, savePersonProfiles } from '@/lib/personProfiles';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Import modular components
import { TableTools } from '@/modules/table/components/TableTools';
import { TableHeader } from '@/modules/table/components/TableHeader';
import { SortableRow } from '@/modules/table/components/SortableRow';
import { TableTreeOverlay } from '@/modules/table/components/TableTreeOverlay';
import { DynamicColumnsDialog } from '@/modules/table/components/DynamicColumnsDialog';
import { CommentsPanel } from '@/modules/table/components/CommentsPanel';

// Import modular hooks
import { useProjectTableState } from '@/modules/table/hooks/useProjectTableState';
import { useProjectTableActions } from '@/modules/table/hooks/useProjectTableActions';
import { useProjectTableHandlers } from '@/modules/table/hooks/useProjectTableHandlers';

type SortKey = keyof Project;
type SortDir = 'asc' | 'desc';
type ColumnKey =
  | 'drag'
  | 'project'
  | 'branch'
  | 'start'
  | 'end'
  | 'assignees'
  | 'days'
  | 'priority'
  | 'type'
  | 'load'
  | 'status';

type ColumnToken = `essential:${EssentialColumnId}` | `dynamic:${string}`;

type EssentialColumnId =
  | 'project'
  | 'branch'
  | 'start'
  | 'end'
  | 'assignees'
  | 'days'
  | 'priority'
  | 'type'
  | 'load'
  | 'status';

type RenderColumn =
  | {
      kind: 'essential';
      token: `essential:${EssentialColumnId}`;
      id: EssentialColumnId;
      label: string;
      sortKey: SortKey;
      widthKey: ColumnKey;
      nonEditableName: true;
    }
  | {
      kind: 'dynamic';
      token: `dynamic:${string}`;
      id: string;
      label: string;
      column: DynamicColumn;
    };

type DynamicDisplayType = DynamicColumn['type'] | 'progress' | 'stars';

const dynamicDisplayLabelEs: Record<DynamicDisplayType, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  select: 'Selección',
  tags: 'Etiquetas',
  checkbox: 'Casilla',
  progress: 'Progreso',
  stars: 'Estrellas',
};

const dedupeTokens = <T extends string>(tokens: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
};

const GROUP_CONVERSION_WARNING_MESSAGE = 'Al convertir este elemento en Grupo se perderán sus datos para pasar a ser resumen su interior. ¿Continuar?';
const INDENT_SIZE_PX = 24;
const MAX_DND_DEPTH = 8;

const normalizeTagList = (tags: string[]): string[] => [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
const hasMeaningfulDynamicValue = (value: DynamicCellValue): boolean => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((v) => String(v).trim().length > 0);
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  return true;
};

// Helper function
const normalizePersonKey = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const normalizeDynamicValue = (column: DynamicColumn, raw: DynamicCellValue): DynamicCellValue => {
  switch (column.type) {
    case 'number': {
      if (raw === null || raw === '') return null;
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'date': {
      if (raw === null || raw === '') return null;
      if (typeof raw !== 'string') return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    }
    case 'select': {
      if (raw === null || raw === '') return null;
      if (typeof raw !== 'string') return null;
      const options = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
      if (options.length === 0) return raw;
      return options.includes(raw) ? raw : null;
    }
    case 'tags': {
      if (raw === null || raw === '') return [];
      if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
      if (typeof raw === 'string') return raw.split(',').map((x) => x.trim()).filter(Boolean);
      return [];
    }
    case 'checkbox':
      return Boolean(raw);
    case 'text':
    default:
      if (raw === null) return '';
      return String(raw);
  }
};

const isValueMismatched = (raw: DynamicCellValue, normalized: DynamicCellValue): boolean => {
  if (Array.isArray(raw) || Array.isArray(normalized)) {
    const a = Array.isArray(raw) ? raw : [];
    const b = Array.isArray(normalized) ? normalized : [];
    if (a.length !== b.length) return true;
    return a.some((v, i) => String(v) !== String(b[i]));
  }
  return raw !== normalized;
};

export function ProjectTable() {
  // Core hooks - siempre al nivel superior
  const { state, dispatch, orderedFilteredProjects, allPersons, allBranches, activeBoardId, remoteEditingByRow, remoteEditingByColumn, announceEditingPresence } = useProject();
  
  // Defensa contra state undefined
  if (!state) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-text-secondary">Cargando...</div>
      </div>
    );
  }
  
  const { user } = useAuth();
  const { confirm, toast } = useUiFeedback();
  const { getAvatarUrl, setAvatar } = usePersonProfiles();
  const tableRootRef = useRef<HTMLDivElement | null>(null);
  
  // Modular hooks - usando la estructura existente
  const tableState = useProjectTableState();
  const tableActions = useProjectTableActions({
    state,
    dispatch,
    setBranchCatalog: tableState.setBranchCatalog,
    setPersonProfiles: tableState.setPersonProfiles,
    setMultiSelectMode: tableState.setMultiSelectMode,
    setSelectedRowIds: tableState.setSelectedRowIds,
    setSelectedRowId: tableState.setSelectedRowId,
    setLastSelectedRowId: tableState.setLastSelectedRowId,
  });
  const tableHandlers = useProjectTableHandlers({
    setColumnMenuOpenFor: tableState.setColumnMenuOpenFor,
    setFixedHeaderMenuOpenFor: tableState.setFixedHeaderMenuOpenFor,
    setCommentsOpen: tableState.setCommentsOpen,
    bulkMenuOpen: tableState.bulkMenuOpen,
    bulkMenuRef: tableState.bulkMenuRef,
    contentScrollRef: tableState.contentScrollRef,
    stickyToolsRef: tableState.stickyToolsRef,
    headerStickyRef: tableState.headerStickyRef,
    rowRefs: tableState.rowRefs,
    resizingColumnRef: tableState.resizingColumnRef,
    dynamicReloadTimerRef: tableState.dynamicReloadTimerRef,
    dynamicRequestSeqRef: tableState.dynamicRequestSeqRef,
    dynamicAppliedSeqRef: tableState.dynamicAppliedSeqRef,
  });

  // Sensors - correctamente al nivel superior
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  // Extraer estado de los hooks modulares
  const {
    sortKey, setSortKey,
    sortDir, setSortDir,
    search, setSearch,
    showRadar, setShowRadar,
    exportToast, setExportToast,
    columnValidationToast, setColumnValidationToast,
    uiToast, setUiToast,
    selectedRowId, setSelectedRowId,
    multiSelectMode, setMultiSelectMode,
    selectedRowIds, setSelectedRowIds,
    lastSelectedRowId, setLastSelectedRowId,
    bulkMenuOpen, setBulkMenuOpen,
    dragPreview, setDragPreview,
    activeScrollRowId, setActiveScrollRowId,
    stickyToolsHeight, setStickyToolsHeight,
    headerStickyHeight, setHeaderStickyHeight,
    dynamicColumns, setDynamicColumns,
    dynamicValues, setDynamicValues,
    columnMenuOpenFor, setColumnMenuOpenFor,
    editingColumnId, setEditingColumnId,
    editingColumnName, setEditingColumnName,
    fixedHeaderMenuOpenFor, setFixedHeaderMenuOpenFor,
    moveCopyColumnId, setMoveCopyColumnId,
    moveCopyTargetId, setMoveCopyTargetId,
    moveCopyQuery, setMoveCopyQuery,
    moveCopyAsCopy, setMoveCopyAsCopy,
    newColumnDialog, setNewColumnDialog,
    commentsTaskId, setCommentsTaskId,
    commentsOpen, setCommentsOpen,
    comments, setComments,
    commentDraft, setCommentDraft,
    linkUrlDraft, setLinkUrlDraft,
    linkTitleDraft, setLinkTitleDraft,
    branchCatalog, setBranchCatalog,
    personProfiles, setPersonProfiles,
    columnWidths, setColumnWidths,
    defaultColumnWidths,
    minColumnWidths,
    maxColumnWidths,
    layoutSeedOrder, setLayoutSeedOrder,
    columnOrder, setColumnOrder,
    groupHintAtRef,
    bulkMenuRef,
    contentScrollRef,
    stickyToolsRef,
    headerStickyRef,
    rowRefs,
    resizingColumnRef,
    dynamicReloadTimerRef,
    dynamicRequestSeqRef,
    dynamicAppliedSeqRef,
  } = tableState;

  // Estado para edición de nombre de proyecto
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [treeOverlayVersion, setTreeOverlayVersion] = useState(0);
  const treeOverlayHostRef = useRef<HTMLDivElement | null>(null);

  const handleStartEditName = useCallback((projectId: string, currentName: string) => {
    setEditingName(projectId);
    setEditNameValue(currentName);
  }, []);

  const handleFinishEditName = useCallback((newName: string) => {
    if (editingName && newName.trim()) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: editingName, updates: { name: newName.trim() } } });
    }
    setEditingName(null);
    setEditNameValue('');
  }, [editingName]);

  const handleCancelEditName = useCallback(() => {
    setEditingName(null);
    setEditNameValue('');
  }, []);

  // Funciones para columnas dinámicas (extraídas del código monolítico)
  const refreshDynamicColumns = useCallback(async () => {
    if (!activeBoardId) {
      setDynamicColumns([]);
      setDynamicValues(new Map());
      dynamicAppliedSeqRef.current = 0;
      dynamicRequestSeqRef.current = 0;
      return;
    }
    const requestSeq = ++dynamicRequestSeqRef.current;
    try {
      const [cols, vals] = await Promise.all([
        listBoardColumns(activeBoardId),
        listTaskColumnValues(activeBoardId),
      ]);
      if (requestSeq < dynamicAppliedSeqRef.current) return;
      dynamicAppliedSeqRef.current = requestSeq;
      setDynamicColumns(cols);
      setDynamicValues(vals);
    } catch (err) {
      console.error('Failed to refresh dynamic columns:', err);
    }
  }, [activeBoardId, setDynamicColumns, setDynamicValues]);

  const handleUpsertDynamicCell = useCallback(async (taskId: string, columnId: string, value: DynamicCellValue) => {
    if (!activeBoardId || !user) return;
    const column = dynamicColumns.find((c) => c.id === columnId);
    if (!column) return;
    
    try {
      await upsertTaskColumnValue({
        boardId: activeBoardId,
        taskId,
        columnId,
        value,
        userId: user.id,
      });
      setDynamicValues((prev) => {
        const next = new Map(prev);
        const taskValues = next.get(taskId) || {};
        next.set(taskId, { ...taskValues, [columnId]: value });
        return next;
      });
    } catch (err) {
      console.error('Dynamic cell save failed:', err);
    }
  }, [activeBoardId, user, dynamicColumns, setDynamicValues]);

  const normalizeDynamicColumnName = useCallback((raw: string) => raw.trim().replace(/\s+/g, ' ').slice(0, 60), []);

  const buildUniqueDynamicColumnName = useCallback((candidate: string, excludeId?: string) => {
    const base = normalizeDynamicColumnName(candidate || 'Nueva columna') || 'Nueva columna';
    const existing = new Set(
      dynamicColumns
        .filter((c) => c.id !== excludeId)
        .map((c) => c.name.trim().toLowerCase())
    );
    if (!existing.has(base.toLowerCase())) return base;
    let i = 2;
    while (existing.has(`${base} ${i}`.toLowerCase())) i += 1;
    return `${base} ${i}`;
  }, [dynamicColumns, normalizeDynamicColumnName]);

  const openCreateDynamicColumnDialog = useCallback((position: number, presetType: DynamicColumn['type'] | 'progress' | 'stars' = 'text') => {
    const initialSuggested = `Nueva ${presetType}`;
    const suggestedName = buildUniqueDynamicColumnName(initialSuggested);
    setNewColumnDialog({
      open: true,
      position,
      name: suggestedName,
      type: presetType,
    });
  }, [buildUniqueDynamicColumnName, setNewColumnDialog]);

  const handleCreateDynamicColumn = useCallback(async (position: number, baseName: string, presetType: DynamicColumn['type'] | 'progress' | 'stars' = 'text') => {
    if (!activeBoardId || !user) return;
    const cleanName = normalizeDynamicColumnName(baseName);
    const name = buildUniqueDynamicColumnName(cleanName || `Nueva ${presetType}`);
    if (!name) return;
    
    const key = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dbType: DynamicColumn['type'] = presetType === 'progress' || presetType === 'stars' ? 'number' : presetType;
    const config: Record<string, unknown> = presetType === 'progress' ? { display: 'progress' } : presetType === 'stars' ? { display: 'stars' } : {};
    
    try {
      for (const c of dynamicColumns.filter((c) => c.position >= position)) {
        await updateBoardColumn(c.id, { position: c.position + 1 });
      }
      await createBoardColumn({
        boardId: activeBoardId,
        key,
        name,
        type: dbType,
        position,
        createdBy: user.id,
        config,
      });
      await refreshDynamicColumns();
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo crear la columna: ${String(err)}` });
    }
  }, [activeBoardId, user, dynamicColumns, refreshDynamicColumns, normalizeDynamicColumnName, buildUniqueDynamicColumnName, setUiToast]);

  const handleRenameDynamicColumn = useCallback(async (columnId: string, name: string) => {
    try {
      await updateBoardColumn(columnId, { name });
      await refreshDynamicColumns();
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo renombrar la columna: ${String(err)}` });
    }
  }, [refreshDynamicColumns, setUiToast]);

  const handleChangeDynamicColumnType = useCallback(async (columnId: string, type: DynamicDisplayType) => {
    const dbType: DynamicColumn['type'] = type === 'progress' || type === 'stars' ? 'number' : type;
    const config: Record<string, unknown> = type === 'progress' ? { display: 'progress' } : type === 'stars' ? { display: 'stars' } : {};
    try {
      await updateBoardColumn(columnId, { type: dbType, config: type === 'progress' || type === 'stars' ? config : {} });
      await refreshDynamicColumns();
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo cambiar el tipo de columna: ${String(err)}` });
    }
  }, [refreshDynamicColumns, setUiToast]);

  const handleSaveDynamicColumnOptions = useCallback(async (columnId: string, rawOptions: string) => {
    const options = rawOptions
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await updateBoardColumn(columnId, { config: { options } });
      await refreshDynamicColumns();
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudieron guardar opciones: ${String(err)}` });
    }
  }, [refreshDynamicColumns, setUiToast]);

  const handleDeleteDynamicColumn = useCallback(async (columnId: string) => {
    try {
      await deleteBoardColumn(columnId);
      await refreshDynamicColumns();
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo eliminar la columna: ${String(err)}` });
    }
  }, [refreshDynamicColumns, setUiToast]);

  const handleDuplicateDynamicColumn = useCallback(async (columnId: string) => {
    if (!activeBoardId || !user) return;
    const source = dynamicColumns.find((c) => c.id === columnId);
    if (!source) return;
    const name = buildUniqueDynamicColumnName(`${source.name} copia`);
    const key = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      for (const c of dynamicColumns.filter((c) => c.position > source.position)) {
        await updateBoardColumn(c.id, { position: c.position + 1 });
      }
      await createBoardColumn({
        boardId: activeBoardId,
        key,
        name,
        type: source.type,
        position: source.position + 1,
        createdBy: user.id,
        config: source.config || {},
      });
      await refreshDynamicColumns();
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo duplicar la columna: ${String(err)}` });
    }
  }, [activeBoardId, user, dynamicColumns, buildUniqueDynamicColumnName, refreshDynamicColumns, setUiToast]);

  // Efectos para columnas dinámicas
  useEffect(() => {
    refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  useEffect(() => {
    if (!activeBoardId) return;
    const onFocus = () => {
      refreshDynamicColumns();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeBoardId, refreshDynamicColumns]);

  const essentialColumnDefs = useMemo<Array<Extract<RenderColumn, { kind: 'essential' }>>>(() => ([
    { kind: 'essential', token: 'essential:project', id: 'project', label: 'Proyecto', sortKey: 'name', widthKey: 'project', nonEditableName: true },
    { kind: 'essential', token: 'essential:branch', id: 'branch', label: 'Sucursal', sortKey: 'branch', widthKey: 'branch', nonEditableName: true },
    { kind: 'essential', token: 'essential:start', id: 'start', label: 'Inicio', sortKey: 'startDate', widthKey: 'start', nonEditableName: true },
    { kind: 'essential', token: 'essential:end', id: 'end', label: 'Fin', sortKey: 'endDate', widthKey: 'end', nonEditableName: true },
    { kind: 'essential', token: 'essential:assignees', id: 'assignees', label: 'Asignado', sortKey: 'assignees', widthKey: 'assignees', nonEditableName: true },
    { kind: 'essential', token: 'essential:days', id: 'days', label: 'Dias req.', sortKey: 'daysRequired', widthKey: 'days', nonEditableName: true },
    { kind: 'essential', token: 'essential:priority', id: 'priority', label: 'Prior.', sortKey: 'priority', widthKey: 'priority', nonEditableName: true },
    { kind: 'essential', token: 'essential:type', id: 'type', label: 'Tipo', sortKey: 'type', widthKey: 'type', nonEditableName: true },
    { kind: 'essential', token: 'essential:load', id: 'load', label: 'Carga', sortKey: 'dailyLoad', widthKey: 'load', nonEditableName: true },
    { kind: 'essential', token: 'essential:status', id: 'status', label: 'Estatus', sortKey: 'status', widthKey: 'status', nonEditableName: true },
  ]), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `workload-dashboard-table-layout:${activeBoardId || 'local'}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setLayoutSeedOrder(null);
        setColumnWidths(defaultColumnWidths);
        return;
      }
      const parsed = JSON.parse(raw) as {
        order?: string[];
        widths?: Partial<Record<ColumnKey, number>>;
      };
      const seed = Array.isArray(parsed.order)
        ? parsed.order.filter((x): x is ColumnToken => typeof x === 'string' && (x.startsWith('essential:') || x.startsWith('dynamic:')))
        : null;
      const safeWidths = parsed.widths && typeof parsed.widths === 'object'
        ? {
            ...defaultColumnWidths,
            ...Object.fromEntries(
              Object.entries(parsed.widths).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 20),
            ),
          } as Record<ColumnKey, number>
        : defaultColumnWidths;
      const safeSeed = seed ? dedupeTokens(seed) : null;
      setLayoutSeedOrder(safeSeed && safeSeed.length > 0 ? safeSeed : null);
      setColumnWidths(safeWidths);
      setColumnOrder([]);
    } catch {
      setLayoutSeedOrder(null);
      setColumnWidths(defaultColumnWidths);
    }
  }, [activeBoardId, defaultColumnWidths, setColumnOrder, setColumnWidths, setLayoutSeedOrder]);

  useEffect(() => {
    const essentialTokens = essentialColumnDefs.map((c) => c.token);
    const dynamicTokens = dynamicColumns
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => `dynamic:${c.id}` as ColumnToken);

    setColumnOrder((prev) => {
      if (prev.length === 0) {
        const base = dedupeTokens([...essentialTokens, ...dynamicTokens]);
        if (!layoutSeedOrder || layoutSeedOrder.length === 0) return base;
        const valid = new Set<ColumnToken>(base);
        const kept = dedupeTokens(layoutSeedOrder.filter((t) => valid.has(t)));
        const missing = base.filter((t) => !kept.includes(t));
        return [...kept, ...missing];
      }
      const base = dedupeTokens([...essentialTokens, ...dynamicTokens]);
      const valid = new Set<ColumnToken>(base);
      const kept = dedupeTokens(prev.filter((t) => valid.has(t)));
      const missing = base.filter((t) => !kept.includes(t));
      return [...kept, ...missing];
    });
  }, [dynamicColumns, essentialColumnDefs, layoutSeedOrder, setColumnOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (columnOrder.length === 0) return;
    const key = `workload-dashboard-table-layout:${activeBoardId || 'local'}`;
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          order: columnOrder,
          widths: columnWidths,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [activeBoardId, columnOrder, columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `workload-dashboard-branch-catalog:${activeBoardId || 'local'}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setBranchCatalog([]);
        return;
      }
      const parsed = JSON.parse(raw);
      const safe = Array.isArray(parsed) ? normalizeTagList(parsed.map((x) => String(x))) : [];
      setBranchCatalog(safe);
    } catch {
      setBranchCatalog([]);
    }
  }, [activeBoardId, setBranchCatalog]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `workload-dashboard-branch-catalog:${activeBoardId || 'local'}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(branchCatalog));
    } catch {
      // ignore storage errors
    }
  }, [activeBoardId, branchCatalog]);

  const branchOptions = useMemo(
    () => normalizeTagList([...(allBranches || []), ...(branchCatalog || [])]),
    [allBranches, branchCatalog]
  );

  const renderColumns = useMemo(() => {
    const essentialByToken = new Map(essentialColumnDefs.map((c) => [c.token, c]));
    const dynamicByToken = new Map(
      dynamicColumns.map((col) => [
        `dynamic:${col.id}` as ColumnToken,
        {
          kind: 'dynamic' as const,
          token: `dynamic:${col.id}` as const,
          id: col.id,
          label: col.name,
          column: col,
        },
      ]),
    );
    const fallbackOrder: ColumnToken[] = [
      ...essentialColumnDefs.map((c) => c.token),
      ...dynamicColumns
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((c) => `dynamic:${c.id}` as ColumnToken),
    ];
    const sourceOrder = columnOrder.length > 0 ? columnOrder : fallbackOrder;
    return sourceOrder
      .map((token) => essentialByToken.get(token as `essential:${EssentialColumnId}`) ?? dynamicByToken.get(token))
      .filter((x): x is RenderColumn => Boolean(x));
  }, [columnOrder, dynamicColumns, essentialColumnDefs]);

  const sortedProjects = useMemo(() => {
    if (!orderedFilteredProjects || !Array.isArray(orderedFilteredProjects)) return { scheduled: [], unscheduled: [], radar: [] };
    
    const filtered = orderedFilteredProjects.filter((project) => {
      if (search && !project.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (!showRadar && project.type === 'En radar') return false;
      return true;
    });

    const sorted = filtered.sort((a, b) => {
      let comparison = 0;
      if (sortKey && sortKey in a && sortKey in b) {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal !== null && bVal !== null) {
          if (aVal < bVal) comparison = -1;
          else if (aVal > bVal) comparison = 1;
        }
      }
      return sortDir === 'desc' ? -comparison : comparison;
    });

    const scheduled = sorted.filter((p) => p.startDate && p.endDate && p.type !== 'En radar');
    const unscheduled = sorted.filter((p) => (!p.startDate || !p.endDate) && p.type !== 'En radar');
    const radar = sorted.filter((p) => p.type === 'En radar');

    return { scheduled, unscheduled, radar };
  }, [orderedFilteredProjects, search, sortKey, sortDir, showRadar]);

  const radarCountRaw = useMemo(() => {
    if (!orderedFilteredProjects || !Array.isArray(orderedFilteredProjects)) return 0;
    return orderedFilteredProjects.filter((p) => p.type === 'En radar').length;
  }, [orderedFilteredProjects]);

  // Flat list for compatibility
  const flatSortedProjects = [...sortedProjects.scheduled, ...sortedProjects.unscheduled, ...sortedProjects.radar];
  const renderedProjectIds = flatSortedProjects.map((p) => p.id);

  const persistDynamicPositionsFromOrder = useCallback(async (order: ColumnToken[]) => {
    if (!activeBoardId) return;
    const dynamicIds = order
      .filter((t): t is `dynamic:${string}` => t.startsWith('dynamic:'))
      .map((t) => t.replace('dynamic:', ''));
    if (dynamicIds.length === 0) return;
    const current = [...dynamicColumns].sort((a, b) => a.position - b.position);
    for (let i = 0; i < dynamicIds.length; i += 1) {
      const id = dynamicIds[i];
      const cur = current.find((c) => c.id === id);
      if (cur && cur.position !== i) {
        await updateBoardColumn(id, { position: i });
      }
    }
  }, [activeBoardId, dynamicColumns]);

  const handleSelectAll = useCallback(() => {
    const allIds = flatSortedProjects.map((p) => p.id);
    setSelectedRowIds(new Set(allIds));
    setLastSelectedRowId(allIds[allIds.length - 1]);
  }, [flatSortedProjects, setSelectedRowIds, setLastSelectedRowId]);

  const clearSelection = useCallback(() => {
    setSelectedRowIds(new Set());
    setSelectedRowId(null);
    setLastSelectedRowId(null);
  }, [setSelectedRowIds, setSelectedRowId]);

  const handleToggleChecked = useCallback((id: string, checked: boolean) => {
    setMultiSelectMode(true);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, [setSelectedRowIds]);

  const handleRowSelect = useCallback((id: string, ev?: React.MouseEvent<HTMLElement>) => {
    const shiftPressed = ev?.shiftKey;
    const ctrlPressed = ev?.ctrlKey || ev?.metaKey;
    const isRangeSelect = shiftPressed;
    const isAdditiveSelect = ctrlPressed;

    // Si hay Shift o Ctrl, activamos multi-select mode automáticamente
    if (isRangeSelect || isAdditiveSelect) {
      if (!multiSelectMode) {
        setMultiSelectMode(true);
        // Si es Shift (rango) pero no había nada seleccionado, solo seleccionar uno
        if (isRangeSelect && !selectedRowId && selectedRowIds.size === 0) {
          setSelectedRowId(id);
          setLastSelectedRowId(id);
          return;
        }
      }
    }

    if (isRangeSelect && lastSelectedRowId) {
      // Selección de rango con Shift
      const allIds = flatSortedProjects.map((p) => p.id);
      const lastIdx = allIds.indexOf(lastSelectedRowId);
      const currIdx = allIds.indexOf(id);
      if (lastIdx === -1 || currIdx === -1) {
        setSelectedRowId(id);
        setLastSelectedRowId(id);
        return;
      }
      const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
      const range = allIds.slice(start, end + 1);
      setSelectedRowIds(new Set([...selectedRowIds, ...range]));
      setSelectedRowId(id);
      setLastSelectedRowId(id);
    } else if (isAdditiveSelect) {
      // Selección aditiva con Ctrl - agregar/quitar de selección
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setSelectedRowId(id);
      setLastSelectedRowId(id);
    } else if (multiSelectMode) {
      // Ya estamos en modo multi-select (sin modificadores) - togglear selección
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setSelectedRowId(id);
      setLastSelectedRowId(id);
    } else {
      // Selección normal (single select)
      setSelectedRowId(id);
      setLastSelectedRowId(id);
    }
  }, [multiSelectMode, lastSelectedRowId, flatSortedProjects, selectedRowIds, selectedRowId, setSelectedRowIds, setSelectedRowId, setLastSelectedRowId, setMultiSelectMode]);

  const handleBulkMenuToggle = useCallback(() => {
    setBulkMenuOpen((prev) => !prev);
  }, [setBulkMenuOpen]);

  const handleMultiSelectModeToggle = useCallback(() => {
    setMultiSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedRowIds(new Set());
        setLastSelectedRowId(null);
      }
      return next;
    });
  }, [setMultiSelectMode, setSelectedRowIds, setLastSelectedRowId]);

  const handleMoveColumnLeft = useCallback((token: string) => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(token as ColumnToken);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(idx - 1, 0, item);
      void persistDynamicPositionsFromOrder(next);
      return next;
    });
  }, [setColumnOrder, persistDynamicPositionsFromOrder]);

  const handleMoveColumnRight = useCallback((token: string) => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(token as ColumnToken);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(idx + 1, 0, item);
      void persistDynamicPositionsFromOrder(next);
      return next;
    });
  }, [setColumnOrder, persistDynamicPositionsFromOrder]);

  const handleReorderColumns = useCallback((dragToken: string, dropToken: string) => {
    setColumnOrder((prev) => {
      const from = prev.indexOf(dragToken as ColumnToken);
      const to = prev.indexOf(dropToken as ColumnToken);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      void persistDynamicPositionsFromOrder(next);
      return next;
    });
  }, [setColumnOrder, persistDynamicPositionsFromOrder]);

  const handleMoveCopyColumn = useCallback(async () => {
    if (!moveCopyColumnId) return;

    const insertToken = (arr: ColumnToken[], token: ColumnToken, target: ColumnToken | '__end__') => {
      const base = [...arr];
      if (target === '__end__') {
        base.push(token);
        return base;
      }
      const idx = base.indexOf(target);
      if (idx < 0) {
        base.push(token);
        return base;
      }
      base.splice(idx, 0, token);
      return base;
    };

    if (!moveCopyAsCopy) {
      setColumnOrder((prev) => {
        const source = moveCopyColumnId as ColumnToken;
        const filtered = prev.filter((t) => t !== source);
        const next = insertToken(filtered, source, moveCopyTargetId);
        void persistDynamicPositionsFromOrder(next);
        return next;
      });
      setMoveCopyColumnId(null);
      return;
    }

    if (!moveCopyColumnId.startsWith('dynamic:') || !activeBoardId || !user) {
      setUiToast({ type: 'error', message: 'Solo se pueden copiar columnas dinámicas.' });
      setMoveCopyColumnId(null);
      return;
    }

    const sourceId = moveCopyColumnId.slice('dynamic:'.length);
    const source = dynamicColumns.find((c) => c.id === sourceId);
    if (!source) {
      setUiToast({ type: 'error', message: 'No se encontró la columna origen.' });
      setMoveCopyColumnId(null);
      return;
    }

    try {
      const created = await createBoardColumn({
        boardId: activeBoardId,
        key: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: buildUniqueDynamicColumnName(`${source.name} copia`),
        type: source.type,
        position: dynamicColumns.length + 1,
        createdBy: user.id,
        config: source.config || {},
      });
      await refreshDynamicColumns();
      const newToken = `dynamic:${created.id}` as ColumnToken;
      setColumnOrder((prev) => {
        const next = insertToken(prev, newToken, moveCopyTargetId);
        void persistDynamicPositionsFromOrder(next);
        return next;
      });
      setMoveCopyColumnId(null);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo copiar columna: ${String(err)}` });
    }
  }, [
    moveCopyColumnId,
    moveCopyAsCopy,
    moveCopyTargetId,
    activeBoardId,
    user,
    dynamicColumns,
    buildUniqueDynamicColumnName,
    refreshDynamicColumns,
    persistDynamicPositionsFromOrder,
    setColumnOrder,
    setMoveCopyColumnId,
    setUiToast,
  ]);

  const handleBulkIndent = useCallback(async () => {
    const selection = Array.from(selectedRowIds);
    if (selection.length === 0) return;

    const updates: Record<string, Partial<Project>> = {};
    selection.forEach((id) => {
      const project = state.projects.find((p) => p.id === id);
      if (project) {
        const ancestors = getAncestors(id, state.projects);
        const parent = ancestors[ancestors.length - 2];
        if (parent) {
          updates[id] = { parentId: parent.id };
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
    }
  }, [state.projects, selectedRowIds, dispatch]);

  const handleBulkOutdent = useCallback(async () => {
    const selection = Array.from(selectedRowIds);
    if (selection.length === 0) return;

    const updates: Record<string, Partial<Project>> = {};
    selection.forEach((id) => {
      const project = state.projects.find((p) => p.id === id);
      if (project && project.parentId) {
        const ancestors = getAncestors(id, state.projects);
        const grandParent = ancestors[ancestors.length - 3];
        if (grandParent) {
          updates[id] = { parentId: grandParent.id };
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
    }
  }, [state.projects, selectedRowIds, dispatch]);

  const handleBulkDuplicate = useCallback(async () => {
    const selection = Array.from(selectedRowIds);
    if (selection.length === 0) return;

    const newProjects: Project[] = [];
    selection.forEach((id) => {
      const project = state.projects.find((p) => p.id === id);
      if (project) {
        const newProject = {
          ...project,
          id: crypto.randomUUID(),
          name: `${project.name} (copia)`,
        };
        newProjects.push(newProject);
      }
    });

    if (newProjects.length > 0) {
      dispatch({ type: 'ADD_PROJECTS', payload: newProjects });
    }
  }, [state.projects, selectedRowIds, dispatch]);

  const handleBulkDelete = useCallback(async () => {
    const selection = Array.from(selectedRowIds);
    if (selection.length === 0) return;

    const confirmed = await confirm(
      '¿Eliminar proyectos seleccionados?',
      `Se eliminarán ${selection.length} proyecto(s) permanentemente.`
    );
    if (!confirmed) return;

    dispatch({ type: 'DELETE_PROJECTS', payload: selection });
    clearSelection();
  }, [selectedRowIds, dispatch, confirm, clearSelection]);

  const handleIndent = useCallback((projectId: string) => {
    const order = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const idx = order.indexOf(projectId);
    if (idx <= 0) return;
    const currentProject = state.projects.find((p) => p.id === projectId);
    if (!currentProject) return;
    const currentLevel = currentProject.hierarchyLevel ?? 0;

    // Indent should increase only one level at a time:
    // choose nearest previous row at the same current level as new parent.
    let targetParentId: string | null = null;
    for (let i = idx - 1; i >= 0; i -= 1) {
      const candidateId = order[i];
      const candidate = state.projects.find((p) => p.id === candidateId);
      if (!candidate) continue;
      const candidateLevel = candidate.hierarchyLevel ?? 0;
      if (candidateLevel === currentLevel) {
        targetParentId = candidateId;
        break;
      }
    }
    if (!targetParentId) return;
    if (!validateNoCircles(projectId, targetParentId, state.projects)) return;

    dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId, newParentId: targetParentId } });
  }, [state.projectOrder, state.projects, dispatch]);

  const handleOutdent = useCallback((projectId: string) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const currentParentId = project.parentId;
    if (!currentParentId) return;
    const parentProject = state.projects.find((p) => p.id === currentParentId);
    const newParentId = parentProject?.parentId ?? null;
    if (!validateNoCircles(projectId, newParentId, state.projects)) return;

    dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId, newParentId } });
  }, [state.projectOrder, state.projects, dispatch]);

  const confirmParentConversionIfNeeded = useCallback(async (targetParentId: string | null): Promise<boolean> => {
    if (!targetParentId) return true;
    const parent = state.projects.find((p) => p.id === targetParentId);
    if (!parent) return true;
    const alreadyHasChildren = state.projects.some((p) => p.parentId === targetParentId);
    if (alreadyHasChildren) return true;
    const parentDynamic = dynamicValues.get(targetParentId) || {};
    const hasDynamicOwnData = Object.values(parentDynamic).some((v) => hasMeaningfulDynamicValue(v));
    const hasOwnData = Boolean(
      parent.startDate
      || parent.endDate
      || (Array.isArray(parent.assignees) && parent.assignees.length > 0)
      || (Array.isArray(parent.branch) && parent.branch.length > 0)
      || (Number.isFinite(parent.daysRequired) && parent.daysRequired > 0)
      || (Number.isFinite(parent.priority) && parent.priority > 0)
      || (Number.isFinite(parent.reportedLoad ?? 0) && (parent.reportedLoad ?? 0) > 0)
      || hasDynamicOwnData
    );
    if (!hasOwnData) return true;

    const ok = await confirm({
      title: 'Convertir en grupo',
      message: GROUP_CONVERSION_WARNING_MESSAGE,
      confirmText: 'Continuar',
    });
    if (!ok) return false;

    dispatch({
      type: 'UPDATE_PROJECT',
      payload: { id: targetParentId, updates: { startDate: null, endDate: null } },
    });
    return true;
  }, [state.projects, dynamicValues, confirm, dispatch]);

  // Measure toolbar height for sticky header offset
  useEffect(() => {
    if (stickyToolsRef.current) {
      const height = stickyToolsRef.current.getBoundingClientRect().height;
      if (height > 0 && height !== stickyToolsHeight) {
        setStickyToolsHeight(height);
      }
    }
  }, [stickyToolsRef.current, state.projects.length]);

  useEffect(() => {
    const update = () => setTreeOverlayVersion((v) => v + 1);
    const raf1 = requestAnimationFrame(() => {
      update();
      requestAnimationFrame(update);
    });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener('resize', update);
    };
  }, [flatSortedProjects, state.projectOrder, editingName, columnWidths.project, multiSelectMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape cancels selection
      if (e.key === 'Escape') {
        setSelectedRowId(null);
        setSelectedRowIds(new Set());
        setMultiSelectMode(false);
        return;
      }

      if (!selectedRowId || multiSelectMode) return;
      if (e.key !== 'Tab') return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      const editable = target.getAttribute('contenteditable');
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable === 'true') return;

      // Add row below:
      // Windows/Linux: Ctrl + "+" (usually Ctrl + Shift + "=")
      // macOS: Cmd + Shift + "+"
      const isAddBelowShortcut =
        (e.ctrlKey && !e.metaKey && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) ||
        (e.metaKey && e.shiftKey && (e.key === '+' || e.key === '='));
      if (isAddBelowShortcut) {
        e.preventDefault();
        tableActions.handleAddBelow(selectedRowId);
        return;
      }

      e.preventDefault();
      if (e.shiftKey) {
        handleOutdent(selectedRowId);
      } else {
        handleIndent(selectedRowId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRowId, multiSelectMode, handleIndent, handleOutdent, tableActions]);

  useEffect(() => {
    const hasAnySelection = selectedRowId !== null || selectedRowIds.size > 0;
    if (!hasAnySelection) return;
    const onDocPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const insideTable = !!(target && tableRootRef.current?.contains(target));
      if (insideTable) return;
      setSelectedRowId(null);
      setSelectedRowIds(new Set());
      setLastSelectedRowId(null);
      setMultiSelectMode(false);
    };
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, [selectedRowId, selectedRowIds, setSelectedRowId, setSelectedRowIds, setLastSelectedRowId, setMultiSelectMode]);

  const handleMoveBefore = useCallback((projectId: string, beforeId: string | '__end__') => {
    const order = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const moving = state.projects.find((p) => p.id === projectId);
    if (!moving) return;

    if (beforeId === '__end__') {
      const nextOrder = order.filter((id) => id !== projectId);
      nextOrder.push(projectId);
      dispatch({ type: 'REORDER_PROJECTS', payload: nextOrder });
      return;
    }

    if (beforeId === projectId) return;
    const target = state.projects.find((p) => p.id === beforeId);
    if (!target) return;
    if (!validateNoCircles(projectId, target.parentId ?? null, state.projects)) return;

    const targetParentId = target.parentId ?? null;
    if ((moving.parentId ?? null) !== targetParentId) {
      dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId, newParentId: targetParentId } });
    }

    const nextOrder = order.filter((id) => id !== projectId);
    const targetIndex = nextOrder.indexOf(beforeId);
    if (targetIndex < 0) {
      nextOrder.push(projectId);
    } else {
      nextOrder.splice(targetIndex, 0, projectId);
    }
    dispatch({ type: 'REORDER_PROJECTS', payload: nextOrder });
  }, [dispatch, state.projectOrder, state.projects]);

  const handleOpenComments = useCallback(async (taskId: string) => {
    if (!activeBoardId) return;
    try {
      const rows = await listTaskComments(activeBoardId, taskId);
      setComments(rows);
      setCommentsTaskId(taskId);
      setCommentsOpen(true);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudieron cargar comentarios: ${String(err)}` });
    }
  }, [activeBoardId, setComments, setCommentsTaskId, setCommentsOpen, setUiToast]);

  const handleAddComment = useCallback(async () => {
    if (!activeBoardId || !user || !commentsTaskId || !commentDraft.trim()) return;
    const authorLabel = (user.user_metadata?.full_name as string | undefined)
      || (user.user_metadata?.name as string | undefined)
      || user.email
      || 'Usuario';
    const authorAvatarUrl = (user.user_metadata?.avatar_url as string | undefined)
      || (user.user_metadata?.picture as string | undefined)
      || null;
    try {
      await addTaskComment({
        boardId: activeBoardId,
        taskId: commentsTaskId,
        userId: user.id,
        body: commentDraft,
        authorLabel,
        authorAvatarUrl,
      });
      setCommentDraft('');
      const rows = await listTaskComments(activeBoardId, commentsTaskId);
      setComments(rows);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo guardar comentario: ${String(err)}` });
    }
  }, [activeBoardId, user, commentsTaskId, commentDraft, setCommentDraft, setComments, setUiToast]);

  const handleAddLinkComment = useCallback(async () => {
    if (!activeBoardId || !user || !commentsTaskId) return;
    const raw = linkUrlDraft.trim();
    if (!raw) return;
    let url: URL;
    try {
      url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    } catch {
      setUiToast({ type: 'error', message: 'URL inválida' });
      return;
    }
    const title = linkTitleDraft.trim() || url.toString();
    const body = `[${title}](${url.toString()})`;
    const authorLabel = (user.user_metadata?.full_name as string | undefined)
      || (user.user_metadata?.name as string | undefined)
      || user.email
      || 'Usuario';
    const authorAvatarUrl = (user.user_metadata?.avatar_url as string | undefined)
      || (user.user_metadata?.picture as string | undefined)
      || null;
    try {
      await addTaskComment({
        boardId: activeBoardId,
        taskId: commentsTaskId,
        userId: user.id,
        body,
        authorLabel,
        authorAvatarUrl,
      });
      setLinkUrlDraft('');
      setLinkTitleDraft('');
      const rows = await listTaskComments(activeBoardId, commentsTaskId);
      setComments(rows);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo guardar enlace: ${String(err)}` });
    }
  }, [activeBoardId, user, commentsTaskId, linkUrlDraft, linkTitleDraft, setLinkUrlDraft, setLinkTitleDraft, setComments, setUiToast]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!activeBoardId || !commentsTaskId) return;
    const ok = await confirm('Eliminar comentario', 'Esta accion no se puede deshacer.');
    if (!ok) return;
    try {
      await deleteTaskComment(commentId);
      const rows = await listTaskComments(activeBoardId, commentsTaskId);
      setComments(rows);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo eliminar comentario: ${String(err)}` });
    }
  }, [activeBoardId, commentsTaskId, confirm, setComments, setUiToast]);

  const getDepth = useCallback((projectId: string): number => {
    let depth = 0;
    let cur = state.projects.find((p) => p.id === projectId) || null;
    while (cur?.parentId) {
      depth += 1;
      cur = state.projects.find((p) => p.id === cur!.parentId) || null;
    }
    return depth;
  }, [state.projects]);

  const handleDragStart = (event: DragStartEvent) => {
    setDragPreview({
      activeId: String(event.active.id),
      overId: null,
      placement: null,
      targetDepth: 0,
      targetParentId: null,
    });
  };

  const computeDropDecision = useCallback((
    activeId: string,
    overId: string,
    deltaX: number,
    pointerY: number,
    overRect: { top: number; height: number }
  ): { placement: 'before' | 'inside' | 'after'; targetDepth: number; targetParentId: string | null } => {
    const overProject = state.projects.find((p) => p.id === overId);
    if (!overProject) {
      return { placement: 'after', targetDepth: 0, targetParentId: null };
    }
    const overDepth = getDepth(overId);

    const relativeY = Math.max(0, pointerY - overRect.top);
    const yRatio = Math.max(0, Math.min(1, relativeY / Math.max(1, overRect.height)));
    const ZONE_TOP = 0.25;
    const ZONE_BOTTOM = 0.75;
    const INSIDE_INTENT_X = 20;
    const insideDepth = overDepth + 1;

    const insideAllowed = insideDepth <= MAX_DND_DEPTH && validateNoCircles(activeId, overId, state.projects);
    // Strong horizontal intent to nest, regardless of drag direction.
    if (insideAllowed && deltaX > INSIDE_INTENT_X) {
      return {
        placement: 'inside',
        targetDepth: insideDepth,
        targetParentId: overId,
      };
    }

    if (yRatio < ZONE_TOP) {
      return {
        placement: 'before',
        targetDepth: overDepth,
        targetParentId: overProject.parentId ?? null,
      };
    }

    if (yRatio > ZONE_BOTTOM) {
      return {
        placement: 'after',
        targetDepth: overDepth,
        targetParentId: overProject.parentId ?? null,
      };
    }

    if (insideAllowed) {
      return {
        placement: 'inside',
        targetDepth: insideDepth,
        targetParentId: overId,
      };
    }

    return {
      placement: 'after',
      targetDepth: overDepth,
      targetParentId: overProject.parentId ?? null,
    };
  }, [getDepth, state.projects]);

  const computeDropDecisionByPlacement = useCallback((
    activeId: string,
    overId: string,
    placement: 'before' | 'inside' | 'after',
  ): { placement: 'before' | 'inside' | 'after'; targetDepth: number; targetParentId: string | null } => {
    const overProject = state.projects.find((p) => p.id === overId);
    if (!overProject) return { placement: 'after', targetDepth: 0, targetParentId: null };
    const overDepth = getDepth(overId);
    if (placement === 'inside') {
      const insideDepth = overDepth + 1;
      const insideAllowed = insideDepth <= MAX_DND_DEPTH && validateNoCircles(activeId, overId, state.projects);
      if (insideAllowed) {
        return { placement: 'inside', targetDepth: insideDepth, targetParentId: overId };
      }
    }
    return {
      placement: placement === 'before' ? 'before' : 'after',
      targetDepth: overDepth,
      targetParentId: overProject.parentId ?? null,
    };
  }, [getDepth, state.projects]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const overIdRaw = String(over.id);
    if (overIdRaw.startsWith('dz:')) {
      const [, placementRaw, rowIdRaw] = overIdRaw.split(':');
      const placement = placementRaw === 'before' || placementRaw === 'inside' || placementRaw === 'after'
        ? placementRaw
        : 'after';
      const rowId = rowIdRaw || overIdRaw;
      const decision = computeDropDecisionByPlacement(String(active.id), rowId, placement);
      setDragPreview({
        activeId: String(active.id),
        overId: rowId,
        placement: decision.placement,
        targetDepth: decision.targetDepth,
        targetParentId: decision.targetParentId,
      });
      return;
    }

    const pointerLike = event.activatorEvent as MouseEvent | PointerEvent | undefined;
    const overRect = rowRefs.current[overIdRaw]?.getBoundingClientRect();
    if (!overRect) return;
    const translated = event.active.rect.current.translated;
    const pointerY = translated
      ? translated.top + translated.height / 2
      : (pointerLike?.clientY ?? (overRect.top + overRect.height / 2));
    const decision = computeDropDecision(
      String(active.id),
      overIdRaw,
      event.delta?.x ?? 0,
      pointerY,
      { top: overRect.top, height: overRect.height }
    );
    setDragPreview({
      activeId: String(active.id),
      overId: String(over.id),
      placement: decision.placement,
      targetDepth: decision.targetDepth,
      targetParentId: decision.targetParentId,
    });
  }, [computeDropDecision, computeDropDecisionByPlacement, rowRefs]);

  const handleDragCancel = useCallback(() => {
    setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
      return;
    }

    const overRawId = String(over.id);
    const resolvedOverId = overRawId.startsWith('dz:')
      ? (overRawId.split(':')[2] || overRawId)
      : overRawId;

    const currentOrder = state.projectOrder.length > 0
      ? [...state.projectOrder]
      : state.projects.map((p) => p.id);

    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(resolvedOverId);
    if (oldIndex === -1 || newIndex === -1) {
      setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
      return;
    }

    const activeId = String(active.id);
    const overId = dragPreview.overId || resolvedOverId;
    const activeProject = state.projects.find((p) => p.id === activeId);
    const targetProject = state.projects.find((p) => p.id === overId);

    const getSubtreeIdsInOrder = (rootId: string, order: string[]) => {
      const descendantIds = new Set(getDescendants(rootId, state.projects).map((p) => p.id));
      return order.filter((id) => id === rootId || descendantIds.has(id));
    };
    const moveBlock = (arr: string[], blockIds: string[], targetIndex: number) => {
      const blockSet = new Set(blockIds);
      const remaining = arr.filter((id) => !blockSet.has(id));
      const clamped = Math.max(0, Math.min(targetIndex, arr.length));
      const removedBefore = arr.slice(0, clamped).filter((id) => blockSet.has(id)).length;
      const insertIndex = clamped - removedBefore;
      return [
        ...remaining.slice(0, insertIndex),
        ...blockIds,
        ...remaining.slice(insertIndex),
      ];
    };
    const blockIds = getSubtreeIdsInOrder(activeId, currentOrder);
    const blockSet = new Set(blockIds);
    if (blockSet.has(overId)) {
      setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
      return;
    }

    const placement = dragPreview.placement;
    if (!placement) {
      setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
      return;
    }
    const targetParentId = dragPreview.targetParentId ?? null;

    if (targetParentId !== null && !validateNoCircles(activeId, targetParentId, state.projects)) {
      setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
      return;
    }

    if (activeProject && (activeProject.parentId ?? null) !== targetParentId) {
      if (targetParentId && !(await confirmParentConversionIfNeeded(targetParentId))) {
        setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
        return;
      }
      dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId: activeId, newParentId: targetParentId } });
      if (placement === 'inside' && targetParentId) {
        dispatch({ type: 'UPDATE_PROJECT', payload: { id: targetParentId, updates: { isExpanded: true } } });
      }
    }
    if (!targetProject) {
      setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
      return;
    }
    const getOverSubtreeIds = (rootId: string, order: string[]) => {
      const descendants = new Set(getDescendants(rootId, state.projects).map((p) => p.id));
      return order.filter((id) => id === rootId || descendants.has(id));
    };
    let insertAt = newIndex;
    if (placement === 'inside') {
      insertAt = newIndex + 1;
    } else if (placement === 'after') {
      const overSubtree = getOverSubtreeIds(overId, currentOrder);
      const last = overSubtree[overSubtree.length - 1];
      insertAt = (last ? currentOrder.indexOf(last) : newIndex) + 1;
    }
    dispatch({ type: 'REORDER_PROJECTS', payload: moveBlock(currentOrder, blockIds, insertAt) });
    setDragPreview({ activeId: null, overId: null, placement: null, targetDepth: 0, targetParentId: null });
  }, [state.projectOrder, state.projects, dispatch, dragPreview.overId, dragPreview.placement, dragPreview.targetParentId, confirmParentConversionIfNeeded]);

  const dropZoneCollision = useCallback<CollisionDetection>((args) => {
    const pointerHits = pointerWithin(args).filter((c) => String(c.id).startsWith('dz:'));
    if (pointerHits.length > 0) return pointerHits;
    const nearestDropZone = closestCenter(args).filter((c) => String(c.id).startsWith('dz:'));
    return nearestDropZone;
  }, []);

  return (
    <div ref={tableRootRef} className="w-full flex flex-col flex-1 min-h-0">
      <div className="sticky top-0 z-20 bg-bg-secondary pb-0 pt-0 shrink-0">
        <TableTools
          search={search}
          setSearch={setSearch}
          projectsCount={orderedFilteredProjects.length}
          multiSelectMode={multiSelectMode}
          selectedRowId={selectedRowId}
          selectedRowIds={selectedRowIds}
          bulkMenuOpen={bulkMenuOpen}
          bulkMenuRef={bulkMenuRef}
          toolbarRef={stickyToolsRef}
          renderedProjectIds={renderedProjectIds}
          onMultiSelectModeToggle={handleMultiSelectModeToggle}
          onClearSelection={clearSelection}
          onBulkMenuToggle={handleBulkMenuToggle}
          onSelectAll={handleSelectAll}
          onBulkIndent={handleBulkIndent}
          onBulkOutdent={handleBulkOutdent}
          onBulkDuplicate={handleBulkDuplicate}
          onBulkDelete={handleBulkDelete}
          onAddProject={tableActions.handleAddProject}
          onExportExcel={tableActions.handleExportExcel}
          onCopyCSV={tableActions.handleCopyCSV}
          showRadar={showRadar}
          setShowRadar={setShowRadar}
          radarCount={radarCountRaw}
        />
      </div>

      <div ref={contentScrollRef} className="flex-1 overflow-auto min-h-0 pb-4">
        <DndContext
        sensors={sensors}
        collisionDetection={dropZoneCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
          <div ref={treeOverlayHostRef} className="relative">
          <table className="w-full px-8 pb-6 border-separate border-spacing-0 table-fixed">
            <TableHeader
              renderColumns={renderColumns}
              columnWidths={columnWidths}
              stickyToolsHeight={stickyToolsHeight}
              columnMenuOpenFor={columnMenuOpenFor}
              onColumnMenuToggle={tableHandlers.handleColumnMenuToggle}
              onCreateColumn={(position, type = 'text') => {
                setNewColumnDialog({
                  open: true,
                  position,
                  name: buildUniqueDynamicColumnName('Nueva columna'),
                  type,
                });
              }}
              onRenameDynamicColumn={handleRenameDynamicColumn}
              onChangeDynamicColumnType={handleChangeDynamicColumnType}
              onDuplicateDynamicColumn={handleDuplicateDynamicColumn}
              onDeleteDynamicColumn={handleDeleteDynamicColumn}
            onSaveDynamicColumnOptions={handleSaveDynamicColumnOptions}
            onMoveColumnLeft={handleMoveColumnLeft}
            onMoveColumnRight={handleMoveColumnRight}
            onSortColumn={(key, dir) => {
              setSortKey(key as SortKey);
              setSortDir(dir);
            }}
            onClearSort={(key) => {
              if (sortKey === key) setSortKey(null);
            }}
            currentSortKey={sortKey ? String(sortKey) : null}
            onReorderColumns={handleReorderColumns}
            onOpenMoveCopy={(token) => {
              setMoveCopyColumnId(token as ColumnToken);
              setMoveCopyTargetId('__end__');
              setMoveCopyAsCopy(false);
              setMoveCopyQuery('');
            }}
            onColumnResize={(key, width) => setColumnWidths((prev) => ({ ...prev, [key]: width }))}
            resizingColumnRef={resizingColumnRef}
            minColumnWidths={minColumnWidths}
            maxColumnWidths={maxColumnWidths}
          />
            <SortableContext
              items={renderedProjectIds}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {flatSortedProjects.map((project) => {
                  const isDropTarget = dragPreview?.overId === project.id;
                  const effectivePlacement = isDropTarget ? (dragPreview?.placement ?? null) : null;
                  const dropTargetDepth = isDropTarget ? (dragPreview?.targetDepth ?? 0) : 0;

                  return (
                    <Fragment key={project.id}>
                      <SortableRow
                        key={project.id}
                        project={project}
                        allProjects={state.projects}
                        visibleOrderedProjects={flatSortedProjects}
                        isDropTarget={isDropTarget}
                        dropPlacement={effectivePlacement}
                        dropTargetDepth={dropTargetDepth}
                        dragActiveId={dragPreview.activeId}
                        renderColumns={renderColumns}
                        onUpdate={tableActions.handleUpdate}
                        onDelete={tableActions.handleDelete}
                        onToggleExpand={tableActions.handleToggleExpand}
                        onAddAbove={tableActions.handleAddAbove}
                        onAddBelow={tableActions.handleAddBelow}
                        onAddGroupAbove={tableActions.handleAddGroupAbove}
                        onAddGroupBelow={tableActions.handleAddGroupBelow}
                        onAddInside={tableActions.handleAddInside}
                        onDuplicateRow={tableActions.handleDuplicateRow}
                        onMoveToParent={tableActions.handleMoveToParent}
                        onMoveBefore={handleMoveBefore}
                        onIndent={handleIndent}
                        onOutdent={handleOutdent}
                        onSetPersonAvatar={tableActions.handleSetPersonAvatar}
                        onOpenComments={handleOpenComments}
                        onPresenceChange={tableHandlers.handlePresenceChange}
                        onShowGroupEditHint={tableHandlers.handleShowGroupEditHint}
                        onAddBranchOption={tableActions.handleAddBranchOption}
                        onRenameBranchOption={tableActions.handleRenameBranchOption}
                        onDeleteBranchOption={tableActions.handleDeleteBranchOption}
                        onMergeBranchOption={tableActions.handleMergeBranchOptions}
                        personProfiles={personProfiles}
                        allPersons={allPersons}
                        allBranches={branchOptions}
                        onRenamePersonGlobal={tableActions.handleRenamePersonGlobal}
                        onDeletePersonGlobal={tableActions.handleDeletePersonGlobal}
                        onMergePersonsGlobal={tableActions.handleMergePersonsGlobal}
                        dynamicValues={dynamicValues.get(project.id)}
                        onUpdateDynamicCell={handleUpsertDynamicCell}
                        onAddDynamicTagOption={async (columnId, label) => {
                        const column = dynamicColumns.find((c) => c.id === columnId);
                        if (!column) return;
                        const options = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
                        const clean = label.trim();
                        if (!clean || options.includes(clean)) return;
                        await updateBoardColumn(columnId, { config: { ...(column.config || {}), options: [...options, clean] } });
                        await refreshDynamicColumns();
                      }}
                      onRenameDynamicTagOption={async (columnId, from, to) => {
                        const column = dynamicColumns.find((c) => c.id === columnId);
                        if (!column) return;
                        const fromClean = from.trim();
                        const toClean = to.trim();
                        if (!fromClean || !toClean) return;
                        const options = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
                        const next = options.map((opt) => (opt === fromClean ? toClean : opt));
                        await updateBoardColumn(columnId, { config: { ...(column.config || {}), options: next } });
                        await refreshDynamicColumns();
                      }}
                      onDeleteDynamicTagOption={async (columnId, label) => {
                        const column = dynamicColumns.find((c) => c.id === columnId);
                        if (!column) return;
                        const options = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
                        const next = options.filter((opt) => opt !== label);
                        await updateBoardColumn(columnId, { config: { ...(column.config || {}), options: next } });
                        await refreshDynamicColumns();
                      }}
                      isSelected={multiSelectMode ? selectedRowIds.has(project.id) : selectedRowId === project.id}
                      onSelectRow={handleRowSelect}
                      multiSelectMode={multiSelectMode}
                      isChecked={selectedRowIds.has(project.id)}
                      onToggleChecked={handleToggleChecked}
                      rowRef={(node) => { rowRefs.current[project.id] = node; }}
                      editingNameId={editingName}
                      editNameValue={editNameValue}
                      onStartEditName={handleStartEditName}
                        onFinishEditName={handleFinishEditName}
                        onCancelEditName={handleCancelEditName}
                      />
                    </Fragment>
                  );
                })}
              </tbody>
            </SortableContext>
          </table>
          <TableTreeOverlay
            projects={flatSortedProjects}
            rowRefs={rowRefs}
            hostRef={treeOverlayHostRef}
            version={treeOverlayVersion}
          />
          </div>
          <DragOverlay dropAnimation={null}>
            {dragPreview.activeId ? (() => {
              const project = state.projects.find((p) => p.id === dragPreview.activeId);
              if (!project) return null;
              const subtreeCount = getDescendants(project.id, state.projects).length;
              return (
                <div className="rounded-md border border-blue-300 bg-white/95 shadow-lg px-3 py-2 text-xs text-text-primary">
                  <span className="font-medium">{project.name}</span>
                  {subtreeCount > 0 && (
                    <span className="ml-2 text-[10px] text-text-secondary">+{subtreeCount} subelemento{subtreeCount > 1 ? 's' : ''}</span>
                  )}
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>

      <DynamicColumnsDialog
        newColumnDialog={newColumnDialog}
        setNewColumnDialog={setNewColumnDialog}
        editingColumnName={editingColumnName}
        setEditingColumnName={setEditingColumnName}
        editingColumnId={editingColumnId}
        setEditingColumnId={setEditingColumnId}
        dynamicColumns={dynamicColumns}
        setDynamicColumns={setDynamicColumns}
        columnValidationToast={columnValidationToast}
        setColumnValidationToast={setColumnValidationToast}
        onCreateColumn={handleCreateDynamicColumn}
      />

      <CommentsPanel
        commentsOpen={commentsOpen}
        setCommentsOpen={setCommentsOpen}
        comments={comments}
        setComments={setComments}
        commentsTaskId={commentsTaskId}
        setCommentsTaskId={setCommentsTaskId}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft}
        linkTitleDraft={linkTitleDraft}
        setLinkTitleDraft={setLinkTitleDraft}
        onAddComment={handleAddComment}
        onAddLinkComment={handleAddLinkComment}
        onDeleteComment={handleDeleteComment}
        user={user || undefined}
      />

      {moveCopyColumnId && (
        <div className="fixed inset-0 z-[240] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4">
            <div className="text-sm font-semibold text-text-primary">Mover / Copiar columna</div>
            <input
              type="text"
              value={moveCopyQuery}
              onChange={(e) => setMoveCopyQuery(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Buscar destino..."
            />
            <div className="mt-2 text-xs text-text-secondary">Antes de:</div>
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border">
              {columnOrder
                .filter((token) => token !== moveCopyColumnId)
                .filter((token) => {
                  const q = moveCopyQuery.trim().toLowerCase();
                  if (!q) return true;
                  const rc = renderColumns.find((c) => c.token === token);
                  const label = rc?.kind === 'dynamic' ? (rc.column.name || rc.label) : rc?.label || token;
                  return String(label).toLowerCase().includes(q);
                })
                .map((token) => {
                  const rc = renderColumns.find((c) => c.token === token);
                  const label = rc?.kind === 'dynamic' ? (rc.column.name || rc.label) : rc?.label || token;
                  const selected = moveCopyTargetId === token;
                  return (
                    <button
                      key={token}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary ${selected ? 'bg-person-1/10' : ''}`}
                      onClick={() => setMoveCopyTargetId(token as ColumnToken)}
                    >
                      {label}
                    </button>
                  );
                })}
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary ${moveCopyTargetId === '__end__' ? 'bg-person-1/10' : ''}`}
                onClick={() => setMoveCopyTargetId('__end__')}
              >
                (Poner al final)
              </button>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={moveCopyAsCopy}
                onChange={(e) => setMoveCopyAsCopy(e.target.checked)}
                className="h-4 w-4"
              />
              Copiar en lugar de mover
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="px-3 py-1.5 rounded border border-border text-sm" onClick={() => setMoveCopyColumnId(null)}>
                Cancelar
              </button>
              <button type="button" className="px-3 py-1.5 rounded bg-text-primary text-white text-sm" onClick={() => void handleMoveCopyColumn()}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
