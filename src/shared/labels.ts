import type { EntryKind, InterviewType, ProcessStatus, Stage } from "./schema";

export const STATUS_LABEL: Record<ProcessStatus, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  ongoing: "In progress",
  paused: "Paused",
  offer: "Offer",
  accepted: "Accepted",
  declined: "Offer declined",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

export const STATUS_HELP: Record<ProcessStatus, string> = {
  wishlist: "Interested, haven't applied yet",
  applied: "Applied, no response yet",
  ongoing: "In interviews",
  paused: "On hold, by them or by me",
  offer: "Offer received",
  accepted: "I accepted the offer",
  declined: "I declined the offer",
  rejected: "The company rejected me",
  withdrawn: "I dropped out of the process",
  ghosted: "No response",
};

export const STAGE_LABEL: Record<Stage, string> = {
  none: "—",
  screening: "Screening",
  hr: "HR",
  technical: "Technical",
  hiring_manager: "Hiring manager",
  final: "Final",
  offer: "Offer",
};

export const INTERVIEW_TYPE_LABEL: Record<InterviewType, string> = {
  recruiter_screen: "Recruiter screen",
  hr: "HR / culture",
  founder: "Founder / CEO / CTO",
  hiring_manager: "Hiring manager",
  live_coding: "Live coding",
  online_assessment: "Online assessment",
  take_home: "Take-home",
  take_home_review: "Take-home review",
  system_design: "System design",
  technical_discussion: "Technical (discussion)",
  behavioral: "Behavioral",
  team_fit: "Team fit",
  onsite: "Onsite / office day",
  offer_call: "Offer call",
  other: "Other",
};

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  application: "Application",
  interview: "Interview",
  assessment: "Assessment",
  email: "Email / message",
  offer: "Offer",
  note: "Note",
};

export const WORK_MODE_LABEL = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "—" } as const;

export const SOURCE_LABEL = {
  linkedin: "LinkedIn",
  referral: "Referral",
  recruiter: "Recruiter",
  direct: "Direct application",
  job_board: "Job board",
  network: "Network",
  other: "Other",
  unknown: "—",
} as const;
