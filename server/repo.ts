import { randomUUID } from "node:crypto";
import {
  type Company,
  type CompanyInput,
  type Entry,
  type EntryWithUpdates,
  type Process,
  type ProcessDetail,
  type ProcessInput,
  type ProcessPatch,
  type ProcessWithCompany,
  type StatusChange,
  type StatusChangeInput,
  isActive,
} from "../src/shared/schema";
import type { Db } from "./db";

export class NotFound extends Error {}

const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export class Repo {
  constructor(readonly db: Db) {}

  // ---------- companies ----------

  listCompanies(): Company[] {
    return this.db.select("companies", "1=1", [], `"name" COLLATE NOCASE`);
  }

  getCompany(id: string): Company {
    const c = this.db.find("companies", id);
    if (!c) throw new NotFound(`company ${id}`);
    return c;
  }

  createCompany(input: CompanyInput): Company {
    const existing = this.db.select("companies", `"name" = ? COLLATE NOCASE`, [input.name.trim()])[0];
    if (existing) return existing;
    const t = now();
    const c: Company = { website: "", summary: "", notes: "", ...input, name: input.name.trim(), id: randomUUID(), createdAt: t, updatedAt: t };
    this.db.tx(() => this.db.upsert("companies", c));
    return c;
  }

  updateCompany(id: string, patch: Partial<CompanyInput>): Company {
    const c = { ...this.getCompany(id), ...patch, id, updatedAt: now() };
    this.db.tx(() => this.db.upsert("companies", c));
    return c;
  }

  // ---------- processes ----------

  listProcesses(): ProcessWithCompany[] {
    const companies = new Map(this.listCompanies().map((c) => [c.id, c]));
    const stats = new Map(
      this.db
        .all<{ processId: string; last: string | null; n: number }>(
          `SELECT "processId", MAX("date") AS last, COUNT(*) AS n FROM entries GROUP BY "processId"`,
        )
        .map((r) => [r.processId, r]),
    );
    return this.db.select("processes", "1=1", [], `"updatedAt" DESC`).map((p) => ({
      ...p,
      company: companies.get(p.companyId)!,
      lastEntryDate: stats.get(p.id)?.last ?? null,
      entryCount: Number(stats.get(p.id)?.n ?? 0),
    }));
  }

  getProcess(id: string): ProcessDetail {
    const p = this.db.find("processes", id);
    if (!p) throw new NotFound(`process ${id}`);
    const entries = this.listEntries(id);
    return {
      ...p,
      company: this.getCompany(p.companyId),
      entries,
      statusChanges: this.db.select("statusChanges", `"processId" = ?`, [id], `"at", "createdAt"`),
      lastEntryDate: entries.reduce<string | null>((m, e) => (e.date && (!m || e.date > m) ? e.date : m), null),
      entryCount: entries.length,
    };
  }

  createProcess(input: ProcessInput): ProcessDetail {
    return this.db.tx(() => {
      const { company, companyId, status, ...rest } = input;
      const cid = companyId ?? (company ? this.createCompany(company).id : undefined);
      if (!cid) throw new Error("companyId o company es obligatorio");
      this.getCompany(cid);
      const t = now();
      const p: Process = {
        role: "",
        location: "",
        workMode: "unknown",
        source: "unknown",
        jobUrl: "",
        jobDescription: "",
        jobSummary: "",
        salaryMin: null,
        salaryMax: null,
        currency: "EUR",
        compensationNotes: "",
        stage: "none",
        summary: "",
        notes: "",
        tags: [],
        appliedAt: status === "wishlist" ? null : today(),
        closedAt: null,
        ...rest,
        status,
        companyId: cid,
        id: randomUUID(),
        createdAt: t,
        updatedAt: t,
      };
      this.db.upsert("processes", p);
      this.db.upsert("statusChanges", {
        id: randomUUID(),
        processId: p.id,
        from: null,
        to: status,
        at: p.appliedAt ?? today(),
        reason: "",
        entryId: null,
        createdAt: t,
      });
      return this.getProcess(p.id);
    });
  }

  updateProcess(id: string, patch: ProcessPatch): ProcessDetail {
    const p = this.getProcess(id);
    const { company: _c, entries: _e, statusChanges: _s, lastEntryDate: _l, entryCount: _n, ...base } = p;
    this.db.tx(() => this.db.upsert("processes", { ...base, ...patch, id, updatedAt: now() }));
    return this.getProcess(id);
  }

  deleteProcess(id: string) {
    this.db.tx(() => this.db.remove("processes", id));
  }

  changeStatus(processId: string, input: StatusChangeInput): StatusChange | null {
    return this.db.tx(() => {
      const p = this.db.find("processes", processId);
      if (!p) throw new NotFound(`process ${processId}`);
      if (p.status === input.to) return null;
      const at = input.at ?? today();
      const sc: StatusChange = {
        id: randomUUID(),
        processId,
        from: p.status,
        to: input.to,
        at,
        reason: input.reason ?? "",
        entryId: input.entryId ?? null,
        createdAt: now(),
      };
      this.db.upsert("statusChanges", sc);
      this.db.upsert("processes", {
        ...p,
        status: input.to,
        stage: input.to === "offer" ? "offer" : p.stage,
        appliedAt: p.appliedAt ?? (input.to !== "wishlist" ? at : null),
        closedAt: isActive(input.to) ? null : at,
        updatedAt: now(),
      });
      return sc;
    });
  }

  // ---------- entries ----------

  listEntries(processId: string): Entry[] {
    // Undated entries keep their insertion order at the end of their neighbours.
    return this.db.select("entries", `"processId" = ?`, [processId], `COALESCE("date", '9999') , "createdAt"`);
  }

  addEntry(processId: string, input: EntryWithUpdates): ProcessDetail {
    return this.db.tx(() => {
      const p = this.db.find("processes", processId);
      if (!p) throw new NotFound(`process ${processId}`);
      const t = now();
      const e: Entry = {
        dateIsApprox: false,
        interviewType: null,
        title: "",
        interviewers: [],
        rawNotes: "",
        summary: "",
        topics: [],
        decisions: [],
        nextSteps: [],
        selfAssessment: null,
        durationMin: null,
        ...input.entry,
        id: randomUUID(),
        processId,
        createdAt: t,
        updatedAt: t,
      };
      this.db.upsert("entries", e);
      const patch: Partial<Process> = {};
      if (input.processSummary !== undefined) patch.summary = input.processSummary;
      if (input.stage) patch.stage = input.stage;
      if (Object.keys(patch).length) this.db.upsert("processes", { ...p, ...patch, updatedAt: t });
      else this.db.upsert("processes", { ...p, updatedAt: t });
      if (input.status) this.changeStatus(processId, { ...input.status, at: input.status.at ?? e.date ?? today(), entryId: e.id });
      return this.getProcess(processId);
    });
  }

  updateEntry(id: string, patch: Partial<Entry>): Entry {
    const e = this.db.find("entries", id);
    if (!e) throw new NotFound(`entry ${id}`);
    const next = { ...e, ...patch, id, processId: e.processId, createdAt: e.createdAt, updatedAt: now() };
    this.db.tx(() => this.db.upsert("entries", next));
    return next;
  }

  deleteEntry(id: string) {
    this.db.tx(() => this.db.remove("entries", id));
  }
}
