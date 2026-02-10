import * as XLSX from 'xlsx';
import type { Project } from './types';
import { format } from 'date-fns';
import { buildHierarchy, calculateIndentLevels } from './hierarchyEngine';

function formatDate(d: Date | null): string {
  if (!d) return '';
  return format(d, 'dd/MM/yyyy');
}

function projectToRow(p: Project) {
  return {
    'Proyecto': p.name,
    'Sucursal': p.branch,
    'Inicio': formatDate(p.startDate),
    'Fin': formatDate(p.endDate),
    'Asignado': p.assignees.join(' / ') || '',
    'Días requeridos': p.daysRequired,
    'Prioridad': p.priority,
    'Tipo': p.type,
    'Bloqueado por': p.blockedBy || '',
    'Bloquea a': p.blocksTo || '',
    'Días asignados': p.assignedDays || '',
    'Balance': p.balanceDays || '',
    'Carga diaria %': p.dailyLoad ? `${Math.round(p.dailyLoad * 100)}%` : '',
    'Horas totales': p.totalHours || '',
  };
}

export function exportToExcel(projects: Project[], fileName?: string) {
  // Build hierarchical order for export
  const roots = buildHierarchy(projects);

  const rowsWithLevel: { row: ReturnType<typeof projectToRow>; level: number }[] = [];

  const traverse = (node: any, level: number) => {
    rowsWithLevel.push({ row: projectToRow(node), level });
    (node.children || []).forEach((c: any) => traverse(c, level + 1));
  };

  roots.forEach(r => traverse(r, 0));

  const rows = rowsWithLevel.map(r => r.row);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 30 }, // Proyecto
    { wch: 15 }, // Sucursal
    { wch: 12 }, // Inicio
    { wch: 12 }, // Fin
    { wch: 15 }, // Asignado
    { wch: 15 }, // Días requeridos
    { wch: 10 }, // Prioridad
    { wch: 14 }, // Tipo
    { wch: 25 }, // Bloqueado por
    { wch: 25 }, // Bloquea a
    { wch: 15 }, // Días asignados
    { wch: 10 }, // Balance
    { wch: 14 }, // Carga diaria
    { wch: 14 }, // Horas totales
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos');

  // Apply indent formatting to first column (Proyecto)
  try {
    for (let i = 0; i < rowsWithLevel.length; i++) {
      const excelRow = i + 2; // header is row 1
      const cellRef = `A${excelRow}`;
      const level = rowsWithLevel[i].level || 0;
      const cell = ws[cellRef];
      if (cell) {
        // set alignment indent (may not be supported by all readers)
        // @ts-ignore - sheetjs style
        cell.s = cell.s || {};
        // @ts-ignore
        cell.s.alignment = { ...(cell.s.alignment || {}), indent: level };
        // Fallback: prepend a few NBSPs to visually indent if styles not supported
        const nbsp = '\u00A0'.repeat(level * 3);
        cell.v = `${nbsp}${cell.v}`;
      }
    }
  } catch (e) {
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
    'Días requeridos', 'Prioridad', 'Tipo', 'Bloqueado por', 'Bloquea a',
    'Días asignados', 'Balance', 'Carga diaria %', 'Horas totales',
  ];

  const rows = projects.map(p => [
    p.name,
    p.branch,
    formatDate(p.startDate),
    formatDate(p.endDate),
    p.assignees.join(' / ') || '',
    String(p.daysRequired),
    String(p.priority),
    p.type,
    p.blockedBy || '',
    p.blocksTo || '',
    String(p.assignedDays || ''),
    String(p.balanceDays || ''),
    p.dailyLoad ? `${Math.round(p.dailyLoad * 100)}%` : '',
    String(p.totalHours || ''),
  ]);

  const csv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');

  navigator.clipboard.writeText(csv).then(() => {
    // success
  }).catch(() => {
    // fallback: create a temporary textarea
    const ta = document.createElement('textarea');
    ta.value = csv;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });

  return csv;
}
