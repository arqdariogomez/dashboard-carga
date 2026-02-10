import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { formatDateShort } from '@/lib/dateUtils';
import { computeProjectFields } from '@/lib/workloadEngine';
import { exportToExcel, copyAsCSV } from '@/lib/exportUtils';
import {
  ArrowUpDown, Search, ChevronDown, ChevronRight, Plus, Trash2,
  Download, ClipboardCopy, Check, GripVertical, AlertTriangle,
} from 'lucide-react';
import type { Project } from '@/lib/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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
  allPersons,
  allBranches,
  bgClass,
}: {
  project: Project;
  onUpdate: (id: string, updates: Partial<Project>) => void;
  onDelete: (id: string) => void;
  allPersons: string[];
  allBranches: string[];
  bgClass?: string;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  const hasDateError = project.startDate && project.endDate && project.startDate > project.endDate;
  const hasDaysWarning = project.startDate && project.endDate && project.daysRequired === 0;

  const types = ['Proyecto', 'Lanzamiento', 'En radar'];

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`group hover:bg-bg-secondary/70 transition-colors ${bgClass || ''} ${isDragging ? 'bg-accent-blue/10 shadow-lg' : ''}`}
    >
      {/* Drag handle */}
      <td className="w-8 px-1 py-2 border-b border-border text-center">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-text-secondary/40 hover:text-text-secondary transition-colors p-0.5"
          aria-label="Reordenar"
        >
          <GripVertical size={14} />
        </button>
      </td>

      {/* Name */}
      <td className="px-3 py-2 border-b border-border text-sm text-text-primary font-medium min-w-[180px]">
        <EditableTextCell
          value={project.name}
          onChange={(v) => onUpdate(project.id, { name: v })}
          placeholder="Nombre del proyecto"
          className="font-medium"
        />
      </td>

      {/* Branch */}
      <td className="px-3 py-2 border-b border-border text-xs text-text-secondary min-w-[100px]">
        <EditableSelectCell
          value={project.branch}
          onChange={(v) => onUpdate(project.id, { branch: v })}
          options={allBranches}
          placeholder="Sucursal"
        />
      </td>

      {/* Start date */}
      <td className="px-3 py-2 border-b border-border text-xs">
        <EditableDateCell
          value={project.startDate}
          onChange={(v) => onUpdate(project.id, { startDate: v })}
          hasError={!!hasDateError}
        />
      </td>

      {/* End date */}
      <td className="px-3 py-2 border-b border-border text-xs">
        <EditableDateCell
          value={project.endDate}
          onChange={(v) => onUpdate(project.id, { endDate: v })}
          hasError={!!hasDateError}
        />
      </td>

      {/* Assignee */}
      <td className="px-3 py-2 border-b border-border text-xs min-w-[100px]">
        <EditableSelectCell
          value={project.assignee || ''}
          onChange={(v) => onUpdate(project.id, { assignee: v || null })}
          options={allPersons}
          placeholder="Persona"
        />
      </td>

      {/* Days required */}
      <td className="px-3 py-2 border-b border-border text-xs text-center">
        <EditableNumberCell
          value={project.daysRequired}
          onChange={(v) => onUpdate(project.id, { daysRequired: v })}
          min={0}
          hasWarning={!!hasDaysWarning}
        />
      </td>

      {/* Priority */}
      <td className="px-3 py-2 border-b border-border">
        <StarRating
          value={project.priority}
          onChange={(v) => onUpdate(project.id, { priority: v })}
        />
      </td>

      {/* Type */}
      <td className="px-3 py-2 border-b border-border">
        <EditableSelectCell
          value={project.type}
          onChange={(v) => onUpdate(project.id, { type: v as Project['type'] })}
          options={types}
        />
      </td>

      {/* Load */}
      <td className="px-3 py-2 border-b border-border text-center">
        {project.dailyLoad > 0 ? (
          <LoadBubble load={project.dailyLoad} size="sm" />
        ) : (
          <span className="text-xs text-text-secondary">—</span>
        )}
      </td>

      {/* Balance */}
      <td className="px-3 py-2 text-xs text-text-secondary border-b border-border tabular-nums text-center">
        {project.assignedDays > 0 ? (
          <span className={project.balanceDays >= 0 ? 'text-[#2D6A2E]' : 'text-[#B71C1C]'}>
            {project.balanceDays > 0 ? '+' : ''}{project.balanceDays}d
          </span>
        ) : '—'}
      </td>

      {/* Delete */}
      <td className="px-2 py-2 border-b border-border text-center w-10">
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
  const { state, dispatch, orderedFilteredProjects, allPersons, allBranches } = useProject();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');
  const [showRadar, setShowRadar] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [exportToast, setExportToast] = useState<string | null>(null);

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

  const handleAddProject = useCallback(() => {
    const newProject = computeProjectFields({
      id: `proj-new-${Date.now()}`,
      name: '',
      branch: '',
      startDate: null,
      endDate: null,
      assignee: null,
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentOrder = state.projectOrder.length > 0
      ? [...state.projectOrder]
      : state.projects.map(p => p.id);

    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) return;

    currentOrder.splice(oldIndex, 1);
    currentOrder.splice(newIndex, 0, String(active.id));

    dispatch({ type: 'REORDER_PROJECTS', payload: currentOrder });
  }, [state.projectOrder, state.projects, dispatch]);

  // Collect unique persons including from typed values
  const personOptions = useMemo(() => {
    const set = new Set(allPersons);
    state.projects.forEach(p => { if (p.assignee) set.add(p.assignee); });
    return Array.from(set).sort();
  }, [allPersons, state.projects]);

  const branchOptions = useMemo(() => {
    const set = new Set(allBranches);
    state.projects.forEach(p => { if (p.branch) set.add(p.branch); });
    return Array.from(set).sort();
  }, [allBranches, state.projects]);

  const sorted = useMemo(() => {
    const filtered = orderedFilteredProjects.filter((p) =>
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
  }, [orderedFilteredProjects, sortKey, sortDir, search]);

  const SortHeader = ({ label, field, className }: { label: string; field: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-left text-xs font-semibold text-text-secondary cursor-pointer hover:text-text-primary transition-colors select-none border-b border-border ${className || ''}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortKey === field ? 'text-text-primary' : 'opacity-30'} />
      </span>
    </th>
  );

  return (
    <div className="p-4 flex-1 overflow-auto">
      {/* Top bar */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
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
          {orderedFilteredProjects.length} proyectos
        </span>

        <div className="flex-1" />

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

      <div className="bg-white rounded-lg border border-border overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-bg-secondary/50">
                <th className="w-8 px-1 py-2.5 border-b border-border" /> {/* Drag handle */}
                <SortHeader label="Proyecto" field="name" />
                <SortHeader label="Sucursal" field="branch" />
                <SortHeader label="Inicio" field="startDate" />
                <SortHeader label="Fin" field="endDate" />
                <SortHeader label="Asignado" field="assignee" />
                <SortHeader label="Días req." field="daysRequired" />
                <SortHeader label="Prior." field="priority" />
                <SortHeader label="Tipo" field="type" />
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-text-secondary border-b border-border">Carga</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-text-secondary border-b border-border">Balance</th>
                <th className="w-10 px-2 py-2.5 border-b border-border" /> {/* Delete */}
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
                    allPersons={personOptions}
                    allBranches={branchOptions}
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
                          allPersons={personOptions}
                          allBranches={branchOptions}
                          bgClass="bg-accent-yellow/5"
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
                          allPersons={personOptions}
                          allBranches={branchOptions}
                          bgClass="opacity-60"
                        />
                      ))}
                    </SortableContext>
                  )}
                </>
              )}
            </tbody>
          </table>
        </DndContext>

        {/* Empty state */}
        {orderedFilteredProjects.length === 0 && (
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
}
