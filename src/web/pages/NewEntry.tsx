import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ENTRY_KIND_LABEL, INTERVIEW_TYPE_LABEL, STAGE_LABEL, STATUS_LABEL } from "../../shared/labels";
import { ENTRY_KINDS, INTERVIEW_TYPES, PROCESS_STATUSES, STAGES, type EntryWithUpdates, type ProcessStatus, type Stage } from "../../shared/schema";
import { api, type EntryDraft } from "../api";
import { ErrorBox, Field, ListInput, MarkdownEditor, Spinner, StatusBadge, todayIso } from "../components/ui";

const PLACEHOLDER = `Escribe como te salga, sin preocuparte por el formato. Por ejemplo:
- ¿Con quién hablaste? (nombre / rol)
- ¿Qué tipo de entrevista fue y qué te preguntaron?
- ¿Cómo crees que te fue?
- ¿Qué se decidió? (salario, fechas, ubicación…)
- ¿Cuáles son los siguientes pasos?`;

const draftKey = (id: string) => `pathly:entry-draft:${id}`;
const load = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const store = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
};

export default function NewEntry() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const proc = useQuery({ queryKey: ["process", id], queryFn: () => api.process(id) });

  const [date, setDate] = useState(todayIso());
  const [raw, setRaw] = useState(() => load(draftKey(id)));
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [applyStatus, setApplyStatus] = useState(true);
  const [applySummary, setApplySummary] = useState(true);

  useEffect(() => store(draftKey(id), raw), [id, raw]);

  const ai = useMutation({
    mutationFn: () => api.entryDraft(id, raw, date),
    onSuccess: (d) => {
      setDraft(d);
      setApplyStatus(Boolean(d.suggestedStatus && d.suggestedStatus !== proc.data?.status));
      setApplySummary(Boolean(d.processSummary));
    },
  });

  const save = useMutation({
    mutationFn: (payload: EntryWithUpdates) => api.addEntry(id, payload),
    onSuccess: () => {
      store(draftKey(id), "");
      qc.invalidateQueries();
      nav(`/procesos/${id}`);
    },
  });

  if (proc.isPending) return <Spinner label="Cargando…" />;
  if (proc.error) return <ErrorBox error={proc.error} />;
  const p = proc.data;

  const saveWithoutAi = () =>
    save.mutate({ entry: { date, kind: "interview", rawNotes: raw, summary: raw, title: "", dateIsApprox: false } });

  const saveDraft = () => {
    if (!draft) return;
    const statusChange =
      applyStatus && draft.suggestedStatus && draft.suggestedStatus !== p.status ? { to: draft.suggestedStatus, reason: draft.statusReason, at: date, entryId: null } : undefined;
    save.mutate({
      entry: {
        date,
        dateIsApprox: false,
        kind: draft.kind,
        interviewType: draft.interviewType,
        title: draft.title,
        interviewers: draft.interviewers,
        rawNotes: raw,
        summary: draft.summary,
        topics: draft.topics,
        decisions: draft.decisions,
        nextSteps: draft.nextSteps,
        selfAssessment: draft.selfAssessment,
      },
      processSummary: applySummary ? draft.processSummary : undefined,
      stage: draft.suggestedStage ?? undefined,
      status: statusChange,
    });
  };

  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link to={`/procesos/${id}`} className="text-sm text-text-2 hover:text-text">
          ← {p.company.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Nueva entrada</h1>
        <p className="text-sm text-text-2">
          Cuenta lo que pasó; la IA lo ordena y tú revisas antes de guardar. Tus notas originales se guardan siempre.
        </p>
      </div>

      <section className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field label="Fecha">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="¿Qué pasó?">
          <textarea className="input min-h-56" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={PLACEHOLDER} autoFocus />
        </Field>
        <ErrorBox error={ai.error} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {ai.isPending && <Spinner label="Resumiendo…" />}
          <button className="btn" disabled={raw.trim().length < 3 || save.isPending} onClick={saveWithoutAi}>
            Guardar sin IA
          </button>
          <button className="btn btn-primary" disabled={raw.trim().length < 3 || ai.isPending} onClick={() => ai.mutate()}>
            ✦ {draft ? "Volver a procesar" : "Procesar con IA"}
          </button>
        </div>
      </section>

      {draft && (
        <section className="card space-y-4 p-5" aria-label="Revisión de la propuesta">
          <h2 className="text-sm font-semibold">Revisa la propuesta</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Título">
              <input className="input" value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Tipo">
              <select className="input" value={draft.kind} onChange={(e) => set("kind", e.target.value as EntryDraft["kind"])}>
                {ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ENTRY_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de entrevista">
              <select className="input" value={draft.interviewType ?? ""} onChange={(e) => set("interviewType", (e.target.value || null) as EntryDraft["interviewType"])}>
                <option value="">—</option>
                {INTERVIEW_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {INTERVIEW_TYPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <MarkdownEditor label="Resumen" value={draft.summary} onChange={(v) => set("summary", v)} rows={6} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Temas / preguntas">
              <ListInput value={draft.topics} onChange={(v) => set("topics", v)} rows={4} />
            </Field>
            <Field label="Decisiones">
              <ListInput value={draft.decisions} onChange={(v) => set("decisions", v)} rows={4} />
            </Field>
            <Field label="Siguientes pasos">
              <ListInput value={draft.nextSteps} onChange={(v) => set("nextSteps", v)} rows={4} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Entrevistadores">
              <ListInput value={draft.interviewers} onChange={(v) => set("interviewers", v)} rows={2} />
            </Field>
            <Field label="¿Cómo fue? (1–5)">
              <select className="input" value={draft.selfAssessment ?? ""} onChange={(e) => set("selfAssessment", e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fase tras esta entrada">
              <select className="input" value={draft.suggestedStage ?? ""} onChange={(e) => set("suggestedStage", (e.target.value || null) as Stage | null)}>
                <option value="">Sin cambio ({STAGE_LABEL[p.stage]})</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={applyStatus} onChange={(e) => setApplyStatus(e.target.checked)} />
              Cambiar estado del proceso
            </label>
            {applyStatus && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={p.status} /> →
                <select className="input w-auto" value={draft.suggestedStatus ?? p.status} onChange={(e) => set("suggestedStatus", e.target.value as ProcessStatus)}>
                  {PROCESS_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <input className="input w-full" placeholder="Motivo" value={draft.statusReason} onChange={(e) => set("statusReason", e.target.value)} />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={applySummary} onChange={(e) => setApplySummary(e.target.checked)} />
              Actualizar el resumen del proceso
            </label>
            {applySummary && (
              <div className="mt-2">
                <MarkdownEditor label="Nuevo resumen del proceso" value={draft.processSummary} onChange={(v) => set("processSummary", v)} rows={6} />
              </div>
            )}
          </div>

          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setDraft(null)}>
              Descartar propuesta
            </button>
            <button className="btn btn-primary" onClick={saveDraft} disabled={save.isPending}>
              {save.isPending ? "Guardando…" : "Guardar entrada"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
