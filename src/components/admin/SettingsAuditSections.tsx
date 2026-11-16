import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { errorMessage } from "@/lib/api";
import { hasPermission, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import {
  Badge,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CheckboxField,
  DataTable,
  FilterSelect,
  FormSection,
  ROLE_OPTIONS,
  SearchBox,
  SectionHeader,
  SelectField,
  TextField,
  formatDate,
  type Column,
} from "./ui";

interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}
interface Mapping {
  id: string;
  group_value: string;
  role: UserRole;
  description: string | null;
}

export function SettingsSection() {
  const { profile } = useAuth();
  const canSettings = hasPermission(profile?.role, "settings.manage");
  const canMappings = hasPermission(profile?.role, "user.manage_super");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<SettingRow[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [newMap, setNewMap] = useState({
    group_value: "",
    role: "beta_tester" as UserRole,
    description: "",
  });

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([
      supabase.from("app_settings").select("*").order("key"),
      supabase.from("sso_group_role_mappings").select("*").order("group_value"),
    ]);
    const rows = (s.data ?? []) as SettingRow[];
    setMeta(rows);
    setSettings(Object.fromEntries(rows.map((r) => [r.key, JSON.stringify(r.value)])));
    setMappings((m.data ?? []) as Mapping[]);
  }, []);
  useEffect(() => void load(), [load]);

  async function saveSetting(key: string) {
    let value: unknown;
    try {
      value = JSON.parse(settings[key]);
    } catch {
      toast.error("Valeur invalide");
      return;
    }
    if (key.endsWith("_days") && (!Number.isInteger(value) || (value as number) < 30)) {
      toast.error("Nombre de jours entier ≥ 30 attendu");
      return;
    }
    const { error } = await supabase
      .from("app_settings")
      .update({ value, updated_by: profile?.id })
      .eq("key", key);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Paramètre enregistré");
      void load();
    }
  }
  async function addMapping() {
    if (!newMap.group_value.trim()) return;
    const { error } = await supabase
      .from("sso_group_role_mappings")
      .insert({ ...newMap, group_value: newMap.group_value.trim() });
    if (error) toast.error(errorMessage(error));
    else {
      setNewMap({ group_value: "", role: "beta_tester", description: "" });
      void load();
    }
  }
  async function removeMapping(id: string) {
    const { error } = await supabase.from("sso_group_role_mappings").delete().eq("id", id);
    if (error) toast.error(errorMessage(error));
    else void load();
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Paramètres"
        description="Rétention des données, mode démonstration du reporting et rattachement des groupes SSO aux rôles."
      />
      <FormSection
        title="Rétention et reporting"
        description="La purge est exécutée par la tâche de maintenance planifiée (docs/07-exploitation.md)."
      >
        <div className="space-y-3">
          {meta.map((r) => (
            <div
              key={r.key}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex-1 min-w-[16rem]">
                {r.key === "reporting_demo_mode" ? (
                  <CheckboxField
                    label={r.description ?? r.key}
                    disabled={!canSettings}
                    checked={settings[r.key] === "true"}
                    onChange={(x) => setSettings((s) => ({ ...s, [r.key]: String(x) }))}
                    help="Jamais en production : affiche un jeu de données fictif clairement signalé."
                  />
                ) : (
                  <TextField
                    label={r.description ?? r.key}
                    disabled={!canSettings}
                    value={settings[r.key] ?? ""}
                    onChange={(x) => setSettings((s) => ({ ...s, [r.key]: x }))}
                    help={`Clé : ${r.key} · modifié le ${formatDate(r.updated_at)}`}
                  />
                )}
              </div>
              {canSettings && (
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={settings[r.key] === JSON.stringify(r.value)}
                  onClick={() => void saveSetting(r.key)}
                >
                  Enregistrer
                </button>
              )}
            </div>
          ))}
        </div>
      </FormSection>
      <FormSection
        title="Groupes SSO → rôles"
        description="Appliqué à chaque connexion SSO si SSO_GROUP_SYNC=true (serveur). Le rôle le plus élevé correspondant est retenu. Valeurs de groupe : identifiants fournis par l'annuaire (ex. Object ID Entra)."
      >
        <DataTable
          rows={mappings}
          empty="Aucun mapping."
          columns={
            [
              {
                key: "g",
                header: "Groupe",
                cell: (m) => <span className="font-mono text-xs">{m.group_value}</span>,
              },
              { key: "r", header: "Rôle", cell: (m) => ROLE_LABELS[m.role] },
              { key: "d", header: "Description", cell: (m) => m.description ?? "—" },
              {
                key: "a",
                header: "",
                cell: (m) =>
                  canMappings && (
                    <button
                      type="button"
                      aria-label="Supprimer"
                      onClick={() => void removeMapping(m.id)}
                      className="p-1 text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ),
              },
            ] as Column<Mapping>[]
          }
        />
        {canMappings && (
          <div className="grid gap-3 md:grid-cols-[1fr_12rem_1fr_auto] items-end">
            <TextField
              label="Valeur de groupe"
              mono
              value={newMap.group_value}
              onChange={(x) => setNewMap({ ...newMap, group_value: x })}
            />
            <SelectField
              label="Rôle"
              value={newMap.role}
              onChange={(x) => setNewMap({ ...newMap, role: x })}
              options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <TextField
              label="Description"
              value={newMap.description}
              onChange={(x) => setNewMap({ ...newMap, description: x })}
            />
            <button type="button" className={BTN_PRIMARY} onClick={() => void addMapping()}>
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </div>
        )}
      </FormSection>
    </div>
  );
}

