import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { HomeDashboard } from "@/components/HomeDashboard";
import { useApp } from "@/lib/appContext";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Accueil — Chantal" },
      { name: "description", content: "Votre tableau de bord IA : recommandations, favoris et activité récente." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { setPendingPrefill, setActiveConversation } = useApp();

  const onPromptSelect = (text: string) => {
    setPendingPrefill(text);
    setActiveConversation(null);
    navigate({ to: "/chat" });
  };

  return (
    <AppShell>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <HomeDashboard onPromptSelect={onPromptSelect} />
      </main>
    </AppShell>
  );
}