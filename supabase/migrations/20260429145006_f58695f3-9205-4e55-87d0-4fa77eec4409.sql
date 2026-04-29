do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'debugger', 'user');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  display_name text,
  avatar_url text,
  debug_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_admin_or_debugger(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin') or public.has_role(_user_id, 'debugger');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key,
  profile_data jsonb not null default '{}'::jsonb,
  last_active_character text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null,
  asmr_type text not null default '__character__',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  emotion text,
  intensity integer,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  description text,
  role public.app_role not null default 'debugger',
  max_uses integer not null default 1,
  uses integer not null default 0,
  expires_at timestamptz,
  created_by uuid,
  redeemed_by uuid[] not null default '{}',
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_invites enable row level security;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_user_id uuid,
  target_character_id text,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create table if not exists public.admin_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_name text not null,
  character_id text,
  mode text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_analytics_events enable row level security;

create table if not exists public.echo_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  character_id text,
  mode text,
  message text not null,
  echo_type text not null default 'info',
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.echo_logs enable row level security;

create index if not exists idx_users_updated_at on public.users(updated_at desc);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_chat_sessions_user_character on public.chat_sessions(user_id, character_id);
create index if not exists idx_chat_messages_session_created on public.chat_messages(session_id, created_at);
create index if not exists idx_admin_invites_code_hash on public.admin_invites(code_hash);
create index if not exists idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_analytics_events_created_at on public.admin_analytics_events(created_at desc);
create index if not exists idx_echo_logs_created_at on public.echo_logs(created_at desc);
create index if not exists idx_echo_logs_user_character on public.echo_logs(user_id, character_id);

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at before update on public.users for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists chat_sessions_touch_updated_at on public.chat_sessions;
create trigger chat_sessions_touch_updated_at before update on public.chat_sessions for each row execute function public.touch_updated_at();
drop trigger if exists admin_invites_touch_updated_at on public.admin_invites;
create trigger admin_invites_touch_updated_at before update on public.admin_invites for each row execute function public.touch_updated_at();

drop policy if exists "users own or admin debug view" on public.users;
create policy "users own or admin debug view" on public.users for select to authenticated using (id = auth.uid() or public.is_admin_or_debugger(auth.uid()));
drop policy if exists "users own insert" on public.users;
create policy "users own insert" on public.users for insert to authenticated with check (id = auth.uid());
drop policy if exists "users own update" on public.users;
create policy "users own update" on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles own or admin debug view" on public.profiles;
create policy "profiles own or admin debug view" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin_or_debugger(auth.uid()));
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "user roles admin view" on public.user_roles;
create policy "user roles admin view" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "user roles admin insert" on public.user_roles;
create policy "user roles admin insert" on public.user_roles for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "user roles admin update" on public.user_roles;
create policy "user roles admin update" on public.user_roles for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "user roles admin delete" on public.user_roles;
create policy "user roles admin delete" on public.user_roles for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "chat sessions own all" on public.chat_sessions;
create policy "chat sessions own all" on public.chat_sessions for all to authenticated using (user_id = auth.uid() or public.is_admin_or_debugger(auth.uid())) with check (user_id = auth.uid());
drop policy if exists "chat messages own all" on public.chat_messages;
create policy "chat messages own all" on public.chat_messages for all to authenticated using (exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and (s.user_id = auth.uid() or public.is_admin_or_debugger(auth.uid())))) with check (exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid()));

drop policy if exists "admin invites admin view" on public.admin_invites;
create policy "admin invites admin view" on public.admin_invites for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin invites admin write" on public.admin_invites;
create policy "admin invites admin write" on public.admin_invites for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "audit admin debug view" on public.admin_audit_log;
create policy "audit admin debug view" on public.admin_audit_log for select to authenticated using (public.is_admin_or_debugger(auth.uid()));
drop policy if exists "audit admin debug create" on public.admin_audit_log;
create policy "audit admin debug create" on public.admin_audit_log for insert to authenticated with check (public.is_admin_or_debugger(auth.uid()));

drop policy if exists "analytics own create" on public.admin_analytics_events;
create policy "analytics own create" on public.admin_analytics_events for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "analytics admin debug view" on public.admin_analytics_events;
create policy "analytics admin debug view" on public.admin_analytics_events for select to authenticated using (user_id = auth.uid() or public.is_admin_or_debugger(auth.uid()));

drop policy if exists "echo own create" on public.echo_logs;
create policy "echo own create" on public.echo_logs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "echo own or admin debug view" on public.echo_logs;
create policy "echo own or admin debug view" on public.echo_logs for select to authenticated using (user_id = auth.uid() or public.is_admin_or_debugger(auth.uid()));
drop policy if exists "echo admin debug update" on public.echo_logs;
create policy "echo admin debug update" on public.echo_logs for update to authenticated using (public.is_admin_or_debugger(auth.uid())) with check (public.is_admin_or_debugger(auth.uid()));

insert into public.admin_invites (code_hash, description, role, max_uses, expires_at)
values ('a919b168e9e8f1f2a9d44e942fea6d34613c7b497c80ed10612e681266503dfa', 'Initial admin/debug invite', 'admin', 1, now() + interval '30 days')
on conflict (code_hash) do nothing;

insert into public.profiles (id)
select id from public.users
on conflict (id) do nothing;