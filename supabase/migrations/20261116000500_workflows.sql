-- =============================================================================
-- Workflows administrables : définitions, versions publiées immuables,
-- exécutions rattachées à la version exacte, connexions HTTP encadrées.
-- =============================================================================
-- La définition (JSON) est validée côté serveur (src/lib/workflows/schema.ts)
-- avant publication ; la publication passe par la route serveur qui appelle
-- publish_workflow_version() avec la clé service_role.
-- =============================================================================

create table if not exists public.workflow_definitions (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  name                  text not null check (length(trim(name)) > 0),
  description           text not null default '',
  expected_output       text not null default '',
  category              text not null default 'Général',
  tags                  text[] not null default '{}',
  icon                  text,
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  is_demo               boolean not null default false,
  min_role              text not null default 'beta_tester' check (min_role in ('super_admin','admin','beta_tester','viewer')),
  draft                 jsonb not null default '{"inputs":[],"steps":[],"output":{"template":"","format":"markdown"}}'::jsonb,
  draft_updated_at      timestamptz not null default now(),
  published_version_id  uuid,
  created_by            uuid references auth.users(id) on delete set null,
  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.workflow_versions (
  id               uuid primary key default gen_random_uuid(),
  workflow_id      uuid not null references public.workflow_definitions(id) on delete restrict,
  version          integer not null check (version > 0),
  name             text not null,
  description      text not null default '',
  expected_output  text not null default '',
  definition       jsonb not null,
  definition_hash  text not null,
  change_summary   text not null default '',
  published_by     uuid references auth.users(id) on delete set null,
  published_at     timestamptz not null default now(),
  unique (workflow_id, version)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_definitions_published_fk') then
    alter table public.workflow_definitions add constraint workflow_definitions_published_fk
      foreign key (published_version_id) references public.workflow_versions(id) on delete restrict;
  end if;
end $$;

drop trigger if exists workflow_versions_immutable on public.workflow_versions;
create trigger workflow_versions_immutable before update or delete on public.workflow_versions
  for each row execute function public.forbid_mutation();

create or replace function public.workflow_definitions_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  if tg_op = 'UPDATE' and new.draft is distinct from old.draft then new.draft_updated_at := now(); end if;
  if not public.is_service_context() and tg_op = 'UPDATE'
     and new.published_version_id is distinct from old.published_version_id then
    raise exception 'La publication passe par le serveur (validation de la définition)' using errcode = '42501';
  end if;
  if new.status = 'published' and new.published_version_id is null then
    raise exception 'Un workflow publié doit avoir une version publiée' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists workflow_definitions_touch on public.workflow_definitions;
create trigger workflow_definitions_touch before insert or update on public.workflow_definitions
  for each row execute function public.workflow_definitions_touch();

-- Publication (appelée par le serveur après validation Zod)
create or replace function public.publish_workflow_version(
  p_workflow_id uuid, p_definition jsonb, p_definition_hash text, p_change_summary text, p_actor uuid)
returns public.workflow_versions language plpgsql security definer set search_path = public as $$
declare v_wf public.workflow_definitions; v_next int; v_row public.workflow_versions;
begin
  select * into v_wf from public.workflow_definitions where id = p_workflow_id for update;
  if not found then raise exception 'Workflow introuvable' using errcode = 'P0002'; end if;
  select coalesce(max(version),0) + 1 into v_next from public.workflow_versions where workflow_id = p_workflow_id;
  insert into public.workflow_versions(workflow_id, version, name, description, expected_output, definition,
                                       definition_hash, change_summary, published_by)
  values (p_workflow_id, v_next, v_wf.name, v_wf.description, v_wf.expected_output, p_definition, p_definition_hash,
          coalesce(nullif(trim(p_change_summary),''), case when v_next = 1 then 'Première publication' else 'Mise à jour' end),
          p_actor)
  returning * into v_row;
  update public.workflow_definitions set published_version_id = v_row.id, status = 'published' where id = p_workflow_id;
  insert into public.admin_audit_log(actor_id, actor_role, action, entity_type, entity_id, summary, changes)
  values (p_actor, (select role from public.profiles where id = p_actor), 'publish', 'workflow_definitions',
          p_workflow_id::text, v_wf.name, jsonb_build_object('version', v_next, 'hash', p_definition_hash));
  return v_row;
end $$;
revoke all on function public.publish_workflow_version(uuid, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.publish_workflow_version(uuid, jsonb, text, text, uuid) to service_role;

create or replace function public.duplicate_workflow(p_workflow_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_src public.workflow_definitions; v_id uuid;
begin
  if not public.has_permission('workflow.manage') then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
  select * into v_src from public.workflow_definitions where id = p_workflow_id;
  if not found then raise exception 'Workflow introuvable' using errcode = 'P0002'; end if;
  insert into public.workflow_definitions(slug, name, description, expected_output, category, tags, icon, status,
                                          is_demo, min_role, draft)
  values (left(v_src.slug, 60) || '-copie-' || substr(md5(random()::text), 1, 6), v_src.name || ' (copie)',
          v_src.description, v_src.expected_output, v_src.category, v_src.tags, v_src.icon, 'draft', false,
          v_src.min_role, v_src.draft)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.duplicate_workflow(uuid) from anon;

-- ─── Connexions HTTP (webhooks / API externes / moteur externe) ─────────────
-- L'administrateur ne saisit jamais d'URL libre dans une étape : il choisit une
-- connexion (URL de base https validée + liste blanche d'hôtes côté serveur)
-- et un chemin relatif.
create table if not exists public.workflow_http_connections (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  base_url          text not null check (base_url ~ '^https://[^\s/]+(/[^\s]*)?$'),
  auth_type         text not null default 'none' check (auth_type in ('none','bearer','header')),
  auth_header_name  text check (auth_header_name is null or auth_header_name ~ '^[A-Za-z0-9-]{1,64}$'),
  secret_ref        text check (secret_ref is null or secret_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  allowed_methods   text[] not null default '{POST}',
  timeout_ms        integer not null default 30000 check (timeout_ms between 1000 and 120000),
  max_response_bytes integer not null default 1000000 check (max_response_bytes between 1024 and 5000000),
  is_enabled        boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists workflow_http_connections_touch on public.workflow_http_connections;
create trigger workflow_http_connections_touch before update on public.workflow_http_connections
  for each row execute function public.touch_updated_at();

-- ─── Exécutions ─────────────────────────────────────────────────────────────
create table if not exists public.workflow_runs (
  id               uuid primary key default gen_random_uuid(),
  workflow_id      uuid not null references public.workflow_definitions(id) on delete restrict,
  version_id       uuid references public.workflow_versions(id) on delete restrict,
  is_test          boolean not null default false,
  test_definition_hash text,
  user_id          uuid not null references auth.users(id) on delete cascade,
  status           text not null default 'queued'
                   check (status in ('queued','running','succeeded','failed','timed_out','cancelled')),
  inputs           jsonb not null default '{}'::jsonb,
  output           text,
  output_format    text not null default 'markdown',
  error_code       text,
  error_message    text,
  idempotency_key  text not null check (length(idempotency_key) between 8 and 100),
  attempt          integer not null default 1 check (attempt between 1 and 10),
  parent_run_id    uuid references public.workflow_runs(id) on delete set null,
  current_step_id  text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  deadline_at      timestamptz,
  duration_ms      integer,
  unique (user_id, idempotency_key),
  check (is_test or version_id is not null)
);
create index if not exists workflow_runs_user_idx on public.workflow_runs(user_id, created_at desc);
create index if not exists workflow_runs_workflow_idx on public.workflow_runs(workflow_id, created_at desc);
create index if not exists workflow_runs_active_idx on public.workflow_runs(user_id) where status in ('queued','running');

create table if not exists public.workflow_run_steps (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.workflow_runs(id) on delete cascade,
  step_id          text not null,
  step_type        text not null,
  step_name        text not null default '',
  position         integer not null,
  status           text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  started_at       timestamptz,
  finished_at      timestamptz,
  duration_ms      integer,
  output_preview   text,
  error_message    text,
  usage_event_id   uuid,
  unique (run_id, step_id)
);

-- Exécutions orphelines : marquées « timed_out » après l'échéance (appel lazy
-- par le serveur, ou planifié — cf. docs/07-exploitation.md)
create or replace function public.expire_stale_workflow_runs() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.workflow_runs
     set status = 'timed_out', finished_at = now(), error_code = 'timeout',
         error_message = coalesce(error_message, 'Délai maximum dépassé')
   where status in ('queued','running') and deadline_at is not null and deadline_at < now();
  get diagnostics n = row_count;
  update public.workflow_run_steps s set status = 'failed', finished_at = now(), error_message = 'Délai maximum dépassé'
    from public.workflow_runs r
   where s.run_id = r.id and r.status = 'timed_out' and s.status in ('pending','running');
  return n;
end $$;
revoke all on function public.expire_stale_workflow_runs() from public, anon, authenticated;
grant execute on function public.expire_stale_workflow_runs() to service_role;

-- Informations d'utilisation pour le back-office (agrégats, aucun contenu)
create or replace function public.workflow_usage_stats(p_workflow_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('workflow.manage') then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'runs', count(*) filter (where not is_test),
      'succeeded', count(*) filter (where not is_test and status = 'succeeded'),
      'failed', count(*) filter (where not is_test and status in ('failed','timed_out')),
      'test_runs', count(*) filter (where is_test),
      'users', count(distinct user_id) filter (where not is_test),
      'avg_duration_ms', round(avg(duration_ms) filter (where not is_test and status = 'succeeded')),
      'last_run_at', max(created_at) filter (where not is_test))
    from public.workflow_runs where workflow_id = p_workflow_id);
end $$;
revoke all on function public.workflow_usage_stats(uuid) from anon;

-- Dépendances d'un modèle (avant archivage)
create or replace function public.model_dependencies(p_model_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('model.manage') then
    raise exception 'Réservé aux super administrateurs' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from public.partners
                           where ai_model_id = p_model_id and archived_at is null), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from public.agents
                         where default_model_id = p_model_id and archived_at is null), '[]'::jsonb),
    'workflow_drafts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from public.workflow_definitions w
                         where w.status <> 'archived' and exists (select 1 from jsonb_array_elements(coalesce(w.draft->'steps','[]'::jsonb)) s
                                                                   where s->>'modelId' = p_model_id::text)), '[]'::jsonb),
    'workflow_published', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'version', v.version))
                         from public.workflow_definitions w join public.workflow_versions v on v.id = w.published_version_id
                         where w.status = 'published' and exists (select 1 from jsonb_array_elements(coalesce(v.definition->'steps','[]'::jsonb)) s
                                                                   where s->>'modelId' = p_model_id::text)), '[]'::jsonb)
  );
