import { useMemo } from 'react';
import type { Project } from '@/lib/types';

interface HierarchyDisplayResult {
  hierarchyPrefix: string;
  hierarchyIndent: number;
}

/**
 * Hook to calculate hierarchy display for a single project
 * Returns the prefix string and indentation level for rendering hierarchy
 */
export function useHierarchyDisplay(project: Project, allProjects: Project[]): HierarchyDisplayResult {
  const result = useMemo(() => {
    // Defensa contra inputs inválidos
    if (!allProjects?.length || !project) {
      return {
        hierarchyPrefix: '',
        hierarchyIndent: 0,
      };
    }

    // Calculate indentation level by counting ancestors
    let indent = 0;
    let currentProject = project;
    const ancestors: string[] = [];

    // Traverse up the hierarchy to count ancestors and build prefix
    while (currentProject.parentId) {
      const parent = allProjects.find(p => p.id === currentProject.parentId);
      if (!parent) break;
      
      ancestors.push(parent.id);
      indent++;
      currentProject = parent;
    }

    // Build prefix string based on ancestors
    let prefix = '';
    if (ancestors.length > 0) {
      // Create prefix based on ancestor positions
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestorId = ancestors[i];
        const ancestor = allProjects.find(p => p.id === ancestorId);
        if (!ancestor) continue;

        const siblings = allProjects.filter(p => p.parentId === ancestor.parentId);
        const isLast = siblings[siblings.length - 1]?.id === ancestorId;
        
        if (i === ancestors.length - 1) {
          // Direct parent
          prefix += isLast ? '└─' : '├─';
        } else {
          // Higher ancestors
          prefix += isLast ? '  ' : '│ ';
        }
      }
    }

    return {
      hierarchyPrefix: prefix,
      hierarchyIndent: indent,
    };
  }, [project, allProjects]);

  return result;
}
