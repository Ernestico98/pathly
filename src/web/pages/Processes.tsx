import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { STAGE_LABEL, STATUS_LABEL } from "../../shared/labels";
import { PROCESS_STATUSES, type ProcessStatus, type ProcessWithCompany, isActive } from "../../shared/schema";
import { api } from "../api";
import { Empty, ErrorBox, Spinner, StatusBadge, fmtDate, relDays } from "../components/ui";

type Scope = "active" | "closed" | "wishlist" | "all";
const SCOPES: { key: Scope; label: string; test: (s: ProcessStatus) => boolean }[] = [
  { key: "active", label: "Active", test: (s) => isActive(s) && s !== "wishlist" },
  { key: "wishlist", label: "Wishlist", test: (s) => s === "wishlist" },
  { key: "closed", label: "Closed", test: (s) => !isActive(s) },
  { key: "all", label: "All", test: () => true },
];

export default function Processes() {
  const q = useQuery({ queryKey: ["processes"], queryFn: api.processes });
  const [params, setParams] = useSearchParams();
  const scope = (params.get("show") as Scope) || "active";
  const view = params.get("view") === "board" ? "board" : "list";
  const [search, setSearch] = useState("");
  const nav = useNavigate();

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    const test = SCOPES.find((s) => s.key === scope)!.test;
    const needle = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((p) => test(p.status))
      .filter((p) => !needle || `${p.company.name} ${p.role} ${p.location}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.lastEntryDate ?? b.appliedAt ?? "").localeCompare(a.lastEntryDate ?? a.appliedAt ?? ""));
  }, [q.data, scope, search]);

  if (q.isPending) return <Spinner label="Loading…" />;
  if (q.error) return <ErrorBox error={q.error} />;

  const counts = Object.fromEntries(SCOPES.map((s) => [s.key, q.data.filter((p) => s.test(p.status)).length]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Processes</h1>
        <Link to="/processes/new" className="btn btn-primary">
          + New process
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={scope === s.key}
              onClick={() => set("show", s.key)}
              className={`rounded-full border px-3 py-1 text-sm ${scope === s.key ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:text-text"}`}
            >
              {s.label} <span className="tabular-nums opacity-70">{counts[s.key]}</span>
            </button>
          ))}
        </div>
        <input className="input ml-auto max-w-56" placeholder="Search company or role…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="View">
          {(["list", "board"] as const).map((v) => (
            <button
              key={v}
              onClick={() => set("view", v === "board" ? "board" : null)}
              aria-pressed={view === v}
              className={`rounded-md px-2.5 py-1 text-sm ${view === v ? "bg-surface-2 font-medium" : "text-text-2"}`}
            >
              {v === "list" ? "List" : "Board"}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>No processes match this filter.</Empty>
      ) : view === "list" ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-2">
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Entries</th>
                <th className="px-4 py-2 font-medium">Applied</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => nav(`/processes/${p.id}`)}>
                  <td className="px-4 py-2.5">
                    <Link to={`/processes/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {p.company.name}
                    </Link>
                    {p.role && <div className="text-xs text-text-2">{p.role}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-2.5 text-text-2">{STAGE_LABEL[p.stage]}</td>
                  <td className="px-4 py-2.5 tabular-nums text-text-2">{p.entryCount}</td>
                  <td className="px-4 py-2.5 text-text-2">{p.appliedAt ? fmtDate(p.appliedAt) : "—"}</td>
                  <td className="px-4 py-2.5 text-text-2">{relDays(p.lastEntryDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Board rows={rows} />
      )}
    </div>
  );
}

function Board({ rows }: { rows: ProcessWithCompany[] }) {
  const columns = PROCESS_STATUSES.filter((s) => rows.some((r) => r.status === s));
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((s) => (
        <div key={s} className="w-64 shrink-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-2">
            {STATUS_LABEL[s]} <span className="tabular-nums text-text-3">{rows.filter((r) => r.status === s).length}</span>
          </div>
          <div className="space-y-2">
            {rows
              .filter((r) => r.status === s)
              .map((p) => (
                <Link key={p.id} to={`/processes/${p.id}`} className="card block p-3 text-sm hover:border-accent/50">
                  <div className="font-medium">{p.company.name}</div>
                  {p.role && <div className="text-xs text-text-2">{p.role}</div>}
                  <div className="mt-2 flex items-center justify-between text-xs text-text-3">
                    <span>{STAGE_LABEL[p.stage]}</span>
                    <span>{relDays(p.lastEntryDate)}</span>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
