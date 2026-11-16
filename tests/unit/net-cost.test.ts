import { describe, it, expect } from "vitest";
import { assertSafeUrl, hostAllowed, isPrivateAddress } from "@/server/netGuard";
import { estimateCost } from "@/server/ai/cost";
import { isAllowedSecretName } from "@/server/env";

const publicDns = async () => ["93.184.216.34"];

describe("garde réseau (SSRF)", () => {
  it("détecte les adresses internes", () => {
    for (const ip of ["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("applique la liste blanche (avec jokers de sous-domaine)", () => {
    expect(hostAllowed("api.groq.com", ["api.groq.com"])).toBe(true);
    expect(hostAllowed("x.quartus.fr", ["*.quartus.fr"])).toBe(true);
    expect(hostAllowed("quartus.fr.evil.com", ["*.quartus.fr"])).toBe(false);
    expect(hostAllowed("evil-quartus.fr", ["*.quartus.fr"])).toBe(false);
  });

  it("refuse http, IP littérale, port exotique, identifiants, hôte non autorisé, DNS interne", async () => {
    const opts = { allowlist: ["api.example.com"], resolve: publicDns };
    await expect(assertSafeUrl("http://api.example.com", opts)).rejects.toThrow(/https/);
    await expect(assertSafeUrl("https://169.254.169.254/latest", { ...opts, allowlist: ["169.254.169.254"] })).rejects.toThrow(/IP littérale/);
    await expect(assertSafeUrl("https://api.example.com:8443", opts)).rejects.toThrow(/Port/);
    await expect(assertSafeUrl("https://u:p@api.example.com", opts)).rejects.toThrow(/Identifiants/);
    await expect(assertSafeUrl("https://autre.com", opts)).rejects.toThrow(/liste blanche/);
    await expect(assertSafeUrl("https://api.example.com", { allowlist: ["api.example.com"], resolve: async () => ["10.0.0.5"] })).rejects.toThrow(/interne/);
    await expect(assertSafeUrl("https://api.example.com/v1", opts)).resolves.toBeInstanceOf(URL);
  });

  it("n'autorise que des noms de secrets prévus", () => {
    expect(isAllowedSecretName("ANTHROPIC_API_KEY")).toBe(true);
    expect(isAllowedSecretName("CHANTAL_SECRET_AZURE")).toBe(true);
    expect(isAllowedSecretName("SUPABASE_SERVICE_ROLE_KEY")).toBe(false);
    expect(isAllowedSecretName("PATH")).toBe(false);
  });
});

describe("estimation de coût", () => {
  const pricing = { id: "p", currency: "USD", input_per_mtok: "2", output_per_mtok: "10", cached_input_per_mtok: "0.2", effective_from: "2026-01-01" };
  it("calcule avec le cache et renvoie null si une donnée manque", () => {
    expect(estimateCost(pricing, { inputTokens: 1_000_000, outputTokens: 100_000, cachedInputTokens: 500_000 })).toBeCloseTo(1 + 0.1 + 1, 6);
    expect(estimateCost(pricing, { inputTokens: 10 })).toBeNull();
    expect(estimateCost(null, { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(estimateCost(pricing, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
