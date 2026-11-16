-- =============================================================================
-- Catalogue IA : connexions fournisseurs, modèles, tarifs ; agents/partenaires
-- =============================================================================
-- Trois niveaux séparés :
--   1. Adaptateur technique (code : src/server/ai/adapters/*) — identifié par `adapter`.
--   2. Connexion fournisseur (ai_provider_connections) — endpoint, version, région,
--      RÉFÉRENCE de secret (nom de variable d'environnement serveur), jamais la clé.
--   3. Modèles du catalogue (ai_models) — administrables sans redéploiement.
-- =============================================================================

create table if not exists public.ai_provider_connections (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  adapter               text not null check (adapter in ('openai','anthropic','google','openai_compatible','mock')),
  base_url              text check (base_url is null or base_url ~ '^https://[^\s/]+(/[^\s]*)?$'),
  api_version           text,
  region                text,
  deployment            text,
  secret_ref            text check (secret_ref is null or secret_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  is_enabled            boolean not null default false,
  notes                 text,
  last_test_at          timestamptz,
  last_test_status      text check (last_test_status in ('success','error')),
  last_test_error       text,
  last_test_latency_ms  integer,
  archived_at           timestamptz,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists ai_provider_connections_name_uniq on public.ai_provider_connections(lower(name));

alter table public.ai_models
  add column if not exists connection_id            uuid references public.ai_provider_connections(id) on delete restrict,
  add column if not exists api_model_id             text,
  add column if not exists display_order            integer not null default 100,
  add column if not exists icon                     text,
  add column if not exists capabilities             jsonb not null default '{"text":true,"streaming":true}'::jsonb,
  add column if not exists default_params           jsonb not null default '{}'::jsonb,
  add column if not exists param_limits             jsonb not null default '{}'::jsonb,
  add column if not exists availability             jsonb not null default '{"chat":true,"agents":true,"workflows":true}'::jsonb,
  add column if not exists status                   text not null default 'draft',
  add column if not exists quota_requests_per_user_day integer check (quota_requests_per_user_day is null or quota_requests_per_user_day > 0),
  add column if not exists quota_tokens_per_month   bigint  check (quota_tokens_per_month is null or quota_tokens_per_month > 0),
  add column if not exists max_concurrency_per_user integer check (max_concurrency_per_user is null or max_concurrency_per_user between 1 and 50),
  add column if not exists config_updated_at        timestamptz not null default now(),
  add column if not exists last_test_at             timestamptz,
  add column if not exists last_test_status         text,
  add column if not exists last_test_error          text,
  add column if not exists last_test_latency_ms     integer,
  add column if not exists archived_at              timestamptz,
  add column if not exists updated_at               timestamptz not null default now(),
  add column if not exists created_by               uuid references auth.users(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ai_models_status_check') then
    alter table public.ai_models add constraint ai_models_status_check
      check (status in ('draft','active','disabled','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_models_min_role_check') then
    update public.ai_models set min_role = 'beta_tester'
     where min_role not in ('super_admin','admin','beta_tester','viewer');
    alter table public.ai_models add constraint ai_models_min_role_check
      check (min_role in ('super_admin','admin','beta_tester','viewer'));
  end if;
end $$;

-- ─── Reprise des modèles du POC ─────────────────────────────────────────────
-- Une connexion par fournisseur historique ; les clés restent dans l'env serveur.
insert into public.ai_provider_connections(name, adapter, base_url, secret_ref, is_enabled, notes)
select distinct on (lower(m.provider))
  case lower(m.provider) when 'groq' then 'Groq (POC)' when 'openai' then 'OpenAI (POC)'
       when 'google' then 'Google Gemini (POC)' else 'Connexion POC ' || m.provider end,
  case lower(m.provider) when 'openai' then 'openai' when 'google' then 'google' else 'openai_compatible' end,
  case lower(m.provider) when 'groq' then 'https://api.groq.com/openai/v1' else null end,
  case lower(m.provider) when 'groq' then 'GROQ_API_KEY' when 'openai' then 'OPENAI_API_KEY'
       when 'google' then 'GEMINI_API_KEY'
       else 'CHANTAL_SECRET_' || left(regexp_replace(upper(m.provider), '[^A-Z0-9]', '_', 'g'), 40) end,
  lower(m.provider) in ('groq','openai','google'),
  'Créée automatiquement lors de la reprise du POC (provider = ' || m.provider || ').'
from public.ai_models m
where m.connection_id is null
  and not exists (select 1 from public.ai_provider_connections c
                   where lower(c.name) = lower(case lower(m.provider) when 'groq' then 'Groq (POC)' when 'openai' then 'OpenAI (POC)'
                         when 'google' then 'Google Gemini (POC)' else 'Connexion POC ' || m.provider end));

update public.ai_models m
   set connection_id = c.id,
       api_model_id  = coalesce(m.api_model_id, m.model_id),
       status        = case when m.is_active then 'active' else 'disabled' end
  from public.ai_provider_connections c
 where m.connection_id is null
   and lower(c.name) = lower(case lower(m.provider) when 'groq' then 'Groq (POC)' when 'openai' then 'OpenAI (POC)'
                           when 'google' then 'Google Gemini (POC)' else 'Connexion POC ' || m.provider end);

-- ─── Tarifs (historisés, date d'effet) ──────────────────────────────────────
create table if not exists public.ai_model_pricing (
  id                     uuid primary key default gen_random_uuid(),
  model_id               uuid not null references public.ai_models(id) on delete restrict,
  currency               text not null default 'USD' check (currency in ('USD','EUR')),
  input_per_mtok         numeric(12,6) not null check (input_per_mtok >= 0),
  output_per_mtok        numeric(12,6) not null check (output_per_mtok >= 0),
  cached_input_per_mtok  numeric(12,6) check (cached_input_per_mtok >= 0),
  effective_from         date not null,
  source_url             text,
  notes                  text,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  unique (model_id, effective_from)
);

-- Tarif applicable à une date donnée
create or replace function public.pricing_at(p_model_id uuid, p_at timestamptz)
returns public.ai_model_pricing language sql stable as $$
  select * from public.ai_model_pricing
   where model_id = p_model_id and effective_from <= p_at::date
   order by effective_from desc limit 1
$$;

-- ─── Garde-fous modèles ─────────────────────────────────────────────────────
create or replace function public.ai_models_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_conn public.ai_provider_connections;
begin
  new.updated_at := now();
  new.is_active := (new.status = 'active');          -- compatibilité code POC
  new.model_id  := coalesce(new.api_model_id, new.model_id);
  if new.status = 'archived' and new.archived_at is null then new.archived_at := now(); end if;
  if new.status <> 'archived' then new.archived_at := null; end if;

  if tg_op = 'UPDATE' and (new.api_model_id is distinct from old.api_model_id
      or new.connection_id is distinct from old.connection_id
      or new.default_params is distinct from old.default_params
      or new.capabilities is distinct from old.capabilities) then
    new.config_updated_at := now();
  end if;

  if public.is_service_context() then return new; end if;

  -- Résultats de test : écrits uniquement par le serveur
  if tg_op = 'INSERT' then
    new.last_test_at := null; new.last_test_status := null; new.last_test_error := null; new.last_test_latency_ms := null;
  elsif new.last_test_at is distinct from old.last_test_at or new.last_test_status is distinct from old.last_test_status
     or new.last_test_error is distinct from old.last_test_error then
    raise exception 'Les résultats de test sont écrits par le serveur' using errcode = '42501';
  end if;

  -- Activation : connexion activée + test réussi sur la configuration courante
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active' or new.config_updated_at <> old.config_updated_at) then
    select * into v_conn from public.ai_provider_connections where id = new.connection_id;
    if v_conn.id is null or not v_conn.is_enabled or v_conn.archived_at is not null then
      raise exception 'Activation impossible : connexion absente ou désactivée' using errcode = '23514';
    end if;
    if new.last_test_status is distinct from 'success' or new.last_test_at < new.config_updated_at then
      raise exception 'Activation impossible : lancez d''abord un test réussi de ce modèle' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists ai_models_guard on public.ai_models;
create trigger ai_models_guard before insert or update on public.ai_models
  for each row execute function public.ai_models_guard();

create or replace function public.ai_connections_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if public.is_service_context() then return new; end if;
  if tg_op = 'INSERT' then
    new.last_test_at := null; new.last_test_status := null; new.last_test_error := null; new.last_test_latency_ms := null;
  elsif new.last_test_at is distinct from old.last_test_at or new.last_test_status is distinct from old.last_test_status
     or new.last_test_error is distinct from old.last_test_error then
    raise exception 'Les résultats de test sont écrits par le serveur' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.adapter is distinct from old.adapter then
    raise exception 'L''adaptateur d''une connexion ne peut pas changer : créez une nouvelle connexion' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists ai_connections_guard on public.ai_provider_connections;
create trigger ai_connections_guard before insert or update on public.ai_provider_connections
  for each row execute function public.ai_connections_guard();

-- Une connexion désactivée/archivée désactive ses modèles actifs (jamais de remplacement)
create or replace function public.ai_connections_cascade_disable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.is_enabled = false or new.archived_at is not null) then
    update public.ai_models set status = 'disabled' where connection_id = new.id and status = 'active';
  end if;
  return new;
end $$;
drop trigger if exists ai_connections_cascade_disable on public.ai_provider_connections;
create trigger ai_connections_cascade_disable after update of is_enabled, archived_at on public.ai_provider_connections
  for each row execute function public.ai_connections_cascade_disable();

-- ─── Agents et partenaires ──────────────────────────────────────────────────
alter table public.agents
  add column if not exists default_model_id uuid references public.ai_models(id) on delete set null,
  add column if not exists archived_at      timestamptz,
  add column if not exists updated_at       timestamptz not null default now(),
  add column if not exists created_by       uuid references auth.users(id) on delete set null;
alter table public.partners
  add column if not exists min_role     text not null default 'beta_tester',
  add column if not exists archived_at  timestamptz,
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists created_by   uuid references auth.users(id) on delete set null;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists agents_touch on public.agents;
create trigger agents_touch before update on public.agents for each row execute function public.touch_updated_at();
drop trigger if exists partners_touch on public.partners;
create trigger partners_touch before update on public.partners for each row execute function public.touch_updated_at();

-- ─── Audit ──────────────────────────────────────────────────────────────────
drop trigger if exists ai_provider_connections_audit on public.ai_provider_connections;
create trigger ai_provider_connections_audit after insert or update or delete on public.ai_provider_connections
  for each row execute function public.audit_row_change();
drop trigger if exists ai_models_audit on public.ai_models;
create trigger ai_models_audit after insert or update or delete on public.ai_models
  for each row execute function public.audit_row_change();
drop trigger if exists ai_model_pricing_audit on public.ai_model_pricing;
create trigger ai_model_pricing_audit after insert or update or delete on public.ai_model_pricing
  for each row execute function public.audit_row_change();
drop trigger if exists agents_audit on public.agents;
create trigger agents_audit after insert or update or delete on public.agents
  for each row execute function public.audit_row_change();
drop trigger if exists partners_audit on public.partners;
create trigger partners_audit after insert or update or delete on public.partners
  for each row execute function public.audit_row_change();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.ai_provider_connections enable row level security;
alter table public.ai_model_pricing enable row level security;

select public._chantal_reset_policies('ai_provider_connections');
create policy ai_connections_admin on public.ai_provider_connections for all to authenticated
  using (public.has_permission('model.manage')) with check (public.has_permission('model.manage'));

select public._chantal_reset_policies('ai_models');
create policy ai_models_select on public.ai_models for select to authenticated
  using (public.has_permission('model.manage')
         or (public.is_active_user() and status = 'active' and public.has_min_role(min_role)));
create policy ai_models_write on public.ai_models for all to authenticated
  using (public.has_permission('model.manage')) with check (public.has_permission('model.manage'));

select public._chantal_reset_policies('ai_model_pricing');
create policy ai_model_pricing_select on public.ai_model_pricing for select to authenticated
  using (public.has_permission('model.manage') or public.has_permission('reporting.view'));
create policy ai_model_pricing_write on public.ai_model_pricing for all to authenticated
  using (public.has_permission('model.manage')) with check (public.has_permission('model.manage'));

select public._chantal_reset_policies('agents');
create policy agents_select on public.agents for select to authenticated
  using (public.has_permission('agent.manage')
         or (public.is_active_user() and is_active and archived_at is null and public.has_min_role(min_role)));
create policy agents_write on public.agents for all to authenticated
  using (public.has_permission('agent.manage')) with check (public.has_permission('agent.manage'));

select public._chantal_reset_policies('partners');
create policy partners_select on public.partners for select to authenticated
  using (public.has_permission('partner.manage')
         or (public.is_active_user() and is_active and archived_at is null and public.has_min_role(min_role)));
create policy partners_write on public.partners for all to authenticated
  using (public.has_permission('partner.manage')) with check (public.has_permission('partner.manage'));

-- ─── Catalogue initial (désactivé : activer après test réel) ─────────────────
-- Identifiants et tarifs vérifiés le 16/11/2026 : docs/annexes/verification-modeles-2026-11-16.md
insert into public.ai_provider_connections(name, adapter, secret_ref, is_enabled, notes) values
  ('Anthropic',      'anthropic', 'ANTHROPIC_API_KEY', false, 'API Claude officielle (SDK @anthropic-ai/sdk).'),
  ('OpenAI',         'openai',    'OPENAI_API_KEY',    false, 'API OpenAI officielle (Chat Completions).'),
  ('Google Gemini',  'google',    'GEMINI_API_KEY',    false, 'Gemini API (generateContent).')
on conflict do nothing;

with seed(conn, name, api_id, descr, ord, caps, params) as (values
  ('Anthropic', 'Claude Opus 5.5',  'claude-opus-5-5',  'Raisonnement avancé, rédaction longue, analyse de documents.', 10,
     '{"text":true,"streaming":true,"vision":true,"files":true,"structured_output":false,"tools":false}', '{"max_output_tokens":16000}'),
  ('Anthropic', 'Claude Sonnet 5.5','claude-sonnet-5-5','Usage courant et workflows : bon compromis qualité / coût.', 20,
     '{"text":true,"streaming":true,"vision":true,"files":true,"structured_output":false,"tools":false}', '{"max_output_tokens":16000}'),
  ('OpenAI',    'GPT-6 Astra',      'gpt-6-astra',      'Modèle phare OpenAI.', 30,
     '{"text":true,"streaming":true,"vision":true,"files":false,"structured_output":true,"tools":false}', '{"max_output_tokens":16000}'),
  ('OpenAI',    'GPT-6 Luna',       'gpt-6-luna',       'Rapide et économique : volume, titres, tâches simples.', 40,
     '{"text":true,"streaming":true,"vision":true,"files":false,"structured_output":true,"tools":false}', '{"max_output_tokens":8000}'),
  ('Google Gemini','Gemini 3.8 Flash','gemini-3.8-flash','Multimodal rapide (Google).', 50,
     '{"text":true,"streaming":true,"vision":false,"files":false,"structured_output":true,"tools":false}', '{"max_output_tokens":8000}')
)
insert into public.ai_models(name, provider, description, api_model_id, model_id, connection_id, display_order,
                             capabilities, default_params, status, min_role)
select s.name, c.adapter, s.descr, s.api_id, s.api_id, c.id, s.ord, s.caps::jsonb, s.params::jsonb, 'disabled', 'beta_tester'
  from seed s join public.ai_provider_connections c on c.name = s.conn
 where not exists (select 1 from public.ai_models m where m.api_model_id = s.api_id);

with p(api_id, eff, inp, outp, cached, src, note) as (values
  ('claude-opus-5-5',   date '2026-10-06', 4.00, 20.00, 0.20,  'https://platform.claude.com/docs/en/about-claude/pricing', null),
  ('claude-sonnet-5-5', date '2026-10-06', 2.00, 10.00, 0.20,  'https://platform.claude.com/docs/en/about-claude/pricing', null),
  ('gpt-6-astra',       date '2026-11-16', 10.00, 50.00, 1.00, 'https://developers.openai.com/api/docs/pricing', 'Tarif standard ≤ 272K tokens d''entrée ; au-delà 20 / 75.'),
  ('gpt-6-luna',        date '2026-11-16', 0.10, 0.50, 0.01,   'https://developers.openai.com/api/docs/pricing', 'Tarif standard ≤ 272K tokens d''entrée ; au-delà 0,20 / 0,75.'),
  ('gemini-3.8-flash',  date '2026-11-16', 0.75, 3.75, 0.075,  'https://aistudio.google.com/docs/pricing', 'Tarif valable jusqu''au 31/12/2026.'),
  ('gemini-3.8-flash',  date '2027-01-01', 1.50, 7.50, 0.15,   'https://aistudio.google.com/docs/pricing', 'Nouveau tarif annoncé au 01/01/2027.')
)
insert into public.ai_model_pricing(model_id, effective_from, input_per_mtok, output_per_mtok, cached_input_per_mtok, source_url, notes)
select m.id, p.eff, p.inp, p.outp, p.cached, p.src, p.note
  from p join public.ai_models m on m.api_model_id = p.api_id
on conflict (model_id, effective_from) do nothing;
