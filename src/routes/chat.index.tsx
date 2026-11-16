import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { useApp } from "@/lib/appContext";

export const Route = createFileRoute("/chat/")({
  head: () => ({ meta: [{ title: "Nouvelle conversation — Chantal" }] }),
  component: NewChatPage,
});

function NewChatPage() {
  const { setActiveConversation } = useApp();
  useEffect(() => {
    setActiveConversation(null);
  }, [setActiveConversation]);
  return (
    <AppShell>
      <ConversationSidebar activeId={null} />
      <main className="flex-1 min-w-0 min-h-0">
        <ChatInterface conversationId={null} />
      </main>
    </AppShell>
  );
}
