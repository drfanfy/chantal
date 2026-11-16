-- =============================================================================
-- RBAC : matrice de permissions, fonctions d'autorisation, protection des
-- profils, journal d'audit administratif.
-- =============================================================================

-- ─── Utilitaire interne : remise à zéro des policies d'une table ─────────────
-- Les policies de la base POC n'étaient pas versionnées : pour arriver à un
-- état connu et testé, on supprime toutes les policies existantes des tables
-- reprises puis on recrée les nôtres. (Aucune donnée n'est touchée.)
create or replace function public._chantal_reset_policies(p_table text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = p_table loop
    execute format('drop policy if exists %I on public.%I', r.policyname, p_table);
  end loop;
end $$;
revoke all on function public._chantal_reset_policies(text) from public;

-- ─── Rôles ───────────────────────────────────────────────────────────────────
update public.profiles set role = 'viewer'
 where role is null or role not in ('super_admin','admin','beta_tester','viewer');

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('super_admin','admin','beta_tester','viewer'));
  end if;
end $$;

alter table public.profiles
  add column if not exists updated_at          timestamptz not null default now(),
  add column if not exists deactivated_at      timestamptz,
  add column if not exists last_sign_in_at     timestamptz,
  add column if not exists identity_provider   text not null default 'email',
  add column if not exists external_subject    text,
  add column if not exists provisioning_source text not null default 'legacy';

create unique index if not exists profiles_external_identity_uniq
  on public.profiles(identity_provider, external_subject) where external_subject is not null;

create or replace function public.role_rank(p_role text) returns int
language sql immutable as $$
  select case p_role when 'super_admin' then 3 when 'admin' then 2
                     when 'beta_tester' then 1 when 'viewer' then 0 else -1 end
$$;

-- Rôle applicatif de l'appelant (null si inactif / inconnu)
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active = true
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null
$$;

create or replace function public.has_min_role(p_min text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_rank(public.current_app_role()) >= public.role_rank(p_min), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_min_role('admin')
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() = 'super_admin'
$$;

-- Vrai si la requête est exécutée par un rôle technique serveur
-- (service_role via l'API, ou propriétaire lors des migrations).
create or replace function public.is_service_context() returns boolean
language sql stable as $$
  -- Évalué dans des fonctions SECURITY INVOKER : current_user est le rôle réel
  -- (service_role pour l'API serveur, postgres pour les migrations et dans le
  -- corps des fonctions SECURITY DEFINER contrôlées comme publish_prompt()).
  select current_user in ('service_role','postgres','supabase_admin')
$$;

-- Rôle porté par le JWT de la requête PostgREST (service_role pour le serveur)
create or replace function public.request_jwt_role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  nullif(current_setting('request.jwt.claim.role', true), ''), '')
$$;

-- ─── Matrice de permissions (miroir de src/lib/permissions.ts) ──────────────
create table if not exists public.role_permissions (
  role        text not null check (role in ('super_admin','admin','beta_tester','viewer')),
  permission  text not null,
  primary key (role, permission)
);
alter table public.role_permissions enable row level security;
select public._chantal_reset_policies('role_permissions');
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

delete from public.role_permissions;
insert into public.role_permissions(role, permission)
select r, p from (values
  -- viewer
  ('viewer','prompt.read'), ('viewer','conversation.read_shared'), ('viewer','workflow.read'),
  ('viewer','formation.read'),
  -- beta_tester
  ('beta_tester','prompt.read'), ('beta_tester','conversation.read_shared'), ('beta_tester','workflow.read'),
  ('beta_tester','formation.read'), ('beta_tester','chat.use'), ('beta_tester','conversation.share'),
  ('beta_tester','workflow.run'),
  -- admin
  ('admin','prompt.read'), ('admin','conversation.read_shared'), ('admin','workflow.read'),
  ('admin','formation.read'), ('admin','chat.use'), ('admin','conversation.share'), ('admin','workflow.run'),
  ('admin','prompt.manage'), ('admin','workflow.manage'), ('admin','agent.manage'), ('admin','partner.manage'),
  ('admin','user.manage'), ('admin','reporting.view'), ('admin','reporting.export'), ('admin','audit.view'),
  ('admin','ticket.manage'), ('admin','formation.manage'),
  -- super_admin
  ('super_admin','prompt.read'), ('super_admin','conversation.read_shared'), ('super_admin','workflow.read'),
  ('super_admin','formation.read'), ('super_admin','chat.use'), ('super_admin','conversation.share'),
  ('super_admin','workflow.run'), ('super_admin','prompt.manage'), ('super_admin','workflow.manage'),
  ('super_admin','agent.manage'), ('super_admin','partner.manage'), ('super_admin','user.manage'),
  ('super_admin','reporting.view'), ('super_admin','reporting.export'), ('super_admin','audit.view'),
  ('super_admin','ticket.manage'), ('super_admin','formation.manage'),
  ('super_admin','model.manage'), ('super_admin','conversation.moderate'), ('super_admin','settings.manage'),
  ('super_admin','user.manage_super')
) as t(r, p);

create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_permissions rp
     where rp.role = public.current_app_role() and rp.permission = p_permission
  )
$$;

-- ─── Paramètres applicatifs ─────────────────────────────────────────────────
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
alter table public.app_settings enable row level security;
select public._chantal_reset_policies('app_settings');
create policy app_settings_read  on public.app_settings for select to authenticated using (public.is_active_user());
create policy app_settings_write on public.app_settings for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

insert into public.app_settings(key, value, description) values
  ('usage_retention_days',  '395'::jsonb,  'Durée de conservation des événements d''usage IA (jours)'),
  ('run_retention_days',    '395'::jsonb,  'Durée de conservation des exécutions de workflows (jours)'),
  ('audit_retention_days',  '1095'::jsonb, 'Durée de conservation du journal d''audit (jours)'),
  ('reporting_demo_mode',   'false'::jsonb,'Affiche des données de démonstration dans le reporting (jamais en production)')
on conflict (key) do nothing;

-- ─── Journal d'audit ────────────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_role   text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  summary      text,
  changes      jsonb
);
create index if not exists admin_audit_log_occurred_idx on public.admin_audit_log(occurred_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log(entity_type, entity_id);
alter table public.admin_audit_log enable row level security;
select public._chantal_reset_policies('admin_audit_log');
create policy admin_audit_log_read on public.admin_audit_log for select to authenticated
  using (public.has_permission('audit.view'));
-- Aucune policy insert/update/delete : écriture uniquement via triggers
-- SECURITY DEFINER ou service_role. Le journal est immuable.
revoke update, delete, truncate on public.admin_audit_log from authenticated, anon;

-- Clés jamais journalisées en valeur (défense en profondeur ; aucune de ces
-- colonnes ne contient de secret par conception).
create or replace function public._audit_redact(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k,
           case when k ~* '(secret|password|token|api_key|apikey)' and k <> 'secret_ref' then '"[masqué]"'::jsonb
                when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 2000
                  then to_jsonb(left(v #>> '{}', 2000) || '…')
                else v end), '{}'::jsonb)
    from jsonb_each(p) as e(k, v)
$$;

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_ignored text[] := array['updated_at','last_test_at','last_test_status','last_test_error',
                            'last_test_latency_ms','config_updated_at','last_sign_in_at'];
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> all(v_ignored) and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('avant', v_old -> v_key, 'après', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;

  insert into public.admin_audit_log(actor_id, actor_role, action, entity_type, entity_id, summary, changes)
  values (auth.uid(), public.current_app_role(), lower(tg_op), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'),
          coalesce(v_new ->> 'name', v_new ->> 'title', v_old ->> 'name', v_old ->> 'title', v_new ->> 'email', v_old ->> 'email'),
          public._audit_redact(v_changes));
  return coalesce(new, old);
end $$;

-- ─── Profils : protections ──────────────────────────────────────────────────
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_actor_role text := public.current_app_role();
begin
  new.updated_at := now();
  if public.is_service_context() then return new; end if;

  if tg_op = 'INSERT' then
    raise exception 'Création de profil réservée au serveur' using errcode = '42501';
  end if;

  -- Champs d'identité : jamais modifiables depuis le client
  if new.id is distinct from old.id or new.email is distinct from old.email
     or new.identity_provider is distinct from old.identity_provider
     or new.external_subject is distinct from old.external_subject
     or new.provisioning_source is distinct from old.provisioning_source then
    raise exception 'Champs d''identité non modifiables' using errcode = '42501';
  end if;

  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    if not public.has_permission('user.manage') then
      raise exception 'Modification du rôle ou du statut non autorisée' using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'Vous ne pouvez pas modifier votre propre rôle ou statut' using errcode = '42501';
    end if;
    if (old.role = 'super_admin' or new.role = 'super_admin') and not public.has_permission('user.manage_super') then
      raise exception 'Seul un super administrateur peut gérer un super administrateur' using errcode = '42501';
    end if;
    if new.is_active = false and old.is_active = true then new.deactivated_at := now(); end if;
    if new.is_active = true then new.deactivated_at := null; end if;
  end if;

  -- Un utilisateur non admin ne modifie que son nom et son avatar
  if old.id <> auth.uid() and not public.has_permission('user.manage') then
    raise exception 'Modification non autorisée' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update of role, is_active, full_name on public.profiles
  for each row execute function public.audit_row_change();

select public._chantal_reset_policies('profiles');
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('user.manage'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_permission('user.manage'))
  with check (id = auth.uid() or public.has_permission('user.manage'));
-- Pas d'insert/delete client : création via serveur, désactivation plutôt que suppression.

-- Annuaire minimal (nom + avatar) pour afficher les auteurs des contenus partagés
create or replace view public.profile_directory as
  select p.id, p.full_name, p.avatar_url
    from public.profiles p
   where public.is_active_user();
revoke all on public.profile_directory from anon;
grant select on public.profile_directory to authenticated;

-- ─── Tickets (inchangés fonctionnellement, policies explicitées) ────────────
select public._chantal_reset_policies('tickets');
create policy tickets_select on public.tickets for select to authenticated
  using (user_id = auth.uid() or public.has_permission('ticket.manage'));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy tickets_update on public.tickets for update to authenticated
  using (user_id = auth.uid() or public.has_permission('ticket.manage'))
  with check (user_id = auth.uid() or public.has_permission('ticket.manage'));

select public._chantal_reset_policies('ticket_messages');
create policy ticket_messages_select on public.ticket_messages for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id
                  and (t.user_id = auth.uid() or public.has_permission('ticket.manage'))));
create policy ticket_messages_insert on public.ticket_messages for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_id
                  and (t.user_id = auth.uid() or public.has_permission('ticket.manage'))));
create policy ticket_messages_update on public.ticket_messages for update to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id
                  and (t.user_id = auth.uid() or public.has_permission('ticket.manage'))));

-- ─── Formations : écriture alignée sur la matrice ───────────────────────────
do $$ begin
  if to_regclass('public.formations') is not null then
    perform public._chantal_reset_policies('formations');
    create policy formations_read on public.formations for select to authenticated using (public.is_active_user());
    create policy formations_write on public.formations for all to authenticated
      using (public.has_permission('formation.manage')) with check (public.has_permission('formation.manage'));
    perform public._chantal_reset_policies('formation_chapters');
    create policy formation_chapters_read on public.formation_chapters for select to authenticated using (public.is_active_user());
    create policy formation_chapters_write on public.formation_chapters for all to authenticated
      using (public.has_permission('formation.manage')) with check (public.has_permission('formation.manage'));
  end if;
end $$;
