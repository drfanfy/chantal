/**
 * Tests de sécurité base de données (RLS, triggers de garde, RPC).
 * Chaque test s'exécute dans le rôle réel `authenticated` avec le JWT simulé
 * de l'utilisateur : ce sont les mêmes contrôles que ceux appliqués par
 * PostgREST/Supabase en production.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, pgError, type TestDb } from "./harness";

let t: TestDb;
let alice: string, bob: string, viewer: string, admin: string, superAdmin: string, inactive: string;

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice@quartus.test", "beta_tester");
  bob = await t.createUser("bob@quartus.test", "beta_tester");
  viewer = await t.createUser("viewer@quartus.test", "viewer");
  admin = await t.createUser("admin@quartus.test", "admin");
  superAdmin = await t.createUser("root@quartus.test", "super_admin");
  inactive = await t.createUser("old@quartus.test", "beta_tester", false);
});

async function newConversation(owner: string, title = "Projet confidentiel"): Promise<string> {
  return t.asUser(owner, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.conversations(user_id, title) values ($1, $2) returning id`, [owner, title]);
    await tx.query(`insert into public.messages(conversation_id, role, content) values ($1, 'user', 'Données sensibles')`, [rows[0].id]);
    return rows[0].id;
  });
}
const count = async (user: string, sql: string, params: unknown[] = []) =>
  t.asUser(user, async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`, params)).rows[0].n);

describe("Conversations privées par défaut", () => {
  it("une nouvelle conversation est privée et invisible des autres, y compris des super admins", async () => {
    const id = await newConversation(alice);
    expect(await count(alice, `select 1 from public.conversations where id = $1 and visibility = 'private'`, [id])).toBe(1);
    for (const other of [bob, viewer, admin, superAdmin]) {
      expect(await count(other, `select 1 from public.conversations where id = $1`, [id])).toBe(0);
      expect(await count(other, `select 1 from public.messages where conversation_id = $1`, [id])).toBe(0);
    }
  });

  it("refuse la création directe d'une conversation partagée", async () => {
    const err = await pgError(() => t.asUser(alice, (tx) =>
      tx.query(`insert into public.conversations(user_id, title, visibility) values ($1, 'x', 'shared')`, [alice])));
    expect(err).toMatch(/créée privée/);
  });

  it("un tiers ne peut ni écrire, ni modifier, ni supprimer une conversation privée en connaissant son id", async () => {
    const id = await newConversation(alice);
    expect(await pgError(() => t.asUser(bob, (tx) =>
      tx.query(`insert into public.messages(conversation_id, role, content) values ($1, 'user', 'intrusion')`, [id])))).toMatch(/row-level security/);
    await t.asUser(bob, (tx) => tx.query(`update public.conversations set title = 'pirate' where id = $1`, [id]));
    await t.asUser(bob, (tx) => tx.query(`delete from public.conversations where id = $1`, [id]));
    expect(await count(alice, `select 1 from public.conversations where id = $1 and title = 'Projet confidentiel'`, [id])).toBe(1);
  });

  it("le client ne peut pas forger une réponse « assistant »", async () => {
    const id = await newConversation(alice);
    expect(await pgError(() => t.asUser(alice, (tx) =>
      tx.query(`insert into public.messages(conversation_id, role, content) values ($1, 'assistant', 'faux')`, [id])))).toMatch(/row-level security/);
  });

  it("le partage explicite rend la conversation lisible (lecture seule) puis le retrait la masque", async () => {
    const id = await newConversation(alice);
    await t.asUser(alice, (tx) => tx.query(`update public.conversations set visibility = 'shared' where id = $1`, [id]));
    expect(await count(bob, `select 1 from public.conversations where id = $1 and shared_by = $2`, [id, alice])).toBe(1);
    expect(await count(viewer, `select 1 from public.messages where conversation_id = $1`, [id])).toBe(1);
    // lecture seule pour les autres
    await t.asUser(bob, (tx) => tx.query(`update public.conversations set title = 'modifié' where id = $1`, [id]));
    expect(await count(alice, `select 1 from public.conversations where id = $1 and title = 'Projet confidentiel'`, [id])).toBe(1);
    expect(await pgError(() => t.asUser(bob, (tx) =>
      tx.query(`insert into public.messages(conversation_id, role, content) values ($1, 'user', 'x')`, [id])))).toMatch(/row-level security/);
    // retrait
    await t.asUser(alice, (tx) => tx.query(`update public.conversations set visibility = 'private' where id = $1`, [id]));
    expect(await count(bob, `select 1 from public.conversations where id = $1`, [id])).toBe(0);
  });

  it("un lecteur (viewer) ne peut ni créer ni partager de conversation", async () => {
    expect(await pgError(() => t.asUser(viewer, (tx) =>
      tx.query(`insert into public.conversations(user_id, title) values ($1, 'x')`, [viewer])))).toMatch(/row-level security/);
  });

  it("un compte désactivé ne voit plus rien, même ses propres conversations", async () => {
    await t.db.query(`update public.profiles set is_active = true where id = $1`, [inactive]);
    const id = await newConversation(inactive);
    await t.db.query(`update public.profiles set is_active = false where id = $1`, [inactive]);
    expect(await count(inactive, `select 1 from public.conversations where id = $1`, [id])).toBe(0);
  });

  it("la modération (masquage) ne s'applique qu'aux conversations partagées et seulement par un super admin", async () => {
    const priv = await newConversation(alice);
    expect(await pgError(() => t.asUser(superAdmin, (tx) => tx.query(`select public.moderate_conversation($1, true)`, [priv]))))
      .toMatch(/partagées/);
    const shared = await newConversation(alice);
    await t.asUser(alice, (tx) => tx.query(`update public.conversations set visibility = 'shared' where id = $1`, [shared]));
    expect(await pgError(() => t.asUser(admin, (tx) => tx.query(`select public.moderate_conversation($1, true)`, [shared]))))
      .toMatch(/réservée/);
    expect(await pgError(() => t.asUser(alice, (tx) =>
      tx.query(`update public.conversations set is_hidden = true where id = $1`, [shared])))).toMatch(/Modération réservée/);
    await t.asUser(superAdmin, (tx) => tx.query(`select public.moderate_conversation($1, true)`, [shared]));
    expect(await count(bob, `select 1 from public.conversations where id = $1`, [shared])).toBe(0);
    expect(await count(alice, `select 1 from public.conversations where id = $1`, [shared])).toBe(1);
  });

  it("les pièces jointes suivent les droits de la conversation", async () => {
    const id = await newConversation(alice);
    await t.asUser(alice, (tx) => tx.query(
      `insert into public.message_attachments(conversation_id, user_id, storage_path, file_name, mime_type, size_bytes)
       values ($1, $2, $3, 'f.txt', 'text/plain', 10)`, [id, alice, alice + '/f.txt']));
    expect(await count(bob, `select 1 from public.message_attachments where conversation_id = $1`, [id])).toBe(0);
    expect(await pgError(() => t.asUser(bob, (tx) => tx.query(
      `insert into public.message_attachments(conversation_id, user_id, storage_path, file_name, mime_type, size_bytes)
       values ($1, $2, $3, 'g.txt', 'text/plain', 10)`, [id, bob, bob + '/g.txt'])))).toMatch(/row-level security/);
    await t.asUser(alice, (tx) => tx.query(`update public.conversations set visibility = 'shared' where id = $1`, [id]));
    expect(await count(bob, `select 1 from public.message_attachments where conversation_id = $1`, [id])).toBe(1);
  });
});

describe("Profils et rôles", () => {
  it("un utilisateur ne peut pas s'attribuer un rôle", async () => {
    expect(await pgError(() => t.asUser(alice, (tx) =>
      tx.query(`update public.profiles set role = 'super_admin' where id = $1`, [alice])))).toMatch(/non autorisée/);
  });
  it("un admin gère les rôles courants mais pas les super admins, ni son propre rôle", async () => {
    const u = await t.createUser("tmp@quartus.test", "viewer");
    await t.asUser(admin, (tx) => tx.query(`update public.profiles set role = 'beta_tester' where id = $1`, [u]));
    expect(await count(admin, `select 1 from public.profiles where id = $1 and role = 'beta_tester'`, [u])).toBe(1);
    expect(await pgError(() => t.asUser(admin, (tx) =>
      tx.query(`update public.profiles set role = 'super_admin' where id = $1`, [u])))).toMatch(/super administrateur/);
    expect(await pgError(() => t.asUser(admin, (tx) =>
      tx.query(`update public.profiles set is_active = false where id = $1`, [admin])))).toMatch(/propre rôle/);
  });
  it("les changements de rôle sont journalisés et le journal est immuable", async () => {
    const u = await t.createUser("audit@quartus.test", "viewer");
    await t.asUser(admin, (tx) => tx.query(`update public.profiles set role = 'beta_tester' where id = $1`, [u]));
    expect(await count(admin, `select 1 from public.admin_audit_log where entity_type = 'profiles' and entity_id = $1 and actor_id = $2`, [u, admin])).toBe(1);
    expect(await count(alice, `select 1 from public.admin_audit_log`)).toBe(0);
    expect(await pgError(() => t.asUser(superAdmin, (tx) => tx.query(`delete from public.admin_audit_log`)))).toMatch(/permission denied/);
  });
  it("l'annuaire n'expose que nom et avatar", async () => {
    const { fields } = await t.asUser(bob, (tx) => tx.query(`select * from public.profile_directory limit 1`));
    expect(fields.map((f) => f.name).sort()).toEqual(["avatar_url", "full_name", "id"]);
    expect(await count(bob, `select 1 from public.profiles where id <> $1`, [bob])).toBe(0);
  });
});

describe("Provisionnement des comptes", () => {
  it("un compte inconnu (ex. 1re connexion SSO) est créé inactif, sans inscription libre", async () => {
    await t.db.query(`insert into auth.users(email, raw_app_meta_data) values ('inconnu@quartus.test', '{"provider":"sso:entra"}')`);
    const { rows } = await t.db.query<{ is_active: boolean; provisioning_source: string; role: string }>(
      `select is_active, provisioning_source, role from public.profiles where email = 'inconnu@quartus.test'`);
    expect(rows[0]).toEqual({ is_active: false, provisioning_source: "pending_approval", role: "viewer" });
  });
  it("une invitation valide active le compte avec le rôle prévu, une seule fois", async () => {
    await t.asUser(admin, (tx) => tx.query(`insert into public.user_invitations(email, role) values ('invite@quartus.test', 'beta_tester')`));
    await t.db.query(`insert into auth.users(email) values ('invite@quartus.test')`);
    const { rows } = await t.db.query<{ is_active: boolean; role: string }>(`select is_active, role from public.profiles where email = 'invite@quartus.test'`);
    expect(rows[0]).toEqual({ is_active: true, role: "beta_tester" });
    await t.db.query(`insert into auth.users(email) values ('invite@quartus.test')`);
    const second = await t.db.query<{ n: number }>(`select count(*)::int n from public.profiles where email = 'invite@quartus.test' and is_active`);
    expect(second.rows[0].n).toBe(1);
  });
  it("un admin ne peut pas inviter un super admin", async () => {
    expect(await pgError(() => t.asUser(admin, (tx) =>
      tx.query(`insert into public.user_invitations(email, role) values ('x@quartus.test', 'super_admin')`)))).toMatch(/row-level security/);
  });
  it("le rattachement d'un ancien compte est explicite et transfère les données", async () => {
    const legacy = await t.createUser("legacy@quartus.test", "admin");
    const conv = await newConversation(legacy, "Historique");
    await t.db.query(`insert into auth.users(email) values ('legacy@quartus.test')`);
    const { rows } = await t.db.query<{ id: string }>(
      `select id from public.profiles where email = 'legacy@quartus.test' and provisioning_source = 'pending_approval'`);
    const sso = rows[0].id;
    expect(await pgError(() => t.asUser(admin, (tx) => tx.query(`select public.merge_user_accounts($1, $2)`, [legacy, sso])))).toMatch(/super/);
    await t.asUser(superAdmin, (tx) => tx.query(`select public.merge_user_accounts($1, $2)`, [legacy, sso]));
    expect(await count(sso, `select 1 from public.conversations where id = $1`, [conv])).toBe(1);
    const p = await t.db.query<{ role: string; is_active: boolean }>(`select role, is_active from public.profiles where id = $1`, [sso]);
    expect(p.rows[0]).toEqual({ role: "admin", is_active: true });
  });
});

describe("Catalogue IA", () => {
  it("seuls les super admins voient connexions et modèles non actifs", async () => {
    expect(await count(admin, `select 1 from public.ai_provider_connections`)).toBe(0);
    expect(await count(superAdmin, `select 1 from public.ai_provider_connections`)).toBeGreaterThan(0);
    expect(await count(alice, `select 1 from public.ai_models where status <> 'active'`)).toBe(0);
  });
  it("activation impossible sans connexion activée et test réussi ; résultats de test écrits par le serveur seulement", async () => {
    const { rows } = await t.db.query<{ id: string; connection_id: string }>(
      `select id, connection_id from public.ai_models where api_model_id = 'claude-sonnet-5-5'`);
    const m = rows[0];
    expect(await pgError(() => t.asUser(superAdmin, (tx) =>
      tx.query(`update public.ai_models set last_test_status = 'success', last_test_at = now() where id = $1`, [m.id])))).toMatch(/serveur/);
    expect(await pgError(() => t.asUser(superAdmin, (tx) =>
      tx.query(`update public.ai_models set status = 'active' where id = $1`, [m.id])))).toMatch(/connexion/);
    await t.asUser(superAdmin, (tx) => tx.query(`update public.ai_provider_connections set is_enabled = true where id = $1`, [m.connection_id]));
    expect(await pgError(() => t.asUser(superAdmin, (tx) =>
      tx.query(`update public.ai_models set status = 'active' where id = $1`, [m.id])))).toMatch(/test réussi/);
    await t.asService((tx) => tx.query(`update public.ai_models set last_test_status = 'success', last_test_at = now() where id = $1`, [m.id]));
    await t.asUser(superAdmin, (tx) => tx.query(`update public.ai_models set status = 'active' where id = $1`, [m.id]));
    expect(await count(alice, `select 1 from public.ai_models where id = $1`, [m.id])).toBe(1);
    // changer l'identifiant API invalide le test : réactivation exigée
    expect(await pgError(() => t.asUser(superAdmin, (tx) =>
      tx.query(`update public.ai_models set api_model_id = 'autre-modele' where id = $1`, [m.id])))).toMatch(/test réussi/);
    // désactiver la connexion désactive ses modèles (jamais de remplacement)
    await t.asUser(superAdmin, (tx) => tx.query(`update public.ai_provider_connections set is_enabled = false where id = $1`, [m.connection_id]));
    expect(await count(alice, `select 1 from public.ai_models where id = $1`, [m.id])).toBe(0);
  });
  it("un admin (non super) ne peut pas modifier le catalogue", async () => {
    await t.asUser(admin, (tx) => tx.query(`update public.ai_models set name = 'x'`));
    expect(await count(superAdmin, `select 1 from public.ai_models where name = 'x'`)).toBe(0);
  });
  it("les secret_ref sont des noms de variables, jamais des valeurs", async () => {
    expect(await pgError(() => t.asUser(superAdmin, (tx) =>
      tx.query(`insert into public.ai_provider_connections(name, adapter, secret_ref) values ('x', 'openai', 'sk-proj-abc123')`)))).toMatch(/check constraint/);
    expect(await pgError(() => t.asUser(superAdmin, (tx) =>
      tx.query(`insert into public.ai_provider_connections(name, adapter, base_url) values ('y', 'openai_compatible', 'http://169.254.169.254')`)))).toMatch(/check constraint/);
  });
});

describe("Prompts versionnés", () => {
  it("les utilisateurs voient les prompts publiés ; publication réservée ; versions immuables ; restauration = nouvelle version", async () => {
    expect(await count(viewer, `select 1 from public.prompt_templates where status = 'published'`)).toBe(17);
    const id = await t.asUser(admin, async (tx) => (await tx.query<{ id: string }>(
      `insert into public.prompt_templates(slug, draft) values ('test-prompt', '{"title":"T1","content":"Bonjour {{nom}}","variables":[{"name":"nom","label":"Nom"}]}') returning id`)).rows[0].id);
    expect(await count(viewer, `select 1 from public.prompt_templates where id = $1`, [id])).toBe(0);
    expect(await pgError(() => t.asUser(alice, (tx) => tx.query(`select public.publish_prompt($1)`, [id])))).toMatch(/réservée/);
    const v1 = await t.asUser(admin, async (tx) => (await tx.query<{ id: string }>(`select (public.publish_prompt($1, 'init')).id`, [id])).rows[0].id);
    await t.asUser(admin, (tx) => tx.query(`update public.prompt_templates set draft = draft || '{"title":"T2"}' where id = $1`, [id]));
    await t.asUser(admin, (tx) => tx.query(`select public.publish_prompt($1, 'titre')`, [id]));
    // Côté API : aucune policy d'écriture (0 ligne modifiée) ; côté base : trigger d'immuabilité.
    await t.asUser(admin, (tx) => tx.query(`update public.prompt_versions set content = 'x' where id = $1`, [v1]));
    expect(await count(admin, `select 1 from public.prompt_versions where id = $1 and content = 'x'`, [v1])).toBe(0);
    expect(await pgError(() => t.db.query(`update public.prompt_versions set content = 'x' where id = $1`, [v1]))).toMatch(/immuable/);
    expect(await pgError(() => t.db.query(`delete from public.prompt_versions where id = $1`, [v1]))).toMatch(/immuable/);
    await t.asUser(admin, (tx) => tx.query(`select public.restore_prompt_version($1)`, [v1]));
    await t.asUser(admin, (tx) => tx.query(`select public.publish_prompt($1, 'restauration v1')`, [id]));
    const { rows } = await t.db.query<{ version: number; title: string; restored_from_version: number | null }>(
      `select version, title, restored_from_version from public.prompt_versions where prompt_id = $1 order by version`, [id]);
    expect(rows).toEqual([
      { version: 1, title: "T1", restored_from_version: null },
      { version: 2, title: "T2", restored_from_version: null },
      { version: 3, title: "T1", restored_from_version: 1 },
    ]);
    // utilisation tracée avec la version exacte ; ancienne version non publiée refusée aux utilisateurs
    const current = (await t.db.query<{ id: string }>(`select published_version_id as id from public.prompt_templates where id = $1`, [id])).rows[0].id;
    await t.asUser(alice, (tx) => tx.query(`select public.record_prompt_usage($1)`, [current]));
    expect(await pgError(() => t.asUser(alice, (tx) => tx.query(`select public.record_prompt_usage($1)`, [v1])))).toMatch(/non disponible/);
    expect(await count(alice, `select 1 from public.prompt_usages where version_id = $1`, [current])).toBe(1);
  });
});

describe("Workflows", () => {
  it("publication via serveur uniquement, versions immuables, exécutions strictement personnelles et idempotentes", async () => {
    const wf = (await t.db.query<{ id: string }>(`select id from public.workflow_definitions where slug = 'poc-veille-seo'`)).rows[0].id;
    expect(await pgError(() => t.asUser(admin, (tx) =>
      tx.query(`select public.publish_workflow_version($1, '{}'::jsonb, 'h', 's', $2)`, [wf, admin])))).toMatch(/permission denied/);
    expect(await pgError(() => t.asUser(admin, (tx) =>
      tx.query(`update public.workflow_definitions set status = 'published' where id = $1`, [wf])))).toMatch(/version publiée/);
    const v = await t.asService(async (tx) => (await tx.query<{ id: string }>(
      `select (public.publish_workflow_version($1, '{"steps":[]}'::jsonb, 'hash1', 'v1', $2)).id`, [wf, admin])).rows[0].id);
    expect(await count(alice, `select 1 from public.workflow_definitions where id = $1`, [wf])).toBe(1);
    expect(await pgError(() => t.db.query(`update public.workflow_versions set definition = '{}' where id = $1`, [v]))).toMatch(/immuable/);

    await t.asService((tx) => tx.query(
      `insert into public.workflow_runs(workflow_id, version_id, user_id, idempotency_key, inputs) values ($1, $2, $3, 'cle-unique-1', '{"secret":"x"}')`, [wf, v, alice]));
    expect(await pgError(() => t.asService((tx) => tx.query(
      `insert into public.workflow_runs(workflow_id, version_id, user_id, idempotency_key) values ($1, $2, $3, 'cle-unique-1')`, [wf, v, alice])))).toMatch(/duplicate key/);
    expect(await count(alice, `select 1 from public.workflow_runs where workflow_id = $1`, [wf])).toBe(1);
    for (const other of [bob, admin, superAdmin]) expect(await count(other, `select 1 from public.workflow_runs where workflow_id = $1`, [wf])).toBe(0);
    expect(await pgError(() => t.asUser(alice, (tx) => tx.query(
      `insert into public.workflow_runs(workflow_id, version_id, user_id, idempotency_key) values ($1, $2, $3, 'cle-unique-2')`, [wf, v, alice])))).toMatch(/row-level security/);
    const stats = await t.asUser(admin, async (tx) => (await tx.query<{ s: Record<string, unknown> }>(`select public.workflow_usage_stats($1) s`, [wf])).rows[0].s);
    expect(stats.runs).toBe(1);
  });
});

describe("Reporting", () => {
  it("réservé aux admins, sans contenu, et distingue « 0 » de « indisponible »", async () => {
    const model = (await t.db.query<{ id: string }>(`select id from public.ai_models where api_model_id = 'gpt-6-luna'`)).rows[0].id;
    await t.asService((tx) => tx.query(
      `insert into public.ai_usage_events(request_id, user_id, source, status, model_id, latency_ms, duration_ms)
       values ('r1', $1, 'chat', 'success', $2, 100, 900), ('r2', $1, 'chat', 'started', $2, null, null)`, [alice, model]));
    expect(await pgError(() => t.asUser(alice, (tx) => tx.query(`select public.report_usage(now() - interval '1 day', now() + interval '1 day')`)))).toMatch(/réservé/);
    expect(await count(admin, `select 1 from public.ai_usage_events`)).toBe(0);
    const r = await t.asUser(admin, async (tx) => (await tx.query<{ r: { kpis: Record<string, unknown> } }>(
      `select public.report_usage(now() - interval '1 day', now() + interval '1 day') r`)).rows[0].r);
    expect(r.kpis.requests).toBe(1);               // l'événement « started » n'est pas compté
    expect(r.kpis.input_tokens).toBeNull();        // indisponible ≠ 0
    expect(r.kpis.requests_with_tokens).toBe(0);
    expect(r.kpis.estimated_cost).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/Données sensibles|content/);
    expect(await pgError(() => t.asService((tx) => tx.query(
      `insert into public.ai_usage_events(request_id, source) values ('r1', 'chat')`)))).toMatch(/duplicate key/);
  });
});

describe("Favoris et activité", () => {
  it("favoris personnels, ressource inaccessible signalée, import historique sans doublon", async () => {
    const partner = (await t.db.query<{ id: string }>(`insert into public.partners(name) values ('Eva') returning id`)).rows[0].id;
    await t.asUser(alice, (tx) => tx.query(`insert into public.user_favorites(user_id, resource_type, resource_id) values ($1, 'partner', $2)`, [alice, partner]));
    expect(await count(bob, `select 1 from public.user_favorites`)).toBe(0);
    expect(await pgError(() => t.asUser(bob, (tx) =>
      tx.query(`insert into public.user_favorites(user_id, resource_type, resource_id) values ($1, 'partner', $2)`, [alice, partner])))).toMatch(/row-level security/);
    let favs = await t.asUser(alice, async (tx) => (await tx.query<{ available: boolean; title: string | null }>(`select * from public.get_my_favorites()`)).rows);
    expect(favs).toMatchObject([{ available: true, title: "Eva" }]);
    await t.db.query(`update public.partners set archived_at = now() where id = $1`, [partner]);
    favs = await t.asUser(alice, async (tx) => (await tx.query<{ available: boolean; title: string | null }>(`select * from public.get_my_favorites()`)).rows);
    expect(favs).toMatchObject([{ available: false, title: null }]);
    await t.db.query(`update public.partners set archived_at = null where id = $1`, [partner]);
    const n = await t.asUser(bob, async (tx) => (await tx.query<{ n: number }>(`select public.import_legacy_favorites($1) n`, [
      JSON.stringify([{ kind: "partner", id: partner }, { kind: "partner", id: partner }, { kind: "partner", id: "eva" }, { kind: "hack", id: partner }]),
    ])).rows[0].n);
    expect(n).toBe(1);
  });

  it("l'activité récente ne contient que les usages de l'utilisateur", async () => {
    const mine = await newConversation(bob, "Conversation de Bob");
    await newConversation(alice, "Conversation d'Alice");
    const rows = await t.asUser(bob, async (tx) => (await tx.query<{ ref_id: string; title: string }>(`select * from public.get_recent_activity(50)`)).rows);
    expect(rows.some((r) => r.ref_id === mine)).toBe(true);
    expect(rows.some((r) => r.title === "Conversation d'Alice")).toBe(false);
  });
});

describe("Accès anonyme", () => {
  it("ne voit aucune donnée", async () => {
    for (const table of ["conversations", "messages", "profiles", "prompt_templates", "workflow_definitions", "ai_models"]) {
      const n = await t.asAnon(async (tx) => (await tx.query<{ n: number }>(`select count(*)::int n from public.${table}`)).rows[0].n);
      expect(n, table).toBe(0);
    }
  });
});
