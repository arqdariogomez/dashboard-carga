create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  sort_order int not null default 0,
  parent_id text null,
  is_expanded boolean not null default true,
  name text not null,
  branch text not null default '',
  start_date date,
  end_date date,
  assignees text[] not null default '{}',
  days_required numeric not null default 0,
  priority int not null default 0,
  type text not null default 'Proyecto' check (type in ('Proyecto', 'Lanzamiento', 'En radar')),
  blocked_by text,
  blocks_to text,
  reported_load numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_parent_fk
    foreign key (parent_id)
    references public.tasks(id)
    on delete set null
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_boards_workspace on public.boards(workspace_id);
create index if not exists idx_tasks_board on public.tasks(board_id);
create index if not exists idx_tasks_parent on public.tasks(parent_id);
create index if not exists idx_tasks_board_sort on public.tasks(board_id, sort_order);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated" on public.workspaces
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "workspaces_update_owner_editor" on public.workspaces;
create policy "workspaces_update_owner_editor" on public.workspaces
for update to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'editor')
  )
);

drop policy if exists "workspace_members_select_member" on public.workspace_members;
create policy "workspace_members_select_member" on public.workspace_members
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace_members_insert_owner_bootstrap" on public.workspace_members;
create policy "workspace_members_insert_owner_bootstrap" on public.workspace_members
for insert to authenticated
with check (
  user_id = auth.uid()
  and role = 'owner'
  and exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.created_by = auth.uid()
  )
);

drop policy if exists "workspace_members_insert_owner_manage" on public.workspace_members;
create policy "workspace_members_insert_owner_manage" on public.workspace_members
for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists "workspace_members_update_owner_manage" on public.workspace_members;
create policy "workspace_members_update_owner_manage" on public.workspace_members
for update to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists "workspace_members_delete_owner_manage" on public.workspace_members;
create policy "workspace_members_delete_owner_manage" on public.workspace_members
for delete to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists "boards_select_member" on public.boards;
create policy "boards_select_member" on public.boards
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = boards.workspace_id and wm.user_id = auth.uid()
  )
);

drop policy if exists "boards_insert_owner_editor" on public.boards;
create policy "boards_insert_owner_editor" on public.boards
for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = boards.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'editor')
  )
);

drop policy if exists "boards_update_owner_editor" on public.boards;
create policy "boards_update_owner_editor" on public.boards
for update to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = boards.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = boards.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'editor')
  )
);

drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member" on public.tasks
for select to authenticated
using (
  exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id and wm.user_id = auth.uid()
  )
);

drop policy if exists "tasks_insert_owner_editor" on public.tasks;
create policy "tasks_insert_owner_editor" on public.tasks
for insert to authenticated
with check (
  exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor')
  )
);

drop policy if exists "tasks_update_owner_editor" on public.tasks;
create policy "tasks_update_owner_editor" on public.tasks
for update to authenticated
using (
  exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor')
  )
);

drop policy if exists "tasks_delete_owner_editor" on public.tasks;
create policy "tasks_delete_owner_editor" on public.tasks
for delete to authenticated
using (
  exists (
    select 1
    from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = tasks.board_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor')
  )
);
