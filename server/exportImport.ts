import { EXPORT_SCHEMA_VERSION, ExportFile, type Process } from "../src/shared/schema";
import { STATUS_LABEL, STAGE_LABEL } from "../src/shared/labels";
import type { Repo } from "./repo";

export function exportAll(repo: Repo): ExportFile {
  const db = repo.db;
  return {
    app: "pathly",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    companies: db.select("companies", "1=1", [], `"name"`),
    processes: db.select("processes", "1=1", [], `"createdAt"`),
    entries: db.select("entries", "1=1", [], `"processId", "date"`),
    statusChanges: db.select("statusChanges", "1=1", [], `"processId", "at"`),
  };
}

/**
 * Upgrade older export files to the current schema. Add one step per version:
 *   MIGRATIONS[1] = (v1) => v2
 */
const MIGRATIONS: Record<number, (data: any) => any> = {};

export function migrateExport(raw: unknown): ExportFile {
  if (!raw || typeof raw !== "object" || (raw as any).app !== "pathly") {
    throw new Error("Not a Pathly export file");
  }
  let data: any = raw;
  let v = Number(data.schemaVersion);
  if (!Number.isInteger(v) || v < 1) throw new Error("Invalid schemaVersion");
  if (v > EXPORT_SCHEMA_VERSION) {
    throw new Error(`The file comes from a newer version (v${v}); this app supports up to v${EXPORT_SCHEMA_VERSION}`);
  }
  while (v < EXPORT_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Missing migration v${v} → v${v + 1}`);
    data = step(data);
    v++;
  }
  return ExportFile.parse({ ...data, schemaVersion: v });
}

export type ImportMode = "merge" | "replace";
export type ImportResult = { inserted: number; updated: number; skipped: number };

/**
 * merge: insert unknown ids; for known ids keep whichever has the newer updatedAt.
 * replace: wipe everything, then insert.
 */
export function importAll(repo: Repo, raw: unknown, mode: ImportMode): ImportResult {
  const data = migrateExport(raw);
  const db = repo.db;
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0 };
  db.tx(() => {
    if (mode === "replace") {
      for (const t of ["status_changes", "entries", "processes", "companies"]) db.run(`DELETE FROM ${t}`);
    }
    const apply = <K extends "companies" | "processes" | "entries" | "statusChanges">(key: K, rows: any[]) => {
      for (const row of rows) {
        const existing = db.find(key, row.id) as any;
        if (!existing) result.inserted++;
        else {
          const theirs = row.updatedAt ?? row.createdAt;
          const ours = existing.updatedAt ?? existing.createdAt;
          if (theirs <= ours) {
            result.skipped++;
            continue;
          }
          result.updated++;
        }
        db.upsert(key, row);
      }
    };
    apply("companies", data.companies);
    apply("processes", data.processes);
    apply("entries", data.entries);
    apply("statusChanges", data.statusChanges);
  });
  return result;
}

// ---------- flat CSV for spreadsheets ----------

const csvCell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
};

export function exportProcessesCsv(repo: Repo): string {
  return toCsv(
    repo.listProcesses().map((p: Process & any) => ({
      company: p.company.name,
      role: p.role,
      status: STATUS_LABEL[p.status as keyof typeof STATUS_LABEL],
      stage: STAGE_LABEL[p.stage as keyof typeof STAGE_LABEL],
      location: p.location,
      work_mode: p.workMode,
      source: p.source,
      salary_min: p.salaryMin,
      salary_max: p.salaryMax,
      currency: p.currency,
      applied: p.appliedAt,
      closed: p.closedAt,
      last_activity: p.lastEntryDate,
      entries: p.entryCount,
      url: p.jobUrl,
      summary: p.summary,
    })),
  );
}

export function exportEntriesCsv(repo: Repo): string {
  const procs = new Map(repo.listProcesses().map((p) => [p.id, p]));
  return toCsv(
    repo.db.select("entries", "1=1", [], `"date"`).map((e) => ({
      company: procs.get(e.processId)?.company.name ?? "",
      role: procs.get(e.processId)?.role ?? "",
      date: e.date,
      date_approx: e.dateIsApprox,
      kind: e.kind,
      interview_type: e.interviewType,
      title: e.title,
      interviewers: e.interviewers,
      summary: e.summary,
      topics: e.topics,
      decisions: e.decisions,
      next_steps: e.nextSteps,
      self_assessment: e.selfAssessment,
      raw_notes: e.rawNotes,
    })),
  );
}
