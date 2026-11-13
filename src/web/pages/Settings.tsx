import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { LlmSettings } from "../../shared/schema";
import { api } from "../api";
import { ErrorBox, Field, Spinner } from "../components/ui";

const PROVIDERS = [
  { id: "claude-code", label: "Claude Code (your plan)", hint: "Uses your Claude Code login, no API key. With web search." },
  { id: "anthropic", label: "Anthropic API", hint: "Requires ANTHROPIC_API_KEY; pay per use." },
  { id: "ollama", label: "Ollama (local)", hint: "Private and free; slower, no web search." },
] as const;

const CLAUDE_CODE_MODELS = [
  { id: "sonnet", label: "Sonnet (balanced)" },
  { id: "haiku", label: "Haiku (fast, uses less quota)" },
  { id: "opus", label: "Opus (highest quality, more quota)" },
];

const CLAUDE_MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (balanced)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fast and cheap)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (highest quality)" },
];

export default function Settings() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <LlmSection />
      <DataSection />
    </div>
  );
}

function LlmSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [s, setS] = useState<LlmSettings | null>(null);
  useEffect(() => {
    if (q.data && !s) setS(q.data.settings);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (v: LlmSettings) => api.saveSettings(v),
    onSuccess: (r) => qc.setQueryData(["settings"], r),
  });
  const test = useMutation({ mutationFn: async () => (s ? (await api.saveSettings(s), api.testLlm()) : Promise.reject()) });

  if (q.isPending || !s) return <Spinner label="Loading settings…" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const set = <K extends keyof LlmSettings>(k: K, v: LlmSettings[K]) => setS({ ...s, [k]: v });

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">AI model</h2>
        <p className="text-xs text-text-3">Used to summarise entries, create company briefs and summarise roles.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Provider">
        {PROVIDERS.map((pv) => (
          <button
            key={pv.id}
            role="radio"
            aria-checked={s.provider === pv.id}
            onClick={() => set("provider", pv.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${s.provider === pv.id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
          >
            <div className="font-medium">{pv.label}</div>
            <div className="text-xs text-text-2">{pv.hint}</div>
          </button>
        ))}
      </div>

      {s.provider === "claude-code" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model">
            <select className="input" value={s.claudeCodeModel} onChange={(e) => set("claudeCodeModel", e.target.value)}>
              {CLAUDE_CODE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {!CLAUDE_CODE_MODELS.some((m) => m.id === s.claudeCodeModel) && <option value={s.claudeCodeModel}>{s.claudeCodeModel}</option>}
            </select>
          </Field>
          <Field label="Claude Code executable" hint="Usually “claude” is enough. If it isn't found, enter the path from `which claude`.">
            <input className="input font-mono text-[13px]" value={s.claudeCodePath} onChange={(e) => set("claudeCodePath", e.target.value)} />
          </Field>
          <div className={`rounded-lg border px-3 py-2 text-sm sm:col-span-2 ${q.data.claudeCodeVersion ? "border-good/30 bg-good-soft text-good" : "border-warn/30 bg-warn-soft text-warn"}`}>
            {q.data.claudeCodeVersion
              ? `✓ ${q.data.claudeCodeVersion} detected. Uses your Claude Code session (Pro/Max plan), no API key; counts toward your plan usage limits.`
              : "⚠ Claude Code not found at that path. Save to check again."}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={s.anthropicWebSearch} onChange={(e) => set("anthropicWebSearch", e.target.checked)} />
            Use web search when generating company briefs
          </label>
        </div>
      )}

      {s.provider === "anthropic" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model">
            <select className="input" value={s.anthropicModel} onChange={(e) => set("anthropicModel", e.target.value)}>
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {!CLAUDE_MODELS.some((m) => m.id === s.anthropicModel) && <option value={s.anthropicModel}>{s.anthropicModel}</option>}
            </select>
          </Field>
          <Field label="API key">
            <div className={`rounded-lg border px-3 py-2 text-sm ${q.data.anthropicKeyPresent ? "border-good/30 bg-good-soft text-good" : "border-warn/30 bg-warn-soft text-warn"}`}>
              {q.data.anthropicKeyPresent ? "✓ ANTHROPIC_API_KEY detected" : "⚠ No ANTHROPIC_API_KEY in .env"}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={s.anthropicWebSearch} onChange={(e) => set("anthropicWebSearch", e.target.checked)} />
            Use web search when generating company briefs
          </label>
        </div>
      ) : s.provider === "ollama" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ollama URL">
            <input className="input" value={s.ollamaUrl} onChange={(e) => set("ollamaUrl", e.target.value)} />
          </Field>
          <Field
            label="Model"
            hint={q.data.ollamaModels.length ? `${q.data.ollamaModels.length} ${q.data.ollamaModels.length === 1 ? "model" : "models"} installed` : "Ollama not found or has no models (ollama serve / ollama pull gemma4)"}
          >
            <input className="input" list="ollama-models" value={s.ollamaModel} onChange={(e) => set("ollamaModel", e.target.value)} />
            <datalist id="ollama-models">
              {q.data.ollamaModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>
      ) : null}

      <Field label="Language of generated text">
        <select className="input max-w-64" value={s.language} onChange={(e) => set("language", e.target.value as LlmSettings["language"])}>
          <option value="es">Spanish</option>
          <option value="en">English</option>
          <option value="auto">Same as my notes</option>
        </select>
      </Field>

      <ErrorBox error={save.error ?? test.error} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {test.isPending && <Spinner label="Testing…" />}
        {test.data && <span className="text-sm text-good">✓ {test.data.provider} responds ({(test.data.ms / 1000).toFixed(1)} s)</span>}
        {save.isSuccess && !test.data && <span className="text-sm text-good">Saved ✓</span>}
        <button className="btn" onClick={() => test.mutate()} disabled={test.isPending}>
          Test connection
        </button>
        <button className="btn btn-primary" onClick={() => save.mutate(s)} disabled={save.isPending}>
          Save
        </button>
      </div>
    </section>
  );
}

