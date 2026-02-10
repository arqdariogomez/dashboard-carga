import * as XLSX from 'xlsx';
import type { Project, AppConfig } from '@/lib/types';
import { computeProjectFields } from '@/lib/workloadEngine';
import { parseAssignees } from '@/lib/assigneeHelpers';
import type { ColumnMapping } from './columnDetector';
import {
  enrichRowsWithParent,
  createRowIndexMap,
  resolveParentIds,
  type RowWithParent,
  type RowIndexMap,
} from './indentDetector';

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return new Date(date.y, date.m - 1, date.d);
    return null;
  }
  if (typeof value === 'string') {
    // Try dd/mm/yyyy or dd-mm-yyyy
    const parts = value.match(/^(\d{1,2})[/\-.]+(\d{1,2})[/\-.]+(\d{2,4})$/);
    if (parts) {
      const day = parseInt(parts[1]);
      const month = parseInt(parts[2]) - 1;
      let year = parseInt(parts[3]);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
    // Try yyyy-mm-dd
    const isoParts = value.match(/^(\d{4})[/\-.]+(\d{1,2})[/\-.]+(\d{1,2})$/);
    if (isoParts) {
      return new Date(parseInt(isoParts[1]), parseInt(isoParts[2]) - 1, parseInt(isoParts[3]));
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function parsePriority(value: unknown): number {
  if (!value) return 1;
  if (typeof value === 'number') return Math.max(1, Math.min(5, Math.round(value)));
  if (typeof value === 'string') {
    const stars = (value.match(/⭐|★|☆|\*/g) || []).length;
    if (stars > 0) return Math.min(5, stars);
    // Text mappings
    const lower = value.toLowerCase().trim();
    const textMap: Record<string, number> = {
      'muy baja': 1, 'baja': 2, 'media': 3, 'alta': 4, 'muy alta': 5,
      'urgente': 5, 'critica': 5, 'low': 2, 'medium': 3, 'high': 4, 'critical': 5,
    };
    if (textMap[lower]) return textMap[lower];
    const num = parseInt(value);
    if (!isNaN(num)) return Math.max(1, Math.min(5, num));
  }
  return 1;
}

function parseType(value: unknown): 'Proyecto' | 'Lanzamiento' | 'En radar' {
  if (!value) return 'Proyecto';
  const str = String(value).toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (str.includes('lanzamiento') || str.includes('launch')) return 'Lanzamiento';
  if (str.includes('radar') || str.includes('en radar')) return 'En radar';
  return 'Proyecto';
}

function parsePercentage(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') {
    if (value > 1 && value <= 200) return value / 100;
    if (value > 0 && value <= 1) return value;
    return value / 100;
  }
  if (typeof value === 'string') {
    const num = parseFloat(value.replace('%', '').trim());
    if (!isNaN(num)) return num > 3 ? num / 100 : num;
  }
  return null;
}

export interface TransformOptions {
  mappings: ColumnMapping[];
  config: AppConfig;
  skipGroupRows?: number[]; // row indices to skip
  nameColumnName?: string; // column name for hierarchy detection (usually 'Proyecto')
  detectHierarchy?: boolean; // if true, detect indent levels and calculate parentId
  indentLevels?: number[]; // optional precomputed indent levels aligned with rows[]
}

/**
 * Transform raw Excel rows into Project objects using the column mapping
 */
export function transformToProjects(
  rows: Record<string, unknown>[],
  options: TransformOptions
): Project[] {
  const { mappings, config, skipGroupRows = [], nameColumnName, detectHierarchy = false } = options;
  const skipSet = new Set(skipGroupRows);

  // Build field->column lookup
  const fieldToColumn = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.field) {
      fieldToColumn.set(mapping.field, mapping.excelColumn);
    }
  }

  const getVal = (row: Record<string, unknown>, field: string): unknown => {
    const col = fieldToColumn.get(field);
    if (!col) return null;
    return row[col];
  };

  // Pre-process: enrich rows with hierarchy if requested
  // Must be done AFTER filtering skip rows, so indices match
  const projects: Project[] = [];
  const rowIndexToProjectId = new Map<number, string>();
  const originalRowToProjectId = new Map<number, string>(); // Maps original row indices to project IDs

  // First pass: build projects (filtering by skipGroupRows)
  for (let i = 0; i < rows.length; i++) {
    if (skipSet.has(i)) continue;
    
    const row = rows[i];
    const name = getVal(row, 'name');
    
    // Skip rows without a project name
    if (!name || String(name).trim().length === 0) continue;

    const projectId = `import-${i}-${Date.now()}`;

    const rawProject = {
      id: projectId,
      name: String(name).trim(),
      branch: getVal(row, 'branch') ? String(getVal(row, 'branch')).trim() : '',
      startDate: parseExcelDate(getVal(row, 'startDate')),
      endDate: parseExcelDate(getVal(row, 'endDate')),
      assignees: parseAssignees(getVal(row, 'assignee') ? String(getVal(row, 'assignee')) : null),
      daysRequired: Number(getVal(row, 'daysRequired')) || 0,
      priority: parsePriority(getVal(row, 'priority')),
      type: parseType(getVal(row, 'type')),
      blockedBy: getVal(row, 'blockedBy') ? String(getVal(row, 'blockedBy')).trim() : null,
      blocksTo: getVal(row, 'blocksTo') ? String(getVal(row, 'blocksTo')).trim() : null,
      reportedLoad: parsePercentage(getVal(row, 'reportedLoad')),
      parentId: undefined as string | null | undefined, // Will be set later
      isExpanded: true,
    };

    // Track mapping from row index to project ID
    originalRowToProjectId.set(i, projectId);

    const computed = computeProjectFields(rawProject as Omit<Project, 'assignedDays' | 'balanceDays' | 'dailyLoad' | 'totalHours'>, config);
    projects.push(computed);
  }

  // Second pass: resolve parentIds if hierarchy was detected
  if (detectHierarchy && nameColumnName) {
    // Build enrichedRows using optional precomputed indentLevels (from Excel alignment) if provided
    const indentLevels = options.indentLevels;

    // Compute parent references for each row index in the provided `rows` array
    const enrichedRows: RowWithParent[] = rows.map((r, idx) => ({
      ...r,
      _rowIndex: idx,
      _indentLevel: indentLevels && typeof indentLevels[idx] === 'number' ? indentLevels[idx] : (enrichRowsWithParent([r], nameColumnName)[0]._indentLevel || 0),
      _parentRowIndex: -1,
    }));

    // Calculate parents using indentLevels, ignoring empty rows (rows[] already filtered)
    for (let i = 0; i < enrichedRows.length; i++) {
      const level = enrichedRows[i]._indentLevel ?? 0;
      if (level === 0) {
        enrichedRows[i]._parentRowIndex = -1;
        continue;
      }

      // Prefer immediate parent with level === level-1
      let parentIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        const jl = enrichedRows[j]._indentLevel ?? 0;
        if (jl === level - 1) { parentIdx = j; break; }
      }

      // Fallback: nearest ancestor with level < current level
      if (parentIdx === -1) {
        for (let j = i - 1; j >= 0; j--) {
          const jl = enrichedRows[j]._indentLevel ?? 0;
          if (jl < level) { parentIdx = j; break; }
        }
      }

      enrichedRows[i]._parentRowIndex = parentIdx === -1 ? -1 : parentIdx;
    }

    // Map enriched parent indexes to project.parentId using originalRowToProjectId map
    projects.forEach((project) => {
      const originalRowIdx = Array.from(originalRowToProjectId.entries()).find(([_, id]) => id === project.id)?.[0];
      if (typeof originalRowIdx === 'number') {
        const enriched = enrichedRows[originalRowIdx];
        if (enriched && typeof enriched._parentRowIndex === 'number' && enriched._parentRowIndex !== -1) {
          const parentId = originalRowToProjectId.get(enriched._parentRowIndex);
          if (parentId) project.parentId = parentId;
        }
      }
    });
  }

  return projects;
}

