export type UserRole = "super_admin" | "admin" | "beta_tester" | "viewer";

export const ROLE_LABELS: Record<UserRole, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    beta_tester: "Bêta testeur",
    viewer: "Lecteur",
  };

  export function isAdmin(role?: string | null) {
    return role === "admin" || role === "super_admin";
  }

export function isBetaTester(role?: string | null) {
  return role === "beta_tester";
}

export function isViewer(role?: string | null) {
  return role === "viewer";
}

export function canAccessAdmin(role?: string | null) {
  return isAdmin(role);
}

export function canUseChat(role?: string | null) {
  return isAdmin(role) || role === "beta_tester";
}

export function canUseWorkflows(role?: string | null) {
  return isAdmin(role) || role === "beta_tester";
}

export function canEditPrompts(role?: string | null) {
  return isAdmin(role);
}

export function canReadPrompts(role?: string | null) {
  return isAdmin(role) || role === "beta_tester" || role === "viewer";
}

export function canCreateContent(role?: string | null) {
  return isAdmin(role) || role === "beta_tester";
}