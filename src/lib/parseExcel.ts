import * as XLSX from 'xlsx';
import type { Project, AppConfig } from './types';
import { computeProjectFields } from './workloadEngine';

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const HEADER_MAP: Record<string, string> = {
  'proyecto': 'name',
  'nombre': 'name',
  'nombre del proyecto': 'name',
  'sucursal': 'branch',
  'sede': 'branch',
  'ubicacion': 'branch',
  'inicio': 'startDate',
  'fecha inicio': 'startDate',
  'fecha de inicio': 'startDate',
  'start': 'startDate',
  'fin': 'endDate',
  'fecha fin': 'endDate',
  'fecha de fin': 'endDate',
  'end': 'endDate',
  'asignado': 'assignee',
  'responsable': 'assignee',
  'persona': 'assignee',
  'asignado a': 'assignee',
  'dias requeridos': 'daysRequired',
  'dias': 'daysRequired',
  'dias necesarios': 'daysRequired',
  'days': 'daysRequired',
  'prioridad': 'priority',
  'priority': 'priority',
  'tipo': 'type',
  'type': 'type',
  'bloqueado por': 'blockedBy',
  'blocked by': 'blockedBy',
  'bloquea a': 'blocksTo',
  'blocks to': 'blocksTo',
  'blocks': 'blocksTo',
  'carga segun responsable': 'reportedLoad',
  'carga responsable': 'reportedLoad',
  'reported load': 'reportedLoad',
};

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return new Date(date.y, date.m - 1, date.d);
    return null;
  }
  if (typeof value === 'string') {
    // Try dd/mm/yyyy
    const parts = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (parts) {
      const day = parseInt(parts[1]);
      const month = parseInt(parts[2]) - 1;
      let year = parseInt(parts[3]);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
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
    const num = parseInt(value);
    if (!isNaN(num)) return Math.max(1, Math.min(5, num));
  }
  return 1;
}

function parseType(value: unknown): 'Proyecto' | 'Lanzamiento' | 'En radar' {
  if (!value) return 'Proyecto';
  const str = normalizeHeader(String(value));
  if (str.includes('lanzamiento') || str.includes('launch')) return 'Lanzamiento';
  if (str.includes('radar') || str.includes('en radar')) return 'En radar';
  return 'Proyecto';
}

function parsePercentage(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') {
    if (value > 1) return value / 100;
    return value;
  }
  if (typeof value === 'string') {
    const num = parseFloat(value.replace('%', '').trim());
    if (!isNaN(num)) return num > 1 ? num / 100 : num;
  }
  return null;
}

function extractCellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => extractCellText(v)).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const anyVal = value as Record<string, any>;
    if (Array.isArray(anyVal.richText)) {
      return anyVal.richText.map((seg: any) => seg.text ?? seg.t ?? String(seg)).join('');
    }
    if (typeof anyVal.t === 'string') return anyVal.t;
    if (typeof anyVal.text === 'string') return anyVal.text;
    if ('v' in anyVal && (typeof anyVal.v === 'string' || typeof anyVal.v === 'number')) return String(anyVal.v);
    try {
      return JSON.stringify(anyVal);
    } catch {
      return String(anyVal);
    }
  }
  return null;
}

export function parseExcelFile(buffer: ArrayBuffer, config: AppConfig): Project[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });

  if (rawData.length === 0) return [];

  // Map headers
  const firstRow = rawData[0];
  const columnMapping: Record<string, string> = {};
  Object.keys(firstRow).forEach((excelHeader) => {
    const normalized = normalizeHeader(excelHeader);
    const mapped = HEADER_MAP[normalized];
    if (mapped) {
      columnMapping[excelHeader] = mapped;
    }
  });

  const projects: Project[] = rawData.map((row, index) => {
    const mapped: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      const field = columnMapping[key];
      if (field) {
        const cleaned = extractCellText(value);
        mapped[field] = cleaned ?? value;
      }
    });

    const rawProject = {
      id: `proj-${index}-${Date.now()}`,
      name: String(mapped.name || '').trim(),
      branch: String(mapped.branch || '').trim(),
      startDate: parseExcelDate(mapped.startDate),
      endDate: parseExcelDate(mapped.endDate),
      assignee: mapped.assignee ? String(mapped.assignee).trim() : null,
      daysRequired: Number(mapped.daysRequired) || 0,
      priority: parsePriority(mapped.priority),
      type: parseType(mapped.type),
      blockedBy: mapped.blockedBy ? String(mapped.blockedBy).trim() : null,
      blocksTo: mapped.blocksTo ? String(mapped.blocksTo).trim() : null,
      reportedLoad: parsePercentage(mapped.reportedLoad),
    };

    return computeProjectFields(rawProject, config);
  }).filter((p) => p.name.length > 0);

  return projects;
}

export function createProjectsFromSample(sampleData: Array<Record<string, unknown>>, config: AppConfig): Project[] {
  return sampleData.map((item, index) => {
    const rawProject = {
      id: `sample-${index}`,
      name: String(item.name || ''),
      branch: String(item.branch || ''),
      startDate: item.startDate as Date | null,
      endDate: item.endDate as Date | null,
      assignee: (item.assignee as string) || null,
      daysRequired: Number(item.daysRequired) || 0,
      priority: Number(item.priority) || 1,
      type: (item.type as 'Proyecto' | 'Lanzamiento' | 'En radar') || 'Proyecto',
      blockedBy: (item.blockedBy as string) || null,
      blocksTo: (item.blocksTo as string) || null,
      reportedLoad: null,
    };
    return computeProjectFields(rawProject, config);
  });
}
