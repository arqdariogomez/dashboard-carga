import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export async function ensureDefaultWorkspaceBoard(user: User): Promise<string> {
  if (!supabase) throw new Error('Supabase no está configurado');

  await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  const { data: memberships, error: membershipsError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (membershipsError) throw membershipsError;

  let workspaceId = memberships?.[0]?.workspace_id as string | undefined;

  if (!workspaceId) {
    workspaceId = crypto.randomUUID();
    const { error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        id: workspaceId,
        name: 'Mi workspace',
        created_by: user.id,
      });

    if (workspaceError) throw workspaceError;

    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: 'owner',
    });
    if (memberError) throw memberError;
  }

  const { data: existingBoard, error: boardLookupError } = await supabase
    .from('boards')
    .select('id')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (boardLookupError) throw boardLookupError;
  if (existingBoard?.id) return existingBoard.id;

  const boardId = crypto.randomUUID();
  const { error: boardError } = await supabase
    .from('boards')
    .insert({
      id: boardId,
      workspace_id: workspaceId,
      name: 'Tablero principal',
      created_by: user.id,
    });

  if (boardError) throw boardError;
  return boardId;
}
