-- =============================================================================
-- Conversations privées par défaut, partage explicite, pièces jointes protégées
-- =============================================================================
-- Comportement POC : toute conversation non masquée était lisible par tous.
-- Nouveau comportement : privée par défaut ; partage explicite par le
-- propriétaire ; aucun accès automatique des rôles d'administration aux
-- conversations privées.
-- Migration des données : TOUTES les conversations existantes deviennent
-- privées (protecteur, aucune suppression). Le propriétaire peut les
-- re-partager. L'ancien état est tracé dans legacy_visibility.
-- =============================================================================

alter table public.conversations
  add column if not exists is_hidden          boolean not null default false,
  add column if not exists visibility         text not null default 'private',
  add column if not exists shared_at          timestamptz,
  add column if not exists shared_by          uuid references auth.users(id) on delete set null,
  add column if not exists hidden_at          timestamptz,
  add column if not exists hidden_by          uuid references auth.users(id) on delete set null,
  add column if not exists legacy_visibility  text,
  add column if not exists ai_model_id        uuid references public.ai_models(id) on delete set null,
  add column if not exists agent_id           uuid references public.agents(id) on delete set null,
  add column if not exists partner_id         uuid references public.partners(id) on delete set null,
  add column if not exists updated_at         timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_visibility_check') then
    alter table public.conversations add constraint conversations_visibility_check
      check (visibility in ('private','shared'));
  end if;
end $$;

-- Traçabilité de l'état POC avant bascule (exécuté une seule fois)
update public.conversations
   set legacy_visibility = case when is_hidden then 'poc_hidden' else 'poc_visible_to_all' end
 where legacy_visibility is null;
update public.conversations set visibility = 'private' where legacy_visibility is not null and shared_at is null;

create index if not exists conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index if not exists conversations_shared_idx on public.conversations(updated_at desc) where visibility = 'shared';

alter table public.messages
  add column if not exists ai_model_id     uuid references public.ai_models(id) on delete set null,
  add column if not exists status          text not null default 'complete',
  add column if not exists usage_event_id  uuid;
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

-- ─── Fonction d'accès centrale (réutilisée par messages, PJ, favoris…) ───────
create or replace function public.can_read_conversation(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation_id
       and public.is_active_user()
       and ( c.user_id = auth.uid()
          or ( c.visibility = 'shared'
               and public.has_permission('conversation.read_shared')
               and (c.is_hidden = false or public.has_permission('conversation.moderate')) ) )
  )
$$;

create or replace function public.owns_conversation(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversations c
                  where c.id = p_conversation_id and c.user_id = auth.uid() and public.is_active_user())
$$;

-- ─── Garde-fous d'écriture ──────────────────────────────────────────────────
create or replace function public.conversations_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := greatest(now(), old.updated_at); end if;
  if public.is_service_context() then return new; end if;

  if tg_op = 'INSERT' then
    if new.visibility <> 'private' or new.is_hidden then
      raise exception 'Une conversation est créée privée' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Le propriétaire d''une conversation ne peut pas changer' using errcode = '42501';
  end if;
  if new.is_hidden is distinct from old.is_hidden
     or new.hidden_at is distinct from old.hidden_at or new.hidden_by is distinct from old.hidden_by then
    raise exception 'Modération réservée (fonction moderate_conversation)' using errcode = '42501';
  end if;
  if new.legacy_visibility is distinct from old.legacy_visibility then
    raise exception 'Champ non modifiable' using errcode = '42501';
  end if;
  if new.visibility is distinct from old.visibility then
    if new.visibility = 'shared' then
      if not public.has_permission('conversation.share') then
        raise exception 'Partage non autorisé pour votre rôle' using errcode = '42501';
      end if;
      new.shared_at := now(); new.shared_by := auth.uid();
    else
      new.shared_at := null; new.shared_by := null;
    end if;
  elsif new.shared_at is distinct from old.shared_at or new.shared_by is distinct from old.shared_by then
    raise exception 'Champ non modifiable' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists conversations_guard on public.conversations;
