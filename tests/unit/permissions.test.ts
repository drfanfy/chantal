import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, hasMinRole, hasPermission } from "@/lib/permissions";

describe("matrice de permissions", () => {
  it("est identique entre src/lib/permissions.ts et la migration SQL", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261116000100_rbac_audit.sql"), "utf8");
    const block = sql.slice(sql.indexOf("insert into public.role_permissions"), sql.indexOf(") as t(r, p);"));
    const pairs = [...block.matchAll(/\('(\w+)','([\w.]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
    const ts = ROLES.flatMap((r) => [...ROLE_PERMISSIONS[r]].map((p) => `${r}:${p}`)).sort();
    expect(pairs).toEqual(ts);
  });

  it("est hiérarchique : chaque rôle inclut les permissions du rôle inférieur", () => {
    for (let i = 0; i < ROLES.length - 1; i++) {
      for (const p of ROLE_PERMISSIONS[ROLES[i + 1]]) expect(ROLE_PERMISSIONS[ROLES[i]].has(p), `${ROLES[i]} ⊇ ${p}`).toBe(true);
    }
    expect(PERMISSIONS.every((p) => hasPermission("super_admin", p))).toBe(true);
  });

  it("réserve le catalogue IA aux super admins et refuse les rôles inconnus", () => {
    expect(hasPermission("admin", "model.manage")).toBe(false);
    expect(hasPermission("super_admin", "model.manage")).toBe(true);
    expect(hasPermission("viewer", "chat.use")).toBe(false);
    expect(hasPermission("hacker", "prompt.read")).toBe(false);
    expect(hasMinRole(null, "viewer")).toBe(false);
    expect(hasMinRole("admin", "beta_tester")).toBe(true);
  });
});
