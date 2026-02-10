/**
 * Hierarchy Engine - Core functions for managing project hierarchies
 * Handles flat→tree conversions, aggregations, validations, and level calculations
 */

import type { Project, AppConfig } from './types';

/**
 * Nested structure for tree operations
 */
export interface ProjectNode extends Project {
  children?: ProjectNode[];
}

/**
 * Calculate hierarchy level (depth) for a project
 * Root projects have level 0
 */
export function calculateHierarchyLevel(projectId: string, projects: Project[]): number {
  const project = projects.find(p => p.id === projectId);
  if (!project?.parentId) return 0;
  return 1 + calculateHierarchyLevel(project.parentId, projects);
}

/**
 * Get all ancestors of a project (from immediate parent to root)
 */
export function getAncestors(projectId: string, projects: Project[]): Project[] {
  const project = projects.find(p => p.id === projectId);
  if (!project?.parentId) return [];
  
  const parent = projects.find(p => p.id === project.parentId);
  if (!parent) return [];
  
  return [parent, ...getAncestors(parent.id, projects)];
}

/**
 * Get all descendants of a project (all children, grandchildren, etc.)
 */
export function getDescendants(projectId: string, projects: Project[]): Project[] {
  const children = projects.filter(p => p.parentId === projectId);
  const descendants = [...children];
  
  for (const child of children) {
    descendants.push(...getDescendants(child.id, projects));
  }
  
  return descendants;
}

/**
 * Get immediate children of a project
 */
export function getChildren(projectId: string, projects: Project[]): Project[] {
  return projects.filter(p => p.parentId === projectId);
}

/**
 * Build a nested tree structure from flat array
 * Used for rendering hierarchical views
 */
export function buildHierarchy(projects: Project[]): ProjectNode[] {
  const projectMap = new Map<string, ProjectNode>();
  const roots: ProjectNode[] = [];

  // First pass: create nodes
  for (const project of projects) {
    projectMap.set(project.id, { ...project, children: [] });
  }

  // Second pass: build relationships
  for (const project of projects) {
    const node = projectMap.get(project.id)!;
    
    if (!project.parentId) {
      roots.push(node);
    } else {
      const parent = projectMap.get(project.parentId);
      if (parent) {
        parent.children ??= [];
        parent.children.push(node);
      } else {
        // Orphan node (parent doesn't exist) - treat as root
        roots.push(node);
      }
    }
  }

  // Sort children at each level by original order
  const sortChildren = (node: ProjectNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        const aIdx = projects.findIndex(p => p.id === a.id);
        const bIdx = projects.findIndex(p => p.id === b.id);
        return aIdx - bIdx;
      });
      node.children.forEach(sortChildren);
    }
  };

  roots.forEach(sortChildren);
  return roots;
}

/**
 * Flatten hierarchical tree back to flat array
 */
export function flattenHierarchy(roots: ProjectNode[]): Project[] {
  const result: Project[] = [];
  
  const traverse = (node: ProjectNode) => {
    const { children, ...projectData } = node;
    result.push(projectData as Project);
    
    if (children) {
      children.forEach(traverse);
    }
  };

  roots.forEach(traverse);
  return result;
}

/**
 * Validate that newParentId doesn't create a circular dependency
 * Returns true if assignment is valid, false if it would create a cycle
 */
export function validateNoCircles(
  projectId: string,
  newParentId: string | null,
  projects: Project[]
): boolean {
  if (newParentId === null) return true;
  if (projectId === newParentId) return false;
  
  // Check if newParentId is a descendant of projectId
  const descendants = getDescendants(projectId, projects);
  return !descendants.some(p => p.id === newParentId);
}

/**
 * Aggregate data from children to parent
 * Returns updated project with aggregated values
 */
export function aggregateFromChildren(
  parentId: string,
  projects: Project[],
  config: AppConfig
): Partial<Project> {
  const children = getDescendants(parentId, projects);
  if (children.length === 0) return {};

  // Aggregate dates: earliest start, latest end
  const allDates = children
    .flatMap(p => {
      const dates = [];
      if (p.startDate) dates.push(p.startDate);
      if (p.endDate) dates.push(p.endDate);
      return dates;
    });

  const aggregated: Partial<Project> = {};

  if (allDates.length > 0) {
    aggregated.startDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    aggregated.endDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  }

  // Aggregate assignees: unique set of all children
  const allAssignees = new Set<string>();
  children.forEach(p => {
    p.assignees.forEach(a => allAssignees.add(a));
  });
  aggregated.assignees = Array.from(allAssignees).sort();

  // Sum daysRequired
  aggregated.daysRequired = children.reduce((sum, p) => sum + p.daysRequired, 0);

  // Average priority (weighted by daysRequired)
  const totalDays = aggregated.daysRequired || 1;
  aggregated.priority = Math.round(
    children.reduce((sum, p) => sum + p.priority * p.daysRequired, 0) / totalDays
  );

  return aggregated;
}

