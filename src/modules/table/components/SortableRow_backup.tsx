import { useMemo, useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Plus, Trash2, Check, GripVertical, Copy, MessageSquare, ArrowRightLeft, ChevronLeft, ChevronRight, Star
} from 'lucide-react';
import type { Project } from '@/lib/types';
import type { DynamicColumn, DynamicCellValue } from '@/lib/types';
import { ExpandableCell } from '@/components/dashboard/ExpandableCell';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { formatDateShort, format } from '@/lib/dateUtils';
import { getCollapsedMetricsSummary, getDescendants } from '@/lib/hierarchyEngine';
import { normalizeBranchList } from '@/lib/branchUtils';
import { pastelTagColor, isProgressColumn, isStarsColumn, normalizeProgressValue, normalizeStarsValue, assigneesCompactLabel, safeFormatDateLike } from '../utils/table.utils';

// Import extracted components
import { EditableTagsCell } from './EditableTagsCell';
import { EditableBranchTagCell } from './EditableBranchTagCell';
import { StarRating } from './StarRating';
import { ProgressRating } from './ProgressRating';
import { EditableTextCell } from './EditableTextCell';
import { EditableNumberCell } from './EditableNumberCell';
import { EditableDateCell } from './EditableDateCell';
import { EditableSelectCell } from './EditableSelectCell';

type SortKey = keyof Project;
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
      column: DynamicColumn;
    };


// Helper functions are now imported from utils

// TODO: Extract these cell components to separate files
function EditableTagsCell({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.join(', '));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value.join(', '));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    const tags = editValue.split(',').map(t => t.trim()).filter(Boolean);
    onChange(tags);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.join(', '));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
        placeholder="Etiquetas separadas por comas..."
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded flex flex-wrap gap-1"
    >
      {value.length > 0 ? (
        value.map((tag, idx) => (
          <div
            key={idx}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium text-white"
            style={{
              backgroundColor: pastelTagColor(tag).bg,
              color: pastelTagColor(tag).text,
              border: `1px solid ${pastelTagColor(tag).border}`,
            }}
            title={tag}
          >
            {tag
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase() || '?'}
          </div>
        ))
      ) : (
        <span className="text-gray-400">Click para agregar etiquetas...</span>
      )}
    </div>
  );
}

