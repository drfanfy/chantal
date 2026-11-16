/**
 * Faux client Supabase en mémoire (sous-ensemble de l'API PostgREST utilisé
 * par la passerelle IA et le moteur de workflows). Sert uniquement aux tests :
 * il n'applique AUCUNE RLS (équivalent service_role).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
  uniques: Record<string, string[][]> = { ai_usage_events: [["request_id"]], workflow_runs: [["user_id", "idempotency_key"]] };

  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  client(): SupabaseClient {
    return { from: (t: string) => new Query(this, t), rpc: async (fn: string, args: Record<string, unknown> = {}) => ({ data: this.rpcs[fn]?.(args) ?? null, error: null }) } as unknown as SupabaseClient;
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private mode: "one" | "maybe" | null = null;
  private wantCount = false;
  private head = false;
  private limitN: number | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private returning = false;

  constructor(private db: FakeDb, private name: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: Row, opts?: { count?: string }) {
    this.op = "update";
    this.payload = p;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
  lt(c: string, v: string) { this.filters.push((r) => String(r[c]) < v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.limitN = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "one"; return this; }

  private run(): { data: unknown; error: unknown; count?: number } {
    const rows = this.db.table(this.name);
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const created: Row[] = [];
      for (const p of list) {
        const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), occurred_at: new Date().toISOString(), ...p };
        for (const cols of this.db.uniques[this.name] ?? []) {
          if (rows.some((r) => cols.every((c) => r[c] === row[c]))) return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        rows.push(row);
        created.push(row);
      }
      return { data: this.mode ? created[0] : created, error: null };
    }
    let matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      matched.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? matched : null, error: null, count: matched.length };
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.limitN !== null) matched = matched.slice(0, this.limitN);
    if (this.head) return { data: null, error: null, count: matched.length };
    if (this.mode === "one") return matched[0] ? { data: matched[0], error: null } : { data: null, error: { code: "PGRST116" } };
    if (this.mode === "maybe") return { data: matched[0] ?? null, error: null };
    return { data: matched, error: null, count: this.wantCount ? matched.length : undefined };
  }

  then<T1, T2>(ok?: (v: { data: unknown; error: unknown; count?: number }) => T1 | PromiseLike<T1>, ko?: (e: unknown) => T2 | PromiseLike<T2>) {
    return Promise.resolve().then(() => this.run()).then(ok, ko);
  }
}
