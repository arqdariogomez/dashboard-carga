import { useState } from 'react';
import { GripVertical, Plus, Trash2, Copy, ChevronRight, ArrowLeft, ArrowRight, ArrowRightLeft, ArrowUpNarrowWide, ArrowDownWideNarrow, X, Check } from 'lucide-react';
import type { DynamicColumn } from '@/lib/types';

type DynamicDisplayType = DynamicColumn['type'] | 'progress' | 'stars';
type ColumnKey = 'drag' | 'project' | 'branch' | 'start' | 'end' | 'assignees' | 'days' | 'priority' | 'type' | 'load' | 'balance';
type SortKey = string;
const dynamicTypeLabels: Record<DynamicDisplayType, string> = {
  text: 'Texto',
  number: 'Numero',
  progress: 'Progreso',
  stars: 'Estrellas',
  date: 'Fecha',
  select: 'Seleccion',
  tags: 'Etiquetas',
  checkbox: 'Casilla',
};

type RenderColumn = {
  kind: 'essential';
  token: `essential:${string}`;
  id: string;
  label: string;
  sortKey: SortKey;
  widthKey: ColumnKey;
  nonEditableName: true;
} | {
  kind: 'dynamic';
  token: `dynamic:${string}`;
  id: string;
  label?: string;
  column: DynamicColumn;
};

interface TableHeaderProps {
  renderColumns: RenderColumn[];
  columnWidths: Record<ColumnKey, number>;
  stickyToolsHeight: number;
  columnMenuOpenFor: string | null;
  onColumnMenuToggle: (id: string | null) => void;
  onCreateColumn: (position: number, type?: DynamicDisplayType) => void;
  onRenameDynamicColumn: (columnId: string, name: string) => void;
  onChangeDynamicColumnType: (columnId: string, type: DynamicDisplayType) => void;
  onDuplicateDynamicColumn: (columnId: string) => void;
  onDeleteDynamicColumn: (columnId: string) => void;
  onSaveDynamicColumnOptions: (columnId: string, rawOptions: string) => void;
  onMoveColumnLeft: (token: string) => void;
  onMoveColumnRight: (token: string) => void;
  onSortColumn: (sortKey: string, dir: 'asc' | 'desc') => void;
  onClearSort: (sortKey: string) => void;
  currentSortKey: string | null;
  onReorderColumns: (dragToken: string, dropToken: string) => void;
  onOpenMoveCopy: (token: string) => void;
  onColumnResize: (columnKey: ColumnKey, width: number) => void;
  resizingColumnRef: React.RefObject<{ key: string; startX: number; startWidth: number } | null>;
  minColumnWidths: Record<ColumnKey, number>;
  maxColumnWidths: Record<ColumnKey, number>;
}

