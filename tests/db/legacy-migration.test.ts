import { describe, it, expect } from "vitest";
import { createTestDb } from "./harness";

// Données telles qu'elles existent dans la base POC avant la reprise.
const POC_DATA = `
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'francois@quartus.test'),
  ('00000000-0000-0000-0000-00000000000b', 'justine@quartus.test');
insert into public.profiles(id, email, full_name, role, is_active) values
  ('00000000-0000-0000-0000-00000000000a', 'francois@quartus.test', 'François', 'super_admin', true),
  ('00000000-0000-0000-0000-00000000000b', 'justine@quartus.test', 'Justine', 'beta_tester', true);
insert into public.ai_models(id, name, provider, model_id, is_active) values
  ('00000000-0000-0000-0000-0000000000f1', 'Llama 3', 'groq', 'llama-3.1-8b-instant', true);
insert into public.conversations(id, user_id, title, is_hidden) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Conv visible POC', false),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000b', 'Conv masquée POC', true);
insert into public.messages(conversation_id, role, content) values
  ('00000000-0000-0000-0000-0000000000c1', 'user', 'Bonjour'),
  ('00000000-0000-0000-0000-0000000000c1', 'assistant', 'Réponse');
`;

describe("Migration des données POC", () => {
  it("bascule toutes les conversations en privé, sans perte, avec traçabilité ; reprend les modèles", async () => {
    const t = await createTestDb({
      seedBefore: { migration: "20261116000100_rbac_audit.sql", sql: POC_DATA },
    });
    const convs = await t.db.query<{
      title: string;
      visibility: string;
      legacy_visibility: string;
    }>(`select title, visibility, legacy_visibility from public.conversations order by title`);
    expect(convs.rows).toEqual([
      { title: "Conv masquée POC", visibility: "private", legacy_visibility: "poc_hidden" },
      { title: "Conv visible POC", visibility: "private", legacy_visibility: "poc_visible_to_all" },
    ]);
    const msgs = await t.db.query<{ n: number }>(`select count(*)::int n from public.messages`);
    expect(msgs.rows[0].n).toBe(2);
    // Justine ne voit plus la conversation de François, et inversement (même super admin)
    const n = await t.asUser(
      "00000000-0000-0000-0000-00000000000b",
      async (tx) =>
        (await tx.query<{ n: number }>(`select count(*)::int n from public.conversations`)).rows[0]
          .n,
    );
    expect(n).toBe(1);
    const m = await t.db.query<{
      status: string;
      api_model_id: string;
      secret_ref: string;
      base_url: string;
    }>(
      `select m.status, m.api_model_id, c.secret_ref, c.base_url from public.ai_models m
         join public.ai_provider_connections c on c.id = m.connection_id where m.name = 'Llama 3'`,
    );
    expect(m.rows[0]).toEqual({
      status: "active",
      api_model_id: "llama-3.1-8b-instant",
      secret_ref: "GROQ_API_KEY",
      base_url: "https://api.groq.com/openai/v1",
    });
  });
});
