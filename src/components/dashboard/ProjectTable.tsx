import { useMemo, useState, useCallback, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { formatDateShort, format } from '@/lib/dateUtils';
import { computeProjectFields } from '@/lib/workloadEngine';
import { parseAssignees } from '@/lib/assigneeHelpers';
import { exportToExcel, copyAsCSV } from '@/lib/exportUtils';
import { ExpandableCell, useHierarchyDisplay } from '@/components/dashboard/ExpandableCell';
import { validateNoCircles, getCollapsedMetricsSummary, getAncestors, getDescendants } from '@/lib/hierarchyEngine';
import {
  Search, ChevronDown, ChevronRight, Plus, Trash2,
  Download, ClipboardCopy, Check, GripVertical, AlertTriangle,
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

// â”€â”€â”€ Inline Editable Cell Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        {value || <span className="text-text-secondary/50 italic">{placeholder || 'â€”'}</span>}
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
        {value ? formatDateShort(value) : <span className="text-text-secondary/50 italic">â€”</span>}
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
        {value || <span className="text-text-secondary/50 italic">{placeholder || 'â€”'}</span>}
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
      <option value="">{placeholder || 'â€” Ninguno â€”'}</option>
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
        {value.length > 0 ? value.join(' / ') : <span className="text-text-secondary/50 italic">â€”</span>}
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
      placeholder="Ej: Eddy / DarÃ­o"
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
          â˜…
        </button>
      ))}
    </div>
  );
}

