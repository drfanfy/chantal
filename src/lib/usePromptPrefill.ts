import { useCallback } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useApp } from "./appContext";

/**
 * Pré-remplit la zone de saisie du chat avec un texte.
 * - sur une conversation qui m'appartient : pré-remplissage direct ;
 * - sinon (lecture seule, hors chat) : nouvelle conversation puis pré-remplissage
 *   après montage (requestAnimationFrame, cf. CLAUDE.md).
 */
export function usePromptPrefill() {
  const { setPendingPrefill, findConversation, activeConversationId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (text: string) => {
      const onChat = location.pathname.startsWith("/chat");
      const conv = findConversation(activeConversationId);
      if (onChat && (!conv || conv.isOwn)) {
        setPendingPrefill(text);
        return;
      }
      navigate({ to: "/chat" });
      requestAnimationFrame(() => setPendingPrefill(text));
    },
    [location.pathname, findConversation, activeConversationId, navigate, setPendingPrefill],
  );
}
