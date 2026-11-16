import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { Users, Cpu, Bot, UserRound, BookOpen, Zap, Settings, ScrollText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/authContext";
import { hasPermission, type Permission } from "@/lib/permissions";
import { UsersSection } from "@/components/admin/UsersSection";
import { ModelsSection } from "@/components/admin/ModelsSection";
import { PersonasSection } from "@/components/admin/PersonasSection";
import { PromptsSection } from "@/components/admin/PromptsSection";
import { WorkflowsSection } from "@/components/admin/WorkflowsSection";
import { AuditSection, SettingsSection } from "@/components/admin/SettingsAuditSections";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administration — Chantal" }] }),
  component: AdminPage,
});

interface Tab {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission: Permission;
  render: () => React.ReactNode;
}

const TABS: Tab[] = [
  {
    key: "users",
    label: "Utilisateurs",
    icon: Users,
    permission: "user.manage",
    render: () => <UsersSection />,
  },
  {
    key: "models",
    label: "Modèles IA",
    icon: Cpu,
    permission: "model.manage",
    render: () => <ModelsSection />,
  },
  {
    key: "agents",
    label: "Agents",
    icon: Bot,
    permission: "agent.manage",
    render: () => <PersonasSection kind="agents" />,
  },
  {
    key: "partners",
    label: "Partenaires",
    icon: UserRound,
    permission: "partner.manage",
    render: () => <PersonasSection kind="partners" />,
  },
  {
    key: "prompts",
    label: "Prompts",
    icon: BookOpen,
    permission: "prompt.manage",
    render: () => <PromptsSection />,
  },
  {
    key: "workflows",
    label: "Workflows",
    icon: Zap,
    permission: "workflow.manage",
    render: () => <WorkflowsSection />,
  },
  {
    key: "settings",
    label: "Paramètres",
    icon: Settings,
    permission: "user.manage",
    render: () => <SettingsSection />,
  },
  {
    key: "audit",
    label: "Journal d'audit",
    icon: ScrollText,
    permission: "audit.view",
    render: () => <AuditSection />,
  },
];

function AdminPage() {
  const { profile } = useAuth();
  const tabs = TABS.filter((t) => hasPermission(profile?.role, t.permission));
  const [active, setActive] = useState(tabs[0]?.key ?? "users");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <AppShell>
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <nav
          aria-label="Sections d'administration"
          className="shrink-0 border-b md:border-b-0 md:border-r border-border bg-sidebar-bg md:w-56 overflow-x-auto"
        >
          <ul className="flex md:flex-col gap-1 p-2 md:p-3">
            {tabs.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setActive(t.key)}
                  aria-current={current?.key === t.key ? "page" : undefined}
                  className={`flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${current?.key === t.key ? "bg-brand/10 text-brand font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6">
          {current ? (
            current.render()
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune section disponible pour votre rôle.
            </p>
          )}
        </main>
      </div>
    </AppShell>
  );
}
