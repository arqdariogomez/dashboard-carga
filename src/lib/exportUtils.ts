import * as XLSX from 'xlsx';
import type { Project } from './types';
import { format } from 'date-fns';
import { buildHierarchy } from './hierarchyEngine';
import { branchLabel } from './branchUtils';

function formatDate(d: Date | null): string {
  if (!d) return '';
  return format(d, 'dd/MM/yyyy');
}

function isMilestoneProject(project: Project): boolean {
  if (!project.startDate || !project.endDate) return false;
  const sameDay =
    project.startDate.getFullYear() === project.endDate.getFullYear() &&
    project.startDate.getMonth() === project.endDate.getMonth() &&
    project.startDate.getDate() === project.endDate.getDate();
  return sameDay && Number(project.daysRequired || 0) <= 0;
}

function parseDependencyIdsForExport(project: Project, allProjects: Project[]): string[] {
  const raw = (project.blocksTo || '').trim();
  if (!raw) return [];

  const byId = new Map(allProjects.map((p) => [p.id, p]));
  const byName = new Map(allProjects.map((p) => [(p.name || '').trim().toLowerCase(), p]));

  const parseTokens = (tokens: string[]) => {
    const out: string[] = [];
    tokens.forEach((token) => {
      const clean = token.trim();
      if (!clean) return;
      if (byId.has(clean)) {
        out.push(clean);
        return;
      }
      const byNameHit = byName.get(clean.toLowerCase());
      if (byNameHit) out.push(byNameHit.id);
    });
    return Array.from(new Set(out));
  };

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseTokens(parsed.map((x) => String(x)));
    } catch {
      // fallback to delimited parsing
    }
  }

  return parseTokens(raw.split(/[|,]/g));
}

function dependencyNamesForExport(project: Project, allProjects: Project[]): string {
  const byId = new Map(allProjects.map((p) => [p.id, p]));
  return parseDependencyIdsForExport(project, allProjects)
    .map((id) => byId.get(id)?.name || '')
    .filter(Boolean)
    .join(' / ');
}

function projectToRow(p: Project, allProjects: Project[]) {
  return {
    'Proyecto': p.name,
    'Sucursal': branchLabel(p.branch),
    'Inicio': formatDate(p.startDate),
    'Fin': formatDate(p.endDate),
    'Asignado': p.assignees.join(' / ') || '',
    'Dias requeridos': p.daysRequired,
    'Prioridad': p.priority,
    'Tipo': p.type,
    'Bloqueado por': p.blockedBy || '',
    'Bloquea a': p.blocksTo || '',
    'Depende de': dependencyNamesForExport(p, allProjects),
    'Es hito': isMilestoneProject(p) ? 'Si' : '',
    'Dias asignados': p.assignedDays || '',
    'Balance': p.balanceDays || '',
    'Carga diaria %': p.dailyLoad ? `${Math.round(p.dailyLoad * 100)}%` : '',
    'Horas totales': p.totalHours || '',
  };
}

export function exportToExcel(projects: Project[], fileName?: string) {
  const roots = buildHierarchy(projects);
  const rowsWithLevel: { row: ReturnType<typeof projectToRow>; level: number }[] = [];

  const traverse = (node: any, level: number) => {
    rowsWithLevel.push({ row: projectToRow(node, projects), level });
    (node.children || []).forEach((c: any) => traverse(c, level + 1));
  };

  roots.forEach((r) => traverse(r, 0));

  const rows = rowsWithLevel.map((r) => r.row);
  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 30 }, // Proyecto
    { wch: 15 }, // Sucursal
    { wch: 12 }, // Inicio
    { wch: 12 }, // Fin
    { wch: 15 }, // Asignado
    { wch: 15 }, // Dias requeridos
    { wch: 10 }, // Prioridad
    { wch: 14 }, // Tipo
    { wch: 25 }, // Bloqueado por
    { wch: 25 }, // Bloquea a
    { wch: 32 }, // Depende de
    { wch: 10 }, // Es hito
    { wch: 15 }, // Dias asignados
    { wch: 10 }, // Balance
    { wch: 14 }, // Carga diaria
    { wch: 14 }, // Horas totales
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos');

  try {
    for (let i = 0; i < rowsWithLevel.length; i++) {
      const excelRow = i + 2;
      const cellRef = `A${excelRow}`;
      const level = rowsWithLevel[i].level || 0;
      const cell = ws[cellRef];
      if (cell) {
        // @ts-ignore - sheetjs style
        cell.s = cell.s || {};
        // @ts-ignore
        cell.s.alignment = { ...(cell.s.alignment || {}), indent: level };
        const nbsp = '\u00A0'.repeat(level * 3);
        cell.v = `${nbsp}${cell.v}`;
      }
    }
  } catch {
    // ignore styling errors
  }

  const outputName = fileName
    ? fileName.replace(/\.xlsx?$/i, '') + '_export.xlsx'
    : 'workload_export.xlsx';

  XLSX.writeFile(wb, outputName);
}

export function copyAsCSV(projects: Project[]) {
  const headers = [
    'Proyecto', 'Sucursal', 'Inicio', 'Fin', 'Asignado',
    'Dias requeridos', 'Prioridad', 'Tipo', 'Bloqueado por', 'Bloquea a',
    'Depende de', 'Es hito', 'Dias asignados', 'Balance', 'Carga diaria %', 'Horas totales',
  ];

  const rows = projects.map((p) => [
    p.name,
    branchLabel(p.branch),
    formatDate(p.startDate),
    formatDate(p.endDate),
    p.assignees.join(' / ') || '',
    String(p.daysRequired),
    String(p.priority),
    p.type,
    p.blockedBy || '',
    p.blocksTo || '',
    dependencyNamesForExport(p, projects),
    isMilestoneProject(p) ? 'Si' : '',
    String(p.assignedDays || ''),
    String(p.balanceDays || ''),
    p.dailyLoad ? `${Math.round(p.dailyLoad * 100)}%` : '',
    String(p.totalHours || ''),
  ]);

  const csv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');

  navigator.clipboard.writeText(csv).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = csv;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });

  return csv;
}
