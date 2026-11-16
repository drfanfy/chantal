/**
 * Bibliothèque de prompts : brouillon modifiable, publication = nouvelle
 * version immuable, historique consultable, restauration (crée une nouvelle
 * version), duplication, archivage, catégories, tags, exemples.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Copy, Send, History, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/api";
import {
  invalidatePrompts,
  renderPrompt,
  type PromptExample,
  type PromptVariable,
} from "@/lib/prompts";
import {
  Badge,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CheckboxField,
  ConfirmDialog,
  DataTable,
  EditorSheet,
  FilterSelect,
  FormGrid,
  FormSection,
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

interface Draft {
  title: string;
  description: string;
  instructions: string;
  content: string;
  variables: PromptVariable[];
  examples: PromptExample[];
  restored_from_version?: number;
}
interface TemplateRow {
  id: string;
  slug: string;
  category_id: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  is_demo: boolean;
  min_role: string;
  draft: Partial<Draft>;
  draft_updated_at: string;
  published_version_id: string | null;
  updated_at: string;
}
interface VersionRow {
  id: string;
  version: number;
  title: string;
  description: string;
  instructions: string;
  content: string;
  variables: PromptVariable[];
  examples: PromptExample[];
  change_summary: string;
  restored_from_version: number | null;
  author_id: string | null;
  created_at: string;
}
interface Category {
  id: string;
  name: string;
}

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  instructions: "",
  content: "",
  variables: [],
  examples: [],
});
const STATUS = {
  draft: <Badge>Brouillon</Badge>,
  published: <Badge tone="green">Publié</Badge>,
  archived: <Badge>Archivé</Badge>,
};

export function PromptsSection() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TemplateRow["status"]>("all");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, c] = await Promise.all([
      supabase.from("prompt_templates").select("*").order("updated_at", { ascending: false }),
      supabase.from("prompt_categories").select("id, name").order("sort_order"),
    ]);
    if (t.error) toast.error(errorMessage(t.error));
    setRows((t.data ?? []) as TemplateRow[]);
    setCats((c.data ?? []) as Category[]);
    setLoading(false);
    invalidatePrompts();
  }, []);
  useEffect(() => void load(), [load]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== "all" && r.status !== status) return false;
        if (cat !== "all" && r.category_id !== cat) return false;
        const s = q.trim().toLowerCase();
        return (
          !s || [r.draft.title ?? "", r.slug, ...r.tags].some((x) => x.toLowerCase().includes(s))
        );
      }),
    [rows, status, cat, q],
  );

  const columns: Column<TemplateRow>[] = [
    {
      key: "t",
      header: "Titre",
      cell: (r) => (
        <div>
          <div className="font-medium line-clamp-1">{r.draft.title || "(sans titre)"}</div>
          <div className="text-[0.7rem] text-muted-foreground font-mono">{r.slug}</div>
        </div>
      ),
    },
    {
      key: "c",
      header: "Catégorie",
      cell: (r) => (
        <span className="text-xs">{cats.find((c) => c.id === r.category_id)?.name ?? "—"}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: "s",
      header: "Statut",
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {STATUS[r.status]}
          {r.is_demo && <Badge tone="amber">Exemple</Badge>}
        </span>
      ),
    },
    {
      key: "u",
      header: "Modifié",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDate(r.updated_at)}</span>
      ),
      hideOnMobile: true,
    },
  ];

  async function addCategory() {
    const name = window.prompt("Nom de la nouvelle catégorie")?.trim();
    if (!name) return;
    const { error } = await supabase
      .from("prompt_categories")
      .insert({ name, sort_order: (cats.length + 1) * 10 });
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Catégorie ajoutée");
      void load();
    }
  }

  return (
    <div>
      <SectionHeader
        title="Prompts"
        description="Les utilisateurs voient uniquement la version publiée. Chaque publication crée une version immuable ; chaque utilisation est tracée avec sa version."
        actions={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => void addCategory()}>
              <Plus className="w-3.5 h-3.5" /> Catégorie
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")}>
              <Plus className="w-3.5 h-3.5" /> Nouveau prompt
            </button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Titre, slug, tag…" />
        <FilterSelect
          label="Statut"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Tous" },
            { value: "draft", label: "Brouillons" },
            { value: "published", label: "Publiés" },
            { value: "archived", label: "Archivés" },
          ]}
        />
        <FilterSelect
          label="Catégorie"
          value={cat}
          onChange={setCat}
          options={[
            { value: "all", label: "Toutes" },
            ...cats.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        empty="Aucun prompt."
        onRowClick={setEditing}
      />
      {editing && (
        <PromptEditor
          key={editing === "new" ? "new" : editing.id}
          row={editing === "new" ? null : editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onChanged={(r) => {
            void load();
            if (r) setEditing(r);
          }}
        />
      )}
    </div>
  );
}

function PromptEditor({
  row,
  cats,
  onClose,
  onChanged,
}: {
  row: TemplateRow | null;
  cats: Category[];
  onClose: () => void;
  onChanged: (r?: TemplateRow) => void;
}) {
  const form = useDirtyForm({
    slug: row?.slug ?? "",
    category_id: row?.category_id ?? "",
    tags: (row?.tags ?? []).join(", "),
    min_role: row?.min_role ?? "viewer",
    is_demo: row?.is_demo ?? false,
    draft: { ...emptyDraft(), ...(row?.draft ?? {}) } as Draft,
  });
  const v = form.value;
  const d = v.draft;
  const setD = (p: Partial<Draft>) => form.patch({ draft: { ...d, ...p } });
  const [tab, setTab] = useState<"edit" | "preview" | "history">("edit");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!row) return;
    void supabase
      .from("prompt_versions")
      .select("*")
      .eq("prompt_id", row.id)
      .order("version", { ascending: false })
      .then(({ data }) => setVersions((data ?? []) as VersionRow[]));
  }, [row]);

  const errors: Record<string, string> = {};
  if (!d.title.trim()) errors.title = "Titre obligatoire";
  if (!d.content.trim()) errors.content = "Contenu obligatoire";
  const slug = v.slug || toSlug(d.title);
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) errors.slug = "Minuscules, chiffres et tirets";
  const usedVars = [...d.content.matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)].map((m) => m[1]);
  const undeclared = [...new Set(usedVars)].filter((n) => !d.variables.some((x) => x.name === n));
  const published = versions.find((x) => x.id === row?.published_version_id);
  const draftDiffers =
    !published ||
    JSON.stringify({
      t: published.title,
      d: published.description,
      i: published.instructions,
      c: published.content,
      v: published.variables,
      e: published.examples,
    }) !==
      JSON.stringify({
        t: d.title,
        d: d.description,
        i: d.instructions,
        c: d.content,
        v: d.variables,
        e: d.examples,
      });

  async function save(): Promise<TemplateRow | null> {
    if (errors.slug) {
      toast.error(errors.slug);
      return null;
    }
    setBusy(true);
    const p = {
      slug,
      category_id: v.category_id || null,
      tags: v.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      min_role: v.min_role,
      is_demo: v.is_demo,
      draft: d,
    };
    const res = row
      ? await supabase.from("prompt_templates").update(p).eq("id", row.id).select("*").single()
      : await supabase.from("prompt_templates").insert(p).select("*").single();
    setBusy(false);
    if (res.error) {
      toast.error(res.error.code === "23505" ? "Ce slug existe déjà" : errorMessage(res.error));
      return null;
    }
    const saved = res.data as TemplateRow;
    form.reset({ ...v, slug, draft: d });
    toast.success("Brouillon enregistré");
    onChanged(saved);
    return saved;
  }

  async function publish() {
    if (errors.title || errors.content) {
      toast.error("Titre et contenu obligatoires");
      return;
    }
    const saved = form.dirty || !row ? await save() : row;
    if (!saved) return;
    setBusy(true);
    const { error } = await supabase.rpc("publish_prompt", {
      p_prompt_id: saved.id,
      p_change_summary: summary,
    });
    setBusy(false);
    setPublishOpen(false);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Nouvelle version publiée");
      setSummary("");
      const { data } = await supabase
        .from("prompt_templates")
        .select("*")
        .eq("id", saved.id)
        .single();
      onChanged(data as TemplateRow);
    }
  }

  async function restore(ver: VersionRow) {
    if (
      form.dirty &&
      !window.confirm("Des modifications non enregistrées seront remplacées. Continuer ?")
    )
      return;
    const { error } = await supabase.rpc("restore_prompt_version", { p_version_id: ver.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    const { data } = await supabase.from("prompt_templates").select("*").eq("id", row!.id).single();
    const t = data as TemplateRow;
    form.reset({ ...v, draft: { ...emptyDraft(), ...t.draft } as Draft });
    setTab("edit");
    toast.success(
      `Version ${ver.version} recopiée dans le brouillon : publiez pour créer une nouvelle version`,
    );
  }

  async function setStatus(status: "archived" | "draft" | "published") {
    if (!row) return;
    const { error } = await supabase.from("prompt_templates").update({ status }).eq("id", row.id);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success(status === "archived" ? "Prompt archivé" : "Prompt rétabli");
      onChanged();
      onClose();
    }
  }

  async function duplicate() {
    if (!row) return;
    const { data, error } = await supabase.rpc("duplicate_prompt", { p_prompt_id: row.id });
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Copie créée en brouillon");
      const { data: t } = await supabase
        .from("prompt_templates")
        .select("*")
        .eq("id", data)
        .single();
      onChanged(t as TemplateRow);
    }
  }

  return (
    <EditorSheet
      open
      onClose={onClose}
      dirty={form.dirty}
      title={d.title || "Nouveau prompt"}
      subtitle={
        row && (
          <span className="flex flex-wrap gap-1.5 items-center">
            {STATUS[row.status]}
            {published && (
              <span>
                v{published.version} publiée le {formatDate(published.created_at)}
              </span>
            )}
            {draftDiffers && row.status !== "archived" && (
              <Badge tone="amber">Brouillon différent de la version publiée</Badge>
            )}
          </span>
        )
      }
      footer={
        <>
          {row && row.status !== "archived" && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void setStatus("archived")}
            >
              <Trash2 className="w-3.5 h-3.5" /> Archiver
            </button>
          )}
          {row?.status === "archived" && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void setStatus(row.published_version_id ? "published" : "draft")}
            >
              Rétablir
            </button>
          )}
          {row && (
            <button type="button" className={BTN_SECONDARY} onClick={() => void duplicate()}>
              <Copy className="w-3.5 h-3.5" /> Dupliquer
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy || !form.dirty}
            onClick={() => void save()}
          >
            Enregistrer le brouillon
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={
              busy ||
              !!errors.title ||
              !!errors.content ||
              (!draftDiffers && !form.dirty && row?.status === "published")
            }
            onClick={() => setPublishOpen(true)}
          >
            <Send className="w-3.5 h-3.5" /> Publier…
          </button>
        </>
      }
    >
      <div role="tablist" className="mb-4 inline-flex rounded-lg bg-muted p-0.5">
        {(
          [
            ["edit", "Édition"],
            ["preview", "Aperçu / test"],
            ["history", `Historique (${versions.length})`],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            disabled={k === "history" && !row}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${tab === k ? "bg-background shadow-soft font-medium" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "edit" && (
        <div className="space-y-6">
          <FormSection title="Classement et accès">
            <FormGrid cols={3}>
              <TextField
                label="Slug"
                mono
                value={v.slug}
                onChange={(x) => form.patch({ slug: toSlug(x) })}
                error={errors.slug}
                help="Vide = déduit du titre"
              />
              <SelectField
                label="Catégorie"
                value={v.category_id}
                onChange={(x) => form.patch({ category_id: x })}
                options={[
                  { value: "", label: "— Aucune —" },
                  ...cats.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <SelectField
                label="Rôle minimum"
                value={v.min_role}
                onChange={(x) => form.patch({ min_role: x })}
                options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </FormGrid>
            <TextField
              label="Tags (séparés par des virgules)"
              value={v.tags}
              onChange={(x) => form.patch({ tags: x })}
            />
            <CheckboxField
              label="Exemple de démonstration (badge « Exemple »)"
              checked={v.is_demo}
              onChange={(x) => form.patch({ is_demo: x })}
              help="Décochez une fois le contenu validé comme opérationnel."
            />
          </FormSection>
          <FormSection title="Contenu (brouillon)">
            <TextField
              label="Titre"
              required
              value={d.title}
              onChange={(x) => setD({ title: x })}
              error={errors.title}
              maxLength={200}
            />
            <TextAreaField
              label="Description"
              rows={2}
              value={d.description}
              onChange={(x) => setD({ description: x })}
              maxLength={500}
            />
            <TextAreaField
              label="Consignes pour l'utilisateur"
              rows={2}
              value={d.instructions}
              onChange={(x) => setD({ instructions: x })}
              maxLength={2000}
            />
            <TextAreaField
              label="Contenu du prompt"
              required
              mono
              rows={14}
              value={d.content}
              onChange={(x) => setD({ content: x })}
              error={errors.content}
              maxLength={50000}
              help="Variables : {{nom_variable}}"
            />
            {undeclared.length > 0 && (
              <p className="text-xs text-amber-700">
                Variables utilisées mais non déclarées : {undeclared.join(", ")}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setD({
                      variables: [
                        ...d.variables,
                        ...undeclared.map((n) => ({
                          name: n,
                          label: n.replace(/_/g, " "),
                          required: true,
                        })),
                      ],
                    })
                  }
                >
                  Les déclarer
                </button>
              </p>
            )}
          </FormSection>
          <FormSection title="Variables">
            {d.variables.map((x, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_auto_auto] items-end"
              >
                <TextField
                  label="Nom technique"
                  mono
                  value={x.name}
                  onChange={(n) =>
                    setD({
                      variables: d.variables.map((y, j) =>
                        j === i ? { ...y, name: n.replace(/[^a-zA-Z0-9_]/g, "_") } : y,
                      ),
                    })
                  }
                />
                <TextField
                  label="Libellé"
                  value={x.label}
                  onChange={(n) =>
                    setD({
                      variables: d.variables.map((y, j) => (j === i ? { ...y, label: n } : y)),
                    })
                  }
                />
                <CheckboxField
                  label="Obligatoire"
                  checked={x.required !== false}
                  onChange={(n) =>
                    setD({
                      variables: d.variables.map((y, j) => (j === i ? { ...y, required: n } : y)),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label="Supprimer la variable"
                  className="p-2 text-destructive"
                  onClick={() => setD({ variables: d.variables.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() =>
                setD({
                  variables: [
                    ...d.variables,
                    { name: `variable_${d.variables.length + 1}`, label: "", required: true },
                  ],
                })
              }
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter une variable
            </button>
          </FormSection>
          <FormSection title="Exemples">
            {d.examples.map((x, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <TextField
                      label="Titre"
                      value={x.title ?? ""}
                      onChange={(n) =>
                        setD({
                          examples: d.examples.map((y, j) => (j === i ? { ...y, title: n } : y)),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Supprimer l'exemple"
                    className="p-2 text-destructive"
                    onClick={() => setD({ examples: d.examples.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <FormGrid>
                  <TextAreaField
                    label="Entrée"
                    rows={3}
                    value={x.input ?? ""}
                    onChange={(n) =>
                      setD({
                        examples: d.examples.map((y, j) => (j === i ? { ...y, input: n } : y)),
                      })
                    }
                  />
                  <TextAreaField
                    label="Résultat attendu"
                    rows={3}
                    value={x.output ?? ""}
                    onChange={(n) =>
                      setD({
                        examples: d.examples.map((y, j) => (j === i ? { ...y, output: n } : y)),
                      })
                    }
                  />
                </FormGrid>
              </div>
            ))}
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() =>
                setD({ examples: [...d.examples, { title: "", input: "", output: "" }] })
              }
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter un exemple
            </button>
          </FormSection>
        </div>
      )}

      {tab === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Aperçu du brouillon tel que l'utilisateur l'enverra au chat. Pour tester la réponse d'un
            modèle, publiez puis utilisez-le dans le chat (l'usage est tracé avec la version).
          </p>
          <FormGrid>
            {d.variables.map((x) => (
              <TextField
                key={x.name}
                label={x.label || x.name}
                value={previewValues[x.name] ?? ""}
                onChange={(n) => setPreviewValues((s) => ({ ...s, [x.name]: n }))}
              />
            ))}
          </FormGrid>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm font-sans">
            {renderPrompt(
              d,
              Object.fromEntries(
                d.variables.map((x) => [x.name, previewValues[x.name] || `[${x.label || x.name}]`]),
              ),
            )}
          </pre>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {versions.length === 0 && <p className="text-sm text-muted-foreground">Jamais publié.</p>}
          {versions.map((ver) => (
            <details key={ver.id} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-sm">
                <History className="w-3.5 h-3.5" /> <strong>v{ver.version}</strong> —{" "}
                {formatDate(ver.created_at)} — {ver.change_summary}
                {ver.restored_from_version && (
                  <Badge tone="blue">restaurée depuis v{ver.restored_from_version}</Badge>
                )}
                {ver.id === row?.published_version_id && <Badge tone="green">En ligne</Badge>}
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                <div className="font-medium">{ver.title}</div>
                <div className="text-muted-foreground">{ver.description}</div>
                <pre className="whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
                  {ver.content}
                </pre>
                <button type="button" className={BTN_SECONDARY} onClick={() => void restore(ver)}>
                  <RotateCcw className="w-3.5 h-3.5" /> Restaurer dans le brouillon
                </button>
              </div>
            </details>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={publishOpen}
        title="Publier une nouvelle version ?"
        confirmLabel="Publier"
        busy={busy}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
        description={
          <p>
            Le brouillon devient la version {(versions[0]?.version ?? 0) + 1}, immédiatement visible
            des utilisateurs autorisés. Les versions précédentes restent consultables.
          </p>
        }
      >
        <TextField
          label="Résumé des modifications"
          value={summary}
          onChange={setSummary}
          maxLength={300}
          placeholder="Ex. Reformulation de la consigne, ajout d'une variable"
        />
      </ConfirmDialog>
    </EditorSheet>
  );
}