end $$;
revoke all on function public.model_dependencies(uuid) from anon;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.workflow_definitions      enable row level security;
alter table public.workflow_versions         enable row level security;
alter table public.workflow_http_connections enable row level security;
alter table public.workflow_runs             enable row level security;
alter table public.workflow_run_steps        enable row level security;

select public._chantal_reset_policies('workflow_definitions');
create policy workflow_definitions_read on public.workflow_definitions for select to authenticated
  using (public.has_permission('workflow.manage')
         or (status = 'published' and public.has_permission('workflow.read') and public.has_min_role(min_role)));
create policy workflow_definitions_write on public.workflow_definitions for all to authenticated
  using (public.has_permission('workflow.manage')) with check (public.has_permission('workflow.manage'));

select public._chantal_reset_policies('workflow_versions');
create policy workflow_versions_read on public.workflow_versions for select to authenticated
  using (public.has_permission('workflow.manage')
         or exists (select 1 from public.workflow_definitions w where w.id = workflow_id
                     and w.status = 'published' and public.has_permission('workflow.read') and public.has_min_role(w.min_role))
         or exists (select 1 from public.workflow_runs r where r.version_id = workflow_versions.id and r.user_id = auth.uid()));

select public._chantal_reset_policies('workflow_http_connections');
create policy workflow_http_connections_admin on public.workflow_http_connections for all to authenticated
  using (public.has_permission('workflow.manage')) with check (public.has_permission('workflow.manage'));

select public._chantal_reset_policies('workflow_runs');
-- Historique strictement personnel : aucun rôle ne lit les entrées/sorties d'autrui.
create policy workflow_runs_read on public.workflow_runs for select to authenticated using (user_id = auth.uid());

select public._chantal_reset_policies('workflow_run_steps');
create policy workflow_run_steps_read on public.workflow_run_steps for select to authenticated
  using (exists (select 1 from public.workflow_runs r where r.id = run_id and r.user_id = auth.uid()));

-- Audit
drop trigger if exists workflow_definitions_audit on public.workflow_definitions;
create trigger workflow_definitions_audit after insert or update or delete on public.workflow_definitions
  for each row execute function public.audit_row_change();
drop trigger if exists workflow_http_connections_audit on public.workflow_http_connections;
create trigger workflow_http_connections_audit after insert or update or delete on public.workflow_http_connections
  for each row execute function public.audit_row_change();
