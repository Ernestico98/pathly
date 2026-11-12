import type {
  Company,
  CompanyInput,
  Entry,
  EntryWithUpdates,
  LlmSettings,
  ProcessDetail,
  ProcessInput,
  ProcessPatch,
  ProcessWithCompany,
  StatusChangeInput,
} from "../shared/schema";
import type { Analytics } from "../../server/analytics";
import type { EntryDraft, JobBrief } from "../../server/llm/tasks";

export type { Analytics, EntryDraft, JobBrief };

export class ApiError extends Error {}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

export type SettingsResponse = { settings: LlmSettings; anthropicKeyPresent: boolean; ollamaModels: string[] };

export const api = {
  processes: () => req<ProcessWithCompany[]>("GET", "/processes"),
  process: (id: string) => req<ProcessDetail>("GET", `/processes/${id}`),
  createProcess: (input: Partial<ProcessInput>) => req<ProcessDetail>("POST", "/processes", input),
  updateProcess: (id: string, patch: ProcessPatch) => req<ProcessDetail>("PATCH", `/processes/${id}`, patch),
  deleteProcess: (id: string) => req<void>("DELETE", `/processes/${id}`),
  changeStatus: (id: string, input: Partial<StatusChangeInput> & Pick<StatusChangeInput, "to">) =>
    req<ProcessDetail>("POST", `/processes/${id}/status`, input),
  addEntry: (id: string, input: EntryWithUpdates) => req<ProcessDetail>("POST", `/processes/${id}/entries`, input),
  updateEntry: (id: string, patch: Partial<Entry>) => req<Entry>("PATCH", `/entries/${id}`, patch),
  deleteEntry: (id: string) => req<void>("DELETE", `/entries/${id}`),
  companies: () => req<Company[]>("GET", "/companies"),
  updateCompany: (id: string, patch: Partial<CompanyInput>) => req<Company>("PATCH", `/companies/${id}`, patch),

  entryDraft: (processId: string, rawNotes: string, date: string | null) =>
    req<EntryDraft>("POST", "/ai/entry-draft", { processId, rawNotes, date }),
  processSummary: (processId: string) => req<{ summary: string }>("POST", "/ai/process-summary", { processId }),
  companyBrief: (input: { name: string; website?: string; notes?: string }) =>
    req<{ summary: string; warning?: string }>("POST", "/ai/company-brief", input),
  jobBrief: (input: { url?: string; text?: string; company?: string }) =>
    req<JobBrief & { jobText: string }>("POST", "/ai/job-brief", input),

  settings: () => req<SettingsResponse>("GET", "/settings"),
  saveSettings: (s: LlmSettings) => req<SettingsResponse>("PUT", "/settings", s),
  testLlm: () => req<{ provider: string; ok: boolean; ms: number }>("POST", "/settings/test"),

  analytics: () => req<Analytics>("GET", "/analytics"),
  importJson: (data: unknown, mode: "merge" | "replace") =>
    req<{ inserted: number; updated: number; skipped: number }>("POST", `/import?mode=${mode}`, data),
};
