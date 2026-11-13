import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { LlmSettings } from "../../src/shared/schema";
import { ClaudeCodeProvider } from "./claudeCode";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export interface LlmProvider {
  readonly label: string;
  /** Structured output validated against a Zod schema. */
  json<S extends z.ZodType>(opts: { system: string; prompt: string; schema: S }): Promise<z.infer<S>>;
  /** Free-form Markdown. `webSearch` is honoured only where the provider supports it. */
  text(opts: { system: string; prompt: string; webSearch?: boolean }): Promise<string>;
}

// ---------------------------------------------------------------- Anthropic

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  readonly label: string;
  constructor(private s: LlmSettings) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      // The SDK can also resolve an `ant auth login` profile, so don't hard-fail here.
    }
    this.client = new Anthropic();
    this.label = `Claude (${s.anthropicModel})`;
  }

  async json<S extends z.ZodType>({ system, prompt, schema }: { system: string; prompt: string; schema: S }) {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.s.anthropicModel,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") throw new LlmError("El modelo rechazó la petición.");
      if (res.stop_reason === "max_tokens") throw new LlmError("La respuesta se cortó (max_tokens).");
      if (!res.parsed_output) throw new LlmError("El modelo no devolvió JSON válido.");
      return res.parsed_output as z.infer<S>;
    } catch (err) {
      throw wrapAnthropic(err);
    }
  }

  async text({ system, prompt, webSearch }: { system: string; prompt: string; webSearch?: boolean }) {
    try {
      const tools: Anthropic.Beta.BetaToolUnion[] =
        webSearch && this.s.anthropicWebSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : [];
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
      // Server tools may return pause_turn on long searches; continue until done.
      for (let i = 0; i < 5; i++) {
        const stream = this.client.beta.messages.stream({
          model: this.s.anthropicModel,
          max_tokens: 32000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system,
          tools,
          messages,
        });
        const res = await stream.finalMessage();
        if (res.stop_reason === "refusal") throw new LlmError("El modelo rechazó la petición.");
        if (res.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: res.content });
          continue;
        }
        // With web search the final answer comes after the search blocks; keep only the
        // text produced after the last tool result.
        const lastTool = res.content.findLastIndex((b) => b.type !== "text");
        return res.content
          .slice(lastTool + 1)
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
      }
      throw new LlmError("La búsqueda web no terminó a tiempo.");
    } catch (err) {
      throw wrapAnthropic(err);
    }
  }
}

function wrapAnthropic(err: unknown): Error {
  if (err instanceof LlmError) return err;
  if (err instanceof Anthropic.AuthenticationError)
    return new LlmError("Falta o no es válida la API key de Anthropic (ANTHROPIC_API_KEY en .env).", 401);
  if (err instanceof Anthropic.NotFoundError) return new LlmError("Modelo de Claude no encontrado: revisa Ajustes.", 400);
  if (err instanceof Anthropic.RateLimitError) return new LlmError("Rate limit de Anthropic, prueba en un momento.", 429);
  if (err instanceof Anthropic.APIConnectionError) return new LlmError("No se pudo conectar con la API de Anthropic.");
  if (err instanceof Anthropic.APIError) return new LlmError(`Error de Anthropic: ${err.message}`);
  if (err instanceof Error && /credentials|apiKey|authToken/i.test(err.message))
    return new LlmError("Falta la API key de Anthropic (ANTHROPIC_API_KEY en .env).", 401);
  return err instanceof Error ? err : new Error(String(err));
}

// ---------------------------------------------------------------- Ollama

class OllamaProvider implements LlmProvider {
  readonly label: string;
  constructor(private s: LlmSettings) {
    this.label = `Ollama (${s.ollamaModel})`;
  }

  private async chat(body: Record<string, unknown>): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.s.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.s.ollamaModel, stream: false, options: { num_ctx: 16384 }, ...body }),
        signal: AbortSignal.timeout(10 * 60_000),
      });
    } catch {
      throw new LlmError(`No se pudo conectar con Ollama en ${this.s.ollamaUrl}. ¿Está corriendo \`ollama serve\`?`);
    }
    if (!res.ok) {
      const msg = await res.text();
      throw new LlmError(
        res.status === 404 ? `Ollama no tiene el modelo "${this.s.ollamaModel}" (ollama pull ${this.s.ollamaModel}).` : `Ollama: ${msg}`,
      );
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return (data.message?.content ?? "").trim();
  }

  async json<S extends z.ZodType>({ system, prompt, schema }: { system: string; prompt: string; schema: S }) {
    const format = z.toJSONSchema(schema);
    const raw = await this.chat({
      format,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${prompt}\n\nResponde SOLO con JSON que cumpla este esquema:\n${JSON.stringify(format)}` },
      ],
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new LlmError("Ollama no devolvió JSON válido.");
    }
    const out = schema.safeParse(parsed);
    if (!out.success) throw new LlmError(`La respuesta de Ollama no cumple el esquema: ${out.error.issues[0]?.message}`);
    return out.data;
  }

  async text({ system, prompt }: { system: string; prompt: string }) {
    return this.chat({ messages: [{ role: "system", content: system }, { role: "user", content: prompt }] });
  }
}

export function makeProvider(s: LlmSettings): LlmProvider {
  if (s.provider === "claude-code") return new ClaudeCodeProvider(s);
  return s.provider === "ollama" ? new OllamaProvider(s) : new AnthropicProvider(s);
}

export async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}
