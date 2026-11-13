import { randomUUID } from "node:crypto";
import {
  EXPORT_SCHEMA_VERSION,
  type Company,
  type Entry,
  type EntryKind,
  type ExportFile,
  type InterviewType,
  type Process,
  type ProcessStatus,
  type Stage,
  type StatusChange,
  isActive,
} from "../src/shared/schema";
import { INTERVIEW_TYPE_LABEL } from "../src/shared/labels";

/**
 * Importer for a "one row per company" tracking spreadsheet:
 *   Company (or Empresa), Description, Stage (or Timeline), Status, (extra)
 * "Stage" holds a free-text timeline: bullets that usually start with a date (d/m/yy[yy]).
 * The keyword heuristics below understand notes written in Spanish and English.
 */

// ---------------------------------------------------------------- CSV + encoding

export function decodeCsvBytes(buf: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Excel on Windows exports cp1252; invalid UTF-8 shows up as U+FFFD.
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
  return text.replace(/^﻿/, "");
}

/** Excel/Numbers in a Spanish locale export with ";" — pick whichever separator the header uses. */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => header.split(c).length - 1;
  const [best] = ([",", ";", "\t"] as const).map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1]);
  return best && best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- helpers

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clean = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim();
/** Join hard-wrapped lines (the spreadsheet wraps sentences mid-way) while keeping bullets. */
const unwrap = (s: string) =>
  clean(s)
    .split("\n")
    .reduce<string[]>((acc, line) => {
      const isNew = /^([-*•]|\d+\.|[A-Z][a-z]+:)/.test(line) || acc.length === 0 || /[.:]$/.test(acc[acc.length - 1]!) || line === "";
      if (isNew) acc.push(line);
      else acc[acc.length - 1] += ` ${line}`;
      return acc;
    }, [])
    .join("\n");

const DATE_RE = /^\s*-?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*:?\s*/;

function toIso(d: string, m: string, y: string): string | null {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Segment = { date: string | null; dateIsApprox: boolean; text: string };

/** Split the "Stage" cell into timeline segments. */
export function splitTimeline(cell: string): Segment[] {
  const segs: Segment[] = [];
  let lastDate: string | null = null;
  for (const rawLine of cell.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = DATE_RE.exec(line);
    if (m) {
      const date = toIso(m[1]!, m[2]!, m[3]!);
      if (date) lastDate = date;
      segs.push({ date, dateIsApprox: false, text: line.slice(m[0].length) });
    } else if (/^[-*•]\s+/.test(line) && segs.length && !segs[segs.length - 1]!.text.endsWith(":")) {
      // An undated bullet usually means "a bit later". Exception: sub-bullets inside a block.
      const prev = segs[segs.length - 1]!;
      const isSubList = /^\s*[-*•]\s+\d/.test(line) || /proceso:|process:/i.test(prev.text.split("\n").slice(-3).join(" "));
      if (isSubList) prev.text += `\n${line}`;
      else segs.push({ date: lastDate, dateIsApprox: lastDate !== null, text: line.replace(/^[-*•]\s+/, "") });
    } else if (segs.length) segs[segs.length - 1]!.text += `\n${line}`;
    else segs.push({ date: null, dateIsApprox: false, text: line.replace(/^[-*•]\s+/, "") });
  }
  return segs.map((s) => ({ ...s, text: s.text.trim() }));
}

type Classified = { kind: EntryKind; interviewType: InterviewType | null; title: string; interviewers: string[] };

const REJECTION = /rechaz|rejection|no va a proceder|respuesta fue negativa|decidio no presentar|no proceder|asumo rejection/;
const INTERVIEW = /interview|entrevista|llamada|reunion|\breu\b|meeting|screen|workshop|\bcall\b|discusion/;

/** Classify by the first sentence: later sentences often describe *future* steps ("next is a hiring manager…"). */
export function classify(text: string): Classified {
  const full = norm(unwrap(text));
  const t = full.split(/(?<=[a-z)\]])\.\s|\n/)[0] ?? full;
  const interviewers = [
    ...new Set(
      [...t.matchAll(/\b(ceo|cto|founder|cofounder|co-founder|recruiter|tech lead|hiring manager|hr|rrhh)\b/g)].map(
        (m) => m[1]!.toUpperCase().replace("RRHH", "HR").replace(/^(RECRUITER|FOUNDER|COFOUNDER|CO-FOUNDER|TECH LEAD|HIRING MANAGER)$/, (x) => x[0] + x.slice(1).toLowerCase()),
      ),
    ),
  ];
  const mk = (kind: EntryKind, interviewType: InterviewType | null, title?: string): Classified => ({
    kind,
    interviewType,
    interviewers,
    title: title ?? (interviewType ? INTERVIEW_TYPE_LABEL[interviewType] : kind === "email" ? "Message" : "Note"),
  });

  if (REJECTION.test(t) && !/^(entrevista|llamada|reunion|reu)\b/.test(t)) return mk("email", null, "Rejection");
  if (/envia url|para agendar|presentado/.test(t) && !/^(entrevista|llamada|reunion|reu|meeting)\b/.test(t)) return mk("email", null, "Message");
  if (/online assessment/.test(t)) return mk("assessment", "online_assessment");
  if (/take[- ]?(away|home)|assignment/.test(t)) {
    if (/discusion|discusión/.test(t)) return mk("interview", "take_home_review");
    if (/^entrevista/.test(t)) return mk("interview", /founder|ceo|cto/.test(t) ? "founder" : "technical_discussion", "Interview + take-home");
    return mk("assessment", "take_home");
  }
  if (INTERVIEW.test(t)) {
    // The keyword mentioned first wins ("with the recruiter … schedule the technical rounds" is a recruiter screen).
    const rules: [RegExp, InterviewType][] = [
      [/behaviou?ral/, "behavioral"],
      [/hiring manager/, "hiring_manager"],
      [/system design|product/, "system_design"],
      [/ds y cs|coding|leetcode/, "live_coding"],
      [/workshop|tecnic|tech lead/, "technical_discussion"],
      [/\bhr\b|rrhh/, "hr"],
      [/recruiter/, "recruiter_screen"],
      [/\b(ceo|cto|founder|cofounder)\b/, "founder"],
      [/in-office|onsite|challenge de todo el dia|en persona/, "onsite"],
    ];
    const hit = rules
      .map(([re, type]) => ({ type, at: t.search(re) }))
      .filter((r) => r.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    return hit ? mk("interview", hit.type) : mk("interview", "other", "Interview");
  }
  if (/oferta|offer/.test(t)) return mk("offer", null, "Offer");
  if (/presentado|agendar|escribe|email|url/.test(t)) return mk("email", null, "Message");
  return mk("note", null, "Note");
}

