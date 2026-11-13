import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  CompanyInput,
  Entry,
  EntryWithUpdates,
  LlmSettings,
  ProcessInput,
  ProcessPatch,
  StatusChangeInput,
} from "../src/shared/schema";
import { computeAnalytics } from "./analytics";
import { exportAll, exportEntriesCsv, exportProcessesCsv, importAll } from "./exportImport";
import { fetchPageText } from "./llm/fetchPage";
import { claudeCodeVersion } from "./llm/claudeCode";
import { LlmError, listOllamaModels, makeProvider } from "./llm/provider";
import { companyBrief, draftEntry, jobBrief, regenerateProcessSummary } from "./llm/tasks";
import { NotFound, type Repo } from "./repo";

async function body<S extends z.ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON" });
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new HTTPException(400, { message: `${i?.path.join(".") || "body"}: ${i?.message}` });
  }
  return r.data;
}

export function createApp(repo: Repo) {
  const app = new Hono().basePath("/api");

  const settings = () => LlmSettings.parse(repo.db.getSetting("llm") ?? {});
  const llm = () => makeProvider(settings());

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof NotFound) return c.json({ error: `Not found: ${err.message}` }, 404);
    if (err instanceof LlmError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  });

  // ---------- companies ----------
  app.get("/companies", (c) => c.json(repo.listCompanies()));
  app.patch("/companies/:id", async (c) => c.json(repo.updateCompany(c.req.param("id"), await body(c, CompanyInput.partial()))));

  // ---------- processes ----------
  app.get("/processes", (c) => c.json(repo.listProcesses()));
  app.post("/processes", async (c) => c.json(repo.createProcess(await body(c, ProcessInput)), 201));
  app.get("/processes/:id", (c) => c.json(repo.getProcess(c.req.param("id"))));
  app.patch("/processes/:id", async (c) => c.json(repo.updateProcess(c.req.param("id"), await body(c, ProcessPatch))));
  app.delete("/processes/:id", (c) => {
    repo.deleteProcess(c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/processes/:id/status", async (c) => {
    repo.changeStatus(c.req.param("id"), await body(c, StatusChangeInput));
    return c.json(repo.getProcess(c.req.param("id")));
  });
  app.post("/processes/:id/entries", async (c) => c.json(repo.addEntry(c.req.param("id"), await body(c, EntryWithUpdates)), 201));

  // ---------- entries ----------
  app.patch("/entries/:id", async (c) => {
    const patch = await body(c, Entry.omit({ id: true, processId: true, createdAt: true, updatedAt: true }).partial());
    return c.json(repo.updateEntry(c.req.param("id"), patch));
  });
  app.delete("/entries/:id", (c) => {
    repo.deleteEntry(c.req.param("id"));
    return c.body(null, 204);
  });

  // ---------- AI ----------
  app.post("/ai/entry-draft", async (c) => {
    const { processId, rawNotes, date } = await body(c, z.object({ processId: z.string(), rawNotes: z.string().min(3), date: z.string().nullable().default(null) }));
    return c.json(await draftEntry(llm(), settings(), repo.getProcess(processId), rawNotes, date));
  });
  app.post("/ai/process-summary", async (c) => {
    const { processId } = await body(c, z.object({ processId: z.string() }));
    return c.json({ summary: await regenerateProcessSummary(llm(), settings(), repo.getProcess(processId)) });
  });
  app.post("/ai/company-brief", async (c) => {
    const input = await body(c, z.object({ name: z.string().min(1), website: z.string().default(""), notes: z.string().default("") }));
    let pageText: string | undefined;
    let warning: string | undefined;
    if (input.website) {
      try {
        pageText = await fetchPageText(input.website);
      } catch (e) {
        warning = e instanceof Error ? e.message : String(e);
      }
    }
    return c.json({ summary: await companyBrief(llm(), settings(), { ...input, pageText }), warning });
  });
  app.post("/ai/job-brief", async (c) => {
    const input = await body(c, z.object({ url: z.string().default(""), text: z.string().default(""), company: z.string().default("") }));
    let jobText = input.text.trim();
    if (!jobText && input.url) jobText = await fetchPageText(input.url);
    if (!jobText) throw new HTTPException(400, { message: "Provide a URL or paste the job description" });
    return c.json({ ...(await jobBrief(llm(), settings(), { company: input.company, jobText })), jobText });
  });

  // ---------- settings ----------
  const settingsResponse = async (s: LlmSettings) => {
    const [ollamaModels, claudeCode] = await Promise.all([listOllamaModels(s.ollamaUrl), claudeCodeVersion(s.claudeCodePath)]);
    return {
      settings: s,
      anthropicKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      ollamaModels,
      claudeCodeVersion: claudeCode,
    };
  };
  app.get("/settings", async (c) => c.json(await settingsResponse(settings())));
  app.put("/settings", async (c) => {
    const s = await body(c, LlmSettings);
    repo.db.setSetting("llm", s);
    return c.json(await settingsResponse(s));
  });
  app.post("/settings/test", async (c) => {
    const p = llm();
    const started = Date.now();
    const out = await p.json({
      system: "Responde en JSON.",
      prompt: 'Devuelve {"ok": true}',
      schema: z.object({ ok: z.boolean() }),
    });
    return c.json({ provider: p.label, ok: out.ok, ms: Date.now() - started });
  });

  // ---------- analytics / export / import ----------
  app.get("/analytics", (c) => c.json(computeAnalytics(repo)));
  app.get("/export.json", (c) => {
    c.header("content-disposition", `attachment; filename="pathly-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(exportAll(repo));
  });
  app.get("/export/processes.csv", (c) => {
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="pathly-processes.csv"`);
    return c.body("﻿" + exportProcessesCsv(repo));
  });
  app.get("/export/entries.csv", (c) => {
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="pathly-entries.csv"`);
    return c.body("﻿" + exportEntriesCsv(repo));
  });
  app.post("/import", async (c) => {
    const mode = c.req.query("mode") === "replace" ? "replace" : "merge";
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON" });
    }
    try {
      return c.json(importAll(repo, raw, mode));
    } catch (e) {
      if (e instanceof z.ZodError) throw new HTTPException(400, { message: `Invalid file: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` });
      if (e instanceof Error && !(e instanceof HTTPException)) throw new HTTPException(400, { message: e.message });
      throw e;
    }
  });

  return app;
}