create trigger conversations_guard before insert or update on public.conversations
  for each row execute function public.conversations_guard();

select public._chantal_reset_policies('conversations');
-- Prédicat inline (et non via can_read_conversation) : INSERT … RETURNING
-- évalue cette policy sur la nouvelle ligne, invisible d'une sous-requête.
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_active_user() and (
           user_id = auth.uid()
           or ( visibility = 'shared'
                and public.has_permission('conversation.read_shared')
                and (is_hidden = false or public.has_permission('conversation.moderate')) )));
create policy conversations_insert on public.conversations for insert to authenticated
  with check (user_id = auth.uid() and public.has_permission('chat.use'));
create policy conversations_update on public.conversations for update to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid());
create policy conversations_delete on public.conversations for delete to authenticated
  using (user_id = auth.uid() and public.is_active_user());

select public._chantal_reset_policies('messages');
create policy messages_select on public.messages for select to authenticated
  using (public.can_read_conversation(conversation_id));
-- Le client ne peut insérer que des messages « user » dans SES conversations ;
-- les réponses IA sont écrites par le serveur (service_role).
create policy messages_insert on public.messages for insert to authenticated
  with check (role = 'user' and public.owns_conversation(conversation_id) and public.has_permission('chat.use'));
-- Pas d'update/delete : la suppression passe par la conversation (cascade).

-- ─── Modération (super_admin) : uniquement sur des conversations partagées ──
create or replace function public.moderate_conversation(p_conversation_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  if not public.has_permission('conversation.moderate') then
    raise exception 'Action réservée' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_conv.visibility <> 'shared' then
    raise exception 'Seules les conversations partagées peuvent être modérées' using errcode = '42501';
  end if;
  update public.conversations
     set is_hidden = p_hidden,
         hidden_at = case when p_hidden then now() else null end,
         hidden_by = case when p_hidden then auth.uid() else null end
   where id = p_conversation_id;
  insert into public.admin_audit_log(actor_id, actor_role, action, entity_type, entity_id, summary)
  values (auth.uid(), public.current_app_role(), case when p_hidden then 'hide' else 'unhide' end,
          'conversations', p_conversation_id::text, v_conv.title);
end $$;
revoke all on function public.moderate_conversation(uuid, boolean) from anon;

-- ─── Pièces jointes ─────────────────────────────────────────────────────────
create table if not exists public.message_attachments (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  message_id       uuid references public.messages(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  storage_path     text not null unique,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes >= 0),
  created_at       timestamptz not null default now()
);
create index if not exists message_attachments_conv_idx on public.message_attachments(conversation_id);
alter table public.message_attachments enable row level security;
select public._chantal_reset_policies('message_attachments');
create policy message_attachments_select on public.message_attachments for select to authenticated
  using (public.can_read_conversation(conversation_id));
create policy message_attachments_insert on public.message_attachments for insert to authenticated
  with check (user_id = auth.uid() and public.owns_conversation(conversation_id)
              and storage_path like auth.uid()::text || '/%');
create policy message_attachments_update on public.message_attachments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_conversation(conversation_id));

-- Storage : bucket privé + policies (uniquement si le schéma storage existe,
-- c.-à-d. sur Supabase ; ignoré dans les tests PGlite).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets(id, name, public) values ('chat-files','chat-files', false)
      on conflict (id) do update set public = false;
    execute 'drop policy if exists chantal_chat_files_insert on storage.objects';
    execute 'drop policy if exists chantal_chat_files_select on storage.objects';
    execute 'drop policy if exists chantal_chat_files_delete on storage.objects';
    execute $p$create policy chantal_chat_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text
                  and public.has_permission('chat.use'))$p$;
    execute $p$create policy chantal_chat_files_select on storage.objects for select to authenticated
      using (bucket_id = 'chat-files' and (
               (storage.foldername(name))[1] = auth.uid()::text
               or exists (select 1 from public.message_attachments a
                           where a.storage_path = name and public.can_read_conversation(a.conversation_id))))$p$;
    execute $p$create policy chantal_chat_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;
