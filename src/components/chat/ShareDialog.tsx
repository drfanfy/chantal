import { useState } from "react";
import { toast } from "sonner";
import { Globe2, Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp, type Visibility } from "@/lib/appContext";
import { errorMessage } from "@/lib/api";

/** Confirmation explicite avant partage (ou retrait du partage) d'une conversation. */
export function ShareDialog({
  conversationId,
  current,
  open,
  onOpenChange,
}: {
  conversationId: string;
  current: Visibility;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { setConversationVisibility } = useApp();
  const [busy, setBusy] = useState(false);
  const sharing = current === "private";

  async function confirm() {
    setBusy(true);
    try {
      await setConversationVisibility(conversationId, sharing ? "shared" : "private");
      toast.success(
        sharing
          ? "Conversation partagée en lecture avec les utilisateurs CHANTAL"
          : "Partage retiré : la conversation est de nouveau privée",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {sharing ? <Globe2 className="w-4 h-4 text-brand" /> : <Lock className="w-4 h-4" />}
            {sharing ? "Partager cette conversation ?" : "Rendre cette conversation privée ?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {sharing ? (
                <>
                  <p>
                    Tous les utilisateurs authentifiés de CHANTAL pourront <strong>lire</strong>{" "}
                    cette conversation, ses réponses et ses pièces jointes. Ils ne pourront pas y
                    écrire.
                  </p>
                  <p>
                    Aucun lien public n'est créé. Vous pourrez retirer le partage à tout moment.
                  </p>
                  <p className="text-amber-700">
                    Vérifiez qu'elle ne contient pas d'informations confidentielles ou personnelles.
                  </p>
                </>
              ) : (
                <p>Seul·e vous pourrez à nouveau consulter cette conversation.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            disabled={busy}
          >
            {busy ? "…" : sharing ? "Partager" : "Retirer le partage"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
