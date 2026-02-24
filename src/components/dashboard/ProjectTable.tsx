import { useMemo, useState, useCallback, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { useUiFeedback } from '@/context/UiFeedbackContext';
import { usePersonProfiles } from '@/context/PersonProfilesContext';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { formatDateShort, format, isValidDateValue } from '@/lib/dateUtils';
import { computeProjectFields } from '@/lib/workloadEngine';
import { branchLabel, normalizeBranchList } from '@/lib/branchUtils';
import { exportToExcel, copyAsCSV } from '@/lib/exportUtils';
import { ExpandableCell, useHierarchyDisplay } from '@/components/dashboard/ExpandableCell';
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

type DynamicDisplayType = DynamicColumn['type'] | 'progress' | 'stars';
const GROUP_CONVERSION_WARNING_MESSAGE = 'Al convertir este elemento en Grupo se perderán sus datos para pasar a ser resumen su interior. ¿Continuar?';

const dynamicDisplayLabelEs: Record<DynamicDisplayType, string> = {
  text: 'Texto',
  number: 'Numero',
  date: 'Fecha',
  select: 'Seleccion',
  tags: 'Etiquetas',
  checkbox: 'Casilla',
  progress: 'Avance',
  stars: 'Estrellas',
};

function isProgressColumn(column: DynamicColumn): boolean {
  return column.type === 'number' && column.config?.display === 'progress';
}

function isStarsColumn(column: DynamicColumn): boolean {
  return column.type === 'number' && column.config?.display === 'stars';
}

function normalizeProgressValue(raw: DynamicCellValue): number | null {
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(100, n));
  return Math.round(clamped / 10) * 10;
}

function normalizeStarsValue(raw: DynamicCellValue): number | null {
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(5, n));
  return Math.round(clamped);
}

function normalizeDynamicValue(column: DynamicColumn, raw: DynamicCellValue): DynamicCellValue {
  switch (column.type) {
    case 'number': {
      if (isProgressColumn(column)) return normalizeProgressValue(raw);
      if (isStarsColumn(column)) return normalizeStarsValue(raw);
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
}

function isNormalizedMismatch(raw: DynamicCellValue, normalized: DynamicCellValue): boolean {
  if (Array.isArray(raw) || Array.isArray(normalized)) {
    const a = Array.isArray(raw) ? raw : [];
    const b = Array.isArray(normalized) ? normalized : [];
    if (a.length !== b.length) return true;
    return a.some((v, i) => String(v) !== String(b[i]));
  }
  return raw !== normalized;
}

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
  const isInvalidDate = value instanceof Date && !isValidDateValue(value);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const dateStr = value && !isInvalidDate
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
        {isInvalidDate ? (
          <span className="text-[#B71C1C]">Fecha inválida</span>
        ) : value ? (
          formatDateShort(value)
        ) : (
          <span className="text-text-secondary/50 italic">â€”</span>
        )}
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
  options,
  onChange,
  onRenamePerson,
  onDeletePerson,
  onMergePersons,
  personProfiles,
  onSetPersonAvatar,
}: {
  value: string[] | null | undefined;
  options: string[];
  onChange: (v: string[]) => void;
  onRenamePerson: (from: string, to: string) => Promise<void>;
  onDeletePerson: (name: string) => Promise<void>;
  onMergePersons: (left: string, right: string, keep: string) => Promise<void>;
  personProfiles: Record<string, { avatarUrl?: string }>;
  onSetPersonAvatar: (name: string, file: File) => Promise<void>;
}) {
  const safeValue = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [renamingFrom, setRenamingFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [mergeLeft, setMergeLeft] = useState('');
  const [mergeRight, setMergeRight] = useState('');
  const [mergeKeep, setMergeKeep] = useState<'left' | 'right'>('left');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mergedOptions = normalizeTagList([...options, ...safeValue]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (name: string) => {
    const key = normalizePersonKey(name);
    const exists = safeValue.some((x) => normalizePersonKey(x) === key);
    if (exists) onChange(safeValue.filter((x) => normalizePersonKey(x) !== key));
    else onChange([...safeValue, name]);
  };

  const addQuick = () => {
    const label = newAssignee.trim();
    if (!label) return;
    const key = normalizePersonKey(label);
    if (!safeValue.some((x) => normalizePersonKey(x) === key)) {
      onChange([...safeValue, label]);
    }
    setNewAssignee('');
  };

  const initialsOf = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  };

  const AvatarDot = ({ name }: { name: string }) => {
    const avatarUrl = getAvatarUrl(name);
    const c = pastelTagColor(name || 'persona');
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={name}
          className="h-5 w-5 shrink-0 rounded-full border border-border object-cover"
          title={name}
        />
      );
    }
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
        style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
        title={name}
      >
        {initialsOf(name)}
      </span>
    );
  };

  if (!open) {
    return (
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setOpen(true)}
        title="Clic para editar"
      >
        {safeValue.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <AvatarDot name={safeValue[0]} />
            <span className="text-[11px] text-text-secondary">{assigneesCompactLabel(safeValue)}</span>
          </span>
        ) : <span className="text-text-secondary/50 italic">Sin asignar</span>}
      </span>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className="w-full h-7 text-left px-2 py-1 rounded border border-border bg-white text-xs hover:bg-bg-secondary overflow-hidden"
        onClick={() => setOpen((v) => !v)}
      >
        {safeValue.length > 0 ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <AvatarDot name={safeValue[0]} />
            <span className="text-[11px] text-text-secondary truncate">{assigneesCompactLabel(safeValue)}</span>
          </span>
        ) : 'Seleccionar...'}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-[190] min-w-[190px] max-w-[260px] rounded-md border border-border bg-white shadow-lg p-2">
          <div className="max-h-40 overflow-auto">
            {mergedOptions.map((name) => {
              const checked = safeValue.some((x) => x.trim().toLowerCase() === name.trim().toLowerCase());
              return (
                <label key={name} className="flex items-center gap-2 px-1.5 py-1 text-xs rounded hover:bg-bg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(name)}
                    className="h-3.5 w-3.5 accent-[#3B82F6]"
                  />
                  <AvatarDot name={name} />
                  <span className="truncate">{name}</span>
                </label>
              );
            })}
            {mergedOptions.length === 0 && (
              <div className="px-1.5 py-1 text-[11px] text-text-secondary">Sin personas</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="mt-2 w-full h-7 px-2 text-xs rounded border border-border hover:bg-bg-secondary text-left"
          >
            Gestionar personas
          </button>
          <div className="mt-2 pt-2 border-t border-border flex items-center gap-1">
            <input
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addQuick();
                }
              }}
              placeholder="Agregar persona..."
              className="flex-1 h-7 rounded border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button type="button" onClick={addQuick} className="h-7 px-2 text-xs rounded border border-border hover:bg-bg-secondary">
              Agregar
            </button>
          </div>
        </div>
      )}

      {managerOpen && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center" onClick={() => setManagerOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-text-primary">Personas</div>
              <button className="text-xs px-2 py-1 rounded border border-border hover:bg-bg-secondary" onClick={() => setManagerOpen(false)}>Cerrar</button>
            </div>
            <div className="text-[11px] text-text-secondary mb-2">Renombra, elimina o fusiona duplicados (ej. Dario / Darío).</div>
            <div className="max-h-44 overflow-auto rounded-lg border border-border p-1">
              {mergedOptions.map((name) => (
                <div key={name} className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-bg-secondary">
                  <AvatarDot name={name} />
                  {renamingFrom === name ? (
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={async () => {
                        const to = renameDraft.trim();
                        setRenamingFrom(null);
                        setRenameDraft('');
                        if (!to || to === name) return;
                        await onRenamePerson(name, to);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const to = renameDraft.trim();
                          setRenamingFrom(null);
                          setRenameDraft('');
                          if (!to || to === name) return;
                          await onRenamePerson(name, to);
                        }
                        if (e.key === 'Escape') {
                          setRenamingFrom(null);
                          setRenameDraft('');
                        }
                      }}
                      autoFocus
                      className="flex-1 h-7 rounded border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <span className="flex-1 text-xs text-text-primary truncate">{name}</span>
                  )}
                  <button
                    type="button"
                    className="text-[11px] px-2 py-1 rounded border border-border hover:bg-bg-secondary"
                    onClick={() => {
                      setRenamingFrom(name);
                      setRenameDraft(name);
                    }}
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      await onDeletePerson(name);
                    }}
                  >
                    Eliminar
                  </button>
                  <label className="text-[11px] px-2 py-1 rounded border border-border hover:bg-bg-secondary cursor-pointer">
                    Foto
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await onSetPersonAvatar(name, file);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
              ))}
              {mergedOptions.length === 0 && (
                <div className="px-2 py-2 text-xs text-text-secondary">No hay personas registradas.</div>
              )}
            </div>

            <details className="mt-3 rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-text-primary">Fusionar personas</summary>
              <div className="grid grid-cols-2 gap-2">
                <select value={mergeLeft} onChange={(e) => { setMergeLeft(e.target.value); if (!mergeKeep) setMergeKeep('left'); }} className="h-8 rounded border border-border px-2 text-xs bg-white">
                  <option value="">Persona A</option>
                  {mergedOptions.map((p) => <option key={`left-${p}`} value={p}>{p}</option>)}
                </select>
                <select value={mergeRight} onChange={(e) => setMergeRight(e.target.value)} className="h-8 rounded border border-border px-2 text-xs bg-white">
                  <option value="">Persona B</option>
                  {mergedOptions.map((p) => <option key={`right-${p}`} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-text-secondary">Conservar:</span>
                <label className="inline-flex items-center gap-1"><input type="radio" checked={mergeKeep === 'left'} onChange={() => setMergeKeep('left')} />A</label>
                <label className="inline-flex items-center gap-1"><input type="radio" checked={mergeKeep === 'right'} onChange={() => setMergeKeep('right')} />B</label>
                <button
                  type="button"
                  className="ml-auto h-8 px-3 text-xs rounded border border-border hover:bg-bg-secondary disabled:opacity-40"
                  disabled={!mergeLeft || !mergeRight || mergeLeft === mergeRight}
                  onClick={async () => {
                    const keep = mergeKeep === 'left' ? mergeLeft : mergeRight;
                    await onMergePersons(mergeLeft, mergeRight, keep);
                    setMergeLeft('');
                    setMergeRight('');
                    setMergeKeep('left');
                  }}
                >
                  Fusionar
                </button>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
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
          <Star
            size={14}
            className="inline-block"
            fill={star <= (hover || value) ? 'currentColor' : 'none'}
            strokeWidth={1.8}
          />
        </button>
      ))}
    </div>
  );
}

