/**
 * Validation engine for imported data
 */

import { normalizeString, levenshteinDistance } from './fuzzyMatch';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  rowIndex: number;
  field?: string;
  severity: ValidationSeverity;
  message: string;
  suggestion?: string;
  autoFixable?: boolean;
  fixAction?: string; // identifier for auto-fix
  fixValue?: unknown;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  validRowCount: number;
  totalRowCount: number;
  canImport: boolean; // true if no blocking errors
  similarNames: SimilarNameGroup[];
}

export interface SimilarNameGroup {
  field: string;
  names: string[];
  suggestion: string;
}

interface RawProject {
  name?: string;
  branch?: string;
  startDate?: unknown;
  endDate?: unknown;
  assignee?: string | null;
  daysRequired?: number;
  priority?: number;
  type?: string;
  blockedBy?: string | null;
  blocksTo?: string | null;
  reportedLoad?: number | null;
  _rowIndex: number;
}

/**
 * Validate all imported data and return issues
 */
export function validateImportData(projects: RawProject[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const allNames: string[] = [];
  const allAssignees: string[] = [];

  for (const proj of projects) {
    const row = proj._rowIndex;

    // 1. Required: project name
    if (!proj.name || String(proj.name).trim().length === 0) {
      issues.push({
        rowIndex: row,
        field: 'name',
        severity: 'error',
        message: `Fila ${row + 1}: Nombre del proyecto vacío`,
        suggestion: 'Agrega un nombre o elimina esta fila',
      });
    } else {
      allNames.push(String(proj.name).trim());
    }

    // 2. Required: days required
    const days = Number(proj.daysRequired);
    if (proj.name && String(proj.name).trim().length > 0) {
      if (isNaN(days) || days < 0) {
        issues.push({
          rowIndex: row,
          field: 'daysRequired',
          severity: 'error',
          message: `Fila ${row + 1}: "${proj.name}" — Días requeridos inválido`,
          suggestion: 'Debe ser un número positivo',
        });
      } else if (days === 0 && proj.type !== 'En radar') {
        issues.push({
          rowIndex: row,
          field: 'daysRequired',
          severity: 'warning',
          message: `Fila ${row + 1}: "${proj.name}" — Días requeridos es 0`,
          suggestion: 'Los proyectos con 0 días no generan carga',
        });
      }
    }

    // 3. Date validation
    if (proj.startDate && proj.endDate) {
      const start = proj.startDate instanceof Date ? proj.startDate : new Date(String(proj.startDate));
      const end = proj.endDate instanceof Date ? proj.endDate : new Date(String(proj.endDate));
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        if (start > end) {
          issues.push({
            rowIndex: row,
            field: 'startDate',
            severity: 'warning',
            message: `Fila ${row + 1}: "${proj.name}" — Fecha inicio es posterior a fecha fin`,
            suggestion: 'Verifica las fechas',
            autoFixable: true,
            fixAction: 'swap-dates',
          });
        }
      }
    }

    // 4. Missing dates warning (when assignee exists)
    if (proj.assignees.length > 0 && (!proj.startDate || !proj.endDate) && proj.type !== 'En radar') {
      issues.push({
        rowIndex: row,
        field: 'startDate',
        severity: 'warning',
        message: `Fila ${row + 1}: "${proj.name}" — Tiene asignado pero faltan fechas`,
        suggestion: 'Sin fechas no se calculará la carga',
      });
    }

    // 5. Missing assignee warning (when dates exist)
    if (proj.startDate && proj.endDate && proj.assignees.length === 0 && proj.type !== 'En radar') {
      issues.push({
        rowIndex: row,
        field: 'assignee',
        severity: 'warning',
        message: `Fila ${row + 1}: "${proj.name}" — Tiene fechas pero no hay persona asignada`,
        suggestion: 'Sin asignado no se calculará la carga',
      });
    }

    // 6. Excessive load warning
    if (proj.startDate && proj.endDate && days > 0) {
      const start = proj.startDate instanceof Date ? proj.startDate : new Date(String(proj.startDate));
      const end = proj.endDate instanceof Date ? proj.endDate : new Date(String(proj.endDate));
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const calendarDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const roughWorkDays = Math.ceil(calendarDays * 5 / 7);
        if (roughWorkDays > 0 && days / roughWorkDays > 3) {
          issues.push({
            rowIndex: row,
            field: 'daysRequired',
            severity: 'warning',
            message: `Fila ${row + 1}: "${proj.name}" — Carga extrema detectada (>${Math.round(days / roughWorkDays * 100)}%)`,
            suggestion: 'Verifica los días requeridos o las fechas',
          });
        }
      }
    }

    // Collect assignees
    proj.assignees.forEach(a => allAssignees.push(a.trim()));
  }

  // 7. Check for broken dependencies
  const nameSet = new Set(allNames.map(n => normalizeString(n)));
  for (const proj of projects) {
    if (proj.blockedBy) {
      const normalized = normalizeString(String(proj.blockedBy));
      if (!nameSet.has(normalized)) {
        issues.push({
          rowIndex: proj._rowIndex,
          field: 'blockedBy',
          severity: 'info',
          message: `Fila ${proj._rowIndex + 1}: "${proj.name}" — Dependencia "${proj.blockedBy}" no encontrada`,
          suggestion: 'El proyecto que lo bloquea no está en la lista',
        });
      }
    }
    if (proj.blocksTo) {
      const normalized = normalizeString(String(proj.blocksTo));
      if (!nameSet.has(normalized)) {
        issues.push({
          rowIndex: proj._rowIndex,
          field: 'blocksTo',
          severity: 'info',
          message: `Fila ${proj._rowIndex + 1}: "${proj.name}" — Proyecto bloqueado "${proj.blocksTo}" no encontrado`,
          suggestion: 'El proyecto que bloquea no está en la lista',
        });
      }
    }
  }

  // 8. Detect similar person names (e.g., "Darío" vs "Dario")
  const similarNames = detectSimilarNames(allAssignees, 'assignee');

  // Add similar name issues
  for (const group of similarNames) {
    issues.push({
      rowIndex: -1,
      field: group.field,
      severity: 'warning',
      message: `"${group.names.join('" y "')}" parecen ser la misma persona`,
      suggestion: `¿Unificar como "${group.suggestion}"?`,
      autoFixable: true,
      fixAction: 'unify-names',
      fixValue: { names: group.names, unified: group.suggestion },
    });
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  const validRowCount = projects.length - projects.filter(p => {
    return issues.some(i => i.rowIndex === p._rowIndex && i.severity === 'error');
  }).length;

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    validRowCount,
    totalRowCount: projects.length,
    canImport: errorCount === 0,
    similarNames,
  };
}

/**
 * Find names that are suspiciously similar
 */
function detectSimilarNames(names: string[], field: string): SimilarNameGroup[] {
  const unique = [...new Set(names)];
  const groups: SimilarNameGroup[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < unique.length; i++) {
    if (processed.has(unique[i])) continue;
    
    const similar: string[] = [unique[i]];
    const normI = normalizeString(unique[i]);
    
    for (let j = i + 1; j < unique.length; j++) {
      if (processed.has(unique[j])) continue;
      const normJ = normalizeString(unique[j]);
      
      const distance = levenshteinDistance(normI, normJ);
      if (distance <= 2 && distance > 0) {
        similar.push(unique[j]);
        processed.add(unique[j]);
      }
    }

    if (similar.length > 1) {
      // Suggest the longest/most complete version
      const suggestion = similar.reduce((a, b) => a.length >= b.length ? a : b);
      groups.push({ field, names: similar, suggestion });
      processed.add(unique[i]);
    }
  }

  return groups;
}
