import { supabase } from '@/lib/supabaseClient';

export interface TaskComment {
  id: string;
  board_id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export async function listTaskComments(boardId: string, taskId: string): Promise<TaskComment[]> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { data, error } = await supabase
    .from('task_comments')
    .select('id,board_id,task_id,user_id,body,created_at')
    .eq('board_id', boardId)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as TaskComment[];
}

export async function addTaskComment(input: {
  boardId: string;
  taskId: string;
  userId: string;
  body: string;
}): Promise<void> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const text = input.body.trim();
  if (!text) return;
  const { error } = await supabase.from('task_comments').insert({
    board_id: input.boardId,
    task_id: input.taskId,
    user_id: input.userId,
    body: text,
  });
  if (error) throw error;
}

export async function deleteTaskComment(commentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no esta configurado');
  const { error } = await supabase
    .from('task_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
}
