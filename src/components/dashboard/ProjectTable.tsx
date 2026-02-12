import { useMemo, useState, useCallback, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { useProject } from '@/context/ProjectContext';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { formatDateShort, format } from '@/lib/dateUtils';
import { computeProjectFields } from '@/lib/workloadEngine';
import { parseAssignees } from '@/lib/assigneeHelpers';
import { exportToExcel, copyAsCSV } from '@/lib/exportUtils';
import { ExpandableCell, useHierarchyDisplay } from '@/components/dashboard/ExpandableCell';
import { validateNoCircles, getCollapsedMetricsSummary, getAncestors, getDescendants } from '@/lib/hierarchyEngine';
import {
  ArrowUpDown, Search, ChevronDown, ChevronRight, Plus, Trash2,
  Download, ClipboardCopy, Check, GripVertical, AlertTriangle, X, ArrowRight, ArrowLeft, Rows3,
} from 'lucide-react';
import type { Project } from '@/lib/types';
import {
  DndContext,
  closestCenter,
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

type SortKey = keyof Project;
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
  | 'balance'
  | 'actions';

// ─── Inline Editable Cell Components ──────────────────────────────

function EditableTextCell({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value); }, [value]);

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors ${className || ''}`}
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value || <span className="text-text-secondary/50 italic">{placeholder || '—'}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { setEditing(false); onChange(tempVal); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); onChange(tempVal); }
        if (e.key === 'Escape') { setEditing(false); setTempVal(value); }
      }}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
      placeholder={placeholder}
    />
  );
}

function EditableDateCell({
  value,
  onChange,
  hasError,
}: {
  value: Date | null;
  onChange: (v: Date | null) => void;
  hasError?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const dateStr = value
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : '';

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors tabular-nums ${
          hasError ? 'text-[#B71C1C] bg-accent-red/30' : ''
        }`}
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value ? formatDateShort(value) : <span className="text-text-secondary/50 italic">—</span>}
        {hasError && <AlertTriangle size={10} className="inline ml-1 text-[#B71C1C]" />}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="date"
      value={dateStr}
      onChange={(e) => {
        const val = e.target.value;
        if (val) {
          const [y, m, d] = val.split('-').map(Number);
          onChange(new Date(y, m - 1, d));
        } else {
          onChange(null);
        }
      }}
      onBlur={() => setEditing(false)}
      className="w-[130px] px-1 py-0.5 border border-person-1/40 rounded text-xs focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white tabular-nums"
    />
  );
}

