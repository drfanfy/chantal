/** Chargement des messages et pièces jointes d'une conversation (RLS appliquée). */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  url: string | null;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "error" | "cancelled" | "streaming";
  createdAt: Date;
  speakerName: string | null;
  speakerAvatarUrl: string | null;
  speakerIcon: string | null;
  attachments: ChatAttachment[];
}

interface DbMessage {
  id: string;
  role: string;
  content: string;
  status: string | null;
  created_at: string;
  speaker_name: string | null;
  speaker_avatar_url: string | null;
  speaker_icon: string | null;
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setNotFound(false);
      return;
    }
    setLoading(true);
    const [{ data: conv }, { data: msgs }, { data: files }] = await Promise.all([
      supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle(),
      supabase
        .from("messages")
        .select(
          "id, role, content, status, created_at, speaker_name, speaker_avatar_url, speaker_icon",
        )
        .eq("conversation_id", conversationId)
        .order("created_at"),
      supabase
        .from("message_attachments")
        .select("id, message_id, file_name, mime_type, storage_path")
        .eq("conversation_id", conversationId),
    ]);
    setNotFound(!conv);
    const byMessage = new Map<string, ChatAttachment[]>();
    const rows = (files ?? []) as {
      id: string;
      message_id: string | null;
      file_name: string;
      mime_type: string;
      storage_path: string;
    }[];
    if (rows.length) {
      const { data: signed } = await supabase.storage.from("chat-files").createSignedUrls(
        rows.map((r) => r.storage_path),
        3600,
      );
      rows.forEach((r, i) => {
        if (!r.message_id) return;
        const list = byMessage.get(r.message_id) ?? [];
        list.push({
          id: r.id,
          fileName: r.file_name,
          mimeType: r.mime_type,
          url: signed?.[i]?.signedUrl ?? null,
        });
        byMessage.set(r.message_id, list);
      });
    }
    setMessages(
      ((msgs ?? []) as DbMessage[])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          status: (m.status ?? "complete") as ChatMessageView["status"],
          createdAt: new Date(m.created_at),
          speakerName: m.speaker_name,
          speakerAvatarUrl: m.speaker_avatar_url,
          speakerIcon: m.speaker_icon,
          attachments: byMessage.get(m.id) ?? [],
        })),
    );
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { messages, setMessages, loading, notFound, reload: load };
}
