import type { Project } from '@/lib/types';
import { computeProjectFields } from '@/lib/workloadEngine';
import type { AppConfig } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';
import { normalizeBranchList } from '@/lib/branchUtils';

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
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(year, month, day, 12, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(value: Date | null): string | null {
  if (!value) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseStoredBranch(value: string): string | string[] {
  const clean = (value || '').trim();
  if (!clean) return [];
  if (clean.startsWith('[')) {
    try {
      const parsed = JSON.parse(clean);
      return normalizeBranchList(parsed);
    } catch {
      return [clean];
    }
  }
  return [clean];
}

function encodeStoredBranch(value: Project['branch']): string {
  const list = normalizeBranchList(value);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return JSON.stringify(list);
}

export function mapRowToProject(row: CloudTaskRow, config: AppConfig): Project {
  return computeProjectFields(
    {
      id: row.id,
      name: row.name,
      branch: parseStoredBranch(row.branch),
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
    branch: encodeStoredBranch(project.branch),
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
  if (!supabase) throw new Error('Supabase no esta configurado');

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
  if (!supabase) throw new Error('Supabase no esta configurado');

  const indexById = new Map(projectOrder.map((id, idx) => [id, idx]));
  const rows = projects
    .map((p) => mapProjectToRow(p, boardId, indexById.get(p.id) ?? Number.MAX_SAFE_INTEGER))
    .sort((a, b) => a.sort_order - b.sort_order);

  // Keep cloud state in sync with local state, including deletions.
  const { data: existing, error: existingError } = await supabase
    .from('tasks')
    .select('id')
    .eq('board_id', boardId);
  if (existingError) throw existingError;

  const localIds = new Set(rows.map((r) => r.id));
  const idsToDelete = (existing || [])
    .map((r) => r.id as string)
    .filter((id) => !localIds.has(id));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('board_id', boardId)
      .in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }

  if (rows.length > 0) {
    // Phase 1: upsert all rows without hierarchy links to avoid transient FK failures.
    const rowsWithoutParent = rows.map((row) => ({ ...row, parent_id: null }));
    const { error: upsertBaseError } = await supabase.from('tasks').upsert(rowsWithoutParent, { onConflict: 'id' });
    if (upsertBaseError) throw upsertBaseError;

    // Phase 2: apply hierarchy links once every referenced parent row exists.
    const rowsWithParent = rows.filter((row) => !!row.parent_id);
    if (rowsWithParent.length > 0) {
      const { error: upsertHierarchyError } = await supabase.from('tasks').upsert(rowsWithParent, { onConflict: 'id' });
      if (upsertHierarchyError) throw upsertHierarchyError;
    }
  }
}
