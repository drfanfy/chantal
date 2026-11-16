import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { useApp } from "@/lib/appContext";
import { WorkflowView } from "@/components/WorkflowView";
import { FormationView } from "@/components/FormationView";
import { AdminDashboard } from "@/components/AdminDashboard";
import { PartnersView } from "@/components/PartnersView";
import { PromptsView } from "@/components/PromptsView";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Espace de travail — Chantal" }] }),
  component: AppPage,
});

const VIEWS = {
  workflow: WorkflowView,
  formation: FormationView,
  admin: AdminDashboard,
  partners: PartnersView,
  prompts: PromptsView,
} as const;

function AppPage() {
  const { viewMode } = useApp();
  const View = VIEWS[viewMode] ?? WorkflowView;
  return (
    <AppShell>
      <main className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </main>
    </AppShell>
  );
}
