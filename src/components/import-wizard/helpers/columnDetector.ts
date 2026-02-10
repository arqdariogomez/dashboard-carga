/**
 * Auto-detection of column mappings from Excel headers
 */

import { fuzzyMatchHeader, looksLikeDates, looksLikeNumbers, looksLikePercentages, looksLikeNames, detectDateFormat } from './fuzzyMatch';

export interface FieldDefinition {
  field: string;
  label: string;
  icon: string;
  required: boolean;
  aliases: string[];
  dataType: 'text' | 'date' | 'number' | 'percentage' | 'name';
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    field: 'name',
    label: 'Nombre del proyecto',
    icon: '📋',
    required: true,
    aliases: ['proyecto', 'tarea', 'task', 'nombre', 'title', 'actividad', 'project', 'name', 'nombre del proyecto'],
    dataType: 'text',
  },
  {
    field: 'branch',
    label: 'Sucursal',
    icon: '🏢',
    required: false,
    aliases: ['sucursal', 'ubicacion', 'location', 'sede', 'office', 'area', 'branch', 'oficina'],
    dataType: 'text',
  },
  {
    field: 'startDate',
    label: 'Fecha de inicio',
    icon: '📅',
    required: false,
    aliases: ['inicio', 'start', 'fecha inicio', 'fecha de inicio', 'begin', 'desde', 'arranque', 'start date', 'inicia'],
    dataType: 'date',
  },
  {
    field: 'endDate',
    label: 'Fecha de fin',
    icon: '📅',
    required: false,
    aliases: ['fin', 'end', 'fecha fin', 'fecha de fin', 'finish', 'hasta', 'deadline', 'entrega', 'end date', 'termina'],
    dataType: 'date',
  },
  {
    field: 'assignee',
    label: 'Persona asignada',
    icon: '👤',
    required: false,
    aliases: ['asignado', 'responsable', 'persona', 'owner', 'encargado', 'who', 'assignee', 'asignado a', 'quien'],
    dataType: 'name',
  },
  {
    field: 'daysRequired',
    label: 'Días requeridos',
    icon: '⏱️',
    required: true,
    aliases: ['dias', 'dias requeridos', 'days', 'duracion', 'esfuerzo', 'tiempo', 'jornadas', 'days required', 'duration', 'effort'],
    dataType: 'number',
  },
  {
    field: 'priority',
    label: 'Prioridad',
    icon: '⭐',
    required: false,
    aliases: ['prioridad', 'priority', 'prio', 'urgencia', 'nivel', 'level', 'importancia'],
    dataType: 'number',
  },
  {
    field: 'type',
    label: 'Tipo',
    icon: '🏷️',
    required: false,
    aliases: ['tipo', 'category', 'clase', 'etapa', 'fase', 'status', 'type', 'categoria'],
    dataType: 'text',
  },
  {
    field: 'blockedBy',
    label: 'Bloqueado por',
    icon: '🔗',
    required: false,
    aliases: ['bloqueado por', 'depende de', 'predecesor', 'after', 'blocked by', 'depends on', 'prerequisito'],
    dataType: 'text',
  },
  {
    field: 'blocksTo',
    label: 'Bloquea a',
    icon: '🔗',
    required: false,
    aliases: ['bloquea a', 'sucesor', 'siguiente', 'before', 'blocks to', 'blocks', 'successor'],
    dataType: 'text',
  },
  {
    field: 'reportedLoad',
    label: 'Carga según responsable',
    icon: '📊',
    required: false,
    aliases: ['carga responsable', 'carga segun responsable', 'reported load', 'carga', 'load', '% carga'],
    dataType: 'percentage',
  },
];

export interface ColumnMapping {
  excelColumn: string;       // Original Excel header
  field: string | null;      // Mapped field name or null
  confidence: number;        // 0 to 1
  method: string;            // How it was detected
  sampleValues: unknown[];   // First N values from this column
  detectedFormat?: string;   // For dates: detected format
}

export interface DetectionResult {
  mappings: ColumnMapping[];
  unmappedFields: FieldDefinition[];
  overallConfidence: number;
  isQuickImportReady: boolean; // true if all required fields have confidence > 0.8
}

/**
 * Auto-detect column mappings from Excel data
 */
