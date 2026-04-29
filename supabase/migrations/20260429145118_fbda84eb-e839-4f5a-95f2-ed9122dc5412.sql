create schema if not exists private;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
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

create or replace function private.is_admin_or_debugger(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.has_role(_user_id, 'admin') or private.has_role(_user_id, 'debugger');
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.is_admin_or_debugger(uuid) from public, anon, authenticated;
revoke all on function private.has_role(uuid, public.app_role) from public, anon;
revoke all on function private.is_admin_or_debugger(uuid) from public, anon;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;
grant execute on function private.is_admin_or_debugger(uuid) to authenticated;

drop policy if exists "users own or admin debug view" on public.users;
create policy "users own or admin debug view" on public.users for select to authenticated using (id = auth.uid() or private.is_admin_or_debugger(auth.uid()));

drop policy if exists "profiles own or admin debug view" on public.profiles;
create policy "profiles own or admin debug view" on public.profiles for select to authenticated using (id = auth.uid() or private.is_admin_or_debugger(auth.uid()));

drop policy if exists "user roles admin view" on public.user_roles;
create policy "user roles admin view" on public.user_roles for select to authenticated using (user_id = auth.uid() or private.has_role(auth.uid(), 'admin'));
drop policy if exists "user roles admin insert" on public.user_roles;
create policy "user roles admin insert" on public.user_roles for insert to authenticated with check (private.has_role(auth.uid(), 'admin'));
drop policy if exists "user roles admin update" on public.user_roles;
create policy "user roles admin update" on public.user_roles for update to authenticated using (private.has_role(auth.uid(), 'admin')) with check (private.has_role(auth.uid(), 'admin'));
drop policy if exists "user roles admin delete" on public.user_roles;
create policy "user roles admin delete" on public.user_roles for delete to authenticated using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "chat sessions own all" on public.chat_sessions;
create policy "chat sessions own all" on public.chat_sessions for all to authenticated using (user_id = auth.uid() or private.is_admin_or_debugger(auth.uid())) with check (user_id = auth.uid());
drop policy if exists "chat messages own all" on public.chat_messages;
create policy "chat messages own all" on public.chat_messages for all to authenticated using (exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and (s.user_id = auth.uid() or private.is_admin_or_debugger(auth.uid())))) with check (exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid()));

drop policy if exists "admin invites admin view" on public.admin_invites;
create policy "admin invites admin view" on public.admin_invites for select to authenticated using (private.has_role(auth.uid(), 'admin'));
drop policy if exists "admin invites admin write" on public.admin_invites;
create policy "admin invites admin write" on public.admin_invites for all to authenticated using (private.has_role(auth.uid(), 'admin')) with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "audit admin debug view" on public.admin_audit_log;
create policy "audit admin debug view" on public.admin_audit_log for select to authenticated using (private.is_admin_or_debugger(auth.uid()));
drop policy if exists "audit admin debug create" on public.admin_audit_log;
create policy "audit admin debug create" on public.admin_audit_log for insert to authenticated with check (private.is_admin_or_debugger(auth.uid()));

drop policy if exists "analytics admin debug view" on public.admin_analytics_events;
create policy "analytics admin debug view" on public.admin_analytics_events for select to authenticated using (user_id = auth.uid() or private.is_admin_or_debugger(auth.uid()));

drop policy if exists "echo own or admin debug view" on public.echo_logs;
create policy "echo own or admin debug view" on public.echo_logs for select to authenticated using (user_id = auth.uid() or private.is_admin_or_debugger(auth.uid()));
drop policy if exists "echo admin debug update" on public.echo_logs;
create policy "echo admin debug update" on public.echo_logs for update to authenticated using (private.is_admin_or_debugger(auth.uid())) with check (private.is_admin_or_debugger(auth.uid()));