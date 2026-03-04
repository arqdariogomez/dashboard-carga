import { useProject } from '@/context/ProjectContext';
import { Toggle } from '@/components/shared/Toggle';
import { Badge } from '@/components/shared/Badge';
import { X, Filter, CircleHelp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function FilterBar() {
  const { state, dispatch, allPersons, allBranches, customFilterColumns, customFilterTagOptionsByColumn } = useProject();
  const [showPersons, setShowPersons] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const personsRef = useRef<HTMLDivElement | null>(null);
  const branchesRef = useRef<HTMLDivElement | null>(null);
  const typesRef = useRef<HTMLDivElement | null>(null);
  const customRef = useRef<HTMLDivElement | null>(null);
  const isLoadContext = state.activeView === 'grid' || state.activeView === 'chart' || state.activeView === 'persons';

  const types = ['Proyecto', 'Lanzamiento', 'En radar'];
  const customColumn = customFilterColumns.find((c) => c.id === state.filters.customColumnId) || null;
  const hasCustomSelection = !!customColumn && (state.filters.customTags.length > 0 || state.filters.customStars.length > 0);
  const hasFilters =
    state.filters.persons.length > 0 ||
    state.filters.branches.length > 0 ||
    state.filters.types.length > 0 ||
    hasCustomSelection ||
    state.filters.showOnlyActive;

  const togglePerson = (p: string) => {
    const persons = state.filters.persons.includes(p)
      ? state.filters.persons.filter((x) => x !== p)
      : [...state.filters.persons, p];
    dispatch({ type: 'SET_FILTERS', payload: { persons } });
  };

  const toggleBranch = (b: string) => {
    const branches = state.filters.branches.includes(b)
      ? state.filters.branches.filter((x) => x !== b)
      : [...state.filters.branches, b];
    dispatch({ type: 'SET_FILTERS', payload: { branches } });
  };

  const toggleType = (t: string) => {
    const ft = state.filters.types.includes(t)
      ? state.filters.types.filter((x) => x !== t)
      : [...state.filters.types, t];
    dispatch({ type: 'SET_FILTERS', payload: { types: ft } });
  };

  const setCustomColumn = (columnId: string | null) => {
    dispatch({ type: 'SET_FILTERS', payload: { customColumnId: columnId, customTags: [], customStars: [] } });
  };

  const toggleCustomTag = (tag: string) => {
    const next = state.filters.customTags.includes(tag)
      ? state.filters.customTags.filter((x) => x !== tag)
      : [...state.filters.customTags, tag];
    dispatch({ type: 'SET_FILTERS', payload: { customTags: next } });
  };

  const toggleCustomStars = (stars: number) => {
    const next = state.filters.customStars.includes(stars)
      ? state.filters.customStars.filter((x) => x !== stars)
      : [...state.filters.customStars, stars];
    dispatch({ type: 'SET_FILTERS', payload: { customStars: next } });
  };

  useEffect(() => {
    const closeAll = () => {
      setShowPersons(false);
      setShowBranches(false);
      setShowTypes(false);
      setShowCustom(false);
    };

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePersons = !!personsRef.current?.contains(target);
      const insideBranches = !!branchesRef.current?.contains(target);
      const insideTypes = !!typesRef.current?.contains(target);
      const insideCustom = !!customRef.current?.contains(target);
      if (!insidePersons && !insideBranches && !insideTypes && !insideCustom) {
        closeAll();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="bg-white border-b border-border px-4 py-2 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Filter size={14} />
        <span className="text-xs font-medium">Filtros</span>
      </div>

      {isLoadContext && (
        <div className="inline-flex items-center gap-1.5">
          <Toggle
            size="sm"
            options={[
              { value: 'calculated', label: 'Carga: Calculada' },
              { value: 'reported', label: 'Carga: Reportada' },
            ]}
            value={state.config.loadMode}
            onChange={(v) => dispatch({ type: 'SET_LOAD_MODE', payload: v as 'calculated' | 'reported' })}
          />
          <span
            className="text-text-secondary cursor-help"
            title={'Carga calculada: se obtiene automaticamente con fechas y dias requeridos. Carga reportada: usa el valor manual reportado del proyecto.'}
            aria-label="Ayuda sobre tipos de carga"
          >
            <CircleHelp size={14} />
          </span>
        </div>
      )}

      <div ref={personsRef} className="relative">
        <button
          onClick={() => { setShowPersons(!showPersons); setShowBranches(false); setShowTypes(false); setShowCustom(false); }}
          className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-bg-secondary transition-colors text-text-secondary"
        >
          Personas {state.filters.persons.length > 0 && `(${state.filters.persons.length})`}
        </button>
        {showPersons && (
          <div className="absolute top-full mt-1 left-0 bg-white border border-border rounded-md shadow-lg z-50 p-2 min-w-[160px]">
            {allPersons.map((p) => (
              <label key={p} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-secondary rounded cursor-pointer">
                <input type="checkbox" checked={state.filters.persons.includes(p)} onChange={() => togglePerson(p)} className="rounded" />
                {p}
              </label>
            ))}
          </div>
        )}
      </div>

      <div ref={branchesRef} className="relative">
        <button
          onClick={() => { setShowBranches(!showBranches); setShowPersons(false); setShowTypes(false); setShowCustom(false); }}
          className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-bg-secondary transition-colors text-text-secondary"
        >
          Sucursales {state.filters.branches.length > 0 && `(${state.filters.branches.length})`}
        </button>
        {showBranches && (
          <div className="absolute top-full mt-1 left-0 bg-white border border-border rounded-md shadow-lg z-50 p-2 min-w-[160px] max-h-[200px] overflow-y-auto">
            {allBranches.map((b) => (
              <label key={b} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-secondary rounded cursor-pointer">
                <input type="checkbox" checked={state.filters.branches.includes(b)} onChange={() => toggleBranch(b)} className="rounded" />
                {b}
              </label>
            ))}
          </div>
        )}
      </div>

      <div ref={typesRef} className="relative">
        <button
          onClick={() => { setShowTypes(!showTypes); setShowPersons(false); setShowBranches(false); setShowCustom(false); }}
          className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-bg-secondary transition-colors text-text-secondary"
        >
          Tipo {state.filters.types.length > 0 && `(${state.filters.types.length})`}
        </button>
        {showTypes && (
          <div className="absolute top-full mt-1 left-0 bg-white border border-border rounded-md shadow-lg z-50 p-2 min-w-[140px]">
            {types.map((t) => (
              <label key={t} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-secondary rounded cursor-pointer">
                <input type="checkbox" checked={state.filters.types.includes(t)} onChange={() => toggleType(t)} className="rounded" />
                {t}
              </label>
            ))}
          </div>
        )}
      </div>

      <div ref={customRef} className="relative">
        <button
          onClick={() => { setShowCustom(!showCustom); setShowPersons(false); setShowBranches(false); setShowTypes(false); }}
          className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-bg-secondary transition-colors text-text-secondary"
        >
          Personalizado {hasCustomSelection && `(${state.filters.customTags.length + state.filters.customStars.length})`}
        </button>
        {showCustom && (
          <div className="absolute top-full mt-1 left-0 bg-white border border-border rounded-md shadow-lg z-50 p-2 min-w-[220px] max-h-[280px] overflow-y-auto">
            <label className="block text-[11px] text-text-secondary mb-1">Columna</label>
            <select
              className="w-full h-7 rounded-md border border-border px-2 text-xs bg-white mb-2"
              value={state.filters.customColumnId || ''}
              onChange={(e) => setCustomColumn(e.target.value || null)}
            >
              <option value="">Ninguna</option>
              {customFilterColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name} ({col.type === 'tags' ? 'Etiquetas' : 'Estrellas'})
                </option>
              ))}
            </select>

            {customColumn?.type === 'tags' && (
              <div className="space-y-1">
                {((customFilterTagOptionsByColumn[customColumn.id] || []).length > 0
                  ? customFilterTagOptionsByColumn[customColumn.id]
                  : []).map((tag) => (
                    <label key={tag} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-secondary rounded cursor-pointer">
                      <input type="checkbox" checked={state.filters.customTags.includes(tag)} onChange={() => toggleCustomTag(tag)} className="rounded" />
                      {tag}
                    </label>
                  ))}
                {(customFilterTagOptionsByColumn[customColumn.id] || []).length === 0 && (
                  <div className="px-2 py-1 text-xs text-text-secondary">Sin etiquetas disponibles</div>
                )}
              </div>
            )}

            {customColumn?.type === 'stars' && (
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((n) => (
                  <label key={n} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-bg-secondary rounded cursor-pointer">
                    <input type="checkbox" checked={state.filters.customStars.includes(n)} onChange={() => toggleCustomStars(n)} className="rounded" />
                    {'★'.repeat(n)}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={state.filters.showOnlyActive}
          onChange={(e) => dispatch({ type: 'SET_FILTERS', payload: { showOnlyActive: e.target.checked } })}
          className="rounded"
        />
        Solo activos
      </label>

      {state.filters.persons.map((p) => (
        <Badge key={p} variant="blue" removable onRemove={() => togglePerson(p)}>{p}</Badge>
      ))}
      {state.filters.branches.map((b) => (
        <Badge key={b} variant="green" removable onRemove={() => toggleBranch(b)}>{b}</Badge>
      ))}
      {customColumn?.type === 'tags' && state.filters.customTags.map((tag) => (
        <Badge key={`custom-tag-${tag}`} variant="purple" removable onRemove={() => toggleCustomTag(tag)}>
          {customColumn.name}: {tag}
        </Badge>
      ))}
      {customColumn?.type === 'stars' && state.filters.customStars.map((stars) => (
        <Badge key={`custom-stars-${stars}`} variant="purple" removable onRemove={() => toggleCustomStars(stars)}>
          {customColumn.name}: {'★'.repeat(stars)}
        </Badge>
      ))}

      {hasFilters && (
        <button
          onClick={() => dispatch({ type: 'RESET_FILTERS' })}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <X size={12} /> Limpiar
        </button>
      )}
    </div>
  );
}
