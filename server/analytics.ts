import { PROCESS_STATUSES, type InterviewType, type ProcessStatus, isActive } from "../src/shared/schema";
import type { Repo } from "./repo";

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Monday of the ISO week, as YYYY-MM-DD. */
function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

export type Analytics = ReturnType<typeof computeAnalytics>;

export function computeAnalytics(repo: Repo, today = new Date().toISOString().slice(0, 10)) {
  const processes = repo.listProcesses();
  const entries = repo.db.select("entries");
  const changes = repo.db.select("statusChanges");

  const byStatus = Object.fromEntries(PROCESS_STATUSES.map((s) => [s, 0])) as Record<ProcessStatus, number>;
  for (const p of processes) byStatus[p.status]++;

  const interviewsByProcess = new Map<string, number>();
  for (const e of entries) if (e.kind === "interview" || e.kind === "assessment")
    interviewsByProcess.set(e.processId, (interviewsByProcess.get(e.processId) ?? 0) + 1);

  const everReached = (pid: string, s: ProcessStatus) => changes.some((c) => c.processId === pid && c.to === s);
  const applied = processes.filter((p) => p.status !== "wishlist");
  const funnel = [
    { key: "applied", label: "Aplicados", value: applied.length },
    { key: "interview", label: "Con alguna entrevista", value: applied.filter((p) => (interviewsByProcess.get(p.id) ?? 0) >= 1).length },
    { key: "second", label: "2+ entrevistas", value: applied.filter((p) => (interviewsByProcess.get(p.id) ?? 0) >= 2).length },
    { key: "third", label: "3+ entrevistas", value: applied.filter((p) => (interviewsByProcess.get(p.id) ?? 0) >= 3).length },
    { key: "offer", label: "Oferta", value: applied.filter((p) => ["offer", "accepted", "declined"].includes(p.status) || everReached(p.id, "offer")).length },
    { key: "accepted", label: "Aceptada", value: applied.filter((p) => p.status === "accepted").length },
  ];

  // Interviews per ISO week, last 16 weeks, zero-filled.
  const perWeek = new Map<string, number>();
  for (const e of entries) if (e.date && (e.kind === "interview" || e.kind === "assessment")) {
    const w = weekOf(e.date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const weeks: { week: string; interviews: number }[] = [];
  const thisWeek = weekOf(today);
  for (let i = 15; i >= 0; i--) {
    const w = new Date(Date.parse(thisWeek) - i * 7 * DAY).toISOString().slice(0, 10);
    weeks.push({ week: w, interviews: perWeek.get(w) ?? 0 });
  }

  const typeCounts = new Map<InterviewType, number>();
  for (const e of entries) if (e.interviewType) typeCounts.set(e.interviewType, (typeCounts.get(e.interviewType) ?? 0) + 1);
  const interviewTypes = [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  // Where rejections happen: number of interviews done before the rejection.
  const rejectedAt = new Map<string, number>();
  for (const p of processes.filter((p) => p.status === "rejected")) {
    const n = interviewsByProcess.get(p.id) ?? 0;
    const bucket = n === 0 ? "Sin entrevistas" : n === 1 ? "Tras 1 entrevista" : n === 2 ? "Tras 2" : "Tras 3 o más";
    rejectedAt.set(bucket, (rejectedAt.get(bucket) ?? 0) + 1);
  }
  const rejectionBuckets = ["Sin entrevistas", "Tras 1 entrevista", "Tras 2", "Tras 3 o más"].map((label) => ({ label, value: rejectedAt.get(label) ?? 0 }));

  // Durations of closed processes (first dated entry/applied → closed).
  const durations = processes
    .filter((p) => p.closedAt)
    .map((p) => {
      const first = [p.appliedAt, ...entries.filter((e) => e.processId === p.id && e.date).map((e) => e.date!)].filter(Boolean).sort()[0];
      return first ? days(first, p.closedAt!) : null;
    })
    .filter((d): d is number => d !== null && d >= 0);
  const avgDaysToClose = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const active = processes.filter((p) => isActive(p.status) && p.status !== "wishlist");
  const stale = active
    .map((p) => ({ id: p.id, company: p.company.name, role: p.role, status: p.status, last: p.lastEntryDate ?? p.appliedAt, days: p.lastEntryDate ?? p.appliedAt ? days((p.lastEntryDate ?? p.appliedAt)!, today) : null }))
    .filter((x) => x.days === null || x.days >= 10)
    .sort((a, b) => (b.days ?? 999) - (a.days ?? 999));

  const interviewsTotal = entries.filter((e) => e.kind === "interview" || e.kind === "assessment").length;
  const last30 = entries.filter((e) => e.date && (e.kind === "interview" || e.kind === "assessment") && days(e.date, today) <= 30 && days(e.date, today) >= 0).length;

  const byId = new Map(processes.map((p) => [p.id, p]));
  const recent = entries
    .filter((e) => e.date)
    .sort((a, b) => (b.date! + b.createdAt).localeCompare(a.date! + a.createdAt))
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      processId: e.processId,
      company: byId.get(e.processId)?.company.name ?? "",
      date: e.date,
      dateIsApprox: e.dateIsApprox,
      kind: e.kind,
      interviewType: e.interviewType,
      title: e.title,
    }));
  const pendingNextSteps = processes
    .filter((p) => isActive(p.status))
    .flatMap((p) => {
      const last = entries.filter((e) => e.processId === p.id && e.nextSteps.length).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
      return last ? [{ processId: p.id, company: p.company.name, date: last.date, steps: last.nextSteps }] : [];
    });

  return {
    recent,
    pendingNextSteps,
    totals: {
      processes: processes.length,
      active: active.length,
      wishlist: byStatus.wishlist,
      offers: byStatus.offer + byStatus.accepted + byStatus.declined,
      interviews: interviewsTotal,
      interviewsLast30: last30,
      responseRate: applied.length ? (funnel[1]!.value / applied.length) : null,
      avgDaysToClose,
    },
    byStatus,
    funnel,
    weeks,
    interviewTypes,
    rejectionBuckets,
    stale,
  };
}
