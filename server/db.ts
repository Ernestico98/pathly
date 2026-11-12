import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import type { z } from "zod";
import { Company, Entry, Process, StatusChange } from "../src/shared/schema";

/**
 * SQLite via sql.js (WASM, no native build). The whole DB lives in memory and is
 * flushed to disk after every write transaction. Data volume is tiny (hundreds of
 * rows), so this is simpler and more portable than a native driver.
 */

type TableSpec<T extends z.ZodObject> = {
  name: string;
  schema: T;
  json: string[];
  bool: string[];
  columns: string[];
};

function spec<T extends z.ZodObject>(name: string, schema: T, json: string[] = [], bool: string[] = []): TableSpec<T> {
  return { name, schema, json, bool, columns: Object.keys(schema.shape) };
}

export const TABLES = {
  companies: spec("companies", Company),
  processes: spec("processes", Process, ["tags"]),
  entries: spec("entries", Entry, ["interviewers", "topics", "decisions", "nextSteps"], ["dateIsApprox"]),
  statusChanges: spec("status_changes", StatusChange),
};
export type TableKey = keyof typeof TABLES;

const MIGRATIONS: string[] = [
  `CREATE TABLE companies (
    "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "website" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
  );
  CREATE TABLE processes (
    "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL REFERENCES companies("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL DEFAULT '', "location" TEXT NOT NULL DEFAULT '', "workMode" TEXT NOT NULL,
    "source" TEXT NOT NULL, "jobUrl" TEXT NOT NULL DEFAULT '', "jobDescription" TEXT NOT NULL DEFAULT '',
    "jobSummary" TEXT NOT NULL DEFAULT '', "salaryMin" REAL, "salaryMax" REAL, "currency" TEXT NOT NULL DEFAULT 'EUR',
    "compensationNotes" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL, "stage" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '', "tags" TEXT NOT NULL DEFAULT '[]',
    "appliedAt" TEXT, "closedAt" TEXT, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
  );
  CREATE TABLE entries (
    "id" TEXT PRIMARY KEY, "processId" TEXT NOT NULL REFERENCES processes("id") ON DELETE CASCADE,
    "date" TEXT, "dateIsApprox" INTEGER NOT NULL DEFAULT 0, "kind" TEXT NOT NULL, "interviewType" TEXT,
    "title" TEXT NOT NULL DEFAULT '', "interviewers" TEXT NOT NULL DEFAULT '[]', "rawNotes" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '', "topics" TEXT NOT NULL DEFAULT '[]', "decisions" TEXT NOT NULL DEFAULT '[]',
    "nextSteps" TEXT NOT NULL DEFAULT '[]', "selfAssessment" INTEGER, "durationMin" INTEGER,
    "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
  );
  CREATE TABLE status_changes (
    "id" TEXT PRIMARY KEY, "processId" TEXT NOT NULL REFERENCES processes("id") ON DELETE CASCADE,
    "from" TEXT, "to" TEXT NOT NULL, "at" TEXT NOT NULL, "reason" TEXT NOT NULL DEFAULT '',
    "entryId" TEXT REFERENCES entries("id") ON DELETE SET NULL, "createdAt" TEXT NOT NULL
  );
  CREATE TABLE settings ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL);
  CREATE INDEX idx_processes_company ON processes("companyId");
  CREATE INDEX idx_entries_process ON entries("processId", "date");
  CREATE INDEX idx_status_process ON status_changes("processId", "at");`,
];

export class Db {
  private constructor(
    private sql: Database,
    private file: string | null,
  ) {}

  static async open(file: string | null): Promise<Db> {
    const SQL = await initSqlJs();
    const data = file && fs.existsSync(file) ? fs.readFileSync(file) : undefined;
    const db = new Db(new SQL.Database(data), file);
    db.sql.run("PRAGMA foreign_keys = ON");
    db.migrate();
    return db;
  }

