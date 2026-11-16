/**
 * Compatibilité : helpers historiques du POC, désormais adossés à la matrice
 * de permissions (src/lib/permissions.ts). Préférer hasPermission().
 */
import { hasPermission } from "./permissions";

export type { UserRole } from "./permissions";
export { ROLE_LABELS } from "./permissions";

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
  return hasPermission(role, "chat.use");
}
export function canUseWorkflows(role?: string | null) {
  return hasPermission(role, "workflow.run");
}
export function canEditPrompts(role?: string | null) {
  return hasPermission(role, "prompt.manage");
}
export function canReadPrompts(role?: string | null) {
  return hasPermission(role, "prompt.read");
}
export function canCreateContent(role?: string | null) {
  return hasPermission(role, "chat.use");
}
