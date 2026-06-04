import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Cpu, X, RefreshCw, Plus } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = "super_admin" | "admin" | "beta_tester" | "viewer";
type AdminTab = "users" | "models" | "agents" | "partners";

type Profile = {
  id: string; email: string; full_name: string | null;
  role: UserRole; avatar_url: string | null;
  created_at: string | null; is_active: boolean;
};
type AIModelRow = {
  id: string; name: string; provider: string; description: string | null;
  model_id: string | null; env_key: string | null; avatar_url: string | null;
  min_role: string; is_active: boolean; created_at: string;
};
type AIAgentRow = {
  id: string; name: string; slug: string; description: string | null;
  system_prompt: string | null; use_cases: string | null; icon: string | null;
  avatar_url: string | null; min_role: string; is_active: boolean; created_at: string;
};
type AIPartnerRow = {
  id: string; name: string; slug: string; description: string | null;
  personality: string | null; system_prompt: string | null; avatar_url: string | null;
  ai_model_id: string | null; agent_id: string | null; is_active: boolean; created_at: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS: UserRole[] = ["super_admin", "admin", "beta_tester", "viewer"];
const MIN_ROLE_OPTIONS = ["viewer", "beta_tester", "admin", "super_admin"];
const INPUT = "rounded-md border border-border bg-background px-3 py-2 text-sm w-full";

function toSlug(s: string) {
  return s.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-");
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/admin")({ component: AdminPage });

// ─── AdminModal ───────────────────────────────────────────────────────────────

function AdminModal({ title, open, onClose, children }: {
  title: string; open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-elevated w-full max-w-xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("users");
  const tabs: { key: AdminTab; label: string }[] = [
    { key: "users", label: "Utilisateurs" },
    { key: "models", label: "Modèles IA" },
    { key: "agents", label: "Agents IA" },
    { key: "partners", label: "Partenaires IA" },
  ];
  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div className="flex gap-0 border-b border-border">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "users"    && <UsersSection />}
        {tab === "models"   && <AIModelsSection />}
        {tab === "agents"   && <AIAgentsSection />}
        {tab === "partners" && <AIPartnersSection />}
      </div>
    </AppShell>
  );
}

// ─── Utilisateurs ─────────────────────────────────────────────────────────────

const USER_CREATE_INIT = { email: "", full_name: "", password: "", role: "beta_tester" as UserRole };
const USER_EDIT_INIT = { full_name: "", role: "beta_tester" as UserRole };

function UsersSection() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [createForm, setCreateForm] = useState(USER_CREATE_INIT);
  const [editForm, setEditForm] = useState(USER_EDIT_INIT);
  const cf = <K extends keyof typeof createForm>(k: K, v: typeof createForm[K]) => setCreateForm(p => ({ ...p, [k]: v }));
  const ef = <K extends keyof typeof editForm>(k: K, v: typeof editForm[K]) => setEditForm(p => ({ ...p, [k]: v }));

  async function fetchProfiles() {
    setLoading(true); setError(null);
    const { data, error } = await supabase.from("profiles")
      .select("id, email, full_name, role, avatar_url, created_at, is_active")
      .order("created_at", { ascending: false });
    if (error) { setError(error.message); setProfiles([]); }
    else setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  }

  async function createUser() {
    if (!createForm.email || !createForm.full_name || !createForm.password) {
      alert("Email, nom et mot de passe obligatoires."); return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: createForm.email, password: createForm.password, full_name: createForm.full_name, role: createForm.role },
      });
      if (error) { alert(`Erreur : ${error.message}`); return; }
      if (data?.error) { alert(`Erreur : ${data.error}`); return; }
      setCreateForm(USER_CREATE_INIT);
      setShowCreate(false);
      await fetchProfiles();
    } catch { alert("Erreur inattendue."); }
    finally { setSaving(false); }
  }

  async function updateUser() {
    if (!editingProfile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles")
      .update({ full_name: editForm.full_name.trim() || null, role: editForm.role })
      .eq("id", editingProfile.id);
    if (error) alert(error.message);
    else { setEditingProfile(null); await fetchProfiles(); }
    setSaving(false);
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("profiles").update({ is_active: !current }).eq("id", id);
    await fetchProfiles();
  }

  function openEdit(p: Profile) {
    setEditingProfile(p);
    setEditForm({ full_name: p.full_name ?? "", role: p.role });
  }

  useEffect(() => { fetchProfiles(); }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-muted-foreground">
          {profiles.length} utilisateur{profiles.length > 1 ? "s" : ""}
        </span>
        <div className="flex gap-2">
          <button onClick={fetchProfiles} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
            <RefreshCw className="w-3 h-3" /> Rafraîchir
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="w-3 h-3" /> Créer
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading && <div className="p-5 text-sm text-muted-foreground">Chargement...</div>}
        {error && <div className="p-5 text-sm text-red-500">Erreur : {error}</div>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Nom</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Rôle</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Créé le</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3">{p.full_name || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.email}</td>
                  <td className="px-5 py-3"><span className="rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">{p.role}</span></td>
                  <td className="px-5 py-3"><ActiveBadge active={p.is_active} onClick={() => toggleActive(p.id, p.is_active)} /></td>
                  <td className="px-5 py-3 text-muted-foreground">{p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(p)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Modifier</button>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted-foreground">Aucun utilisateur.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Créer */}
      <AdminModal title="Créer un utilisateur" open={showCreate} onClose={() => setShowCreate(false)}>
        <div className="grid gap-3">
          <input value={createForm.full_name} onChange={e => cf("full_name", e.target.value)} placeholder="Nom complet *" className={INPUT} />
          <input value={createForm.email} onChange={e => cf("email", e.target.value)} placeholder="Email *" className={INPUT} />
          <input value={createForm.password} onChange={e => cf("password", e.target.value)} placeholder="Mot de passe temporaire *" type="password" className={INPUT} />
          <select value={createForm.role} onChange={e => cf("role", e.target.value as UserRole)} className={INPUT}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={createUser} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Création..." : "Créer"}
          </button>
          <button onClick={() => setShowCreate(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Annuler</button>
        </div>
      </AdminModal>

      {/* Modal Modifier */}
      <AdminModal title="Modifier l'utilisateur" open={!!editingProfile} onClose={() => setEditingProfile(null)}>
        <div className="grid gap-3">
          <input value={editForm.full_name} onChange={e => ef("full_name", e.target.value)} placeholder="Nom complet" className={INPUT} />
          <select value={editForm.role} onChange={e => ef("role", e.target.value as UserRole)} className={INPUT}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={updateUser} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button onClick={() => setEditingProfile(null)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Annuler</button>
        </div>
      </AdminModal>
    </div>
  );
}

// ─── Modèles IA ──────────────────────────────────────────────────────────────

const MODEL_INIT = { name: "", provider: "", description: "", model_id: "", env_key: "", avatar_url: "", min_role: "beta_tester", is_active: true };

function AIModelsSection() {
  const [rows, setRows] = useState<AIModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelRow | null>(null);
  const [form, setForm] = useState(MODEL_INIT);
  const [editForm, setEditForm] = useState(MODEL_INIT);
  const f = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p => ({ ...p, [k]: v }));
  const ef = <K extends keyof typeof editForm>(k: K, v: typeof editForm[K]) => setEditForm(p => ({ ...p, [k]: v }));

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from("ai_models").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as AIModelRow[]);
    setLoading(false);
  }

  async function create() {
    if (!form.name.trim() || !form.provider.trim()) { alert("Nom et provider obligatoires."); return; }
    setSaving(true);
    const { error } = await supabase.from("ai_models").insert({
      name: form.name.trim(), provider: form.provider.trim(),
      description: form.description.trim() || null, model_id: form.model_id.trim() || null,
      env_key: form.env_key.trim() || null, avatar_url: form.avatar_url.trim() || null,
      min_role: form.min_role, is_active: form.is_active,
    });
    if (error) alert(error.message);
    else { setForm(MODEL_INIT); setShowCreate(false); await fetchAll(); }
    setSaving(false);
  }

  async function update() {
    if (!editingModel) return;
    setSaving(true);
    const { error } = await supabase.from("ai_models").update({
      name: editForm.name.trim(), provider: editForm.provider.trim(),
      description: editForm.description.trim() || null, model_id: editForm.model_id.trim() || null,
      env_key: editForm.env_key.trim() || null, avatar_url: editForm.avatar_url.trim() || null,
      min_role: editForm.min_role, is_active: editForm.is_active,
    }).eq("id", editingModel.id);
    if (error) alert(error.message);
    else { setEditingModel(null); await fetchAll(); }
    setSaving(false);
  }

  async function toggle(id: string, current: boolean) {
    await supabase.from("ai_models").update({ is_active: !current }).eq("id", id);
    await fetchAll();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce modèle ?")) return;
    await supabase.from("ai_models").delete().eq("id", id);
    await fetchAll();
  }

  function openEdit(row: AIModelRow) {
    setEditingModel(row);
    setEditForm({ name: row.name, provider: row.provider, description: row.description ?? "", model_id: row.model_id ?? "", env_key: row.env_key ?? "", avatar_url: row.avatar_url ?? "", min_role: row.min_role, is_active: row.is_active });
  }

  useEffect(() => { fetchAll(); }, []);

  const ModelForm = ({ values, set, onSubmit, onCancel }: { values: typeof form; set: typeof f; onSubmit: () => void; onCancel: () => void }) => (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={values.name} onChange={e => set("name", e.target.value)} placeholder="Nom *" className={INPUT} />
        <input value={values.provider} onChange={e => set("provider", e.target.value)} placeholder="Provider * (ex: groq)" className={INPUT} />
        <input value={values.description} onChange={e => set("description", e.target.value)} placeholder="Description" className={INPUT} />
        <input value={values.model_id} onChange={e => set("model_id", e.target.value)} placeholder="model_id (ex: llama3-8b-8192)" className={INPUT} />
        <input value={values.env_key} onChange={e => set("env_key", e.target.value)} placeholder="env_key (ex: VITE_GROQ_API_KEY)" className={INPUT} />
        <select value={values.min_role} onChange={e => set("min_role", e.target.value)} className={INPUT}>
          {MIN_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <label className="text-xs text-muted-foreground mb-1 block">Photo / Avatar</label>
        <AvatarField value={values.avatar_url} onChange={v => set("avatar_url", v)}
          buildPrompt={() => buildAvatarPrompt(values.name, `${values.provider} AI model`, "", values.description || "")} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={values.is_active} onChange={e => set("is_active", e.target.checked)} /> Actif
        </label>
        <div className="flex gap-2">
          <button onClick={onSubmit} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "…" : "Enregistrer"}
          </button>
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Annuler</button>
        </div>
      </div>
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-muted-foreground">{rows.length} modèle{rows.length > 1 ? "s" : ""}</span>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
            <RefreshCw className="w-3 h-3" /> Rafraîchir
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Créer
          </button>
        </div>
      </div>

      {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Chargement…</div>
       : rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">Aucun modèle configuré.</div>
       : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(row => (
            <div key={row.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:shadow-soft transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {row.avatar_url
                    ? <img src={row.avatar_url} className="w-12 h-12 rounded-xl object-cover shrink-0 ring-1 ring-border" alt="" />
                    : <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><Cpu className="w-6 h-6 text-blue-600" /></div>
                  }
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.provider}</div>
                  </div>
                </div>
                <ActiveBadge active={row.is_active} onClick={() => toggle(row.id, row.is_active)} />
              </div>
              {row.model_id && <div className="font-mono text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-md truncate">{row.model_id}</div>}
              <div className="text-[0.7rem] text-muted-foreground">{row.min_role}</div>
              <div className="flex gap-2 mt-auto pt-1">
                <button onClick={() => openEdit(row)} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-center hover:bg-muted transition-colors">Modifier</button>
                <button onClick={() => remove(row.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal title="Nouveau modèle" open={showCreate} onClose={() => setShowCreate(false)}>
        <ModelForm values={form} set={f} onSubmit={create} onCancel={() => setShowCreate(false)} />
      </AdminModal>
      <AdminModal title="Modifier le modèle" open={!!editingModel} onClose={() => setEditingModel(null)}>
        <ModelForm values={editForm} set={ef} onSubmit={update} onCancel={() => setEditingModel(null)} />
      </AdminModal>
    </div>
  );
}

// ─── Agents IA ───────────────────────────────────────────────────────────────

const AGENT_INIT = { name: "", slug: "", description: "", system_prompt: "", use_cases: "", icon: "✨", avatar_url: "", min_role: "beta_tester", is_active: true };

function AIAgentsSection() {
  const [rows, setRows] = useState<AIAgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AIAgentRow | null>(null);
  const [form, setForm] = useState(AGENT_INIT);
  const [editForm, setEditForm] = useState(AGENT_INIT);
  const f = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p => ({ ...p, [k]: v }));
  const ef = <K extends keyof typeof editForm>(k: K, v: typeof editForm[K]) => setEditForm(p => ({ ...p, [k]: v }));

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from("agents").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as AIAgentRow[]);
    setLoading(false);
  }

  async function create() {
    if (!form.name.trim()) { alert("Le nom est obligatoire."); return; }
    setSaving(true);
    const { error } = await supabase.from("agents").insert({
      name: form.name.trim(), slug: form.slug.trim() || toSlug(form.name),
      description: form.description.trim() || null, system_prompt: form.system_prompt.trim() || null,
      use_cases: form.use_cases.trim() || null, icon: form.icon.trim() || "✨",
      avatar_url: form.avatar_url.trim() || null, min_role: form.min_role, is_active: form.is_active,
    });
    if (error) alert(error.message);
    else { setForm(AGENT_INIT); setShowCreate(false); await fetchAll(); }
    setSaving(false);
  }

  async function update() {
    if (!editingAgent) return;
    setSaving(true);
    const { error } = await supabase.from("agents").update({
      name: editForm.name.trim(), slug: editForm.slug.trim() || toSlug(editForm.name),
      description: editForm.description.trim() || null, system_prompt: editForm.system_prompt.trim() || null,
      use_cases: editForm.use_cases.trim() || null, icon: editForm.icon.trim() || "✨",
      avatar_url: editForm.avatar_url.trim() || null, min_role: editForm.min_role, is_active: editForm.is_active,
    }).eq("id", editingAgent.id);
    if (error) alert(error.message);
    else { setEditingAgent(null); await fetchAll(); }
    setSaving(false);
  }

  async function toggle(id: string, current: boolean) {
    await supabase.from("agents").update({ is_active: !current }).eq("id", id);
    await fetchAll();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cet agent ?")) return;
    await supabase.from("agents").delete().eq("id", id);
    await fetchAll();
  }

  function openEdit(row: AIAgentRow) {
    setEditingAgent(row);
    setEditForm({ name: row.name, slug: row.slug, description: row.description ?? "", system_prompt: row.system_prompt ?? "", use_cases: row.use_cases ?? "", icon: row.icon ?? "✨", avatar_url: row.avatar_url ?? "", min_role: row.min_role, is_active: row.is_active });
  }

  useEffect(() => { fetchAll(); }, []);

  const AgentForm = ({ values, set, onSubmit, onCancel }: { values: typeof form; set: typeof f; onSubmit: () => void; onCancel: () => void }) => (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={values.name} onChange={e => set("name", e.target.value)} placeholder="Nom *" className={INPUT} />
        <input value={values.slug} onChange={e => set("slug", e.target.value)} placeholder="Slug (auto)" className={INPUT} />
        <input value={values.description} onChange={e => set("description", e.target.value)} placeholder="Description courte" className={INPUT} />
        <input value={values.icon} onChange={e => set("icon", e.target.value)} placeholder="Icône emoji" className={INPUT} />
        <input value={values.use_cases} onChange={e => set("use_cases", e.target.value)} placeholder="Cas d'usage (virgule)" className={INPUT} />
        <select value={values.min_role} onChange={e => set("min_role", e.target.value)} className={INPUT}>
          {MIN_ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <textarea value={values.system_prompt} onChange={e => set("system_prompt", e.target.value)}
          placeholder="System prompt" rows={3} className={`${INPUT} resize-none`} />
      </div>
      <div className="mt-3">
        <label className="text-xs text-muted-foreground mb-1 block">Photo / Avatar</label>
        <AvatarField value={values.avatar_url} onChange={v => set("avatar_url", v)}
          buildPrompt={() => buildAvatarPrompt(values.name, values.description || "", "", values.system_prompt || "")} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={values.is_active} onChange={e => set("is_active", e.target.checked)} /> Actif
        </label>
        <div className="flex gap-2">
          <button onClick={onSubmit} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "…" : "Enregistrer"}
          </button>
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Annuler</button>
        </div>
      </div>
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-muted-foreground">{rows.length} agent{rows.length > 1 ? "s" : ""}</span>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
            <RefreshCw className="w-3 h-3" /> Rafraîchir
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Créer
          </button>
        </div>
      </div>

      {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Chargement…</div>
       : rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">Aucun agent configuré.</div>
       : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(row => (
            <div key={row.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:shadow-soft transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {row.avatar_url
                    ? <img src={row.avatar_url} className="w-12 h-12 rounded-xl object-cover shrink-0 ring-1 ring-border" alt="" />
                    : <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 text-2xl">{row.icon ?? "✨"}</div>
                  }
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{row.name}</div>
                    {row.description && <div className="text-xs text-muted-foreground line-clamp-1">{row.description}</div>}
                  </div>
                </div>
                <ActiveBadge active={row.is_active} onClick={() => toggle(row.id, row.is_active)} />
              </div>
              <div className="text-[0.7rem] text-muted-foreground">{row.min_role}</div>
              <div className="flex gap-2 mt-auto pt-1">
                <button onClick={() => openEdit(row)} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-center hover:bg-muted transition-colors">Modifier</button>
                <button onClick={() => remove(row.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal title="Nouvel agent" open={showCreate} onClose={() => setShowCreate(false)}>
        <AgentForm values={form} set={f} onSubmit={create} onCancel={() => setShowCreate(false)} />
      </AdminModal>
      <AdminModal title="Modifier l'agent" open={!!editingAgent} onClose={() => setEditingAgent(null)}>
        <AgentForm values={editForm} set={ef} onSubmit={update} onCancel={() => setEditingAgent(null)} />
      </AdminModal>
    </div>
  );
}

// ─── Partenaires IA ──────────────────────────────────────────────────────────

const PARTNER_INIT = { name: "", slug: "", description: "", personality: "", system_prompt: "", avatar_url: "", ai_model_id: "", agent_id: "", is_active: true };

function AIPartnersSection() {
  const [rows, setRows] = useState<AIPartnerRow[]>([]);
  const [allModels, setAllModels] = useState<{ id: string; name: string }[]>([]);
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPartner, setEditingPartner] = useState<AIPartnerRow | null>(null);
  const [form, setForm] = useState(PARTNER_INIT);
  const [editForm, setEditForm] = useState(PARTNER_INIT);
  const f = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(p => ({ ...p, [k]: v }));
  const ef = <K extends keyof typeof editForm>(k: K, v: typeof editForm[K]) => setEditForm(p => ({ ...p, [k]: v }));

  async function fetchAll() {
    setLoading(true);
    const [pRes, mRes, aRes] = await Promise.all([
      supabase.from("partners").select("*").order("created_at", { ascending: false }),
      supabase.from("ai_models").select("id, name").order("name"),
      supabase.from("agents").select("id, name").order("name"),
    ]);
    setRows((pRes.data ?? []) as AIPartnerRow[]);
    setAllModels((mRes.data ?? []) as { id: string; name: string }[]);
    setAllAgents((aRes.data ?? []) as { id: string; name: string }[]);
    setLoading(false);
  }

  async function create() {
    if (!form.name.trim()) { alert("Le nom est obligatoire."); return; }
    setSaving(true);
    const { error } = await supabase.from("partners").insert({
      name: form.name.trim(), slug: form.slug.trim() || toSlug(form.name),
      description: form.description.trim() || null, personality: form.personality.trim() || null,
      system_prompt: form.system_prompt.trim() || null, avatar_url: form.avatar_url.trim() || null,
      ai_model_id: form.ai_model_id || null, agent_id: form.agent_id || null, is_active: form.is_active,
    });
    if (error) alert(error.message);
    else { setForm(PARTNER_INIT); setShowCreate(false); await fetchAll(); }
    setSaving(false);
  }

  async function update() {
    if (!editingPartner) return;
    setSaving(true);
    const { error } = await supabase.from("partners").update({
      name: editForm.name.trim(), slug: editForm.slug.trim() || toSlug(editForm.name),
      description: editForm.description.trim() || null, personality: editForm.personality.trim() || null,
      system_prompt: editForm.system_prompt.trim() || null, avatar_url: editForm.avatar_url.trim() || null,
      ai_model_id: editForm.ai_model_id || null, agent_id: editForm.agent_id || null, is_active: editForm.is_active,
    }).eq("id", editingPartner.id);
    if (error) alert(error.message);
    else { setEditingPartner(null); await fetchAll(); }
    setSaving(false);
  }

  async function toggle(id: string, current: boolean) {
    await supabase.from("partners").update({ is_active: !current }).eq("id", id);
    await fetchAll();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce partenaire ?")) return;
    await supabase.from("partners").delete().eq("id", id);
    await fetchAll();
  }

  function openEdit(row: AIPartnerRow) {
    setEditingPartner(row);
    setEditForm({ name: row.name, slug: row.slug, description: row.description ?? "", personality: row.personality ?? "", system_prompt: row.system_prompt ?? "", avatar_url: row.avatar_url ?? "", ai_model_id: row.ai_model_id ?? "", agent_id: row.agent_id ?? "", is_active: row.is_active });
  }

  useEffect(() => { fetchAll(); }, []);

  const PartnerForm = ({ values, set, onSubmit, onCancel }: { values: typeof form; set: typeof f; onSubmit: () => void; onCancel: () => void }) => (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={values.name} onChange={e => set("name", e.target.value)} placeholder="Nom *" className={INPUT} />
        <input value={values.slug} onChange={e => set("slug", e.target.value)} placeholder="Slug (auto)" className={INPUT} />
        <input value={values.description} onChange={e => set("description", e.target.value)} placeholder="Description courte" className={INPUT} />
        <input value={values.personality} onChange={e => set("personality", e.target.value)} placeholder="Personnalité" className={INPUT} />
        <select value={values.ai_model_id} onChange={e => set("ai_model_id", e.target.value)} className={INPUT}>
          <option value="">— Modèle IA —</option>
          {allModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={values.agent_id} onChange={e => set("agent_id", e.target.value)} className={INPUT}>
          <option value="">— Agent IA —</option>
          {allAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <textarea value={values.system_prompt} onChange={e => set("system_prompt", e.target.value)}
          placeholder="System prompt spécifique" rows={3} className={`${INPUT} resize-none`} />
      </div>
      <div className="mt-3">
        <label className="text-xs text-muted-foreground mb-1 block">Photo / Avatar</label>
        <AvatarField value={values.avatar_url} onChange={v => set("avatar_url", v)}
          buildPrompt={() => buildAvatarPrompt(values.name, values.description || "", values.personality || "", values.system_prompt || "")} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={values.is_active} onChange={e => set("is_active", e.target.checked)} /> Actif
        </label>
        <div className="flex gap-2">
          <button onClick={onSubmit} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "…" : "Enregistrer"}
          </button>
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Annuler</button>
        </div>
      </div>
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-muted-foreground">{rows.length} partenaire{rows.length > 1 ? "s" : ""}</span>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
            <RefreshCw className="w-3 h-3" /> Rafraîchir
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Créer
          </button>
        </div>
      </div>

      {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Chargement…</div>
       : rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">Aucun partenaire configuré.</div>
       : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(row => (
            <div key={row.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:shadow-soft transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {row.avatar_url
                    ? <img src={row.avatar_url} className="w-12 h-12 rounded-xl object-cover shrink-0 ring-1 ring-border" alt="" />
                    : <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0 text-lg font-semibold text-violet-600">{row.name.charAt(0).toUpperCase()}</div>
                  }
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{row.name}</div>
                    {row.description && <div className="text-xs text-muted-foreground line-clamp-1">{row.description}</div>}
                  </div>
                </div>
                <ActiveBadge active={row.is_active} onClick={() => toggle(row.id, row.is_active)} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {allModels.find(m => m.id === row.ai_model_id) && (
                  <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                    {allModels.find(m => m.id === row.ai_model_id)?.name}
                  </span>
                )}
                {allAgents.find(a => a.id === row.agent_id) && (
                  <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 font-medium">
                    {allAgents.find(a => a.id === row.agent_id)?.name}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-auto pt-1">
                <button onClick={() => openEdit(row)} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-center hover:bg-muted transition-colors">Modifier</button>
                <button onClick={() => remove(row.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal title="Nouveau partenaire" open={showCreate} onClose={() => setShowCreate(false)}>
        <PartnerForm values={form} set={f} onSubmit={create} onCancel={() => setShowCreate(false)} />
      </AdminModal>
      <AdminModal title="Modifier le partenaire" open={!!editingPartner} onClose={() => setEditingPartner(null)}>
        <PartnerForm values={editForm} set={ef} onSubmit={update} onCancel={() => setEditingPartner(null)} />
      </AdminModal>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ActiveBadge({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-green-500/15 text-green-400 hover:bg-green-500/25" : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}>
      {active ? "Actif" : "Inactif"}
    </button>
  );
}

// ─── AvatarField ──────────────────────────────────────────────────────────────

async function uploadAvatarToStorage(file: File): Promise<string | null> {
  const ext = (file.name.split(".").pop() ?? "png").replace(/[^a-zA-Z0-9]/g, "");
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
  if (error) { console.error("[Storage] Avatar:", error.message); return null; }
  const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(data.path);
  return publicUrl;
}

function buildAvatarPrompt(name: string, role: string, personality: string, expertise: string): string {
  return `Create a professional SaaS assistant avatar.

Character name: ${name || "Assistant"}

Role:
${role || "AI assistant"}

Personality:
${personality || "Professional and friendly"}

Expertise:
${expertise || "General assistance"}

Generate a realistic corporate portrait that visually reflects the role, expertise and personality.

Requirements:
- Photorealistic human
- Upper body portrait
- Looking at camera
- Friendly and trustworthy expression
- Modern business environment
- Professional clothing matching the role
- Clean neutral background
- Premium startup software style
- High-end LinkedIn profile quality
- Soft studio lighting
- Sharp focus
- No text, no logos, no watermark
- Centered composition`;
}

async function generateAvatarViaEdgeFunction(prompt: string): Promise<string | null> {
  const name = prompt.match(/Character name:\s*(.+)/)?.[1]?.trim() ?? "";
  const role = prompt.match(/Role:\n(.+)/)?.[1]?.trim() ?? "";
  const personality = prompt.match(/Personality:\n(.+)/)?.[1]?.trim() ?? "";
  const shortPrompt = ["photorealistic corporate portrait,", name && `${name},`, role && `${role},`, personality && `${personality},`,
    "upper body, looking at camera, professional clothing, studio lighting, clean background, sharp focus, no text"].filter(Boolean).join(" ");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { alert("Session expirée."); return null; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ prompt: shortPrompt }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === "AbortError") alert("Timeout — réessaie dans 30s.");
    else alert(`Erreur réseau : ${(e as Error).message}`);
    return null;
  }
  clearTimeout(timeout);
  const json = await res.json() as { url?: string; error?: string };
  if (!res.ok || !json.url) { alert(`Génération échouée (${res.status}) : ${json.error ?? "voir console"}`); return null; }
  return json.url;
}

function AvatarField({ value, onChange, buildPrompt }: {
  value: string; onChange: (url: string) => void; buildPrompt: () => string;
}) {
  const [uploading, setUploading] = useState(false);
  const [imgStatus, setImgStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    const prompt = buildPrompt();
    if (!prompt.replace(/[,\s]/g, "").trim()) { alert("Remplis d'abord le champ Nom."); return; }
    setUploading(true); setImgStatus("loading");
    const url = await generateAvatarViaEdgeFunction(prompt);
    if (url) { onChange(url); setImgStatus("ok"); } else setImgStatus("error");
    setUploading(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const url = await uploadAvatarToStorage(file);
    if (url) onChange(url); else alert("Upload échoué. Vérifie que le bucket 'avatars' existe dans Supabase Storage.");
    setUploading(false); e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="https://… (URL directe)" className={`${INPUT} flex-1`} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          {uploading ? "…" : "📁"}
        </button>
        <button type="button" onClick={() => void handleGenerate()} disabled={uploading}
          className="shrink-0 rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1.5 text-sm text-brand hover:bg-brand/10 disabled:opacity-50">
          {uploading ? "⏳ Génération (~60s)" : "🤖 IA"}
        </button>
        <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleFile} />
      </div>
      {value && (
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden ring-1 ring-border shrink-0 bg-muted">
            {imgStatus === "loading" && (
              <div className="absolute inset-0 bg-muted/90 flex flex-col items-center justify-center gap-0.5 z-10">
                <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-[0.55rem] text-muted-foreground">~60s</span>
              </div>
            )}
            <img src={value} alt="avatar" className="w-full h-full object-cover"
              onLoad={() => setImgStatus("ok")} onError={() => setImgStatus("error")} />
          </div>
          {imgStatus === "error" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Échec — réessaie</span>
              <button type="button" onClick={() => void handleGenerate()}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">↻ Regénérer</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
