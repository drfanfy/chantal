import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, BookOpen, ArrowRight, Heart } from "lucide-react";
import { usePublishedPrompts, type PublishedPrompt } from "@/lib/prompts";
import { usePromptPrefill } from "@/lib/usePromptPrefill";
import { useFavorites } from "@/lib/favorites";
import { PromptUseDialog } from "@/components/prompts/PromptUseDialog";

export function PromptsView() {
  const { prompts, loading, error } = usePublishedPrompts();
  const prefill = usePromptPrefill();
  const { isFavorite, toggle } = useFavorites();
  const [activeCat, setActiveCat] = useState<string>("Tous");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [selected, setSelected] = useState<PublishedPrompt | null>(null);

  const categories = useMemo(
    () =>
      [...new Set(prompts.map((p) => p.category ?? "Sans catégorie"))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [prompts],
  );
  const tags = useMemo(() => [...new Set(prompts.flatMap((p) => p.tags))].sort(), [prompts]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prompts.filter((p) => {
      if (activeCat !== "Tous" && (p.category ?? "Sans catégorie") !== activeCat) return false;
      if (activeTag && !p.tags.includes(activeTag)) return false;
      if (onlyFav && !isFavorite("prompt", p.id)) return false;
      if (
        q &&
        ![p.title, p.description, p.content, ...p.tags].some((s) => s.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [prompts, activeCat, activeTag, search, onlyFav, isFavorite]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-surface/40 px-4 sm:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/8 text-brand text-xs font-medium mb-3">
            <BookOpen className="w-3 h-3" /> Bibliothèque
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Prompts</h1>
          <p className="text-sm text-muted-foreground mb-5">
            Des prompts validés pour vos cas métiers. Complétez les variables puis envoyez-les dans
            le chat.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-xl w-full max-w-xl shadow-soft">
              <Search className="w-4 h-4 text-muted-foreground" />
              <label htmlFor="prompt-search" className="sr-only">
                Rechercher
              </label>
              <input
                id="prompt-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par mot-clé…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Effacer
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyFav}
                onChange={(e) => setOnlyFav(e.target.checked)}
              />{" "}
              Mes favoris
            </label>
          </div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                  aria-pressed={activeTag === t}
                  className={`rounded-full border px-2.5 py-0.5 text-[0.7rem] ${activeTag === t ? "border-brand/40 bg-brand/10 text-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full grid grid-cols-1 md:grid-cols-[14rem_1fr]">
          <aside
            className="hidden md:block md:border-r border-border py-6 px-4 overflow-y-auto"
            aria-label="Catégories"
          >
            <div className="text-[0.65rem] uppercase tracking-wider font-semibold text-muted-foreground px-3 mb-2">
              Catégories
            </div>
            {["Tous", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(c)}
                aria-pressed={activeCat === c}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${activeCat === c ? "bg-brand/8 text-brand font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <span className="truncate">{c}</span>
                <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-muted">
                  {c === "Tous"
                    ? prompts.length
                    : prompts.filter((p) => (p.category ?? "Sans catégorie") === c).length}
                </span>
              </button>
            ))}
          </aside>
          <div className="overflow-y-auto py-6 px-4 sm:px-6">
            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-36 rounded-xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center text-sm text-destructive py-16">{error}</div>
            ) : prompts.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-16">
                Aucun prompt publié pour le moment.
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-16">
                Aucun prompt ne correspond à vos filtres.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filtered.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
                    className="relative text-left bg-card border border-border rounded-xl p-4 hover:shadow-elevated hover:border-brand/30 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.category && (
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 font-medium">
                            {p.category}
                          </span>
                        )}
                        {p.isDemo && (
                          <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 font-medium">
                            Exemple
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={
                          isFavorite("prompt", p.id) ? "Retirer des favoris" : "Ajouter aux favoris"
                        }
                        onClick={() => void toggle("prompt", p.id)}
                        className="p-1 rounded hover:bg-muted"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${isFavorite("prompt", p.id) ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`}
                        />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="text-left w-full"
                    >
                      <h3 className="text-sm font-medium leading-snug mb-1.5">{p.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        {p.variables.map((v) => (
                          <span
                            key={v.name}
                            className="text-[0.65rem] px-1.5 py-0.5 rounded bg-brand/8 text-brand font-medium"
                          >
                            [{v.label}]
                          </span>
                        ))}
                      </div>
                      <span className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                        Utiliser ce prompt <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <PromptUseDialog
        prompt={selected}
        onClose={() => setSelected(null)}
        onUse={(text) => {
          setSelected(null);
          prefill(text);
        }}
      />
    </div>
  );
}
