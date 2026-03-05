import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Edit3, UserPlus, ArrowRightLeft, Trash2, Check } from 'lucide-react';
import { usePersonProfiles } from '@/context/PersonProfilesContext';

interface EditableAssigneesCellProps {
  value: string[] | null | undefined;
  options: string[];
  onChange: (v: string[]) => void;
  onRenamePerson: (from: string, to: string) => Promise<void>;
  onDeletePerson?: (name: string) => Promise<void>;
  onSetPersonAvatar: (name: string, file: File) => Promise<void>;
  onMergePersons?: (left: string, right: string, keep: 'left' | 'right') => void;
}

export function EditableAssigneesCell({
  value,
  options,
  onChange,
  onRenamePerson,
  onDeletePerson,
  onSetPersonAvatar,
  onMergePersons,
}: EditableAssigneesCellProps) {
  const { getAvatarUrl } = usePersonProfiles();
  const safeValue = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newRows, setNewRows] = useState<string[]>(['']);
  const [mergeLeft, setMergeLeft] = useState('');
  const [mergeRight, setMergeRight] = useState('');
  const [mergeKeep, setMergeKeep] = useState<'left' | 'right'>('left');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const normalizeInputRows = (rows: string[]): string[] => {
    const filled = rows.map((r) => r.trim()).filter(Boolean);
    return [...filled, ''];
  };

  const mergedOptions = [...new Set([...safeValue, ...options])].sort();

  const toggle = (name: string) => {
    const key = name.trim().toLowerCase();
    const exists = safeValue.some((x) => x.trim().toLowerCase() === key);
    if (exists) onChange(safeValue.filter((x) => x.trim().toLowerCase() !== key));
    else onChange([...safeValue, name]);
  };

  const addQuick = (rowIndex: number) => {
    const label = (newRows[rowIndex] || '').trim();
    if (!label) return;
    const key = label.trim().toLowerCase();
    if (!safeValue.some((x) => x.trim().toLowerCase() === key)) {
      onChange([...safeValue, label]);
    }
    setNewRows((prev) => {
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
    await onRenamePerson(editingName, editValue.trim());
    setEditingName(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
      setNewRows(['']);
    }
  };

  useEffect(() => {
    if (!open) {
      setSearch('');
      setNewRows(['']);
      setMergeLeft('');
      setMergeRight('');
      setMergeKeep('left');
      setEditingName(null);
      setEditValue('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !dropdownRef.current || typeof window === 'undefined') return;
    const updatePos = () => {
      if (!dropdownRef.current) return;
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuW = 320;
      const gap = 6;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
      const openUp = rect.bottom + gap + 320 > window.innerHeight && rect.top > 320;
      const top = openUp ? Math.max(8, rect.top - gap - 320) : Math.min(window.innerHeight - 8, rect.bottom + gap);
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

  const compactLabel = (() => {
    const list = safeValue.map((x) => x.trim()).filter(Boolean);
    if (list.length === 0) return 'Sin asignar';
    if (list.length === 1) return list[0];
    return `${list[0]} +${list.length - 1}`;
  })();

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <div
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setOpen(true)}
        title="Clic para editar"
      >
        {safeValue.length > 0 ? (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <AvatarDot name={safeValue[0]} />
            <span className="text-[11px] text-text-secondary truncate">{compactLabel}</span>
          </span>
        ) : (
          <span className="text-text-secondary text-xs">Sin asignar</span>
        )}
      </div>

      {open && menuPos && (
        <div className="fixed z-[260] w-80 bg-white border border-border rounded-lg shadow-lg p-3" style={{ top: menuPos.top, left: menuPos.left }}>
          <div className="flex items-center gap-2 mb-3">
            <Search size={14} className="text-text-secondary" />
            <input
              type="text"
              placeholder="Buscar persona..."
              className="flex-1 h-8 rounded border border-border px-2 text-xs bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
            {mergedOptions
              .filter((p) => p.toLowerCase().includes(search.toLowerCase()))
              .map((p) => (
                <div key={p} className="group/person-row flex items-center gap-2 p-1.5 rounded hover:bg-bg-secondary">
                  <input
                    type="checkbox"
                    checked={safeValue.some((x) => x.trim().toLowerCase() === p.trim().toLowerCase())}
                    onChange={() => toggle(p)}
                    className="h-3.5 w-3.5 accent-[#3B82F6]"
                  />
                  <AvatarDot name={p} />
                  {editingName === p ? (
                    <input
                      type="text"
                      className="flex-1 h-6 rounded border border-border px-1.5 text-xs bg-white"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      onBlur={saveEdit}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs text-text-primary truncate"
                      onDoubleClick={(e) => { e.stopPropagation(); startEdit(p); }}
                      title="Doble clic para renombrar"
                    >
                      {p}
                    </span>
                  )}
                  <div className="inline-flex items-center gap-1 opacity-0 group-hover/person-row:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-bg-secondary"
                      onClick={() => startEdit(p)}
                      title="Renombrar"
                    >
                      <Edit3 size={12} className="text-text-secondary" />
                    </button>
                    <label
                      className="p-0.5 rounded hover:bg-bg-secondary cursor-pointer"
                      title="Subir avatar"
                    >
                      <UserPlus size={12} className="text-text-secondary" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          await onSetPersonAvatar(p, file);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-red-50"
                      title="Eliminar persona"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!onDeletePerson) return;
                        const ok = window.confirm(`Se eliminara "${p}" de todo el proyecto. Continuar?`);
                        if (!ok) return;
                        await onDeletePerson(p);
                      }}
                    >
                      <Trash2 size={12} className="text-red-600" />
                    </button>
                  </div>
                </div>
              ))}
            {mergedOptions.filter((p) => p.toLowerCase().includes(search.toLowerCase())).length === 0 && (
              <div className="px-2 py-2 text-xs text-text-secondary">No hay resultados.</div>
            )}
          </div>

          <div className="space-y-1.5 mb-3">
            {newRows.map((rowValue, idx) => (
              <div key={`new-person-row-${idx}`} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nueva persona..."
                  className="flex-1 h-8 rounded border border-border px-2 text-xs bg-white"
                  value={rowValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewRows((prev) => {
                      const next = [...prev];
                      next[idx] = v;
                      return next;
                    });
                  }}
                  onBlur={() => {
                    setNewRows((prev) => {
                      const next = [...prev];
                      next[idx] = next[idx].trim();
                      return normalizeInputRows(next);
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      addQuick(idx);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setNewRows((prev) => {
                        const next = [...prev];
                        next[idx] = '';
                        return normalizeInputRows(next);
                      });
                    }
                  }}
                />
                <button
                  type="button"
                  className="h-8 px-3 text-xs rounded border border-border hover:bg-bg-secondary disabled:opacity-40"
                  disabled={!rowValue.trim()}
                  onClick={() => addQuick(idx)}
                  title="Agregar y continuar"
                >
                  <Plus size={12} />
                </button>
              </div>
            ))}
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
                onClick={() => {
                  setMergeLeft('');
                  setMergeRight('');
                  setMergeKeep('left');
                }}
                title="Limpiar selección"
              >
                <ArrowRightLeft size={12} />
              </button>
            </div>
            <button
              type="button"
              className="mt-2 w-full h-8 px-3 text-xs rounded bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              disabled={!mergeLeft || !mergeRight || mergeLeft === mergeRight || !onMergePersons}
              onClick={() => {
                if (onMergePersons && mergeLeft && mergeRight) {
                  onMergePersons(mergeLeft, mergeRight, mergeKeep);
                  setMergeLeft('');
                  setMergeRight('');
                  setMergeKeep('left');
                }
              }}
            >
              <Check size={12} />
              Fusionar
            </button>
          </details>
        </div>
      )}
    </div>
  );
}

// Helper component for avatar display
function AvatarDot({ name }: { name: string }) {
  const { getAvatarUrl } = usePersonProfiles();
  const avatarUrl = getAvatarUrl(name);
  
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
  
  const c = pastelTagColor(name || 'persona');
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

// Helper functions
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function pastelTagColor(tag: string) {
  const colors = [
    { bg: '#E3F2FD', text: '#1565C0', border: '#90CAF9' },
    { bg: '#F3E5F5', text: '#7B1FA2', border: '#CE93D8' },
    { bg: '#E8F5E8', text: '#2E7D32', border: '#81C784' },
    { bg: '#FFF3E0', text: '#E65100', border: '#FFB74D' },
    { bg: '#FCE4EC', text: '#C2185B', border: '#F48FB1' },
    { bg: '#E0F2F1', text: '#00695C', border: '#80CBC4' },
    { bg: '#F1F8E9', text: '#558B2F', border: '#C5E1A5' },
    { bg: '#FFF8E1', text: '#F57C00', border: '#FFD54F' },
  ];
  const index = Math.abs(tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
  return colors[index];
}
