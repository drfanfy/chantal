import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useApp } from "@/lib/appContext";
import { WorkflowView } from "@/components/WorkflowView";
import { FormationView } from "@/components/FormationView";
import { AdminDashboard } from "@/components/AdminDashboard";
import { PartnersView } from "@/components/PartnersView";
import { PromptsView } from "@/components/PromptsView";
import { StudioView } from "@/components/StudioView";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ title: "Espace de travail — Chantal" }],
  }),
  component: AppPage,
});

function AppPage() {
  const { viewMode, setActiveConversation, setPendingPrefill } = useApp();
  const navigate = useNavigate();

  const onPromptSelect = (text: string) => {
    setPendingPrefill(text);
    setActiveConversation(null);
    navigate({ to: "/chat" });
  };

  return (
    <AppShell>
      <main className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {viewMode === "workflow" && (
            <motion.div key="workflow" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <WorkflowView />
            </motion.div>
          )}
  
          {viewMode === "formation" && (
            <motion.div key="formation" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <FormationView />
            </motion.div>
          )}
  
          {viewMode === "admin" && (
            <motion.div key="admin" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <AdminDashboard />
            </motion.div>
          )}
  
          {viewMode === "partners" && (
            <motion.div key="partners" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <PartnersView />
            </motion.div>
          )}
  
          {viewMode === "prompts" && (
            <motion.div key="prompts" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <PromptsView onSelect={onPromptSelect} />
            </motion.div>
          )}
  
          {viewMode === "studio" && (
            <motion.div key="studio" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <StudioView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </AppShell>
  );
}
