/**
 * ExpandableCell - Renders project name with hierarchical indentation and toggle
 * Shows chevron icon if project has children
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Project } from '@/lib/types';

interface ExpandableCellProps {
  project: Project;
  hasChildren: boolean;
  onToggleExpand: (projectId: string) => void;
  onUpdateName: (value: string) => void;
  isEditing?: boolean;
  editValue?: string;
  onStartEdit?: () => void;
  onFinishEdit?: (value: string) => void;
  onCancelEdit?: () => void;
  onEditChange?: (v: string) => void;
  onIndent?: (projectId: string) => void;
  onOutdent?: (projectId: string) => void;
}

export function ExpandableCell({
  project,
  hasChildren,
  onToggleExpand,
  onUpdateName,
  isEditing = false,
  editValue = '',
  onStartEdit,
  onFinishEdit,
  onCancelEdit,
  onEditChange,
  onIndent,
  onOutdent,
}: ExpandableCellProps) {
  const hierarchyLevel = project.hierarchyLevel ?? 0;
  const isExpanded = project.isExpanded ?? true;
  
  // Indentación: 20px por nivel de jerarquía más 24px para el icono
  const indentPx = hierarchyLevel * 20;

  if (isEditing) {
    return (
      <div
        className="flex items-center gap-1 px-3 py-2"
        style={{ paddingLeft: `calc(${indentPx}px + 1.5rem + 0.75rem)` }}
      >
        <input
          type="text"
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          onBlur={() => onFinishEdit?.(editValue)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFinishEdit?.(editValue);
            if (e.key === 'Escape') onCancelEdit?.();
            if (e.key === 'Tab') {
              e.preventDefault();
              if (e.shiftKey) {
                onOutdent?.(project.id);
              } else {
                onIndent?.(project.id);
              }
            }
          }}
          className="flex-1 px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 group"
      style={{ paddingLeft: `${indentPx}px` }}
    >
      {/* Expansion toggle - only show if has children */}
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(project.id);
          }}
          className="flex-shrink-0 p-0.5 hover:bg-accent-blue/20 rounded transition-colors text-text-secondary/60 hover:text-text-primary"
          aria-label={isExpanded ? 'Contraer' : 'Expandir'}
          title={isExpanded ? 'Contraer grupo' : 'Expandir grupo'}
        >
          {isExpanded ? (
            <ChevronDown size={16} className="text-accent-blue" />
          ) : (
            <ChevronRight size={16} />
          )}
        </button>
      ) : (
        // Empty space for alignment when no children
        <div className="w-6 flex-shrink-0" />
      )}

      {/* Project name - clickable to edit */}
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors flex-1 font-medium text-sm text-text-primary"
        onClick={() => onStartEdit?.()}
        title="Clic para editar nombre"
      >
        {project.name || <span className="text-text-secondary/50 italic">—</span>}
      </span>

      {/* Indicator if this is a parent project (read-only) */}
      {hasChildren && (
        <div
          className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue font-medium ml-2"
          title="Este es un grupo - editar sus hijos"
        >
          {/* Count children */}
          {project.assignees?.length === 0 && 'GRUPO'}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to get child count and filtering logic
 * Returns which projects to display based on expansion state
 */
export function useHierarchyDisplay(projects: Project[]) {
  const childrenMap = new Map<string, Project[]>();
  const expandedSet = new Set<string>();

  // Build children map
  for (const project of projects) {
    const children = projects.filter(p => p.parentId === project.id);
    childrenMap.set(project.id, children);
    if (project.isExpanded ?? true) {
      expandedSet.add(project.id);
    }
  }

  // Get filtered projects (only show if parent is expanded)
  const visibleProjects = projects.filter(project => {
    if (!project.parentId) return true; // Root projects always visible
    
    // Check if any ancestor is collapsed
    let current = project.parentId;
    while (current) {
      if (!expandedSet.has(current)) return false;
      const parent = projects.find(p => p.id === current);
      current = parent?.parentId;
    }
    return true;
  });

  return {
    childrenMap,
    visibleProjects,
    hasChildren: (projectId: string) => (childrenMap.get(projectId)?.length ?? 0) > 0,
  };
}
