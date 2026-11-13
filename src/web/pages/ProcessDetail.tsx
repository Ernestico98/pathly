import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ENTRY_KIND_LABEL,
  INTERVIEW_TYPE_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  STATUS_HELP,
  STATUS_LABEL,
  WORK_MODE_LABEL,
} from "../../shared/labels";
import {
  ENTRY_KINDS,
  INTERVIEW_TYPES,
  PROCESS_STATUSES,
  SOURCES,
  STAGES,
  WORK_MODES,
  type Entry,
  type ProcessDetail as PD,
  type ProcessStatus,
  type StatusChange,
} from "../../shared/schema";
import { api } from "../api";
import { Empty, ErrorBox, Field, ListInput, MarkdownEditor, Md, Spinner, StatusBadge, fmtDate, normalizeUrl, relDays, todayIso } from "../components/ui";

type Tab = "timeline" | "prep" | "details";

export default function ProcessDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["process", id], queryFn: () => api.process(id) });
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "timeline";

  if (q.isPending) return <Spinner label="Loading…" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data;

  const TABS: { key: Tab; label: string }[] = [
    { key: "timeline", label: `Timeline (${p.entries.length})` },
    { key: "prep", label: "Prep" },
    { key: "details", label: "Details" },
  ];

  return (
    <div className="space-y-5">
      <Link to="/processes" className="text-sm text-text-2 hover:text-text">
        ← Processes
      </Link>
      <Header p={p} />
      <div className="flex gap-1 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === "timeline" ? {} : { tab: t.key }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-accent font-medium text-text" : "border-transparent text-text-2 hover:text-text"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "timeline" && <Timeline p={p} />}
      {tab === "prep" && <Prep p={p} />}
      {tab === "details" && <Data p={p} />}
    </div>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

// ---------------------------------------------------------------- header

