import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { SOURCE_LABEL, STATUS_LABEL, WORK_MODE_LABEL } from "../../shared/labels";
import { SOURCES, WORK_MODES, type ProcessStatus } from "../../shared/schema";
import { api } from "../api";
import { ErrorBox, Field, MarkdownEditor, Spinner, todayIso } from "../components/ui";

const INITIAL_STATUSES: ProcessStatus[] = ["wishlist", "applied", "ongoing"];

export default function NewProcess() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const companies = useQuery({ queryKey: ["companies"], queryFn: api.companies });

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [companySummary, setCompanySummary] = useState("");
  const [companyNotes, setCompanyNotes] = useState("");
  const [briefWarning, setBriefWarning] = useState<string>();

  const [role, setRole] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [jobSummary, setJobSummary] = useState("");

  const [status, setStatus] = useState<ProcessStatus>("applied");
  const [appliedAt, setAppliedAt] = useState(todayIso());
  const [source, setSource] = useState<(typeof SOURCES)[number]>("unknown");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<(typeof WORK_MODES)[number]>("unknown");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState("EUR");

  const existing = companies.data?.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());

  const brief = useMutation({
    mutationFn: () => api.companyBrief({ name: name.trim(), website, notes: companyNotes }),
    onSuccess: (r) => {
      setCompanySummary(r.summary);
      setBriefWarning(r.warning);
    },
  });

  const job = useMutation({
    mutationFn: () => api.jobBrief({ url: jobUrl, text: jobText, company: name }),
    onSuccess: (r) => {
      setJobSummary(r.summary);
      setJobText(r.jobText);
      if (!role && r.role) setRole(r.role);
      if (!location && r.location) setLocation(r.location);
      if (workMode === "unknown" && r.workMode !== "unknown") setWorkMode(r.workMode);
      if (!salaryMin && r.salaryMin) setSalaryMin(String(r.salaryMin));
      if (!salaryMax && r.salaryMax) setSalaryMax(String(r.salaryMax));
      if (r.currency) setCurrency(r.currency);
    },
    onError: () => setShowPaste(true),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (existing && (companySummary || companyNotes || website)) {
        await api.updateCompany(existing.id, {
          ...(companySummary ? { summary: companySummary } : {}),
          ...(companyNotes ? { notes: [existing.notes, companyNotes].filter(Boolean).join("\n\n") } : {}),
          ...(website ? { website } : {}),
        });
      }
      return api.createProcess({
        ...(existing ? { companyId: existing.id } : { company: { name: name.trim(), website, summary: companySummary, notes: companyNotes } }),
        role,
        jobUrl,
        jobDescription: jobText,
        jobSummary,
        status,
        appliedAt: status === "wishlist" ? null : appliedAt,
        source,
        location,
        workMode,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        currency,
      });
    },
    onSuccess: (p) => {
      qc.invalidateQueries();
      nav(`/procesos/${p.id}`);
    },
  });

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save.mutate();
      }}
    >
      <h1 className="text-xl font-semibold tracking-tight">Nuevo proceso</h1>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">Empresa</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *" hint={existing ? "Ya existe: se reutiliza su ficha y se añade un proceso nuevo." : undefined}>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} list="companies" autoFocus />
            <datalist id="companies">
              {companies.data?.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </Field>
          <Field label="Web">
            <input className="input" type="url" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </Field>
        </div>
        <Field label="Lo que ya sabes (opcional)" hint="Se usa como contexto para la ficha.">
          <textarea className="input" rows={2} value={companyNotes} onChange={(e) => setCompanyNotes(e.target.value)} placeholder="p. ej. me contactó un recruiter, serie A, 30 personas…" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={!name.trim() || brief.isPending} onClick={() => brief.mutate()}>
            ✦ {companySummary ? "Regenerar" : "Generar"} ficha de la empresa
          </button>
          {brief.isPending && <Spinner label="Investigando la empresa…" />}
          {existing?.summary && !companySummary && <span className="text-xs text-text-3">Esta empresa ya tiene ficha.</span>}
        </div>
        <ErrorBox error={brief.error} />
        {briefWarning && <p className="text-xs text-warn">{briefWarning}</p>}
        {(companySummary || brief.isSuccess) && (
          <MarkdownEditor label="Ficha de la empresa" value={companySummary} onChange={setCompanySummary} rows={12} />
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">Puesto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Puesto">
            <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="p. ej. Senior AI Engineer" />
          </Field>
          <Field label="Link a la oferta">
            <input className="input" type="url" value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        {showPaste ? (
          <Field label="Descripción del puesto" hint="Si la web de la oferta requiere login (LinkedIn…), pega aquí el texto.">
            <textarea className="input" rows={6} value={jobText} onChange={(e) => setJobText(e.target.value)} />
          </Field>
        ) : (
          <button type="button" className="text-sm text-accent hover:underline" onClick={() => setShowPaste(true)}>
            Pegar la descripción en lugar de usar el link
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={(!jobUrl && !jobText.trim()) || job.isPending} onClick={() => job.mutate()}>
            ✦ Resumir puesto
          </button>
          {job.isPending && <Spinner label="Leyendo la oferta…" />}
        </div>
        <ErrorBox error={job.error} />
        {(jobSummary || job.isSuccess) && <MarkdownEditor label="Resumen del puesto" value={jobSummary} onChange={setJobSummary} rows={10} />}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">Detalles</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado inicial">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProcessStatus)}>
              {INITIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          {status !== "wishlist" && (
            <Field label="Fecha de aplicación">
              <input className="input" type="date" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
            </Field>
          )}
          <Field label="Fuente">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ubicación">
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Modalidad">
            <select className="input" value={workMode} onChange={(e) => setWorkMode(e.target.value as typeof workMode)}>
              {WORK_MODES.map((s) => (
                <option key={s} value={s}>
                  {WORK_MODE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-[1fr_1fr_5rem] gap-2 sm:col-span-3">
            <Field label="Salario mín.">
              <input className="input" inputMode="numeric" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value.replace(/\D/g, ""))} placeholder="60000" />
            </Field>
            <Field label="Salario máx.">
              <input className="input" inputMode="numeric" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value.replace(/\D/g, ""))} placeholder="75000" />
            </Field>
            <Field label="Moneda">
              <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} />
            </Field>
          </div>
        </div>
      </section>

      <ErrorBox error={save.error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => nav(-1)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || save.isPending}>
          {save.isPending ? "Guardando…" : "Crear proceso"}
        </button>
      </div>
    </form>
  );
}
