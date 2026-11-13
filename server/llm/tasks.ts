import { z } from "zod";
import { STAGE_LABEL, STATUS_LABEL } from "../../src/shared/labels";
import {
  EntryKind,
  InterviewType,
  type LlmSettings,
  type ProcessDetail,
  ProcessStatus,
  Stage,
  WorkMode,
} from "../../src/shared/schema";
import type { LlmProvider } from "./provider";

const lang = (s: LlmSettings) =>
  s.language === "es"
    ? "Always write in Spanish."
    : s.language === "en"
      ? "Always write in English."
      : "Write in the same language the user uses in their notes.";

const SYSTEM_BASE = `You are the assistant inside Pathly, a personal tool a software engineer uses to track job application processes and interviews.
Your job is to organise and clarify what the user writes, without inventing facts. If something isn't in the notes, don't assume it: leave it empty or null.
Rules:
- Don't turn expectations into facts: "they'll tell me if I pass" is NOT "advances to the next round".
- Keep figures and currencies exactly as the user wrote them (if they say 75k with no currency, don't add $ or €).
- An entry's topics, decisions and next steps come ONLY from that entry's notes, not from earlier context.
- Write in the first person, as if they were the user's own notes ("I spoke with the CTO…"), never "the candidate". No filler. Keep technical terms as written (evals, RAG, queues…).
- Be conservative with statuses and stages: suggest a change only when the notes clearly say so; a first conversation with a CTO/CEO is not the final stage. Be concise and concrete; prioritise what will help the user prepare for the next interview.`;

// ---------------------------------------------------------------- entry

export const EntryDraft = z.object({
  title: z.string().describe("Short entry title, e.g. 'Technical interview with the CTO'"),
  kind: EntryKind,
  interviewType: InterviewType.nullable().describe("Only when kind is interview/assessment"),
  interviewers: z.array(z.string()).describe("Names or roles of the interviewers mentioned"),
  summary: z.string().describe("Clear, well-written Markdown summary (3-8 sentences or bullets)"),
  topics: z.array(z.string()).describe("Topics covered and questions asked"),
  decisions: z.array(z.string()).describe("Decisions made by either side (including what the user said about salary, dates, etc.)"),
  nextSteps: z.array(z.string()).describe("Agreed or pending next steps"),
  selfAssessment: z.number().int().min(1).max(5).nullable().describe("1-5 based on how the user says it went; null if they don't say"),
  suggestedStatus: ProcessStatus.nullable().describe("New process status if the notes imply one; null if unchanged"),
  statusReason: z.string().describe("Short reason for the status change, or an empty string"),
  suggestedStage: Stage.nullable().describe("Stage the process is at after this entry; null if unchanged"),
  processSummary: z
    .string()
    .describe("UPDATED Markdown summary of the whole process: where it stands, what has happened, what's left, and key facts (salary, location, contacts)"),
});
export type EntryDraft = z.infer<typeof EntryDraft>;

function processContext(p: ProcessDetail, maxEntries = 8): string {
  const entries = p.entries.slice(-maxEntries).map((e) => `- ${e.date ?? "no date"} · ${e.title || e.kind}: ${e.summary || e.rawNotes}`);
  return [
    `Company: ${p.company.name}`,
    p.role && `Role: ${p.role}`,
    `Current status: ${p.status} (${STATUS_LABEL[p.status]}) · Stage: ${p.stage} (${STAGE_LABEL[p.stage]})`,
    p.company.summary && `About the company:\n${p.company.summary.slice(0, 2000)}`,
    p.company.notes && `User's notes about the company:\n${p.company.notes.slice(0, 2000)}`,
    p.summary && `Current process summary:\n${p.summary}`,
    entries.length ? `Latest timeline entries:\n${entries.join("\n")}` : "No timeline entries yet.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function draftEntry(llm: LlmProvider, s: LlmSettings, p: ProcessDetail, rawNotes: string, date: string | null) {
  return llm.json({
    system: `${SYSTEM_BASE}\n${lang(s)}`,
    schema: EntryDraft,
    prompt: `Process context:\n${processContext(p)}\n\n---\nNew entry${date ? ` (date ${date})` : ""}. The user's raw notes:\n"""\n${rawNotes}\n"""\n\nStructure this entry. Valid statuses: ${Object.entries(STATUS_LABEL).map(([k, v]) => `${k}=${v}`).join(", ")}. Only suggest suggestedStatus when the notes indicate a change (e.g. rejection → rejected, offer → offer, first interview while applied → ongoing).`,
  });
}

// ---------------------------------------------------------------- process summary

export async function regenerateProcessSummary(llm: LlmProvider, s: LlmSettings, p: ProcessDetail) {
  return llm.text({
    system: `${SYSTEM_BASE}\n${lang(s)}`,
    prompt: `${processContext(p, 50)}\n\n---\nWrite an up-to-date Markdown summary of the process (max ~150 words): where it stands, what has happened, positive/negative signals and what's pending. Return only the summary.`,
  });
}

// ---------------------------------------------------------------- company brief

export async function companyBrief(
  llm: LlmProvider,
  s: LlmSettings,
  input: { name: string; website?: string; notes?: string; pageText?: string },
) {
  return llm.text({
    webSearch: true,
    system: `${SYSTEM_BASE}\n${lang(s)}\nYou are now writing company briefs to review before an interview. Clearly separate what is verified from what isn't; if you can't find a fact, say "unknown" instead of making it up.`,
    prompt: `Write a brief about the company **${input.name}**${input.website ? ` (${input.website})` : ""}.
${input.pageText ? `\nContent of their website:\n"""\n${input.pageText.slice(0, 30_000)}\n"""\n` : ""}${input.notes ? `\nNotes the user already has:\n"""\n${input.notes}\n"""\n` : ""}
Markdown with these sections (omit any without information):
## What they do
## Product and customers
## Stage, funding and size
## Technology
## Culture and team
## Interview pointers
(smart questions the user could ask and things worth keeping in mind)

Return only the brief, no preamble.`,
  });
}

// ---------------------------------------------------------------- job brief

export const JobBrief = z.object({
  role: z.string().describe("Job title"),
  location: z.string(),
  workMode: WorkMode,
  salaryMin: z.number().nullable().describe("Minimum yearly salary if stated, in units (not thousands)"),
  salaryMax: z.number().nullable(),
  currency: z.string().describe("ISO code, e.g. EUR, USD, GBP"),
  summary: z
    .string()
    .describe("Markdown role summary with sections: ## What you'd do, ## Requirements, ## Stack, ## Conditions, ## Signals / questions to clarify"),
});
export type JobBrief = z.infer<typeof JobBrief>;

export async function jobBrief(llm: LlmProvider, s: LlmSettings, input: { company?: string; jobText: string }) {
  return llm.json({
    system: `${SYSTEM_BASE}\n${lang(s)}`,
    schema: JobBrief,
    prompt: `Job posting${input.company ? ` at ${input.company}` : ""}:\n"""\n${input.jobText.slice(0, 40_000)}\n"""\n\nExtract the data and summarise the role. If something isn't stated use "" / null / "unknown".`,
  });
}
