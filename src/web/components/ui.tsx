import { type ReactNode, useEffect, useState } from "react";
import Markdown from "react-markdown";
import { STATUS_LABEL } from "../../shared/labels";
import type { ProcessStatus } from "../../shared/schema";

const STATUS_TONE: Record<ProcessStatus, string> = {
  wishlist: "bg-surface-2 text-text-2",
  applied: "bg-surface-2 text-text",
  ongoing: "bg-accent-soft text-accent",
  paused: "bg-warn-soft text-warn",
  offer: "bg-good-soft text-good",
  accepted: "bg-good-soft text-good",
  declined: "bg-surface-2 text-text-2",
  rejected: "bg-danger-soft text-danger",
  withdrawn: "bg-surface-2 text-text-3",
  ghosted: "bg-surface-2 text-text-3",
};
const STATUS_ICON: Record<ProcessStatus, string> = {
  wishlist: "☆",
  applied: "→",
  ongoing: "●",
  paused: "❚❚",
  offer: "★",
  accepted: "✓",
  declined: "↩",
  rejected: "✕",
  withdrawn: "–",
  ghosted: "…",
};

export function StatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      <span aria-hidden className="text-[10px]">
        {STATUS_ICON[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Md({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-sm ${className}`}>
      <Markdown>{children}</Markdown>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-3">{children}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-text-2" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      {label}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-text-3">{hint}</span>}
    </label>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-text">{children}</h2>
      {action}
    </div>
  );
}

/** Markdown textarea with a preview tab. */
export function MarkdownEditor({
  value,
  onChange,
  rows = 8,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  label: string;
}) {
  const [preview, setPreview] = useState(Boolean(value));
  useEffect(() => {
    if (value) setPreview(true);
  }, [value === ""]);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <div className="flex gap-1 text-xs" role="group" aria-label={`${label}: modo`}>
          <button type="button" className={`rounded px-2 py-0.5 ${!preview ? "bg-surface-2 font-medium" : "text-text-2"}`} onClick={() => setPreview(false)} aria-pressed={!preview}>
            Editar
          </button>
          <button type="button" className={`rounded px-2 py-0.5 ${preview ? "bg-surface-2 font-medium" : "text-text-2"}`} onClick={() => setPreview(true)} aria-pressed={preview}>
            Vista previa
          </button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-16 rounded-lg border border-border bg-surface px-3 py-2" onDoubleClick={() => setPreview(false)}>
          {value ? <Md>{value}</Md> : <span className="text-sm text-text-3">{placeholder ?? "Vacío"}</span>}
        </div>
      ) : (
        <textarea className="input font-mono text-[13px]" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      )}
    </div>
  );
}

/** Lines textarea <-> string[] */
export function ListInput({ value, onChange, placeholder, rows = 3 }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; rows?: number }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => setText(value.join("\n")), [value.join("\n")]);
  return (
    <textarea
      className="input"
      rows={rows}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean));
      }}
    />
  );
}

export const fmtDate = (d: string | null | undefined, approx = false) => {
  if (!d) return "Sin fecha";
  const s = new Date(`${d}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return approx ? `≈ ${s}` : s;
};

export const daysSince = (d: string | null | undefined) => (d ? Math.floor((Date.now() - Date.parse(`${d}T00:00:00`)) / 86_400_000) : null);

export function relDays(d: string | null | undefined) {
  const n = daysSince(d);
  if (n === null) return "—";
  if (n <= 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} d`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