export function detectColumnMappings(
  headers: string[],
  rows: Record<string, unknown>[]
): DetectionResult {
  const mappings: ColumnMapping[] = [];
  const usedFields = new Set<string>();

  // Get sample values for each column
  const columnValues: Record<string, unknown[]> = {};
  for (const header of headers) {
    columnValues[header] = rows.slice(0, 15).map(row => row[header]).filter(v => v != null && v !== '');
  }

  // Phase 1: Exact and fuzzy header matching
  for (const header of headers) {
    let bestMatch: { field: string; confidence: number; method: string } | null = null;

    for (const fieldDef of FIELD_DEFINITIONS) {
      if (usedFields.has(fieldDef.field)) continue;

      for (const alias of fieldDef.aliases) {
        const result = fuzzyMatchHeader(header, alias);
        if (result.match && (!bestMatch || result.confidence > bestMatch.confidence)) {
          bestMatch = {
            field: fieldDef.field,
            confidence: result.confidence,
            method: result.method,
          };
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.5) {
      usedFields.add(bestMatch.field);
      const values = columnValues[header] || [];
      const fieldDef = FIELD_DEFINITIONS.find(f => f.field === bestMatch!.field);
      
      mappings.push({
        excelColumn: header,
        field: bestMatch.field,
        confidence: bestMatch.confidence,
        method: bestMatch.method,
        sampleValues: values.slice(0, 5),
        detectedFormat: fieldDef?.dataType === 'date' ? detectDateFormat(values) : undefined,
      });
    } else {
      mappings.push({
        excelColumn: header,
        field: null,
        confidence: 0,
        method: 'none',
        sampleValues: (columnValues[header] || []).slice(0, 5),
      });
    }
  }

  // Phase 2: Data-type based detection for unmapped columns
  const unmappedColumns = mappings.filter(m => m.field === null);
  
  for (const mapping of unmappedColumns) {
    const values = columnValues[mapping.excelColumn] || [];
    if (values.length === 0) continue;

    // Try to detect by data type
    for (const fieldDef of FIELD_DEFINITIONS) {
      if (usedFields.has(fieldDef.field)) continue;

      let typeMatch = false;
      let confidence = 0.4;

      switch (fieldDef.dataType) {
        case 'date':
          if (looksLikeDates(values)) {
            typeMatch = true;
            confidence = 0.5;
          }
          break;
        case 'number':
          if (looksLikeNumbers(values) && !looksLikeDates(values) && !looksLikePercentages(values)) {
            typeMatch = true;
            confidence = 0.4;
          }
          break;
        case 'percentage':
          if (looksLikePercentages(values)) {
            typeMatch = true;
            confidence = 0.5;
          }
          break;
        case 'name':
          if (looksLikeNames(values)) {
            typeMatch = true;
            confidence = 0.45;
          }
          break;
      }

      if (typeMatch) {
        mapping.field = fieldDef.field;
        mapping.confidence = confidence;
        mapping.method = 'data-type';
        if (fieldDef.dataType === 'date') {
          mapping.detectedFormat = detectDateFormat(values);
        }
        usedFields.add(fieldDef.field);
        break;
      }
    }
  }

  // Calculate unmapped required fields
  const unmappedFields = FIELD_DEFINITIONS.filter(f => !usedFields.has(f.field));

  // Calculate overall confidence
  const requiredFields = FIELD_DEFINITIONS.filter(f => f.required);
  const mappedRequired = requiredFields.filter(f => usedFields.has(f.field));
  const requiredConfidences = mappedRequired.map(f => {
    const mapping = mappings.find(m => m.field === f.field);
    return mapping?.confidence || 0;
  });
  
  const overallConfidence = requiredFields.length > 0
    ? (mappedRequired.length / requiredFields.length) * (requiredConfidences.length > 0 ? requiredConfidences.reduce((a, b) => a + b, 0) / requiredConfidences.length : 0)
    : 0;

  const isQuickImportReady = requiredFields.every(f => {
    const mapping = mappings.find(m => m.field === f.field);
    return mapping && mapping.confidence >= 0.8;
  });

  return {
    mappings,
    unmappedFields,
    overallConfidence,
    isQuickImportReady,
  };
}

/**
 * Detect the header row in raw sheet data
 */
export function detectHeaderRow(sheetData: unknown[][]): number {
  let bestRow = 0;
  let bestScore = 0;

  const rowsToCheck = Math.min(10, sheetData.length);
  
  for (let i = 0; i < rowsToCheck; i++) {
    const row = sheetData[i];
    if (!row) continue;

    let score = 0;
    let nonEmpty = 0;

    for (const cell of row) {
      if (cell == null || cell === '') continue;
      nonEmpty++;
      
      const str = String(cell).trim();
      // Headers are typically short strings without numbers
      if (typeof cell === 'string' && str.length > 0 && str.length < 40) {
        score += 2;
        // Bonus for known header words
        const norm = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const knownWords = ['proyecto', 'nombre', 'inicio', 'fin', 'asignado', 'dias', 'tipo', 'prioridad', 'sucursal', 'project', 'start', 'end', 'name', 'date', 'days', 'type'];
        if (knownWords.some(w => norm.includes(w))) {
          score += 5;
        }
      }
      // Penalize dates and large numbers in header row
      if (cell instanceof Date) score -= 2;
      if (typeof cell === 'number' && cell > 100) score -= 2;
    }

    // Bonus for having many non-empty cells
    score += nonEmpty * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  return bestRow;
}
