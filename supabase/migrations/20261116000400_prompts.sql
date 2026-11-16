-- =============================================================================
-- Bibliothèque de prompts administrable et versionnée
-- =============================================================================
-- Modèle : le brouillon vit dans prompt_templates.draft (modifiable) ; chaque
-- publication crée une ligne IMMUABLE dans prompt_versions (n+1). Restaurer une
-- ancienne version = recopier son contenu dans le brouillon puis publier
-- (une nouvelle version est créée, l'historique n'est jamais réécrit).
-- =============================================================================

create table if not exists public.prompt_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.prompt_templates (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  category_id           uuid references public.prompt_categories(id) on delete set null,
  tags                  text[] not null default '{}',
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  is_demo               boolean not null default false,
  min_role              text not null default 'viewer' check (min_role in ('super_admin','admin','beta_tester','viewer')),
  draft                 jsonb not null default '{}'::jsonb,
  draft_updated_at      timestamptz not null default now(),
  published_version_id  uuid,
  created_by            uuid references auth.users(id) on delete set null,
  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.prompt_versions (
  id              uuid primary key default gen_random_uuid(),
  prompt_id       uuid not null references public.prompt_templates(id) on delete restrict,
  version         integer not null check (version > 0),
  title           text not null check (length(trim(title)) > 0),
  description     text not null default '',
  instructions    text not null default '',
  content         text not null check (length(trim(content)) > 0),
  variables       jsonb not null default '[]'::jsonb check (jsonb_typeof(variables) = 'array'),
  examples        jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array'),
  change_summary  text not null default '',
  restored_from_version integer,
  author_id       uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (prompt_id, version)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'prompt_templates_published_fk') then
    alter table public.prompt_templates add constraint prompt_templates_published_fk
      foreign key (published_version_id) references public.prompt_versions(id) on delete restrict;
  end if;
end $$;

create index if not exists prompt_templates_status_idx on public.prompt_templates(status);
create index if not exists prompt_versions_prompt_idx on public.prompt_versions(prompt_id, version desc);

-- Versions immuables
create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Enregistrement immuable (%)', tg_table_name using errcode = '42501';
end $$;
drop trigger if exists prompt_versions_immutable on public.prompt_versions;
create trigger prompt_versions_immutable before update or delete on public.prompt_versions
  for each row execute function public.forbid_mutation();

create or replace function public.prompt_templates_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  if tg_op = 'UPDATE' and new.draft is distinct from old.draft then new.draft_updated_at := now(); end if;
  if not public.is_service_context() and tg_op = 'UPDATE'
     and new.published_version_id is distinct from old.published_version_id then
    raise exception 'Utilisez publish_prompt() pour publier' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status = 'published' and new.published_version_id is null then
    raise exception 'Un prompt publié doit avoir une version publiée' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists prompt_templates_touch on public.prompt_templates;
create trigger prompt_templates_touch before insert or update on public.prompt_templates
  for each row execute function public.prompt_templates_touch();

-- Publication : brouillon → nouvelle version immuable
create or replace function public.publish_prompt(p_prompt_id uuid, p_change_summary text default '')
returns public.prompt_versions language plpgsql security definer set search_path = public as $$
declare
  v_t public.prompt_templates;
  v_next integer;
  v_row public.prompt_versions;
  d jsonb;
begin
  -- '' = connexion directe à la base (migrations, DBA) ; jamais le cas via l'API.
  if not (public.has_permission('prompt.manage') or public.request_jwt_role() in ('service_role','')) then
    raise exception 'Publication réservée aux administrateurs' using errcode = '42501';
  end if;
  select * into v_t from public.prompt_templates where id = p_prompt_id for update;
  if not found then raise exception 'Prompt introuvable' using errcode = 'P0002'; end if;
  d := v_t.draft;
  if coalesce(trim(d->>'title'),'') = '' or coalesce(trim(d->>'content'),'') = '' then
    raise exception 'Titre et contenu obligatoires pour publier' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(d->'variables','[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(d->'examples','[]'::jsonb)) <> 'array' then
    raise exception 'Variables et exemples doivent être des listes' using errcode = '23514';
  end if;
  select coalesce(max(version),0) + 1 into v_next from public.prompt_versions where prompt_id = p_prompt_id;
  insert into public.prompt_versions(prompt_id, version, title, description, instructions, content, variables,
                                     examples, change_summary, restored_from_version, author_id)
  values (p_prompt_id, v_next, trim(d->>'title'), coalesce(d->>'description',''), coalesce(d->>'instructions',''),
          d->>'content', coalesce(d->'variables','[]'::jsonb), coalesce(d->'examples','[]'::jsonb),
          coalesce(nullif(trim(p_change_summary),''), case when v_next = 1 then 'Première publication' else 'Mise à jour' end),
          nullif(d->>'restored_from_version','')::int, auth.uid())
  returning * into v_row;
  update public.prompt_templates
     set published_version_id = v_row.id, status = 'published',
         draft = draft - 'restored_from_version'
   where id = p_prompt_id;
  return v_row;
end $$;
revoke all on function public.publish_prompt(uuid, text) from anon;

-- Restauration : recopie une version dans le brouillon (à publier ensuite)
create or replace function public.restore_prompt_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.prompt_versions;
begin
  if not public.has_permission('prompt.manage') then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
  select * into v from public.prompt_versions where id = p_version_id;
  if not found then raise exception 'Version introuvable' using errcode = 'P0002'; end if;
  update public.prompt_templates set draft = jsonb_build_object(
      'title', v.title, 'description', v.description, 'instructions', v.instructions, 'content', v.content,
      'variables', v.variables, 'examples', v.examples, 'restored_from_version', v.version)
   where id = v.prompt_id;
end $$;
revoke all on function public.restore_prompt_version(uuid) from anon;

-- Duplication (nouveau prompt en brouillon)
create or replace function public.duplicate_prompt(p_prompt_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_src public.prompt_templates; v_id uuid; v_draft jsonb;
begin
  if not public.has_permission('prompt.manage') then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
  select * into v_src from public.prompt_templates where id = p_prompt_id;
  if not found then raise exception 'Prompt introuvable' using errcode = 'P0002'; end if;
  v_draft := v_src.draft || jsonb_build_object('title', coalesce(v_src.draft->>'title','Prompt') || ' (copie)');
  insert into public.prompt_templates(slug, category_id, tags, status, is_demo, min_role, draft)
  values (left(v_src.slug, 60) || '-copie-' || substr(md5(random()::text), 1, 6), v_src.category_id, v_src.tags,
          'draft', false, v_src.min_role, v_draft - 'restored_from_version')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.duplicate_prompt(uuid) from anon;

-- Traçabilité des utilisations (référence exacte de la version)
create table if not exists public.prompt_usages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  prompt_id        uuid not null references public.prompt_templates(id) on delete restrict,
  version_id       uuid not null references public.prompt_versions(id) on delete restrict,
  context          text not null default 'chat' check (context in ('chat','preview','test')),
  conversation_id  uuid references public.conversations(id) on delete set null,
  used_at          timestamptz not null default now()
);
create index if not exists prompt_usages_user_idx on public.prompt_usages(user_id, used_at desc);
create index if not exists prompt_usages_prompt_idx on public.prompt_usages(prompt_id, used_at desc);

create or replace function public.record_prompt_usage(p_version_id uuid, p_context text default 'chat')
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.prompt_versions; v_id uuid;
begin
  if not public.has_permission('prompt.read') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select pv.* into v from public.prompt_versions pv
    join public.prompt_templates t on t.id = pv.prompt_id
   where pv.id = p_version_id
     and (public.has_permission('prompt.manage')
          or (t.status = 'published' and t.published_version_id = pv.id and public.has_min_role(t.min_role)));
  if not found then raise exception 'Version de prompt non disponible' using errcode = 'P0002'; end if;
  insert into public.prompt_usages(user_id, prompt_id, version_id, context)
  values (auth.uid(), v.prompt_id, v.id, coalesce(p_context,'chat')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_prompt_usage(uuid, text) from anon;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.prompt_categories enable row level security;
alter table public.prompt_templates  enable row level security;
alter table public.prompt_versions   enable row level security;
alter table public.prompt_usages     enable row level security;

select public._chantal_reset_policies('prompt_categories');
create policy prompt_categories_read on public.prompt_categories for select to authenticated using (public.is_active_user());
create policy prompt_categories_write on public.prompt_categories for all to authenticated
  using (public.has_permission('prompt.manage')) with check (public.has_permission('prompt.manage'));

select public._chantal_reset_policies('prompt_templates');
create policy prompt_templates_read on public.prompt_templates for select to authenticated
  using (public.has_permission('prompt.manage')
         or (status = 'published' and public.has_permission('prompt.read') and public.has_min_role(min_role)));
create policy prompt_templates_write on public.prompt_templates for all to authenticated
  using (public.has_permission('prompt.manage')) with check (public.has_permission('prompt.manage'));

select public._chantal_reset_policies('prompt_versions');
-- Les utilisateurs ne voient que la version publiée courante ; les admins tout l'historique.
create policy prompt_versions_read on public.prompt_versions for select to authenticated
  using (public.has_permission('prompt.manage')
         or exists (select 1 from public.prompt_templates t
                     where t.id = prompt_id and t.published_version_id = prompt_versions.id
                       and t.status = 'published' and public.has_permission('prompt.read') and public.has_min_role(t.min_role)));
-- Insertion uniquement via publish_prompt()

select public._chantal_reset_policies('prompt_usages');
create policy prompt_usages_read on public.prompt_usages for select to authenticated using (user_id = auth.uid());

-- Audit
drop trigger if exists prompt_templates_audit on public.prompt_templates;
create trigger prompt_templates_audit after insert or update or delete on public.prompt_templates
  for each row execute function public.audit_row_change();
drop trigger if exists prompt_versions_audit on public.prompt_versions;
create trigger prompt_versions_audit after insert on public.prompt_versions
  for each row execute function public.audit_row_change();
