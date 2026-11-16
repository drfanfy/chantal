-- =============================================================================
-- Favoris persistants par utilisateur + activité récente issue des usages réels
-- =============================================================================

create table if not exists public.user_favorites (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  resource_type  text not null check (resource_type in ('partner','agent','workflow','prompt','conversation')),
  resource_id    uuid not null,
  source         text not null default 'app' check (source in ('app','legacy_import')),
  created_at     timestamptz not null default now(),
  unique (user_id, resource_type, resource_id)
);
create index if not exists user_favorites_user_idx on public.user_favorites(user_id, created_at desc);

alter table public.user_favorites enable row level security;
select public._chantal_reset_policies('user_favorites');
create policy user_favorites_own on public.user_favorites for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

-- Les utilisateurs doivent pouvoir relire la version exacte d'un prompt qu'ils
-- ont utilisé (historique / activité), même si une version plus récente existe.
drop policy if exists prompt_versions_read on public.prompt_versions;
create policy prompt_versions_read on public.prompt_versions for select to authenticated
  using (public.has_permission('prompt.manage')
         or exists (select 1 from public.prompt_templates t
                     where t.id = prompt_id and t.published_version_id = prompt_versions.id
                       and t.status = 'published' and public.has_permission('prompt.read') and public.has_min_role(t.min_role))
         or exists (select 1 from public.prompt_usages u where u.version_id = prompt_versions.id and u.user_id = auth.uid()));

-- Favoris résolus. SECURITY INVOKER : les jointures passent par la RLS, donc une
-- ressource devenue inaccessible (droits, archivage, suppression) remonte avec
-- available = false et sans aucune information sur son contenu.
create or replace function public.get_my_favorites()
returns table(id uuid, resource_type text, resource_id uuid, created_at timestamptz,
              available boolean, title text, subtitle text, extra text, avatar_url text, icon text)
language sql stable security invoker set search_path = public as $$
  select f.id, f.resource_type, f.resource_id, f.created_at,
         coalesce(p.id, a.id, w.id, pt.id, c.id) is not null as available,
         coalesce(p.name, a.name, w.name, pv.title, c.title),
         coalesce(p.description, a.description, w.description, pv.description,
                  case when c.id is not null then case when c.user_id = auth.uid() then 'Ma conversation' else 'Conversation partagée' end end),
         coalesce(p.personality, w.category),
         coalesce(p.avatar_url, a.avatar_url),
         coalesce(a.icon, w.icon)
    from public.user_favorites f
    left join public.partners p on f.resource_type = 'partner' and p.id = f.resource_id
                               and p.is_active and p.archived_at is null
    left join public.agents a on f.resource_type = 'agent' and a.id = f.resource_id
                             and a.is_active and a.archived_at is null
    left join public.workflow_definitions w on f.resource_type = 'workflow' and w.id = f.resource_id and w.status = 'published'
    left join public.prompt_templates pt on f.resource_type = 'prompt' and pt.id = f.resource_id and pt.status = 'published'
    left join public.prompt_versions pv on pv.id = pt.published_version_id
    left join public.conversations c on f.resource_type = 'conversation' and c.id = f.resource_id
   where f.user_id = auth.uid()
   order by f.created_at desc
$$;

-- Import contrôlé des favoris historiques (localStorage) : appelé seulement
-- après confirmation explicite de l'utilisateur connecté ; ignore les
-- identifiants non-UUID (anciens partenaires statiques) et les ressources
-- inaccessibles ; aucun doublon (contrainte unique).
create or replace function public.import_legacy_favorites(p_items jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_item jsonb; v_type text; v_id uuid; n integer := 0; v_ok boolean;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'Format invalide' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_type := v_item->>'kind';
    begin v_id := (v_item->>'id')::uuid; exception when others then continue; end;
    if v_type not in ('partner','agent','workflow','prompt') then continue; end if;
    v_ok := case v_type
      when 'partner'  then exists (select 1 from public.partners where id = v_id)
      when 'agent'    then exists (select 1 from public.agents where id = v_id)
      when 'workflow' then exists (select 1 from public.workflow_definitions where id = v_id)
      when 'prompt'   then exists (select 1 from public.prompt_templates where id = v_id) end;
    if not v_ok then continue; end if;
    insert into public.user_favorites(user_id, resource_type, resource_id, source)
    values (auth.uid(), v_type, v_id, 'legacy_import') on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Activité récente de l'utilisateur courant (SECURITY INVOKER → RLS appliquée)
create or replace function public.get_recent_activity(p_limit integer default 20, p_before timestamptz default null)
returns table(kind text, ref_id uuid, title text, subtitle text, status text, occurred_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'conversation'::text, c.id, coalesce(c.title, 'Conversation'),
           coalesce(pa.name, ag.name, m.name),
           c.visibility, c.updated_at
      from public.conversations c
      left join public.partners pa on pa.id = c.partner_id
      left join public.agents ag on ag.id = c.agent_id
      left join public.ai_models m on m.id = c.ai_model_id
     where c.user_id = auth.uid()
    union all
    select 'workflow_run', r.id, coalesce(v.name, w.name, 'Workflow'),
           case when r.is_test then 'Test' else 'Version ' || v.version end,
           r.status, r.created_at
      from public.workflow_runs r
      left join public.workflow_versions v on v.id = r.version_id
      left join public.workflow_definitions w on w.id = r.workflow_id
     where r.user_id = auth.uid()
    union all
    select 'prompt', u.prompt_id, coalesce(pv.title, 'Prompt'), 'Version ' || pv.version, u.context, u.used_at
      from public.prompt_usages u
      left join public.prompt_versions pv on pv.id = u.version_id
     where u.user_id = auth.uid()
  ) a(kind, ref_id, title, subtitle, status, occurred_at)
  where p_before is null or a.occurred_at < p_before
  order by a.occurred_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;
