import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ENTRY_KIND_LABEL, STAGE_LABEL } from "../../shared/labels";
import { isActive } from "../../shared/schema";
import { api } from "../api";
import { StatTile } from "../components/charts";
import { Empty, ErrorBox, SectionTitle, Spinner, StatusBadge, fmtDate, relDays } from "../components/ui";

export default function Dashboard() {
  const procs = useQuery({ queryKey: ["processes"], queryFn: api.processes });
  const stats = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });

  if (procs.isPending || stats.isPending) return <Spinner label="Loading…" />;
  if (procs.error || stats.error) return <ErrorBox error={procs.error ?? stats.error} />;

  const a = stats.data;
  const active = procs.data
    .filter((p) => isActive(p.status) && p.status !== "wishlist")
    .sort((x, y) => (y.status === "offer" ? 1 : 0) - (x.status === "offer" ? 1 : 0) || (y.lastEntryDate ?? "").localeCompare(x.lastEntryDate ?? ""));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-text-2">How your search is going right now.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Active processes" value={a.totals.active} hint={`${a.totals.wishlist} in wishlist`} />
        <StatTile label="Offers" value={a.totals.offers} />
        <StatTile label="Interviews (30 days)" value={a.totals.interviewsLast30} hint={`${a.totals.interviews} total`} />
        <StatTile
          label="Reach interview"
          value={a.totals.responseRate === null ? "—" : `${Math.round(a.totals.responseRate * 100)}%`}
          hint="of applied processes"
        />
      </div>

      <section>
        <SectionTitle action={<Link to="/processes" className="text-sm text-accent hover:underline">View all</Link>}>
          Active ({active.length})
        </SectionTitle>
        {active.length === 0 ? (
          <Empty>No active processes.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((p) => (
              <Link key={p.id} to={`/processes/${p.id}`} className="card flex h-full flex-col p-4 transition-colors hover:border-accent/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.company.name}</div>
                    <div className="truncate text-sm text-text-2">{p.role || "No role specified"}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                {/* Always reserve two lines so every card in a row has the same structure. */}
                <p className={`mt-2 line-clamp-2 min-h-10 text-sm ${p.summary ? "text-text-2" : "text-text-3 italic"}`}>
                  {p.summary ? p.summary.replace(/[#*_`>]/g, "").replace(/^\s*-\s+/gm, "") : "No summary yet"}
                </p>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs text-text-3">
                  <span>Stage: {STAGE_LABEL[p.stage]}</span>
                  <span>{p.entryCount} {p.entryCount === 1 ? "entry" : "entries"}</span>
                  <span>Last activity: {relDays(p.lastEntryDate ?? p.appliedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle>Needs attention</SectionTitle>
          {a.stale.length === 0 ? (
            <Empty>All caught up.</Empty>
          ) : (
            <ul className="card divide-y divide-border">
              {a.stale.map((s) => (
                <li key={s.id}>
                  <Link to={`/processes/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                    <span className="truncate">{s.company}</span>
                    <span className="shrink-0 text-xs text-text-3">
                      {s.days === null ? "no activity" : `${s.days} ${s.days === 1 ? "day" : "days"} without activity`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {a.pendingNextSteps.length > 0 && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-semibold">Pending next steps</h3>
              <ul className="card divide-y divide-border">
                {a.pendingNextSteps.map((n) => (
                  <li key={n.processId} className="px-4 py-2.5 text-sm">
                    <Link to={`/processes/${n.processId}`} className="font-medium hover:underline">
                      {n.company}
                    </Link>
                    <ul className="mt-1 list-disc pl-5 text-text-2">
                      {n.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="min-w-0">
          <SectionTitle>Recent activity</SectionTitle>
          {a.recent.length === 0 ? (
            <Empty>No entries yet.</Empty>
          ) : (
            <ul className="card divide-y divide-border">
              {a.recent.map((e) => (
                <li key={e.id}>
                  <Link to={`/processes/${e.processId}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
                    <span className="w-24 shrink-0 text-xs tabular-nums text-text-3">{fmtDate(e.date, e.dateIsApprox)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{e.company}</span>
                      <span className="text-text-2"> · {e.title || ENTRY_KIND_LABEL[e.kind]}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
