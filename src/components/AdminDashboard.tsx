import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Area, AreaChart,
} from "recharts";
import {
  MessageSquare, Users, Euro, Bot, Cpu, Zap, TrendingUp,
  Activity, Shield, BookOpen, FileText, AlertTriangle, CheckCircle2,
  Clock, Star,
} from "lucide-react";

const modelUsage = [
  { name: "Claude", uses: 482, cost: 214, fill: "oklch(0.45 0.18 265)" },
  { name: "OpenAI", uses: 396, cost: 238, fill: "oklch(0.55 0.18 155)" },
  { name: "Gemini", uses: 255, cost: 121, fill: "oklch(0.65 0.15 45)" },
  { name: "Notebook LLM", uses: 151, cost: 69, fill: "oklch(0.60 0.15 310)" },
];

const agentUsage = [
  { name: "Assistant rédaction", uses: 342, users: 38, satisfaction: 4.7 },
  { name: "Analyse marketing", uses: 218, users: 29, satisfaction: 4.5 },
  { name: "Analyse commerciale", uses: 195, users: 31, satisfaction: 4.6 },
  { name: "Comité Engagement", uses: 167, users: 18, satisfaction: 4.8 },
  { name: "Graphiste", uses: 124, users: 22, satisfaction: 4.3 },
  { name: "Développeur", uses: 112, users: 15, satisfaction: 4.4 },
  { name: "Organisation", uses: 88, users: 21, satisfaction: 4.2 },
];

const workflowUsage = [
  { name: "Veille SEO", launches: 89, avgTime: "2.1s", completion: "96%", cost: "124 €" },
  { name: "Prépa Comité engagement", launches: 67, avgTime: "3.4s", completion: "98%", cost: "198 €" },
  { name: "Analyse commerciale", launches: 54, avgTime: "2.8s", completion: "94%", cost: "156 €" },
  { name: "Analyse démographique", launches: 41, avgTime: "2.3s", completion: "97%", cost: "89 €" },
  { name: "Projections financières", launches: 38, avgTime: "4.1s", completion: "92%", cost: "112 €" },
];

const adoptionData = [
  { month: "Nov", interactions: 420, cost: 285 },
  { month: "Déc", interactions: 580, cost: 340 },
  { month: "Jan", interactions: 745, cost: 392 },
  { month: "Fév", interactions: 890, cost: 445 },
  { month: "Mar", interactions: 1080, cost: 520 },
  { month: "Avr", interactions: 1284, cost: 642 },
];

const activityFeed = [
  { user: "François", action: "a utilisé", target: "Assistant rédaction", time: "il y a 3 min" },
  { user: "Justine", action: "a lancé", target: "Analyse marketing", time: "il y a 12 min" },
  { user: "Barbara", action: "a utilisé", target: "Comité Engagement", time: "il y a 25 min" },
  { user: "Antoine", action: "a lancé", target: "Veille SEO", time: "il y a 38 min" },
  { user: "Claire", action: "a utilisé", target: "Graphiste", time: "il y a 1h" },
  { user: "Thomas", action: "a lancé", target: "Projections financières", time: "il y a 1h30" },
  { user: "Marie", action: "a utilisé", target: "Assistant rédaction", time: "il y a 2h" },
  { user: "Lucas", action: "a lancé", target: "Analyse commerciale", time: "il y a 2h15" },
];

type TimeRange = "7d" | "30d" | "6m";

