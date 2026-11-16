-- =============================================================================
-- Baseline du schéma POC CHANTAL (reconstitué)
-- =============================================================================
-- Les tables ci-dessous ont été créées manuellement dans le projet Supabase du
-- POC et n'étaient pas versionnées. Ce fichier les reconstitue À PARTIR DU CODE
-- (colonnes lues/écrites par l'application) afin de pouvoir recréer un
-- environnement vierge (dev, recette, tests).
--
-- ⚠️ Sur la base POC existante, toutes les instructions sont idempotentes
-- (IF NOT EXISTS) : elles ne modifient rien. La DSI doit néanmoins comparer
-- avec `supabase db dump --schema public` (cf. docs/06-migration.md).
-- =============================================================================

-- gen_random_uuid() est natif depuis PostgreSQL 13 : aucune extension requise.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'viewer',
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.ai_models (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  provider     text not null,
  description  text,
  model_id     text,
  env_key      text,
  avatar_url   text,
  min_role     text not null default 'beta_tester',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.agents (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text,
  description    text,
  system_prompt  text,
  use_cases      text,
  icon           text,
  avatar_url     text,
  min_role       text not null default 'beta_tester',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text,
  description    text,
  personality    text,
  system_prompt  text,
  avatar_url     text,
  ai_model_id    uuid references public.ai_models(id) on delete set null,
  agent_id       uuid references public.agents(id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text,
  ai_model_id  uuid references public.ai_models(id) on delete set null,
  agent_id     uuid references public.agents(id) on delete set null,
  partner_id   uuid references public.partners(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  role                text not null,
  content             text not null default '',
  speaker_name        text,
  speaker_avatar_url  text,
  speaker_icon        text,
  created_at          timestamptz not null default now()
);

create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  type         text not null default 'question',
  title        text not null,
  description  text not null default '',
  status       text not null default 'open',
  priority     text not null default 'medium',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  user_id     uuid,
  content     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles        enable row level security;
alter table public.ai_models       enable row level security;
alter table public.agents          enable row level security;
alter table public.partners        enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.tickets         enable row level security;
alter table public.ticket_messages enable row level security;
