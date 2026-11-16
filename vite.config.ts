// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { nitro } from "nitro/vite";

// En développement, les variables SERVEUR du fichier .env (sans préfixe VITE_,
// ex. SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY) sont copiées dans
// process.env pour les routes /api. Elles ne sont jamais injectées dans le
// bundle navigateur (seules les VITE_* le sont). En production (Vercel), elles
// viennent des variables d'environnement du projet.
for (const [key, value] of Object.entries(loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", process.cwd(), ""))) {
  if (!key.startsWith("VITE_") && process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
        vercel: {
          // Durée max d'une fonction (streaming chat, workflows synchrones)
          functions: { maxDuration: 300 },
        },
      }),
    ],
  },
});
