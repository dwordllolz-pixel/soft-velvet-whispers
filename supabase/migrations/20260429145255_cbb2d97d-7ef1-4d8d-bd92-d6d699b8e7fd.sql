create table if not exists public.admin_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null,
  granted_role public.app_role,
  redeemed_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

alter table public.admin_invite_redemptions enable row level security;

create or replace function private.redeem_admin_invite_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.admin_invites%rowtype;
begin
  if new.user_id <> auth.uid() then
    raise exception 'Invite can only be redeemed for the signed-in user';
  end if;

  select * into invite
  from public.admin_invites
  where code_hash = new.code_hash
    and disabled_at is null
    and (expires_at is null or expires_at > now())
    and uses < max_uses
  for update;

  if not found then
    raise exception 'Invalid or expired invite code';
  end if;

  new.granted_role := invite.role;

  insert into public.user_roles (user_id, role, granted_by)
  values (new.user_id, invite.role, invite.created_by)
  on conflict (user_id, role) do nothing;

  update public.admin_invites
  set uses = uses + 1,
      redeemed_by = array_append(redeemed_by, new.user_id),
      updated_at = now()
  where id = invite.id;

  insert into public.admin_audit_log (actor_id, action, target_user_id, after_value, metadata)
  values (new.user_id, 'admin_invite_redeemed', new.user_id, jsonb_build_object('role', invite.role), jsonb_build_object('invite_id', invite.id));

  return new;
end;
$$;

revoke all on function private.redeem_admin_invite_trigger() from public, anon, authenticated;

drop trigger if exists admin_invite_redemptions_redeem on public.admin_invite_redemptions;
create trigger admin_invite_redemptions_redeem
before insert on public.admin_invite_redemptions
for each row execute function private.redeem_admin_invite_trigger();

drop policy if exists "invite redemptions own insert" on public.admin_invite_redemptions;
create policy "invite redemptions own insert" on public.admin_invite_redemptions for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "invite redemptions own or admin view" on public.admin_invite_redemptions;
create policy "invite redemptions own or admin view" on public.admin_invite_redemptions for select to authenticated using (user_id = auth.uid() or private.has_role(auth.uid(), 'admin'));

revoke usage on schema private from public, anon, authenticated;