export function AdminDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gouvernance IA</h1>
            <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble de l'utilisation et des coûts</p>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(["7d", "30d", "6m"] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeRange === r ? "bg-surface text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "7d" ? "7 jours" : r === "30d" ? "30 jours" : "6 mois"}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <KpiCard icon={<MessageSquare className="w-5 h-5" />} label="Interactions" value="1 284" change="+18.9%" />
          <KpiCard icon={<Users className="w-5 h-5" />} label="Utilisateurs actifs" value="47" change="+6" />
          <KpiCard icon={<Euro className="w-5 h-5" />} label="Coût estimé" value="642 €" change="+23.4%" />
          <KpiCard icon={<Bot className="w-5 h-5" />} label="Agent le + utilisé" value="Rédaction" sub="342 utilisations" />
          <KpiCard icon={<Cpu className="w-5 h-5" />} label="Modèle le + utilisé" value="Claude" sub="482 utilisations" />
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Usage by Model */}
          <div className="col-span-2 bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">Utilisation par modèle</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelUsage} barSize={32}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                    formatter={(value: unknown, name: unknown) => [String(name) === "uses" ? `${value} utilisations` : `${value} €`, String(name) === "uses" ? "Utilisations" : "Coût"]}
                  />
                  <Bar dataKey="uses" radius={[6, 6, 0, 0]} fill="oklch(0.45 0.18 265 / 0.7)" />
                  <Bar dataKey="cost" radius={[6, 6, 0, 0]} fill="oklch(0.45 0.18 265 / 0.25)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-3">
              {modelUsage.map(m => (
                <div key={m.name} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.name}</span>: {m.uses} util. / {m.cost} €
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand" /> Activité récente
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {activityFeed.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 text-xs"
                >
                  <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[0.625rem] font-semibold shrink-0">
                    {item.user[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{item.user}</span>{" "}
                    <span className="text-muted-foreground">{item.action}</span>{" "}
                    <span className="font-medium text-foreground">{item.target}</span>
                    <div className="text-[0.625rem] text-muted-foreground mt-0.5">{item.time}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Agent Usage */}
        <div className="bg-surface border border-border rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold mb-4">Utilisation par agent</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Agent</th>
                <th className="text-right py-2 px-3 font-medium">Utilisations</th>
                <th className="text-right py-2 px-3 font-medium">Utilisateurs</th>
                <th className="text-right py-2 px-3 font-medium">Satisfaction</th>
                <th className="text-left py-2 px-3 font-medium w-40">Répartition</th>
              </tr>
            </thead>
            <tbody>
              {agentUsage.map((a, i) => (
                <tr key={a.name} className="border-t border-border/50">
                  <td className="py-2.5 px-3 font-medium">{a.name}</td>
                  <td className="py-2.5 px-3 text-right">{a.uses}</td>
                  <td className="py-2.5 px-3 text-right">{a.users}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Star className="w-3 h-3 text-warning fill-warning" /> {a.satisfaction}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-brand/60 transition-all"
                        style={{ width: `${(a.uses / agentUsage[0].uses) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Workflow Usage */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand" /> Workflows
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">Workflow</th>
                  <th className="text-right py-2 font-medium">Lancements</th>
                  <th className="text-right py-2 font-medium">Temps moy.</th>
                  <th className="text-right py-2 font-medium">Complétion</th>
                  <th className="text-right py-2 font-medium">Coût</th>
                </tr>
              </thead>
              <tbody>
                {workflowUsage.map(w => (
                  <tr key={w.name} className="border-t border-border/50">
                    <td className="py-2 font-medium text-xs">{w.name}</td>
                    <td className="py-2 text-right text-xs">{w.launches}</td>
                    <td className="py-2 text-right text-xs">{w.avgTime}</td>
                    <td className="py-2 text-right text-xs text-success">{w.completion}</td>
                    <td className="py-2 text-right text-xs">{w.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Adoption Over Time */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand" /> Adoption (6 mois)
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={adoptionData}>
                  <defs>
                    <linearGradient id="colorInteractions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.45 0.18 265)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="oklch(0.45 0.18 265)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }} />
                  <Area type="monotone" dataKey="interactions" stroke="oklch(0.45 0.18 265)" fill="url(#colorInteractions)" strokeWidth={2} />
                  <Line type="monotone" dataKey="cost" stroke="oklch(0.55 0.15 155)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand" /> Interactions</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" /> Coût (€)</span>
            </div>
          </div>
        </div>

        {/* Governance Block */}
        <div className="bg-surface border border-border rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand" /> Gouvernance
          </h3>
          <div className="grid grid-cols-5 gap-4">
            <GovernanceItem icon={<BookOpen className="w-4 h-4" />} label="Prompts disponibles" value="15" />
            <GovernanceItem icon={<CheckCircle2 className="w-4 h-4" />} label="Formations complétées" value="89" />
            <GovernanceItem icon={<FileText className="w-4 h-4" />} label="Documents traités" value="234" />
            <GovernanceItem icon={<AlertTriangle className="w-4 h-4" />} label="Alertes détectées" value="3" warn />
            <GovernanceItem icon={<Euro className="w-4 h-4" />} label="Statut budget" value="Sous contrôle" success />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, change, sub }: { icon: React.ReactNode; label: string; value: string; change?: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface border border-border rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">{icon}</div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
      {change && <span className="text-xs text-success font-medium">{change}</span>}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </motion.div>
  );
}

function GovernanceItem({ icon, label, value, warn, success }: { icon: React.ReactNode; label: string; value: string; warn?: boolean; success?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        warn ? "bg-destructive/10 text-destructive" : success ? "bg-success/10 text-success" : "bg-brand/10 text-brand"
      }`}>
        {icon}
      </div>
      <div>
        <div className={`text-sm font-bold ${warn ? "text-destructive" : success ? "text-success" : ""}`}>{value}</div>
        <div className="text-[0.625rem] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
