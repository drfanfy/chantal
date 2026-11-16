/**
 * Matrice de permissions CHANTAL.
 *
 * Source de vérité côté application ; MIROIR EXACT de la table SQL
 * `role_permissions` (migration 20261116000100_rbac_audit.sql). Le test
 * tests/unit/permissions.test.ts échoue si les deux divergent.
 *
 * Côté client, ces fonctions ne servent qu'à adapter l'interface : les
 * contrôles effectifs sont faits par la base (RLS) et par les routes serveur.
 */
export const ROLES = ["super_admin", "admin", "beta_tester", "viewer"] as const;
export type UserRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  beta_tester: "Bêta-testeur",
  viewer: "Lecteur",
};

export const PERMISSIONS = [
  "prompt.read",
  "conversation.read_shared",
  "workflow.read",
  "formation.read",
  "chat.use",
  "conversation.share",
  "workflow.run",
  "prompt.manage",
  "workflow.manage",
  "agent.manage",
  "partner.manage",
  "user.manage",
  "reporting.view",
  "reporting.export",
  "audit.view",
  "ticket.manage",
  "formation.manage",
  "model.manage",
  "conversation.moderate",
  "settings.manage",
  "user.manage_super",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "prompt.read": "Consulter et utiliser les prompts publiés",
  "conversation.read_shared": "Lire les conversations partagées",
  "workflow.read": "Consulter le catalogue de workflows",
  "formation.read": "Suivre les formations",
  "chat.use": "Utiliser le chat IA",
  "conversation.share": "Partager ses conversations",
  "workflow.run": "Exécuter des workflows",
  "prompt.manage": "Administrer les prompts",
  "workflow.manage": "Administrer les workflows",
  "agent.manage": "Administrer les agents",
  "partner.manage": "Administrer les partenaires",
  "user.manage": "Gérer les utilisateurs (hors super admins)",
  "reporting.view": "Consulter le reporting",
  "reporting.export": "Exporter le reporting",
  "audit.view": "Consulter le journal d'audit",
  "ticket.manage": "Traiter les tickets",
  "formation.manage": "Éditer les formations",
  "model.manage": "Administrer modèles et connexions IA",
  "conversation.moderate": "Masquer une conversation partagée",
  "settings.manage": "Modifier les paramètres (rétention…)",
  "user.manage_super": "Gérer les super admins, rattacher des comptes",
};

const VIEWER: Permission[] = [
  "prompt.read",
  "conversation.read_shared",
  "workflow.read",
  "formation.read",
];
const BETA: Permission[] = [...VIEWER, "chat.use", "conversation.share", "workflow.run"];
const ADMIN: Permission[] = [
  ...BETA,
  "prompt.manage",
  "workflow.manage",
  "agent.manage",
  "partner.manage",
  "user.manage",
  "reporting.view",
  "reporting.export",
  "audit.view",
  "ticket.manage",
  "formation.manage",
];
const SUPER: Permission[] = [
  ...ADMIN,
  "model.manage",
  "conversation.moderate",
  "settings.manage",
  "user.manage_super",
];

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  viewer: new Set(VIEWER),
  beta_tester: new Set(BETA),
  admin: new Set(ADMIN),
  super_admin: new Set(SUPER),
};

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleRank(role: string | null | undefined): number {
  switch (role) {
    case "super_admin":
      return 3;
    case "admin":
      return 2;
    case "beta_tester":
      return 1;
    case "viewer":
      return 0;
    default:
      return -1;
  }
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  return isRole(role) && ROLE_PERMISSIONS[role].has(permission);
}

export function hasMinRole(role: string | null | undefined, minRole: string): boolean {
  return roleRank(role) >= 0 && roleRank(role) >= roleRank(minRole);
}