function Header({ p }: { p: PD }) {
  const invalidate = useInvalidate();
  const [changing, setChanging] = useState(false);
  const [to, setTo] = useState<ProcessStatus>(p.status);
  const [reason, setReason] = useState("");
  const [at, setAt] = useState(todayIso());
  const change = useMutation({
    mutationFn: () => api.changeStatus(p.id, { to, reason, at }),
    onSuccess: () => {
      setChanging(false);
      setReason("");
      invalidate();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{p.company.name}</h1>
            <StatusBadge status={p.status} />
            {change.isSuccess && !changing && (
              <span className="text-xs text-good" role="status">
                Status updated ✓
              </span>
            )}
          </div>
          <p className="text-text-2">{p.role || "No role specified"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button className="btn" onClick={() => setChanging((v) => !v)} aria-expanded={changing}>
            Change status
          </button>
          <Link to={`/processes/${p.id}/entry`} className="btn btn-primary">
            + New entry
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-2">
        <span>Stage: {STAGE_LABEL[p.stage]}</span>
        {p.location && <span>📍 {p.location}</span>}
        {p.workMode !== "unknown" && <span>{WORK_MODE_LABEL[p.workMode]}</span>}
        {(p.salaryMin || p.salaryMax) && (
          <span>
            💰 {[p.salaryMin, p.salaryMax].filter(Boolean).map((n) => `${Math.round(n! / 1000)}k`).join("–")} {p.currency}
          </span>
        )}
        {p.appliedAt && <span>Applied: {fmtDate(p.appliedAt)}</span>}
        <span>Last activity: {relDays(p.lastEntryDate)}</span>
        {p.jobUrl && (
          <a href={p.jobUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Job posting ↗
          </a>
        )}
        {p.company.website && (
          <a href={p.company.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Website ↗
          </a>
        )}
      </div>
      {changing && (
        <form
          className="card grid gap-3 p-4 sm:grid-cols-[12rem_10rem_1fr_auto] sm:items-end"
          aria-describedby="status-help"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          <Field label="New status">
            <select className="input" value={to} onChange={(e) => setTo(e.target.value as ProcessStatus)}>
              {PROCESS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="Reason (optional)">
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button className="btn btn-primary" disabled={to === p.status || change.isPending}>
            Save
          </button>
          {/* Help lives on its own row so it doesn't push the first field out of line. */}
          <p id="status-help" className="-mt-1 text-xs text-text-3 sm:col-span-4">
            {STATUS_LABEL[to]}: {STATUS_HELP[to]}
          </p>
          <div className="sm:col-span-4">
            <ErrorBox error={change.error} />
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- timeline

type Item = { type: "entry"; date: string | null; e: Entry } | { type: "status"; date: string; s: StatusChange };

function Timeline({ p }: { p: PD }) {
  const items: Item[] = [
    ...p.entries.map((e) => ({ type: "entry" as const, date: e.date, e })),
    ...p.statusChanges.filter((s) => s.from !== null).map((s) => ({ type: "status" as const, date: s.at, s })),
  ];
  // Newest first; undated at the end. Status changes go after the entry of the same day.
  items.sort((a, b) => {
    if (a.date === b.date) return a.type === b.type ? 0 : a.type === "status" ? -1 : 1;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="order-2 lg:order-1">
        {items.length === 0 ? (
          <Empty>
            No entries yet.{" "}
            <Link to={`/processes/${p.id}/entry`} className="text-accent hover:underline">
              Add the first one
            </Link>
          </Empty>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {items.map((it) =>
              it.type === "entry" ? (
                <EntryCard key={it.e.id} e={it.e} />
              ) : (
                <li key={it.s.id} className="relative text-xs text-text-2">
                  <span className="absolute top-1 -left-[25px] h-2 w-2 rounded-full border border-surface bg-text-3" aria-hidden />
                  {fmtDate(it.s.at)} · Status: {it.s.from && STATUS_LABEL[it.s.from]} → <strong className="font-medium text-text">{STATUS_LABEL[it.s.to]}</strong>
                  {it.s.reason && <span className="text-text-3"> — {it.s.reason}</span>}
                </li>
              ),
            )}
          </ol>
        )}
      </div>
      <aside className="order-1 lg:order-2">
        <ProcessSummary p={p} />
      </aside>
    </div>
  );
}

function ProcessSummary({ p }: { p: PD }) {
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.summary);
  const save = useMutation({
    mutationFn: (summary: string) => api.updateProcess(p.id, { summary }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });
  const regen = useMutation({
    mutationFn: () => api.processSummary(p.id),
    onSuccess: (r) => {
      setText(r.summary);
      setEditing(true);
    },
  });
  return (
    <div className="card p-4 lg:sticky lg:top-20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Process status</h2>
        <div className="flex gap-1">
          <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => regen.mutate()} disabled={regen.isPending || p.entries.length === 0} title="Regenerate with AI">
            ✦ {regen.isPending ? "…" : "AI"}
          </button>
          {!editing && (
            <button
              className="btn btn-ghost px-2 py-1 text-xs"
              onClick={() => {
                setText(p.summary);
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>
      <ErrorBox error={regen.error} />
      {editing ? (
        <div className="space-y-2">
          <MarkdownEditor label="Summary" value={text} onChange={setText} rows={10} />
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => save.mutate(text)} disabled={save.isPending}>
              Save
            </button>
          </div>
        </div>
      ) : p.summary ? (
        <Md>{p.summary}</Md>
      ) : (
        <p className="text-sm text-text-3">No summary yet. It is generated when you add an entry with AI, or click ✦ AI.</p>
      )}
    </div>
  );
}

function EntryCard({ e }: { e: Entry }) {
  const invalidate = useInvalidate();
  const [showRaw, setShowRaw] = useState(false);
  const [editing, setEditing] = useState(false);
  const del = useMutation({ mutationFn: () => api.deleteEntry(e.id), onSuccess: invalidate });

  return (
    <li className="relative">
      <span className="absolute top-4 -left-[26.5px] h-3 w-3 rounded-full border-2 border-surface bg-accent" aria-hidden />
      <article className="card p-4">
        {editing ? (
          <EntryEditor e={e} onDone={() => setEditing(false)} />
        ) : (
          <>
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-medium">{e.title || ENTRY_KIND_LABEL[e.kind]}</h3>
              <span className="text-xs tabular-nums text-text-3" title={e.dateIsApprox ? "Approximate date" : undefined}>
                {fmtDate(e.date, e.dateIsApprox)}
              </span>
            </header>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-text-2">{ENTRY_KIND_LABEL[e.kind]}</span>
              {e.interviewType && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{INTERVIEW_TYPE_LABEL[e.interviewType]}</span>}
              {e.interviewers.map((i) => (
                <span key={i} className="rounded bg-surface-2 px-1.5 py-0.5 text-text-2">
                  👤 {i}
                </span>
              ))}
              {e.selfAssessment && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-text-2" title="How you think it went">
                  {"★".repeat(e.selfAssessment)}
                  <span className="opacity-30">{"★".repeat(5 - e.selfAssessment)}</span>
                </span>
              )}
            </div>
            {e.summary && <Md className="mt-3">{e.summary}</Md>}
            <Lists e={e} />
            <footer className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-xs">
              {e.rawNotes && e.rawNotes.trim() !== e.summary.trim() && (
                <button className="text-text-2 hover:text-text" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>
                  {showRaw ? "Hide" : "View"} original notes
                </button>
              )}
              <span className="flex-1" />
              <button className="text-text-2 hover:text-text" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                className="text-danger hover:underline"
                onClick={() => {
                  if (window.confirm("Delete this entry?")) del.mutate();
                }}
              >
                Delete
              </button>
            </footer>
            {showRaw && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-xs text-text-2">{e.rawNotes}</pre>}
          </>
        )}
      </article>
    </li>
  );
}

function Lists({ e }: { e: Pick<Entry, "topics" | "decisions" | "nextSteps"> }) {
  const blocks = [
    { title: "Topics", items: e.topics },
    { title: "Decisions", items: e.decisions },
    { title: "Next steps", items: e.nextSteps },
  ].filter((b) => b.items.length);
  if (!blocks.length) return null;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {blocks.map((b) => (
        <div key={b.title}>
          <div className="text-xs font-medium text-text-2">{b.title}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
            {b.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function EntryEditor({ e, onDone }: { e: Entry; onDone: () => void }) {
  const invalidate = useInvalidate();
  const [d, setD] = useState(e);
  const save = useMutation({
    mutationFn: () => api.updateEntry(e.id, { ...d, id: undefined, processId: undefined, createdAt: undefined, updatedAt: undefined } as Partial<Entry>),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });
  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="space-y-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Title">
          <input className="input" value={d.title} onChange={(ev) => set("title", ev.target.value)} />
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={d.date ?? ""} onChange={(ev) => setD((x) => ({ ...x, date: ev.target.value || null, dateIsApprox: false }))} />
        </Field>
        <Field label="Type">
          <select className="input" value={d.kind} onChange={(ev) => set("kind", ev.target.value as Entry["kind"])}>
            {ENTRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {ENTRY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Interview type">
          <select className="input" value={d.interviewType ?? ""} onChange={(ev) => set("interviewType", (ev.target.value || null) as Entry["interviewType"])}>
            <option value="">—</option>
            {INTERVIEW_TYPES.map((k) => (
              <option key={k} value={k}>
                {INTERVIEW_TYPE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <MarkdownEditor label="Summary" value={d.summary} onChange={(v) => set("summary", v)} rows={6} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Topics (one per line)">
          <ListInput value={d.topics} onChange={(v) => set("topics", v)} />
        </Field>
        <Field label="Decisions">
          <ListInput value={d.decisions} onChange={(v) => set("decisions", v)} />
        </Field>
        <Field label="Next steps">
          <ListInput value={d.nextSteps} onChange={(v) => set("nextSteps", v)} />
        </Field>
      </div>
      <Field label="Interviewers (one per line)">
        <ListInput value={d.interviewers} onChange={(v) => set("interviewers", v)} rows={2} />
      </Field>
      <ErrorBox error={save.error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={save.isPending}>
          Save
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- prep

function Prep({ p }: { p: PD }) {
  const invalidate = useInvalidate();
  const [companySummary, setCompanySummary] = useState(p.company.summary);
  const [companyNotes, setCompanyNotes] = useState(p.company.notes);
  const [jobSummary, setJobSummary] = useState(p.jobSummary);
  const dirty = companySummary !== p.company.summary || companyNotes !== p.company.notes || jobSummary !== p.jobSummary;

  const brief = useMutation({
    mutationFn: () => api.companyBrief({ name: p.company.name, website: p.company.website, notes: p.company.notes }),
    onSuccess: (r) => setCompanySummary(r.summary),
  });
  const job = useMutation({
    mutationFn: () => api.jobBrief({ url: p.jobUrl, text: p.jobDescription, company: p.company.name }),
    onSuccess: (r) => setJobSummary(r.summary),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (companySummary !== p.company.summary || companyNotes !== p.company.notes)
        await api.updateCompany(p.company.id, { summary: companySummary, notes: companyNotes });
      if (jobSummary !== p.jobSummary) await api.updateProcess(p.id, { jobSummary });
    },
    onSuccess: invalidate,
  });

  const nextSteps = [...p.entries].reverse().find((e) => e.nextSteps.length)?.nextSteps ?? [];
  const people = [...new Set(p.entries.flatMap((e) => e.interviewers))];

  return (
    <div className="space-y-5">
      {(nextSteps.length > 0 || people.length > 0 || p.compensationNotes) && (
        <div className="grid gap-4 sm:grid-cols-3">
          {nextSteps.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-medium text-text-2">Next steps</div>
              <ul className="mt-1 list-disc pl-4 text-sm">
                {nextSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {people.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-medium text-text-2">People you have talked to</div>
              <p className="mt-1 text-sm">{people.join(", ")}</p>
            </div>
          )}
          {p.compensationNotes && (
            <div className="card p-4">
              <div className="text-xs font-medium text-text-2">Compensation</div>
              <p className="mt-1 whitespace-pre-line text-sm">{p.compensationNotes}</p>
            </div>
          )}
        </div>
      )}

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">About {p.company.name}</h2>
          <div className="flex items-center gap-2">
            {brief.isPending && <Spinner label="Researching…" />}
            <button className="btn" onClick={() => brief.mutate()} disabled={brief.isPending}>
              ✦ {companySummary ? "Regenerate brief" : "Generate brief"}
            </button>
          </div>
        </div>
        <ErrorBox error={brief.error} />
        <MarkdownEditor label="Brief (AI, editable)" value={companySummary} onChange={setCompanySummary} rows={12} placeholder="No brief yet. Click “Generate brief”." />
        <MarkdownEditor label="My notes" value={companyNotes} onChange={setCompanyNotes} rows={8} placeholder="Your notes about the company" />
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">The role</h2>
          <div className="flex items-center gap-2">
            {job.isPending && <Spinner label="Reading the job posting…" />}
            <button
              className="btn"
              onClick={() => job.mutate()}
              disabled={job.isPending || (!p.jobUrl && !p.jobDescription)}
              title={!p.jobUrl && !p.jobDescription ? "Add the link or description in the Details tab" : undefined}
            >
              ✦ {jobSummary ? "Regenerate summary" : "Summarise role"}
            </button>
          </div>
        </div>
        <ErrorBox error={job.error} />
        <MarkdownEditor
          label="Role summary"
          value={jobSummary}
          onChange={setJobSummary}
          rows={10}
          placeholder={p.jobUrl || p.jobDescription ? "Click “Summarise role”." : "Add the job posting link or description in the Details tab."}
        />
      </section>

      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="card flex items-center gap-3 px-4 py-2 shadow-lg">
            <span className="text-sm text-text-2">Unsaved changes</span>
            <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </button>
          </div>
        </div>
      )}
      <ErrorBox error={save.error} />
    </div>
  );
}

// ---------------------------------------------------------------- data

function Data({ p }: { p: PD }) {
  const invalidate = useInvalidate();
  const nav = useNavigate();
  const [d, setD] = useState({
    role: p.role,
    location: p.location,
    workMode: p.workMode,
    source: p.source,
    stage: p.stage,
    jobUrl: p.jobUrl,
    jobDescription: p.jobDescription,
    salaryMin: p.salaryMin?.toString() ?? "",
    salaryMax: p.salaryMax?.toString() ?? "",
    currency: p.currency,
    compensationNotes: p.compensationNotes,
    appliedAt: p.appliedAt ?? "",
    notes: p.notes,
    tags: p.tags.join(", "),
    website: p.company.website,
  });
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      if (d.website !== p.company.website) await api.updateCompany(p.company.id, { website: d.website });
      return api.updateProcess(p.id, {
        role: d.role,
        location: d.location,
        workMode: d.workMode,
        source: d.source,
        stage: d.stage,
        jobUrl: d.jobUrl,
        jobDescription: d.jobDescription,
        salaryMin: d.salaryMin ? Number(d.salaryMin) : null,
        salaryMax: d.salaryMax ? Number(d.salaryMax) : null,
        currency: d.currency,
        compensationNotes: d.compensationNotes,
        appliedAt: d.appliedAt || null,
        notes: d.notes,
        tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
    },
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => api.deleteProcess(p.id),
    onSuccess: () => {
      invalidate();
      nav("/processes");
    },
  });

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Role">
          <input className="input" value={d.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field label="Location">
          <input className="input" value={d.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Work mode">
          <select className="input" value={d.workMode} onChange={(e) => set("workMode", e.target.value)}>
            {WORK_MODES.map((s) => (
              <option key={s} value={s}>
                {WORK_MODE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select className="input" value={d.source} onChange={(e) => set("source", e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select className="input" value={d.stage} onChange={(e) => set("stage", e.target.value)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Application date">
          <input type="date" className="input" value={d.appliedAt} onChange={(e) => set("appliedAt", e.target.value)} />
        </Field>
        <Field label="Company website">
          <input className="input" inputMode="url" value={d.website} onChange={(e) => set("website", e.target.value)} onBlur={(e) => set("website", normalizeUrl(e.target.value))} />
        </Field>
        <Field label="Job posting link">
          <input className="input" inputMode="url" value={d.jobUrl} onChange={(e) => set("jobUrl", e.target.value)} onBlur={(e) => set("jobUrl", normalizeUrl(e.target.value))} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input className="input" value={d.tags} onChange={(e) => set("tags", e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_1fr_5rem] gap-2 sm:col-span-3">
          <Field label="Min. salary">
            <input className="input" inputMode="numeric" value={d.salaryMin} onChange={(e) => set("salaryMin", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Max. salary">
            <input className="input" inputMode="numeric" value={d.salaryMax} onChange={(e) => set("salaryMax", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Currency">
            <input className="input" value={d.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))} />
          </Field>
        </div>
      </div>
      <Field label="Compensation (notes: equity, ranges, what you said…)">
        <textarea className="input" rows={3} value={d.compensationNotes} onChange={(e) => set("compensationNotes", e.target.value)} />
      </Field>
      <Field label="Job description (posting text)">
        <textarea className="input" rows={5} value={d.jobDescription} onChange={(e) => set("jobDescription", e.target.value)} />
      </Field>
      <Field label="Process notes">
        <textarea className="input" rows={3} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <ErrorBox error={save.error ?? del.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm(`Delete the ${p.company.name} process and its whole timeline?`)) del.mutate();
          }}
        >
          Delete process
        </button>
        <div className="flex items-center gap-3">
          {save.isSuccess && <span className="text-sm text-good">Saved ✓</span>}
          <button className="btn btn-primary" disabled={save.isPending}>
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}