function pastelTagColor(label: string): { bg: string; text: string; border: string } {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash << 5) - hash + label.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue} 70% 91%)`,
    text: `hsl(${hue} 35% 32%)`,
    border: `hsl(${hue} 55% 78%)`,
  };
}

function normalizeTagList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  raw
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((x) => {
      const key = x.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(x);
      }
    });
  return out;
}

function normalizePersonList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  raw
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((x) => {
      const key = normalizePersonKey(x);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(x);
      }
    });
  return out;
}

function assigneesCompactLabel(raw: string[] | null | undefined): string {
  const list = Array.isArray(raw) ? raw.map((x) => x.trim()).filter(Boolean) : [];
  if (list.length === 0) return 'Sin asignar';
  if (list.length === 1) return list[0];
  return `${list[0]} +${list.length - 1}`;
}

function EditableBranchTagCell({
  value,
  options,
  columnName,
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
}: {
  value: string[];
  options: string[];
  columnName: string;
  onChange: (v: string[]) => void;
  onAddOption: (label: string) => void;
  onRenameOption: (from: string, to: string) => void;
  onDeleteOption: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [addingInline, setAddingInline] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renamingFrom, setRenamingFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const normalizedOptions = normalizeTagList(options);
  const display = branchLabel(value);
  const color = pastelTagColor(display || 'sucursal');

  useEffect(() => {
    if (!editing && !managerOpen && !pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setEditing(false);
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [editing, managerOpen, pickerOpen]);

  if (!editing) {
    return (
      <button
        type="button"
        className="max-w-full inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border"
        style={{ backgroundColor: color.bg, color: color.text, borderColor: color.border }}
        onDoubleClick={() => { setEditing(true); setPickerOpen(true); }}
        title="Doble clic para editar sucursal"
      >
        <span className="truncate">{display || 'Sucursal'}</span>
      </button>
    );
  }
  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className="w-full min-w-[160px] px-2 py-1 border border-person-1/40 rounded text-xs bg-white text-left"
        onClick={() => setPickerOpen((v) => !v)}
      >
        {display || 'Seleccionar sucursal'}
      </button>
      {pickerOpen && (
        <div className="absolute left-0 top-8 z-[190] w-[220px] rounded-md border border-border bg-white shadow-lg p-1">
          <button
            type="button"
            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary ${value.length === 0 ? 'bg-bg-secondary' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange([]);
              setPickerOpen(false);
              setEditing(false);
            }}
          >
            Sin sucursal
          </button>
          {normalizedOptions.map((o) => (
            <button
              key={o}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const selected = value.some((v) => v.toLowerCase() === o.toLowerCase());
                if (selected) onChange(value.filter((v) => v.toLowerCase() !== o.toLowerCase()));
                else onChange(normalizeTagList([...value, o]));
              }}
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-border bg-white">
                {value.some((v) => v.toLowerCase() === o.toLowerCase()) ? <Check size={11} /> : null}
              </span>
              {o}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setPickerOpen(false);
              setManagerOpen(true);
            }}
          >
            Agregar/Editar etiquetas
          </button>
        </div>
      )}

      {managerOpen && (
        <div className="fixed inset-0 z-[240] bg-black/25 flex items-center justify-center p-4" onClick={() => { setManagerOpen(false); setAddingInline(false); setNewLabel(''); setRenamingFrom(null); setRenameDraft(''); }}>
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-text-primary">Etiquetas de {columnName}</div>
            <div className="mt-1 text-[11px] text-text-secondary">Doble clic en la etiqueta para editarla</div>
            <div className="mt-3 border border-border rounded-lg overflow-hidden">
              {normalizedOptions.map((tag) => {
                const c = pastelTagColor(tag);
                const isRenaming = renamingFrom === tag;
                return (
                  <div key={tag} className="px-3 py-2 border-b last:border-b-0 border-border/70 flex items-center justify-between gap-2 group">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          const nextLabel = renameDraft.trim();
                          if (nextLabel && nextLabel.toLowerCase() !== tag.toLowerCase()) onRenameOption(tag, nextLabel);
                          setRenamingFrom(null);
                          setRenameDraft('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const nextLabel = renameDraft.trim();
                            if (nextLabel && nextLabel.toLowerCase() !== tag.toLowerCase()) onRenameOption(tag, nextLabel);
                            setRenamingFrom(null);
                            setRenameDraft('');
                          }
                          if (e.key === 'Escape') {
                            setRenamingFrom(null);
                            setRenameDraft('');
                          }
                        }}
                        className="w-full h-7 rounded-md border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded-full text-[10px] border"
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                          onDoubleClick={() => { setRenamingFrom(tag); setRenameDraft(tag); }}
                          title="Doble clic para editar nombre"
                        >
                          {tag}
                        </button>
                        <button
                          type="button"
                          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border text-text-secondary hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            const ok = window.confirm(`Se eliminara la etiqueta "${tag}" y se limpiara en las filas que la usen. Quieres continuar?`);
                            if (!ok) return;
                            onDeleteOption(tag);
                          }}
                          title="Eliminar etiqueta"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="px-3 py-2 border-t border-border/70">
                {addingInline ? (
                  <input
                    autoFocus
                    value={newLabel}
                    placeholder="Agrega etiqueta..."
                    onChange={(e) => setNewLabel(e.target.value)}
                    onBlur={() => {
                      const trimmed = newLabel.trim();
                      if (trimmed) onAddOption(trimmed);
                      setAddingInline(false);
                      setNewLabel('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = newLabel.trim();
                        if (trimmed) onAddOption(trimmed);
                        setAddingInline(false);
                        setNewLabel('');
                      }
                      if (e.key === 'Escape') {
                        setAddingInline(false);
                        setNewLabel('');
                      }
                    }}
                    className="w-full h-8 rounded-md border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                  />
                ) : (
                  <button
                    type="button"
                    className="w-full h-8 rounded-md border border-dashed border-border px-2 text-xs text-text-secondary text-left hover:bg-bg-secondary"
                    onClick={() => setAddingInline(true)}
                  >
                    Agrega etiqueta...
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22]"
                onClick={() => { setManagerOpen(false); setAddingInline(false); setNewLabel(''); setRenamingFrom(null); setRenameDraft(''); }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableTagsCell({
  value,
  options,
  columnName,
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
}: {
  value: string[];
  options: string[];
  columnName: string;
  onChange: (v: string[]) => void;
  onAddOption: (label: string) => Promise<void>;
  onRenameOption: (from: string, to: string) => Promise<void>;
  onDeleteOption: (label: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [addingInline, setAddingInline] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renamingFrom, setRenamingFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing && !managerOpen && !pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setEditing(false);
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [editing, managerOpen, pickerOpen]);

  const normalizedOptions = normalizeTagList(options);

  return (
    <div ref={wrapperRef} className="relative">
      {!editing ? (
        <button
          type="button"
          className="w-full text-left min-h-[24px]"
          onDoubleClick={() => { setEditing(true); setPickerOpen(true); }}
          title="Doble clic para editar etiquetas"
        >
          {value.length === 0 ? (
            <span className="text-text-secondary/50 italic">Sin etiquetas</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((tag) => {
                const c = pastelTagColor(tag);
                return (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] border" style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
                    {tag}
                  </span>
                );
              })}
            </div>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="w-full min-w-[180px] max-w-[220px] px-2 py-1 border border-person-1/40 rounded text-xs bg-white text-left"
              onClick={() => setPickerOpen((v) => !v)}
            >
              Seleccionar etiquetas
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-8 z-[190] w-[240px] rounded-md border border-border bg-white shadow-lg p-1">
                {normalizedOptions.map((tag) => {
                  const selected = value.some((v) => v.toLowerCase() === tag.toLowerCase());
                  return (
                    <button
                      key={tag}
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (selected) {
                          onChange(value.filter((v) => v.toLowerCase() !== tag.toLowerCase()));
                        } else {
                          onChange(normalizeTagList([...value, tag]));
                        }
                      }}
                    >
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-border bg-white">
                        {selected ? <Check size={11} /> : null}
                      </span>
                      <span>{tag}</span>
                    </button>
                  );
                })}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPickerOpen(false);
                    setManagerOpen(true);
                  }}
                >
                  Agregar/Editar etiquetas
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {managerOpen && (
        <div className="fixed inset-0 z-[240] bg-black/25 flex items-center justify-center p-4" onClick={() => { setManagerOpen(false); setAddingInline(false); setNewLabel(''); setRenamingFrom(null); setRenameDraft(''); }}>
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-text-primary">Etiquetas de {columnName}</div>
            <div className="mt-1 text-[11px] text-text-secondary">Doble clic en la etiqueta para editarla</div>
            <div className="mt-3 border border-border rounded-lg overflow-hidden">
              {normalizedOptions.map((tag) => {
                const c = pastelTagColor(tag);
                const isRenaming = renamingFrom === tag;
                return (
                  <div key={tag} className="px-3 py-2 border-b last:border-b-0 border-border/70 flex items-center justify-between gap-2 group">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={async () => {
                          const nextLabel = renameDraft.trim();
                          if (nextLabel && nextLabel.toLowerCase() !== tag.toLowerCase()) await onRenameOption(tag, nextLabel);
                          setRenamingFrom(null);
                          setRenameDraft('');
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const nextLabel = renameDraft.trim();
                            if (nextLabel && nextLabel.toLowerCase() !== tag.toLowerCase()) await onRenameOption(tag, nextLabel);
                            setRenamingFrom(null);
                            setRenameDraft('');
                          }
                          if (e.key === 'Escape') {
                            setRenamingFrom(null);
                            setRenameDraft('');
                          }
                        }}
                        className="w-full h-7 rounded-md border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded-full text-[10px] border"
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                          onDoubleClick={() => { setRenamingFrom(tag); setRenameDraft(tag); }}
                          title="Doble clic para editar nombre"
                        >
                          {tag}
                        </button>
                        <button
                          type="button"
                          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border text-text-secondary hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={async () => {
                            const ok = window.confirm(`Se eliminara la etiqueta "${tag}" de esta columna y de sus celdas asociadas. Quieres continuar?`);
                            if (!ok) return;
                            await onDeleteOption(tag);
                          }}
                          title="Eliminar etiqueta"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="px-3 py-2 border-t border-border/70">
                {addingInline ? (
                  <input
                    autoFocus
                    value={newLabel}
                    placeholder="Agrega etiqueta..."
                    onChange={(e) => setNewLabel(e.target.value)}
                    onBlur={async () => {
                      const trimmed = newLabel.trim();
                      if (trimmed) await onAddOption(trimmed);
                      setAddingInline(false);
                      setNewLabel('');
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const trimmed = newLabel.trim();
                        if (trimmed) await onAddOption(trimmed);
                        setAddingInline(false);
                        setNewLabel('');
                      }
                      if (e.key === 'Escape') {
                        setAddingInline(false);
                        setNewLabel('');
                      }
                    }}
                    className="w-full h-8 rounded-md border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-blue-100"
                  />
                ) : (
                  <button
                    type="button"
                    className="w-full h-8 rounded-md border border-dashed border-border px-2 text-xs text-text-secondary text-left hover:bg-bg-secondary"
                    onClick={() => setAddingInline(true)}
                  >
                    Agrega etiqueta...
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22]"
                onClick={() => { setManagerOpen(false); setAddingInline(false); setNewLabel(''); setRenamingFrom(null); setRenameDraft(''); }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function safeFormatDateLike(value: unknown, fmt: string): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(String(value));
  if (!isValidDateValue(d)) return 'Fecha inválida';
  return format(d, fmt);
}

function ProgressRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const safe = normalizeProgressValue(value);
  const current = safe ?? 0;

  return (
    <div className="w-[96px] mx-auto">
      <button
        type="button"
        className="w-full text-center text-[11px] tabular-nums text-text-secondary hover:text-text-primary"
        onClick={() => onChange(safe === null ? 0 : null)}
        title={safe === null ? 'Marcar 0%' : 'Limpiar avance'}
      >
        {safe === null ? '--' : `${safe}%`}
      </button>
      <div className="mt-1 flex items-end justify-center gap-[2px]">
        {Array.from({ length: 10 }, (_, i) => {
          const step = (i + 1) * 10;
          const active = step <= current;
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              className={`w-[8px] rounded-sm transition-colors ${active ? 'bg-emerald-500' : 'bg-slate-200 hover:bg-slate-300'}`}
              style={{ height: `${6 + i}px` }}
              aria-label={`Avance ${step}%`}
              title={`${step}%`}
            />
          );
        })}
      </div>
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
}: {
  project: Project;
  onUpdate: (id: string, updates: Partial<Project>) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  hasChildren: boolean;
  allPersons: string[];
  allBranches: string[];
  onAddBranchOption: (label: string) => void;
  onRenameBranchOption: (from: string, to: string) => void;
  onDeleteBranchOption: (label: string) => void;
  bgClass?: string;
  allProjects: Project[];
  isLastSibling: boolean;
  childCount: number;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  isSelected: boolean;
  onSelectRow: (id: string, ev?: ReactMouseEvent<HTMLElement>) => void;
  multiSelectMode: boolean;
  isChecked: boolean;
  onToggleChecked: (id: string, checked: boolean) => void;
  isDropTarget: boolean;
  dropPlacement: DropPlacement | null;
  rowRef?: (node: HTMLTableRowElement | null) => void;
  onAddAbove: (id: string) => void;
  onAddBelow: (id: string) => void;
  onAddGroupAbove: (id: string) => void;
  onAddGroupBelow: (id: string) => void;
  onAddInside: (id: string) => void;
  onDuplicateRow: (id: string) => void;
  onMoveToParent: (id: string, parentId: string | null) => void;
  renderColumns: RenderColumn[];
  dynamicValues?: Record<string, DynamicCellValue>;
  onUpdateDynamicCell: (taskId: string, columnId: string, value: DynamicCellValue) => void;
  onAddDynamicTagOption: (columnId: string, label: string) => Promise<void>;
  onRenameDynamicTagOption: (columnId: string, from: string, to: string) => Promise<void>;
  onDeleteDynamicTagOption: (columnId: string, label: string) => Promise<void>;
  onRenamePersonGlobal: (from: string, to: string) => Promise<void>;
  onDeletePersonGlobal: (name: string) => Promise<void>;
  onMergePersonsGlobal: (left: string, right: string, keep: string) => Promise<void>;
  personProfiles: Record<string, { avatarUrl?: string }>;
  onSetPersonAvatar: (name: string, file: File) => Promise<void>;
  remoteEditingLabel?: string;
  onPresenceChange: (rowId: string | null, columnId?: string | null) => void;
  onOpenComments: (taskId: string) => void;
  onShowGroupEditHint: () => void;
}) {
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
            <td
              key={rc.token}
              className="relative px-2 py-2 border-b border-border text-xs bg-white min-w-[140px]"
              onFocusCapture={() => onPresenceChange(project.id, col.id)}
              onBlurCapture={(e) => {
                const next = e.relatedTarget as Node | null;
                const current = e.currentTarget as HTMLTableCellElement;
                if (!next || !current.contains(next)) onPresenceChange(null, null);
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
                isProgressColumn(col) ? (
                  <ProgressRating
                    value={normalizeProgressValue(cellValue)}
                    onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
                  />
                ) : isStarsColumn(col) ? (
                  <StarRating
                    value={normalizeStarsValue(cellValue) || 0}
                    onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
                  />
                ) : (
                  <EditableNumberCell value={Number(cellValue || 0)} onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)} />
                )
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
                <EditableTagsCell
                  value={Array.isArray(cellValue) ? (cellValue as string[]) : (typeof cellValue === 'string' && cellValue ? [cellValue] : [])}
                  options={Array.isArray(col.config?.options) ? (col.config.options as string[]) : []}
                  columnName={col.name}
                  onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
                  onAddOption={(label) => onAddDynamicTagOption(col.id, label)}
                  onRenameOption={(from, to) => onRenameDynamicTagOption(col.id, from, to)}
                  onDeleteOption={(label) => onDeleteDynamicTagOption(col.id, label)}
                />
              ) : (
                <EditableTextCell
                  value={typeof cellValue === 'string' ? cellValue : ''}
                  onChange={(v) => onUpdateDynamicCell(project.id, col.id, v)}
                  placeholder="Escribir..."
                />
              )}
              {isGroupRow && (
                <button
                  type="button"
                  className="absolute inset-0 z-10 cursor-not-allowed"
                  title="Las filas grupo solo se editan por resumen de sus hijos."
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowGroupEditHint();
                  }}
                />
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
                        onUpdate(project.id, { name: editNameValue });
                        setEditingName(false);
                      }}
                      onIndent={onIndent}
                      onOutdent={onOutdent}
                    />
                  </div>
                  {remoteEditingLabel && <span className="text-[10px] text-blue-500/80 whitespace-nowrap">Editando: {remoteEditingLabel}</span>}
                </div>
                {isDropTarget && dropPlacement === 'inside' && (
                  <div
                    className="pointer-events-none absolute -bottom-[1px] right-3 h-[3px] rounded-full bg-blue-600/95"
                    style={{ left: `${insideDropIndentPx}px` }}
                  />
                )}
                {isDropTarget && dropPlacement === 'inside' && (
                  <div
                    className="pointer-events-none absolute -bottom-[4px] h-2.5 w-2.5 rounded-full bg-blue-600 shadow-[0_0_0_2px_#fff]"
                    style={{ left: `${insideDropIndentPx - 2}px` }}
                  />
                )}
              </td>
            );
          case 'branch':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs text-text-secondary min-w-[100px] bg-white">
                <EditableBranchTagCell
                  value={normalizeBranchList(project.branch)}
                  onChange={(v) => onUpdate(project.id, { branch: v })}
                  options={allBranches}
                  columnName="Sucursal"
                  onAddOption={onAddBranchOption}
                  onRenameOption={onRenameBranchOption}
                  onDeleteOption={onDeleteBranchOption}
                />
                {isGroupRow && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
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
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
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
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
                )}
              </td>
            );
          case 'assignees':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs min-w-[100px] bg-white">
                {isCollapsed && collapsedSummary ? (
                  <div className="text-text-secondary">{assigneesCompactLabel(collapsedSummary.assignees)}</div>
                ) : (
                  <EditableAssigneesCell
                    value={project.assignees}
                    options={allPersons}
                    onChange={(v) => onUpdate(project.id, { assignees: v })}
                    onRenamePerson={onRenamePersonGlobal}
                    onDeletePerson={onDeletePersonGlobal}
                    onMergePersons={onMergePersonsGlobal}
                    personProfiles={personProfiles}
                    onSetPersonAvatar={onSetPersonAvatar}
                  />
                )}
                {isGroupRow && !isCollapsed && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
                )}
              </td>
            );
          case 'days':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border text-xs text-center bg-white">
                {isCollapsed && collapsedSummary ? (
                  <div className="text-text-secondary">{collapsedSummary.daysRequired > 0 ? collapsedSummary.daysRequired : 'â€”'}</div>
                ) : (
                  <EditableNumberCell value={project.daysRequired} onChange={(v) => onUpdate(project.id, { daysRequired: v })} min={0} hasWarning={!!hasDaysWarning} />
                )}
                {isGroupRow && !isCollapsed && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
                )}
              </td>
            );
          case 'priority':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border bg-white">
                <StarRating value={project.priority} onChange={(v) => onUpdate(project.id, { priority: v })} />
                {isGroupRow && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
                )}
              </td>
            );
          case 'type':
            return (
              <td key={rc.token} className="relative px-2 py-2 border-b border-border bg-white">
                <EditableSelectCell value={project.type} onChange={(v) => onUpdate(project.id, { type: v as Project['type'] })} options={types} />
                {isGroupRow && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-not-allowed"
                    title="Las filas grupo solo se editan por resumen de sus hijos."
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowGroupEditHint();
                    }}
                  />
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
                ) : 'â€”'}
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
  const { state, dispatch, allPersons, allBranches, activeBoardId, remoteEditingByRow, remoteEditingByColumn, announceEditingPresence } = useProject();
  const { user } = useAuth();
  const { confirm, toast } = useUiFeedback();
  const { getAvatarUrl, setAvatar } = usePersonProfiles();
  const groupHintAtRef = useRef<number>(0);
  const showGroupRowEditHint = useCallback(() => {
    const now = Date.now();
    if (now - groupHintAtRef.current < 1200) return;
    groupHintAtRef.current = now;
    toast('info', 'Las filas Grupo no se editan directamente, solo muestran un resumen de su interior.');
  }, [toast]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [showRadar, setShowRadar] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [columnValidationToast, setColumnValidationToast] = useState<string | null>(null);
  const [uiToast, setUiToast] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);
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
  const [moveCopyColumnId, setMoveCopyColumnId] = useState<ColumnToken | null>(null);
  const [moveCopyTargetId, setMoveCopyTargetId] = useState<ColumnToken | '__end__'>('__end__');
  const [moveCopyAsCopy, setMoveCopyAsCopy] = useState(false);
  const [moveCopyQuery, setMoveCopyQuery] = useState('');
  const [newColumnDialog, setNewColumnDialog] = useState<{
    open: boolean;
    position: number;
    name: string;
    type: DynamicDisplayType;
  } | null>(null);
  const [dragColumnToken, setDragColumnToken] = useState<ColumnToken | null>(null);
  const [columnTypePickerFor, setColumnTypePickerFor] = useState<string | null>(null);
  const [columnOptionsEditorFor, setColumnOptionsEditorFor] = useState<string | null>(null);
  const [columnOptionsDraft, setColumnOptionsDraft] = useState('');
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [linkTitleDraft, setLinkTitleDraft] = useState('');
  const [branchCatalog, setBranchCatalog] = useState<string[]>([]);
  const [personProfiles, setPersonProfiles] = useState<Record<string, { avatarUrl?: string }>>({});
  const defaultColumnWidths: Record<ColumnKey, number> = {
    drag: 36,
    project: 300,
    branch: 124,
    start: 112,
    end: 112,
    assignees: 152,
    days: 96,
    priority: 84,
    type: 108,
    load: 92,
    balance: 92,
    actions: 84,
  };
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(defaultColumnWidths);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const stickyToolsRef = useRef<HTMLDivElement>(null);
  const headerStickyRef = useRef<HTMLTableSectionElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const resizingColumnRef = useRef<{ key: ColumnKey; startX: number; startWidth: number } | null>(null);
  const dynamicReloadTimerRef = useRef<number | null>(null);
  const dynamicRequestSeqRef = useRef(0);
  const dynamicAppliedSeqRef = useRef(0);
  const [layoutSeedOrder, setLayoutSeedOrder] = useState<ColumnToken[] | null>(null);

  const minColumnWidths: Record<ColumnKey, number> = {
    drag: 32,
    project: 190,
    branch: 92,
    start: 90,
    end: 90,
    assignees: 110,
    days: 72,
    priority: 70,
    type: 88,
    load: 72,
    balance: 72,
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
    { kind: 'essential', token: 'essential:balance', id: 'balance', label: 'Balance', sortKey: 'balanceDays', widthKey: 'balance', nonEditableName: true },
  ]), []);

  const [columnOrder, setColumnOrder] = useState<ColumnToken[]>([]);

  useEffect(() => {
    if (!columnValidationToast) return;
    const id = window.setTimeout(() => setColumnValidationToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [columnValidationToast]);

  useEffect(() => {
    if (!uiToast) return;
    const id = window.setTimeout(() => setUiToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [uiToast]);

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
              Object.entries(parsed.widths).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 20)
            ),
          } as Record<ColumnKey, number>
        : defaultColumnWidths;
      setLayoutSeedOrder(seed && seed.length > 0 ? seed : null);
      setColumnWidths(safeWidths);
      setColumnOrder([]);
    } catch {
      setLayoutSeedOrder(null);
      setColumnWidths(defaultColumnWidths);
    }
  }, [activeBoardId]);

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
  }, [activeBoardId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `workload-dashboard-branch-catalog:${activeBoardId || 'local'}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(branchCatalog));
    } catch {
      // ignore storage errors
    }
  }, [activeBoardId, branchCatalog]);

  useEffect(() => {
    setPersonProfiles(loadPersonProfiles(activeBoardId));
  }, [activeBoardId]);

  useEffect(() => {
    savePersonProfiles(activeBoardId, personProfiles);
  }, [activeBoardId, personProfiles]);

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
      // eslint-disable-next-line no-console
      console.warn('Dynamic columns load failed:', err);
    }
  }, [activeBoardId]);

  useEffect(() => {
    refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  useEffect(() => {
    if (!supabase || !activeBoardId) return;
    const schedule = () => {
      if (dynamicReloadTimerRef.current) window.clearTimeout(dynamicReloadTimerRef.current);
      dynamicReloadTimerRef.current = window.setTimeout(() => {
        refreshDynamicColumns();
      }, 120);
    };

    const channel = supabase
      .channel(`dynamic-columns-${activeBoardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_columns', filter: `board_id=eq.${activeBoardId}` },
        schedule
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_column_values', filter: `board_id=eq.${activeBoardId}` },
        schedule
      )
      .subscribe();

    return () => {
      if (dynamicReloadTimerRef.current) {
        window.clearTimeout(dynamicReloadTimerRef.current);
        dynamicReloadTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [activeBoardId, refreshDynamicColumns]);

  useEffect(() => {
    if (!activeBoardId) return;
    const onFocus = () => {
      refreshDynamicColumns();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeBoardId, refreshDynamicColumns]);

  useEffect(() => {
    const essentialTokens = essentialColumnDefs.map((c) => c.token);
    const dynamicTokens = dynamicColumns
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => `dynamic:${c.id}` as ColumnToken);

    setColumnOrder((prev) => {
      if (prev.length === 0) {
        const base = [...essentialTokens, ...dynamicTokens];
        if (!layoutSeedOrder || layoutSeedOrder.length === 0) return base;
        const valid = new Set<ColumnToken>(base);
        const kept = layoutSeedOrder.filter((t) => valid.has(t));
        const missing = base.filter((t) => !kept.includes(t));
        return [...kept, ...missing];
      }
      const valid = new Set<ColumnToken>([...essentialTokens, ...dynamicTokens]);
      const kept = prev.filter((t) => valid.has(t));
      const missing = [...essentialTokens, ...dynamicTokens].filter((t) => !kept.includes(t));
      return [...kept, ...missing];
    });
  }, [essentialColumnDefs, dynamicColumns, layoutSeedOrder]);

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
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [activeBoardId, columnOrder, columnWidths]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-column-menu-safe]')) return;
      setColumnMenuOpenFor(null);
      setFixedHeaderMenuOpenFor(null);
      setColumnTypePickerFor(null);
      setColumnOptionsEditorFor(null);
      setFixedHeaderNameTooltipFor(null);
      setNewColumnDialog(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setColumnMenuOpenFor(null);
      setFixedHeaderMenuOpenFor(null);
      setColumnTypePickerFor(null);
      setColumnOptionsEditorFor(null);
      setFixedHeaderNameTooltipFor(null);
      setMoveCopyColumnId(null);
      setMoveCopyQuery('');
      setCommentsOpen(false);
      setNewColumnDialog(null);
      setSelectedRowId(null);
      setSelectedRowIds(new Set());
      setMultiSelectMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

  const handleAddBranchOption = useCallback((label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setBranchCatalog((prev) => normalizeTagList([...prev, clean]));
  }, []);

  const handleRenameBranchOption = useCallback((from: string, to: string) => {
    const fromClean = from.trim();
    const toClean = to.trim();
    if (!fromClean || !toClean) return;
    const fromKey = fromClean.toLowerCase();
    setBranchCatalog((prev) => normalizeTagList(prev.map((x) => (x.trim().toLowerCase() === fromKey ? toClean : x))));
    state.projects
      .forEach((p) => {
        const current = normalizeBranchList(p.branch);
        const next = normalizeTagList(current.map((x) => (x.trim().toLowerCase() === fromKey ? toClean : x)));
        const changed = next.length !== current.length || next.some((x, i) => x !== current[i]);
        if (!changed) return;
        dispatch({ type: 'UPDATE_PROJECT', payload: { id: p.id, updates: { branch: next } } });
      });
  }, [state.projects, dispatch]);

  const handleDeleteBranchOption = useCallback((label: string) => {
    const clean = label.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    setBranchCatalog((prev) => prev.filter((x) => x.trim().toLowerCase() !== key));
    state.projects
      .forEach((p) => {
        const current = normalizeBranchList(p.branch);
        const next = current.filter((x) => x.trim().toLowerCase() !== key);
        if (next.length === current.length) return;
        dispatch({ type: 'UPDATE_PROJECT', payload: { id: p.id, updates: { branch: next } } });
      });
  }, [state.projects, dispatch]);

  const handleDelete = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, [dispatch]);

  const handleRenamePersonGlobal = useCallback(async (from: string, to: string) => {
    const fromClean = from.trim();
    const toClean = to.trim();
    if (!fromClean || !toClean) return;
    const fromKey = normalizePersonKey(fromClean);
    state.projects.forEach((p) => {
      const next = normalizePersonList((p.assignees || []).map((name) => (normalizePersonKey(name) === fromKey ? toClean : name)));
      const current = p.assignees || [];
      const changed = next.length !== current.length || next.some((x, i) => x !== current[i]);
      if (!changed) return;
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: p.id, updates: { assignees: next } } });
    });
    setPersonProfiles((prev) => {
      const next = { ...prev };
      const source = next[fromKey];
      delete next[fromKey];
      if (source?.avatarUrl) next[normalizePersonKey(toClean)] = { avatarUrl: source.avatarUrl };
      return next;
    });
  }, [state.projects, dispatch]);

  const handleDeletePersonGlobal = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const key = normalizePersonKey(clean);
    const ok = await confirm({
      title: 'Eliminar persona',
      message: `Se eliminara "${clean}" de todas las filas. ¿Continuar?`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    state.projects.forEach((p) => {
      const next = (p.assignees || []).filter((x) => normalizePersonKey(x) !== key);
      const current = p.assignees || [];
      const changed = next.length !== current.length || next.some((x, i) => x !== current[i]);
      if (!changed) return;
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: p.id, updates: { assignees: next } } });
    });
    setPersonProfiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [state.projects, dispatch, confirm]);

  const handleMergePersonsGlobal = useCallback(async (left: string, right: string, keep: string) => {
    const leftClean = left.trim();
    const rightClean = right.trim();
    const keepClean = keep.trim();
    if (!leftClean || !rightClean || !keepClean) return;
    const leftKey = normalizePersonKey(leftClean);
    const rightKey = normalizePersonKey(rightClean);
    const keepKey = normalizePersonKey(keepClean);
    const ok = await confirm({
      title: 'Fusionar personas',
      message: `Se conservara "${keepClean}" y se reemplazara la otra en todas las filas. ¿Continuar?`,
      confirmText: 'Fusionar',
    });
    if (!ok) return;
    state.projects.forEach((p) => {
      const next = normalizePersonList((p.assignees || []).map((name) => {
        const key = normalizePersonKey(name);
        return key === leftKey || key === rightKey ? keepClean : name;
      }));
      const current = p.assignees || [];
      const changed = next.length !== current.length || next.some((x, i) => x !== current[i]);
      if (!changed) return;
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: p.id, updates: { assignees: next } } });
    });
    setPersonProfiles((prev) => {
      const next = { ...prev };
      const keepProfile = next[keepKey];
      const leftProfile = next[leftKey];
      const rightProfile = next[rightKey];
      if (!keepProfile?.avatarUrl) {
        const fallback = leftProfile?.avatarUrl || rightProfile?.avatarUrl;
        if (fallback) next[keepKey] = { avatarUrl: fallback };
      }
      delete next[leftKey];
      delete next[rightKey];
      if (next[keepKey]?.avatarUrl || keepProfile?.avatarUrl) {
        next[keepKey] = { avatarUrl: next[keepKey]?.avatarUrl || keepProfile?.avatarUrl };
      }
      return next;
    });
  }, [state.projects, dispatch, confirm]);

  const handleSetPersonAvatar = useCallback(async (name: string, file: File) => {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.readAsDataURL(file);
    });
    const key = normalizePersonKey(name);
    setPersonProfiles((prev) => ({ ...prev, [key]: { avatarUrl: dataUrl } }));
  }, []);

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
    setLastSelectedRowId(null);
    setBulkMenuOpen(false);
  }, []);

  const getSelectionOrdered = useCallback(() => {
    const selected = selectedRowIds;
    const baseOrder = state.projectOrder.length > 0 ? state.projectOrder : state.projects.map((p) => p.id);
    return baseOrder.filter((id) => selected.has(id));
  }, [selectedRowIds, state.projectOrder, state.projects]);

  const handleRowSelect = useCallback((id: string, ev?: ReactMouseEvent<HTMLElement>) => {
    const additive = !!(ev?.ctrlKey || ev?.metaKey);
    const range = !!ev?.shiftKey;
    const baseOrder = state.projectOrder.length > 0 ? state.projectOrder : state.projects.map((p) => p.id);

    if (range) {
      const anchor = lastSelectedRowId || selectedRowId || id;
      const a = baseOrder.indexOf(anchor);
      const b = baseOrder.indexOf(id);
      if (a === -1 || b === -1) {
        setSelectedRowId(id);
        setLastSelectedRowId(id);
        return;
      }
      const [start, end] = a < b ? [a, b] : [b, a];
      const rangeIds = baseOrder.slice(start, end + 1);
      setSelectedRowIds((prev) => {
        const next = new Set(additive ? prev : []);
        rangeIds.forEach((rid) => next.add(rid));
        return next;
      });
      setMultiSelectMode(true);
      setSelectedRowId(id);
      setLastSelectedRowId(id);
      return;
    }

    if (additive) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setMultiSelectMode(true);
      setSelectedRowId(id);
      setLastSelectedRowId(id);
      return;
    }

    if (multiSelectMode) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setSelectedRowId(id);
      setLastSelectedRowId(id);
      return;
    }

    setSelectedRowId(id);
    setLastSelectedRowId(id);
  }, [state.projectOrder, state.projects, lastSelectedRowId, selectedRowId, multiSelectMode]);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setBulkMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBulkMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [bulkMenuOpen]);

  const [localPresence, setLocalPresence] = useState<{ rowId: string | null; columnId: string | null }>({ rowId: null, columnId: null });
  useEffect(() => {
    announceEditingPresence(localPresence.rowId, localPresence.columnId);
  }, [localPresence, announceEditingPresence]);

  const handleToggleExpand = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_EXPANSION', payload: id });
  }, [dispatch]);

  const confirmParentConversionIfNeeded = useCallback(async (targetParentId: string | null): Promise<boolean> => {
    if (!targetParentId) return true;
    const parent = state.projects.find((p) => p.id === targetParentId);
    if (!parent) return true;
    const alreadyHasChildren = state.projects.some((p) => p.parentId === targetParentId);
    if (alreadyHasChildren) return true;
    const hasOwnDates = !!(parent.startDate || parent.endDate);
    if (!hasOwnDates) return true;

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
  }, [state.projects, confirm, dispatch]);

  const handleIndent = useCallback(async (projectId: string) => {
    const order = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map(p => p.id);
    const idx = order.indexOf(projectId);
    if (idx <= 0) return;
    const targetParentId = order[idx - 1];
    if (!targetParentId) return;

    // Validate
    if (!validateNoCircles(projectId, targetParentId, state.projects)) return;
    if (!(await confirmParentConversionIfNeeded(targetParentId))) return;

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
  }, [state.projectOrder, state.projects, dispatch, confirmParentConversionIfNeeded]);

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
      branch: [],
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
      branch: [],
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
      branch: normalizeBranchList(ref.branch),
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
      branch: normalizeBranchList(ref.branch),
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

  const handleAddGroupAround = useCallback((referenceId: string, placement: 'above' | 'below') => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (!ref) return;
    const group = createProjectDraft({
      name: 'Nuevo grupo',
      parentId: ref.parentId ?? null,
      branch: normalizeBranchList(ref.branch),
      startDate: null,
      endDate: null,
      isExpanded: true,
      type: ref.type,
    });
    const child = createProjectDraft({
      name: 'Nuevo proyecto',
      parentId: group.id,
      branch: normalizeBranchList(ref.branch),
      startDate: ref.startDate ?? null,
      endDate: ref.endDate ?? null,
      type: ref.type,
    });
    const currentOrder = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const refIdx = currentOrder.indexOf(referenceId);
    dispatch({ type: 'ADD_PROJECT', payload: group });
    dispatch({ type: 'ADD_PROJECT', payload: child });
    const insertAt = placement === 'above' ? Math.max(0, refIdx) : refIdx + 1;
    const newOrder = [...currentOrder];
    newOrder.splice(insertAt, 0, group.id, child.id);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    setSelectedRowId(group.id);
  }, [state.projects, state.projectOrder, createProjectDraft, dispatch]);

  const handleAddGroupAbove = useCallback((referenceId: string) => {
    handleAddGroupAround(referenceId, 'above');
  }, [handleAddGroupAround]);

  const handleAddGroupBelow = useCallback((referenceId: string) => {
    handleAddGroupAround(referenceId, 'below');
  }, [handleAddGroupAround]);

  const handleAddInside = useCallback((parentId: string) => {
    const parent = state.projects.find((p) => p.id === parentId);
    if (!parent) return;
    const newProject = createProjectDraft({
      parentId,
      branch: normalizeBranchList(parent.branch),
      type: parent.type,
    });
    const currentOrder = state.projectOrder.length > 0 ? [...state.projectOrder] : state.projects.map((p) => p.id);
    const parentIdx = currentOrder.indexOf(parentId);
    dispatch({ type: 'ADD_PROJECT', payload: newProject });
    const newOrder = [...currentOrder];
    newOrder.splice(parentIdx + 1, 0, newProject.id);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    dispatch({ type: 'UPDATE_PROJECT', payload: { id: parentId, updates: { isExpanded: true } } });
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
    const column = dynamicColumns.find((c) => c.id === columnId);
    if (!column) return;
    const normalized = normalizeDynamicValue(column, value);
    if (isNormalizedMismatch(value, normalized)) {
      setColumnValidationToast(`Valor ajustado para "${column.name}" por tipo de columna.`);
    }
    setDynamicValues((prev) => {
      const next = new Map(prev);
      const row = { ...(next.get(taskId) || {}) };
      row[columnId] = normalized;
      next.set(taskId, row);
      return next;
    });
    try {
      if (
        normalized === null ||
        normalized === '' ||
        (Array.isArray(normalized) && normalized.length === 0)
      ) {
        await deleteTaskColumnValue(taskId, columnId);
      } else {
        await upsertTaskColumnValue({
          boardId: activeBoardId,
          taskId,
          columnId,
          value: normalized,
          userId: user.id,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Dynamic cell save failed:', err);
    }
  }, [activeBoardId, user, dynamicColumns]);

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

  const openCreateDynamicColumnDialog = useCallback((position: number, presetType: DynamicDisplayType = 'text') => {
    const initialSuggested = `Nueva ${dynamicDisplayLabelEs[presetType]}`;
    const suggestedName = buildUniqueDynamicColumnName(initialSuggested);
    setNewColumnDialog({
      open: true,
      position,
      name: suggestedName,
      type: presetType,
    });
  }, [buildUniqueDynamicColumnName]);

  const handleCreateDynamicColumn = useCallback(async (position: number, baseName: string, presetType: DynamicDisplayType = 'text') => {
    if (!activeBoardId || !user) return;
    const initialSuggested = `Nueva ${dynamicDisplayLabelEs[presetType]}`;
    const cleanName = normalizeDynamicColumnName(baseName);
    const name = buildUniqueDynamicColumnName(cleanName || initialSuggested);
    if (!name) return;
    const key = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dbType: DynamicColumn['type'] = presetType === 'progress' || presetType === 'stars'
      ? 'number'
      : (presetType || 'text');
    const config: Record<string, unknown> =
      presetType === 'progress'
        ? { display: 'progress' }
        : presetType === 'stars'
          ? { display: 'stars' }
          : {};
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
  }, [activeBoardId, user, dynamicColumns, refreshDynamicColumns, normalizeDynamicColumnName, buildUniqueDynamicColumnName]);

  const submitCreateDynamicColumn = useCallback(async () => {
    if (!newColumnDialog?.open) return;
    const cleanName = normalizeDynamicColumnName(newColumnDialog.name);
    if (!cleanName) {
      setUiToast({ type: 'error', message: 'Ingresa un nombre para la columna.' });
      return;
    }
    const payload = { ...newColumnDialog };
    await handleCreateDynamicColumn(payload.position, payload.name, payload.type);
    setNewColumnDialog(null);
  }, [newColumnDialog, normalizeDynamicColumnName, handleCreateDynamicColumn]);

  const handleCreateDynamicColumnNearToken = useCallback(async (token: ColumnToken, after: boolean) => {
    if (!activeBoardId || !user) return;
    const idx = columnOrder.indexOf(token);
    const insertAt = idx === -1 ? columnOrder.length : idx + (after ? 1 : 0);
    const before = columnOrder.slice(0, insertAt);
    const dynBeforeCount = before.filter((t) => t.startsWith('dynamic:')).length;
    openCreateDynamicColumnDialog(dynBeforeCount, 'text');
  }, [activeBoardId, user, columnOrder, openCreateDynamicColumnDialog]);

  const moveColumnToken = useCallback((token: ColumnToken, dir: -1 | 1) => {
    setColumnOrder((prev) => {
      const i = prev.indexOf(token);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [m] = next.splice(i, 1);
      next.splice(j, 0, m);
      return next;
    });
  }, []);

  const beginEditDynamicColumnName = useCallback((columnId: string, currentName: string) => {
    setEditingColumnId(columnId);
    setEditingColumnName(currentName);
  }, []);

  const commitEditDynamicColumnName = useCallback(async () => {
    if (!editingColumnId) return;
    const name = buildUniqueDynamicColumnName(editingColumnName, editingColumnId);
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
  }, [editingColumnId, editingColumnName, dynamicColumns, refreshDynamicColumns, buildUniqueDynamicColumnName]);

  const handleChangeDynamicColumnType = useCallback(async (columnId: string, next: DynamicDisplayType) => {
    if (!['text', 'number', 'date', 'select', 'tags', 'checkbox', 'progress', 'stars'].includes(next)) return;
    const current = dynamicColumns.find((c) => c.id === columnId);
    if (!supabase || !current) return;
    const dbType: DynamicColumn['type'] = next === 'progress' || next === 'stars' ? 'number' : next;
    const currentOptions = Array.isArray(current.config?.options) ? (current.config?.options as string[]) : [];
    const nextConfig: Record<string, unknown> = { ...(current.config || {}) };
    if (next === 'select' || next === 'tags') {
      nextConfig.options = currentOptions.length > 0 ? currentOptions : ['Opcion 1', 'Opcion 2'];
      if (nextConfig.display) delete nextConfig.display;
    } else if (next === 'progress') {
      nextConfig.display = 'progress';
    } else if (next === 'stars') {
      nextConfig.display = 'stars';
    } else if (nextConfig.display) {
      delete nextConfig.display;
    }
    const { error } = await supabase.from('board_columns').update({ type: dbType, config: nextConfig }).eq('id', columnId);
    if (error) throw error;
    await refreshDynamicColumns();
  }, [refreshDynamicColumns, dynamicColumns]);

  const handleSaveDynamicColumnOptions = useCallback(async (columnId: string, raw: string) => {
    const normalized = raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const deduped: string[] = [];
    const seen = new Set<string>();
    normalized.forEach((opt) => {
      const key = opt.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(opt);
      }
    });
    if (deduped.length === 0) {
      setUiToast({ type: 'error', message: 'Agrega al menos una opcion valida.' });
      return;
    }
    await updateBoardColumn(columnId, { config: { options: deduped } });
    await refreshDynamicColumns();
  }, [refreshDynamicColumns]);

  const handleAddDynamicTagOption = useCallback(async (columnId: string, label: string) => {
    const clean = label.trim();
    if (!clean) return;
    const column = dynamicColumns.find((c) => c.id === columnId);
    if (!column) return;
    const current = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
    const next = normalizeTagList([...current, clean]);
    await updateBoardColumn(columnId, { config: { ...(column.config || {}), options: next } });
    await refreshDynamicColumns();
  }, [dynamicColumns, refreshDynamicColumns]);

  const handleRenameDynamicTagOption = useCallback(async (columnId: string, from: string, to: string) => {
    const fromClean = from.trim();
    const toClean = to.trim();
    if (!fromClean || !toClean) return;
    const column = dynamicColumns.find((c) => c.id === columnId);
    if (!column) return;
    const current = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
    if (current.length === 0) return;

    const fromKey = fromClean.toLowerCase();
    const toKey = toClean.toLowerCase();
    const mapped = current.map((opt) => (opt.trim().toLowerCase() === fromKey ? toClean : opt));
    const nextOptions = normalizeTagList(mapped);
    await updateBoardColumn(columnId, { config: { ...(column.config || {}), options: nextOptions } });

    if (!activeBoardId || !user) {
      await refreshDynamicColumns();
      return;
    }

    const nextDynamicValues = new Map(dynamicValues);
    const updates: Promise<void>[] = [];
    nextDynamicValues.forEach((taskCols, taskId) => {
      const raw = taskCols[columnId];
      if (!raw) return;
      const asList = Array.isArray(raw)
        ? normalizeTagList(raw.map((x) => String(x)))
        : typeof raw === 'string' && raw
          ? [raw]
          : [];
      if (asList.length === 0) return;
      const renamed = asList.map((tag) => (tag.trim().toLowerCase() === fromKey ? toClean : tag));
      const deduped = normalizeTagList(renamed);
      const changed = deduped.length !== asList.length || deduped.some((x, i) => x !== asList[i]);
      if (!changed) return;
      const nextTaskCols = { ...taskCols, [columnId]: deduped };
      nextDynamicValues.set(taskId, nextTaskCols);
      updates.push(
        upsertTaskColumnValue({
          boardId: activeBoardId,
          taskId,
          columnId,
          value: deduped,
          userId: user.id,
        })
      );
    });

    if (updates.length > 0) await Promise.all(updates);
    setDynamicValues(nextDynamicValues);
    await refreshDynamicColumns();
  }, [dynamicColumns, activeBoardId, user, dynamicValues, refreshDynamicColumns]);

  const handleDeleteDynamicTagOption = useCallback(async (columnId: string, label: string) => {
    const clean = label.trim();
    if (!clean) return;
    const column = dynamicColumns.find((c) => c.id === columnId);
    if (!column) return;
    const current = Array.isArray(column.config?.options) ? (column.config.options as string[]) : [];
    if (current.length === 0) return;

    const removeKey = clean.toLowerCase();
    const nextOptions = current.filter((opt) => opt.trim().toLowerCase() !== removeKey);
    await updateBoardColumn(columnId, { config: { ...(column.config || {}), options: nextOptions } });

    if (!activeBoardId || !user) {
      await refreshDynamicColumns();
      return;
    }

    const nextDynamicValues = new Map(dynamicValues);
    const updates: Promise<void>[] = [];
    nextDynamicValues.forEach((taskCols, taskId) => {
      const raw = taskCols[columnId];
      if (!raw) return;
      const asList = Array.isArray(raw)
        ? normalizeTagList(raw.map((x) => String(x)))
        : typeof raw === 'string' && raw
          ? [raw]
          : [];
      if (asList.length === 0) return;
      const filtered = asList.filter((tag) => tag.trim().toLowerCase() !== removeKey);
      const changed = filtered.length !== asList.length;
      if (!changed) return;
      const nextTaskCols = { ...taskCols, [columnId]: filtered };
      nextDynamicValues.set(taskId, nextTaskCols);
      updates.push(
        upsertTaskColumnValue({
          boardId: activeBoardId,
          taskId,
          columnId,
          value: filtered,
          userId: user.id,
        })
      );
    });

    if (updates.length > 0) await Promise.all(updates);
    setDynamicValues(nextDynamicValues);
    await refreshDynamicColumns();
  }, [dynamicColumns, activeBoardId, user, dynamicValues, refreshDynamicColumns]);

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
      name: buildUniqueDynamicColumnName(`${col.name} (copia)`),
      type: col.type,
      position: dupPos,
      createdBy: user.id,
      config: col.config,
    });
    await refreshDynamicColumns();
  }, [dynamicColumns, activeBoardId, user, refreshDynamicColumns, buildUniqueDynamicColumnName]);

  const persistDynamicPositionsFromOrder = useCallback(async (order: ColumnToken[]) => {
    const dynamicIds = order
      .filter((t): t is `dynamic:${string}` => t.startsWith('dynamic:'))
      .map((t) => t.replace('dynamic:', ''));
    const current = [...dynamicColumns].sort((a, b) => a.position - b.position);
    for (let i = 0; i < dynamicIds.length; i += 1) {
      const id = dynamicIds[i];
      const cur = current.find((c) => c.id === id);
      if (cur && cur.position !== i) await updateBoardColumn(id, { position: i });
    }
    await refreshDynamicColumns();
  }, [dynamicColumns, refreshDynamicColumns]);

  useEffect(() => {
    if (dynamicColumns.length === 0) return;
    const dynamicIdsFromOrder = columnOrder
      .filter((t): t is `dynamic:${string}` => t.startsWith('dynamic:'))
      .map((t) => t.replace('dynamic:', ''));
    const currentIdsByPos = [...dynamicColumns]
      .sort((a, b) => a.position - b.position)
      .map((c) => c.id);
    if (dynamicIdsFromOrder.length !== currentIdsByPos.length) return;
    const same = dynamicIdsFromOrder.every((id, idx) => id === currentIdsByPos[idx]);
    if (same) return;
    void persistDynamicPositionsFromOrder(columnOrder);
  }, [columnOrder, dynamicColumns, persistDynamicPositionsFromOrder]);

  const handleDeleteDynamicColumn = useCallback(async (columnId: string) => {
    const ok = await confirm({ title: 'Eliminar columna', message: 'Esta accion no se puede deshacer.', confirmText: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    await deleteBoardColumn(columnId);
    await refreshDynamicColumns();
  }, [refreshDynamicColumns, confirm]);

  const handleMoveOrCopyDynamicColumn = useCallback(async () => {
    if (!moveCopyColumnId) return;
    const sourceToken = moveCopyColumnId;
    const sourceIsDynamic = sourceToken.startsWith('dynamic:');
    const sourceId = sourceToken.replace('dynamic:', '');
    const sorted = [...dynamicColumns].sort((a, b) => a.position - b.position);
    const source = sourceIsDynamic ? sorted.find((c) => c.id === sourceId) : null;

    if (moveCopyAsCopy && source) {
      let insertPos = sorted.length;
      if (moveCopyTargetId !== '__end__' && moveCopyTargetId.startsWith('dynamic:')) {
        const target = sorted.find((c) => c.id === moveCopyTargetId.replace('dynamic:', ''));
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
      setColumnOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(sourceToken);
        if (from === -1) return prev;
        const [m] = next.splice(from, 1);
        const to = moveCopyTargetId === '__end__' ? next.length : next.indexOf(moveCopyTargetId);
        next.splice(to === -1 ? next.length : to, 0, m);
        void persistDynamicPositionsFromOrder(next);
        return next;
      });
    }

    setMoveCopyColumnId(null);
    setMoveCopyTargetId('__end__');
    setMoveCopyAsCopy(false);
    setMoveCopyQuery('');
    setColumnMenuOpenFor(null);
    await refreshDynamicColumns();
  }, [moveCopyColumnId, moveCopyTargetId, moveCopyAsCopy, dynamicColumns, activeBoardId, user, refreshDynamicColumns, persistDynamicPositionsFromOrder]);

  const openCommentsForTask = useCallback(async (taskId: string) => {
    if (!activeBoardId) return;
    try {
      const rows = await listTaskComments(activeBoardId, taskId);
      setComments(rows);
      setCommentsTaskId(taskId);
      setCommentsOpen(true);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudieron cargar comentarios: ${String(err)}` });
    }
  }, [activeBoardId]);

  const submitComment = useCallback(async () => {
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
  }, [activeBoardId, user, commentsTaskId, commentDraft]);

  const submitLinkComment = useCallback(async () => {
    if (!activeBoardId || !user || !commentsTaskId) return;
    const raw = linkUrlDraft.trim();
    if (!raw) return;
    let url: URL;
    try {
      url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    } catch {
      setUiToast({ type: 'error', message: 'URL invalida' });
      return;
    }
    const label = linkTitleDraft.trim();
    const body = label ? `LINK|${label}|${url.toString()}` : `LINK||${url.toString()}`;
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
  }, [activeBoardId, user, commentsTaskId, linkUrlDraft, linkTitleDraft]);

  const parseLinkComment = useCallback((body: string): { title: string; url: string } | null => {
    if (!body.startsWith('LINK|')) return null;
    const parts = body.split('|');
    if (parts.length < 3) return null;
    const title = parts[1] || '';
    const url = parts.slice(2).join('|');
    if (!url) return null;
    return { title, url };
  }, []);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!activeBoardId || !commentsTaskId) return;
    const ok = await confirm({ title: 'Eliminar comentario', message: 'Esta accion no se puede deshacer.', confirmText: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    try {
      await deleteTaskComment(commentId);
      const rows = await listTaskComments(activeBoardId, commentsTaskId);
      setComments(rows);
    } catch (err) {
      setUiToast({ type: 'error', message: `No se pudo eliminar comentario: ${String(err)}` });
    }
  }, [activeBoardId, commentsTaskId, confirm]);

  const commentsTargetProject = useMemo(
    () => state.projects.find((p) => p.id === commentsTaskId) ?? null,
    [state.projects, commentsTaskId]
  );

  useEffect(() => {
    if (!commentsOpen || !activeBoardId || !commentsTaskId || !supabase) return;
    const sb = supabase;
    const channel = sb
      .channel(`task-comments-${activeBoardId}-${commentsTaskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `board_id=eq.${activeBoardId}` },
        async (payload) => {
          const nextTaskId = ((payload.new as { task_id?: string } | null)?.task_id)
            || ((payload.old as { task_id?: string } | null)?.task_id);
          if (nextTaskId !== commentsTaskId) return;
          const rows = await listTaskComments(activeBoardId, commentsTaskId);
          setComments(rows);
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [commentsOpen, activeBoardId, commentsTaskId]);

  const handleMoveToParent = useCallback(async (projectId: string, parentId: string | null) => {
    if (!validateNoCircles(projectId, parentId, state.projects)) return;
    if (!(await confirmParentConversionIfNeeded(parentId))) return;
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
  }, [state.projects, state.projectOrder, dispatch, confirmParentConversionIfNeeded]);

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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
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
        if (!(await confirmParentConversionIfNeeded(overId))) {
          setDragPreview({ activeId: null, overId: null, placement: null });
          return;
        }
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
        if (!(await confirmParentConversionIfNeeded(targetParentId))) {
          setDragPreview({ activeId: null, overId: null, placement: null });
          return;
        }
        dispatch({ type: 'UPDATE_HIERARCHY', payload: { projectId: activeId, newParentId: targetParentId } });
      }
    }

    const adjustedTarget = placement === 'after' ? newIndex + 1 : newIndex;
    const insertIndex = oldIndex < adjustedTarget ? adjustedTarget - blockIds.length : adjustedTarget;
    const newOrder = moveBlock(currentOrder, blockIds, insertIndex);
    dispatch({ type: 'REORDER_PROJECTS', payload: newOrder });
    setDragPreview({ activeId: null, overId: null, placement: null });
  }, [state.projectOrder, state.projects, dispatch, dragPreview.overId, dragPreview.placement, computeDropPlacement, confirmParentConversionIfNeeded]);

  const branchOptions = useMemo(() => {
    const set = new Set(allBranches);
    branchCatalog.forEach((b) => set.add(b));
    state.projects.forEach((p) => normalizeBranchList(p.branch).forEach((b) => set.add(b)));
    return Array.from(set).sort();
  }, [allBranches, state.projects, branchCatalog]);

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
    () => {
      const essentialById = new Map(essentialColumnDefs.map((c) => [c.id, c]));
      const dynamicById = new Map(dynamicColumns.map((c) => [c.id, c]));
      const middle = columnOrder.reduce((sum, token) => {
        if (token.startsWith('essential:')) {
          const id = token.replace('essential:', '') as EssentialColumnId;
          const ec = essentialById.get(id);
          return sum + (ec ? columnWidths[ec.widthKey] : 0);
        }
        const dynId = token.replace('dynamic:', '');
        return sum + (dynamicById.has(dynId) ? 160 : 0);
      }, 0);
      return columnWidths.drag + middle + columnWidths.actions;
    },
    [columnWidths, columnOrder, essentialColumnDefs, dynamicColumns]
  );
  const totalTableColumns = 2 + columnOrder.length;

  const renderColumns = useMemo<RenderColumn[]>(() => {
    const essentialByToken = new Map(essentialColumnDefs.map((c) => [c.token, c] as const));
    const dynamicByToken = new Map(
      dynamicColumns.map((c) => [`dynamic:${c.id}` as ColumnToken, { kind: 'dynamic', token: `dynamic:${c.id}` as const, id: c.id, column: c } as RenderColumn])
    );
    return columnOrder
      .map((token) => essentialByToken.get(token as `essential:${EssentialColumnId}`) || dynamicByToken.get(token))
      .filter(Boolean) as RenderColumn[];
  }, [columnOrder, essentialColumnDefs, dynamicColumns]);

  const filteredMoveCopyTargets = useMemo(() => {
    const q = moveCopyQuery.trim().toLowerCase();
    const options = renderColumns.filter((rc) => rc.token !== moveCopyColumnId);
    if (!q) return options;
    return options.filter((rc) => {
      const label = rc.kind === 'essential' ? rc.label : rc.column.name;
      return label.toLowerCase().includes(q);
    });
  }, [renderColumns, moveCopyColumnId, moveCopyQuery]);

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
    const token = `essential:${colKey as EssentialColumnId}` as ColumnToken;
    const tokenIdx = columnOrder.indexOf(token);
    const isDateField = field === 'startDate' || field === 'endDate';
    const isNumericField = field === 'daysRequired' || field === 'priority';
    const sortAscLabel = isDateField
      ? 'De mas antiguo a mas reciente'
      : isNumericField
        ? 'De menor a mayor'
        : 'Orden alfabetico A-Z';
    const sortDescLabel = isDateField
      ? 'De mas reciente a mas antiguo'
      : isNumericField
        ? 'De mayor a menor'
        : 'Inverso de orden alfabetico Z-A';
    return (
    <th
      className={`group relative bg-white px-2 py-2.5 text-left text-xs font-semibold text-text-secondary select-none border-b border-border ${
        roundedLeft ? 'rounded-tl-lg' : ''
      } ${roundedRight ? 'rounded-tr-lg' : ''} ${className || ''}`}
      onDragOver={(e) => {
        if (!dragColumnToken) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!dragColumnToken || dragColumnToken === token) return;
        setColumnOrder((prev) => {
          const next = [...prev];
          const from = next.indexOf(dragColumnToken);
          const to = next.indexOf(token);
          if (from === -1 || to === -1) return prev;
          const [m] = next.splice(from, 1);
          next.splice(to, 0, m);
          void persistDynamicPositionsFromOrder(next);
          return next;
        });
        setDragColumnToken(null);
      }}
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
        <div data-column-menu-safe className="absolute left-2 top-[calc(100%+4px)] z-[185] rounded-lg border border-border bg-white px-2 py-1 text-[11px] text-text-secondary shadow-[0_6px_14px_rgba(15,23,42,0.08)] whitespace-nowrap">
          Nombre no editable en columnas esenciales
        </div>
      )}
      <button
        data-column-menu-safe
        draggable
        onDragStart={() => setDragColumnToken(token)}
        onDragEnd={() => setDragColumnToken(null)}
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
          role="menu"
          aria-label="Menu de columna esencial"
          className="absolute right-0 top-[calc(100%+4px)] z-[180] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5"
        >
          <button
            autoFocus
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
            onClick={async () => {
              await handleCreateDynamicColumnNearToken(token, false);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            <Plus size={13} />
            Agregar antes
          </button>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
            onClick={async () => {
              await handleCreateDynamicColumnNearToken(token, true);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            <Plus size={13} />
            Agregar despues
          </button>
          <button
            disabled={tokenIdx <= 0}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary disabled:opacity-40 inline-flex items-center gap-2"
            onClick={() => {
              moveColumnToken(token, -1);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            <ChevronRight size={13} className="rotate-180" />
            Mover a la izquierda
          </button>
          <button
            disabled={tokenIdx < 0 || tokenIdx >= columnOrder.length - 1}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary disabled:opacity-40 inline-flex items-center gap-2"
            onClick={() => {
              moveColumnToken(token, 1);
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            <ChevronRight size={13} />
            Mover a la derecha
          </button>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
            onClick={() => {
              setMoveCopyColumnId(token);
              setMoveCopyTargetId('__end__');
              setMoveCopyAsCopy(false);
              setMoveCopyQuery('');
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            <GripVertical size={13} />
            Mover / Copiar a...
          </button>
          <div className="my-1 border-t border-border" />
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-secondary">
            Ordenar por...
          </div>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary"
            onClick={() => {
              setSortForKey(field, 'asc');
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            {sortAscLabel}
          </button>
          <button
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary"
            onClick={() => {
              setSortForKey(field, 'desc');
              setFixedHeaderMenuOpenFor(null);
            }}
          >
            {sortDescLabel}
          </button>
          <button
            disabled={sortKey !== field}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary disabled:opacity-40"
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
      <div data-selection-safe ref={stickyToolsRef} className="sticky top-0 z-40 -mx-4 px-4 bg-bg-secondary border-b border-border/80">
      {/* Top bar */}
      <div className="py-2.5 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proyecto..."
            className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-person-1/25 focus:border-person-1"
          />
        </div>

        <span className="text-xs text-text-secondary">
          {state.projects.length} proyectos
        </span>

        <div className="flex-1" />

        <button
          onClick={() => {
            setMultiSelectMode((prev) => {
              const next = !prev;
              if (!next) setSelectedRowIds(new Set());
              return next;
            });
          }}
          className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            multiSelectMode
              ? 'bg-[#EAF2FF] border-[#93C5FD] text-[#1E40AF] hover:bg-[#E1ECFF]'
              : 'bg-white border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
          title="Activar selección múltiple"
        >
          {multiSelectMode ? 'Salir selección múltiple' : 'Seleccionar varios'}
        </button>

        {(selectedRowId || selectedRowIds.size > 0) && (
          <button
            onClick={clearSelection}
            className="px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg border border-border bg-white hover:bg-bg-secondary transition-colors"
            title="Deseleccionar"
          >
            Deseleccionar
          </button>
        )}
        {multiSelectMode && (
          <div className="relative" ref={bulkMenuRef}>
            <button
              onClick={() => setBulkMenuOpen((v) => !v)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-border bg-white hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
              title="Acciones de selección múltiple"
            >
              <MoreHorizontal size={14} />
              {selectedRowIds.size}
            </button>
            {bulkMenuOpen && (
              <div className="absolute right-0 mt-1 z-[170] w-44 rounded-lg border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1">
                <button className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { setSelectedRowIds(new Set(renderedProjectIds)); setBulkMenuOpen(false); }}>
                  <Check size={13} /> Seleccionar todos
                </button>
                <div className="my-1 border-t border-border" />
                <button disabled={selectedRowIds.size === 0} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" onClick={async () => { for (const id of getSelectionOrdered()) { await handleIndent(id); } setBulkMenuOpen(false); }}>
                  <ChevronRight size={13} /> Meter a grupo
                </button>
                <button disabled={selectedRowIds.size === 0} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" onClick={async () => { for (const id of getSelectionOrdered()) { await handleOutdent(id); } setBulkMenuOpen(false); }}>
                  <ChevronLeft size={13} /> Sacar de grupo
                </button>
                <button disabled={selectedRowIds.size === 0} className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" onClick={() => { getSelectionOrdered().forEach((id) => handleDuplicateRow(id)); setBulkMenuOpen(false); }}>
                  <Copy size={13} /> Duplicar
                </button>
                <button disabled={selectedRowIds.size === 0} className="w-full text-left px-2.5 py-1.5 text-xs rounded text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" onClick={async () => {
                  const ids = getSelectionOrdered();
                  const ok = await confirm({
                    title: 'Eliminar filas seleccionadas',
                    message: `Se eliminaran ${ids.length} filas. Esta accion no se puede deshacer.`,
                    confirmText: 'Eliminar',
                    tone: 'danger',
                  });
                  if (!ok) return;
                  ids.forEach((id) => dispatch({ type: 'DELETE_PROJECT', payload: id }));
                  clearSelection();
                  setBulkMenuOpen(false);
                }}>
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add project button */}
        <button
          onClick={handleAddProject}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-text-primary text-white rounded-lg hover:bg-[#171B22] transition-colors"
        >
          <Plus size={14} />
          Nuevo proyecto
        </button>

        {/* Export buttons */}
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
          title="Exportar a Excel"
        >
          <Download size={14} />
          Excel
        </button>

        <button
          onClick={handleCopyCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
          title="Copiar como CSV al portapapeles"
        >
          <ClipboardCopy size={14} />
          CSV
        </button>

        <div className="relative" data-column-menu-safe>
          <button
            onClick={() => openCreateDynamicColumnDialog(dynamicColumns.length, 'text')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
            title="Agregar columna"
          >
            <Plus size={14} />
            Columna
          </button>
        </div>
      </div>
      </div>
      {!multiSelectMode && stickyAncestorRows.length > 0 && (
        <>
          {stickyAncestorRows.map((row, idx) => (
            <div
              key={row.id}
              data-selection-safe
              className="sticky z-30 border-x border-border border-b border-border bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]"
              style={{ top: stickyToolsHeight  + headerStickyHeight + idx * 28 - 1 }}
            >
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-text-primary"
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
        className="bg-white rounded-xl border border-border/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-visible"
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
              {renderColumns.map((rc) => (
                <col
                  key={`col-${rc.token}`}
                  style={{
                    width: rc.kind === 'dynamic' ? 160 : columnWidths[rc.widthKey],
                  }}
                />
              ))}
              <col style={{ width: columnWidths.actions }} />
            </colgroup>
            <thead ref={headerStickyRef} style={{ top: stickyToolsHeight  }} className="sticky z-20">
              <tr className="h-11 bg-white">
                <th
                  style={{ top: stickyToolsHeight  }}
                  className="sticky z-20 bg-white w-7 px-1 py-2.5 border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] rounded-tl-lg"
                /> {/* Drag handle */}
                {renderColumns.map((rc) => (
                  rc.kind === 'essential'
                    ? <SortHeader key={rc.token} label={rc.label} field={rc.sortKey} colKey={rc.widthKey} />
                    : (
                      <th
                        key={rc.token}
                        className="group relative sticky z-20 bg-white px-2 py-2.5 text-left text-xs font-semibold text-text-secondary border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)]"
                        style={{ top: stickyToolsHeight }}
                        onDragOver={(e) => {
                          if (!dragColumnToken) return;
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!dragColumnToken || dragColumnToken === rc.token) return;
                          setColumnOrder((prev) => {
                            const next = [...prev];
                            const from = next.indexOf(dragColumnToken);
                            const to = next.indexOf(rc.token);
                            if (from === -1 || to === -1) return prev;
                            const [m] = next.splice(from, 1);
                            next.splice(to, 0, m);
                            void persistDynamicPositionsFromOrder(next);
                            return next;
                          });
                          setDragColumnToken(null);
                        }}
                      >
                        <div className="pr-6">
                          {editingColumnId === rc.id ? (
                            <input
                              autoFocus
                              value={editingColumnName}
                              onChange={(e) => setEditingColumnName(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => { void commitEditDynamicColumnName(); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); void commitEditDynamicColumnName(); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingColumnId(null); setEditingColumnName(''); }
                              }}
                              className="w-full bg-transparent p-0 m-0 border-0 outline-none text-xs font-semibold text-text-secondary"
                            />
                          ) : (
                            <span onDoubleClick={() => beginEditDynamicColumnName(rc.id, rc.column.name)}>{rc.column.name}</span>
                          )}
                        </div>
                        {remoteEditingByColumn[rc.id]?.label && (
                          <span className="ml-1 text-[10px] text-blue-500/80">
                            Editando: {remoteEditingByColumn[rc.id].label}
                          </span>
                        )}
                        <button
                          data-column-menu-safe
                          draggable
                          onDragStart={() => setDragColumnToken(rc.token)}
                          onDragEnd={() => setDragColumnToken(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setColumnMenuOpenFor((v) => (v === rc.id ? null : rc.id));
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded opacity-60 group-hover:opacity-100 hover:bg-bg-secondary"
                          title="Opciones de columna"
                        >
                          <GripVertical size={12} />
                        </button>
                        {columnMenuOpenFor === rc.id && (
                          <div
                            data-column-menu-safe
                            onClick={(e) => e.stopPropagation()}
                            role="menu"
                            aria-label="Menu de columna dinamica"
                            className="absolute right-0 top-[calc(100%+4px)] z-[180] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5"
                          >
                            <button autoFocus className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { openCreateDynamicColumnDialog(rc.column.position, 'text'); setColumnMenuOpenFor(null); }}><Plus size={13} />Agregar antes</button>
                            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { openCreateDynamicColumnDialog(rc.column.position + 1, 'text'); setColumnMenuOpenFor(null); }}><Plus size={13} />Agregar despues</button>
                            <button
                              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                              onClick={() => {
                                setColumnTypePickerFor((v) => (v === rc.id ? null : rc.id));
                                setColumnOptionsEditorFor(null);
                              }}
                            >
                              <ChevronRight size={13} />
                              Cambiar tipo
                            </button>
                            {columnTypePickerFor === rc.id && (
                              <div className="mx-1 mb-1 rounded-md border border-border bg-bg-secondary/50 p-1">
                                {(['text', 'number', 'progress', 'stars', 'date', 'select', 'tags', 'checkbox'] as DynamicDisplayType[]).map((t) => (
                                  <button
                                    key={t}
                                    className={`mr-1 mb-1 px-2 py-1 text-[11px] rounded border ${
                                      ((t === 'progress' && isProgressColumn(rc.column)) ||
                                        (t === 'stars' && isStarsColumn(rc.column)) ||
                                        (t !== 'progress' && t !== 'stars' && rc.column.type === t && !isProgressColumn(rc.column) && !isStarsColumn(rc.column)))
                                        ? 'bg-white border-border text-text-primary'
                                        : 'border-transparent hover:bg-white'
                                    }`}
                                    onClick={async () => {
                                      await handleChangeDynamicColumnType(rc.id, t);
                                      setColumnTypePickerFor(null);
                                      setColumnMenuOpenFor(null);
                                    }}
                                  >
                                    {dynamicDisplayLabelEs[t]}
                                  </button>
                                ))}
                              </div>
                            )}
                            {(rc.column.type === 'select' || rc.column.type === 'tags') && (
                              <>
                                <button
                                  className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                                  onClick={() => {
                                    const current = Array.isArray(rc.column.config?.options) ? (rc.column.config.options as string[]) : [];
                                    setColumnOptionsDraft(current.join(', '));
                                    setColumnOptionsEditorFor((v) => (v === rc.id ? null : rc.id));
                                    setColumnTypePickerFor(null);
                                  }}
                                >
                                  <GripVertical size={13} />
                                  Editar opciones
                                </button>
                                {columnOptionsEditorFor === rc.id && (
                                  <div className="mx-1 mb-1 rounded-md border border-border bg-bg-secondary/50 p-2">
                                    <textarea
                                      value={columnOptionsDraft}
                                      onChange={(e) => setColumnOptionsDraft(e.target.value)}
                                      className="w-full h-16 rounded border border-border px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-blue-100"
                                      placeholder="Opcion 1, Opcion 2, Opcion 3"
                                    />
                                    <div className="mt-1 flex justify-end gap-1">
                                      <button className="px-2 py-1 text-[11px] rounded border border-border hover:bg-white" onClick={() => setColumnOptionsEditorFor(null)}>Cancelar</button>
                                      <button
                                        className="px-2 py-1 text-[11px] rounded border border-border bg-white hover:bg-bg-secondary"
                                        onClick={async () => {
                                          await handleSaveDynamicColumnOptions(rc.id, columnOptionsDraft);
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
                            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={async () => { await handleDuplicateDynamicColumn(rc.id); setColumnMenuOpenFor(null); }}><Copy size={13} />Duplicar</button>
                            <button
                              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                              onClick={() => {
                                setMoveCopyColumnId(rc.token);
                                setMoveCopyTargetId('__end__');
                                setMoveCopyAsCopy(false);
                                setMoveCopyQuery('');
                                setColumnMenuOpenFor(null);
                              }}
                            >
                              <GripVertical size={13} />
                              Mover / Copiar a...
                            </button>
                            <div className="my-1 border-t border-border" />
                            <button className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50 inline-flex items-center gap-2" onClick={async () => { await handleDeleteDynamicColumn(rc.id); setColumnMenuOpenFor(null); }}><Trash2 size={13} />Eliminar</button>
                          </div>
                        )}
                      </th>
                    )
                ))}
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
                    allPersons={allPersons}
                    allBranches={branchOptions}
                    onAddBranchOption={handleAddBranchOption}
                    onRenameBranchOption={handleRenameBranchOption}
                    onDeleteBranchOption={handleDeleteBranchOption}
                    allProjects={state.projects}
                    isLastSibling={isLastSibling(p.id)}
                    childCount={childrenMap.get(p.id)?.length ?? 0}
                    onIndent={(id) => handleIndent(id)}
                    onOutdent={(id) => handleOutdent(id)}
                    onAddAbove={handleAddAbove}
                    onAddBelow={handleAddBelow}
                    onAddGroupAbove={handleAddGroupAbove}
                    onAddGroupBelow={handleAddGroupBelow}
                    onAddInside={handleAddInside}
                    onDuplicateRow={handleDuplicateRow}
                    onMoveToParent={handleMoveToParent}
                    renderColumns={renderColumns}
                    dynamicValues={dynamicValues.get(p.id)}
                    onUpdateDynamicCell={handleUpsertDynamicCell}
                    onAddDynamicTagOption={handleAddDynamicTagOption}
                    onRenameDynamicTagOption={handleRenameDynamicTagOption}
                    onDeleteDynamicTagOption={handleDeleteDynamicTagOption}
                    onRenamePersonGlobal={handleRenamePersonGlobal}
                    onDeletePersonGlobal={handleDeletePersonGlobal}
                    onMergePersonsGlobal={handleMergePersonsGlobal}
                    personProfiles={personProfiles}
                    onSetPersonAvatar={handleSetPersonAvatar}
                    remoteEditingLabel={remoteEditingByRow[p.id]?.label}
                    onPresenceChange={(rowId, columnId) => setLocalPresence({ rowId, columnId: columnId ?? null })}
                    onOpenComments={openCommentsForTask}
                    onShowGroupEditHint={showGroupRowEditHint}
                    isSelected={multiSelectMode ? selectedRowIds.has(p.id) : selectedRowId === p.id}
                    onSelectRow={(id, ev) => handleRowSelect(id, ev)}
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
                          allPersons={allPersons}
                          allBranches={branchOptions}
                          onAddBranchOption={handleAddBranchOption}
                          onRenameBranchOption={handleRenameBranchOption}
                          onDeleteBranchOption={handleDeleteBranchOption}
                          bgClass="bg-accent-yellow/5"
                          allProjects={state.projects}
                          isLastSibling={isLastSibling(p.id)}
                          childCount={childrenMap.get(p.id)?.length ?? 0}
                          onIndent={(id) => handleIndent(id)}
                          onOutdent={(id) => handleOutdent(id)}
                          onAddAbove={handleAddAbove}
                          onAddBelow={handleAddBelow}
                          onAddGroupAbove={handleAddGroupAbove}
                          onAddGroupBelow={handleAddGroupBelow}
                          onAddInside={handleAddInside}
                          onDuplicateRow={handleDuplicateRow}
                          onMoveToParent={handleMoveToParent}
                          renderColumns={renderColumns}
                          dynamicValues={dynamicValues.get(p.id)}
                          onUpdateDynamicCell={handleUpsertDynamicCell}
                          onAddDynamicTagOption={handleAddDynamicTagOption}
                          onRenameDynamicTagOption={handleRenameDynamicTagOption}
                          onDeleteDynamicTagOption={handleDeleteDynamicTagOption}
                          onRenamePersonGlobal={handleRenamePersonGlobal}
                          onDeletePersonGlobal={handleDeletePersonGlobal}
                          onMergePersonsGlobal={handleMergePersonsGlobal}
                          personProfiles={personProfiles}
                          onSetPersonAvatar={handleSetPersonAvatar}
                          remoteEditingLabel={remoteEditingByRow[p.id]?.label}
                          onPresenceChange={(rowId, columnId) => setLocalPresence({ rowId, columnId: columnId ?? null })}
                          onOpenComments={openCommentsForTask}
                          onShowGroupEditHint={showGroupRowEditHint}
                          isSelected={multiSelectMode ? selectedRowIds.has(p.id) : selectedRowId === p.id}
                          onSelectRow={(id, ev) => handleRowSelect(id, ev)}
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
                          allPersons={allPersons}
                          allBranches={branchOptions}
                          onAddBranchOption={handleAddBranchOption}
                          onRenameBranchOption={handleRenameBranchOption}
                          onDeleteBranchOption={handleDeleteBranchOption}
                          bgClass="opacity-60"
                          allProjects={state.projects}
                          isLastSibling={isLastSibling(p.id)}
                          childCount={childrenMap.get(p.id)?.length ?? 0}
                          onIndent={(id) => handleIndent(id)}
                          onOutdent={(id) => handleOutdent(id)}
                          onAddAbove={handleAddAbove}
                          onAddBelow={handleAddBelow}
                          onAddGroupAbove={handleAddGroupAbove}
                          onAddGroupBelow={handleAddGroupBelow}
                          onAddInside={handleAddInside}
                          onDuplicateRow={handleDuplicateRow}
                          onMoveToParent={handleMoveToParent}
                          renderColumns={renderColumns}
                          dynamicValues={dynamicValues.get(p.id)}
                          onUpdateDynamicCell={handleUpsertDynamicCell}
                          onAddDynamicTagOption={handleAddDynamicTagOption}
                          onRenameDynamicTagOption={handleRenameDynamicTagOption}
                          onDeleteDynamicTagOption={handleDeleteDynamicTagOption}
                          onRenamePersonGlobal={handleRenamePersonGlobal}
                          onDeletePersonGlobal={handleDeletePersonGlobal}
                          onMergePersonsGlobal={handleMergePersonsGlobal}
                          personProfiles={personProfiles}
                          onSetPersonAvatar={handleSetPersonAvatar}
                          remoteEditingLabel={remoteEditingByRow[p.id]?.label}
                          onPresenceChange={(rowId, columnId) => setLocalPresence({ rowId, columnId: columnId ?? null })}
                          onOpenComments={openCommentsForTask}
                          onShowGroupEditHint={showGroupRowEditHint}
                          isSelected={multiSelectMode ? selectedRowIds.has(p.id) : selectedRowId === p.id}
                          onSelectRow={(id, ev) => handleRowSelect(id, ev)}
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

      {columnValidationToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-xs shadow-lg bg-[#1F2937] text-white/90 fade-in">
          {columnValidationToast}
        </div>
      )}

      {uiToast && (
        <div
          className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-xs shadow-lg fade-in ${
            uiToast.type === 'error' ? 'bg-[#7F1D1D] text-white' : 'bg-[#1F2937] text-white/90'
          }`}
        >
          {uiToast.message}
        </div>
      )}

      {/* Comments side panel */}
      {commentsOpen && (
        <div className="fixed inset-0 z-[210] pointer-events-none">
          <div
            className="absolute inset-0 bg-black/15 pointer-events-auto"
            onClick={() => setCommentsOpen(false)}
          />
          <aside role="dialog" aria-label="Panel de comentarios" className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-border shadow-[0_14px_30px_rgba(15,23,42,0.10)] pointer-events-auto flex flex-col">
            <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-2">
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
                  const link = parseLinkComment(comment.body);
                  return (
                    <div key={comment.id} className="group rounded-xl border border-border bg-bg-secondary px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="min-w-0 flex items-center gap-2">
                          {comment.author_avatar_url ? (
                            <img
                              src={comment.author_avatar_url}
                              alt={comment.author_label || 'Avatar'}
                              className="h-5 w-5 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="h-5 w-5 rounded-full border border-border bg-bg-secondary text-[10px] text-text-secondary flex items-center justify-center">
                              {(comment.author_label || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-[11px] font-medium text-text-primary truncate">
                            {isMine
                              ? `${comment.author_label || user?.email || `Usuario ${comment.user_id.slice(0, 6)}`} (Tú)`
                              : (comment.author_label || `Usuario ${comment.user_id.slice(0, 6)}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-text-secondary whitespace-nowrap">
                            {(() => {
                              const createdAt = new Date(comment.created_at);
                              return isValidDateValue(createdAt) ? formatDateShort(createdAt) : 'Fecha inválida';
                            })()}
                          </span>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-text-secondary/50 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Eliminar comentario"
                            aria-label="Eliminar comentario"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {link ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 underline break-all"
                        >
                          {link.title || link.url}
                        </a>
                      ) : (
                        <p className="text-xs text-text-primary whitespace-pre-wrap break-words">{comment.body}</p>
                      )}
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
                className="w-full h-24 resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  value={linkUrlDraft}
                  onChange={(e) => setLinkUrlDraft(e.target.value)}
                  placeholder="https://enlace-importante.com"
                  className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                />
                <input
                  value={linkTitleDraft}
                  onChange={(e) => setLinkTitleDraft(e.target.value)}
                  placeholder="Titulo opcional del enlace"
                  className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => setCommentsOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                >
                  Cerrar
                </button>
                <button
                  onClick={submitComment}
                  disabled={!commentDraft.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Comentar
                </button>
                <button
                  onClick={submitLinkComment}
                  disabled={!linkUrlDraft.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border bg-white text-text-primary hover:bg-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Agregar enlace
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {moveCopyColumnId && (
        <div data-column-menu-safe className="fixed inset-0 z-[220] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => { setMoveCopyColumnId(null); setMoveCopyQuery(''); }} />
          <div data-column-menu-safe className="relative w-full max-w-md rounded-xl border border-border bg-white shadow-[0_14px_30px_rgba(15,23,42,0.10)] p-4">
            <div className="text-sm font-semibold text-text-primary mb-2">Mover / Copiar a...</div>
            <input
              autoFocus
              value={moveCopyQuery}
              onChange={(e) => setMoveCopyQuery(e.target.value)}
              placeholder="Buscar destino..."
              className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-border bg-white p-1">
              {filteredMoveCopyTargets.map((rc) => {
                const label = rc.kind === 'essential' ? rc.label : rc.column.name;
                const selected = moveCopyTargetId === rc.token;
                return (
                  <button
                    key={rc.token}
                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg ${selected ? 'bg-bg-secondary text-text-primary' : 'hover:bg-bg-secondary text-text-secondary'}`}
                    onClick={() => setMoveCopyTargetId(rc.token)}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg ${moveCopyTargetId === '__end__' ? 'bg-bg-secondary text-text-primary' : 'hover:bg-bg-secondary text-text-secondary'}`}
                onClick={() => setMoveCopyTargetId('__end__')}
              >
                (mover al final)
              </button>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={moveCopyAsCopy}
                onChange={(e) => setMoveCopyAsCopy(e.target.checked)}
                disabled={!moveCopyColumnId.startsWith('dynamic:')}
                className="h-4 w-4 accent-[#3B82F6]"
              />
              Crear una copia
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => { setMoveCopyColumnId(null); setMoveCopyQuery(''); }}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={async () => { await handleMoveOrCopyDynamicColumn(); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {newColumnDialog?.open && (
        <div className="fixed inset-0 z-[230] bg-black/30 flex items-center justify-center p-4" data-column-menu-safe>
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4" data-column-menu-safe>
            <div className="text-sm font-semibold text-text-primary">Nueva columna</div>
            <label className="block text-xs text-text-secondary mt-3 mb-1">Nombre</label>
            <input
              autoFocus
              value={newColumnDialog.name}
              onChange={(e) => setNewColumnDialog((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              placeholder="Nombre de la columna"
              className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitCreateDynamicColumn();
                }
              }}
            />
            <label className="block text-xs text-text-secondary mt-3 mb-1">Tipo</label>
            <select
              value={newColumnDialog.type}
              onChange={(e) => setNewColumnDialog((prev) => (prev ? { ...prev, type: e.target.value as DynamicDisplayType } : prev))}
              className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
            >
              {(['text', 'progress', 'stars', 'number', 'date', 'select', 'tags', 'checkbox'] as DynamicDisplayType[]).map((t) => (
                <option key={t} value={t}>{dynamicDisplayLabelEs[t]}</option>
              ))}
            </select>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-bg-secondary"
                onClick={() => setNewColumnDialog(null)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md text-white bg-text-primary hover:bg-[#2c2a25]"
                onClick={() => { void submitCreateDynamicColumn(); }}
              >
                Crear columna
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