  private migrate() {
    const version = Number(this.sql.exec("PRAGMA user_version")[0]?.values[0]?.[0] ?? 0);
    if (version >= MIGRATIONS.length) return;
    this.tx(() => {
      for (let v = version; v < MIGRATIONS.length; v++) this.sql.exec(MIGRATIONS[v]!);
      this.sql.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
    });
  }

  private depth = 0;
  /** Run fn in a transaction (re-entrant) and flush to disk on the outermost commit. */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++;
      try {
        return fn();
      } finally {
        this.depth--;
      }
    }
    this.depth = 1;
    this.sql.run("BEGIN");
    try {
      const out = fn();
      this.sql.run("COMMIT");
      this.persist();
      return out;
    } catch (err) {
      this.sql.run("ROLLBACK");
      throw err;
    } finally {
      this.depth = 0;
    }
  }

  private persist() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.sql.export()));
    fs.renameSync(tmp, this.file);
    // sql.js export() resets pragmas on some versions; re-enable FKs.
    this.sql.run("PRAGMA foreign_keys = ON");
  }

  all<T = Record<string, unknown>>(query: string, params: SqlValue[] = []): T[] {
    const stmt = this.sql.prepare(query);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Record<string, unknown>>(query: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(query, params)[0];
  }

  run(query: string, params: SqlValue[] = []) {
    this.sql.run(query, params);
  }

  // ---------- typed table helpers ----------

  private decode<K extends TableKey>(key: K, row: Record<string, unknown>): z.infer<(typeof TABLES)[K]["schema"]> {
    const t = TABLES[key];
    const out: Record<string, unknown> = { ...row };
    for (const c of t.json) out[c] = JSON.parse(String(row[c] ?? "[]"));
    for (const c of t.bool) out[c] = Boolean(row[c]);
    return out as z.infer<(typeof TABLES)[K]["schema"]>;
  }

  select<K extends TableKey>(key: K, where = "1=1", params: SqlValue[] = [], order = ""): z.infer<(typeof TABLES)[K]["schema"]>[] {
    const t = TABLES[key];
    const rows = this.all(`SELECT * FROM ${t.name} WHERE ${where} ${order ? `ORDER BY ${order}` : ""}`, params);
    return rows.map((r) => this.decode(key, r));
  }

  find<K extends TableKey>(key: K, id: string) {
    return this.select(key, `"id" = ?`, [id])[0];
  }

  upsert<K extends TableKey>(key: K, value: z.infer<(typeof TABLES)[K]["schema"]>) {
    const t = TABLES[key];
    const v = t.schema.parse(value) as Record<string, unknown>;
    const cols = t.columns;
    const params = cols.map((c): SqlValue => {
      const x = v[c];
      if (t.json.includes(c)) return JSON.stringify(x ?? []);
      if (t.bool.includes(c)) return x ? 1 : 0;
      return (x ?? null) as SqlValue;
    });
    const quoted = cols.map((c) => `"${c}"`).join(", ");
    const updates = cols.filter((c) => c !== "id").map((c) => `"${c}" = excluded."${c}"`).join(", ");
    this.run(
      `INSERT INTO ${t.name} (${quoted}) VALUES (${cols.map(() => "?").join(", ")})
       ON CONFLICT("id") DO UPDATE SET ${updates}`,
      params,
    );
  }

  remove(key: TableKey, id: string) {
    this.run(`DELETE FROM ${TABLES[key].name} WHERE "id" = ?`, [id]);
  }

  getSetting(key: string): unknown {
    const row = this.get<{ value: string }>(`SELECT "value" FROM settings WHERE "key" = ?`, [key]);
    return row ? JSON.parse(row.value) : undefined;
  }

  setSetting(key: string, value: unknown) {
    this.tx(() =>
      this.run(`INSERT INTO settings ("key","value") VALUES (?,?) ON CONFLICT("key") DO UPDATE SET "value"=excluded."value"`, [
        key,
        JSON.stringify(value),
      ]),
    );
  }
}
