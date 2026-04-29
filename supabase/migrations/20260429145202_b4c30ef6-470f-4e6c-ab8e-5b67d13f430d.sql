revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.is_admin_or_debugger(uuid) from public, anon, authenticated;
revoke all on function private.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function private.is_admin_or_debugger(uuid) from public, anon, authenticated;
revoke usage on schema private from public, anon, authenticated;