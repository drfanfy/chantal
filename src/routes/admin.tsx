import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type UserRole = "super_admin" | "admin" | "beta_tester" | "viewer";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string | null;
  is_active: boolean;
};

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const ROLE_OPTIONS: UserRole[] = [
  "super_admin",
  "admin",
  "beta_tester",
  "viewer",
];

function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("beta_tester");
  const [creating, setCreating] = useState(false);

  async function fetchProfiles() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, avatar_url, created_at, is_active")
    .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setProfiles([]);
    } else {
      setProfiles((data as Profile[]) ?? []);
    }

    setLoading(false);
  }

  async function updateRole(userId: string, role: UserRole) {
    setSavingId(userId);

    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    if (error) {
      alert(error.message);
    }

    await fetchProfiles();
    setSavingId(null);
  }

  async function createUser() {
    if (!newEmail || !newFullName || !newPassword) {
      alert("Email, nom et mot de passe sont obligatoires.");
      return;
    }
  
    setCreating(true);
  
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newEmail,
          password: newPassword,
          full_name: newFullName,
          role: newRole,
        },
      });
  
      console.log("create-user response", { data, error });
  
      if (error) {
        alert(`Erreur Edge Function : ${error.message}`);
        return;
      }
  
      if (data?.error) {
        alert(`Erreur création utilisateur : ${data.error}`);
        return;
      }
  
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");
      setNewRole("beta_tester");
  
      await fetchProfiles();
    } catch (err) {
      console.error("Erreur createUser:", err);
      alert("Erreur inattendue pendant la création utilisateur.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">BO Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gestion des utilisateurs et administration CHANTAL.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-medium">Créer un utilisateur</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <input
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="Nom"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />

            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />

            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mot de passe temporaire"
              type="password"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={createUser}
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? "Création..." : "Créer"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="text-lg font-medium">Utilisateurs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gestion des rôles utilisateurs CHANTAL.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchProfiles}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Rafraîchir
            </button>
          </div>

          {loading && (
            <div className="p-5 text-sm text-muted-foreground">
              Chargement des utilisateurs...
            </div>
          )}

          {error && (
            <div className="p-5 text-sm text-red-500">
              Erreur Supabase : {error}
            </div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Nom</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Rôle</th>
                    <th className="px-5 py-3 font-medium">Créé le</th>
                  </tr>
                </thead>

                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">{profile.full_name || "—"}</td>

                      <td className="px-5 py-3 text-muted-foreground">
                        {profile.email}
                      </td>

                      <td className="px-5 py-3">
  <div className="flex flex-col gap-2">
    <select
      value={profile.role}
      disabled={savingId === profile.id}
      onChange={(e) =>
        updateRole(profile.id, e.target.value as UserRole)
      }
      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      {ROLE_OPTIONS.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>

    <div
      className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${
        profile.is_active
          ? "bg-green-500/15 text-green-400"
          : "bg-red-500/15 text-red-400"
      }`}
    >
      {profile.is_active ? "Actif" : "Désactivé"}
    </div>
  </div>
</td>

                      <td className="px-5 py-3 text-muted-foreground">
                        {profile.created_at
                          ? new Date(profile.created_at).toLocaleDateString("fr-FR")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {profiles.length === 0 && (
                <div className="p-5 text-sm text-muted-foreground">
                  Aucun utilisateur trouvé.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}