import { useProject } from '@/context/ProjectContext';
import { Toggle } from '@/components/shared/Toggle';
import { Badge } from '@/components/shared/Badge';
import { X, Filter } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function FilterBar() {
  const { state, dispatch, allPersons, allBranches } = useProject();
  const [showPersons, setShowPersons] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const personsRef = useRef<HTMLDivElement | null>(null);
  const branchesRef = useRef<HTMLDivElement | null>(null);
  const typesRef = useRef<HTMLDivElement | null>(null);
  const isLoadContext = state.activeView === 'grid' || state.activeView === 'chart' || state.activeView === 'persons';

  const types = ['Proyecto', 'Lanzamiento', 'En radar'];
  const hasFilters = state.filters.persons.length > 0 || state.filters.branches.length > 0 || state.filters.types.length > 0 || state.filters.showOnlyActive;

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

  useEffect(() => {
    const closeAll = () => {
      setShowPersons(false);
      setShowBranches(false);
      setShowTypes(false);
    };

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePersons = !!personsRef.current?.contains(target);
      const insideBranches = !!branchesRef.current?.contains(target);
      const insideTypes = !!typesRef.current?.contains(target);
      if (!insidePersons && !insideBranches && !insideTypes) {
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
        <Toggle
          size="sm"
          options={[
            { value: 'calculated', label: 'Carga: Calculada' },
            { value: 'reported', label: 'Carga: Reportada' },
          ]}
          value={state.config.loadMode}
          onChange={(v) => dispatch({ type: 'SET_LOAD_MODE', payload: v as 'calculated' | 'reported' })}
        />
      )}

      <div ref={personsRef} className="relative">
        <button
          onClick={() => { setShowPersons(!showPersons); setShowBranches(false); setShowTypes(false); }}
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
          onClick={() => { setShowBranches(!showBranches); setShowPersons(false); setShowTypes(false); }}
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
          onClick={() => { setShowTypes(!showTypes); setShowPersons(false); setShowBranches(false); }}
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
