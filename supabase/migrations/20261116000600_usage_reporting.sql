-- =============================================================================
-- Instrumentation des usages IA et reporting
-- =============================================================================
-- Un événement = UNE requête logique au fournisseur (pas un chunk de streaming).
-- Il est créé au démarrage (status 'started') puis finalisé une seule fois ;
-- request_id unique empêche tout double comptage (reprise, double clic…).
-- Aucun contenu de conversation n'est stocké ici.
-- =============================================================================

create table if not exists public.ai_usage_events (
  id                    uuid primary key default gen_random_uuid(),
  request_id            text not null unique,
  occurred_at           timestamptz not null default now(),
  finished_at           timestamptz,
  user_id               uuid references auth.users(id) on delete set null,
  source                text not null check (source in ('chat','workflow','title','admin_test')),
  status                text not null default 'started' check (status in ('started','success','error','cancelled')),
  error_code            text,
  conversation_id       uuid references public.conversations(id) on delete set null,
  workflow_id           uuid references public.workflow_definitions(id) on delete set null,
  workflow_run_id       uuid references public.workflow_runs(id) on delete set null,
  step_id               text,
  model_id              uuid references public.ai_models(id) on delete set null,
  api_model_id          text,
  adapter               text,
  connection_id         uuid references public.ai_provider_connections(id) on delete set null,
  agent_id              uuid references public.agents(id) on delete set null,
  partner_id            uuid references public.partners(id) on delete set null,
  attempt               integer not null default 1,
  latency_ms            integer check (latency_ms >= 0),
  duration_ms           integer check (duration_ms >= 0),
  input_tokens          integer check (input_tokens >= 0),
  output_tokens         integer check (output_tokens >= 0),
  cached_input_tokens   integer check (cached_input_tokens >= 0),
  estimated_cost        numeric(14,6) check (estimated_cost >= 0),
  cost_currency         text,
  pricing_id            uuid references public.ai_model_pricing(id) on delete set null
);
create index if not exists ai_usage_events_time_idx  on public.ai_usage_events(occurred_at);
create index if not exists ai_usage_events_user_idx  on public.ai_usage_events(user_id, occurred_at);
create index if not exists ai_usage_events_model_idx on public.ai_usage_events(model_id, occurred_at);
create index if not exists ai_usage_events_started_idx on public.ai_usage_events(user_id) where status = 'started';

alter table public.ai_usage_events enable row level security;
select public._chantal_reset_policies('ai_usage_events');
-- Aucune lecture directe : le reporting passe par report_usage() (agrégats).
-- Écriture : serveur uniquement (service_role).

