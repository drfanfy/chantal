import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { AppProvider } from "@/lib/appContext";
import { FavoritesProvider } from "@/lib/favorites";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";
import { hasPermission } from "@/lib/permissions";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La page que vous recherchez n'existe pas.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Chantal — Gouvernance et Orchestration de l'IA" },
      {
        name: "description",
        content:
          "Plateforme interne d'IA pour les entreprises. Chat, agents, workflows et formations.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const PUBLIC_ROUTES = ["/login", "/auth/callback"];

function RootComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  return (
    <AuthProvider>
      <AppProvider>
        <FavoritesProvider>
          {isPublicRoute ? (
            <Outlet />
          ) : (
            <ProtectedRoute>
              <RoleGuard pathname={pathname}>
                <Outlet />
              </RoleGuard>
            </ProtectedRoute>
          )}
          <Toaster position="bottom-right" richColors closeButton />
        </FavoritesProvider>
      </AppProvider>
    </AuthProvider>
  );
}

/**
 * Garde d'interface par route. La sécurité effective est assurée par la base
 * (RLS) et les routes serveur ; ce garde évite seulement d'afficher un écran
 * inutilisable.
 */
function RoleGuard({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { profile } = useAuth();
  const role = profile?.role;
  const needsAdmin = pathname.startsWith("/admin");
  const needsTickets = pathname.startsWith("/tickets");
  const allowed =
    (!needsAdmin ||
      ["user.manage", "model.manage", "prompt.manage", "workflow.manage", "agent.manage"].some(
        (p) => hasPermission(role, p as never),
      )) &&
    (!needsTickets || hasPermission(role, "ticket.manage"));
  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">Accès réservé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette section est réservée aux administrateurs CHANTAL.
          </p>
          <Link
            to="/home"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
