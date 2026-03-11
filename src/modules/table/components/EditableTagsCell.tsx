import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Check, Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { pastelTagColor } from '../utils/table.utils';

interface EditableTagsCellProps {
  value: string[];
  options?: string[];
  columnName?: string;
  onChange: (v: string[]) => void;
  onAddOption?: (label: string) => void | Promise<void>;
  onRenameOption?: (from: string, to: string) => void | Promise<void>;
  onDeleteOption?: (label: string) => void | Promise<void>;
  onMergeOption?: (left: string, right: string, keep: string) => void | Promise<void>;
}

const eq = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const normalize = (list: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const clean = item.trim();
    if (!clean) continue;
    const k = clean.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(clean);
  }
  return out;
};

export function EditableTagsCell({
  value,
  options = [],
  columnName = 'Etiqueta',
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
  onMergeOption,
}: EditableTagsCellProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draftRows, setDraftRows] = useState<string[]>(['']);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [mergeLeft, setMergeLeft] = useState('');
  const [mergeRight, setMergeRight] = useState('');
  const [mergeKeep, setMergeKeep] = useState<'left' | 'right'>('left');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const safeValue = normalize(value || []);
  const normalizeInputRows = (rows: string[]): string[] => {
    const filled = rows.map((r) => r.trim()).filter(Boolean);
    return [...filled, ''];
  };

  const mergedOptions = useMemo(() => normalize([...(options || []), ...safeValue]), [options, safeValue]);

  const filteredOptions = useMemo(
    () => mergedOptions.filter((tag) => tag.toLowerCase().includes(search.toLowerCase())),
    [mergedOptions, search],
  );

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDraftRows(['']);
      setEditingName(null);
      setEditValue('');
      setMergeLeft('');
      setMergeRight('');
      setMergeKeep('left');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !wrapperRef.current || typeof window === 'undefined') return;
    const updatePos = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const menuW = 320;
      const menuH = 360;
      const gap = 6;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
      const openUp = rect.bottom + gap + menuH > window.innerHeight && rect.top > menuH;
      const top = openUp ? Math.max(8, rect.top - gap - menuH) : Math.min(window.innerHeight - 8, rect.bottom + gap);
      setMenuPos({ top, left });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  const toggleTag = (tag: string) => {
    const exists = safeValue.some((x) => eq(x, tag));
    if (exists) onChange(safeValue.filter((x) => !eq(x, tag)));
    else onChange(normalize([...safeValue, tag]));
  };

  const addDraft = async (rowIndex: number) => {
    const label = (draftRows[rowIndex] || '').trim();
    if (!label) return;
    if (onAddOption) await onAddOption(label);
    if (!safeValue.some((x) => eq(x, label))) onChange(normalize([...safeValue, label]));
    setDraftRows((prev) => {
      const next = [...prev];
      next[rowIndex] = '';
      return normalizeInputRows(next);
    });
  };

  const startEdit = (name: string) => {
    setEditingName(name);
    setEditValue(name);
  };

  const saveEdit = async () => {
    if (!editingName || !editValue.trim()) return;
    if (!onRenameOption) {
      setEditingName(null);
      setEditValue('');
      return;
    }
    await onRenameOption(editingName, editValue.trim());
    setEditingName(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditValue('');
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="min-h-[24px] w-full text-left hover:bg-gray-50 px-1 py-0.5 rounded flex flex-wrap gap-1"
      >
        {safeValue.length > 0 ? (
          safeValue.map((tag) => {
            const c = pastelTagColor(tag);
            return (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-medium border"
                style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
              >
                {tag}
              </span>
            );
          })
        ) : (
          <span className="text-gray-400 text-[14px]">Editar etiquetas...</span>
        )}
      </div>

      {open && menuPos && (
        <div className="fixed z-[260] w-80 rounded-lg border border-border bg-white shadow-lg p-3" style={{ top: menuPos.top, left: menuPos.left }}>
          <div className="mb-2 flex items-center gap-2">
            <Search size={14} className="text-text-secondary" />
            <input
              type="text"
              placeholder={`Buscar ${columnName.toLowerCase()}...`}
              className="flex-1 h-8 rounded border border-border px-2 text-[14px] bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-auto space-y-1 mb-3">
            {filteredOptions.map((tag) => {
              const selected = safeValue.some((x) => eq(x, tag));
              return (
                <div key={tag} className="group/tag-row flex items-center gap-2 p-1.5 rounded hover:bg-bg-secondary">
                  <button type="button" className="inline-flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleTag(tag)}>
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-border bg-white">
                      {selected ? <Check size={11} /> : null}
                    </span>
                    {editingName === tag ? (
                      <input
                        type="text"
                        className="h-6 flex-1 rounded border border-border px-1.5 text-[14px] bg-white"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onBlur={() => { void saveEdit(); }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="truncate text-[14px] text-text-primary"
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startEdit(tag);
                        }}
                        title="Doble clic para renombrar"
                      >
                        {tag}
                      </span>
                    )}
                  </button>
                  <div className="inline-flex items-center gap-1 opacity-0 group-hover/tag-row:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-bg-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startEdit(tag);
                      }}
                      title="Renombrar"
                    >
                      <Edit3 size={12} className="text-text-secondary" />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-red-50"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const warnAssigned = safeValue.some((x) => eq(x, tag));
                        const ok = window.confirm(
                          warnAssigned
                            ? `La etiqueta "${tag}" esta en uso. Se eliminara de todo el proyecto. Continuar?`
                            : `Eliminar etiqueta "${tag}" de todo el proyecto?`
                        );
                        if (!ok) return;
                        if (onDeleteOption) await onDeleteOption(tag);
                        if (safeValue.some((x) => eq(x, tag))) onChange(safeValue.filter((x) => !eq(x, tag)));
                      }}
                      title="Eliminar etiqueta"
                    >
                      <Trash2 size={12} className="text-red-600" />
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-2 py-2 text-[14px] text-text-secondary">No hay resultados.</div>
            )}
          </div>

          <div className="border-t border-border pt-2 space-y-1.5">
            {draftRows.map((rowValue, idx) => (
              <div key={`tag-row-${idx}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={rowValue}
                  placeholder={`Agregar ${columnName.toLowerCase()}...`}
                  className="flex-1 h-8 rounded border border-border px-2 text-[14px] bg-white"
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftRows((prev) => {
                      const next = [...prev];
                      next[idx] = v;
                      return next;
                    });
                  }}
                  onBlur={() => {
                    setDraftRows((prev) => {
                      const next = [...prev];
                      next[idx] = next[idx].trim();
                      return normalizeInputRows(next);
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addDraft(idx);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setDraftRows((prev) => {
                        const next = [...prev];
                        next[idx] = '';
                        return normalizeInputRows(next);
                      });
                    }
                  }}
                />
                <button
                  type="button"
                  className="h-8 px-3 text-[14px] rounded border border-border hover:bg-bg-secondary disabled:opacity-40"
                  disabled={!rowValue.trim()}
                  onClick={() => { void addDraft(idx); }}
                  title="Agregar y continuar"
                >
                  <Plus size={12} />
                </button>
              </div>
            ))}
          </div>

          <details className="mt-2 rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-[14px] font-medium text-text-primary">Fusionar {columnName.toLowerCase()}</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <select value={mergeLeft} onChange={(e) => setMergeLeft(e.target.value)} className="h-8 rounded border border-border px-2 text-[14px] bg-white">
                <option value="">{columnName} A</option>
                {mergedOptions.map((t) => <option key={`left-${t}`} value={t}>{t}</option>)}
              </select>
              <select value={mergeRight} onChange={(e) => setMergeRight(e.target.value)} className="h-8 rounded border border-border px-2 text-[14px] bg-white">
                <option value="">{columnName} B</option>
                {mergedOptions.map((t) => <option key={`right-${t}`} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[14px]">
              <span className="text-text-secondary">Conservar:</span>
              <label className="inline-flex items-center gap-1"><input type="radio" checked={mergeKeep === 'left'} onChange={() => setMergeKeep('left')} />A</label>
              <label className="inline-flex items-center gap-1"><input type="radio" checked={mergeKeep === 'right'} onChange={() => setMergeKeep('right')} />B</label>
              <button
                type="button"
                className="ml-auto h-8 px-3 text-[14px] rounded border border-border hover:bg-bg-secondary disabled:opacity-40"
                disabled={!mergeLeft || !mergeRight || mergeLeft === mergeRight}
                onClick={async () => {
                  const keep = mergeKeep === 'left' ? mergeLeft : mergeRight;
                  if (onMergeOption) {
                    await onMergeOption(mergeLeft, mergeRight, keep);
                  }
                  setMergeLeft('');
                  setMergeRight('');
                  setMergeKeep('left');
                }}
              >
                <ArrowRightLeft size={12} />
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
