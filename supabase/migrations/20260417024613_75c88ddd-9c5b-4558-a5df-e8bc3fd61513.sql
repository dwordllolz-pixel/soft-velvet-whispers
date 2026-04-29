-- Persistent relationship per (user, character)
create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null,
  message_count integer not null default 0,
  intimacy_score integer not null default 0,
  level text not null default 'stranger',
  last_emotion text,
  last_intensity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, character_id)
);

alter table public.relationships enable row level security;

drop policy if exists "Users can view own relationships" on public.relationships;
create policy "Users can view own relationships"
  on public.relationships for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own relationships" on public.relationships;
create policy "Users can insert own relationships"
  on public.relationships for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own relationships" on public.relationships;
create policy "Users can update own relationships"
  on public.relationships for update
  to authenticated
  using (auth.uid() = user_id);

create index if not exists relationships_user_character_idx
  on public.relationships (user_id, character_id);

alter table public.chat_messages
  add column if not exists emotion text,
  add column if not exists intensity integer;
