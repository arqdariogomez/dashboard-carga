# Filtros UX/UI Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a professional filter experience with filter chips, quick filters, active filter counter, and unified styling following best practices from Monday.com, Asana, and ONES.

**Architecture:** Add filter chip components, quick filters panel, and enhance existing filter bar with counters. Use localStorage for saving quick filter presets.

**Tech Stack:** React, TypeScript, Tailwind CSS, localStorage for persistence

---

## Phase 1: Filter Chips & Active Filter Counter

### Task 1: Create FilterChips component

**Files:**
- Create: `src/modules/table/components/FilterChips.tsx`

**Step 1: Create FilterChips component**

```tsx
import { X } from 'lucide-react';

interface FilterChip {
  id: string;
  label: string;
  type: 'person' | 'branch' | 'type' | 'unscheduled' | 'radar';
}

interface FilterChipsProps {
  chips: FilterChip[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-border flex-wrap">
      <span className="text-xs text-text-secondary">Filtros activos:</span>
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onRemove(chip.id)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 transition-colors"
        >
          {chip.label}
          <X size={12} />
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-text-secondary hover:text-text-primary underline ml-2"
      >
        Limpiar todo
      </button>
    </div>
  );
}
```

**Step 2: Run build to verify**

Run: `npm run build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add src/modules/table/components/FilterChips.tsx
git commit -m "feat: add FilterChips component"
```

---

### Task 2: Integrate FilterChips in ProjectTable

**Files:**
- Modify: `src/components/dashboard/ProjectTable.tsx:1250-1260`

**Step 1: Import FilterChips**

Add import at top of file:
```tsx
import { FilterChips } from '../modules/table/components/FilterChips';
```

**Step 2: Add chips state and compute active filters**

After existing state declarations:
```tsx
// Compute active filter chips
const activeFilterChips = useMemo(() => {
  const chips: { id: string; label: string; type: 'person' | 'branch' | 'type' | 'unscheduled' | 'radar' }[] = [];
  
  if (filterPersons.length > 0) {
    filterPersons.forEach(p => chips.push({ id: `person-${p}`, label: p, type: 'person' }));
  }
  if (filterBranches.length > 0) {
    filterBranches.forEach(b => chips.push({ id: `branch-${b}`, label: b, type: 'branch' }));
  }
  if (filterTypes.length > 0) {
    filterTypes.forEach(t => chips.push({ id: `type-${t}`, label: t, type: 'type' }));
  }
  if (!showUnscheduled) {
    chips.push({ id: 'unscheduled', label: 'Sin fecha', type: 'unscheduled' });
  }
  if (showRadar) {
    chips.push({ id: 'radar', label: 'En radar', type: 'radar' });
  }
  
  return chips;
}, [filterPersons, filterBranches, filterTypes, showUnscheduled, showRadar]);

// Handler to remove individual filter
const handleRemoveFilterChip = useCallback((id: string) => {
  if (id.startsWith('person-')) {
    const person = id.replace('person-', '');
    setFilterPersons(prev => prev.filter(p => p !== person));
  } else if (id.startsWith('branch-')) {
    const branch = id.replace('branch-', '');
    setFilterBranches(prev => prev.filter(b => b !== branch));
  } else if (id.startsWith('type-')) {
    const type = id.replace('type-', '');
    setFilterTypes(prev => prev.filter(t => t !== type));
  } else if (id === 'unscheduled') {
    setShowUnscheduled(true);
  } else if (id === 'radar') {
    setShowRadar(false);
  }
}, [setFilterPersons, setFilterBranches, setFilterTypes, setShowUnscheduled, setShowRadar]);

// Handler to clear all filters
const handleClearAllFilters = useCallback(() => {
  setFilterPersons([]);
  setFilterBranches([]);
  setFilterTypes([]);
  setShowUnscheduled(true);
  setShowRadar(false);
}, [setFilterPersons, setFilterBranches, setFilterTypes, setShowUnscheduled, setShowRadar]);
```

**Step 3: Add FilterChips above table**

Find where TableTools is rendered (around line 1250) and add FilterChips before it:
```tsx
<FilterChips 
  chips={activeFilterChips} 
  onRemove={handleRemoveFilterChip}
  onClearAll={handleClearAllFilters}
/>
```

**Step 4: Run build**

Run: `npm run build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add src/components/dashboard/ProjectTable.tsx
git commit -m "feat: integrate FilterChips in ProjectTable"
```

---

### Task 3: Add filter count badge to filter button

**Files:**
- Modify: `src/modules/table/components/FilterBar.tsx` (or wherever filter button is)

**Step 1: Find and modify filter button**

Search for filter button that opens filter dropdown and add badge showing active count.

**Step 2: Run build and test**

Run: `npm run build`

**Step 3: Commit**

---

## Phase 2: Quick Filters

### Task 4: Create QuickFilters component

**Files:**
- Create: `src/modules/table/components/QuickFilters.tsx`

**Step 1: Create QuickFilters component**

