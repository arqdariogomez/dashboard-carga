# Archivos para Diagnóstico con Claude-revision

## ESTADO ACTUAL:
- **Error persistente:** "Rendered fewer hooks than expected"
- **Errores previos RESUELTOS:** `.find()` y `.map()` ya no aparecen
- **Problema actual:** Hooks inconsistentes en algún componente

## ARCHIVOS CLAVE PARA ANÁLISIS:

### 1. ProjectTable.tsx (Componente principal donde ocurre el error)
```typescript
// Archivo: src/components/dashboard/ProjectTable.tsx
// Línea del error: ~89 (según stack trace)
// Problema: Return temprano antes de que todos los hooks se ejecuten
```

### 2. useProjectTableActions.ts (Callbacks con returns tempranos)
```typescript
// Archivo: src/modules/table/hooks/useProjectTableActions.ts
// Problema potencial: Múltiples `if (!condition) return;` en callbacks
// Ya intenté arreglarlos pero el error persiste
```

### 3. useProjectTableState.ts (Hook principal de estado)
```typescript
// Archivo: src/modules/table/hooks/useProjectTableState.ts
// Posible problema: Return condicional o hook inconsistente
```

### 4. SortableRow.tsx (Componente que usa hooks)
```typescript
// Archivo: src/modules/table/components/SortableRow.tsx
// Usa: useSortable, useState, useMemo, useEffect
// Posible problema: Hook llamado condicionalmente
```

## CONTEXTO DEL ERROR:
- **Stack trace apunta a ProjectTable.tsx**
- **Error ocurre después de cargar (no en carga inicial)**
- **Compilación exitosa (error en runtime)**
- **Playwright muestra el error consistentemente**

## PREGUNTA PARA CLAUDE-REVISION:
¿Qué está causando exactamente "Rendered fewer hooks than expected" si ya arreglé los returns tempranos en los callbacks? ¿Hay algún return condicional oculto en ProjectTable.tsx o en otro componente?

## CAMBIOS REALIZADOS:
1. ✅ `allProjects={projects}` → `allProjects={state.projects}`
2. ✅ `renderedProjectIds` → `sortedProjects.map(p => p.id)`
3. ✅ Returns tempranos en callbacks reestructurados
4. ✅ Defensa en useHierarchyDisplay
5. ✅ Estructura de ProjectTable reorganizada

## NECESITO:
- Diagnóstico experto del error de hooks
- Identificación exacta del return condicional problemático
- Solución definitiva para eliminar el error