interface AuditRow {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  changes: unknown;
}
const PAGE = 50;

export function AuditSection() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [entity, setEntity] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("admin_audit_log")
      .select("*")
      .order("occurred_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (entity !== "all") query = query.eq("entity_type", entity);
    if (q.trim()) query = query.ilike("summary", `%${q.trim()}%`);
    const { data, error } = await query;
    if (error) toast.error(errorMessage(error));
    const list = (data ?? []).map((r) => ({ ...r, id: String(r.id) })) as AuditRow[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      setNames(
        Object.fromEntries(
          (p ?? []).map((x: { id: string; full_name: string | null; email: string | null }) => [
            x.id,
            x.full_name ?? x.email ?? x.id,
          ]),
        ),
      );
    }
    setLoading(false);
  }, [entity, q, page]);
  useEffect(() => void load(), [load]);

  return (
    <div>
      <SectionHeader
        title="Journal d'audit"
        description="Modifications administratives sensibles (rôles, catalogue IA, prompts, workflows, paramètres, modération). Immuable ; aucune valeur secrète n'y figure."
        actions={
          <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
          </button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-3 items-center">
        <SearchBox
          value={q}
          onChange={(x) => {
            setQ(x);
            setPage(0);
          }}
          placeholder="Libellé…"
        />
        <FilterSelect
          label="Objet"
          value={entity}
          onChange={(x) => {
            setEntity(x);
            setPage(0);
          }}
          options={[
            { value: "all", label: "Tous" },
            ...[
              "profiles",
              "ai_models",
              "ai_provider_connections",
              "ai_model_pricing",
              "agents",
              "partners",
              "prompt_templates",
              "prompt_versions",
              "workflow_definitions",
              "workflow_http_connections",
              "user_invitations",
              "sso_group_role_mappings",
              "conversations",
              "app_settings",
            ].map((e) => ({ value: e, label: e })),
          ]}
        />
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="Aucune entrée."
        onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
        columns={
          [
            {
              key: "d",
              header: "Date",
              cell: (r) => (
                <span className="text-xs whitespace-nowrap">{formatDate(r.occurred_at)}</span>
              ),
            },
            {
              key: "a",
              header: "Auteur",
              cell: (r) => (
                <span className="text-xs">
                  {r.actor_id ? (names[r.actor_id] ?? "…") : "Système"}
                  {r.actor_role && <span className="text-muted-foreground"> ({r.actor_role})</span>}
                </span>
              ),
            },
            {
              key: "x",
              header: "Action",
              cell: (r) => (
                <Badge
                  tone={r.action === "delete" ? "red" : r.action === "insert" ? "green" : "blue"}
                >
                  {r.action}
                </Badge>
              ),
            },
            {
              key: "o",
              header: "Objet",
              cell: (r) => (
                <div>
                  <div className="text-xs">
                    {r.entity_type} — {r.summary ?? r.entity_id}
                  </div>
                  {open === r.id && (
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[0.7rem]">
                      {JSON.stringify(r.changes, null, 2)}
                    </pre>
                  )}
                </div>
              ),
            },
          ] as Column<AuditRow>[]
        }
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Précédent
        </button>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={rows.length < PAGE}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