-- ─── Reporting ──────────────────────────────────────────────────────────────
create or replace function public.report_usage(
  p_from timestamptz, p_to timestamptz,
  p_model_ids uuid[] default null, p_agent_ids uuid[] default null, p_workflow_ids uuid[] default null,
  p_include_tests boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.has_permission('reporting.view') then
    raise exception 'Reporting réservé aux administrateurs' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Période invalide (400 jours maximum)' using errcode = '22023';
  end if;

  with ev as (
    select e.*, m.name as model_name, coalesce(c.adapter, e.adapter) as provider,
           a.name as agent_name, w.name as workflow_name
      from public.ai_usage_events e
      left join public.ai_models m on m.id = e.model_id
      left join public.ai_provider_connections c on c.id = e.connection_id
      left join public.agents a on a.id = e.agent_id
      left join public.workflow_definitions w on w.id = e.workflow_id
     where e.occurred_at >= p_from and e.occurred_at < p_to
       and e.status <> 'started'
       and (p_include_tests or e.source <> 'admin_test')
       and (p_model_ids is null or e.model_id = any(p_model_ids))
       and (p_agent_ids is null or e.agent_id = any(p_agent_ids))
       and (p_workflow_ids is null or e.workflow_id = any(p_workflow_ids))
  ), runs as (
    select r.*, w.name as workflow_name
      from public.workflow_runs r join public.workflow_definitions w on w.id = r.workflow_id
     where r.created_at >= p_from and r.created_at < p_to
       and (p_include_tests or not r.is_test)
       and (p_workflow_ids is null or r.workflow_id = any(p_workflow_ids))
  ), convs as (
    select c.* from public.conversations c
     where c.created_at >= p_from and c.created_at < p_to
       and (p_model_ids is null or c.ai_model_id = any(p_model_ids))
       and (p_agent_ids is null or c.agent_id = any(p_agent_ids))
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'instrumentation_since', (select min(occurred_at) from public.ai_usage_events),
    'kpis', (select jsonb_build_object(
        'active_users', (select count(distinct u) from (select user_id u from ev union select user_id from runs) x where u is not null),
        'requests', count(*),
        'success', count(*) filter (where status = 'success'),
        'errors', count(*) filter (where status = 'error'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'latency_avg_ms', round(avg(latency_ms) filter (where status = 'success')),
        'latency_p95_ms', percentile_cont(0.95) within group (order by latency_ms) filter (where status = 'success' and latency_ms is not null),
        'duration_avg_ms', round(avg(duration_ms) filter (where status = 'success')),
        'input_tokens', sum(input_tokens),
        'output_tokens', sum(output_tokens),
        'requests_with_tokens', count(*) filter (where input_tokens is not null or output_tokens is not null),
        'estimated_cost', sum(estimated_cost),
        'requests_with_cost', count(*) filter (where estimated_cost is not null),
        'currencies', coalesce((select jsonb_agg(distinct cost_currency) from ev where cost_currency is not null), '[]'::jsonb),
        'conversations_created', (select count(*) from convs),
        'workflow_runs', (select count(*) from runs),
        'workflow_runs_succeeded', (select count(*) from runs where status = 'succeeded'),
        'workflow_runs_failed', (select count(*) from runs where status in ('failed','timed_out')),
        'workflow_retries', (select count(*) from runs where parent_run_id is not null)
      ) from ev),
    'by_model', coalesce((select jsonb_agg(row_to_json(t) order by t.requests desc) from (
        select model_id, coalesce(model_name, api_model_id, 'Inconnu') as name, provider,
               count(*) as requests, count(*) filter (where status = 'error') as errors,
               sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
               count(*) filter (where input_tokens is not null or output_tokens is not null) as requests_with_tokens,
               sum(estimated_cost) as estimated_cost, count(*) filter (where estimated_cost is not null) as requests_with_cost,
               round(avg(latency_ms) filter (where status = 'success')) as latency_avg_ms
          from ev group by model_id, coalesce(model_name, api_model_id, 'Inconnu'), provider) t), '[]'::jsonb),
    'by_provider', coalesce((select jsonb_agg(row_to_json(t) order by t.requests desc) from (
        select coalesce(provider,'inconnu') as provider, count(*) as requests,
               count(*) filter (where status = 'error') as errors, sum(estimated_cost) as estimated_cost,
               count(*) filter (where estimated_cost is not null) as requests_with_cost
          from ev group by coalesce(provider,'inconnu')) t), '[]'::jsonb),
    'by_agent', coalesce((select jsonb_agg(row_to_json(t) order by t.requests desc) from (
        select agent_id, agent_name as name, count(*) as requests, count(distinct user_id) as users,
               count(*) filter (where status = 'error') as errors
          from ev where agent_id is not null group by agent_id, agent_name) t), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(row_to_json(t)) from (
        select source, count(*) as requests, count(*) filter (where status = 'error') as errors
          from ev group by source) t), '[]'::jsonb),
    'by_workflow', coalesce((select jsonb_agg(row_to_json(t) order by t.runs desc) from (
        select r.workflow_id, r.workflow_name as name, count(*) as runs,
               count(*) filter (where r.status = 'succeeded') as succeeded,
               count(*) filter (where r.status in ('failed','timed_out')) as failed,
               count(*) filter (where r.parent_run_id is not null) as retries,
               round(avg(r.duration_ms) filter (where r.status = 'succeeded')) as avg_duration_ms,
               (select sum(estimated_cost) from ev where ev.workflow_id = r.workflow_id) as estimated_cost,
               (select count(*) from ev where ev.workflow_id = r.workflow_id and estimated_cost is null) as requests_without_cost
          from runs r group by r.workflow_id, r.workflow_name) t), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(row_to_json(t) order by t.day) from (
        select date_trunc('day', occurred_at)::date as day, count(*) as requests,
               count(*) filter (where status = 'error') as errors, count(distinct user_id) as active_users,
               sum(estimated_cost) as estimated_cost
          from ev group by 1) t), '[]'::jsonb),
    'pricing_used', coalesce((select jsonb_agg(row_to_json(t)) from (
        select distinct m.name as model, p.effective_from, p.currency, p.source_url
          from ev join public.ai_model_pricing p on p.id = ev.pricing_id
          join public.ai_models m on m.id = p.model_id) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.report_usage(timestamptz, timestamptz, uuid[], uuid[], uuid[], boolean) from anon;

-- Lignes d'export (agrégées par jour / dimension ; aucun contenu, aucun nom d'utilisateur)
create or replace function public.report_usage_rows(
  p_from timestamptz, p_to timestamptz,
  p_model_ids uuid[] default null, p_agent_ids uuid[] default null, p_workflow_ids uuid[] default null,
  p_include_tests boolean default false)
returns table(day date, source text, model text, provider text, agent text, workflow text, status text,
              requests bigint, input_tokens bigint, output_tokens bigint, requests_with_tokens bigint,
              estimated_cost numeric, cost_currency text, requests_with_cost bigint, avg_latency_ms numeric, avg_duration_ms numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('reporting.export') then
    raise exception 'Export réservé aux administrateurs' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Période invalide (400 jours maximum)' using errcode = '22023';
  end if;
  return query
    select date_trunc('day', e.occurred_at)::date, e.source, coalesce(m.name, e.api_model_id), coalesce(c.adapter, e.adapter),
           a.name, w.name, e.status, count(*), sum(e.input_tokens)::bigint, sum(e.output_tokens)::bigint,
           count(*) filter (where e.input_tokens is not null or e.output_tokens is not null),
           sum(e.estimated_cost), max(e.cost_currency), count(*) filter (where e.estimated_cost is not null),
           round(avg(e.latency_ms), 0), round(avg(e.duration_ms), 0)
      from public.ai_usage_events e
      left join public.ai_models m on m.id = e.model_id
      left join public.ai_provider_connections c on c.id = e.connection_id
      left join public.agents a on a.id = e.agent_id
      left join public.workflow_definitions w on w.id = e.workflow_id
     where e.occurred_at >= p_from and e.occurred_at < p_to and e.status <> 'started'
       and (p_include_tests or e.source <> 'admin_test')
       and (p_model_ids is null or e.model_id = any(p_model_ids))
       and (p_agent_ids is null or e.agent_id = any(p_agent_ids))
       and (p_workflow_ids is null or e.workflow_id = any(p_workflow_ids))
     group by 1, 2, 3, 4, 5, 6, 7
     order by 1, 3;
end $$;
revoke all on function public.report_usage_rows(timestamptz, timestamptz, uuid[], uuid[], uuid[], boolean) from anon;

-- ─── Rétention (paramétrable dans app_settings) ─────────────────────────────
create or replace function public.purge_expired_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usage int := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'usage_retention_days'), 395);
  v_runs  int := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'run_retention_days'), 395);
  v_audit int := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'audit_retention_days'), 1095);
  n1 int; n2 int; n3 int;
begin
  delete from public.ai_usage_events where occurred_at < now() - make_interval(days => v_usage);
  get diagnostics n1 = row_count;
  delete from public.workflow_runs r where r.created_at < now() - make_interval(days => v_runs)
     and r.status not in ('queued','running')
     and not exists (select 1 from public.workflow_runs c where c.parent_run_id = r.id);
  get diagnostics n2 = row_count;
  delete from public.admin_audit_log where occurred_at < now() - make_interval(days => v_audit);
  get diagnostics n3 = row_count;
  return jsonb_build_object('usage_events', n1, 'workflow_runs', n2, 'audit_entries', n3);
end $$;
revoke all on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;
