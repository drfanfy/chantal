import { useAIConfig } from "@/lib/useAIConfig";
import { useApp } from "@/lib/appContext";
import { Heart, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

export function PartnersView() {
  const { partners, loading } = useAIConfig();
  const { setCurrentPartner, setCurrentModel, setCurrentAgent, setActiveConversation, isFavorite, toggleFavorite } = useApp();
  const navigate = useNavigate();

  const handleSelect = (partnerId: string, modelName?: string, agentName?: string) => {
    if (modelName) setCurrentModel(modelName);
    if (agentName) setCurrentAgent(agentName);
    setCurrentPartner(partnerId);
    setActiveConversation(null);
    navigate({ to: "/chat" });
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-background to-violet-500/[0.02]">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 text-violet-600 text-xs font-medium mb-3">
            <Sparkles className="w-3 h-3" /> Équipe IA
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Nos partenaires</h1>
          <p className="text-muted-foreground">Choisissez un partenaire IA spécialisé pour vous accompagner.</p>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3].map(i => <div key={i} className="h-56 rounded-2xl bg-muted/40 animate-pulse" />)}
          </div>
        )}

        {!loading && partners.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun partenaire configuré.</p>
            <p className="text-xs mt-1">Créez-en depuis le Back-Office Admin.</p>
          </div>
        )}

        {!loading && partners.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {partners.map((p, i) => {
              const fav = isFavorite({ kind: "partner", id: p.id });
              return (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  onClick={() => handleSelect(p.id, p.model?.name, p.agent?.name)}
                  className="group text-left relative bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all overflow-hidden"
                >
                  {/* Favori */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite({ kind: "partner", id: p.id }); }}
                    className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-card/80 backdrop-blur hover:bg-muted transition-colors"
                  >
                    <Heart className={`w-4 h-4 ${fav ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
                  </button>

                  {/* Avatar + nom */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-border shrink-0 shadow-soft bg-muted/40 flex items-center justify-center">
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                        : <span className="text-2xl font-bold text-violet-600">{p.name.charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <div className="min-w-0 pr-8">
                      <h3 className="text-base font-semibold truncate mb-0.5">{p.name}</h3>
                      {/* Badges modèle + agent */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {p.model && (
                          <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium">{p.model.name}</span>
                        )}
                        {p.agent && (
                          <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 font-medium">{p.agent.name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {p.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{p.description}</p>
                  )}

                  {/* Personnalité */}
                  {p.personality && (
                    <div className="text-[0.7rem] text-muted-foreground mb-3">
                      <span className="text-muted-foreground/70">Style :</span>{" "}
                      <span className="text-foreground/80 font-medium">{p.personality}</span>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-auto flex items-center justify-between rounded-xl bg-brand/5 group-hover:bg-brand/10 transition-colors px-3 py-2 text-[0.78rem] font-medium text-brand">
                    <span>Travailler avec {p.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
