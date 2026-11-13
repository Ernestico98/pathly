/**
 * Import the original spreadsheet (CSV) into Pathly.
 *
 *   pnpm seed:csv "<ruta al .csv o .numbers>" [--replace] [--llm] [--out data/seed.json]
 *
 * --replace  wipe the DB first (default: merge)
 * --llm      after importing, generate each process summary with the configured LLM
 *
 * If the API is running it imports through it (so the in-memory DB stays in sync);
 * otherwise it writes straight to the DB file.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LlmSettings } from "../src/shared/schema";
import { Db } from "../server/db";
import { importAll } from "../server/exportImport";
import { makeProvider } from "../server/llm/provider";
import { regenerateProcessSummary } from "../server/llm/tasks";
import { Repo } from "../server/repo";
import { csvToExport, decodeCsvBytes } from "./csvImport";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (f: string) => args.includes(f);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : "data/seed-from-csv.json";
if (!file) {
  console.error('Uso: pnpm seed:csv "<ruta al csv>" [--replace] [--llm]');
  process.exit(1);
}

/** A .numbers file is exported to CSV through Numbers itself (macOS only); the original is not modified. */
function toCsvPath(input: string): string {
  if (!/\.numbers$/i.test(input)) return input;
  if (process.platform !== "darwin") throw new Error("Para importar .numbers hace falta macOS con Numbers; exporta a CSV a mano.");
  const out = path.join(os.tmpdir(), `pathly-${Date.now()}.csv`);
  const esc = (p: string) => p.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFileSync("osascript", [
    "-e", `tell application "Numbers"`,
    "-e", `set d to open POSIX file "${esc(path.resolve(input))}"`,
    "-e", `export d to POSIX file "${esc(out)}" as CSV`,
    "-e", `close d saving no`,
    "-e", `end tell`,
  ]);
  console.log(`Exportado ${path.basename(input)} → CSV con Numbers`);
  return out;
}

const { data, report } = csvToExport(decodeCsvBytes(fs.readFileSync(toCsvPath(file))));
fs.mkdirSync(path.dirname(out!), { recursive: true });
fs.writeFileSync(out!, JSON.stringify(data, null, 2));
console.log(`CSV → ${data.companies.length} empresas, ${data.processes.length} procesos, ${data.entries.length} entradas (copia en ${out})`);
for (const w of report.warnings) console.warn(`  ⚠ ${w}`);

const mode = flag("--replace") ? "replace" : "merge";
const api = `http://127.0.0.1:${process.env.PORT ?? 8787}/api`;
let viaApi = false;
try {
  const res = await fetch(`${api}/import?mode=${mode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(await res.text());
  console.log("Importado vía API:", await res.json());
  viaApi = true;
} catch (e) {
  if (e instanceof Error && !/fetch failed|ECONNREFUSED|timeout|aborted/i.test(e.message + String((e as any).cause))) throw e;
}

const db = await Db.open(path.resolve(process.env.PATHLY_DB ?? "data/pathly.db"));
const repo = new Repo(db);
if (!viaApi) console.log("Importado en el fichero de la BD:", importAll(repo, data, mode));

if (flag("--llm")) {
  if (viaApi) {
    for (const p of data.processes.filter((p) => data.entries.some((e) => e.processId === p.id))) {
      const r = await fetch(`${api}/ai/process-summary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ processId: p.id }) });
      const j = (await r.json()) as { summary?: string; error?: string };
      if (j.summary) await fetch(`${api}/processes/${p.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: j.summary }) });
      console.log(`  ${j.summary ? "✓" : "✗"} ${p.id.slice(0, 8)} ${j.error ?? ""}`);
    }
  } else {
    const s = LlmSettings.parse(db.getSetting("llm") ?? {});
    const llm = makeProvider(s);
    console.log(`Generando resúmenes con ${llm.label}…`);
    for (const p of repo.listProcesses().filter((p) => p.entryCount > 0 && p.tags.includes("importado-excel"))) {
      try {
        repo.updateProcess(p.id, { summary: await regenerateProcessSummary(llm, s, repo.getProcess(p.id)) });
        console.log(`  ✓ ${p.company.name}`);
      } catch (e) {
        console.log(`  ✗ ${p.company.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