/**
 * Get all root projects (projects without a parent)
 */
export function getRootProjects(projects: Project[]): Project[] {
  return projects.filter(p => !p.parentId);
}

/**
 * Check if a project is a parent (has children)
 */
export function isParent(projectId: string, projects: Project[]): boolean {
  return projects.some(p => p.parentId === projectId);
}

/**
 * Get the sibling projects (same parent)
 */
export function getSiblings(projectId: string, projects: Project[]): Project[] {
  const project = projects.find(p => p.id === projectId);
  if (!project) return [];
  
  return projects.filter(p => p.parentId === project.parentId && p.id !== projectId);
}

/**
 * Move a project to a new parent
 * Returns updated projects array with parentId changed
 */
export function moveProject(
  projectId: string,
  newParentId: string | null,
  projects: Project[]
): Project[] {
  // Validate
  if (!validateNoCircles(projectId, newParentId, projects)) {
    throw new Error('Cannot move project: would create circular dependency');
  }

  return projects.map(p =>
    p.id === projectId ? { ...p, parentId: newParentId } : p
  );
}

/**
 * Calculate indentation levels for flat list display
 * Returns map of projectId -> indent level
 */
export function calculateIndentLevels(projects: Project[]): Map<string, number> {
  const levels = new Map<string, number>();

  for (const project of projects) {
    levels.set(project.id, calculateHierarchyLevel(project.id, projects));
  }

  return levels;
}

/**
 * Detect hierarchy changes between two project arrays
 * Returns array of changes detected
 */
export interface HierarchyChange {
  projectName: string;
  projectPath: string;
  oldParentId?: string | null;
  newParentId?: string | null;
}

export function detectHierarchyChanges(
  oldProjects: Project[],
  newProjects: Project[]
): HierarchyChange[] {
  const changes: HierarchyChange[] = [];

  // Build maps by name for comparison
  const oldMap = new Map<string, Project>();
  const newMap = new Map<string, Project>();

  oldProjects.forEach(p => {
    // Use full path as key for unique identification
    const path = buildProjectPath(p.id, oldProjects);
    oldMap.set(path, p);
  });

  newProjects.forEach(p => {
    const path = buildProjectPath(p.id, newProjects);
    newMap.set(path, p);
  });

  // Check for hierarchy changes
  for (const [path, newProject] of newMap) {
    const oldProject = oldMap.get(path);
    if (oldProject && oldProject.parentId !== newProject.parentId) {
      changes.push({
        projectName: newProject.name,
        projectPath: path,
        oldParentId: oldProject.parentId,
        newParentId: newProject.parentId,
      });
    }
  }

  return changes;
}

/**
 * Build full path for a project (e.g., "Parent/Child/Project")
 * Used for unique identification
 */
export function buildProjectPath(projectId: string, projects: Project[]): string {
  const project = projects.find(p => p.id === projectId);
  if (!project) return '';

  const ancestors = getAncestors(projectId, projects).reverse();
  const path = [...ancestors.map(p => p.name), project.name];
  return path.join('/');
}

/**
 * Find project by name and path
 * Useful for matching projects when parentIds have changed
 */
export function findProjectByNameAndPath(
  name: string,
  projects: Project[]
): Project | null {
  return projects.find(p => p.name === name) || null;
}

/**
 * Get summary metrics for collapsed parent display
 * Returns object with computed summary values for showing when group is folded
 */
export function getCollapsedMetricsSummary(projectId: string, projects: Project[]) {
  const metrics = aggregateFromChildren(projectId, projects, {} as AppConfig);
  const children = getChildren(projectId, projects);
  const descendants = getDescendants(projectId, projects);

  return {
    childCount: children.length,
    descendantCount: descendants.length,
    startDate: metrics.startDate || null,
    endDate: metrics.endDate || null,
    assignees: metrics.assignees || [],
    daysRequired: metrics.daysRequired || 0,
    priority: metrics.priority || 1,
  };
}
