import { supabase } from '@/lib/supabaseClient';
const MAX_VERSIONS_PER_BOARD = 60;

export type BoardVersionRow = {
  id: string;
  board_id: string;
  created_at: string;
  created_by: string | null;
  created_by_label: string;
  reason: string;
  project_count: number;
  changed_projects: number;
  fingerprint: string;
  payload: unknown;
};

export async function loadBoardVersionRows(boardId: string): Promise<BoardVersionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('board_versions')
    .select('id,board_id,created_at,created_by,created_by_label,reason,project_count,changed_projects,fingerprint,payload')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data || []) as BoardVersionRow[];
}

export async function insertBoardVersionRow(input: {
  boardId: string;
  createdBy: string | null;
  createdByLabel: string;
  reason: string;
  projectCount: number;
  changedProjects: number;
  fingerprint: string;
  payload: unknown;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('board_versions').insert({
    board_id: input.boardId,
    created_by: input.createdBy,
    created_by_label: input.createdByLabel,
    reason: input.reason,
    project_count: input.projectCount,
    changed_projects: input.changedProjects,
    fingerprint: input.fingerprint,
    payload: input.payload,
  });
  if (error) throw error;

  // Keep cloud history bounded per board for predictable performance/storage.
  const { data: staleRows, error: staleQueryError } = await supabase
    .from('board_versions')
    .select('id')
    .eq('board_id', input.boardId)
    .order('created_at', { ascending: false })
    .range(MAX_VERSIONS_PER_BOARD, MAX_VERSIONS_PER_BOARD + 400);
  if (staleQueryError) return;
  const staleIds = (staleRows || []).map((r) => r.id as string).filter(Boolean);
  if (staleIds.length === 0) return;
  await supabase.from('board_versions').delete().eq('board_id', input.boardId).in('id', staleIds);
}
