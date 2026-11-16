/**
 * Harnais de test base de données : PGlite (Postgres compilé en WASM) +
 * reproduction minimale de l'environnement Supabase (schéma auth, rôles
 * anon / authenticated / service_role, claims JWT), puis application de
 * TOUTES les migrations de supabase/migrations dans l'ordre.
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const SUPABASE_STUB = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  is_sso_user boolean not null default false,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
                         current_setting('request.jwt.claim.sub', true)), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Role = "super_admin" | "admin" | "beta_tester" | "viewer";
export interface TestDb {
  db: PGlite;
  createUser(email: string, role: Role, active?: boolean): Promise<string>;
  asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asAnon<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export interface CreateOptions {
  /** SQL exécuté (en superutilisateur) juste avant d'appliquer la migration nommée. */
  seedBefore?: { migration: string; sql: string };
}

export async function createTestDb(opts: CreateOptions = {}): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    if (opts.seedBefore?.migration === file) await db.exec(opts.seedBefore.sql);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      const pos = Number((e as { position?: string }).position ?? 0);
      const ctx = pos
        ? ` … près de : ${sql.slice(Math.max(0, pos - 120), pos + 60).replace(/\s+/g, " ")}`
        : "";
      throw new Error(`Migration ${file} : ${(e as Error).message}${ctx}`);
    }
  }

  async function withRole<T>(
    role: string,
    claims: Record<string, unknown>,
    fn: (tx: Transaction) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });
  }

  return {
    db,
    async createUser(email, role, active = true) {
      const id = randomUUID();
      await db.query(`insert into auth.users(id, email) values ($1, $2)`, [id, email]);
      await db.query(
        `update public.profiles set role = $2, is_active = $3, full_name = $4, provisioning_source = 'admin' where id = $1`,
        [id, role, active, email.split("@")[0]],
      );
      return id;
    },
    asUser: (userId, fn) => withRole("authenticated", { sub: userId, role: "authenticated" }, fn),
    asService: (fn) => withRole("service_role", { role: "service_role" }, fn),
    asAnon: (fn) => withRole("anon", { role: "anon" }, fn),
  };
}

/** Exécute fn et renvoie le message d'erreur Postgres (ou null si succès). */
export async function pgError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
