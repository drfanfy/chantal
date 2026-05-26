import { useState, useMemo } from "react";
import { prompts, promptCategories, type PromptCategory } from "@/lib/data";
import { useApp } from "@/lib/appContext";
import { Search, BookOpen, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function PromptsView({ onSelect }: { onSelect: (text: string) => void }) {
  const { setViewMode, setActiveWorkflow } = useApp();
  const [activeCat, setActiveCat] = useState<PromptCategory | "Tous">("Tous");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const map: Record<string, number> = { Tous: prompts.length };
    promptCategories.forEach(c => { map[c] = prompts.filter(p => p.category === c).length; });
    return map;
  }, []);

  const filtered = useMemo(() => {
    return prompts.filter(p => {
      if (activeCat !== "Tous" && p.category !== activeCat) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.text.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [activeCat, search]);

  const handlePick = (p: typeof prompts[number]) => {
    const text = p.text + " " + p.vars.map(v => `[${v}]`).join(" ");
    onSelect(text);
    setActiveWorkflow(null);
    setViewMode("chat");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-surface/40 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/8 text-brand text-xs font-medium mb-3">
            <BookOpen className="w-3 h-3" /> Bibliothèque
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Prompts</h1>
          <p className="text-sm text-muted-foreground mb-5">Une collection de prompts prêts à l'emploi pour vos cas métiers.</p>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-xl max-w-xl shadow-soft">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un prompt par mot-clé…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">Effacer</button>
            )}
          </div>
        </div>
      </div>

      {/* Body: sidebar + grid */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-0">
          {/* Sidebar categories */}
          <aside className="md:border-r border-border py-6 px-4 overflow-y-auto">
            <div className="text-[0.65rem] uppercase tracking-wider font-semibold text-muted-foreground px-3 mb-2">Catégories</div>
            <CategoryButton label="Tous" count={counts["Tous"]} active={activeCat === "Tous"} onClick={() => setActiveCat("Tous")} />
            {promptCategories.map(c => (
              <CategoryButton key={c} label={c} count={counts[c] ?? 0} active={activeCat === c} onClick={() => setActiveCat(c)} />
            ))}
          </aside>

          {/* Prompt cards */}
          <div className="overflow-y-auto py-6 px-6">
            {filtered.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-16">Aucun prompt trouvé.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filtered.map((p, i) => (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    onClick={() => handlePick(p)}
                    className="text-left bg-card border border-border rounded-xl p-4 hover:shadow-elevated hover:border-brand/30 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 font-medium">{p.category}</span>
                      <div className="flex items-center gap-1">
                        {p.tag === "populaire" && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium">🔥 Populaire</span>}
                        {p.tag === "nouveau" && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">✨ Nouveau</span>}
                      </div>
                    </div>
                    <h3 className="text-sm font-medium leading-snug mb-1.5">{p.text}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {p.vars.map(v => (
                        <span key={v} className="text-[0.65rem] px-1.5 py-0.5 rounded bg-brand/8 text-brand font-medium">[{v}]</span>
                      ))}
                    </div>
                    <div className="text-xs font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                      Utiliser ce prompt <ArrowRight className="w-3 h-3" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
        active ? "bg-brand/8 text-brand font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span className={`text-[0.65rem] px-1.5 py-0.5 rounded ${active ? "bg-brand/15" : "bg-muted"}`}>{count}</span>
    </button>
  );
}
