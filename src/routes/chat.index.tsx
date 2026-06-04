import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { useApp } from "@/lib/appContext";
import { useEffect } from "react";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [{ title: "Nouvelle conversation — Chantal" }],
  }),
  component: NewChatPage,
});

function NewChatPage() {
  const { setActiveConversation, activeConversationId } = useApp();
  useEffect(() => {
    if (activeConversationId) setActiveConversation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <ConversationSidebar />
      <main className="flex-1 min-w-0 min-h-0">
        <ChatInterface />
      </main>
    </AppShell>
  );
}
