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
    ? "Escribe siempre en español."
    : s.language === "en"
      ? "Always write in English."
      : "Escribe en el mismo idioma que use el usuario en sus notas.";

const SYSTEM_BASE = `Eres el asistente de Pathly, una herramienta personal para llevar el seguimiento de procesos de selección (entrevistas de trabajo) de un ingeniero de software.
Tu trabajo es ordenar y clarificar lo que el usuario escribe, sin inventar hechos. Si algo no aparece en las notas, no lo supongas: déjalo vacío o null.
Reglas:
- No conviertas expectativas en hechos: "me dirán si paso" NO es "avanza a la siguiente ronda".
- Respeta cifras y monedas tal como las escribe el usuario (si dice 75k sin moneda, no añadas $ ni €).
- Los temas, decisiones y siguientes pasos de una entrada salen SOLO de las notas de esa entrada, no del contexto previo.
- Escribe en segunda persona o impersonal, sin adornos ("Se llevó a cabo…" sobra). Sé conciso y concreto; prioriza lo que le servirá al usuario para preparar la siguiente entrevista.`;

// ---------------------------------------------------------------- entry

export const EntryDraft = z.object({
  title: z.string().describe("Título corto de la entrada, p. ej. 'Entrevista técnica con el CTO'"),
  kind: EntryKind,
  interviewType: InterviewType.nullable().describe("Solo si kind es interview/assessment"),
  interviewers: z.array(z.string()).describe("Nombres o roles de los entrevistadores mencionados"),
  summary: z.string().describe("Resumen claro y bien redactado en Markdown (3-8 frases o viñetas)"),
  topics: z.array(z.string()).describe("Temas tratados y preguntas que hicieron"),
  decisions: z.array(z.string()).describe("Decisiones tomadas por cualquiera de las partes (incluye lo que dijo el usuario sobre salario, fechas, etc.)"),
  nextSteps: z.array(z.string()).describe("Siguientes pasos acordados o pendientes"),
  selfAssessment: z.number().int().min(1).max(5).nullable().describe("1-5 según cómo dice el usuario que le fue; null si no lo dice"),
  suggestedStatus: ProcessStatus.nullable().describe("Nuevo estado del proceso si las notas lo implican; null si no cambia"),
  statusReason: z.string().describe("Motivo breve del cambio de estado, o cadena vacía"),
  suggestedStage: Stage.nullable().describe("Fase en la que queda el proceso tras esta entrada; null si no cambia"),
  processSummary: z.string().describe("Resumen ACTUALIZADO del proceso completo en Markdown: en qué punto está, qué ha pasado, qué queda y cualquier dato clave (salario, ubicación, contactos)"),
});
export type EntryDraft = z.infer<typeof EntryDraft>;

function processContext(p: ProcessDetail, maxEntries = 8): string {
  const entries = p.entries.slice(-maxEntries).map((e) => `- ${e.date ?? "sin fecha"} · ${e.title || e.kind}: ${e.summary || e.rawNotes}`);
  return [
    `Empresa: ${p.company.name}`,
    p.role && `Puesto: ${p.role}`,
    `Estado actual: ${p.status} (${STATUS_LABEL[p.status]}) · Fase: ${p.stage} (${STAGE_LABEL[p.stage]})`,
    p.company.summary && `Sobre la empresa:\n${p.company.summary.slice(0, 2000)}`,
    p.company.notes && `Notas del usuario sobre la empresa:\n${p.company.notes.slice(0, 2000)}`,
    p.summary && `Resumen actual del proceso:\n${p.summary}`,
    entries.length ? `Últimas entradas de la cronología:\n${entries.join("\n")}` : "Aún no hay entradas en la cronología.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function draftEntry(llm: LlmProvider, s: LlmSettings, p: ProcessDetail, rawNotes: string, date: string | null) {
  return llm.json({
    system: `${SYSTEM_BASE}\n${lang(s)}`,
    schema: EntryDraft,
    prompt: `Contexto del proceso:\n${processContext(p)}\n\n---\nNueva entrada${date ? ` (fecha ${date})` : ""}. Notas en bruto del usuario:\n"""\n${rawNotes}\n"""\n\nEstructura esta entrada. Estados válidos: ${Object.entries(STATUS_LABEL).map(([k, v]) => `${k}=${v}`).join(", ")}. Sugiere suggestedStatus solo si las notas indican un cambio (p. ej. rechazo → rejected, oferta → offer, primera entrevista desde applied → ongoing).`,
  });
}

// ---------------------------------------------------------------- process summary

export async function regenerateProcessSummary(llm: LlmProvider, s: LlmSettings, p: ProcessDetail) {
  return llm.text({
    system: `${SYSTEM_BASE}\n${lang(s)}`,
    prompt: `${processContext(p, 50)}\n\n---\nEscribe un resumen actualizado del proceso en Markdown (máx. ~150 palabras): en qué punto está, qué ha pasado, señales positivas/negativas y qué queda pendiente. Devuelve solo el resumen.`,
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
    system: `${SYSTEM_BASE}\n${lang(s)}\nAhora preparas fichas de empresa para repasar antes de una entrevista. Distingue claramente lo verificado de lo que no lo está; si no encuentras un dato, di "desconocido" en lugar de inventarlo.`,
    prompt: `Prepara una ficha de la empresa **${input.name}**${input.website ? ` (${input.website})` : ""}.
${input.pageText ? `\nContenido de su web:\n"""\n${input.pageText.slice(0, 30_000)}\n"""\n` : ""}${input.notes ? `\nNotas que ya tiene el usuario:\n"""\n${input.notes}\n"""\n` : ""}
Formato Markdown con estas secciones (omite las que no tengan información):
## A qué se dedica
## Producto y clientes
## Etapa, financiación y tamaño
## Tecnología
## Cultura y equipo
## Puntos para la entrevista
(preguntas inteligentes que el usuario podría hacer y cosas que conviene tener presentes)

Devuelve solo la ficha, sin preámbulo.`,
  });
}

// ---------------------------------------------------------------- job brief

export const JobBrief = z.object({
  role: z.string().describe("Título del puesto"),
  location: z.string(),
  workMode: WorkMode,
  salaryMin: z.number().nullable().describe("Salario anual mínimo si aparece, en unidades (no miles)"),
  salaryMax: z.number().nullable(),
  currency: z.string().describe("Código ISO, p. ej. EUR, USD, GBP"),
  summary: z
    .string()
    .describe(
      "Resumen del puesto en Markdown con secciones: ## Qué harías, ## Requisitos, ## Stack, ## Condiciones, ## Señales / dudas a aclarar",
    ),
});
export type JobBrief = z.infer<typeof JobBrief>;

export async function jobBrief(llm: LlmProvider, s: LlmSettings, input: { company?: string; jobText: string }) {
  return llm.json({
    system: `${SYSTEM_BASE}\n${lang(s)}`,
    schema: JobBrief,
    prompt: `Oferta de empleo${input.company ? ` de ${input.company}` : ""}:\n"""\n${input.jobText.slice(0, 40_000)}\n"""\n\nExtrae los datos y resume el puesto. Si un dato no aparece usa "" / null / "unknown".`,
  });
}
