import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { branchLabel, normalizeBranchList } from '@/lib/branchUtils';
import { pastelTagColor } from '../utils/table.utils';

interface EditableBranchTagCellProps {
  value: string[];
  options: string[];
  columnName: string;
  onChange: (v: string[]) => void;
  onAddOption?: (label: string) => void;
  onRenameOption?: (from: string, to: string) => void;
  onDeleteOption?: (label: string) => void;
}

export function EditableBranchTagCell({
  value,
  options,
  columnName,
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
}: EditableBranchTagCellProps) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [addingInline, setAddingInline] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renamingFrom, setRenamingFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const normalizedOptions = normalizeBranchList(options);
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
                else onChange(normalizeBranchList([...value, o]));
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
                          if (nextLabel && nextLabel.toLowerCase() !== tag.toLowerCase()) onRenameOption?.(tag, nextLabel);
                          setRenamingFrom(null);
                          setRenameDraft('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const nextLabel = renameDraft.trim();
                            if (nextLabel && nextLabel.toLowerCase() !== tag.toLowerCase()) onRenameOption?.(tag, nextLabel);
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
                            onDeleteOption?.(tag);
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
                      if (trimmed) onAddOption?.(trimmed);
                      setAddingInline(false);
                      setNewLabel('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = newLabel.trim();
                        if (trimmed) onAddOption?.(trimmed);
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
                    className="w-full h-8 rounded-md border border-dashed border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                    onClick={() => setAddingInline(true)}
                  >
                    + Agregar etiqueta
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-border text-xs"
                onClick={() => {
                  setManagerOpen(false);
                  setEditing(false);
                }}
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