function EditableBranchTagCell({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.join(', '));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value.join(', '));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    const branches = editValue.split(',').map(b => b.trim()).filter(Boolean);
    onChange(branches);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.join(', '));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
        placeholder="Sucursales separadas por comas..."
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded flex flex-wrap gap-1"
    >
      {value.length > 0 ? (
        value.map((branch, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300"
          >
            {branch}
          </span>
        ))
      ) : (
        <span className="text-gray-400">Click para agregar sucursales...</span>
      )}
    </div>
  );
}
function EditableTextCell({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    onChange(editValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded"
    >
      {value || <span className="text-gray-400">{placeholder || 'Click to edit'}</span>}
    </div>
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
  const [editValue, setEditValue] = useState(value ? format(value, 'yyyy-MM-dd') : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(value ? format(value, 'yyyy-MM-dd') : '');
  }, [value]);

  const handleSave = () => {
    const newDate = editValue ? new Date(editValue) : null;
    onChange(newDate);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value ? format(value, 'yyyy-MM-dd') : '');
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded ${hasError ? 'text-red-600' : ''}`}
    >
      {value ? formatDateShort(value) : <span className="text-gray-400">Click to edit</span>}
    </div>
  );
}

function EditableNumberCell({
  value,
  onChange,
  min,
  hasWarning,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  hasWarning?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(String(value));
  }, [value]);

  const handleSave = () => {
    const num = Number(editValue);
    if (!isNaN(num) && (min === undefined || num >= min)) {
      onChange(num);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className={`w-full px-1 py-0.5 text-xs border rounded outline-none ${hasWarning ? 'border-orange-400' : 'border-blue-400'}`}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded text-right ${hasWarning ? 'text-orange-600' : ''}`}
    >
      {value}
    </div>
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
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
    setEditing(false);
  };

  const handleBlur = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded"
    >
      {value || <span className="text-gray-400">{placeholder || 'Click to edit'}</span>}
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`transition-colors ${star <= (hover || value) ? 'text-yellow-500' : 'text-gray-300'}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
        >
          <Star size={14} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function SortableRow({
  project,
  onUpdate,
  onDelete,
  onToggleExpand,
  hasChildren,
  allPersons,
  allBranches,
  onAddBranchOption,
  onRenameBranchOption,
  onDeleteBranchOption,
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
  onAddGroupAbove,
  onAddGroupBelow,
  onAddInside,
  onDuplicateRow,
  onMoveToParent,
  renderColumns,
  dynamicValues,
  onUpdateDynamicCell,
  onAddDynamicTagOption,
  onRenameDynamicTagOption,
  onDeleteDynamicTagOption,
  onRenamePersonGlobal,
  onDeletePersonGlobal,
  onMergePersonsGlobal,
  personProfiles,
  onSetPersonAvatar,
  remoteEditingLabel,
  onPresenceChange,
  onOpenComments,
  onShowGroupEditHint,
  getAvatarUrl,
}: SortableRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(project.name);
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [moveToQuery, setMoveToQuery] = useState('');
  const [moveToTargetId, setMoveToTargetId] = useState<string | '__root__'>('__root__');
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
  const isGroupRow = hasChildren;
  const dropStateLabel = isDropTarget
    ? (dropPlacement === 'inside' ? 'Dentro' : dropPlacement === 'after' ? 'Debajo' : 'Arriba')
    : null;
  const insideDropIndentPx = Math.max(48, 34 + (((project.hierarchyLevel || 0) + 1) * 18));

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
        setMoveToTargetId('__root__');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [rowMenuOpen]);

  useEffect(() => {
    if (!rowMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setRowMenuOpen(false);
      setMoveToOpen(false);
      setMoveToQuery('');
      setMoveToTargetId('__root__');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rowMenuOpen]);

  return (
    <tr
      ref={(node) => {
        setNodeRef(node);
        rowRef?.(node);
      }}
      style={style}
      className={`group relative h-10 transition-all duration-150 ${isSelected ? 'hover:bg-[#DFEBFF]' : 'hover:bg-[#F4F8FF]'} ${bgClass || ''} ${
        isDragging
          ? 'bg-accent-blue/15 shadow-md border-l-2 border-l-accent-blue scale-[0.998]'
          : isSelected
            ? 'bg-[#E6F0FF] border-l-2 border-l-[#3B82F6] [&>td]:bg-[#EAF2FF] [&>td]:border-t [&>td]:border-b [&>td]:border-t-[#60A5FA] [&>td]:border-b-[#60A5FA] [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-[#3B82F6] [&>td:last-child]:border-r-2 [&>td:last-child]:border-r-[#3B82F6]'
            : 'border-l-2 border-l-transparent'
      } ${
        isDropTarget && dropPlacement === 'inside'
          ? 'bg-[#EAF3FF] shadow-[inset_0_0_0_1px_rgba(59,130,246,0.34),0_0_0_1px_rgba(147,197,253,0.28)]'
          : ''
      } ${
        isDropTarget && dropPlacement === 'before'
          ? 'shadow-[inset_0_3px_0_0_rgba(37,99,235,0.95)]'
          : ''
      } ${
        isDropTarget && dropPlacement === 'after'
          ? 'shadow-[inset_0_-3px_0_0_rgba(37,99,235,0.95)]'
          : ''
      }`}
      onMouseDownCapture={(e) => {
        if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const tag = target.tagName.toLowerCase();
        const editable = target.getAttribute('contenteditable');
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable === 'true') return;
        e.preventDefault();
      }}
      onClick={(e) => onSelectRow(project.id, e)}
      onFocusCapture={() => onPresenceChange(project.id, null)}
      onBlurCapture={(e) => {
        const next = e.relatedTarget as Node | null;
        const current = e.currentTarget as HTMLTableRowElement;
        if (!next || !current.contains(next)) onPresenceChange(null, null);
      }}
    >
      {/* Drag handle */}
      <td className="relative w-7 px-1 py-2 border-b border-border text-center group/handle bg-white overflow-visible">
        {dropStateLabel && (
          <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 -right-14 rounded-full bg-blue-600 text-white text-[9px] leading-none px-1.5 py-1 shadow-sm whitespace-nowrap">
            {dropStateLabel}
          </span>
        )}
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
                role="menu"
                aria-label="Menu de fila"
                className="absolute left-6 top-0 z-[170] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5"
              >
                <button role="menuitem" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddAbove(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar fila arriba</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddBelow(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar fila debajo</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddGroupAbove(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar grupo arriba</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddGroupBelow(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar grupo debajo</button>
                {hasChildren && (
                  <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddInside(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar dentro</button>
                )}
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onDuplicateRow(project.id); setRowMenuOpen(false); }}><Copy size={13} />Duplicar fila</button>
                <button
                  className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                  onClick={() => {
                    onOpenComments(project.id);
                    setRowMenuOpen(false);
                  }}
                >
                  <MessageSquare size={13} />
                  Comentarios...
                </button>
                <div className="relative">
                  <button
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                    onClick={() => {
                      setMoveToOpen((v) => !v);
                      setMoveToQuery('');
                      setMoveToTargetId('__root__');
                    }}
                  >
                    <ArrowRightLeft size={13} />
                    Mover / Copiar a...
                  </button>
                  {moveToOpen && (
                    <div className="fixed inset-0 z-[220] flex items-center justify-center" onClick={() => { setMoveToOpen(false); setMoveToQuery(''); setMoveToTargetId('__root__'); }}>
                      <div className="absolute inset-0 bg-black/20" />
                      <div className="relative w-full max-w-md rounded-xl border border-border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.10)] p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="text-sm font-semibold text-text-primary mb-2">Mover / Copiar a...</div>
                        <input
                          value={moveToQuery}
                          onChange={(e) => setMoveToQuery(e.target.value)}
                          placeholder="Buscar destino..."
                          className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                        />
                        <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-border bg-white p-1">
                          <button
                            className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg ${moveToTargetId === '__root__' ? 'bg-bg-secondary text-text-primary' : 'hover:bg-bg-secondary text-text-secondary'}`}
                            onClick={() => setMoveToTargetId('__root__')}
                          >
                            Sin padre
                          </button>
                          {filteredParentOptions.map((option) => (
                            <button
                              key={option.id}
                              className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg truncate ${moveToTargetId === option.id ? 'bg-bg-secondary text-text-primary' : 'hover:bg-bg-secondary text-text-secondary'}`}
                              style={{ paddingLeft: `${10 + ((option.hierarchyLevel || 0) * 14)}px` }}
                              onClick={() => setMoveToTargetId(option.id)}
                            >
                              {option.name || 'Sin nombre'}
                            </button>
                          ))}
                          {filteredParentOptions.length === 0 && (
                            <div className="px-2.5 py-2 text-[11px] text-text-secondary">Sin resultados</div>
                          )}
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                            onClick={() => { setMoveToOpen(false); setMoveToQuery(''); setMoveToTargetId('__root__'); }}
                          >
                            Cancelar
                          </button>
                          <button
                            className="px-3 py-1.5 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22]"
                            onClick={() => {
                              onMoveToParent(project.id, moveToTargetId === '__root__' ? null : moveToTargetId);
                              setMoveToOpen(false);
                              setRowMenuOpen(false);
                              setMoveToQuery('');
                              setMoveToTargetId('__root__');
                            }}
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="my-1 border-t border-border" />
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onIndent(project.id); setRowMenuOpen(false); }}><ChevronRight size={13} />Meter a grupo</button>
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onOutdent(project.id); setRowMenuOpen(false); }}><ChevronLeft size={13} />Sacar de grupo</button>
                <div className="my-1 border-t border-border" />
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50 inline-flex items-center gap-2" onClick={() => { onDelete(project.id); setRowMenuOpen(false); }}><Trash2 size={13} />Eliminar fila</button>
              </div>
            )}
          </div>
        )}
      </td>

      {renderColumns.map((rc) => {
        if (rc.kind === 'dynamic') {
          const col = rc.column;
          const cellValue = dynamicValues?.[col.id] ?? null;
          return (
            <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs bg-white min-w-[140px]">
              {col.type === 'checkbox' ? (
                <input type="checkbox" checked={Boolean(cellValue)} onChange={(e) => onUpdateDynamicCell(project.id, col.id, e.target.checked)} className="h-3.5 w-3.5 accent-[#3B82F6]" />
              ) : col.type === 'number' ? (
                isProgressColumn(col) ? (
                  <ProgressRating value={normalizeProgressValue(cellValue)} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                ) : isStarsColumn(col) ? (
                  <StarRating value={normalizeStarsValue(cellValue) || 0} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                ) : (
                  <EditableNumberCell value={Number(cellValue || 0)} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                )
              ) : col.type === 'date' ? (
                <EditableDateCell value={typeof cellValue === 'string' && cellValue ? new Date(cellValue) : null} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v ? format(v, 'yyyy-MM-dd') : null)} />
              ) : col.type === 'select' ? (
                <EditableSelectCell value={typeof cellValue === 'string' ? cellValue : ''} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} options={Array.isArray(col.config?.options) ? (col.config.options as string[]) : []} placeholder="Seleccionar" />
              ) : col.type === 'tags' ? (
                <EditableTagsCell value={Array.isArray(cellValue) ? (cellValue as string[]) : (typeof cellValue === 'string' && cellValue ? [cellValue] : [])} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
              ) : (
                <EditableTextCell value={typeof cellValue === 'string' ? cellValue : ''} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} placeholder="Escribir..." />
              )}
              {isGroupRow && (
                <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
              )}
            </td>
          );
        }

        switch (rc.id) {
          case 'project':
            return (
              <td key={rc.token} className="relative border-b border-border text-sm text-text-primary font-medium min-w-[200px] px-0 py-2 bg-white">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <ExpandableCell project={project} hasChildren={hasChildren} isLastSibling={isLastSibling} childCount={childCount} onToggleExpand={onToggleExpand} isEditing={editingName} editValue={editNameValue} onEditChange={(v) => setEditNameValue(v)} onStartEdit={() => setEditingName(true)} onFinishEdit={(v) => { onUpdate(project.id, { name: v }); setEditingName(false); }} onCancelEdit={() => { onUpdate(project.id, { name: editNameValue }); setEditingName(false); }} onIndent={onIndent} onOutdent={onOutdent} />
                  </div>
                  {remoteEditingLabel && <span className="text-[10px] text-blue-500/80 whitespace-nowrap">Editando: {remoteEditingLabel}</span>}
                </div>
                {isDropTarget && dropPlacement === 'inside' && (
                  <div className="pointer-events-none absolute -bottom-[1px] right-3 h-[3px] rounded-full bg-blue-600/95" style={{ left: `${insideDropIndentPx}px` }} />
                )}
              </td>
            );
          case 'branch':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs text-text-secondary min-w-[100px] bg-white">
                <EditableBranchTagCell value={normalizeBranchList(project.branch)} onChange={(v) => onUpdate(project.id, { branch: v })} />
                {isGroupRow && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'start':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs bg-white">
                {isCollapsed && collapsedSummary ? (
                  <div className="text-text-secondary">{safeFormatDateLike(collapsedSummary.startDate, 'dd/MM/yy')}</div>
                ) : (
                  <EditableDateCell value={project.startDate} onChange={(v) => onUpdate(project.id, { startDate: v })} hasError={!!hasDateError} />
                )}
                {isGroupRow && !isCollapsed && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'end':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs bg-white">
                {isCollapsed && collapsedSummary ? (
                  <div className="text-text-secondary">{safeFormatDateLike(collapsedSummary.endDate, 'dd/MM/yy')}</div>
                ) : (
                  <EditableDateCell value={project.endDate} onChange={(v) => onUpdate(project.id, { endDate: v })} hasError={!!hasDateError} />
                )}
                {isGroupRow && !isCollapsed && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'assignees':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs min-w-[100px] bg-white">
                {isCollapsed && collapsedSummary ? (
                  <div className="text-text-secondary">{assigneesCompactLabel(collapsedSummary.assignees)}</div>
                ) : (
                  <div className="text-text-secondary">{assigneesCompactLabel(project.assignees)}</div>
                )}
                {isGroupRow && !isCollapsed && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'days':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs text-center bg-white">
                {isCollapsed && collapsedSummary ? (
                  <div className="text-text-secondary">{collapsedSummary.daysRequired > 0 ? collapsedSummary.daysRequired : '—'}</div>
                ) : (
                  <EditableNumberCell value={project.daysRequired} onChange={(v) => onUpdate(project.id, { daysRequired: v })} min={0} hasWarning={!!hasDaysWarning} />
                )}
                {isGroupRow && !isCollapsed && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'priority':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border bg-white">
                <StarRating value={project.priority} onChange={(v) => onUpdate(project.id, { priority: v })} />
                {isGroupRow && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'type':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border bg-white">
                <EditableSelectCell value={project.type} onChange={(v) => onUpdate(project.id, { type: v as Project['type'] })} options={['Proyecto', 'Lanzamiento', 'En radar']} />
                {isGroupRow && (
                  <button type="button" className="absolute inset-0 z-10 cursor-not-allowed" title="Las filas grupo solo se editan por resumen de sus hijos." onClick={(e) => { e.stopPropagation(); onShowGroupEditHint(); }} />
                )}
              </td>
            );
          case 'load':
            return (
              <td key={rc.token} className="px-2 py-2 border-b border-border text-center bg-white">
                {project.dailyLoad > 0 ? <LoadBubble load={project.dailyLoad} size="sm" /> : <span className="text-xs text-text-secondary">Sin carga</span>}
              </td>
            );
          case 'balance':
            return (
              <td key={rc.token} className="px-2 py-2 text-xs text-text-secondary border-b border-border tabular-nums text-center bg-white">
                {project.assignedDays > 0 ? (
                  <span className={project.balanceDays >= 0 ? 'text-[#2D6A2E]' : 'text-[#B71C1C]'}>
                    {project.balanceDays > 0 ? '+' : ''}{project.balanceDays}d
                  </span>
                ) : '—'}
              </td>
            );
          default:
            return null;
        }
      })}

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
              ×
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
