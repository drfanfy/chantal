/**
 * Garde-fou réseau pour tout appel sortant configurable par un administrateur
 * (endpoints IA « compatibles OpenAI », connexions HTTP des workflows).
 *
 * Règles :
 *  - HTTPS uniquement, port 443, pas d'identifiants dans l'URL ;
 *  - l'hôte doit figurer dans une liste blanche fixée par la DSI dans
 *    l'environnement serveur (pas modifiable depuis le back-office) ;
 *  - pas d'adresse IP littérale ;
 *  - après résolution DNS, refus des adresses privées, de bouclage,
 *    link-local (dont 169.254.169.254, métadonnées cloud), multicast… ;
 *  - les redirections ne sont pas suivies (cf. safeFetch).
 * Limite connue : une attaque par « DNS rebinding » entre la vérification et
 * la connexion reste théoriquement possible ; la liste blanche d'hôtes de
 * confiance est la protection principale.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ApiError } from "./http";

export function hostAllowed(host: string, allowlist: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return allowlist.some((entry) => {
    const e = entry.toLowerCase().trim();
    if (!e) return false;
    if (e.startsWith("*.")) return h.endsWith(e.slice(1)) && h.length > e.length - 1;
    return h === e;
  });
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

export interface GuardOptions {
  allowlist: readonly string[];
  resolve?: (host: string) => Promise<string[]>;
}

const defaultResolve = async (host: string) =>
  (await lookup(host, { all: true })).map((r) => r.address);

export async function assertSafeUrl(rawUrl: string, opts: GuardOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, "invalid_url", "URL invalide");
  }
  if (url.protocol !== "https:")
    throw new ApiError(400, "blocked_url", "Seules les URL https sont autorisées");
  if (url.username || url.password)
    throw new ApiError(400, "blocked_url", "Identifiants interdits dans l'URL");
  if (url.port && url.port !== "443")
    throw new ApiError(400, "blocked_url", "Port non autorisé (443 uniquement)");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host))
    throw new ApiError(
      400,
      "blocked_url",
      "Adresse IP littérale interdite : utilisez un nom d'hôte",
    );
  if (!hostAllowed(host, opts.allowlist)) {
    throw new ApiError(
      400,
      "host_not_allowed",
      `Hôte « ${host} » absent de la liste blanche configurée par la DSI`,
    );
  }
  let addresses: string[];
  try {
    addresses = await (opts.resolve ?? defaultResolve)(host);
  } catch {
    throw new ApiError(502, "dns_error", `Résolution DNS impossible pour « ${host} »`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ApiError(
      400,
      "blocked_url",
      `« ${host} » résout vers une adresse interne : appel refusé`,
    );
  }
  return url;
}

/** fetch sans suivi de redirection, avec délai et taille de réponse bornés. */
export async function safeFetch(
  url: URL,
  init: RequestInit & { timeoutMs: number; maxBytes: number; signal?: AbortSignal },
): Promise<{ status: number; headers: Headers; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), init.timeoutMs);
  const onAbort = () => ctrl.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal });
    if (res.status >= 300 && res.status < 400) {
      throw new ApiError(
        502,
        "redirect_blocked",
        "Redirection refusée par la politique de sécurité",
      );
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > init.maxBytes) {
          await reader.cancel();
          throw new ApiError(502, "response_too_large", "Réponse trop volumineuse");
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { status: res.status, headers: res.headers, text };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (ctrl.signal.aborted)
      throw new ApiError(504, "timeout", "Délai dépassé pour l'appel externe");
    throw new ApiError(502, "network_error", "Appel externe impossible");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}
