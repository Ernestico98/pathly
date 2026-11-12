import type { EntryKind, InterviewType, ProcessStatus, Stage } from "./schema";

export const STATUS_LABEL: Record<ProcessStatus, string> = {
  wishlist: "Wishlist",
  applied: "Aplicado",
  ongoing: "En curso",
  paused: "Pausado",
  offer: "Oferta",
  accepted: "Aceptado",
  declined: "Oferta rechazada",
  rejected: "Rechazado",
  withdrawn: "Descartado",
  ghosted: "Ghosted",
};

export const STATUS_HELP: Record<ProcessStatus, string> = {
  wishlist: "Me interesa, aún no he aplicado",
  applied: "Aplicado, sin respuesta todavía",
  ongoing: "En entrevistas",
  paused: "Congelado por ellos o por mí",
  offer: "Oferta recibida",
  accepted: "Acepté la oferta",
  declined: "Yo rechacé la oferta",
  rejected: "La empresa me descartó",
  withdrawn: "Yo abandoné el proceso",
  ghosted: "Sin respuesta",
};

export const STAGE_LABEL: Record<Stage, string> = {
  none: "—",
  screening: "Screening",
  hr: "HR",
  technical: "Técnica",
  hiring_manager: "Hiring manager",
  final: "Final",
  offer: "Oferta",
};

export const INTERVIEW_TYPE_LABEL: Record<InterviewType, string> = {
  recruiter_screen: "Screening con recruiter",
  hr: "HR / cultura",
  founder: "Founder / CEO / CTO",
  hiring_manager: "Hiring manager",
  live_coding: "Live coding",
  online_assessment: "Online assessment",
  take_home: "Take-home",
  take_home_review: "Revisión de take-home",
  system_design: "System design",
  technical_discussion: "Técnica (conversación)",
  behavioral: "Behavioral",
  team_fit: "Team fit",
  onsite: "Onsite / día en oficina",
  offer_call: "Llamada de oferta",
  other: "Otra",
};

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  application: "Aplicación",
  interview: "Entrevista",
  assessment: "Prueba",
  email: "Email / mensaje",
  offer: "Oferta",
  note: "Nota",
};

export const WORK_MODE_LABEL = { remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial", unknown: "—" } as const;

export const SOURCE_LABEL = {
  linkedin: "LinkedIn",
  referral: "Referido",
  recruiter: "Recruiter",
  direct: "Aplicación directa",
  job_board: "Portal de empleo",
  network: "Contactos",
  other: "Otro",
  unknown: "—",
} as const;