const STAGE_OF: Partial<Record<InterviewType, Stage>> = {
  recruiter_screen: "screening",
  hr: "hr",
  founder: "screening",
  online_assessment: "technical",
  take_home: "technical",
  take_home_review: "technical",
  live_coding: "technical",
  system_design: "technical",
  technical_discussion: "technical",
  hiring_manager: "hiring_manager",
  behavioral: "hiring_manager",
  team_fit: "final",
  onsite: "final",
  offer_call: "offer",
};
const STAGE_ORDER: Stage[] = ["none", "screening", "hr", "technical", "hiring_manager", "final", "offer"];

export function mapStatus(raw: string): ProcessStatus {
  const s = norm(raw.trim());
  if (!s) return "wishlist";
  if (s.startsWith("reject")) return "rejected";
  if (s.startsWith("ongoing")) return "ongoing";
  if (s.startsWith("ofert") || s.startsWith("offer")) return "offer";
  if (s.startsWith("discard")) return "withdrawn";
  if (s.startsWith("pause")) return "paused";
  if (s.startsWith("accept")) return "accepted";
  if (s.startsWith("ghost")) return "ghosted";
  return "ongoing";
}

function extractRole(description: string): string {
  const m = /(?:buscan|looking for)\s+(?:un |una |mas |a |an )?([^.,\n(]+?)(?:\s+(?:to|de|con|para)\b|->|[.,\n(]|$)/i.exec(description);
  const role = m?.[1]?.trim() ?? "";
  return role.length > 1 && role.length <= 40 ? role : "";
}

function extractLocation(description: string): { location: string; workMode: Process["workMode"] } {
  const d = description;
  const loc =
    /based (?:in |en )?([A-Za-zÀ-ÿ ]+?)(?:\s*-|\n|,|$)/i.exec(d)?.[1] ??
    /basados en ([A-Za-zÀ-ÿ]+)/i.exec(d)?.[1] ??
    /onsite en ([A-Za-zÀ-ÿ]+)/i.exec(d)?.[1] ??
    /\b(UK) onsite/i.exec(d)?.[1] ??
    "";
  const location = loc.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const n = norm(d);
  const workMode = /100% onsite|onsite|in-office|5 days a week|presencial/.test(n) ? "onsite" : "unknown";
  return { location, workMode };
}

function extractSalary(text: string): { min: number | null; max: number | null; notes: string } {
  const n = norm(text);
  const m =
    /salar\w*:?\s*(\d{2,3})\s*k?\s*-\s*(\d{2,3})(?:\s*\/\s*(\d{2,3}))?/.exec(n) ?? /(\d{2,3})\s*-\s*(\d{2,3})\s*k\s+de\s+salario/.exec(n);
  const notes = text
    .split("\n")
    .filter((l) => /salar|equity|rangos?|\d{2,3}\s*-\s*\d{2,3}\s*-\s*(mid|senior)/i.test(norm(l)))
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .join("\n");
  if (!m) return { min: null, max: null, notes };
  const max = Number(m[3] ?? m[2]) * 1000;
  return { min: Number(m[1]) * 1000, max, notes };
}

// ---------------------------------------------------------------- main transform

export type CsvImportReport = { warnings: string[] };

export function csvToExport(text: string, nowIso = new Date().toISOString()): { data: ExportFile; report: CsvImportReport } {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((h) => norm(h.trim())) ?? [];
  const col = (name: string) => header.indexOf(name);
  const pick = (...names: string[]) => names.map(col).find((i) => i >= 0) ?? -1;
  const [iName, iDesc, iStage, iStatus] = [pick("company", "empresa"), pick("description", "notes", "descripcion"), pick("stage", "timeline"), pick("status", "estado")];
  if (iName < 0) throw new Error("The CSV has no 'Company' (or 'Empresa') column");

  const companies = new Map<string, Company>();
  const processes: Process[] = [];
  const entries: Entry[] = [];
  const statusChanges: StatusChange[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const rawName = (row[iName] ?? "").trim();
    if (!rawName) continue;
    const roleInName = /\(([^)]+)\)\s*$/.exec(rawName)?.[1] ?? "";
    const uncertain = /\?+\s*$/.test(rawName);
    const name = rawName.replace(/\([^)]*\)\s*$/, "").replace(/\?+\s*$/, "").trim();
    const description = clean(row[iDesc] ?? "");
    const stageCell = row[iStage] ?? "";
    const status = mapStatus(row[iStatus] ?? "");
    const extra = row.slice(Math.max(iStatus, iStage) + 1).map((c) => c.trim()).filter(Boolean).join(" ");

    let company = companies.get(norm(name));
    if (!company) {
      company = { id: randomUUID(), name, website: "", summary: "", notes: unwrap(description), createdAt: nowIso, updatedAt: nowIso };
      companies.set(norm(name), company);
    }

    const pid = randomUUID();
    const segs = splitTimeline(stageCell);
    let prev: string | null = null;
    let stage: Stage = "none";
    const myEntries: Entry[] = segs.map((s) => {
      const c = classify(s.text);
      if (s.date && prev && s.date < prev) warnings.push(`${name}: date ${s.date} is earlier than the previous entry (${prev}); month typo in the spreadsheet?`);
      if (s.date) prev = s.date;
      const st = c.interviewType ? STAGE_OF[c.interviewType] : c.kind === "offer" ? "offer" : undefined;
      if (st && STAGE_ORDER.indexOf(st) > STAGE_ORDER.indexOf(stage)) stage = st;
      return {
        id: randomUUID(),
        processId: pid,
        date: s.date,
        dateIsApprox: s.dateIsApprox,
        kind: c.kind,
        interviewType: c.interviewType,
        title: c.title,
        interviewers: c.interviewers,
        rawNotes: s.text,
        summary: unwrap(s.text),
        topics: [],
        decisions: [],
        nextSteps: [],
        selfAssessment: null,
        durationMin: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    });
    if (status === "offer") stage = "offer";
    entries.push(...myEntries);

    const dated = myEntries.map((e) => e.date).filter((d): d is string => !!d);
    const first = dated[0] ?? null; // list order: robust to day/month typos in the sheet
    const last = dated.length ? [...dated].sort().at(-1)! : null;
    const { location, workMode } = extractLocation(description);
    const salary = extractSalary(`${description}\n${stageCell}`);
    const firstInterview = myEntries.find((e) => (e.kind === "interview" || e.kind === "assessment") && e.date);

    const notes = [uncertain ? "Marked with '?' in the original spreadsheet." : "", extra ? `Extra note from the spreadsheet: ${extra}` : ""].filter(Boolean).join("\n");
    const p: Process = {
      id: pid,
      companyId: company.id,
      role: roleInName || extractRole(description),
      location,
      workMode,
      source: "unknown",
      jobUrl: "",
      jobDescription: "",
      jobSummary: "",
      salaryMin: salary.min,
      salaryMax: salary.max,
      currency: "EUR",
      compensationNotes: salary.notes,
      status,
      stage,
      summary: "",
      notes,
      tags: ["importado-excel"],
      appliedAt: status === "wishlist" ? null : first,
      closedAt: isActive(status) ? null : last,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    processes.push(p);

    // Reconstruct a plausible status history for analytics.
    const sc = (from: ProcessStatus | null, to: ProcessStatus, at: string | null, reason = "", entryId: string | null = null) => {
      statusChanges.push({ id: randomUUID(), processId: pid, from, to, at: at ?? nowIso.slice(0, 10), reason, entryId, createdAt: nowIso });
      return to;
    };
    if (status === "wishlist") {
      sc(null, "wishlist", nowIso.slice(0, 10), "Imported from spreadsheet");
      continue;
    }
    let cur = sc(null, "applied", first, "Imported from spreadsheet");
    if (firstInterview) cur = sc(cur, "ongoing", firstInterview.date);
    if (status === "offer") {
      const offerEntry = [...myEntries].reverse().find((e) => /oferta|offer/i.test(e.rawNotes));
      cur = sc(cur, "offer", offerEntry?.date ?? last, "", offerEntry?.id ?? null);
    } else if (status !== cur) {
      const lastEntry = myEntries.at(-1);
      sc(cur, status, last, lastEntry ? lastEntry.summary.split("\n")[0]!.slice(0, 200) : "", lastEntry?.id ?? null);
    }
  }

  return {
    data: {
      app: "pathly",
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: nowIso,
      companies: [...companies.values()],
      processes,
      entries,
      statusChanges,
    },
    report: { warnings },
  };
}