/**
 * Build raw project objects for validation (before full transform)
 */
export function buildRawForValidation(
  rows: Record<string, unknown>[],
  mappings: ColumnMapping[],
  skipGroupRows: number[] = []
): Array<Record<string, unknown> & { _rowIndex: number }> {
  const skipSet = new Set(skipGroupRows);
  const fieldToColumn = new Map<string, string>();
  for (const m of mappings) {
    if (m.field) fieldToColumn.set(m.field, m.excelColumn);
  }

  const result: Array<Record<string, unknown> & { _rowIndex: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    if (skipSet.has(i)) continue;
    const row = rows[i];
    
    const mapped: Record<string, unknown> & { _rowIndex: number } = { _rowIndex: i };
    for (const [field, col] of fieldToColumn) {
      const val = row[col];
      
      // Parse specific types for validation
      switch (field) {
        case 'startDate':
        case 'endDate':
          mapped[field] = parseExcelDate(val);
          break;
        case 'daysRequired':
          mapped[field] = Number(val) || 0;
          break;
        case 'priority':
          mapped[field] = parsePriority(val);
          break;
        case 'type':
          mapped[field] = parseType(val);
          break;
        case 'reportedLoad':
          mapped[field] = parsePercentage(val);
          break;
        default:
          mapped[field] = val != null ? String(val).trim() : null;
      }
    }

    // Only include rows with at least a name
    const name = mapped.name;
    if (name && String(name).trim().length > 0) {
      result.push(mapped);
    }
  }

  return result;
}

export interface SavedMapping {
  fileName: string;
  sheetName: string;
  headerRow: number;
  columnMappings: { field: string; excelColumn: string }[];
  dateFormat: string;
  timestamp: number;
}

/**
 * Save mapping configuration to localStorage
 */
export function saveMappingConfig(mapping: SavedMapping): void {
  try {
    const key = 'workload-import-mappings';
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as SavedMapping[];
    // Keep last 10 mappings
    const updated = [mapping, ...existing.filter(m => m.fileName !== mapping.fileName)].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/**
 * Load saved mapping for a filename
 */
export function loadMappingConfig(fileName: string): SavedMapping | null {
  try {
    const key = 'workload-import-mappings';
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as SavedMapping[];
    return existing.find(m => m.fileName === fileName) || null;
  } catch {
    return null;
  }
}
