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
    throw new Error("No es un fichero de exportación de Pathly");
  }
  let data: any = raw;
  let v = Number(data.schemaVersion);
  if (!Number.isInteger(v) || v < 1) throw new Error("schemaVersion inválido");
  if (v > EXPORT_SCHEMA_VERSION) {
    throw new Error(`El fichero es de una versión más nueva (v${v}); esta app soporta hasta v${EXPORT_SCHEMA_VERSION}`);
  }
  while (v < EXPORT_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Falta la migración v${v} → v${v + 1}`);
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
      empresa: p.company.name,
      puesto: p.role,
      estado: STATUS_LABEL[p.status as keyof typeof STATUS_LABEL],
      fase: STAGE_LABEL[p.stage as keyof typeof STAGE_LABEL],
      ubicacion: p.location,
      modalidad: p.workMode,
      fuente: p.source,
      salario_min: p.salaryMin,
      salario_max: p.salaryMax,
      moneda: p.currency,
      aplicado: p.appliedAt,
      cerrado: p.closedAt,
      ultima_actividad: p.lastEntryDate,
      entradas: p.entryCount,
      url: p.jobUrl,
      resumen: p.summary,
    })),
  );
}

export function exportEntriesCsv(repo: Repo): string {
  const procs = new Map(repo.listProcesses().map((p) => [p.id, p]));
  return toCsv(
    repo.db.select("entries", "1=1", [], `"date"`).map((e) => ({
      empresa: procs.get(e.processId)?.company.name ?? "",
      puesto: procs.get(e.processId)?.role ?? "",
      fecha: e.date,
      fecha_aprox: e.dateIsApprox,
      tipo: e.kind,
      tipo_entrevista: e.interviewType,
      titulo: e.title,
      entrevistadores: e.interviewers,
      resumen: e.summary,
      temas: e.topics,
      decisiones: e.decisions,
      siguientes_pasos: e.nextSteps,
      autoevaluacion: e.selfAssessment,
      notas_originales: e.rawNotes,
    })),
  );
}
