import { useAuth } from "@/lib/authContext";
import type { UserRole } from "@/lib/roles";

type RoleGateProps = {
  allow: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function RoleGate({ allow, children, fallback = null }: RoleGateProps) {
  const { profile } = useAuth();

  const role = profile?.role as UserRole | undefined;

  if (!role || !allow.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
