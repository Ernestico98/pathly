import { LlmError } from "./provider";

const MAX_CHARS = 60_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fetch a public page and return its readable text. Many job boards need JS/login; callers fall back to pasted text. */
export async function fetchPageText(url: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new LlmError("URL no válida", 400);
  }
  if (!/^https?:$/.test(u.protocol)) throw new LlmError("Solo se admiten URLs http(s)", 400);
  let res: Response;
  try {
    res = await fetch(u, {
      headers: { "user-agent": "Mozilla/5.0 (Pathly local app)", accept: "text/html,application/xhtml+xml,text/plain" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LlmError(`No se pudo descargar ${u.host}. Pega el texto manualmente.`, 422);
  }
  if (!res.ok) throw new LlmError(`${u.host} respondió ${res.status}. Pega el texto manualmente.`, 422);
  const body = await res.text();
  const type = res.headers.get("content-type") ?? "";
  const text = type.includes("html") ? htmlToText(body) : body;
  if (text.length < 200) throw new LlmError(`No se pudo leer contenido útil de ${u.host} (¿requiere login o JavaScript?). Pega el texto manualmente.`, 422);
  return text.slice(0, MAX_CHARS);
}
