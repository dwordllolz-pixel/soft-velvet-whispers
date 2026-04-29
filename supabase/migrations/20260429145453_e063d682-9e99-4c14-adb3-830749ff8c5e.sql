drop policy if exists "users own update" on public.users;
create policy "users own or admin debug update" on public.users
for update
to authenticated
using (id = auth.uid() or private.is_admin_or_debugger(auth.uid()))
with check (id = auth.uid() or private.is_admin_or_debugger(auth.uid()));

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own or admin debug update" on public.profiles
for update
to authenticated
using (id = auth.uid() or private.is_admin_or_debugger(auth.uid()))
with check (id = auth.uid() or private.is_admin_or_debugger(auth.uid()));