import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Link2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { apiFetch, apiPost, errorDetails, errorMessage } from "@/lib/api";
import { hasPermission, ROLE_LABELS, type UserRole } from "@/lib/permissions";
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
  ROLE_OPTIONS,
  SearchBox,
  SectionHeader,
  SelectField,
  TextField,
  formatDate,
  useDirtyForm,
  type Column,
} from "./ui";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  identity_provider: string;
  provisioning_source: string;
}
interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
}
interface MatchRow {
  pending_id: string;
  pending_email: string;
  pending_provider: string;
  existing_id: string;
  existing_provider: string;
  existing_role: string;
  existing_active: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  legacy: "POC",
  admin: "Admin",
  invitation: "Invitation",
  pending_approval: "En attente",
  sso_group: "Groupe SSO",
};

export function UsersSection() {
  const { profile } = useAuth();
  const canSuper = hasPermission(profile?.role, "user.manage_super");
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "disabled">(
    "all",
  );
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<MatchRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, i] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, full_name, role, is_active, created_at, last_sign_in_at, identity_provider, provisioning_source",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("user_invitations")
        .select("*")
        .is("consumed_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
    ]);
    if (p.error) setError(errorMessage(p.error));
    else setError(null);
    setRows((p.data ?? []) as ProfileRow[]);
    setInvites((i.data ?? []) as Invitation[]);
    if (canSuper) {
      const { data } = await supabase.rpc("pending_account_matches");
      setMatches((data ?? []) as MatchRow[]);
    }
    setLoading(false);
  }, [canSuper]);
  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      const st = r.is_active
        ? "active"
        : r.provisioning_source === "pending_approval"
          ? "pending"
          : "disabled";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      return !s || [r.full_name, r.email].some((v) => v?.toLowerCase().includes(s));
    });
  }, [rows, q, roleFilter, statusFilter]);
  const pendingCount = rows.filter(
    (r) => !r.is_active && r.provisioning_source === "pending_approval",
  ).length;

  const columns: Column<ProfileRow>[] = [
    {
      key: "name",
      header: "Nom",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.full_name || "—"}</div>
          <div className="text-xs text-muted-foreground md:hidden">{r.email}</div>
        </div>
      ),
    },
    {
      key: "email",
      header: "E-mail",
      cell: (r) => <span className="text-muted-foreground">{r.email}</span>,
      hideOnMobile: true,
    },
    {
      key: "role",
      header: "Rôle",
      cell: (r) => (
        <Badge tone={r.role === "super_admin" ? "violet" : r.role === "admin" ? "blue" : "gray"}>
          {ROLE_LABELS[r.role]}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Statut",
      cell: (r) =>
        r.is_active ? (
          <Badge tone="green">Actif</Badge>
        ) : r.provisioning_source === "pending_approval" ? (
          <Badge tone="amber">En attente</Badge>
        ) : (
          <Badge tone="red">Désactivé</Badge>
        ),
    },
    {
      key: "idp",
      header: "Identité",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.identity_provider} · {SOURCE_LABEL[r.provisioning_source] ?? r.provisioning_source}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "last",
      header: "Dernière connexion",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDate(r.last_sign_in_at)}</span>
      ),
      hideOnMobile: true,
    },
  ];

  async function revokeInvite(id: string) {
    const { error: e } = await supabase
      .from("user_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (e) toast.error(errorMessage(e));
    else {
      toast.success("Invitation révoquée");
      void load();
    }
  }

  async function merge() {
    if (!mergeTarget) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("merge_user_accounts", {
      p_from: mergeTarget.existing_id,
      p_to: mergeTarget.pending_id,
    });
    setBusy(false);
    if (e) toast.error(errorMessage(e));
    else {
      toast.success("Comptes rattachés : l'historique a été transféré");
      setMergeTarget(null);
      void load();
    }
  }

  return (
    <div>
      <SectionHeader
        title="Utilisateurs"
        description="Comptes, rôles et accès. Aucune inscription libre : un compte inconnu reste en attente jusqu'à validation."
        actions={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => void load()}>
              <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" /> Ajouter un utilisateur
            </button>
          </>
        }
      />
      {pendingCount > 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          {pendingCount} compte(s) en attente de validation.
        </div>
      )}
      {canSuper && matches.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
          <div className="font-medium mb-2">Rattachements possibles (même adresse e-mail)</div>
          <ul className="space-y-1.5">
            {matches.map((m) => (
              <li key={m.pending_id + m.existing_id} className="flex flex-wrap items-center gap-2">
                <span>
                  <strong>{m.pending_email}</strong> — nouvelle identité{" "}
                  <Badge>{m.pending_provider}</Badge> ↔ compte existant{" "}
                  <Badge>{m.existing_provider}</Badge> (
                  {ROLE_LABELS[m.existing_role as UserRole] ?? m.existing_role})
                </span>
                <button type="button" className={BTN_SECONDARY} onClick={() => setMergeTarget(m)}>
                  <Link2 className="w-3.5 h-3.5" /> Rattacher…
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Nom ou e-mail…" />
        <FilterSelect
          label="Rôle"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "all", label: "Tous" },
            ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: ROLE_LABELS[r.value] })),
          ]}
        />
        <FilterSelect
          label="Statut"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "Tous" },
            { value: "active", label: "Actifs" },
            { value: "pending", label: "En attente" },
            { value: "disabled", label: "Désactivés" },
          ]}
        />
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {rows.length}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        error={error}
        empty="Aucun utilisateur ne correspond."
        onRowClick={setEditing}
      />

      {invites.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-2">Invitations en attente</h3>
          <DataTable
            rows={invites}
            empty=""
            columns={[
              { key: "email", header: "E-mail", cell: (r) => r.email },
              { key: "role", header: "Rôle", cell: (r) => ROLE_LABELS[r.role] },
              { key: "exp", header: "Expire le", cell: (r) => formatDate(r.expires_at, false) },
              {
                key: "a",
                header: "",
                cell: (r) => (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={() => void revokeInvite(r.id)}
                  >
                    Révoquer
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {editing && (
        <EditUserSheet
          row={editing}
          canSuper={canSuper}
          selfId={profile?.id ?? ""}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {creating && (
        <CreateUserSheet
          canSuper={canSuper}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      <ConfirmDialog
        open={!!mergeTarget}
        busy={busy}
        title="Rattacher ces comptes ?"
        description={
          <>
            <p>
              Les conversations, favoris, exécutions et tickets du compte existant (
              {mergeTarget?.existing_provider}) seront transférés vers la nouvelle identité (
              {mergeTarget?.pending_provider}) qui reprendra son rôle. L'ancien compte sera
              désactivé.
            </p>
            <p>
              Vérifiez qu'il s'agit bien de la même personne : le rattachement n'est jamais
              automatique.
            </p>
          </>
        }
        confirmLabel="Rattacher"
        onConfirm={() => void merge()}
        onCancel={() => setMergeTarget(null)}
      />
    </div>
  );
}

function EditUserSheet({
  row,
  canSuper,
  selfId,
  onClose,
  onSaved,
}: {
  row: ProfileRow;
  canSuper: boolean;
  selfId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useDirtyForm({
    full_name: row.full_name ?? "",
    role: row.role,
    is_active: row.is_active,
  });
  const [saving, setSaving] = useState(false);
  const isSelf = row.id === selfId;
  const lockedSuper = row.role === "super_admin" && !canSuper;
  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.value.full_name.trim() || null,
        role: form.value.role,
        is_active: form.value.is_active,
      })
      .eq("id", row.id);
    setSaving(false);
    if (error) toast.error(errorMessage(error));
    else {
      toast.success("Utilisateur enregistré");
      onSaved();
    }
  }
  return (
    <EditorSheet
      open
      onClose={onClose}
      wide={false}
      dirty={form.dirty}
      title={row.full_name || row.email || "Utilisateur"}
      subtitle={`${row.email} · créé le ${formatDate(row.created_at, false)}`}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!form.dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Nom complet"
          value={form.value.full_name}
          onChange={(v) => form.patch({ full_name: v })}
          maxLength={120}
        />
        <SelectField
          label="Rôle"
          value={form.value.role}
          disabled={isSelf || lockedSuper}
          onChange={(v) => form.patch({ role: v })}
          options={ROLE_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "super_admin" && !canSuper,
          }))}
          help={
            isSelf
              ? "Vous ne pouvez pas modifier votre propre rôle."
              : lockedSuper
                ? "Seul un super administrateur peut modifier ce compte."
                : "Le rôle détermine les permissions (voir docs/03-fonctionnement-metier.md)."
          }
        />
        <CheckboxField
          label="Compte actif"
          checked={form.value.is_active}
          disabled={isSelf || lockedSuper}
          onChange={(v) => form.patch({ is_active: v })}
          help={
            row.provisioning_source === "pending_approval" && !row.is_active
              ? "Compte en attente : activez-le pour autoriser l'accès."
              : "Un compte désactivé ne peut plus accéder à CHANTAL (ses données sont conservées)."
          }
        />
      </div>
    </EditorSheet>
  );
}

function CreateUserSheet({
  canSuper,
  onClose,
  onCreated,
}: {
  canSuper: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const form = useDirtyForm({
    email: "",
    fullName: "",
    role: "beta_tester" as UserRole,
    mode: "invite" as "invite" | "password",
    password: "",
  });
  const [passwordAllowed, setPasswordAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    void apiFetch<{ passwordCreationEnabled: boolean }>("/api/admin/users")
      .then((r) => setPasswordAllowed(r.passwordCreationEnabled))
      .catch(() => setPasswordAllowed(false));
  }, []);
  async function create() {
    setSaving(true);
    setErrors([]);
    try {
      const r = await apiPost<{ mode: string }>("/api/admin/users", {
        ...form.value,
        password: form.value.mode === "password" ? form.value.password : undefined,
      });
      toast.success(
        r.mode === "invite"
          ? "Invitation enregistrée : le compte sera activé à la première connexion SSO"
          : "Compte créé",
      );
      onCreated();
    } catch (e) {
      toast.error(errorMessage(e));
      setErrors(errorDetails(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <EditorSheet
      open
      onClose={onClose}
      wide={false}
      dirty={form.dirty}
      title="Ajouter un utilisateur"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={saving || !form.value.email || !form.value.fullName}
            onClick={() => void create()}
          >
            {saving ? "…" : form.value.mode === "invite" ? "Inviter" : "Créer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <TextField
            label="Nom complet"
            required
            value={form.value.fullName}
            onChange={(v) => form.patch({ fullName: v })}
          />
          <TextField
            label="E-mail professionnel"
            required
            type="email"
            value={form.value.email}
            onChange={(v) => form.patch({ email: v })}
          />
        </FormGrid>
        <SelectField
          label="Rôle"
          value={form.value.role}
          onChange={(v) => form.patch({ role: v })}
          options={ROLE_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "super_admin" && !canSuper,
          }))}
        />
        <SelectField
          label="Mode de création"
          value={form.value.mode}
          onChange={(v) => form.patch({ mode: v })}
          options={[
            { value: "invite", label: "Invitation (connexion SSO d'entreprise)" },
            {
              value: "password",
              label: "Mot de passe temporaire (développement / transition)",
              disabled: !passwordAllowed,
            },
          ]}
          help={
            passwordAllowed
              ? "L'invitation est consommée à la première connexion avec cette adresse."
              : "Création par mot de passe désactivée sur cet environnement."
          }
        />
        {form.value.mode === "password" && (
          <TextField
            label="Mot de passe temporaire"
            required
            type="password"
            value={form.value.password}
            onChange={(v) => form.patch({ password: v })}
            help="12 caractères minimum. À transmettre par un canal sûr."
          />
        )}
        {errors.length > 0 && (
          <ul className="text-xs text-destructive list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </EditorSheet>
  );
}
