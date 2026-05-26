import { partners } from "@/lib/data";
import { partnerImages } from "@/lib/partnerImages";
import { useApp } from "@/lib/appContext";
import { Heart, MessageSquare, Star, TrendingUp, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

export function PartnersView() {
  const { setCurrentPartner, setCurrentModel, setCurrentAgent, setActiveConversation, isFavorite, toggleFavorite } = useApp();
  const navigate = useNavigate();

  const handleSelect = (id: string, model: string, agent: string) => {
    setCurrentModel(model);
    setCurrentAgent(agent);
    setCurrentPartner(id);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {partners.map((p, i) => {
            const fav = isFavorite({ kind: "partner", id: p.id });
            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                onClick={() => handleSelect(p.id, p.model, p.agent)}
                className="group text-left relative bg-card border border-border rounded-2xl p-5 hover:shadow-elevated hover:border-brand/30 transition-all overflow-hidden"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite({ kind: "partner", id: p.id }); }}
                  className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-card/80 backdrop-blur hover:bg-muted transition-colors"
                  aria-label="Favori"
                >
                  <Heart className={`w-4 h-4 ${fav ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
                </button>

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-border shrink-0 shadow-soft">
                    <img src={partnerImages[p.id]} alt={p.name} className="w-full h-full object-cover" loading="lazy" width={64} height={64} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold truncate mb-0.5">{p.name}</h3>
                    <p className="text-xs font-medium text-brand truncate">{p.expertise}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {p.tag === "populaire" && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium">🔥 Populaire</span>}
                      {p.tag === "nouveau" && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">✨ Nouveau</span>}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{p.description}</p>

                {p.personality && (
                  <div className="text-[0.7rem] text-muted-foreground mb-2">
                    <span className="text-muted-foreground/70">Style :</span>{" "}
                    <span className="text-foreground/80 font-medium">{p.personality}</span>
                  </div>
                )}
                {p.useCases && p.useCases.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {p.useCases.slice(0, 3).map(u => (
                      <span key={u} className="text-[0.6rem] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{u}</span>
                    ))}
                  </div>
                )}


                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-3 border-t border-border">
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{p.conversations}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{p.satisfaction}</span>
                  <span className="flex items-center gap-1 text-emerald-600 ml-auto"><TrendingUp className="w-3 h-3" />+{p.trend}%</span>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-brand/5 group-hover:bg-brand/10 transition-colors px-3 py-2 text-[0.78rem] font-medium text-brand">
                  <span>Travailler avec {p.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
