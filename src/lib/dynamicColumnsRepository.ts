import type { DynamicCellValue, DynamicColumn, DynamicColumnType } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';

interface BoardColumnRow {
  id: string;
  board_id: string;
  key: string;
  name: string;
  type: DynamicColumnType;
  position: number;
  config: Record<string, unknown> | null;
}

interface TaskColumnValueRow {
  task_id: string;
  column_id: string;
  value_json: unknown;
}

function mapBoardColumnRow(row: BoardColumnRow): DynamicColumn {
  return {
    id: row.id,
    boardId: row.board_id,
    key: row.key,
    name: row.name,
    type: row.type,
    position: row.position,
    config: row.config || {},
  };
}

export async function listBoardColumns(boardId: string): Promise<DynamicColumn[]> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { data, error } = await supabase
    .from('board_columns')
    .select('id,board_id,key,name,type,position,config')
    .eq('board_id', boardId)
    .order('position', { ascending: true });
  if (error) throw error;
  return ((data || []) as BoardColumnRow[]).map(mapBoardColumnRow);
}

export async function createBoardColumn(input: {
  boardId: string;
  key: string;
  name: string;
  type: DynamicColumnType;
  position: number;
  createdBy: string;
  config?: Record<string, unknown>;
}): Promise<DynamicColumn> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { data, error } = await supabase
    .from('board_columns')
    .insert({
      board_id: input.boardId,
      key: input.key,
      name: input.name,
      type: input.type,
      position: input.position,
      created_by: input.createdBy,
      config: input.config || {},
    })
    .select('id,board_id,key,name,type,position,config')
    .single();
  if (error) throw error;
  return mapBoardColumnRow(data as BoardColumnRow);
}

export async function updateBoardColumn(
  columnId: string,
  updates: Partial<Pick<DynamicColumn, 'name' | 'position' | 'config'>>
): Promise<void> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const payload: Record<string, unknown> = {};
  if (typeof updates.name === 'string') payload.name = updates.name;
  if (typeof updates.position === 'number') payload.position = updates.position;
  if (updates.config) payload.config = updates.config;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from('board_columns').update(payload).eq('id', columnId);
  if (error) throw error;
}

export async function deleteBoardColumn(columnId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { error } = await supabase.from('board_columns').delete().eq('id', columnId);
  if (error) throw error;
}

export async function listTaskColumnValues(
  boardId: string
): Promise<Map<string, Record<string, DynamicCellValue>>> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { data, error } = await supabase
    .from('task_column_values')
    .select('task_id,column_id,value_json')
    .eq('board_id', boardId);
  if (error) throw error;

  const result = new Map<string, Record<string, DynamicCellValue>>();
  ((data || []) as TaskColumnValueRow[]).forEach((row) => {
    const taskValues = result.get(row.task_id) || {};
    taskValues[row.column_id] = row.value_json as DynamicCellValue;
    result.set(row.task_id, taskValues);
  });
  return result;
}

export async function upsertTaskColumnValue(input: {
  boardId: string;
  taskId: string;
  columnId: string;
  value: DynamicCellValue;
  userId: string;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { error } = await supabase.from('task_column_values').upsert(
    {
      board_id: input.boardId,
      task_id: input.taskId,
      column_id: input.columnId,
      value_json: input.value,
      updated_by: input.userId,
    },
    { onConflict: 'task_id,column_id' }
  );
  if (error) throw error;
}

export async function deleteTaskColumnValue(taskId: string, columnId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { error } = await supabase
    .from('task_column_values')
    .delete()
    .eq('task_id', taskId)
    .eq('column_id', columnId);
  if (error) throw error;
}
