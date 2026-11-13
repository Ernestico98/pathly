import { spawn } from "node:child_process";
import os from "node:os";
import { z } from "zod";
import type { LlmSettings } from "../../src/shared/schema";
import { LlmError, type LlmProvider } from "./provider";

/**
 * Runs prompts through the local Claude Code CLI in headless mode (`claude -p`),
 * so requests use the user's Claude Code login (Pro/Max plan) instead of an API key.
 *
 * - No tools by default; WebSearch/WebFetch only for company briefs.
 * - No session persistence, no MCP servers, no settings/hooks, no slash commands.
 * - Runs in the OS temp dir so no project CLAUDE.md is picked up.
 * - ANTHROPIC_API_KEY / AUTH_TOKEN are removed from the child env so the CLI uses the
 *   subscription login rather than silently billing an API key.
 */

const TIMEOUT_MS = 5 * 60_000;

type CliResult = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  api_error_status?: number | null;
};

function run(bin: string, args: string[], input: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn(bin, args, { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new LlmError("Claude Code tardó demasiado (más de 5 min)."));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new LlmError(
          e.code === "ENOENT"
            ? `No se encontró el ejecutable de Claude Code ("${bin}"). Indica la ruta completa en Ajustes (p. ej. la salida de \`which claude\`).`
            : `No se pudo ejecutar Claude Code: ${e.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "";
      try {
        resolve(JSON.parse(line) as CliResult);
      } catch {
        const msg = (err || out).trim().split("\n").slice(-3).join(" ").slice(0, 400);
        reject(new LlmError(/log ?in|auth|credential/i.test(msg) ? `Claude Code no tiene sesión iniciada: ejecuta \`claude\` y haz login. (${msg})` : `Claude Code terminó con código ${code}: ${msg || "sin salida"}`));
      }
    });
    child.stdin.end(input);
  });
}

function check(r: CliResult): CliResult {
  if (r.is_error || r.subtype !== "success") {
    const msg = (r.result ?? r.subtype ?? "error desconocido").slice(0, 400);
    if (r.api_error_status === 429 || /usage limit|rate limit/i.test(msg)) throw new LlmError(`Has alcanzado el límite de uso de tu plan: ${msg}`, 429);
    if (/log ?in|auth|credential/i.test(msg)) throw new LlmError(`Claude Code no tiene sesión iniciada: ejecuta \`claude\` y haz login. (${msg})`, 401);
    throw new LlmError(`Claude Code: ${msg}`);
  }
  return r;
}

export class ClaudeCodeProvider implements LlmProvider {
  readonly label: string;
  constructor(private s: LlmSettings) {
    this.label = `Claude Code (${s.claudeCodeModel})`;
  }

  private baseArgs(system: string, tools: string) {
    return [
      "-p",
      "--output-format",
      "json",
      "--model",
      this.s.claudeCodeModel,
      "--system-prompt",
      system,
      "--tools",
      tools,
      "--no-session-persistence",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--setting-sources",
      "",
    ];
  }

  async json<S extends z.ZodType>({ system, prompt, schema }: { system: string; prompt: string; schema: S }) {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    const r = check(await run(this.s.claudeCodePath, [...this.baseArgs(system, ""), "--json-schema", JSON.stringify(jsonSchema)], prompt));
    let value = r.structured_output;
    if (value === undefined && r.result) {
      try {
        value = JSON.parse(r.result.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        throw new LlmError("Claude Code no devolvió JSON válido.");
      }
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new LlmError(`La respuesta de Claude Code no cumple el esquema: ${parsed.error.issues[0]?.message}`);
    return parsed.data;
  }

  async text({ system, prompt, webSearch }: { system: string; prompt: string; webSearch?: boolean }) {
    const tools = webSearch && this.s.anthropicWebSearch ? "WebSearch,WebFetch" : "";
    const args = this.baseArgs(system, tools);
    if (tools) args.push("--allowedTools", "WebSearch", "WebFetch");
    const r = check(await run(this.s.claudeCodePath, args, prompt));
    return (r.result ?? "").trim();
  }
}

/** `claude --version`, or null when the CLI is not reachable. */
export function claudeCodeVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 5000);
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
  });
}
