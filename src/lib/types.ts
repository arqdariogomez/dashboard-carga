export interface Project {
  id: string;
  name: string;
  branch: string;
  startDate: Date | null;
  endDate: Date | null;
  assignees: string[];
  daysRequired: number;
  priority: number;
  type: 'Proyecto' | 'Lanzamiento' | 'En radar';
  blockedBy: string | null;
  blocksTo: string | null;
  reportedLoad: number | null;
  // Hierarchy
  parentId?: string | null;
  isExpanded?: boolean;
  hierarchyLevel?: number;
  // Computed fields
  assignedDays: number;
  balanceDays: number;
  dailyLoad: number;
  totalHours: number;
}

export interface PersonWorkload {
  person: string;
  date: Date;
  totalLoad: number;
  projects: ProjectLoad[];
}

export interface ProjectLoad {
  projectId: string;
  projectName: string;
  dailyLoad: number;
}

export interface NonWorkingDay {
  date: Date;
  reason: string;
  recurring: boolean;
}

export interface AppConfig {
  hoursPerDay: number;
  weekendDays: number[];
  holidays: NonWorkingDay[];
  loadMode: 'calculated' | 'reported';
}

export interface FilterState {
  persons: string[];
  branches: string[];
  types: string[];
  dateRange: { start: Date; end: Date } | null;
  showOnlyActive: boolean;
}

export type ViewType = 'grid' | 'chart' | 'table' | 'gantt' | 'persons';
export type Granularity = 'day' | 'week' | 'month';

export interface AppState {
  projects: Project[];
  config: AppConfig;
  filters: FilterState;
  activeView: ViewType;
  granularity: Granularity;
  sidebarCollapsed: boolean;
  fileName: string | null;
  lastUpdated: Date | null;
  hasUnsavedChanges: boolean;
  projectOrder: string[]; // ordered project IDs for drag-and-drop reordering
}

export type DynamicColumnType = 'text' | 'number' | 'date' | 'select' | 'tags' | 'checkbox';

export interface DynamicColumn {
  id: string;
  boardId: string;
  key: string;
  name: string;
  type: DynamicColumnType;
  position: number;
  config: Record<string, unknown>;
}

export type DynamicCellValue = string | number | boolean | string[] | null;

export type AppAction =
  | { type: 'SET_PROJECTS'; payload: { projects: Project[]; fileName: string } }
  | { type: 'SET_CONFIG'; payload: Partial<AppConfig> }
  | { type: 'SET_FILTERS'; payload: Partial<FilterState> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_VIEW'; payload: ViewType }
  | { type: 'SET_GRANULARITY'; payload: Granularity }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_LOAD_MODE'; payload: 'calculated' | 'reported' }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<Project> } }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'REORDER_PROJECTS'; payload: string[] }
  | { type: 'UPDATE_HIERARCHY'; payload: { projectId: string; newParentId: string | null } }
  | { type: 'TOGGLE_EXPANSION'; payload: string }
  | { type: 'MARK_SAVED' };
