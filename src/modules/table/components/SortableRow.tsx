import { useMemo, useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, GripVertical, Copy, MessageSquare, ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Project, DynamicColumn, DynamicCellValue } from '@/lib/types';
import { ExpandableCell } from '@/components/dashboard/ExpandableCell';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { format } from '@/lib/dateUtils';
import { normalizeBranchList } from '@/lib/branchUtils';
import { getDescendants } from '@/lib/hierarchyEngine';
import { EditableAssigneesCell as RichEditableAssigneesCell } from '@/components/dashboard/table/EditableAssigneesCell';
import { EditableTagsCell } from './EditableTagsCell';
import { EditableBranchTagCell } from './EditableBranchTagCell';
import { EditableDateCell, EditableNumberCell, EditableSelectCell, EditableTextCell } from './EditableCells';
import { StarRating } from './StarRating';
import { ProgressRating } from './ProgressRating';
import { isProgressColumn, isStarsColumn, normalizeProgressValue, normalizeStarsValue } from '../utils/table.utils';

type ProjectStatus = 'por-hacer' | 'en-progreso' | 'en-riesgo' | 'en-retraso' | 'completado';

function getProjectStatus(project: Project, dynamicValues?: Record<string, DynamicCellValue>): ProjectStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate = project.endDate ? new Date(project.endDate) : null;

  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(0, 0, 0, 0);

  let progress = 0;
  if (dynamicValues) {
    const progressColId = Object.keys(dynamicValues).find(() => true);
    const progressValue = dynamicValues[progressColId || ''];
    if (typeof progressValue === 'number') progress = progressValue;
  }

  if (progress >= 100) return 'completado';
  if (!startDate || !endDate) return 'por-hacer';
  if (today < startDate) return 'por-hacer';
  if (today > endDate) return 'en-retraso';

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const expectedProgress = totalDays > 0 ? (daysPassed / totalDays) * 100 : 0;

  if (progress < expectedProgress - 25) return 'en-riesgo';
  if (progress > 0) return 'en-progreso';
  if (daysPassed > 3 && progress === 0) return 'en-riesgo';
  return 'en-progreso';
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = {
    'por-hacer': { label: 'Por hacer', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
    'en-progreso': { label: 'En progreso', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'en-riesgo': { label: 'En riesgo', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    'en-retraso': { label: 'En retraso', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    'completado': { label: 'Completado', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium ${c.bg} ${c.text} border ${c.border}`}>
      {c.label}
    </span>
  );
}

function GroupRowLockedOverlay({ onShowHint }: { onShowHint: () => void }) {
  return (
    <div className="absolute inset-0 z-10">
      <button
        type="button"
        className="peer absolute inset-0 z-10 cursor-not-allowed"
        onClick={(e) => {
          e.stopPropagation();
          onShowHint();
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1 z-20 -translate-x-1/2 rounded-md border border-border bg-white/95 px-2 py-1 text-[11px] text-text-secondary opacity-0 peer-hover:opacity-100 transition-none whitespace-nowrap shadow-sm">
        No se pueden editar los Grupos, prueba editar un proyecto individual
      </div>
    </div>
  );
}

type SortKey = keyof Project;
type ColumnKey = 'drag' | 'project' | 'branch' | 'start' | 'end' | 'assignees' | 'days' | 'priority' | 'type' | 'load' | 'status';
type EssentialColumnId = 'project' | 'branch' | 'start' | 'end' | 'assignees' | 'days' | 'priority' | 'type' | 'load' | 'status';

type RenderColumn =
  | { kind: 'essential'; token: `essential:${EssentialColumnId}`; id: EssentialColumnId; label: string; sortKey: SortKey; widthKey: ColumnKey; nonEditableName: true }
  | { kind: 'dynamic'; token: `dynamic:${string}`; id: string; column: DynamicColumn };

interface SortableRowProps {
  project: Project;
  allProjects: Project[];
  visibleOrderedProjects: Project[];
  renderColumns: RenderColumn[];
  onUpdate: (id: string, updates: Partial<Project>) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onAddAbove: (id: string) => void;
  onAddBelow: (id: string) => void;
  onAddGroupAbove: (id: string) => void;
  onAddGroupBelow: (id: string) => void;
  onAddInside: (id: string) => void;
  onDuplicateRow: (id: string) => void;
  onMoveToParent: (id: string, parentId: string | null) => void;
  onMoveBefore: (id: string, beforeId: string | '__end__') => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onOpenComments: (taskId: string) => void;
  onShowGroupEditHint: () => void;
  onAddBranchOption?: (label: string) => void;
  onRenameBranchOption?: (from: string, to: string) => void;
  onDeleteBranchOption?: (label: string) => void;
  onMergeBranchOption?: (left: string, right: string, keep: string) => void;
  onPresenceChange: (rowId: string | null, columnId?: string | null) => void;
  onSetPersonAvatar: (name: string, file: File) => Promise<void>;
  allPersons: string[];
  allBranches: string[];
  personProfiles: Record<string, { avatarUrl?: string }>;
  dynamicValues?: Record<string, DynamicCellValue>;
  onUpdateDynamicCell: (taskId: string, columnId: string, value: DynamicCellValue) => void;
  onAddDynamicTagOption?: (columnId: string, label: string) => Promise<void>;
  onRenameDynamicTagOption?: (columnId: string, from: string, to: string) => Promise<void>;
  onDeleteDynamicTagOption?: (columnId: string, label: string) => Promise<void>;
  onRenamePersonGlobal?: (from: string, to: string) => Promise<void>;
  onDeletePersonGlobal?: (name: string) => Promise<void>;
  onMergePersonsGlobal?: (left: string, right: string, keep: string) => Promise<void>;
  onAddPersonOption?: (name: string) => void;
  isSelected?: boolean;
  isDropTarget?: boolean;
  dropPlacement?: 'before' | 'inside' | 'after' | null;
  dropTargetDepth?: number;
  dragActiveId?: string | null;
  multiSelectMode?: boolean;
  isChecked?: boolean;
  onToggleChecked?: (id: string, checked: boolean) => void;
  onSelectRow?: (id: string, ev?: ReactMouseEvent<HTMLElement>) => void;
  rowRef?: (node: HTMLTableRowElement | null) => void;
  editingNameId?: string | null;
  editNameValue?: string;
  onStartEditName?: (projectId: string, currentName: string) => void;
  onFinishEditName?: (newName: string) => void;
  onCancelEditName?: () => void;
}

export function SortableRow({
  project,
  allProjects,
  visibleOrderedProjects,
  renderColumns,
  onUpdate,
  onDelete,
  onToggleExpand,
  onAddAbove,
  onAddBelow,
  onAddGroupAbove,
  onAddGroupBelow,
  onAddInside,
  onDuplicateRow,
  onMoveToParent,
  onMoveBefore,
  onIndent,
  onOutdent,
  onOpenComments,
  onShowGroupEditHint,
  onAddBranchOption,
  onRenameBranchOption,
  onDeleteBranchOption,
  onMergeBranchOption,
  onPresenceChange,
  onSetPersonAvatar,
  allPersons,
  allBranches,
  personProfiles,
  dynamicValues,
  onUpdateDynamicCell,
  onAddDynamicTagOption,
  onRenameDynamicTagOption,
  onDeleteDynamicTagOption,
  onRenamePersonGlobal,
  onDeletePersonGlobal,
  onMergePersonsGlobal,
  onAddPersonOption,
  isSelected,
  isDropTarget,
  dropPlacement,
  dropTargetDepth = 0,
  dragActiveId,
  multiSelectMode,
  isChecked,
  onToggleChecked,
  onSelectRow,
  rowRef,
  editingNameId,
  editNameValue,
  onStartEditName,
  onFinishEditName,
  onCancelEditName,
}: SortableRowProps) {
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [localEditNameValue, setLocalEditNameValue] = useState('');
  const [moveToMode, setMoveToMode] = useState<'before' | 'inside'>('before');
  const [moveToQuery, setMoveToQuery] = useState('');
  const [moveToTargetId, setMoveToTargetId] = useState<string | '__end__'>('__end__');
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingNameId === project.id && editNameValue !== undefined) {
      setLocalEditNameValue(editNameValue);
    }
  }, [editingNameId, project.id, editNameValue]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  const hasChildren = useMemo(() => allProjects.some((p) => p.parentId === project.id), [allProjects, project.id]);
  const childCount = useMemo(() => allProjects.filter((p) => p.parentId === project.id).length, [allProjects, project.id]);
  const isOverloaded = (project.dailyLoad ?? 0) > 100;
  const isPastDue = Boolean(project.endDate && project.endDate < new Date());
  const rowBgClass = hasChildren ? 'bg-bg-secondary' : 'bg-white';
  const groupReadonlyToneClass = hasChildren ? 'text-slate-600' : '';
  const INDENT_PX = 24;
  const lineIndent = Math.max(8, dropTargetDepth * INDENT_PX + (dropPlacement === 'inside' ? 24 : 8));
  const pointIndent = Math.max(4, dropTargetDepth * INDENT_PX + (dropPlacement === 'inside' ? 20 : 4));
  const showDropLine = Boolean(isDropTarget && dropPlacement);
  const lineAtTop = dropPlacement === 'before';
  const isAnyDragging = Boolean(dragActiveId);
  const showDropZones = isAnyDragging && !isDragging;
  const dropBefore = useDroppable({ id: `dz:before:${project.id}`, disabled: !isAnyDragging });
  const dropInside = useDroppable({ id: `dz:inside:${project.id}`, disabled: !isAnyDragging });
  const dropAfter = useDroppable({ id: `dz:after:${project.id}`, disabled: !isAnyDragging });
  const dropLabel = dropPlacement === 'inside'
    ? 'Como hijo'
    : dropPlacement === 'before'
      ? 'Como hermano arriba'
      : 'Como hermano abajo';

  const disallowedParentIds = useMemo(
    () => new Set([project.id, ...getDescendants(project.id, allProjects).map((d) => d.id)]),
    [project.id, allProjects],
  );
  const parentOptions = useMemo(() => {
    const allowed = allProjects.filter((p) => !disallowedParentIds.has(p.id));
    return allowed.filter((p) => allProjects.some((child) => child.parentId === p.id));
  }, [allProjects, disallowedParentIds]);
  const beforeOptions = useMemo(() => allProjects.filter((p) => !disallowedParentIds.has(p.id)), [allProjects, disallowedParentIds]);
  const filteredParentOptions = useMemo(() => {
    const q = moveToQuery.trim().toLowerCase();
    if (!q) return parentOptions;
    return parentOptions.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [moveToQuery, parentOptions]);
  const filteredBeforeOptions = useMemo(() => {
    const q = moveToQuery.trim().toLowerCase();
    if (!q) return beforeOptions;
    return beforeOptions.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [moveToQuery, beforeOptions]);

  const toInputDate = (value: Date | null): string | null => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return format(value, 'yyyy-MM-dd');
  };

  const fromInputDate = (value: string | null): Date | null => {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    // Use local noon to avoid TZ rollback/forward when persisted and re-rendered.
    return new Date(year, month, day, 12, 0, 0, 0);
  };

  useEffect(() => {
    if (!rowMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setRowMenuOpen(false);
        setMoveToOpen(false);
        setRowMenuPos(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [rowMenuOpen]);

  return (
    <>
    <tr
      ref={(node) => {
        setNodeRef(node);
        rowRef?.(node);
      }}
      style={{
        transform: isDragging ? CSS.Transform.toString(transform) : undefined,
        transition: isDragging ? transition : undefined,
        opacity: isDragging ? 0 : 1,
      }}
      className={`group relative select-none ${isSelected ? 'bg-[#E6F0FF] border-l-2 border-l-[#3B82F6] [&>td]:bg-[#EAF2FF] [&>td]:border-t [&>td]:border-b [&>td]:border-t-[#60A5FA] [&>td]:border-b-[#60A5FA] [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-[#3B82F6] [&>td:last-child]:border-r-2 [&>td:last-child]:border-r-[#3B82F6]' : rowBgClass} ${isPastDue ? 'border-l-4 border-l-red-500' : ''} ${isOverloaded ? 'border-l-4 border-l-orange-500' : ''}`}
      onClick={(e) => onSelectRow?.(project.id, e)}
      onMouseEnter={() => onPresenceChange(project.id)}
      onMouseLeave={() => onPresenceChange(null)}
    >
      <td className={`relative w-8 overflow-visible px-1 py-2 border-b border-border ${rowBgClass}`} ref={rowMenuRef}>
        {!multiSelectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddBelow(project.id);
            }}
            className="absolute -left-[21px] top-1/2 -translate-y-1/2 z-[90] opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-secondary/30 hover:text-text-secondary transition-opacity focus:outline-none"
            title="Agregar fila"
            aria-label="Agregar fila"
          >
            <Plus size={15} strokeWidth={2.6} />
          </button>
        )}
        {showDropZones && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[70] w-[calc(100vw)]"
            style={{ top: 0, left: 0, height: '100%' }}
          >
            <div ref={dropBefore.setNodeRef} className={`absolute left-0 right-0 top-0 h-1/4 ${dropPlacement === 'before' ? 'bg-blue-100/45' : 'bg-blue-50/15'}`} />
            <div ref={dropInside.setNodeRef} className={`absolute left-0 right-0 top-1/4 h-2/4 ${dropPlacement === 'inside' ? 'bg-blue-100/45' : 'bg-blue-50/10'}`} />
            <div ref={dropAfter.setNodeRef} className={`absolute left-0 right-0 bottom-0 h-1/4 ${dropPlacement === 'after' ? 'bg-blue-100/45' : 'bg-blue-50/15'}`} />
          </div>
        )}
        {showDropLine && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[80] w-[calc(100vw)]"
            style={lineAtTop ? { top: 0, left: 0 } : { bottom: 0, left: 0 }}
          >
            <div className="relative h-0">
              <div
                className="absolute border-t-2 border-blue-500"
                style={{ left: `${lineIndent}px`, right: '8px', top: 0 }}
              />
              <div
                className="absolute h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500"
                style={{ left: `${pointIndent}px`, top: 0 }}
              />
              <span
                className="absolute -top-3 right-2 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700"
              >
                {dropLabel}
              </span>
            </div>
          </div>
        )}
        {multiSelectMode ? (
          <input
            type="checkbox"
            checked={Boolean(isChecked)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleChecked?.(project.id, e.target.checked)}
            className="h-3.5 w-3.5 accent-[#3B82F6]"
          />
        ) : (
          <button
            {...attributes}
            {...listeners}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const btnRect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              setRowMenuOpen((v) => {
                const next = !v;
                if (next) {
                  const menuW = 240;
                  const menuH = 320;
                  const gap = 6;
                  const left = Math.max(8, Math.min(btnRect.right + gap, window.innerWidth - menuW - 8));
                  const openUp = btnRect.bottom + menuH > window.innerHeight && btnRect.top > menuH;
                  const top = openUp ? Math.max(8, btnRect.top - menuH) : Math.min(window.innerHeight - 8, btnRect.top);
                  setRowMenuPos({ top, left });
                } else {
                  setRowMenuPos(null);
                }
                return next;
              });
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-secondary/30 hover:text-text-secondary hover:bg-bg-secondary transition-opacity"
            title="Arrastrar y menú"
          >
            <GripVertical size={15} />
          </button>
        )}

        {rowMenuOpen && (
          <div
            className={rowMenuPos ? "fixed z-[260] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5" : "absolute left-6 top-0 z-[170] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5"}
            style={rowMenuPos ? { top: rowMenuPos.top, left: rowMenuPos.left } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddAbove(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar fila arriba</button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddBelow(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar fila debajo</button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddGroupAbove(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar grupo arriba</button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddGroupBelow(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar grupo debajo</button>
            {hasChildren && <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onAddInside(project.id); setRowMenuOpen(false); }}><Plus size={13} />Agregar dentro</button>}
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onDuplicateRow(project.id); setRowMenuOpen(false); }}><Copy size={13} />Duplicar fila</button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onOpenComments(project.id); setRowMenuOpen(false); }}><MessageSquare size={13} />Comentarios...</button>
            <button
              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
              onClick={() => {
                setMoveToOpen(true);
                setMoveToMode('before');
                setMoveToTargetId('__end__');
                setMoveToQuery('');
                setRowMenuOpen(false);
              }}
            >
              <ArrowRightLeft size={13} />
              Mover / Copiar a...
            </button>
            <div className="my-1 border-t border-border" />
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onIndent(project.id); setRowMenuOpen(false); }}><ChevronRight size={13} />Meter a grupo</button>
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onOutdent(project.id); setRowMenuOpen(false); }}><ChevronLeft size={13} />Sacar de grupo</button>
            <div className="my-1 border-t border-border" />
            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50 inline-flex items-center gap-2" onClick={() => { onDelete(project.id); setRowMenuOpen(false); }}><Trash2 size={13} />Eliminar fila</button>
          </div>
        )}
      </td>

      {renderColumns.map((rc) => {
        if (rc.kind === 'dynamic') {
          const col = rc.column;
          const cellValue = dynamicValues?.[col.id] ?? null;
          return (
            <td key={rc.token} className={`relative px-2 py-2 border-b border-border text-[14px] ${rowBgClass} min-w-[140px] ${groupReadonlyToneClass}`}>
              {col.type === 'checkbox' ? (
                <input type="checkbox" checked={Boolean(cellValue)} onChange={(e) => onUpdateDynamicCell(project.id, col.id, e.target.checked)} className="h-3.5 w-3.5 accent-[#3B82F6]" />
              ) : col.type === 'number' ? (
                isProgressColumn(col) ? (
                  <ProgressRating value={normalizeProgressValue(cellValue)} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                ) : isStarsColumn(col) ? (
                  <StarRating value={normalizeStarsValue(cellValue) || 0} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                ) : (
                  <EditableNumberCell value={typeof cellValue === 'number' ? cellValue : null} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                )
              ) : col.type === 'date' ? (
                <EditableDateCell value={typeof cellValue === 'string' ? cellValue : null} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
              ) : col.type === 'select' ? (
                <EditableSelectCell value={typeof cellValue === 'string' ? cellValue : null} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} options={Array.isArray(col.config?.options) ? (col.config.options as string[]) : []} />
              ) : col.type === 'tags' ? (
                <EditableTagsCell value={Array.isArray(cellValue) ? (cellValue as string[]) : []} options={Array.isArray(col.config?.options) ? (col.config.options as string[]) : []} columnName={col.name} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} onAddOption={(label) => onAddDynamicTagOption?.(col.id, label) || Promise.resolve()} onRenameOption={(from, to) => onRenameDynamicTagOption?.(col.id, from, to) || Promise.resolve()} onDeleteOption={(label) => onDeleteDynamicTagOption?.(col.id, label) || Promise.resolve()} />
              ) : (
                <EditableTextCell value={typeof cellValue === 'string' ? cellValue : ''} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} placeholder="Escribir..." />
              )}
              {hasChildren && (
                <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
              )}
            </td>
          );
        }

        switch (rc.id) {
          case 'project':
            return (
              <td key={rc.token} className={`relative px-0 py-1 border-b border-border ${rowBgClass} min-w-[240px]`}>
                {(() => {
                  const hierarchyLevel = project.hierarchyLevel ?? 0;
                  if (hierarchyLevel <= 0) return null;
                  const treeGutterPx = 70;
                  return (
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute bottom-0 left-0 h-px ${isSelected ? 'bg-[#EAF2FF]' : rowBgClass}`}
                      style={{ width: treeGutterPx }}
                    />
                  );
                })()}
                <ExpandableCell
                  project={project}
                  hasChildren={hasChildren}
                  childCount={childCount}
                  onToggleExpand={onToggleExpand}
                  isEditing={editingNameId === project.id}
                  editValue={editingNameId === project.id ? localEditNameValue : project.name}
                  onStartEdit={() => onStartEditName?.(project.id, project.name)}
                  onFinishEdit={(v) => onFinishEditName?.(v)}
                  onCancelEdit={() => onCancelEditName?.()}
                  onEditChange={setLocalEditNameValue}
                  onIndent={onIndent}
                  onOutdent={onOutdent}
                />
              </td>
            );
          case 'branch':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border ${rowBgClass} min-w-[120px] ${groupReadonlyToneClass}`}>
                <EditableBranchTagCell
                  value={normalizeBranchList(project.branch)}
                  options={allBranches}
                  columnName="Sucursal"
                  onChange={(v) => onUpdate(project.id, { branch: v })}
                  onAddOption={(label) => onAddBranchOption?.(label)}
                  onRenameOption={(from, to) => onRenameBranchOption?.(from, to)}
                  onDeleteOption={(label) => onDeleteBranchOption?.(label)}
                  onMergeOption={(left, right, keep) => onMergeBranchOption?.(left, right, keep)}
                />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'start':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border ${rowBgClass} ${groupReadonlyToneClass}`}>
                <EditableDateCell value={toInputDate(project.startDate)} onChange={(v) => onUpdate(project.id, { startDate: fromInputDate(v) })} />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'end':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border ${rowBgClass} ${groupReadonlyToneClass}`}>
                <EditableDateCell value={toInputDate(project.endDate)} onChange={(v) => onUpdate(project.id, { endDate: fromInputDate(v) })} />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'assignees':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border ${rowBgClass} ${groupReadonlyToneClass}`}>
                <RichEditableAssigneesCell
                  value={project.assignees || []}
                  options={allPersons}
                  onChange={(v) => {
                    onUpdate(project.id, { assignees: v });
                    if (onAddPersonOption) {
                      const currentSet = new Set((project.assignees || []).map(p => p.toLowerCase()));
                      v.forEach(person => {
                        if (!currentSet.has(person.toLowerCase())) {
                          onAddPersonOption(person);
                        }
                      });
                    }
                  }}
                  onRenamePerson={onRenamePersonGlobal || (async () => {})}
                  onDeletePerson={onDeletePersonGlobal || (async () => {})}
                  onSetPersonAvatar={onSetPersonAvatar}
                  onMergePersons={onMergePersonsGlobal ? (left, right, keep) => onMergePersonsGlobal(left, right, keep as 'left' | 'right') : undefined}
                />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'days':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border text-center ${rowBgClass} ${groupReadonlyToneClass}`}>
                <EditableNumberCell value={project.daysRequired ?? 0} onChange={(v) => onUpdate(project.id, { daysRequired: Math.max(0, v ?? 0) })} min={0} />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'priority':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border ${rowBgClass} ${groupReadonlyToneClass}`}>
                <StarRating value={project.priority || 0} onChange={(v) => onUpdate(project.id, { priority: v })} />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'type':
            return (
              <td key={rc.token} className={`relative px-2 py-2 border-b border-border ${rowBgClass} ${groupReadonlyToneClass}`}>
                <EditableSelectCell value={project.type || null} onChange={(v) => onUpdate(project.id, { type: (v as Project['type']) || 'Proyecto' })} options={['Proyecto', 'Lanzamiento', 'En radar']} />
                {hasChildren && (
                  <GroupRowLockedOverlay onShowHint={onShowGroupEditHint} />
                )}
              </td>
            );
          case 'load':
            const loadAssignees = project.assignees?.length ?? 0;
            const displayLoad = loadAssignees > 0 ? project.dailyLoad / loadAssignees : project.dailyLoad;
            return <td key={rc.token} className={`px-2 py-2 border-b border-border text-center text-[11px] ${rowBgClass} ${groupReadonlyToneClass}`}>{(displayLoad ?? 0) > 0 ? <LoadBubble load={displayLoad} size="sm" /> : <span className="text-[11px] text-text-secondary">Sin carga</span>}</td>;
          case 'status':
            return (
              <td key={rc.token} className={`px-2 py-2 border-b border-border ${rowBgClass} ${groupReadonlyToneClass}`}>
                <StatusBadge status={getProjectStatus(project, dynamicValues)} />
              </td>
            );
          default:
            return null;
        }
      })}

    </tr>

    {moveToOpen && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[240] bg-black/30 flex items-center justify-center p-4" onClick={() => setMoveToOpen(false)}>
        <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-text-primary">Mover / Copiar fila</div>
          <div className="mt-3 grid grid-cols-2 rounded-lg border border-border p-1 text-xs">
            <button
              type="button"
              className={`px-2 py-1.5 rounded ${moveToMode === 'before' ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary'}`}
              onClick={() => {
                setMoveToMode('before');
                setMoveToTargetId('__end__');
              }}
            >
              Mover como hermano
            </button>
            <button
              type="button"
              className={`px-2 py-1.5 rounded ${moveToMode === 'inside' ? 'bg-bg-secondary text-text-primary' : 'text-text-secondary'}`}
              onClick={() => {
                setMoveToMode('inside');
                setMoveToTargetId('__end__');
              }}
            >
              Mover dentro de grupo
            </button>
          </div>
          <input
            type="text"
            value={moveToQuery}
            onChange={(e) => setMoveToQuery(e.target.value)}
            className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="Buscar destino..."
          />
          <div className="mt-2 text-xs text-text-secondary">{moveToMode === 'before' ? 'Antes de:' : 'Grupo destino:'}</div>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border">
            {moveToMode === 'before' ? (
              <>
                {filteredBeforeOptions.map((option) => {
                  const selected = moveToTargetId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary truncate ${selected ? 'bg-person-1/10' : ''}`}
                      onClick={() => setMoveToTargetId(option.id)}
                    >
                      {option.name || 'Sin nombre'}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary ${moveToTargetId === '__end__' ? 'bg-person-1/10' : ''}`}
                  onClick={() => setMoveToTargetId('__end__')}
                >
                  (Poner al final)
                </button>
              </>
            ) : (
              <>
                {filteredParentOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-secondary">
                    No hay grupos disponibles. Usa "Mover como hermano" y elige "Antes de".
                  </div>
                )}
                {filteredParentOptions.map((option) => {
                  const selected = moveToTargetId === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-secondary truncate ${selected ? 'bg-person-1/10' : ''}`}
                      onClick={() => setMoveToTargetId(option.id)}
                    >
                      {option.name || 'Sin nombre'}
                    </button>
                  );
                })}
              </>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="px-3 py-1.5 rounded border border-border text-sm" onClick={() => setMoveToOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={moveToMode === 'inside' && moveToTargetId === '__end__'}
              className="px-3 py-1.5 rounded bg-text-primary text-white text-sm"
              onClick={() => {
                if (moveToMode === 'before') {
                  onMoveBefore(project.id, moveToTargetId);
                } else if (moveToTargetId !== '__end__') {
                  onMoveToParent(project.id, moveToTargetId);
                }
                setMoveToOpen(false);
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}




