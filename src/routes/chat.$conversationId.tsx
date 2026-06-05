import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { WorkflowView } from "@/components/WorkflowView";
import { useApp } from "@/lib/appContext";
import { useAuth } from "@/lib/authContext";
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/$conversationId")({
  head: () => ({
    meta: [{ title: "Conversation — Chantal" }],
  }),
  component: ChatPage,
  notFoundComponent: () => (
    <AppShell>
      <main className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold">Conversation introuvable</h1>
        <p className="text-sm text-muted-foreground">Cette conversation n'existe plus ou a été supprimée.</p>
        <Link to="/home" className="text-sm text-brand hover:underline">Retour à l'accueil</Link>
      </main>
    </AppShell>
  ),
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { conversations, conversationsLoaded, setActiveConversation, activeConversationId, loadConversationsFromDB } = useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const hasTriggeredLoad = useRef(false);

  // Déclenche le chargement si on arrive directement par URL (refresh)
  useEffect(() => {
    if (profile?.id && !conversationsLoaded && !hasTriggeredLoad.current) {
      hasTriggeredLoad.current = true;
      void loadConversationsFromDB(profile.id, profile.role === "super_admin");
    }
  }, [profile?.id, conversationsLoaded, loadConversationsFromDB]);

  const conv = conversations.find(c => c.id === conversationId);

  useEffect(() => {
    if (!conv) return;
    if (activeConversationId !== conversationId) {
      setActiveConversation(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conv]);

  // Attendre le chargement DB avant de conclure que la conversation est introuvable
  if (!conversationsLoaded) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Chargement…
        </div>
      </AppShell>
    );
  }

  if (!conv) throw notFound();

  if (conv.type === "workflow") {
    return (
      <AppShell>
        <main className="flex-1 min-w-0">
          <WorkflowView />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ConversationSidebar />
      <main className="flex-1 min-w-0 min-h-0">
        <ChatInterface />
      </main>
    </AppShell>
  );
}
