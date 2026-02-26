import { useMemo, useRef, useState } from 'react';
import type { DynamicColumn, DynamicCellValue } from '@/lib/types';

// Define TaskComment interface locally since it's not exported from types
interface TaskComment {
  id: string;
  taskId: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  linkUrl?: string;
  linkTitle?: string;
}

type SortKey = keyof any;
type SortDir = 'asc' | 'desc';
type DropPlacement = 'before' | 'inside' | 'after';
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
  | 'balance';

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
  | 'balance';

type ColumnToken = `essential:${EssentialColumnId}` | `dynamic:${string}`;
type DynamicDisplayType = DynamicColumn['type'] | 'progress' | 'stars';

export function useProjectTableState() {
  // UI State
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [showRadar, setShowRadar] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  
  // Toasts and notifications
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [columnValidationToast, setColumnValidationToast] = useState<string | null>(null);
  const [uiToast, setUiToast] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  
  // Selection state
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  
  // Drag and drop state
  const [dragPreview, setDragPreview] = useState<{
    activeId: string | null;
    overId: string | null;
    placement: DropPlacement | null;
  }>({ activeId: null, overId: null, placement: null });
  
  // Layout and scrolling
  const [activeScrollRowId, setActiveScrollRowId] = useState<string | null>(null);
  const [stickyToolsHeight, setStickyToolsHeight] = useState(0);
  const [headerStickyHeight, setHeaderStickyHeight] = useState(40);
  
  // Dynamic columns state
  const [dynamicColumns, setDynamicColumns] = useState<DynamicColumn[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Map<string, Record<string, DynamicCellValue>>>(new Map());
  const [columnMenuOpenFor, setColumnMenuOpenFor] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  
  // Fixed header state
  const [fixedHeaderMenuOpenFor, setFixedHeaderMenuOpenFor] = useState<ColumnKey | null>(null);
  const [fixedHeaderNameTooltipFor, setFixedHeaderNameTooltipFor] = useState<ColumnKey | null>(null);
  
  // Column move/copy state
  const [moveCopyColumnId, setMoveCopyColumnId] = useState<ColumnToken | null>(null);
  const [moveCopyTargetId, setMoveCopyTargetId] = useState<ColumnToken | '__end__'>('__end__');
  const [moveCopyAsCopy, setMoveCopyAsCopy] = useState(false);
  const [moveCopyQuery, setMoveCopyQuery] = useState('');
  
  // New column dialog
  const [newColumnDialog, setNewColumnDialog] = useState<{
    open: boolean;
    position: number;
    name: string;
    type: DynamicDisplayType;
  } | null>(null);
  
  // Column editing state
  const [dragColumnToken, setDragColumnToken] = useState<ColumnToken | null>(null);
  const [columnTypePickerFor, setColumnTypePickerFor] = useState<string | null>(null);
  const [columnOptionsEditorFor, setColumnOptionsEditorFor] = useState<string | null>(null);
  const [columnOptionsDraft, setColumnOptionsDraft] = useState('');
  
  // Comments state
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [linkTitleDraft, setLinkTitleDraft] = useState('');
  
  // Catalogs and profiles
  const [branchCatalog, setBranchCatalog] = useState<string[]>([]);
  const [personProfiles, setPersonProfiles] = useState<Record<string, { avatarUrl?: string }>>({});
  
  // Column widths
  const defaultColumnWidths = useMemo<Record<ColumnKey, number>>(() => ({
    drag: 36,
    project: 300,
    branch: 124,
    start: 112,
    end: 112,
    assignees: 100,
    days: 96,
    priority: 84,
    type: 108,
    load: 92,
    balance: 92,
  }), []);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(defaultColumnWidths);
  
  // Layout state
  const [layoutSeedOrder, setLayoutSeedOrder] = useState<ColumnToken[] | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnToken[]>([]);
  
  // Refs
  const groupHintAtRef = useRef<number>(0);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const stickyToolsRef = useRef<HTMLDivElement>(null);
  const headerStickyRef = useRef<HTMLTableSectionElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const resizingColumnRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);
  const dynamicReloadTimerRef = useRef<number | null>(null);
  const dynamicRequestSeqRef = useRef(0);
  const dynamicAppliedSeqRef = useRef(0);
  
  // Column width constraints
  const minColumnWidths = useMemo<Record<ColumnKey, number>>(() => ({
    drag: 32,
    project: 190,
    branch: 92,
    start: 90,
    end: 90,
    assignees: 60,
    days: 72,
    priority: 70,
    type: 88,
    load: 72,
    balance: 72,
  }), []);
  
  const maxColumnWidths = useMemo<Record<ColumnKey, number>>(() => ({
    drag: 56,
    project: 720,
    branch: 280,
    start: 190,
    end: 190,
    assignees: 200,
    days: 180,
    priority: 150,
    type: 240,
    load: 160,
    balance: 160,
  }), []);

  return {
    // UI State
    sortKey, setSortKey,
    sortDir, setSortDir,
    search, setSearch,
    showRadar, setShowRadar,
    showUnscheduled, setShowUnscheduled,
    
    // Toasts
    exportToast, setExportToast,
    columnValidationToast, setColumnValidationToast,
    uiToast, setUiToast,
    
    // Selection
    selectedRowId, setSelectedRowId,
    multiSelectMode, setMultiSelectMode,
    selectedRowIds, setSelectedRowIds,
    lastSelectedRowId, setLastSelectedRowId,
    bulkMenuOpen, setBulkMenuOpen,
    
    // Drag and drop
    dragPreview, setDragPreview,
    
    // Layout
    activeScrollRowId, setActiveScrollRowId,
    stickyToolsHeight, setStickyToolsHeight,
    headerStickyHeight, setHeaderStickyHeight,
    
    // Dynamic columns
    dynamicColumns, setDynamicColumns,
    dynamicValues, setDynamicValues,
    columnMenuOpenFor, setColumnMenuOpenFor,
    editingColumnId, setEditingColumnId,
    editingColumnName, setEditingColumnName,
    
    // Fixed headers
    fixedHeaderMenuOpenFor, setFixedHeaderMenuOpenFor,
    fixedHeaderNameTooltipFor, setFixedHeaderNameTooltipFor,
    
    // Column move/copy
    moveCopyColumnId, setMoveCopyColumnId,
    moveCopyTargetId, setMoveCopyTargetId,
    moveCopyAsCopy, setMoveCopyAsCopy,
    moveCopyQuery, setMoveCopyQuery,
    
    // New column
    newColumnDialog, setNewColumnDialog,
    
    // Column editing
    dragColumnToken, setDragColumnToken,
    columnTypePickerFor, setColumnTypePickerFor,
    columnOptionsEditorFor, setColumnOptionsEditorFor,
    columnOptionsDraft, setColumnOptionsDraft,
    
    // Comments
    commentsTaskId, setCommentsTaskId,
    commentsOpen, setCommentsOpen,
    comments, setComments,
    commentDraft, setCommentDraft,
    linkUrlDraft, setLinkUrlDraft,
    linkTitleDraft, setLinkTitleDraft,
    
    // Catalogs
    branchCatalog, setBranchCatalog,
    personProfiles, setPersonProfiles,
    
    // Column widths
    columnWidths, setColumnWidths,
    defaultColumnWidths,
    minColumnWidths,
    maxColumnWidths,
    
    // Layout
    layoutSeedOrder, setLayoutSeedOrder,
    columnOrder, setColumnOrder,
    
    // Refs
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
  };
}

