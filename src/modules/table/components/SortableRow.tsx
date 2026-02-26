import { useMemo, useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
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

type SortKey = keyof Project;
type ColumnKey = 'drag' | 'project' | 'branch' | 'start' | 'end' | 'assignees' | 'days' | 'priority' | 'type' | 'load' | 'balance';
type EssentialColumnId = 'project' | 'branch' | 'start' | 'end' | 'assignees' | 'days' | 'priority' | 'type' | 'load' | 'balance';

type RenderColumn =
  | { kind: 'essential'; token: `essential:${EssentialColumnId}`; id: EssentialColumnId; label: string; sortKey: SortKey; widthKey: ColumnKey; nonEditableName: true }
  | { kind: 'dynamic'; token: `dynamic:${string}`; id: string; column: DynamicColumn };

interface SortableRowProps {
  project: Project;
  allProjects: Project[];
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
  isSelected?: boolean;
  isDropTarget?: boolean;
  dropPlacement?: 'before' | 'inside' | 'after' | null;
  multiSelectMode?: boolean;
  isChecked?: boolean;
  onToggleChecked?: (id: string, checked: boolean) => void;
  onSelectRow?: (id: string, ev?: ReactMouseEvent<HTMLElement>) => void;
  rowRef?: (node: HTMLTableRowElement | null) => void;
}

export function SortableRow({
  project,
  allProjects,
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
  isSelected,
  isDropTarget,
  multiSelectMode,
  isChecked,
  onToggleChecked,
  onSelectRow,
  rowRef,
}: SortableRowProps) {
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [moveToMode, setMoveToMode] = useState<'before' | 'inside'>('before');
  const [moveToQuery, setMoveToQuery] = useState('');
  const [moveToTargetId, setMoveToTargetId] = useState<string | '__end__'>('__end__');
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  const hasChildren = useMemo(() => allProjects.some((p) => p.parentId === project.id), [allProjects, project.id]);
  const childCount = useMemo(() => allProjects.filter((p) => p.parentId === project.id).length, [allProjects, project.id]);
  const isOverloaded = (project.dailyLoad ?? 0) > 100;
  const isPastDue = Boolean(project.endDate && project.endDate < new Date());

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
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={`group ${isSelected ? 'bg-[#EAF2FF]' : 'bg-white'} ${isSelected ? 'ring-2 ring-inset ring-[#3B82F6]/50' : ''} ${isDropTarget ? 'bg-accent-blue/10' : ''} ${isPastDue ? 'border-l-4 border-l-red-500' : ''} ${isOverloaded ? 'border-l-4 border-l-orange-500' : ''}`}
      onClick={(e) => onSelectRow?.(project.id, e)}
      onMouseEnter={() => onPresenceChange(project.id)}
      onMouseLeave={() => onPresenceChange(null)}
    >
      <td className="relative w-8 px-1 py-2 border-b border-border bg-white" ref={rowMenuRef}>
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
              setRowMenuOpen((v) => !v);
            }}
            className="p-0.5 rounded text-text-secondary/30 hover:text-text-secondary hover:bg-bg-secondary"
            title="Arrastrar y menú"
          >
            <GripVertical size={15} />
          </button>
        )}

        {rowMenuOpen && (
          <div className="absolute left-6 top-0 z-[170] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5" onClick={(e) => e.stopPropagation()}>
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
            <td key={rc.token} className="px-2 py-2 border-b border-border text-xs bg-white min-w-[140px]">
              {col.type === 'checkbox' ? (
                <input type="checkbox" checked={Boolean(cellValue)} onChange={(e) => onUpdateDynamicCell(project.id, col.id, e.target.checked)} className="h-3.5 w-3.5 accent-[#3B82F6]" />
              ) : col.type === 'number' ? (
                isProgressColumn(col) ? (
                  <ProgressRating value={normalizeProgressValue(cellValue) || 0} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
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
            </td>
          );
        }

        switch (rc.id) {
          case 'project':
            return (
              <td key={rc.token} className="px-0 py-1 border-b border-border bg-white min-w-[240px]">
                <ExpandableCell project={project} hasChildren={hasChildren} childCount={childCount} onToggleExpand={onToggleExpand} />
              </td>
            );
          case 'branch':
            return (
              <td key={rc.token} className="px-2 py-2 border-b border-border bg-white min-w-[120px]">
                <EditableBranchTagCell
                  value={normalizeBranchList(project.branch)}
                  options={allBranches}
                  columnName="Sucursal"
                  onChange={(v) => onUpdate(project.id, { branch: v })}
                  onAddOption={(label) => onAddBranchOption?.(label)}
                  onRenameOption={(from, to) => onRenameBranchOption?.(from, to)}
                  onDeleteOption={(label) => onDeleteBranchOption?.(label)}
                />
              </td>
            );
          case 'start':
            return <td key={rc.token} className="px-2 py-2 border-b border-border bg-white"><EditableDateCell value={toInputDate(project.startDate)} onChange={(v) => onUpdate(project.id, { startDate: fromInputDate(v) })} /></td>;
          case 'end':
            return <td key={rc.token} className="px-2 py-2 border-b border-border bg-white"><EditableDateCell value={toInputDate(project.endDate)} onChange={(v) => onUpdate(project.id, { endDate: fromInputDate(v) })} /></td>;
          case 'assignees':
            return (
              <td key={rc.token} className="px-2 py-2 border-b border-border bg-white">
                <RichEditableAssigneesCell
                  value={project.assignees || []}
                  options={allPersons}
                  onChange={(v) => onUpdate(project.id, { assignees: v })}
                  onRenamePerson={onRenamePersonGlobal || (async () => {})}
                  onSetPersonAvatar={onSetPersonAvatar}
                />
              </td>
            );
          case 'days':
            return (
              <td key={rc.token} className="px-2 py-2 border-b border-border text-center bg-white">
                <EditableNumberCell value={project.daysRequired ?? 0} onChange={(v) => onUpdate(project.id, { daysRequired: Math.max(0, v ?? 0) })} min={0} />
              </td>
            );
          case 'priority':
            return <td key={rc.token} className="px-2 py-2 border-b border-border bg-white"><StarRating value={project.priority || 0} onChange={(v) => onUpdate(project.id, { priority: v })} /></td>;
          case 'type':
            return <td key={rc.token} className="px-2 py-2 border-b border-border bg-white"><EditableSelectCell value={project.type || null} onChange={(v) => onUpdate(project.id, { type: (v as Project['type']) || 'Proyecto' })} options={['Proyecto', 'Lanzamiento', 'En radar']} /></td>;
          case 'load':
            return <td key={rc.token} className="px-2 py-2 border-b border-border text-center bg-white">{(project.dailyLoad ?? 0) > 0 ? <LoadBubble load={project.dailyLoad} size="sm" /> : <span className="text-xs text-text-secondary">Sin carga</span>}</td>;
          case 'balance':
            return (
              <td key={rc.token} className="px-2 py-2 border-b border-border text-center bg-white tabular-nums">
                {project.assignedDays > 0 ? <span className={(project.balanceDays ?? 0) >= 0 ? 'text-[#2D6A2E]' : 'text-[#B71C1C]'}>{(project.balanceDays ?? 0) > 0 ? '+' : ''}{project.balanceDays ?? 0}d</span> : '—'}
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



