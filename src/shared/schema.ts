import { z } from "zod";

/**
 * Pathly data model — single source of truth.
 * Used by the server (DB + validation), the web app (types) and import/export.
 * Bump EXPORT_SCHEMA_VERSION and add a migration in server/exportImport.ts when
 * the exported shape changes.
 */

export const EXPORT_SCHEMA_VERSION = 1;

export const PROCESS_STATUSES = [
  "wishlist",
  "applied",
  "ongoing",
  "paused",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export const ProcessStatus = z.enum(PROCESS_STATUSES);
export type ProcessStatus = z.infer<typeof ProcessStatus>;

export const ACTIVE_STATUSES: readonly ProcessStatus[] = ["wishlist", "applied", "ongoing", "paused", "offer"];
export const isActive = (s: ProcessStatus) => ACTIVE_STATUSES.includes(s);

export const STAGES = ["none", "screening", "hr", "technical", "hiring_manager", "final", "offer"] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

export const INTERVIEW_TYPES = [
  "recruiter_screen",
  "hr",
  "founder",
  "hiring_manager",
  "live_coding",
  "online_assessment",
  "take_home",
  "take_home_review",
  "system_design",
  "technical_discussion",
  "behavioral",
  "team_fit",
  "onsite",
  "offer_call",
  "other",
] as const;
export const InterviewType = z.enum(INTERVIEW_TYPES);
export type InterviewType = z.infer<typeof InterviewType>;

export const ENTRY_KINDS = ["application", "interview", "assessment", "email", "offer", "note"] as const;
export const EntryKind = z.enum(ENTRY_KINDS);
export type EntryKind = z.infer<typeof EntryKind>;

export const WORK_MODES = ["remote", "hybrid", "onsite", "unknown"] as const;
export const WorkMode = z.enum(WORK_MODES);

export const SOURCES = ["linkedin", "referral", "recruiter", "direct", "job_board", "network", "other", "unknown"] as const;
export const Source = z.enum(SOURCES);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const isoDateTime = z.string().datetime({ offset: true });
const id = z.string().min(1);

export const Company = z.object({
  id,
  name: z.string().min(1),
  website: z.string().default(""),
  /** AI-generated (and editable) brief: what they do, product, funding, stack… Markdown. */
  summary: z.string().default(""),
  /** The user's own notes about the company. Markdown. */
  notes: z.string().default(""),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Company = z.infer<typeof Company>;

export const Process = z.object({
  id,
  companyId: id,
  role: z.string().default(""),
  location: z.string().default(""),
  workMode: WorkMode.default("unknown"),
  source: Source.default("unknown"),
  jobUrl: z.string().default(""),
  /** Raw job posting text (pasted or fetched). */
  jobDescription: z.string().default(""),
  /** AI-generated (and editable) brief of the role. Markdown. */
  jobSummary: z.string().default(""),
  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  currency: z.string().default("EUR"),
  compensationNotes: z.string().default(""),
  status: ProcessStatus,
  stage: Stage.default("none"),
  /** Living summary of where the process stands. Markdown. */
  summary: z.string().default(""),
  notes: z.string().default(""),
  tags: z.array(z.string()).default([]),
  appliedAt: isoDate.nullable().default(null),
  closedAt: isoDate.nullable().default(null),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Process = z.infer<typeof Process>;

export const Entry = z.object({
  id,
  processId: id,
  /** null when the original record had no date at all. */
  date: isoDate.nullable(),
  /** True when the date was inferred (e.g. "a few days later"). */
  dateIsApprox: z.boolean().default(false),
  kind: EntryKind,
  interviewType: InterviewType.nullable().default(null),
  title: z.string().default(""),
  interviewers: z.array(z.string()).default([]),
  /** What the user wrote, verbatim. Never overwritten by the AI. */
  rawNotes: z.string().default(""),
  /** Cleaned-up version (AI or user). Markdown. */
  summary: z.string().default(""),
  topics: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  /** 1–5: how the user felt it went. */
  selfAssessment: z.number().int().min(1).max(5).nullable().default(null),
  durationMin: z.number().int().positive().nullable().default(null),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Entry = z.infer<typeof Entry>;

export const StatusChange = z.object({
  id,
  processId: id,
  from: ProcessStatus.nullable(),
  to: ProcessStatus,
  at: isoDate,
  reason: z.string().default(""),
  entryId: id.nullable().default(null),
  createdAt: isoDateTime,
});
export type StatusChange = z.infer<typeof StatusChange>;

export const ExportFile = z.object({
  app: z.literal("pathly"),
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDateTime,
  companies: z.array(Company),
  processes: z.array(Process),
  entries: z.array(Entry),
  statusChanges: z.array(StatusChange),
});
export type ExportFile = z.infer<typeof ExportFile>;

// ---------- API inputs ----------

const omitMeta = { id: true, createdAt: true, updatedAt: true } as const;

export const CompanyInput = Company.omit(omitMeta).partial().extend({ name: z.string().min(1) });
export type CompanyInput = z.infer<typeof CompanyInput>;

export const ProcessInput = Process.omit(omitMeta).partial().extend({
  companyId: id.optional(),
  /** Create the company on the fly when companyId is not given. */
  company: CompanyInput.optional(),
  status: ProcessStatus.default("applied"),
});
export type ProcessInput = z.infer<typeof ProcessInput>;

export const ProcessPatch = Process.omit({ ...omitMeta, status: true }).partial();
export type ProcessPatch = z.infer<typeof ProcessPatch>;

export const EntryInput = Entry.omit({ ...omitMeta, processId: true }).partial().extend({
  kind: EntryKind.default("interview"),
  date: isoDate.nullable().default(null),
});
export type EntryInput = z.infer<typeof EntryInput>;

export const StatusChangeInput = z.object({
  to: ProcessStatus,
  at: isoDate.optional(),
  reason: z.string().default(""),
  entryId: id.nullable().default(null),
});
export type StatusChangeInput = z.infer<typeof StatusChangeInput>;

/** Entry + optional process updates, saved atomically after the AI review step. */
export const EntryWithUpdates = z.object({
  entry: EntryInput,
  processSummary: z.string().optional(),
  stage: Stage.optional(),
  status: StatusChangeInput.optional(),
});
export type EntryWithUpdates = z.infer<typeof EntryWithUpdates>;

// ---------- LLM settings ----------

export const LlmSettings = z.object({
  provider: z.enum(["anthropic", "ollama"]).default("anthropic"),
  anthropicModel: z.string().default("claude-sonnet-5-5"),
  anthropicWebSearch: z.boolean().default(true),
  ollamaUrl: z.string().default("http://localhost:11434"),
  ollamaModel: z.string().default("gemma4"),
  /** Language for generated text. "auto" = same as the input. */
  language: z.enum(["auto", "es", "en"]).default("es"),
});
export type LlmSettings = z.infer<typeof LlmSettings>;

// ---------- Full process view ----------

export type ProcessWithCompany = Process & { company: Company; lastEntryDate: string | null; entryCount: number };
export type ProcessDetail = ProcessWithCompany & { entries: Entry[]; statusChanges: StatusChange[] };
