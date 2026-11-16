import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HomeDashboard } from "@/components/HomeDashboard";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Accueil — Chantal" },
      {
        name: "description",
        content: "Votre tableau de bord IA : recommandations, favoris et activité récente.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <AppShell>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <HomeDashboard />
      </main>
    </AppShell>
  );
}
