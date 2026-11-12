import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { LlmSettings } from "../../shared/schema";
import { api } from "../api";
import { ErrorBox, Field, Spinner } from "../components/ui";

const CLAUDE_MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (equilibrado)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (rápido y barato)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (máxima calidad)" },
];

export default function Settings() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>
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

  if (q.isPending || !s) return <Spinner label="Cargando ajustes…" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const set = <K extends keyof LlmSettings>(k: K, v: LlmSettings[K]) => setS({ ...s, [k]: v });

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">Modelo de IA</h2>
        <p className="text-xs text-text-3">Se usa para resumir entradas, crear fichas de empresa y resumir puestos.</p>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="Proveedor">
        {(["anthropic", "ollama"] as const).map((pv) => (
          <button
            key={pv}
            role="radio"
            aria-checked={s.provider === pv}
            onClick={() => set("provider", pv)}
            className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm ${s.provider === pv ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
          >
            <div className="font-medium">{pv === "anthropic" ? "Claude (API de Anthropic)" : "Ollama (local)"}</div>
            <div className="text-xs text-text-2">{pv === "anthropic" ? "Mejor calidad, búsqueda web para fichas" : "Privado, sin coste, sin búsqueda web"}</div>
          </button>
        ))}
      </div>

      {s.provider === "anthropic" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modelo">
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
              {q.data.anthropicKeyPresent ? "✓ ANTHROPIC_API_KEY detectada" : "⚠ No hay ANTHROPIC_API_KEY en .env"}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={s.anthropicWebSearch} onChange={(e) => set("anthropicWebSearch", e.target.checked)} />
            Usar búsqueda web al generar fichas de empresa
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="URL de Ollama">
            <input className="input" value={s.ollamaUrl} onChange={(e) => set("ollamaUrl", e.target.value)} />
          </Field>
          <Field
            label="Modelo"
            hint={q.data.ollamaModels.length ? `${q.data.ollamaModels.length} modelos instalados` : "No se encontró Ollama o no tiene modelos (ollama serve / ollama pull gemma4)"}
          >
            <input className="input" list="ollama-models" value={s.ollamaModel} onChange={(e) => set("ollamaModel", e.target.value)} />
            <datalist id="ollama-models">
              {q.data.ollamaModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>
      )}

      <Field label="Idioma de los textos generados">
        <select className="input max-w-64" value={s.language} onChange={(e) => set("language", e.target.value as LlmSettings["language"])}>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="auto">El mismo que mis notas</option>
        </select>
      </Field>

      <ErrorBox error={save.error ?? test.error} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {test.isPending && <Spinner label="Probando…" />}
        {test.data && <span className="text-sm text-good">✓ {test.data.provider} responde ({(test.data.ms / 1000).toFixed(1)} s)</span>}
        {save.isSuccess && !test.data && <span className="text-sm text-good">Guardado ✓</span>}
        <button className="btn" onClick={() => test.mutate()} disabled={test.isPending}>
          Probar conexión
        </button>
        <button className="btn btn-primary" onClick={() => save.mutate(s)} disabled={save.isPending}>
          Guardar
        </button>
      </div>
    </section>
  );
}

function DataSection() {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const imp = useMutation({
    mutationFn: async (f: File) => {
      let data: unknown;
      try {
        data = JSON.parse(await f.text());
      } catch {
        throw new Error("El fichero no es JSON válido");
      }
      if (mode === "replace" && !window.confirm("Esto borrará todos los datos actuales y los sustituirá por los del fichero. ¿Continuar?")) {
        throw new Error("Importación cancelada");
      }
      return api.importJson(data, mode);
    },
    onSuccess: () => qc.invalidateQueries(),
    onSettled: () => {
      if (file.current) file.current.value = "";
    },
  });

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">Exportar e importar</h2>
        <p className="text-xs text-text-3">
          El JSON es el formato completo y versionado (sirve de copia de seguridad y para mover datos). Los CSV son vistas planas para Excel.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-primary" href="/api/export.json" download>
          Exportar JSON
        </a>
        <a className="btn" href="/api/export/processes.csv" download>
          CSV de procesos
        </a>
        <a className="btn" href="/api/export/entries.csv" download>
          CSV de entradas
        </a>
      </div>
      <div className="border-t border-border pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-text-2">Al importar:</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Fusionar (gana lo más reciente)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Reemplazar todo
          </label>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="block text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-text"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) imp.mutate(f);
          }}
          aria-label="Importar fichero JSON"
        />
        <div className="mt-2">
          {imp.isPending && <Spinner label="Importando…" />}
          {imp.data && (
            <p className="text-sm text-good">
              ✓ {imp.data.inserted} nuevos, {imp.data.updated} actualizados, {imp.data.skipped} sin cambios
            </p>
          )}
          <ErrorBox error={imp.error} />
        </div>
      </div>
    </section>
  );
}