// â”€â”€â”€ Sortable Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  onAddAbove,
  onAddBelow,
  onDuplicateRow,
  onMoveToParent,
  dynamicColumns,
  dynamicValues,
  onUpdateDynamicCell,
  remoteEditingLabel,
  onPresenceChange,
  onOpenComments,
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
  onAddAbove: (id: string) => void;
  onAddBelow: (id: string) => void;
  onDuplicateRow: (id: string) => void;
  onMoveToParent: (id: string, parentId: string | null) => void;
  dynamicColumns: DynamicColumn[];
  dynamicValues?: Record<string, DynamicCellValue>;
  onUpdateDynamicCell: (taskId: string, columnId: string, value: DynamicCellValue) => void;
  remoteEditingLabel?: string;
  onPresenceChange: (rowId: string | null) => void;
  onOpenComments: (taskId: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(project.name);
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [moveToQuery, setMoveToQuery] = useState('');
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  
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
  const disallowedParentIds = useMemo(
    () => new Set([project.id, ...getDescendants(project.id, allProjects).map((d) => d.id)]),
    [project.id, allProjects]
  );
  const parentOptions = useMemo(
    () => allProjects.filter((p) => !disallowedParentIds.has(p.id)),
    [allProjects, disallowedParentIds]
  );
  const filteredParentOptions = useMemo(() => {
    const q = moveToQuery.trim().toLowerCase();
    if (!q) return parentOptions;
    return parentOptions.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [parentOptions, moveToQuery]);

  useEffect(() => {
    setEditNameValue(project.name);
  }, [project.name]);

  useEffect(() => {
    if (!rowMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setRowMenuOpen(false);
        setMoveToOpen(false);
        setMoveToQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [rowMenuOpen]);

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
      onFocusCapture={() => onPresenceChange(project.id)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        const current = e.currentTarget as HTMLTableRowElement;
        if (!next || !current.contains(next)) onPresenceChange(null);
      }}
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
          <div className="relative" ref={rowMenuRef}>
            <button
              {...attributes}
              {...listeners}
              onClick={(e) => {
                e.stopPropagation();
                setRowMenuOpen((v) => !v);
              }}
              className={`cursor-grab active:cursor-grabbing transition-all p-0.5 rounded hover:bg-accent-blue/10 ${
                isDragging || isSelected
                  ? 'text-accent-blue opacity-100'
                  : 'text-text-secondary/30 opacity-0 group-hover:text-text-secondary group-hover/handle:opacity-100'
              }`}
              aria-label="Opciones de fila"
              title="Arrastra para mover o haz clic para acciones"
            >
              <GripVertical size={16} />
            </button>
            {rowMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-6 top-0 z-[170] min-w-[220px] rounded-lg border border-border bg-white shadow-lg p-1"
              >
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={() => { onAddAbove(project.id); setRowMenuOpen(false); }}>Agregar fila arriba</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={() => { onAddBelow(project.id); setRowMenuOpen(false); }}>Agregar fila debajo</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={() => { onDuplicateRow(project.id); setRowMenuOpen(false); }}>Duplicar fila</button>
                <button
                  className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
                  onClick={() => {
                    onOpenComments(project.id);
                    setRowMenuOpen(false);
                  }}
                >
                  Comentarios...
                </button>
                <div className="relative">
                  <button
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
                    onClick={() => {
                      setMoveToOpen((v) => !v);
                      setMoveToQuery('');
                    }}
                  >
                    Mover a...
                  </button>
                  {moveToOpen && (
                    <div className="absolute left-[calc(100%+4px)] top-0 z-[180] min-w-[230px] max-h-56 overflow-auto rounded-lg border border-border bg-white shadow-lg p-1">
                      <input
                        value={moveToQuery}
                        onChange={(e) => setMoveToQuery(e.target.value)}
                        placeholder="Buscar destino..."
                        className="w-full h-7 rounded-md border border-border px-2 text-[11px] outline-none focus:ring-2 focus:ring-blue-100 mb-1"
                      />
                      <button
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
                        onClick={() => { onMoveToParent(project.id, null); setMoveToOpen(false); setRowMenuOpen(false); setMoveToQuery(''); }}
                      >
                        Sin padre
                      </button>
                      <div className="my-1 border-t border-border" />
                      {filteredParentOptions.map((option) => (
                        <button
                          key={option.id}
                          className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary truncate"
                          style={{ paddingLeft: `${10 + ((option.hierarchyLevel || 0) * 14)}px` }}
                          onClick={() => { onMoveToParent(project.id, option.id); setMoveToOpen(false); setRowMenuOpen(false); setMoveToQuery(''); }}
                        >
                          {option.name || 'Sin nombre'}
                        </button>
                      ))}
                      {filteredParentOptions.length === 0 && (
                        <div className="px-2.5 py-2 text-[11px] text-text-secondary">Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="my-1 border-t border-border" />
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={() => { onIndent(project.id); setRowMenuOpen(false); }}>Aumentar sangria</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={() => { onOutdent(project.id); setRowMenuOpen(false); }}>Reducir sangria</button>
                <div className="my-1 border-t border-border" />
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md text-red-600 hover:bg-red-50" onClick={() => { onDelete(project.id); setRowMenuOpen(false); }}>Eliminar fila</button>
              </div>
            )}
          </div>
        )}
      </td>

      {/* Name - with hierarchy support */}
      <td className="border-b border-border text-sm text-text-primary font-medium min-w-[200px] px-0 py-2 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0 flex-1">
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
          </div>
          {remoteEditingLabel && (
            <span className="text-[10px] text-blue-500/80 whitespace-nowrap">
              Editando: {remoteEditingLabel}
            </span>
          )}
        </div>
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
            {collapsedSummary.startDate ? format(new Date(collapsedSummary.startDate), 'dd/MM') : 'â€”'}
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
            {collapsedSummary.endDate ? format(new Date(collapsedSummary.endDate), 'dd/MM') : 'â€”'}
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
              : 'â€”'}
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
            {collapsedSummary.daysRequired > 0 ? collapsedSummary.daysRequired : 'â€”'}
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

      {dynamicColumns.map((col) => {
        const cellValue = dynamicValues?.[col.id] ?? null;
        return (
          <td
            key={col.id}
            className="px-2 py-2 border-b border-border text-xs bg-white min-w-[140px]"
            onFocusCapture={() => setLocalPresence({ rowId: project.id, columnId: col.id })}
            onBlurCapture={(e) => {
              const next = e.relatedTarget as Node | null;
              const current = e.currentTarget as HTMLTableCellElement;
              if (!next || !current.contains(next)) setLocalPresence({ rowId: project.id, columnId: null });
            }}
          >
            {col.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={Boolean(cellValue)}
                onChange={(e) => onUpdateDynamicCell(project.id, col.id, e.target.checked)}
                className="h-3.5 w-3.5 accent-[#3B82F6]"
              />
            ) : col.type === 'number' ? (
              <EditableNumberCell
                value={Number(cellValue || 0)}
                onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
              />
            ) : col.type === 'date' ? (
              <EditableDateCell
                value={typeof cellValue === 'string' && cellValue ? new Date(cellValue) : null}
                onChange={(v) => onUpdateDynamicCell(project.id, col.id, v ? format(v, 'yyyy-MM-dd') : null)}
              />
            ) : col.type === 'select' ? (
              <EditableSelectCell
                value={typeof cellValue === 'string' ? cellValue : ''}
                onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
                options={Array.isArray(col.config?.options) ? (col.config.options as string[]) : []}
                placeholder="Seleccionar"
              />
            ) : col.type === 'tags' ? (
              <EditableTextCell
                value={Array.isArray(cellValue) ? (cellValue as string[]).join(', ') : (typeof cellValue === 'string' ? cellValue : '')}
                onChange={(v) => onUpdateDynamicCell(project.id, col.id, v.split(',').map((x) => x.trim()).filter(Boolean))}
                placeholder="tag1, tag2"
              />
            ) : (
              <EditableTextCell
                value={typeof cellValue === 'string' ? cellValue : ''}
                onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
                placeholder="Escribir..."
              />
            )}
          </td>
        );
      })}

      {/* Load */}
      <td className="px-2 py-2 border-b border-border text-center bg-white">
        {project.dailyLoad > 0 ? (
          <LoadBubble load={project.dailyLoad} size="sm" />
        ) : (
          <span className="text-xs text-text-secondary">â€”</span>
        )}
      </td>

      {/* Balance */}
      <td className="px-2 py-2 text-xs text-text-secondary border-b border-border tabular-nums text-center bg-white">
        {project.assignedDays > 0 ? (
          <span className={project.balanceDays >= 0 ? 'text-[#2D6A2E]' : 'text-[#B71C1C]'}>
            {project.balanceDays > 0 ? '+' : ''}{project.balanceDays}d
          </span>
        ) : 'â€”'}
      </td>

      {/* Row actions */}
      <td className="px-2 py-2 border-b border-border text-center w-20 bg-white">
        <div className="flex items-center gap-1 justify-center">
        {showDeleteConfirm ? (
          <>
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
              âœ•
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 rounded text-text-secondary/30 hover:text-[#B71C1C] hover:bg-accent-red/30 transition-all opacity-0 group-hover:opacity-100"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        )}
        </div>
      </td>
    </tr>
  );
}

// â”€â”€â”€ Main ProjectTable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ProjectTable() {
  const { state, dispatch, allBranches, activeBoardId, remoteEditingByRow, remoteEditingByColumn, announceEditingPresence } = useProject();
  const { user } = useAuth();
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
  const [headerStickyHeight, setHeaderStickyHeight] = useState(40);
  const [dynamicColumns, setDynamicColumns] = useState<DynamicColumn[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Map<string, Record<string, DynamicCellValue>>>(new Map());
  const [columnMenuOpenFor, setColumnMenuOpenFor] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [fixedHeaderMenuOpenFor, setFixedHeaderMenuOpenFor] = useState<ColumnKey | null>(null);
  const [fixedHeaderNameTooltipFor, setFixedHeaderNameTooltipFor] = useState<ColumnKey | null>(null);
  const [moveCopyColumnId, setMoveCopyColumnId] = useState<string | null>(null);
  const [moveCopyTargetId, setMoveCopyTargetId] = useState<string>('__end__');
  const [moveCopyAsCopy, setMoveCopyAsCopy] = useState(false);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [columnTypePickerFor, setColumnTypePickerFor] = useState<string | null>(null);
  const [columnOptionsEditorFor, setColumnOptionsEditorFor] = useState<string | null>(null);
  const [columnOptionsDraft, setColumnOptionsDraft] = useState('');
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
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

  const refreshDynamicColumns = useCallback(async () => {
    if (!activeBoardId) {
      setDynamicColumns([]);
      setDynamicValues(new Map());
      return;
    }
    try {
      const [cols, vals] = await Promise.all([
        listBoardColumns(activeBoardId),
        listTaskColumnValues(activeBoardId),
      ]);
      setDynamicColumns(cols);
      setDynamicValues(vals);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Dynamic columns load failed:', err);
    }
  }, [activeBoardId]);

  useEffect(() => {
    refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-column-menu-safe]')) return;
      setColumnMenuOpenFor(null);
      setFixedHeaderMenuOpenFor(null);
      setColumnTypePickerFor(null);
      setColumnOptionsEditorFor(null);
      setFixedHeaderNameTooltipFor(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const setSortForKey = useCallback((key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

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

  const [localPresence, setLocalPresence] = useState<{ rowId: string | null; columnId: string | null }>({ rowId: null, columnId: null });
  useEffect(() => {
    announceEditingPresence(localPresence.rowId, localPresence.columnId);
  }, [localPresence, announceEditingPresence]);

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

  const createProjectDraft = useCallback((overrides?: Partial<Project>) => {
    const { id: _ignoreId, ...safeOverrides } = overrides || {};
    return computeProjectFields({
      id: `proj-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Nuevo proyecto',
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
      ...safeOverrides,
    }, state.config);
  }, [state.config]);

  const handleAddAbove = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (!ref) return;
    const newProject = createProjectDraft({
      parentId: ref.parentId ?? null,
      branch: ref.branch || '',
      startDate: ref.startDate ?? null,
      endDate: ref.endDate ?? null,
      type: ref.type,
    });
    const currentOrder = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const refIdx = currentOrder.indexOf(referenceId);
    dispatch({ type: 'ADD_PROJECT', payload: newProject });
    const newOrder = [...currentOrder];
    newOrder.splice(Math.max(0, refIdx), 0, newProject.id);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    setSelectedRowId(newProject.id);
  }, [state.projects, state.projectOrder, createProjectDraft, dispatch]);

  const handleAddBelow = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (!ref) return;
    const newProject = createProjectDraft({
      parentId: ref.parentId ?? null,
      branch: ref.branch || '',
      startDate: ref.startDate ?? null,
      endDate: ref.endDate ?? null,
      type: ref.type,
    });
    const currentOrder = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const refIdx = currentOrder.indexOf(referenceId);
    dispatch({ type: 'ADD_PROJECT', payload: newProject });
    const newOrder = [...currentOrder];
    newOrder.splice(refIdx + 1, 0, newProject.id);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    setSelectedRowId(newProject.id);
  }, [state.projects, state.projectOrder, createProjectDraft, dispatch]);

  const handleDuplicateRow = useCallback((id: string) => {
    const original = state.projects.find((p) => p.id === id);
    if (!original) return;
    const copy = createProjectDraft({
      ...original,
      name: original.name ? `${original.name} (copia)` : '',
    });
    const currentOrder = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const refIdx = currentOrder.indexOf(id);
    dispatch({ type: 'ADD_PROJECT', payload: copy });
    const newOrder = [...currentOrder];
    newOrder.splice(refIdx + 1, 0, copy.id);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    setSelectedRowId(copy.id);
  }, [state.projects, state.projectOrder, createProjectDraft, dispatch]);

  const handleUpsertDynamicCell = useCallback(async (taskId: string, columnId: string, value: DynamicCellValue) => {
    if (!activeBoardId || !user) return;
    setDynamicValues((prev) => {
      const next = new Map(prev);
      const row = { ...(next.get(taskId) || {}) };
      row[columnId] = value;
      next.set(taskId, row);
      return next;
    });
    try {
      if (value === null || value === '') {
        await deleteTaskColumnValue(taskId, columnId);
      } else {
        await upsertTaskColumnValue({
          boardId: activeBoardId,
          taskId,
          columnId,
          value,
          userId: user.id,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Dynamic cell save failed:', err);
    }
  }, [activeBoardId, user]);

  const handleCreateDynamicColumn = useCallback(async (position: number, baseName?: string) => {
    if (!activeBoardId || !user) return;
    const name = (baseName || window.prompt('Nombre de la columna', 'Nueva columna') || '').trim();
    if (!name) return;
    const key = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      for (const c of dynamicColumns.filter((c) => c.position >= position)) {
        await updateBoardColumn(c.id, { position: c.position + 1 });
      }
      await createBoardColumn({
        boardId: activeBoardId,
        key,
        name,
        type: 'text',
        position,
        createdBy: user.id,
        config: {},
      });
      await refreshDynamicColumns();
    } catch (err) {
      window.alert(`No se pudo crear la columna: ${String(err)}`);
    }
  }, [activeBoardId, user, dynamicColumns, refreshDynamicColumns]);

  const beginEditDynamicColumnName = useCallback((columnId: string, currentName: string) => {
    setEditingColumnId(columnId);
    setEditingColumnName(currentName);
  }, []);

  const commitEditDynamicColumnName = useCallback(async () => {
    if (!editingColumnId) return;
    const name = editingColumnName.trim();
    const original = dynamicColumns.find((c) => c.id === editingColumnId)?.name ?? '';
    setEditingColumnId(null);
    if (!name || name === original) {
      setEditingColumnName('');
      return;
    }
    try {
      await updateBoardColumn(editingColumnId, { name });
      await refreshDynamicColumns();
    } finally {
      setEditingColumnName('');
    }
  }, [editingColumnId, editingColumnName, dynamicColumns, refreshDynamicColumns]);

  const handleChangeDynamicColumnType = useCallback(async (columnId: string, next: DynamicColumn['type']) => {
    if (!['text', 'number', 'date', 'select', 'tags', 'checkbox'].includes(next)) return;
    if (!supabase) return;
    const { error } = await supabase.from('board_columns').update({ type: next }).eq('id', columnId);
    if (error) throw error;
    await refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  const handleSaveDynamicColumnOptions = useCallback(async (columnId: string, raw: string) => {
    const options = raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    await updateBoardColumn(columnId, { config: { options } });
    await refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  const handleDuplicateDynamicColumn = useCallback(async (columnId: string) => {
    const col = dynamicColumns.find((c) => c.id === columnId);
    if (!col || !activeBoardId || !user) return;
    const dupPos = col.position + 1;
    for (const c of dynamicColumns.filter((c) => c.position >= dupPos)) {
      await updateBoardColumn(c.id, { position: c.position + 1 });
    }
    await createBoardColumn({
      boardId: activeBoardId,
      key: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${col.name} (copia)`,
      type: col.type,
      position: dupPos,
      createdBy: user.id,
      config: col.config,
    });
    await refreshDynamicColumns();
  }, [dynamicColumns, activeBoardId, user, refreshDynamicColumns]);

  const handleReorderDynamicColumn = useCallback(async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const cols = [...dynamicColumns].sort((a, b) => a.position - b.position);
    const fromIdx = cols.findIndex((c) => c.id === fromId);
    const toIdx = cols.findIndex((c) => c.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...cols];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const updates = reordered
      .map((c, idx) => ({ id: c.id, nextPos: idx }))
      .filter((u) => cols.find((c) => c.id === u.id)?.position !== u.nextPos);

    for (const u of updates) {
      await updateBoardColumn(u.id, { position: u.nextPos });
    }
    await refreshDynamicColumns();
  }, [dynamicColumns, refreshDynamicColumns]);

  const handleDeleteDynamicColumn = useCallback(async (columnId: string) => {
    const ok = window.confirm('¿Eliminar esta columna?');
    if (!ok) return;
    await deleteBoardColumn(columnId);
    await refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  const handleMoveOrCopyDynamicColumn = useCallback(async () => {
    if (!moveCopyColumnId) return;
    const sorted = [...dynamicColumns].sort((a, b) => a.position - b.position);
    const source = sorted.find((c) => c.id === moveCopyColumnId);
    if (!source) return;

    if (moveCopyAsCopy) {
      let insertPos = sorted.length;
      if (moveCopyTargetId !== '__end__') {
        const target = sorted.find((c) => c.id === moveCopyTargetId);
        if (target) insertPos = target.position;
      }
      for (const c of sorted.filter((c) => c.position >= insertPos)) {
        await updateBoardColumn(c.id, { position: c.position + 1 });
      }
      await createBoardColumn({
        boardId: activeBoardId || '',
        key: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${source.name} (copia)`,
        type: source.type,
        position: insertPos,
        createdBy: user?.id || '',
        config: source.config,
      });
    } else {
      if (moveCopyTargetId === '__end__') {
        const others = sorted.filter((c) => c.id !== source.id);
        const reordered = [...others, source];
        for (let i = 0; i < reordered.length; i += 1) {
          const col = reordered[i];
          if (col.position !== i) await updateBoardColumn(col.id, { position: i });
        }
      } else if (moveCopyTargetId !== source.id) {
        await handleReorderDynamicColumn(source.id, moveCopyTargetId);
      }
    }

    setMoveCopyColumnId(null);
    setMoveCopyTargetId('__end__');
    setMoveCopyAsCopy(false);
    setColumnMenuOpenFor(null);
    await refreshDynamicColumns();
  }, [moveCopyColumnId, moveCopyTargetId, moveCopyAsCopy, dynamicColumns, activeBoardId, user, handleReorderDynamicColumn, refreshDynamicColumns]);

  const openCommentsForTask = useCallback(async (taskId: string) => {
    if (!activeBoardId) return;
    try {
      const rows = await listTaskComments(activeBoardId, taskId);
      setComments(rows);
      setCommentsTaskId(taskId);
      setCommentsOpen(true);
    } catch (err) {
      window.alert(`No se pudieron cargar comentarios: ${String(err)}`);
    }
  }, [activeBoardId]);

  const submitComment = useCallback(async () => {
    if (!activeBoardId || !user || !commentsTaskId || !commentDraft.trim()) return;
    try {
      await addTaskComment({
        boardId: activeBoardId,
        taskId: commentsTaskId,
        userId: user.id,
        body: commentDraft,
      });
      setCommentDraft('');
      const rows = await listTaskComments(activeBoardId, commentsTaskId);
      setComments(rows);
    } catch (err) {
      window.alert(`No se pudo guardar comentario: ${String(err)}`);
    }
  }, [activeBoardId, user, commentsTaskId, commentDraft]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!activeBoardId || !commentsTaskId) return;
    const ok = window.confirm('¿Seguro que deseas eliminar este comentario?');
    if (!ok) return;
    try {
      await deleteTaskComment(commentId);
      const rows = await listTaskComments(activeBoardId, commentsTaskId);
      setComments(rows);
    } catch (err) {
      window.alert(`No se pudo eliminar comentario: ${String(err)}`);
    }
  }, [activeBoardId, commentsTaskId]);

  const commentsTargetProject = useMemo(
    () => state.projects.find((p) => p.id === commentsTaskId) ?? null,
    [state.projects, commentsTaskId]
  );

  const handleMoveToParent = useCallback((projectId: string, parentId: string | null) => {
    if (!validateNoCircles(projectId, parentId, state.projects)) return;
    const currentOrder = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const blockDesc = new Set(getDescendants(projectId, state.projects).map((p) => p.id));
    const blockIds = currentOrder.filter((id) => id === projectId || blockDesc.has(id));
    const blockSet = new Set(blockIds);
    const remaining = currentOrder.filter((id) => !blockSet.has(id));

    dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId, newParentId: parentId } });

    let insertIndex = remaining.length;
    if (parentId) {
      const parentDesc = new Set(getDescendants(parentId, state.projects).map((p) => p.id));
      const parentBlock = remaining.filter((id) => id === parentId || parentDesc.has(id));
      const lastParentId = parentBlock[parentBlock.length - 1] || parentId;
      const lastParentIdx = remaining.indexOf(lastParentId);
      insertIndex = lastParentIdx === -1 ? remaining.length : lastParentIdx + 1;
    } else {
      const roots = state.projects
        .filter((p) => !p.parentId && p.id !== projectId && !blockDesc.has(p.id))
        .map((p) => p.id);
      if (roots.length > 0) {
        const lastRoot = roots[roots.length - 1];
        const lastRootIdx = remaining.indexOf(lastRoot);
        insertIndex = lastRootIdx === -1 ? remaining.length : lastRootIdx + 1;
      }
    }

    const newOrder = [
      ...remaining.slice(0, insertIndex),
      ...blockIds,
      ...remaining.slice(insertIndex),
    ];
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
  }, [state.projects, state.projectOrder, dispatch]);

  const handleExportExcel = useCallback(() => {
    exportToExcel(state.projects, state.fileName || undefined);
    setExportToast('âœ“ Archivo Excel exportado');
    setTimeout(() => setExportToast(null), 3000);
  }, [state.projects, state.fileName]);

  const handleCopyCSV = useCallback(() => {
    copyAsCSV(state.projects);
    setExportToast('âœ“ Datos copiados al portapapeles');
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

    // Then apply search filtering and keep deterministic visual order.
    const filtered = hierarchyFiltered.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );
    const orderedFiltered = [...filtered].sort((a, b) =>
      (indexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (indexById.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );

    const scheduled = orderedFiltered.filter((p) => p.startDate && p.endDate && p.type !== 'En radar');
    const unscheduled = orderedFiltered.filter((p) => (!p.startDate || !p.endDate) && p.type !== 'En radar');
    const radar = orderedFiltered.filter((p) => p.type === 'En radar');

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
  }, [state.projects, sortKey, sortDir, search, indexById]);

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
    () => Object.values(columnWidths).reduce((sum, w) => sum + w, 0) + (dynamicColumns.length * 160),
    [columnWidths, dynamicColumns.length]
  );
  const totalTableColumns = 12 + dynamicColumns.length;

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
      const anchorY = container.getBoundingClientRect().top + stickyToolsHeight  + headerStickyHeight + 6;
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
  }, [renderedProjectIds, stickyToolsHeight, headerStickyHeight]);

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
  }) => {
    const isDateField = field === 'startDate' || field === 'endDate';
    const sortAscLabel = isDateField ? 'De mas antiguo a mas reciente' : 'Orden alfabetico A-Z';
    const sortDescLabel = isDateField ? 'De mas reciente a mas antiguo' : 'Inverso de orden alfabetico Z-A';
    return (
    <th
      className={`group relative bg-white px-2 py-2.5 text-left text-xs font-semibold text-text-secondary select-none border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] ${
        roundedLeft ? 'rounded-tl-lg' : ''
      } ${roundedRight ? 'rounded-tr-lg' : ''} ${className || ''}`}
    >
      <span
        data-column-menu-safe
        className="flex items-center gap-1 pr-5"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setFixedHeaderNameTooltipFor(colKey);
          window.setTimeout(() => setFixedHeaderNameTooltipFor((v) => (v === colKey ? null : v)), 1200);
        }}
      >
        {label}
      </span>
      {fixedHeaderNameTooltipFor === colKey && (
        <div data-column-menu-safe className="absolute left-2 top-[calc(100%+4px)] z-[185] rounded-md border border-border bg-white px-2 py-1 text-[11px] text-text-secondary shadow-sm whitespace-nowrap">
          Nombre no editable en columnas esenciales
        </div>
      )}
      <button
        data-column-menu-safe
        onClick={(e) => {
          e.stopPropagation();
          setFixedHeaderMenuOpenFor((prev) => (prev === colKey ? null : colKey));
          setColumnMenuOpenFor(null);
          setColumnTypePickerFor(null);
          setColumnOptionsEditorFor(null);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-bg-secondary text-text-secondary"
        title="Opciones de columna"
      >
        <GripVertical size={12} />
      </button>
      {fixedHeaderMenuOpenFor === colKey && (
        <div
          data-column-menu-safe
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-[calc(100%+4px)] z-[180] min-w-[210px] rounded-lg border border-border bg-white shadow-lg p-1"
        >
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
            onClick={async () => {
              await handleCreateDynamicColumn(0);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            Agregar antes
          </button>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
            onClick={async () => {
              await handleCreateDynamicColumn(dynamicColumns.length);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            Agregar despues
          </button>
          <div className="my-1 border-t border-border" />
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-secondary">
            Ordenar por...
          </div>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
            onClick={() => {
              setSortForKey(field, 'asc');
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            {sortAscLabel}
          </button>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
            onClick={() => {
              setSortForKey(field, 'desc');
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            {sortDescLabel}
          </button>
          <button
            disabled={sortKey !== field}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary disabled:opacity-40"
            onClick={() => {
              setSortKey(null);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            Quitar orden
          </button>
          <div className="my-1 border-t border-border" />
          <div className="px-2.5 py-1.5 text-[11px] text-text-secondary">
            Columna esencial
          </div>
        </div>
      )}
      <div
        onMouseDown={(e) => startColumnResize(colKey, e)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
        title="Arrastrar para cambiar ancho"
      >
        <div className="mx-auto h-full w-px bg-text-secondary/25" />
      </div>
    </th>
  );
  };

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

        <button
          onClick={() => handleCreateDynamicColumn(dynamicColumns.length)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-white border border-border rounded-md transition-all"
          title="Agregar columna"
        >
          <Plus size={14} />
          Columna
        </button>
      </div>
      </div>
      {!multiSelectMode && stickyAncestorRows.length > 0 && (
        <>
          {stickyAncestorRows.map((row, idx) => (
            <div
              key={row.id}
              data-selection-safe
              className="sticky z-30 border-x border-border border-b border-border bg-white"
              style={{ top: stickyToolsHeight  + headerStickyHeight + idx * 28 - 1 }}
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
              {dynamicColumns.map((col) => (
                <col key={col.id} style={{ width: 160 }} />
              ))}
              <col style={{ width: columnWidths.load }} />
              <col style={{ width: columnWidths.balance }} />
              <col style={{ width: columnWidths.actions }} />
            </colgroup>
            <thead ref={headerStickyRef} style={{ top: stickyToolsHeight  }} className="sticky z-20">
              <tr className="h-11 bg-white">
                <th
                  style={{ top: stickyToolsHeight  }}
                  className="sticky z-20 bg-white w-7 px-1 py-2.5 border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] rounded-tl-lg"
                /> {/* Drag handle */}
                <SortHeader label="Proyecto" field="name" colKey="project" />
                <SortHeader label="Sucursal" field="branch" colKey="branch" />
                <SortHeader label="Inicio" field="startDate" colKey="start" />
                <SortHeader label="Fin" field="endDate" colKey="end" />
                <SortHeader label="Asignado" field="assignees" colKey="assignees" />
                <SortHeader label="DÃ­as req." field="daysRequired" colKey="days" />
                <SortHeader label="Prior." field="priority" colKey="priority" />
                <SortHeader label="Tipo" field="type" colKey="type" />
                {dynamicColumns.map((col) => {
                  return (
                    <th
                      key={col.id}
                      className={`group relative sticky z-20 bg-white px-2 py-2.5 text-left text-xs font-semibold text-text-secondary border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] ${
                        overColumnId === col.id ? 'shadow-[inset_2px_0_0_0_rgba(59,130,246,0.9)]' : ''
                      }`}
                      style={{ top: stickyToolsHeight }}
                      onDragOver={(e) => {
                        if (!dragColumnId) return;
                        e.preventDefault();
                        setOverColumnId(col.id);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        if (!dragColumnId) return;
                        const fromId = dragColumnId;
                        setDragColumnId(null);
                        setOverColumnId(null);
                        await handleReorderDynamicColumn(fromId, col.id);
                      }}
                      onDragLeave={() => {
                        if (overColumnId === col.id) setOverColumnId(null);
                      }}
                    >
                      <div className="pr-6">
                        {editingColumnId === col.id ? (
                          <input
                            autoFocus
                            value={editingColumnName}
                            onChange={(e) => setEditingColumnName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => { void commitEditDynamicColumnName(); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void commitEditDynamicColumnName();
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingColumnId(null);
                                setEditingColumnName('');
                              }
                            }}
                            className="w-full bg-transparent p-0 m-0 border-0 outline-none text-xs font-semibold text-text-secondary"
                          />
                        ) : (
                          <span onDoubleClick={() => beginEditDynamicColumnName(col.id, col.name)}>
                            {col.name}
                          </span>
                        )}
                      </div>
                      {remoteEditingByColumn[col.id]?.label && (
                        <span className="ml-1 text-[10px] text-blue-500/80">
                          Editando: {remoteEditingByColumn[col.id].label}
                        </span>
                      )}
                      <button
                        data-column-menu-safe
                        draggable
                        onDragStart={() => {
                          setDragColumnId(col.id);
                          setColumnMenuOpenFor(null);
                        }}
                        onDragEnd={() => {
                          setDragColumnId(null);
                          setOverColumnId(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setColumnMenuOpenFor((v) => (v === col.id ? null : col.id));
                          setFixedHeaderMenuOpenFor(null);
                          setColumnTypePickerFor(null);
                          setColumnOptionsEditorFor(null);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded opacity-60 group-hover:opacity-100 hover:bg-bg-secondary cursor-grab active:cursor-grabbing"
                        title="Arrastra para reordenar o clic para opciones"
                      >
                        <GripVertical size={12} />
                      </button>
                      {columnMenuOpenFor === col.id && (
                        <div
                          data-column-menu-safe
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-[calc(100%+4px)] z-[180] min-w-[210px] rounded-lg border border-border bg-white shadow-lg p-1"
                        >
                          <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={async () => { await handleCreateDynamicColumn(col.position); setColumnMenuOpenFor(null); }}>Agregar antes</button>
                          <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={async () => { await handleCreateDynamicColumn(col.position + 1); setColumnMenuOpenFor(null); }}>Agregar despues</button>
                          <button
                            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
                            onClick={() => {
                              setColumnTypePickerFor((v) => (v === col.id ? null : col.id));
                              setColumnOptionsEditorFor(null);
                            }}
                          >
                            Cambiar tipo
                          </button>
                          {columnTypePickerFor === col.id && (
                            <div className="mx-1 mb-1 rounded-md border border-border bg-bg-secondary/50 p-1">
                              {(['text', 'number', 'date', 'select', 'tags', 'checkbox'] as DynamicColumn['type'][]).map((t) => (
                                <button
                                  key={t}
                                  className={`mr-1 mb-1 px-2 py-1 text-[11px] rounded border ${
                                    col.type === t ? 'bg-white border-border text-text-primary' : 'border-transparent hover:bg-white'
                                  }`}
                                  onClick={async () => {
                                    await handleChangeDynamicColumnType(col.id, t);
                                    setColumnTypePickerFor(null);
                                    setColumnMenuOpenFor(null);
                                  }}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          )}
                          {(col.type === 'select' || col.type === 'tags') && (
                            <>
                              <button
                                className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
                                onClick={() => {
                                  const current = Array.isArray(col.config?.options) ? (col.config.options as string[]) : [];
                                  setColumnOptionsDraft(current.join(', '));
                                  setColumnOptionsEditorFor((v) => (v === col.id ? null : col.id));
                                  setColumnTypePickerFor(null);
                                }}
                              >
                                Editar opciones
                              </button>
                              {columnOptionsEditorFor === col.id && (
                                <div className="mx-1 mb-1 rounded-md border border-border bg-bg-secondary/50 p-2">
                                  <textarea
                                    value={columnOptionsDraft}
                                    onChange={(e) => setColumnOptionsDraft(e.target.value)}
                                    className="w-full h-16 rounded border border-border px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="Opcion 1, Opcion 2, Opcion 3"
                                  />
                                  <div className="mt-1 flex justify-end gap-1">
                                    <button
                                      className="px-2 py-1 text-[11px] rounded border border-border hover:bg-white"
                                      onClick={() => setColumnOptionsEditorFor(null)}
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      className="px-2 py-1 text-[11px] rounded border border-border bg-white hover:bg-bg-secondary"
                                      onClick={async () => {
                                        await handleSaveDynamicColumnOptions(col.id, columnOptionsDraft);
                                        setColumnOptionsEditorFor(null);
                                        setColumnMenuOpenFor(null);
                                      }}
                                    >
                                      Guardar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary" onClick={async () => { await handleDuplicateDynamicColumn(col.id); setColumnMenuOpenFor(null); }}>Duplicar</button>
                          <button
                            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-bg-secondary"
                            onClick={() => {
                              setMoveCopyColumnId(col.id);
                              setMoveCopyTargetId('__end__');
                              setMoveCopyAsCopy(false);
                              setColumnMenuOpenFor(null);
                            }}
                          >
                            Mover / Copiar a...
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-md text-red-600 hover:bg-red-50" onClick={async () => { await handleDeleteDynamicColumn(col.id); setColumnMenuOpenFor(null); }}>Eliminar</button>
                        </div>
                      )}
                    </th>
                  );
                })}
                <th
                  style={{ top: stickyToolsHeight  }}
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
                  style={{ top: stickyToolsHeight  }}
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
                  style={{ top: stickyToolsHeight  }}
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
                    onAddAbove={handleAddAbove}
                    onAddBelow={handleAddBelow}
                    onDuplicateRow={handleDuplicateRow}
                    onMoveToParent={handleMoveToParent}
                    dynamicColumns={dynamicColumns}
                    dynamicValues={dynamicValues.get(p.id)}
                    onUpdateDynamicCell={handleUpsertDynamicCell}
                    remoteEditingLabel={remoteEditingByRow[p.id]?.label}
                    onPresenceChange={(rowId) => setLocalPresence({ rowId, columnId: null })}
                    onOpenComments={openCommentsForTask}
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
                    <td colSpan={totalTableColumns} className="px-3 py-2 bg-accent-yellow/30 border-b border-border">
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
                          onAddAbove={handleAddAbove}
                          onAddBelow={handleAddBelow}
                          onDuplicateRow={handleDuplicateRow}
                          onMoveToParent={handleMoveToParent}
                          dynamicColumns={dynamicColumns}
                          dynamicValues={dynamicValues.get(p.id)}
                          onUpdateDynamicCell={handleUpsertDynamicCell}
                          remoteEditingLabel={remoteEditingByRow[p.id]?.label}
                          onPresenceChange={(rowId) => setLocalPresence({ rowId, columnId: null })}
                          onOpenComments={openCommentsForTask}
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
                    <td colSpan={totalTableColumns} className="px-3 py-2 bg-bg-secondary border-b border-border">
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
                          onAddAbove={handleAddAbove}
                          onAddBelow={handleAddBelow}
                          onDuplicateRow={handleDuplicateRow}
                          onMoveToParent={handleMoveToParent}
                          dynamicColumns={dynamicColumns}
                          dynamicValues={dynamicValues.get(p.id)}
                          onUpdateDynamicCell={handleUpsertDynamicCell}
                          remoteEditingLabel={remoteEditingByRow[p.id]?.label}
                          onPresenceChange={(rowId) => setLocalPresence({ rowId, columnId: null })}
                          onOpenComments={openCommentsForTask}
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

      {/* Comments side panel */}
      {commentsOpen && (
        <div className="fixed inset-0 z-[210] pointer-events-none">
          <div
            className="absolute inset-0 bg-black/15 pointer-events-auto"
            onClick={() => setCommentsOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-border shadow-xl pointer-events-auto flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-text-secondary">Comentarios</p>
                <p className="text-sm font-medium truncate">{commentsTargetProject?.name || 'Elemento'}</p>
              </div>
              <button
                onClick={() => setCommentsOpen(false)}
                className="h-7 w-7 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                aria-label="Cerrar panel de comentarios"
                title="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
              {comments.length === 0 ? (
                <p className="text-xs text-text-secondary">Aún no hay comentarios.</p>
              ) : (
                comments.map((comment) => {
                  const isMine = user?.id && comment.user_id === user.id;
                  return (
                    <div key={comment.id} className="group relative rounded-lg border border-border bg-bg-secondary/40 px-3 py-2">
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="absolute right-2 top-2 h-6 w-6 inline-flex items-center justify-center rounded-md text-text-secondary/50 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar comentario"
                        aria-label="Eliminar comentario"
                      >
                        <Trash2 size={13} />
                      </button>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-medium text-text-primary truncate">
                          {isMine ? 'Tú' : `Usuario ${comment.user_id.slice(0, 6)}`}
                        </span>
                        <span className="text-[10px] text-text-secondary whitespace-nowrap">
                          {formatDateShort(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-text-primary whitespace-pre-wrap break-words">{comment.body}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-border">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Escribe un comentario..."
                className="w-full h-24 resize-none rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => setCommentsOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                >
                  Cerrar
                </button>
                <button
                  onClick={submitComment}
                  disabled={!commentDraft.trim()}
                  className="px-3 py-1.5 text-xs rounded-md bg-text-primary text-white hover:bg-[#2c2a25] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Comentar
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {moveCopyColumnId && (
        <div data-column-menu-safe className="fixed inset-0 z-[220] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setMoveCopyColumnId(null)} />
          <div data-column-menu-safe className="relative w-full max-w-md rounded-xl border border-border bg-white shadow-xl p-4">
            <div className="text-sm font-semibold text-text-primary mb-2">Mover / Copiar columna</div>
            <div className="text-xs text-text-secondary mb-2">Antes de la columna:</div>
            <select
              value={moveCopyTargetId}
              onChange={(e) => setMoveCopyTargetId(e.target.value)}
              className="w-full h-9 rounded-md border border-border px-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            >
              {dynamicColumns
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              <option value="__end__">(mover al final)</option>
            </select>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={moveCopyAsCopy}
                onChange={(e) => setMoveCopyAsCopy(e.target.checked)}
                className="h-4 w-4 accent-[#3B82F6]"
              />
              Crear una copia
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setMoveCopyColumnId(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={async () => { await handleMoveOrCopyDynamicColumn(); }}
                className="px-3 py-1.5 text-xs rounded-md bg-text-primary text-white hover:bg-[#2c2a25]"
              >
                OK
              </button>
            </div>
          </div>
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
          <div className="mt-2 text-xs text-text-secondary">Revisa la consola del navegador para mÃ¡s detalles.</div>
        </div>
      </div>
    );
  }
}







