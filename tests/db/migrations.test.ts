import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });

describe("migrations", () => {
  it("s'appliquent toutes sur une base vierge et sont rejouables", async () => {
    const { rows } = await t.db.query<{ n: number }>(`select count(*)::int as n from public.prompt_templates where is_demo`);
    expect(rows[0].n).toBe(17);
  });
});
