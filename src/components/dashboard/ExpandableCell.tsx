/**
 * ExpandableCell - Renders project name with hierarchical indentation and toggle
 * Improved UX following Notion-style hierarchy visualization with tree lines and clear visual hierarchy
 */

import { useLayoutEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Project } from '@/lib/types';

interface ExpandableCellProps {
  project: Project;
  hasChildren: boolean;
  isLastSibling?: boolean;
  childCount?: number; // Number of direct children
  onToggleExpand: (projectId: string) => void;
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
  isLastSibling = false,
  childCount = 0,
  onToggleExpand,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Increased indent for better visual hierarchy (40px per level, like Notion)
  const indentPx = hierarchyLevel * 40;
  const chevronSize = hasChildren ? 19 : 16;

  const applyInlineFormat = (marker: '**' | '*') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const source = editValue || '';
    const hasSelection = end > start;
    const selected = hasSelection ? source.slice(start, end) : source;
    const wrapped = `${marker}${selected}${marker}`;
    const nextValue = hasSelection
      ? `${source.slice(0, start)}${wrapped}${source.slice(end)}`
      : wrapped;
    onEditChange?.(nextValue);

    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = hasSelection ? start + marker.length : marker.length;
      const cursorEnd = hasSelection ? end + marker.length : marker.length + selected.length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  useLayoutEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = 'auto';
    el.style.height = `${Math.max(24, el.scrollHeight)}px`;
  }, [isEditing, editValue]);

  if (isEditing) {
    return (
      <div className="flex items-start gap-1 px-2 py-2" style={{ paddingLeft: `${indentPx}px` }}>
        <div className="flex-shrink-0 w-[24px] h-[24px]" />
        <div className="relative flex-1">
          <div className="absolute -top-7 left-0 z-20 flex items-center gap-1 rounded-md border border-border bg-white shadow-sm px-1 py-0.5">
            <button
              type="button"
              className="h-6 w-6 inline-flex items-center justify-center rounded text-[11px] font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
              title="Negrita (Ctrl/Cmd+B)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyInlineFormat('**')}
            >
              B
            </button>
            <button
              type="button"
              className="h-6 w-6 inline-flex items-center justify-center rounded text-[11px] italic font-medium text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
              title="Cursiva (Ctrl/Cmd+I)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyInlineFormat('*')}
            >
              I
            </button>
          </div>
          <textarea
            ref={textareaRef}
            autoFocus
            rows={1}
            value={editValue}
            onChange={(e) => onEditChange?.(e.target.value)}
            onBlur={() => onFinishEdit?.(editValue)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                applyInlineFormat('**');
                return;
              }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                applyInlineFormat('*');
                return;
              }
              if (e.key === 'Escape') onCancelEdit?.();
              if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                  onOutdent?.(project.id);
                } else {
                  onIndent?.(project.id);
                }
              }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onFinishEdit?.(editValue);
            }}
            className={`flex-1 w-full resize-none overflow-hidden rounded px-1 py-0.5 text-sm leading-5 whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-person-1/25 ${
              hasChildren ? 'font-semibold text-text-primary' : 'font-medium text-text-primary'
            }`}
            style={{ minHeight: '24px' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 py-2 group relative transition-all duration-150 rounded-sm ${
        hasChildren ? 'bg-accent-blue/8 hover:bg-accent-blue/15' : 'hover:bg-accent-blue/8'
      }`}
      style={{ paddingLeft: `${indentPx}px` }}
    >
      {/* Visual tree lines for hierarchy - connects nested items (Notion-style) */}
      {hierarchyLevel > 0 && (
        <>
          {/* Vertical line extending from parent */}
          <div
            className="absolute border-l-2 border-[#5B7FAF]/55 group-hover:border-[#4C6E9C]/65 transition-colors"
            style={{
              left: `${hierarchyLevel * 40 - 20}px`,
              top: 0,
              bottom: isLastSibling ? '50%' : 0,
            }}
          />
          {/* Horizontal connector from vertical line to chevron/bullet */}
          <div
            className="absolute top-1/2 border-t-2 border-[#5B7FAF]/55 group-hover:border-[#4C6E9C]/65 transition-colors"
            style={{
              left: `${hierarchyLevel * 40 - 20}px`,
              width: '15px',
              transform: 'translateY(-50%)',
            }}
          />
        </>
      )}

      {/* Expansion toggle - redesigned for clarity */}
      {hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(project.id);
          }}
          className={`flex-shrink-0 p-0.5 rounded transition-all duration-200 ${
            isExpanded
              ? 'hover:bg-accent-blue/30 text-[#245EA8]'
              : 'hover:bg-accent-blue/20 text-[#57779E]'
          }`}
          aria-label={isExpanded ? 'Contraer' : 'Expandir'}
          title={isExpanded ? 'Contraer grupo' : 'Expandir grupo'}
        >
          {isExpanded ? (
            <ChevronDown size={chevronSize} strokeWidth={2.6} className="transition-transform" />
          ) : (
            <ChevronRight size={chevronSize} strokeWidth={2.6} />
          )}
        </button>
      ) : (
        // Empty space for alignment (but slightly visible for hierarchy understanding)
        <div className="flex-shrink-0 w-[24px] h-[24px] opacity-0 group-hover:opacity-20 transition-opacity" />
      )}

      {/* Project name - with improved styling for parent projects */}
      <span
        className={`cursor-pointer rounded px-1 py-0.5 transition-colors flex-1 text-sm ${
          hasChildren
            ? 'font-semibold text-text-primary hover:bg-accent-blue/30'
            : 'font-medium text-text-primary hover:bg-accent-blue/20'
        }`}
        onDoubleClick={() => onStartEdit?.()}
        title="Doble clic para editar nombre"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {project.name || <span className="text-text-secondary/50 italic">—</span>}
      </span>

      {/* Visual indicator badges - improved design */}
      {hasChildren && (
        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
          <div
            className="text-[11px] px-2.5 py-0.5 rounded-full bg-accent-blue/25 text-[#2D5F99] font-semibold border border-accent-blue/30"
            title={`${Math.max(0, childCount - 1)} ${Math.max(0, childCount - 1) === 1 ? 'hijo directo' : 'hijos directos'}`}
          >
            {Math.max(0, childCount - 1)}
          </div>
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

  // Helper to count all descendants recursively
  const countDescendants = (projectId: string): number => {
    const children = childrenMap.get(projectId) || [];
    let count = children.length;
    for (const child of children) {
      count += countDescendants(child.id);
    }
    return count;
  };

  // Get filtered projects (only show if parent is expanded)
  const visibleProjects = projects.filter(project => {
    if (!project.parentId) return true; // Root projects always visible
    
    // Check if any ancestor is collapsed
    let current: string | null = project.parentId;
    while (current) {
      if (!expandedSet.has(current)) return false;
      const parent = projects.find(p => p.id === current);
      current = parent?.parentId ?? null;
    }
    return true;
  });

  return {
    childrenMap,
    visibleProjects,
    hasChildren: (projectId: string) => (childrenMap.get(projectId)?.length ?? 0) > 0,
    getDirectChildren: (projectId: string) => childrenMap.get(projectId)?.length ?? 0,
    getDescendantCount: (projectId: string) => countDescendants(projectId),
  };
}
