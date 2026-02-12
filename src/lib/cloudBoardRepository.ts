import type { Project } from '@/lib/types';
import { computeProjectFields } from '@/lib/workloadEngine';
import type { AppConfig } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';

export interface CloudTaskRow {
  id: string;
  board_id: string;
  sort_order: number;
  parent_id: string | null;
  is_expanded: boolean;
  name: string;
  branch: string;
  start_date: string | null;
  end_date: string | null;
  assignees: string[];
  days_required: number;
  priority: number;
  type: Project['type'];
  blocked_by: string | null;
  blocks_to: string | null;
  reported_load: number | null;
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toISODate(value: Date | null): string | null {
  if (!value) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mapRowToProject(row: CloudTaskRow, config: AppConfig): Project {
  return computeProjectFields(
    {
      id: row.id,
      name: row.name,
      branch: row.branch,
      startDate: toDate(row.start_date),
      endDate: toDate(row.end_date),
      assignees: row.assignees || [],
      daysRequired: Number(row.days_required || 0),
      priority: row.priority ?? 0,
      type: row.type || 'Proyecto',
      blockedBy: row.blocked_by,
      blocksTo: row.blocks_to,
      reportedLoad: row.reported_load,
      parentId: row.parent_id,
      isExpanded: row.is_expanded,
    },
    config
  );
}

export function mapProjectToRow(
  project: Project,
  boardId: string,
  sortOrder: number
): Omit<CloudTaskRow, 'board_id'> & { board_id: string } {
  return {
    id: project.id,
    board_id: boardId,
    sort_order: sortOrder,
    parent_id: project.parentId ?? null,
    is_expanded: project.isExpanded ?? true,
    name: project.name,
    branch: project.branch || '',
    start_date: toISODate(project.startDate),
    end_date: toISODate(project.endDate),
    assignees: project.assignees || [],
    days_required: Number(project.daysRequired || 0),
    priority: Number(project.priority || 0),
    type: project.type,
    blocked_by: project.blockedBy ?? null,
    blocks_to: project.blocksTo ?? null,
    reported_load: project.reportedLoad ?? null,
  };
}

export async function loadBoardProjects(boardId: string, config: AppConfig) {
  if (!supabase) throw new Error('Supabase no está configurado');

  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, board_id, sort_order, parent_id, is_expanded, name, branch, start_date, end_date, assignees, days_required, priority, type, blocked_by, blocks_to, reported_load'
    )
    .eq('board_id', boardId)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  const rows = (data || []) as CloudTaskRow[];
  const projects = rows.map((r) => mapRowToProject(r, config));
  const projectOrder = rows.map((r) => r.id);
  return { projects, projectOrder };
}

export async function saveBoardProjects(boardId: string, projects: Project[], projectOrder: string[]) {
  if (!supabase) throw new Error('Supabase no está configurado');

  const indexById = new Map(projectOrder.map((id, idx) => [id, idx]));
  const rows = projects
    .map((p) => mapProjectToRow(p, boardId, indexById.get(p.id) ?? Number.MAX_SAFE_INTEGER))
    .sort((a, b) => a.sort_order - b.sort_order);

  // Current phase: idempotent full upsert. Good enough for first cloud sync.
  const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}
