import { defineConfig } from "vitest/config";
import path from "node:path";

// Configuration de test indépendante de vite.config.ts (le wrapper Lovable
// charge des plugins inutiles en test).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
  },
});