export function TableHeader({
  renderColumns,
  columnWidths,
  stickyToolsHeight,
  columnMenuOpenFor,
  onColumnMenuToggle,
  onCreateColumn,
  onRenameDynamicColumn,
  onChangeDynamicColumnType,
  onDuplicateDynamicColumn,
  onDeleteDynamicColumn,
  onSaveDynamicColumnOptions,
  onMoveColumnLeft,
  onMoveColumnRight,
  onSortColumn,
  onClearSort,
  currentSortKey,
  onReorderColumns,
  onOpenMoveCopy,
  onColumnResize,
  resizingColumnRef,
  minColumnWidths,
  maxColumnWidths,
}: TableHeaderProps) {
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [typePickerFor, setTypePickerFor] = useState<string | null>(null);
  const [optionsEditorFor, setOptionsEditorFor] = useState<string | null>(null);
  const [optionsDraft, setOptionsDraft] = useState('');
  const [dragColumnToken, setDragColumnToken] = useState<string | null>(null);

  return (
    <thead style={{ top: stickyToolsHeight }} className="sticky z-20">
      <tr className="h-11 bg-white">
        <th
          style={{ top: stickyToolsHeight }}
          className="sticky z-20 bg-white w-7 px-1 py-2.5 border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)] rounded-tl-lg"
        />
        {renderColumns.map((rc, index) => {
          const label = rc.kind === 'dynamic' ? (rc.column.name || rc.label || 'Columna') : rc.label;
          const width = rc.kind === 'essential' ? columnWidths[rc.widthKey] : 160;
          return (
            <th
              key={rc.token}
              className="group relative sticky z-20 bg-white px-2 py-2.5 text-left text-xs font-semibold text-text-secondary border-b border-border shadow-[0_1px_0_rgba(15,23,42,0.06)]"
              style={{ top: stickyToolsHeight, width }}
              onDragOver={(e) => {
                if (!dragColumnToken) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (!dragColumnToken) return;
                e.preventDefault();
                if (dragColumnToken !== rc.token) onReorderColumns(dragColumnToken, rc.token);
                setDragColumnToken(null);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                {editingColumnId === rc.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => {
                      if (rc.kind === 'dynamic' && editingName.trim()) onRenameDynamicColumn(rc.id, editingName.trim());
                      setEditingColumnId(null);
                      setEditingName('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (rc.kind === 'dynamic' && editingName.trim()) onRenameDynamicColumn(rc.id, editingName.trim());
                        setEditingColumnId(null);
                        setEditingName('');
                      }
                      if (e.key === 'Escape') {
                        setEditingColumnId(null);
                        setEditingName('');
                      }
                    }}
                    className="w-full h-6 rounded border border-border px-2 text-xs"
                  />
                ) : (
                  <span className="truncate" onDoubleClick={() => {
                    if (rc.kind === 'dynamic') {
                      setEditingColumnId(rc.id);
                      setEditingName(label);
                    }
                  }}>{label}</span>
                )}
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDragColumnToken(rc.token)}
                  onDragEnd={() => setDragColumnToken(null)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded border border-transparent hover:border-border hover:bg-bg-secondary text-text-secondary"
                  onClick={() => onColumnMenuToggle(columnMenuOpenFor === rc.id ? null : rc.id)}
                  title="Opciones de columna"
                >
                  <GripVertical size={14} />
                </button>
              </div>

              {columnMenuOpenFor === rc.id && (
                <div className="absolute right-0 top-full mt-1 z-[180] w-[240px] rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5">
                  <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onCreateColumn(index, 'text'); onColumnMenuToggle(null); }}><Plus size={13} />Agregar antes</button>
                  <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onCreateColumn(index + 1, 'text'); onColumnMenuToggle(null); }}><Plus size={13} />Agregar después</button>
                  <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onMoveColumnLeft(rc.token); onColumnMenuToggle(null); }}><ArrowLeft size={13} />Mover a la izquierda</button>
                  <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onMoveColumnRight(rc.token); onColumnMenuToggle(null); }}><ArrowRight size={13} />Mover a la derecha</button>
                  <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onOpenMoveCopy(rc.token); onColumnMenuToggle(null); }}><ArrowRightLeft size={13} />Mover / Copiar a...</button>
                  {rc.kind === 'essential' && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-secondary">
                        Ordenar por...
                      </div>
                      <button
                        type="button"
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                        onClick={() => { onSortColumn(rc.sortKey, 'asc'); onColumnMenuToggle(null); }}
                      >
                        <ArrowUpNarrowWide size={13} />
                        Ascendente
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                        onClick={() => { onSortColumn(rc.sortKey, 'desc'); onColumnMenuToggle(null); }}
                      >
                        <ArrowDownWideNarrow size={13} />
                        Descendente
                      </button>
                      <button
                        type="button"
                        disabled={currentSortKey !== rc.sortKey}
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary disabled:opacity-40 inline-flex items-center gap-2"
                        onClick={() => { onClearSort(rc.sortKey); onColumnMenuToggle(null); }}
                      >
                        <X size={13} />
                        Quitar orden
                      </button>
                    </>
                  )}
                  {rc.kind === 'dynamic' && (
                    <>
                      <button
                        type="button"
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                        onClick={() => setTypePickerFor(typePickerFor === rc.id ? null : rc.id)}
                      >
                        <ChevronRight size={13} />
                        Cambiar tipo
                      </button>
                      {typePickerFor === rc.id && (
                        <div className="mx-1 mb-1 rounded-md border border-border bg-bg-secondary/50 p-1">
                          {(['text', 'number', 'progress', 'stars', 'date', 'select', 'tags', 'checkbox'] as DynamicDisplayType[]).map((t) => {
                            const isCurrentType =
                              rc.column.type === t
                              || (t === 'progress' && rc.column.type === 'number' && rc.column.config?.display === 'progress')
                              || (t === 'stars' && rc.column.type === 'number' && rc.column.config?.display === 'stars');
                            return (
                              <button
                                key={t}
                                type="button"
                                className="mr-1 mb-1 px-2 py-1 text-[11px] rounded border border-transparent hover:bg-white inline-flex items-center gap-1"
                                onClick={() => {
                                  onChangeDynamicColumnType(rc.id, t);
                                  setTypePickerFor(null);
                                  onColumnMenuToggle(null);
                                }}
                              >
                                {isCurrentType ? <Check size={11} /> : null}
                                {dynamicTypeLabels[t]}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {(rc.column.type === 'select' || rc.column.type === 'tags') && (
                        <>
                          <button
                            type="button"
                            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2"
                            onClick={() => {
                              const current = Array.isArray(rc.column.config?.options) ? (rc.column.config.options as string[]) : [];
                              setOptionsDraft(current.join(', '));
                              setOptionsEditorFor(optionsEditorFor === rc.id ? null : rc.id);
                            }}
                          >
                            <ChevronRight size={13} />
                            Editar opciones
                          </button>
                          {optionsEditorFor === rc.id && (
                            <div className="mx-1 mb-1 rounded-md border border-border bg-bg-secondary/50 p-2">
                              <textarea
                                value={optionsDraft}
                                onChange={(e) => setOptionsDraft(e.target.value)}
                                className="w-full h-16 rounded border border-border px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-blue-100"
                                placeholder="Opcion 1, Opcion 2, Opcion 3"
                              />
                              <div className="mt-1 flex justify-end gap-1">
                                <button type="button" className="px-2 py-1 text-[11px] rounded border border-border hover:bg-white" onClick={() => setOptionsEditorFor(null)}>Cancelar</button>
                                <button
                                  type="button"
                                  className="px-2 py-1 text-[11px] rounded border border-border bg-white hover:bg-bg-secondary"
                                  onClick={() => {
                                    onSaveDynamicColumnOptions(rc.id, optionsDraft);
                                    setOptionsEditorFor(null);
                                    onColumnMenuToggle(null);
                                  }}
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-bg-secondary inline-flex items-center gap-2" onClick={() => { onDuplicateDynamicColumn(rc.id); onColumnMenuToggle(null); }}><Copy size={13} />Duplicar</button>
                      <div className="my-1 border-t border-border" />
                      <button type="button" className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-red-600 hover:bg-red-50 inline-flex items-center gap-2" onClick={() => { onDeleteDynamicColumn(rc.id); onColumnMenuToggle(null); }}><Trash2 size={13} />Eliminar</button>
                    </>
                  )}
                </div>
              )}
              {rc.kind === 'essential' && (
                <div
                  className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none hover:bg-blue-400/50 ${resizingColumnRef.current?.key === rc.widthKey ? 'bg-blue-500' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startWidth = columnWidths[rc.widthKey];
                    resizingColumnRef.current = { key: rc.widthKey, startX, startWidth };
                    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
                      if (!resizingColumnRef.current) return;
                      const delta = moveEvent.clientX - resizingColumnRef.current.startX;
                      const newWidth = Math.min(
                        maxColumnWidths[rc.widthKey],
                        Math.max(minColumnWidths[rc.widthKey], resizingColumnRef.current.startWidth + delta)
                      );
                      onColumnResize(rc.widthKey as ColumnKey, newWidth);
                    };
                    const handleMouseUp = () => {
                      resizingColumnRef.current = null;
                      document.removeEventListener('mousemove', handleMouseMove);
                      document.removeEventListener('mouseup', handleMouseUp);
                    };
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