function DataSection() {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [picked, setPicked] = useState<File | null>(null);
  const imp = useMutation({
    mutationFn: async (f: File) => {
      let data: unknown;
      try {
        data = JSON.parse(await f.text());
      } catch {
        throw new Error("The file is not valid JSON");
      }
      if (mode === "replace" && !window.confirm("This will delete all current data and replace it with the contents of the file. Continue?")) {
        throw new Error("Import cancelled");
      }
      return api.importJson(data, mode);
    },
    onSuccess: () => qc.invalidateQueries(),
    onSettled: () => {
      if (file.current) file.current.value = "";
      setPicked(null);
    },
  });

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">Export and import</h2>
        <p className="text-xs text-text-3">
          JSON is the complete, versioned format (use it for backups and moving data). CSVs are flat views for Excel.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-primary" href="/api/export.json" download>
          Export JSON
        </a>
        <a className="btn" href="/api/export/processes.csv" download>
          Processes CSV
        </a>
        <a className="btn" href="/api/export/entries.csv" download>
          Entries CSV
        </a>
      </div>
      <div className="border-t border-border pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-text-2">When importing:</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge (most recent wins)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace everything
          </label>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="block text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-text"
          onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          aria-label="JSON file to import"
        />
        {picked && (
          <button className={`btn mt-3 ${mode === "replace" ? "btn-danger" : "btn-primary"}`} onClick={() => imp.mutate(picked)} disabled={imp.isPending}>
            {mode === "replace" ? "Replace everything with" : "Import"} {picked.name}
          </button>
        )}
        <div className="mt-2">
          {imp.isPending && <Spinner label="Importing…" />}
          {imp.data && (
            <p className="text-sm text-good">
              ✓ {imp.data.inserted} new, {imp.data.updated} updated, {imp.data.skipped} unchanged
            </p>
          )}
          <ErrorBox error={imp.error} />
        </div>
      </div>
    </section>
  );
}