function EditableNumberCell({
  value,
  onChange,
  min,
  max,
  hasWarning,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hasWarning?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(String(value)); }, [value]);

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors tabular-nums text-center ${
          hasWarning ? 'text-[#E2945E] bg-accent-orange/30' : ''
        }`}
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value || <span className="text-text-secondary/50">0</span>}
        {hasWarning && <AlertTriangle size={10} className="inline ml-1 text-[#E2945E]" />}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={tempVal}
      min={min}
      max={max}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { setEditing(false); onChange(Number(tempVal) || 0); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); onChange(Number(tempVal) || 0); }
        if (e.key === 'Escape') { setEditing(false); setTempVal(String(value)); }
      }}
      className="w-16 px-1 py-0.5 border border-person-1/40 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white tabular-nums"
    />
  );
}

function EditableSelectCell({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value || <span className="text-text-secondary/50 italic">{placeholder || '—'}</span>}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => { onChange(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      autoFocus
      className="px-1 py-0.5 border border-person-1/40 rounded text-xs focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
    >
      <option value="">{placeholder || '— Ninguno —'}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function EditableAssigneesCell({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.join(' / '));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value.join(' / ')); }, [value]);

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value.length > 0 ? value.join(' / ') : <span className="text-text-secondary/50 italic">—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { setEditing(false); onChange(parseAssignees(tempVal)); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); onChange(parseAssignees(tempVal)); }
        if (e.key === 'Escape') setEditing(false);
      }}
      placeholder="Ej: Eddy / Darío"
      className="w-[150px] px-1 py-0.5 border border-person-1/40 rounded text-xs focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
    />
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`text-sm transition-colors cursor-pointer ${
            star <= (hover || value) ? 'text-amber-500' : 'text-gray-300'
          }`}
          onMouseEnter={() => setHover(star)}
          onClick={() => onChange(star)}
          aria-label={`${star} estrellas`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ─── Sortable Row ──────────────────────────────────────────────────

function SortableRow({
  project,
  onUpdate,
  onDelete,
  onToggleExpand,
  hasChildren,
  allBranches,
  bgClass,
  allProjects,
  isLastSibling,
  childCount,
  onIndent,
  onOutdent,
  isSelected,
  onSelectRow,
  multiSelectMode,
  isChecked,
  onToggleChecked,
  isDropTarget,
  dropPlacement,
  rowRef,
}: {
  project: Project;
  onUpdate: (id: string, updates: Partial<Project>) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  hasChildren: boolean;
  allBranches: string[];
  bgClass?: string;
  allProjects: Project[];
  isLastSibling: boolean;
  childCount: number;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  isSelected: boolean;
  onSelectRow: (id: string) => void;
  multiSelectMode: boolean;
  isChecked: boolean;
  onToggleChecked: (id: string, checked: boolean) => void;
  isDropTarget: boolean;
  dropPlacement: DropPlacement | null;
  rowRef?: (node: HTMLTableRowElement | null) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(project.name);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  const hasDateError = project.startDate && project.endDate && project.startDate > project.endDate;
  const hasDaysWarning = project.startDate && project.endDate && project.daysRequired === 0;

  const types = ['Proyecto', 'Lanzamiento', 'En radar'];

  // Compute collapsed summary if parent is collapsed and has children
  const isCollapsed = hasChildren && !(project.isExpanded ?? true);
  const collapsedSummary = isCollapsed ? getCollapsedMetricsSummary(project.id, allProjects) : null;

  useEffect(() => {
    setEditNameValue(project.name);
  }, [project.name]);

  return (
    <tr
      ref={(node) => {
        setNodeRef(node);
        rowRef?.(node);
      }}
      style={style}
      className={`group relative h-10 transition-all duration-150 ${isSelected ? 'hover:bg-[#E3EEFF]' : 'hover:bg-accent-blue/5'} ${bgClass || ''} ${
        isDragging
          ? 'bg-accent-blue/15 shadow-md border-l-2 border-l-accent-blue'
          : isSelected
            ? 'bg-[#EAF2FF] border-l-2 border-l-[#3B82F6] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.28)]'
            : 'border-l-2 border-l-transparent'
      } ${
        isDropTarget && dropPlacement === 'inside'
          ? 'bg-[#EEF5FF] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.30)]'
          : ''
      } ${
        isDropTarget && dropPlacement === 'before'
          ? 'shadow-[inset_0_2px_0_0_rgba(59,130,246,0.9)]'
          : ''
      } ${
        isDropTarget && dropPlacement === 'after'
          ? 'shadow-[inset_0_-2px_0_0_rgba(59,130,246,0.9)]'
          : ''
      }`}
      onClick={() => onSelectRow(project.id)}
    >
            {/* Drag handle */}
      <td className="w-7 px-1 py-2 border-b border-border text-center group/handle bg-white">
        {multiSelectMode ? (
          <input
            type="checkbox"
            checked={isChecked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleChecked(project.id, e.target.checked)}
            className="h-3.5 w-3.5 accent-[#3B82F6] cursor-pointer"
            aria-label="Seleccionar fila"
          />
        ) : (
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className={`cursor-grab active:cursor-grabbing transition-all p-0.5 rounded hover:bg-accent-blue/10 ${
              isDragging || isSelected
                ? 'text-accent-blue opacity-100'
                : 'text-text-secondary/30 opacity-0 group-hover:text-text-secondary group-hover/handle:opacity-100'
            }`}
            aria-label="Reordenar"
            title="Arrastra para reordenar y cambiar jerarquía"
          >
            <GripVertical size={16} />
          </button>
        )}
      </td>

      {/* Name - with hierarchy support */}
      <td className="border-b border-border text-sm text-text-primary font-medium min-w-[200px] px-0 py-2 bg-white">
        <ExpandableCell
          project={project}
          hasChildren={hasChildren}
          isLastSibling={isLastSibling}
          childCount={childCount}
          onToggleExpand={onToggleExpand}
          isEditing={editingName}
          editValue={editNameValue}
          onEditChange={(v) => setEditNameValue(v)}
          onStartEdit={() => setEditingName(true)}
          onFinishEdit={(v) => {
            onUpdate(project.id, { name: v });
            setEditingName(false);
          }}
          onCancelEdit={() => {
            setEditingName(false);
            setEditNameValue(project.name);
          }}
          onIndent={onIndent}
          onOutdent={onOutdent}
        />
      </td>

      {/* Branch */}
      <td className="px-2 py-2 border-b border-border text-xs text-text-secondary min-w-[100px] bg-white">
        <EditableSelectCell
          value={project.branch}
          onChange={(v) => onUpdate(project.id, { branch: v })}
          options={allBranches}
          placeholder="Sucursal"
        />
      </td>

      {/* Start date */}
      <td className="px-2 py-2 border-b border-border text-xs bg-white">
        {isCollapsed && collapsedSummary ? (
          <div className="text-text-secondary">
            {collapsedSummary.startDate ? format(new Date(collapsedSummary.startDate), 'dd/MM') : '—'}
          </div>
        ) : (
          <EditableDateCell
            value={project.startDate}
            onChange={(v) => onUpdate(project.id, { startDate: v })}
            hasError={!!hasDateError}
          />
        )}
      </td>

      {/* End date */}
      <td className="px-2 py-2 border-b border-border text-xs bg-white">
        {isCollapsed && collapsedSummary ? (
          <div className="text-text-secondary">
            {collapsedSummary.endDate ? format(new Date(collapsedSummary.endDate), 'dd/MM') : '—'}
          </div>
        ) : (
          <EditableDateCell
            value={project.endDate}
            onChange={(v) => onUpdate(project.id, { endDate: v })}
            hasError={!!hasDateError}
          />
        )}
      </td>

      {/* Assignee */}
      <td className="px-2 py-2 border-b border-border text-xs min-w-[100px] bg-white">
        {isCollapsed && collapsedSummary ? (
          <div className="text-text-secondary">
            {collapsedSummary.assignees && collapsedSummary.assignees.length > 0
              ? collapsedSummary.assignees.join(' / ')
              : '—'}
          </div>
        ) : (
          <EditableAssigneesCell
            value={project.assignees}
            onChange={(v) => onUpdate(project.id, { assignees: v })}
          />
        )}
      </td>

      {/* Days required */}
      <td className="px-2 py-2 border-b border-border text-xs text-center bg-white">
        {isCollapsed && collapsedSummary ? (
          <div className="text-text-secondary">
            {collapsedSummary.daysRequired > 0 ? collapsedSummary.daysRequired : '—'}
          </div>
        ) : (
          <EditableNumberCell
            value={project.daysRequired}
            onChange={(v) => onUpdate(project.id, { daysRequired: v })}
            min={0}
            hasWarning={!!hasDaysWarning}
          />
        )}
      </td>

      {/* Priority */}
      <td className="px-2 py-2 border-b border-border bg-white">
        <StarRating
          value={project.priority}
          onChange={(v) => onUpdate(project.id, { priority: v })}
        />
      </td>

      {/* Type */}
      <td className="px-2 py-2 border-b border-border bg-white">
        <EditableSelectCell
          value={project.type}
          onChange={(v) => onUpdate(project.id, { type: v as Project['type'] })}
          options={types}
        />
      </td>

      {/* Load */}
      <td className="px-2 py-2 border-b border-border text-center bg-white">
        {project.dailyLoad > 0 ? (
          <LoadBubble load={project.dailyLoad} size="sm" />
        ) : (
          <span className="text-xs text-text-secondary">—</span>
        )}
      </td>

      {/* Balance */}
      <td className="px-2 py-2 text-xs text-text-secondary border-b border-border tabular-nums text-center bg-white">
        {project.assignedDays > 0 ? (
          <span className={project.balanceDays >= 0 ? 'text-[#2D6A2E]' : 'text-[#B71C1C]'}>
            {project.balanceDays > 0 ? '+' : ''}{project.balanceDays}d
          </span>
        ) : '—'}
      </td>

      {/* Row actions */}
      <td className="px-2 py-2 border-b border-border text-center w-20 bg-white">
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(project.id)}
              className="p-1 rounded bg-accent-red text-[#B71C1C] hover:bg-red-200 transition-colors"
              title="Confirmar eliminar"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="p-1 rounded bg-bg-secondary text-text-secondary hover:bg-gray-200 transition-colors text-xs"
              title="Cancelar"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 rounded text-text-secondary/30 hover:text-[#B71C1C] hover:bg-accent-red/30 transition-all opacity-0 group-hover:opacity-100"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        )}

      </td>
    </tr>
  );
}

// ─── Main ProjectTable ─────────────────────────────────────────────

export function ProjectTable() {
  const { state, dispatch, allBranches } = useProject();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [showRadar, setShowRadar] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [dragPreview, setDragPreview] = useState<{
    activeId: string | null;
    overId: string | null;
    placement: DropPlacement | null;
  }>({ activeId: null, overId: null, placement: null });
  const [activeScrollRowId, setActiveScrollRowId] = useState<string | null>(null);
  const [stickyToolsHeight, setStickyToolsHeight] = useState(0);
  const [contextBarHeight, setContextBarHeight] = useState(0);
  const [headerStickyHeight, setHeaderStickyHeight] = useState(40);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>({
    drag: 36,
    project: 300,
    branch: 140,
    start: 120,
    end: 120,
    assignees: 180,
    days: 112,
    priority: 92,
    type: 124,
    load: 92,
    balance: 92,
    actions: 84,
  });
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const stickyToolsRef = useRef<HTMLDivElement>(null);
  const contextBarRef = useRef<HTMLDivElement>(null);
  const headerStickyRef = useRef<HTMLTableSectionElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const resizingColumnRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);

  const minColumnWidths: Record<ColumnKey, number> = {
    drag: 32,
    project: 220,
    branch: 120,
    start: 112,
    end: 112,
    assignees: 150,
    days: 96,
    priority: 84,
    type: 104,
    load: 84,
    balance: 84,
    actions: 72,
  };
  const maxColumnWidths: Record<ColumnKey, number> = {
    drag: 56,
    project: 720,
    branch: 280,
    start: 190,
    end: 190,
    assignees: 380,
    days: 180,
    priority: 150,
    type: 240,
    load: 160,
    balance: 160,
    actions: 130,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const handleUpdate = useCallback((id: string, updates: Partial<Project>) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates } });
  }, [dispatch]);

  const handleDelete = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, [dispatch]);

  const handleToggleChecked = useCallback((id: string, checked: boolean) => {
    setMultiSelectMode(true);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRowId(null);
    setSelectedRowIds(new Set());
    setMultiSelectMode(false);
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_EXPANSION', payload: id });
  }, [dispatch]);

  const handleIndent = useCallback((projectId: string) => {
    const order = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map(p => p.id);
    const idx = order.indexOf(projectId);
    if (idx <= 0) return;
    const targetParentId = order[idx - 1];
    if (!targetParentId) return;

    // Validate
    if (!validateNoCircles(projectId, targetParentId, state.projects)) return;

    dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId, newParentId: targetParentId } });

    // Move project to be right after parent
    const parentPos = order.indexOf(targetParentId);
    const newOrder = (() => {
      const copy = [...order];
      const [item] = copy.splice(idx, 1);
      copy.splice(parentPos + 1, 0, item);
      return copy;
    })();
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
  }, [state.projectOrder, state.projects, dispatch]);

  const handleOutdent = useCallback((projectId: string) => {
    const order = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map(p => p.id);
    const idx = order.indexOf(projectId);
    if (idx === -1) return;
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    const currentParentId = project.parentId;
    if (!currentParentId) return; // already root

    const parentProject = state.projects.find(p => p.id === currentParentId);
    const newParentId = parentProject?.parentId ?? null;

    // Validate
    if (!validateNoCircles(projectId, newParentId, state.projects)) return;

    dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId, newParentId } });

    // Move project to after current parent
    const parentPos = order.indexOf(currentParentId);
    const insertPos = Math.min(parentPos + 1, order.length);
    const newOrder = (() => {
      const copy = [...order];
      const [item] = copy.splice(idx, 1);
      copy.splice(insertPos, 0, item);
      return copy;
    })();
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
  }, [state.projectOrder, state.projects, dispatch]);

  const handleAddProject = useCallback(() => {
    const newProject = computeProjectFields({
      id: `proj-new-${Date.now()}`,
      name: '',
      branch: '',
      startDate: null,
      endDate: null,
      assignees: [],
      daysRequired: 0,
      priority: 1,
      type: 'Proyecto',
      blockedBy: null,
      blocksTo: null,
      reportedLoad: null,
    }, state.config);
    dispatch({ type: 'ADD_PROJECT', payload: newProject });
  }, [state.config, dispatch]);

  const handleExportExcel = useCallback(() => {
    exportToExcel(state.projects, state.fileName || undefined);
    setExportToast('✓ Archivo Excel exportado');
    setTimeout(() => setExportToast(null), 3000);
  }, [state.projects, state.fileName]);

  const handleCopyCSV = useCallback(() => {
    copyAsCSV(state.projects);
    setExportToast('✓ Datos copiados al portapapeles');
    setTimeout(() => setExportToast(null), 3000);
  }, [state.projects]);

    const computeDropPlacement = useCallback((activeId: string, overId: string, deltaX: number): DropPlacement => {
    const currentOrder = state.projectOrder.length > 0
      ? state.projectOrder
      : state.projects.map((p) => p.id);
    const oldIndex = currentOrder.indexOf(activeId);
    const newIndex = currentOrder.indexOf(overId);
    const INDENT_THRESHOLD = 40;
    if (deltaX > INDENT_THRESHOLD) return 'inside';
    if (oldIndex === -1 || newIndex === -1) return 'after';
    return newIndex > oldIndex ? 'after' : 'before';
  }, [state.projectOrder, state.projects]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragPreview({
      activeId: String(event.active.id),
      overId: null,
      placement: null,
    });
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over, delta } = event;
    if (!over || active.id === over.id) return;
    const placement = computeDropPlacement(String(active.id), String(over.id), delta?.x ?? 0);
    setDragPreview({
      activeId: String(active.id),
      overId: String(over.id),
      placement,
    });
  }, [computeDropPlacement]);

  const handleDragCancel = useCallback(() => {
    setDragPreview({ activeId: null, overId: null, placement: null });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    if (!over || active.id === over.id) {
      setDragPreview({ activeId: null, overId: null, placement: null });
      return;
    }

    const currentOrder = state.projectOrder.length > 0
      ? [...state.projectOrder]
      : state.projects.map((p) => p.id);

    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) {
      setDragPreview({ activeId: null, overId: null, placement: null });
      return;
    }

    const deltaX = delta?.x ?? 0;
    const INDENT_THRESHOLD = 40;
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

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeProject = state.projects.find((p) => p.id === activeId);
    const targetProject = state.projects.find((p) => p.id === overId);
    const blockIds = getSubtreeIdsInOrder(activeId, currentOrder);
    const blockSet = new Set(blockIds);

    if (blockSet.has(overId)) {
      setDragPreview({ activeId: null, overId: null, placement: null });
      return;
    }

    const placement = dragPreview.overId === overId && dragPreview.placement
      ? dragPreview.placement
      : computeDropPlacement(activeId, overId, deltaX);

    if (placement === 'inside' && targetProject) {
      if (validateNoCircles(activeId, overId, state.projects)) {
        dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId: activeId, newParentId: overId } });
        dispatch({ type: 'UPDATE_PROJECT', payload: { id: overId, updates: { isExpanded: true } } });
        const targetPos = currentOrder.indexOf(overId);
        const newOrder = moveBlock(currentOrder, blockIds, targetPos + 1);
        dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
      }
      setDragPreview({ activeId: null, overId: null, placement: null });
      return;
    }

    if (deltaX < -INDENT_THRESHOLD) {
      if (!activeProject) {
        setDragPreview({ activeId: null, overId: null, placement: null });
        return;
      }
      const currentParentId = activeProject.parentId || null;
      if (currentParentId) {
        const parentProject = state.projects.find((p) => p.id === currentParentId);
        const newParentId = parentProject?.parentId ?? null;
        dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId: activeId, newParentId } });

        const parentPos = currentOrder.indexOf(currentParentId);
        const insertPos = parentPos + 1;
        const newOrder = moveBlock(currentOrder, blockIds, insertPos);
        dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
      }
      setDragPreview({ activeId: null, overId: null, placement: null });
      return;
    }

    if (targetProject) {
      const targetParentId = targetProject.parentId ?? null;
      if (validateNoCircles(activeId, targetParentId, state.projects)) {
        dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId: activeId, newParentId: targetParentId } });
      }
    }

    const adjustedTarget = placement === 'after' ? newIndex + 1 : newIndex;
    const insertIndex = oldIndex < adjustedTarget ? adjustedTarget - blockIds.length : adjustedTarget;
    const newOrder = moveBlock(currentOrder, blockIds, insertIndex);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    setDragPreview({ activeId: null, overId: null, placement: null });
  }, [state.projectOrder, state.projects, dispatch, dragPreview.overId, dragPreview.placement, computeDropPlacement]);

  const branchOptions = useMemo(() => {
    const set = new Set(allBranches);
    state.projects.forEach(p => { if (p.branch) set.add(p.branch); });
    return Array.from(set).sort();
  }, [allBranches, state.projects]);

  // Get hierarchy display info (visible projects, children map)
  const { childrenMap } = useHierarchyDisplay(state.projects);
  const currentOrder = useMemo(
    () => (state.projectOrder.length > 0 ? state.projectOrder : state.projects.map((p) => p.id)),
    [state.projectOrder, state.projects]
  );
  const indexById = useMemo(
    () => new Map(currentOrder.map((id, idx) => [id, idx])),
    [currentOrder]
  );
  const isLastSibling = useCallback((projectId: string) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project?.parentId) return false;
    const siblings = state.projects
      .filter((p) => p.parentId === project.parentId)
      .sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0));
    return siblings.length > 0 && siblings[siblings.length - 1]?.id === projectId;
  }, [state.projects, indexById]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedRowId || multiSelectMode) return;
      if (e.key !== 'Tab') return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      const editable = target.getAttribute('contenteditable');
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable === 'true') return;

      e.preventDefault();
      if (e.shiftKey) {
        handleOutdent(selectedRowId);
      } else {
        handleIndent(selectedRowId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRowId, multiSelectMode, handleIndent, handleOutdent]);

  const selectedProject = useMemo(
    () => state.projects.find((p) => p.id === selectedRowId) ?? null,
    [selectedRowId, state.projects]
  );
  const canIndentSelected = useMemo(
    () => !!selectedProject && (indexById.get(selectedProject.id) ?? -1) > 0,
    [selectedProject, indexById]
  );
  const canOutdentSelected = useMemo(
    () => !!selectedProject?.parentId,
    [selectedProject]
  );

  const sorted = useMemo(() => {
    // First apply hierarchy visibility (respect expansion state)
    const hierarchyFiltered = state.projects.filter(p => {
      if (!p.parentId) return true; // Root projects always visible
      
      // Check if any ancestor is collapsed
      let current: string | null = p.parentId ?? null;
      while (current) {
        const parent = state.projects.find(pr => pr.id === current);
        if (!parent?.isExpanded) return false;
        current = parent?.parentId ?? null;
      }
      return true;
    });

    // Then apply search and type filtering
    const filtered = hierarchyFiltered.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    const scheduled = filtered.filter((p) => p.startDate && p.endDate && p.type !== 'En radar');
    const unscheduled = filtered.filter((p) => (!p.startDate || !p.endDate) && p.type !== 'En radar');
    const radar = filtered.filter((p) => p.type === 'En radar');

    if (sortKey) {
      const sortFn = (a: Project, b: Project) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal instanceof Date && bVal instanceof Date) {
          return sortDir === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
        }
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal);
        const bStr = String(bVal);
        return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      };
      scheduled.sort(sortFn);
    }

    return { scheduled, unscheduled, radar };
  }, [state.projects, sortKey, sortDir, search]);

  const renderedProjectIds = useMemo(() => {
    const ids = [...sorted.scheduled.map((p) => p.id)];
    if (showUnscheduled) ids.push(...sorted.unscheduled.map((p) => p.id));
    if (showRadar) ids.push(...sorted.radar.map((p) => p.id));
    return ids;
  }, [sorted.scheduled, sorted.unscheduled, sorted.radar, showUnscheduled, showRadar]);

  const stickyAncestorRows = useMemo(() => {
    if (!activeScrollRowId) return [];
    return getAncestors(activeScrollRowId, state.projects).reverse();
  }, [activeScrollRowId, state.projects]);

  useEffect(() => {
    if (!stickyToolsRef.current) return;
    const update = () => setStickyToolsHeight(stickyToolsRef.current?.offsetHeight ?? 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stickyToolsRef.current);
    return () => ro.disconnect();
  }, []);

  const tableWidthPx = useMemo(
    () => Object.values(columnWidths).reduce((sum, w) => sum + w, 0),
    [columnWidths]
  );

  useEffect(() => {
    if (!contextBarRef.current) {
      setContextBarHeight(0);
      return;
    }
    const update = () => setContextBarHeight(contextBarRef.current?.offsetHeight ?? 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(contextBarRef.current);
    return () => ro.disconnect();
  }, [selectedProject, multiSelectMode, selectedRowIds.size]);

  useEffect(() => {
    if (!headerStickyRef.current) return;
    const update = () => setHeaderStickyHeight(headerStickyRef.current?.offsetHeight ?? 40);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(headerStickyRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container) return;

    const updateActiveRow = () => {
      if (renderedProjectIds.length === 0) {
        setActiveScrollRowId(null);
        return;
      }
      const anchorY = container.getBoundingClientRect().top + stickyToolsHeight + contextBarHeight + headerStickyHeight + 6;
      let candidate: string | null = renderedProjectIds[0] ?? null;
      for (const id of renderedProjectIds) {
        const rowEl = rowRefs.current[id];
        if (!rowEl) continue;
        const top = rowEl.getBoundingClientRect().top;
        if (top <= anchorY) candidate = id;
        else break;
      }
      setActiveScrollRowId(candidate);
    };

    updateActiveRow();
    container.addEventListener('scroll', updateActiveRow, { passive: true });
    window.addEventListener('resize', updateActiveRow);
    return () => {
      container.removeEventListener('scroll', updateActiveRow);
      window.removeEventListener('resize', updateActiveRow);
    };
  }, [renderedProjectIds, stickyToolsHeight, contextBarHeight, headerStickyHeight]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      const { key, startX, startWidth } = resizingColumnRef.current;
      const delta = e.clientX - startX;
      const next = Math.min(
        maxColumnWidths[key],
        Math.max(minColumnWidths[key], startWidth + delta)
      );
      setColumnWidths((prev) => ({ ...prev, [key]: next }));
    };

    const onMouseUp = () => {
      resizingColumnRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startColumnResize = (key: ColumnKey, e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key],
    };
  };

  const SortHeader = ({
    label,
    field,
    colKey,
    className,
    roundedLeft,
    roundedRight,
  }: {
    label: string;
    field: SortKey;
    colKey: ColumnKey;
    className?: string;
    roundedLeft?: boolean;
    roundedRight?: boolean;
  }) => (
    <th
      className={`group relative bg-white px-2 py-2.5 text-left text-xs font-semibold text-text-secondary cursor-pointer hover:text-text-primary transition-colors select-none border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] ${
        roundedLeft ? 'rounded-tl-lg' : ''
      } ${roundedRight ? 'rounded-tr-lg' : ''} ${className || ''}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortKey === field ? 'text-text-primary' : 'opacity-30'} />
      </span>
      <div
        onMouseDown={(e) => startColumnResize(colKey, e)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
        title="Arrastrar para cambiar ancho"
      >
        <div className="mx-auto h-full w-px bg-text-secondary/25" />
      </div>
    </th>
  );

  try {
    return (
      <div
        ref={contentScrollRef}
        className="px-4 pb-4 pt-0 flex-1 overflow-auto"
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-selection-safe]')) clearSelection();
        }}
      >
      <div data-selection-safe ref={stickyToolsRef} className="sticky top-0 z-40 -mx-4 px-4 bg-bg-secondary border-b border-border/60">
      {/* Top bar */}
      <div className="py-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proyecto..."
            className="w-full pl-8 pr-3 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 focus:border-person-1"
          />
        </div>

        <span className="text-xs text-text-secondary">
          {state.projects.length} proyectos
        </span>

        <div className="flex-1" />

        {(selectedRowId || selectedRowIds.size > 0) && (
          <button
            onClick={clearSelection}
            className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary rounded-md border border-border bg-white/70 hover:bg-white transition-colors"
            title="Deseleccionar"
          >
            Deseleccionar
          </button>
        )}

        {/* Add project button */}
        <button
          onClick={handleAddProject}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-text-primary text-white rounded-md hover:bg-[#2c2a25] transition-colors"
        >
          <Plus size={14} />
          Nuevo proyecto
        </button>

        {/* Export buttons */}
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-white border border-border rounded-md transition-all"
          title="Exportar a Excel"
        >
          <Download size={14} />
          Excel
        </button>

        <button
          onClick={handleCopyCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-white border border-border rounded-md transition-all"
          title="Copiar como CSV al portapapeles"
        >
          <ClipboardCopy size={14} />
          CSV
        </button>
      </div>
      </div>

      <div
        data-selection-safe
        ref={contextBarRef}
        className="sticky z-35 bg-bg-secondary"
        style={{ top: stickyToolsHeight }}
      >
      {!multiSelectMode && selectedProject && (
        <div className="mb-2 mt-2 flex items-center gap-2 rounded-lg border border-[#DBEAFE] bg-[#F8FAFF] px-3 py-2">
          <button
            onClick={() => handleIndent(selectedProject.id)}
            disabled={!canIndentSelected}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#BFDBFE] bg-white text-[#1E40AF] hover:bg-[#EAF2FF] hover:border-[#93C5FD] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            title={canIndentSelected ? 'Agregar sangria' : 'No se puede agregar sangria en esta posicion'}
          >
            <ArrowRight size={12} />
            Agregar sangria
          </button>
          <button
            onClick={() => handleOutdent(selectedProject.id)}
            disabled={!canOutdentSelected}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#BFDBFE] bg-white text-[#1E40AF] hover:bg-[#EAF2FF] hover:border-[#93C5FD] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            title={canOutdentSelected ? 'Reducir sangria' : 'Este elemento ya esta al nivel raiz'}
          >
            <ArrowLeft size={12} />
            Reducir sangria
          </button>
          <button
            onClick={() => handleToggleChecked(selectedProject.id, true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#BFDBFE] bg-white text-[#1E40AF] hover:bg-[#EAF2FF] hover:border-[#93C5FD] transition-colors"
          >
            <Rows3 size={12} />
            Seleccionar varios
          </button>
        </div>
      )}

      {multiSelectMode && (
        <div className="mb-2 mt-2 flex items-center gap-2 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2">
          <span className="text-xs font-medium text-[#1E40AF]">
            {selectedRowIds.size} elemento{selectedRowIds.size === 1 ? '' : 's'} seleccionado{selectedRowIds.size === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setSelectedRowIds(new Set(state.projects.map((p) => p.id)))}
            className="text-xs px-2 py-1 rounded border border-[#BFDBFE] bg-white text-[#1E40AF] hover:bg-[#DBEAFE]"
          >
            Seleccionar todo
          </button>
          <button
            onClick={() => setSelectedRowIds(new Set())}
            className="text-xs px-2 py-1 rounded border border-[#BFDBFE] bg-white text-[#1E40AF] hover:bg-[#DBEAFE]"
          >
            Cancelar seleccion
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              setMultiSelectMode(false);
              setSelectedRowIds(new Set());
            }}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#BFDBFE] bg-white text-[#1E40AF] hover:bg-[#DBEAFE]"
          >
            <X size={12} />
            Salir
          </button>
        </div>
      )}
      </div>

      {!multiSelectMode && stickyAncestorRows.length > 0 && (
        <>
          {stickyAncestorRows.map((row, idx) => (
            <div
              key={row.id}
              data-selection-safe
              className="sticky z-30 border-x border-border border-b border-border bg-white"
              style={{ top: stickyToolsHeight + contextBarHeight + headerStickyHeight + idx * 28 - 1 }}
            >
              <div
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-text-primary"
                style={{ paddingLeft: `${28 + idx * 40}px` }}
              >
                {(childrenMap.get(row.id)?.length ?? 0) > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'TOGGLE_EXPANSION', payload: row.id });
                    }}
                    className="p-0.5 rounded hover:bg-bg-secondary text-text-secondary"
                    title={(row.isExpanded ?? true) ? 'Contraer' : 'Expandir'}
                    aria-label={(row.isExpanded ?? true) ? 'Contraer' : 'Expandir'}
                  >
                    {(row.isExpanded ?? true) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
                <span>{row.name || 'Sin nombre'}</span>
              </div>
            </div>
          ))}
        </>
      )}

      <div
        data-selection-safe
        className="bg-white rounded-lg border border-border overflow-visible"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) clearSelection();
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="inline-block min-w-full align-top" style={{ width: `${tableWidthPx}px` }}>
          <table
            className="border-separate border-spacing-0 table-fixed"
            style={{ width: `${tableWidthPx}px`, minWidth: '100%' }}
          >
            <colgroup>
              <col style={{ width: columnWidths.drag }} />
              <col style={{ width: columnWidths.project }} />
              <col style={{ width: columnWidths.branch }} />
              <col style={{ width: columnWidths.start }} />
              <col style={{ width: columnWidths.end }} />
              <col style={{ width: columnWidths.assignees }} />
              <col style={{ width: columnWidths.days }} />
              <col style={{ width: columnWidths.priority }} />
              <col style={{ width: columnWidths.type }} />
              <col style={{ width: columnWidths.load }} />
              <col style={{ width: columnWidths.balance }} />
              <col style={{ width: columnWidths.actions }} />
            </colgroup>
            <thead ref={headerStickyRef} style={{ top: stickyToolsHeight + contextBarHeight }} className="sticky z-20">
              <tr className="h-11 bg-white">
                <th
                  style={{ top: stickyToolsHeight + contextBarHeight }}
                  className="sticky z-20 bg-white w-7 px-1 py-2.5 border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] rounded-tl-lg"
                /> {/* Drag handle */}
                <SortHeader label="Proyecto" field="name" colKey="project" />
                <SortHeader label="Sucursal" field="branch" colKey="branch" />
                <SortHeader label="Inicio" field="startDate" colKey="start" />
                <SortHeader label="Fin" field="endDate" colKey="end" />
                <SortHeader label="Asignado" field="assignees" colKey="assignees" />
                <SortHeader label="Días req." field="daysRequired" colKey="days" />
                <SortHeader label="Prior." field="priority" colKey="priority" />
                <SortHeader label="Tipo" field="type" colKey="type" />
                <th
                  style={{ top: stickyToolsHeight + contextBarHeight }}
                  className="group relative sticky z-20 bg-white px-2 py-2.5 text-center text-xs font-semibold text-text-secondary border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)]"
                >
                  Carga
                  <div
                    onMouseDown={(e) => startColumnResize('load', e)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Arrastrar para cambiar ancho"
                  >
                    <div className="mx-auto h-full w-px bg-text-secondary/25" />
                  </div>
                </th>
                <th
                  style={{ top: stickyToolsHeight + contextBarHeight }}
                  className="group relative sticky z-20 bg-white px-2 py-2.5 text-center text-xs font-semibold text-text-secondary border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)]"
                >
                  Balance
                  <div
                    onMouseDown={(e) => startColumnResize('balance', e)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Arrastrar para cambiar ancho"
                  >
                    <div className="mx-auto h-full w-px bg-text-secondary/25" />
                  </div>
                </th>
                <th
                  style={{ top: stickyToolsHeight + contextBarHeight }}
                  className="sticky z-20 bg-white w-20 px-2 py-2.5 border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)]"
                /> {/* Actions */}
              </tr>
            </thead>
            <tbody>
              {/* Scheduled projects */}
              <SortableContext items={sorted.scheduled.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {sorted.scheduled.map((p) => (
                  <SortableRow
                    key={p.id}
                    project={p}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onToggleExpand={handleToggleExpand}
                    hasChildren={(childrenMap.get(p.id)?.length ?? 0) > 0}
                    allBranches={branchOptions}
                    allProjects={state.projects}
                    isLastSibling={isLastSibling(p.id)}
                    childCount={childrenMap.get(p.id)?.length ?? 0}
                    onIndent={(id) => handleIndent(id)}
                    onOutdent={(id) => handleOutdent(id)}
                    isSelected={multiSelectMode ? selectedRowIds.has(p.id) : selectedRowId === p.id}
                    onSelectRow={(id) => {
                      if (multiSelectMode) {
                        setSelectedRowIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      } else {
                        setSelectedRowId(id);
                      }
                    }}
                    multiSelectMode={multiSelectMode}
                    isChecked={selectedRowIds.has(p.id)}
                    onToggleChecked={handleToggleChecked}
                    isDropTarget={dragPreview.overId === p.id && dragPreview.activeId !== p.id}
                    dropPlacement={dragPreview.overId === p.id ? dragPreview.placement : null}
                    rowRef={(node) => { rowRefs.current[p.id] = node; }}
                  />
                ))}
              </SortableContext>

              {/* Unscheduled section */}
              {sorted.unscheduled.length > 0 && (
                <>
                  <tr>
                    <td colSpan={12} className="px-3 py-2 bg-accent-yellow/30 border-b border-border">
                      <button
                        onClick={() => setShowUnscheduled(!showUnscheduled)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-text-primary"
                      >
                        {showUnscheduled ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Sin programar ({sorted.unscheduled.length})
                      </button>
                    </td>
                  </tr>
                  {showUnscheduled && (
                    <SortableContext items={sorted.unscheduled.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {sorted.unscheduled.map((p) => (
                        <SortableRow
                          key={p.id}
                          project={p}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                          onToggleExpand={handleToggleExpand}
                          hasChildren={(childrenMap.get(p.id)?.length ?? 0) > 0}
                          allBranches={branchOptions}
                          bgClass="bg-accent-yellow/5"
                          allProjects={state.projects}
                          isLastSibling={isLastSibling(p.id)}
                          childCount={childrenMap.get(p.id)?.length ?? 0}
                          onIndent={(id) => handleIndent(id)}
                          onOutdent={(id) => handleOutdent(id)}
                          isSelected={multiSelectMode ? selectedRowIds.has(p.id) : selectedRowId === p.id}
                          onSelectRow={(id) => {
                            if (multiSelectMode) {
                              setSelectedRowIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              });
                            } else {
                              setSelectedRowId(id);
                            }
                          }}
                          multiSelectMode={multiSelectMode}
                          isChecked={selectedRowIds.has(p.id)}
                          onToggleChecked={handleToggleChecked}
                          isDropTarget={dragPreview.overId === p.id && dragPreview.activeId !== p.id}
                          dropPlacement={dragPreview.overId === p.id ? dragPreview.placement : null}
                          rowRef={(node) => { rowRefs.current[p.id] = node; }}
                        />
                      ))}
                    </SortableContext>
                  )}
                </>
              )}

              {/* Radar section */}
              {sorted.radar.length > 0 && (
                <>
                  <tr>
                    <td colSpan={12} className="px-3 py-2 bg-bg-secondary border-b border-border">
                      <button
                        onClick={() => setShowRadar(!showRadar)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary"
                      >
                        {showRadar ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        En radar ({sorted.radar.length})
                      </button>
                    </td>
                  </tr>
                  {showRadar && (
                    <SortableContext items={sorted.radar.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {sorted.radar.map((p) => (
                        <SortableRow
                          key={p.id}
                          project={p}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                          onToggleExpand={handleToggleExpand}
                          hasChildren={(childrenMap.get(p.id)?.length ?? 0) > 0}
                          allBranches={branchOptions}
                          bgClass="opacity-60"
                          allProjects={state.projects}
                          isLastSibling={isLastSibling(p.id)}
                          childCount={childrenMap.get(p.id)?.length ?? 0}
                          onIndent={(id) => handleIndent(id)}
                          onOutdent={(id) => handleOutdent(id)}
                          isSelected={multiSelectMode ? selectedRowIds.has(p.id) : selectedRowId === p.id}
                          onSelectRow={(id) => {
                            if (multiSelectMode) {
                              setSelectedRowIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              });
                            } else {
                              setSelectedRowId(id);
                            }
                          }}
                          multiSelectMode={multiSelectMode}
                          isChecked={selectedRowIds.has(p.id)}
                          onToggleChecked={handleToggleChecked}
                          isDropTarget={dragPreview.overId === p.id && dragPreview.activeId !== p.id}
                          dropPlacement={dragPreview.overId === p.id ? dragPreview.placement : null}
                          rowRef={(node) => { rowRefs.current[p.id] = node; }}
                        />
                      ))}
                    </SortableContext>
                  )}
                </>
              )}
            </tbody>
          </table>
          </div>
        </DndContext>

        {/* Empty state */}
        {state.projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
              <Search size={28} className="text-text-secondary/50" />
            </div>
            <p className="text-sm font-medium">No hay proyectos</p>
            <p className="text-xs mt-1">Agrega un nuevo proyecto o ajusta los filtros.</p>
          </div>
        )}
      </div>

      {/* Export toast */}
      {exportToast && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-sm shadow-lg bg-accent-green text-[#2D6A2E] flex items-center gap-2 fade-in">
          <Check size={16} />
          {exportToast}
        </div>
      )}
      </div>
    );
  } catch (err) {
    // Render a helpful error message instead of leaving the screen blank
    // Log to console for debugging
    // eslint-disable-next-line no-console
    console.error('ProjectTable render error:', err);
    return (
      <div className="p-6">
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          <strong>Error al renderizar la vista Tabla:</strong>
          <div className="mt-2">{String(err)}</div>
          <div className="mt-2 text-xs text-text-secondary">Revisa la consola del navegador para más detalles.</div>
        </div>
      </div>
    );
  }
}




