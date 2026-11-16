import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ChatInterface } from "@/components/ChatInterface";

export const Route = createFileRoute("/chat/$conversationId")({
  head: () => ({ meta: [{ title: "Conversation — Chantal" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { conversationId } = Route.useParams();
  return (
    <AppShell>
      <ConversationSidebar activeId={conversationId} />
      <main className="flex-1 min-w-0 min-h-0">
        {/* key : remonte l'interface à chaque changement de conversation */}
        <ChatInterface key={conversationId} conversationId={conversationId} />
      </main>
    </AppShell>
  );
}