```tsx
import { useState, useEffect } from 'react';
import { Star, Save, Trash2 } from 'lucide-react';

interface QuickFilter {
  id: string;
  name: string;
  filters: {
    persons: string[];
    branches: string[];
    types: string[];
    showUnscheduled: boolean;
    showRadar: boolean;
  };
}

interface QuickFiltersProps {
  currentFilters: {
    persons: string[];
    branches: string[];
    types: string[];
    showUnscheduled: boolean;
    showRadar: boolean;
  };
  onApply: (filters: QuickFilter['filters']) => void;
}

const STORAGE_KEY = 'dashboard-quick-filters';

export function QuickFilters({ currentFilters, onApply }: QuickFiltersProps) {
  const [savedFilters, setSavedFilters] = useState<QuickFilter[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSavedFilters(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse quick filters', e);
      }
    }
  }, []);

  const saveCurrentFilter = () => {
    if (!newFilterName.trim()) return;
    
    const newFilter: QuickFilter = {
      id: Date.now().toString(),
      name: newFilterName.trim(),
      filters: { ...currentFilters },
    };
    
    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setNewFilterName('');
  };

  const deleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    setSavedFilters(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const applyFilter = (filter: QuickFilter) => {
    onApply(filter.filters);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
        title="Filtros rápidos"
      >
        <Star size={14} />
        Quick
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-border rounded-xl shadow-lg z-50 p-3">
          <div className="text-xs font-medium text-text-secondary mb-2">Filtros guardados</div>
          
          {savedFilters.length === 0 ? (
            <div className="text-xs text-text-secondary/50 py-2">No hay filtros guardados</div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {savedFilters.map(filter => (
                <div key={filter.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => applyFilter(filter)}
                    className="flex-1 text-left px-2 py-1 text-xs rounded hover:bg-bg-secondary truncate"
                  >
                    {filter.name}
                  </button>
                  <button
                    onClick={() => deleteFilter(filter.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border mt-3 pt-3">
            <div className="flex gap-1">
              <input
                type="text"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                placeholder="Guardar filtro actual..."
                className="flex-1 px-2 py-1 text-xs border border-border rounded"
                onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()}
              />
              <button
                onClick={saveCurrentFilter}
                disabled={!newFilterName.trim()}
                className="p-1 text-accent-blue hover:bg-accent-blue/10 rounded disabled:opacity-50"
              >
                <Save size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Run build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/modules/table/components/QuickFilters.tsx
git commit -m "feat: add QuickFilters component"
```

---

### Task 5: Integrate QuickFilters in ProjectTable

**Files:**
- Modify: `src/components/dashboard/ProjectTable.tsx`

**Step 1: Add QuickFilters import and integrate**

Add import:
```tsx
import { QuickFilters } from '../modules/table/components/QuickFilters';
```

Add handler for applying quick filter:
```tsx
const handleApplyQuickFilter = useCallback((filters: {
  persons: string[];
  branches: string[];
  types: string[];
  showUnscheduled: boolean;
  showRadar: boolean;
}) => {
  setFilterPersons(new Set(filters.persons));
  setFilterBranches(new Set(filters.branches));
  setFilterTypes(new Set(filters.types));
  setShowUnscheduled(filters.showUnscheduled);
  setShowRadar(filters.showRadar);
}, [setFilterPersons, setFilterBranches, setFilterTypes, setShowUnscheduled, setShowRadar]);
```

Add QuickFilters to UI (near TableTools):
```tsx
<QuickFilters
  currentFilters={{
    persons: Array.from(filterPersons),
    branches: Array.from(filterBranches),
    types: Array.from(filterTypes),
    showUnscheduled,
    showRadar,
  }}
  onApply={handleApplyQuickFilter}
/>
```

**Step 2: Run build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/components/dashboard/ProjectTable.tsx
git commit -m "feat: integrate QuickFilters in ProjectTable"
```

---

## Phase 3: Unified Filter Bar Styling

### Task 6: Improve filter button styling

**Files:**
- Modify: `src/modules/table/components/FilterBar.tsx` (or wherever filters are)

**Step 1: Update styling for consistency**

Add active state styling, badges, and improve visual hierarchy.

**Step 2: Run build and test**

**Step 3: Commit**

---

### Task 7: Improve Toggle styling (Sin fecha / En radar)

**Files:**
- Modify: `src/modules/table/components/TableTools.tsx`

**Step 1: Update styling for better UX**

Make toggles more prominent with better colors and add "filtro activo" indicator.

**Step 2: Run build**

**Step 3: Commit**

---

## Phase 4: Testing & Polish

### Task 8: Test all filter functionality

**Step 1: Test in browser**

- Click filter buttons and verify dropdowns work
- Add/remove filter chips
- Save and apply quick filters
- Verify "Limpiar todo" works

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete filter UX/UI enhancement"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create FilterChips component |
| 2 | Integrate FilterChips in ProjectTable |
| 3 | Add filter count badge |
| 4 | Create QuickFilters component |
| 5 | Integrate QuickFilters |
| 6 | Improve filter bar styling |
| 7 | Improve toggle styling |
| 8 | Test and polish |
