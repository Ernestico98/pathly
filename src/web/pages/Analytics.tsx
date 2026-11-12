import { useQuery } from "@tanstack/react-query";
import { INTERVIEW_TYPE_LABEL, STATUS_LABEL } from "../../shared/labels";
import { PROCESS_STATUSES } from "../../shared/schema";
import { api } from "../api";
import { BarList, Columns, StatTile } from "../components/charts";
import { ErrorBox, Spinner } from "../components/ui";

export default function Analytics() {
  const q = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });
  if (q.isPending) return <Spinner label="Cargando…" />;
  if (q.error) return <ErrorBox error={q.error} />;
  const a = q.data;
  const applied = a.funnel[0]!.value || 1;
  const pct = (v: number) => `${Math.round((v / applied) * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analíticas</h1>
          <p className="text-sm text-text-2">Para análisis más profundos, exporta los datos desde Ajustes.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Procesos" value={a.totals.processes} hint={`${a.totals.wishlist} en wishlist`} />
        <StatTile label="Entrevistas y pruebas" value={a.totals.interviews} />
        <StatTile label="Llegan a entrevista" value={a.totals.responseRate === null ? "—" : `${Math.round(a.totals.responseRate * 100)}%`} />
        <StatTile label="Duración media" value={a.totals.avgDaysToClose === null ? "—" : `${a.totals.avgDaysToClose} d`} hint="hasta cerrarse" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Embudo</h2>
          <p className="mb-4 text-xs text-text-3">Procesos aplicados que llegan a cada punto</p>
          <BarList caption="Embudo de procesos" rows={a.funnel.map((f) => ({ label: f.label, value: f.value, sub: pct(f.value) }))} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Entrevistas por semana</h2>
          <p className="mb-4 text-xs text-text-3">Últimas 16 semanas</p>
          <Columns
            caption="Entrevistas por semana"
            valueLabel="entrevistas"
            data={a.weeks.map((w) => ({
              x: w.week,
              label: new Date(`${w.week}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
              value: w.interviews,
            }))}
          />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">¿Dónde llegan los rechazos?</h2>
          <p className="mb-4 text-xs text-text-3">Procesos rechazados según cuántas entrevistas hiciste antes</p>
          <BarList caption="Rechazos por fase" rows={a.rejectionBuckets.map((r) => ({ label: r.label, value: r.value }))} />
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Procesos por estado</h2>
          <p className="mb-4 text-xs text-text-3">Estado actual</p>
          <BarList
            caption="Procesos por estado"
            rows={PROCESS_STATUSES.filter((s) => a.byStatus[s] > 0).map((s) => ({ label: STATUS_LABEL[s], value: a.byStatus[s] }))}
          />
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Tipos de entrevista</h2>
          <p className="mb-4 text-xs text-text-3">Cuántas has hecho de cada tipo</p>
          {a.interviewTypes.length ? (
            <BarList caption="Tipos de entrevista" rows={a.interviewTypes.map((t) => ({ label: INTERVIEW_TYPE_LABEL[t.type], value: t.count }))} />
          ) : (
            <p className="text-sm text-text-3">Sin datos todavía.</p>
          )}
        </section>
      </div>
    </div>
  );
}
