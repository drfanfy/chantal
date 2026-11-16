/**
 * Agents et partenaires IA (un seul composant paramétré : mêmes besoins
 * d'édition — prompt système long, rôle minimum, archivage, avatar).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Copy, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/api";
import { invalidateAIConfig } from "@/lib/useAIConfig";
import {
  Badge,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CheckboxField,
  DataTable,
  EditorSheet,
  FormGrid,
  ROLE_OPTIONS,
  SearchBox,
  SectionHeader,
  SelectField,
  TextAreaField,
  TextField,
  formatDate,
  toSlug,
  useDirtyForm,
  type Column,
} from "./ui";

type Kind = "agents" | "partners";
interface Row {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  system_prompt: string | null;
  avatar_url: string | null;
  min_role: string;
  is_active: boolean;
  archived_at: string | null;
  updated_at: string | null;
  icon?: string | null;
  use_cases?: string | null;
  default_model_id?: string | null;
  personality?: string | null;
  ai_model_id?: string | null;
  agent_id?: string | null;
}
interface Option {
  id: string;
  name: string;
  status?: string;
}

function formFrom(r: Row | null) {
  return {
    name: r?.name ?? "",
    slug: r?.slug ?? "",
    description: r?.description ?? "",
    system_prompt: r?.system_prompt ?? "",
    avatar_url: r?.avatar_url ?? "",
    min_role: r?.min_role ?? "beta_tester",
    is_active: r?.is_active ?? true,
    archived: !!r?.archived_at,
    icon: r?.icon ?? "✨",
    use_cases: r?.use_cases ?? "",
    default_model_id: r?.default_model_id ?? "",
    personality: r?.personality ?? "",
    ai_model_id: r?.ai_model_id ?? "",
    agent_id: r?.agent_id ?? "",
  };
}

export function PersonasSection({ kind }: { kind: Kind }) {
  const isAgent = kind === "agents";
  const [rows, setRows] = useState<Row[]>([]);
  const [models, setModels] = useState<Option[]>([]);
  const [agents, setAgents] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, m, a] = await Promise.all([
      supabase.from(kind).select("*").order("name"),
      supabase.from("ai_models").select("id, name, status").neq("status", "archived").order("name"),
      supabase.from("agents").select("id, name").is("archived_at", null).order("name"),
    ]);
    if (r.error) toast.error(errorMessage(r.error));
    setRows((r.data ?? []) as Row[]);
    setModels((m.data ?? []) as Option[]);
    setAgents((a.data ?? []) as Option[]);
    setLoading(false);
    invalidateAIConfig();
  }, [kind]);
  useEffect(() => void load(), [load]);

  const filtered = rows.filter(
    (r) =>
      (showArchived || !r.archived_at) && (!q || r.name.toLowerCase().includes(q.toLowerCase())),
  );
  const modelName = (id?: string | null) => models.find((m) => m.id === id)?.name;
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Nom",
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.avatar_url ? (
            <img src={r.avatar_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
              {r.icon ?? r.name[0]}
            </span>
          )}
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground line-clamp-1">{r.description}</div>
          </div>
        </div>
      ),
    },
    {
      key: "model",
      header: isAgent ? "Modèle par défaut" : "Modèle",
      cell: (r) => (
        <span className="text-xs">
          {modelName(isAgent ? r.default_model_id : r.ai_model_id) ?? "—"}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "role",
      header: "Rôle min.",
      cell: (r) => (
        <span className="text-xs">
          {ROLE_OPTIONS.find((o) => o.value === r.min_role)?.label ?? r.min_role}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "status",
      header: "Statut",
      cell: (r) =>
        r.archived_at ? (
          <Badge>Archivé</Badge>
        ) : r.is_active ? (
          <Badge tone="green">Actif</Badge>
        ) : (
          <Badge tone="amber">Inactif</Badge>
        ),
    },
    {
      key: "upd",
      header: "Modifié",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDate(r.updated_at)}</span>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div>
      <SectionHeader
        title={isAgent ? "Agents IA" : "Partenaires IA"}
        description={
          isAgent
            ? "Rôles spécialisés (prompt système) que l'utilisateur combine avec un modèle."
            : "Personnages prêts à l'emploi associant un modèle, un agent et une personnalité."
        }
        actions={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
              <Plus className="w-3.5 h-3.5" /> {isAgent ? "Nouvel agent" : "Nouveau partenaire"}
            </button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <CheckboxField
          label="Afficher les archivés"
          checked={showArchived}
          onChange={setShowArchived}
        />
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        empty="Aucun élément."
        onRowClick={setEditing}
      />
      {editing && (
        <PersonaEditor
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          row={editing === "new" ? null : editing}
          models={models}
          agents={agents}
          onClose={() => setEditing(null)}
          onSaved={(close) => {
            void load();
            if (close) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PersonaEditor({
  kind,
  row,
  models,
  agents,
  onClose,
  onSaved,
}: {
  kind: Kind;
  row: Row | null;
  models: Option[];
  agents: Option[];
  onClose: () => void;
  onSaved: (close: boolean) => void;
}) {
  const isAgent = kind === "agents";
  const form = useDirtyForm(formFrom(row));
  const v = form.value;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameError = v.name.trim() ? null : "Nom obligatoire";

  function payload() {
    const base = {
      name: v.name.trim(),
      slug: v.slug.trim() || toSlug(v.name),
      description: v.description.trim() || null,
      system_prompt: v.system_prompt.trim() || null,
      avatar_url: v.avatar_url.trim() || null,
      min_role: v.min_role,
      is_active: v.is_active,
      archived_at: v.archived ? (row?.archived_at ?? new Date().toISOString()) : null,
    };
    return isAgent
      ? {
          ...base,
          icon: v.icon.trim() || "✨",
          use_cases: v.use_cases.trim() || null,
          default_model_id: v.default_model_id || null,
        }
      : {
          ...base,
          personality: v.personality.trim() || null,
          ai_model_id: v.ai_model_id || null,
          agent_id: v.agent_id || null,
        };
  }

  async function save(copy = false) {
    if (nameError) return;
    setSaving(true);
    const p: Record<string, unknown> = payload();
    const res = copy
      ? await supabase.from(kind).insert({
          ...p,
          name: `${p.name} (copie)`,
          slug: `${String(p.slug)}-copie-${Date.now().toString(36)}`,
          is_active: false,
        })
      : row
        ? await supabase.from(kind).update(p).eq("id", row.id)
        : await supabase.from(kind).insert(p);
    setSaving(false);
    if (res.error) toast.error(errorMessage(res.error));
    else {
      toast.success(copy ? "Copie créée (inactive)" : "Enregistré");
      onSaved(!copy);
    }
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast.error("Image de 2 Mo maximum attendue");
      return;
    }
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "png").replace(/[^a-zA-Z0-9]/g, "");
    const path = `${kind}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error || !data) {
      toast.error("Envoi impossible (bucket « avatars » requis)");
      return;
    }
    form.patch({
      avatar_url: supabase.storage.from("avatars").getPublicUrl(data.path).data.publicUrl,
    });
  }

  const modelOptions = [
    { value: "", label: "— Aucun —" },
    ...models.map((m) => ({
      value: m.id,
      label: `${m.name}${m.status !== "active" ? ` (${m.status === "draft" ? "brouillon" : "désactivé"})` : ""}`,
    })),
  ];
  return (
    <EditorSheet
      open
      onClose={onClose}
      dirty={form.dirty}
      title={row ? row.name : isAgent ? "Nouvel agent" : "Nouveau partenaire"}
      footer={
        <>
          {row && (
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={saving}
              onClick={() => void save(true)}
            >
              <Copy className="w-3.5 h-3.5" /> Dupliquer
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!form.dirty || !!nameError || saving}
            onClick={() => void save()}
          >
            {saving ? "…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <FormGrid>
          <TextField
            label="Nom"
            required
            value={v.name}
            onChange={(x) => form.patch({ name: x })}
            error={nameError}
            maxLength={80}
          />
          <TextField
            label="Identifiant (slug)"
            mono
            value={v.slug}
            onChange={(x) => form.patch({ slug: toSlug(x) })}
            help="Généré automatiquement si vide"
          />
          {isAgent ? (
            <TextField
              label="Icône (emoji)"
              value={v.icon}
              onChange={(x) => form.patch({ icon: x })}
              maxLength={4}
            />
          ) : (
            <TextField
              label="Personnalité"
              value={v.personality}
              onChange={(x) => form.patch({ personality: x })}
              maxLength={120}
            />
          )}
          <SelectField
            label="Rôle minimum"
            value={v.min_role}
            onChange={(x) => form.patch({ min_role: x })}
            options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          {isAgent ? (
            <SelectField
              label="Modèle par défaut"
              value={v.default_model_id}
              onChange={(x) => form.patch({ default_model_id: x })}
              options={modelOptions}
              help="Utilisé si l'utilisateur n'a pas choisi de modèle."
            />
          ) : (
            <>
              <SelectField
                label="Modèle"
                value={v.ai_model_id}
                onChange={(x) => form.patch({ ai_model_id: x })}
                options={modelOptions}
                help="Imposé à l'utilisateur ; aucun remplacement si le modèle devient indisponible."
              />
              <SelectField
                label="Agent"
                value={v.agent_id}
                onChange={(x) => form.patch({ agent_id: x })}
                options={[
                  { value: "", label: "— Aucun —" },
                  ...agents.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </>
          )}
        </FormGrid>
        <TextAreaField
          label="Description"
          value={v.description}
          onChange={(x) => form.patch({ description: x })}
          rows={2}
          maxLength={500}
        />
        {isAgent && (
          <TextField
            label="Cas d'usage (séparés par des virgules)"
            value={v.use_cases}
            onChange={(x) => form.patch({ use_cases: x })}
          />
        )}
        <TextAreaField
          label="Prompt système"
          mono
          rows={14}
          maxLength={20000}
          value={v.system_prompt}
          onChange={(x) => form.patch({ system_prompt: x })}
          help={
            isAgent
              ? "Ajouté après le socle CHANTAL (français, prudence sur les chiffres)."
              : "Ajouté après le prompt de l'agent associé."
          }
        />
        <div>
          <TextField
            label="Avatar (URL)"
            value={v.avatar_url}
            onChange={(x) => form.patch({ avatar_url: x })}
          />
          <div className="mt-2 flex items-center gap-3">
            {v.avatar_url && (
              <img
                src={v.avatar_url}
                alt="Aperçu de l'avatar"
                className="w-14 h-14 rounded-xl object-cover ring-1 ring-border"
              />
            )}
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" /> {uploading ? "Envoi…" : "Téléverser une image"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <CheckboxField
            label="Actif"
            checked={v.is_active}
            onChange={(x) => form.patch({ is_active: x })}
          />
          {row && (
            <CheckboxField
              label="Archivé (masqué partout, historique conservé)"
              checked={v.archived}
              onChange={(x) => form.patch({ archived: x })}
            />
          )}
        </div>
      </div>
    </EditorSheet>
  );
}
