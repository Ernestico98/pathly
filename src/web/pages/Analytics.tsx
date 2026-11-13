import { useQuery } from "@tanstack/react-query";
import { INTERVIEW_TYPE_LABEL, STATUS_LABEL } from "../../shared/labels";
import { PROCESS_STATUSES } from "../../shared/schema";
import { api } from "../api";
import { BarList, Columns, StatTile } from "../components/charts";
import { ErrorBox, Spinner } from "../components/ui";

export default function Analytics() {
  const q = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });
  if (q.isPending) return <Spinner label="Loading…" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const a = q.data;
  const applied = a.funnel[0]!.value || 1;
  const pct = (v: number) => `${Math.round((v / applied) * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-text-2">For deeper analysis, export your data from Settings.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Processes" value={a.totals.processes} hint={`${a.totals.wishlist} in wishlist`} />
        <StatTile label="Interviews and assessments" value={a.totals.interviews} />
        <StatTile label="Reach interview" value={a.totals.responseRate === null ? "—" : `${Math.round(a.totals.responseRate * 100)}%`} />
        <StatTile label="Average duration" value={a.totals.avgDaysToClose === null ? "—" : `${a.totals.avgDaysToClose} d`} hint="until closed" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Funnel</h2>
          <p className="mb-4 text-xs text-text-3">Applied processes that reach each point</p>
          <BarList caption="Process funnel" rows={a.funnel.map((f) => ({ label: f.label, value: f.value, sub: pct(f.value) }))} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Interviews per week</h2>
          <p className="mb-4 text-xs text-text-3">Last 16 weeks</p>
          <Columns
            caption="Interviews per week"
            valueLabel="interviews"
            data={a.weeks.map((w) => ({
              x: w.week,
              label: new Date(`${w.week}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
              value: w.interviews,
            }))}
          />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Where do rejections happen?</h2>
          <p className="mb-4 text-xs text-text-3">Rejected processes by how many interviews you had before</p>
          <BarList caption="Rejections by stage" rows={a.rejectionBuckets.map((r) => ({ label: r.label, value: r.value }))} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Processes by status</h2>
          <p className="mb-4 text-xs text-text-3">Current status</p>
          <BarList
            caption="Processes by status"
            rows={PROCESS_STATUSES.filter((s) => a.byStatus[s] > 0).map((s) => ({ label: STATUS_LABEL[s], value: a.byStatus[s] }))}
          />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Interview types</h2>
          <p className="mb-4 text-xs text-text-3">How many of each type you have done</p>
          {a.interviewTypes.length ? (
            <BarList caption="Interview types" rows={a.interviewTypes.map((t) => ({ label: INTERVIEW_TYPE_LABEL[t.type], value: t.count }))} />
          ) : (
            <p className="text-sm text-text-3">No data yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
