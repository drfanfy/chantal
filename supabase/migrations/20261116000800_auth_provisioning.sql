-- =============================================================================
-- Provisionnement contrôlé des comptes (préparation SSO entreprise)
-- =============================================================================
-- Principes :
--  * Identité = auth.users (Supabase Auth : mot de passe en dev, SSO SAML/OIDC
--    en cible). Profil applicatif = public.profiles. Autorisations = rôle +
--    role_permissions.
--  * Aucun accès sans profil ACTIF. Un nouvel utilisateur inconnu (ex. première
--    connexion SSO sans invitation) obtient un profil INACTIF en attente
--    d'approbation : pas d'inscription libre.
--  * Pas de rattachement automatique sur l'e-mail : le rattachement d'un
--    ancien compte à une identité SSO est une action explicite d'un super
--    administrateur (merge_user_accounts), journalisée.
-- =============================================================================

create table if not exists public.user_invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         text not null default 'beta_tester' check (role in ('super_admin','admin','beta_tester','viewer')),
  full_name    text,
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  consumed_at  timestamptz,
  consumed_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz
);
create unique index if not exists user_invitations_pending_uniq
  on public.user_invitations(email) where consumed_at is null and revoked_at is null;

create table if not exists public.sso_group_role_mappings (
  id           uuid primary key default gen_random_uuid(),
  group_value  text not null unique,
  role         text not null check (role in ('super_admin','admin','beta_tester','viewer')),
  description  text,
  created_at   timestamptz not null default now()
);

alter table public.user_invitations enable row level security;
alter table public.sso_group_role_mappings enable row level security;
select public._chantal_reset_policies('user_invitations');
create policy user_invitations_admin on public.user_invitations for all to authenticated
  using (public.has_permission('user.manage'))
  with check (public.has_permission('user.manage') and (role <> 'super_admin' or public.has_permission('user.manage_super')));
select public._chantal_reset_policies('sso_group_role_mappings');
create policy sso_group_role_mappings_read on public.sso_group_role_mappings for select to authenticated
  using (public.has_permission('user.manage'));
create policy sso_group_role_mappings_write on public.sso_group_role_mappings for all to authenticated
  using (public.has_permission('user.manage_super')) with check (public.has_permission('user.manage_super'));

drop trigger if exists user_invitations_audit on public.user_invitations;
create trigger user_invitations_audit after insert or update or delete on public.user_invitations
  for each row execute function public.audit_row_change();
drop trigger if exists sso_group_role_mappings_audit on public.sso_group_role_mappings;
create trigger sso_group_role_mappings_audit after insert or update or delete on public.sso_group_role_mappings
  for each row execute function public.audit_row_change();

-- ─── Création du profil à la création d'un compte d'authentification ────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.user_invitations;
  v_email text := lower(new.email);
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
begin
  if exists (select 1 from public.profiles where id = new.id) then return new; end if;

  select * into v_inv from public.user_invitations
   where email = v_email and consumed_at is null and revoked_at is null and expires_at > now()
   order by created_at desc limit 1;

  if v_inv.id is not null then
    insert into public.profiles(id, email, full_name, role, is_active, identity_provider, provisioning_source)
    values (new.id, v_email, coalesce(v_inv.full_name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
            v_inv.role, true, v_provider, 'invitation');
    update public.user_invitations set consumed_at = now(), consumed_by = new.id where id = v_inv.id;
  else
    -- Inconnu : profil inactif, en attente d'approbation par un administrateur
    insert into public.profiles(id, email, full_name, role, is_active, identity_provider, provisioning_source)
    values (new.id, v_email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
            'viewer', false, v_provider, 'pending_approval');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Rattachement explicite d'un ancien compte à un nouveau (bascule SSO) ───
create or replace function public.merge_user_accounts(p_from uuid, p_to uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from public.profiles; v_to public.profiles; v_actor uuid := coalesce(auth.uid(), p_actor);
        r jsonb := '{}'::jsonb; n int;
begin
  if not (public.has_permission('user.manage_super') or public.request_jwt_role() = 'service_role') then
    raise exception 'Réservé aux super administrateurs' using errcode = '42501';
  end if;
  if p_from = p_to then raise exception 'Comptes identiques' using errcode = '22023'; end if;
  select * into v_from from public.profiles where id = p_from for update;
  select * into v_to   from public.profiles where id = p_to for update;
  if v_from.id is null or v_to.id is null then raise exception 'Profil introuvable' using errcode = 'P0002'; end if;

  update public.conversations set user_id = p_to where user_id = p_from;           get diagnostics n = row_count; r := r || jsonb_build_object('conversations', n);
  update public.message_attachments set user_id = p_to where user_id = p_from;
  insert into public.user_favorites(user_id, resource_type, resource_id, source, created_at)
    select p_to, resource_type, resource_id, source, created_at from public.user_favorites where user_id = p_from
    on conflict do nothing;
  delete from public.user_favorites where user_id = p_from;
  update public.prompt_usages set user_id = p_to where user_id = p_from;
  update public.workflow_runs set user_id = p_to where user_id = p_from;           get diagnostics n = row_count; r := r || jsonb_build_object('workflow_runs', n);
  update public.ai_usage_events set user_id = p_to where user_id = p_from;
  update public.tickets set user_id = p_to where user_id = p_from;
  update public.ticket_messages set user_id = p_to where user_id = p_from;
  if to_regclass('public.formation_progress') is not null then
    execute 'insert into public.formation_progress(user_id, chapter_id, read_at)
               select $1, chapter_id, read_at from public.formation_progress where user_id = $2
               on conflict (user_id, chapter_id) do nothing' using p_to, p_from;
    execute 'delete from public.formation_progress where user_id = $1' using p_from;
  end if;

  -- Le nouveau compte reprend le rôle de l'ancien et devient actif ; l'ancien est désactivé.
  update public.profiles set role = v_from.role, is_active = true,
         full_name = coalesce(v_to.full_name, v_from.full_name), avatar_url = coalesce(v_to.avatar_url, v_from.avatar_url)
   where id = p_to;
  update public.profiles set is_active = false where id = p_from;

  insert into public.admin_audit_log(actor_id, actor_role, action, entity_type, entity_id, summary, changes)
  values (v_actor, (select role from public.profiles where id = v_actor), 'merge_accounts', 'profiles', p_to::text,
          coalesce(v_from.email,'') || ' → ' || coalesce(v_to.email,''), r || jsonb_build_object('from', p_from, 'to', p_to));
  return r;
end $$;
revoke all on function public.merge_user_accounts(uuid, uuid, uuid) from anon;

-- Comptes en attente avec un homonyme d'e-mail (aide au rattachement, admin)
create or replace function public.pending_account_matches()
returns table(pending_id uuid, pending_email text, pending_provider text, pending_created_at timestamptz,
              existing_id uuid, existing_provider text, existing_role text, existing_active boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.identity_provider, p.created_at, e.id, e.identity_provider, e.role, e.is_active
    from public.profiles p
    join public.profiles e on lower(e.email) = lower(p.email) and e.id <> p.id
   where p.provisioning_source = 'pending_approval' and p.is_active = false
     and public.has_permission('user.manage_super')
$$;
revoke all on function public.pending_account_matches() from anon;
