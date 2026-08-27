export type FieldAdminKind = "permit" | "submittal" | "shop_drawing" | "rfi";

export interface FieldPermit {
  id: string;
  project_id: string;
  permit_name: string;
  permit_type: string | null;
  jurisdiction: string | null;
  responsible_party: string | null;
  submitted_date: string | null;
  status: "Not Submitted" | "Submitted" | "Under Review" | "Approved" | "Rejected";
  inspection_status: "Not Scheduled" | "Scheduled" | "Passed" | "Failed" | null;
  expiration_date: string | null;
  document_url: string | null;
  notes: string | null;
  is_open: boolean;
  resolved_at: string | null;
}

export interface FieldSubmittal {
  id: string;
  project_id: string;
  submittal_name: string;
  spec_section: string | null;
  submitted_by: string | null;
  reviewer: string | null;
  submitted_date: string | null;
  due_date: string | null;
  status: "Pending" | "Approved" | "Approved as Noted" | "Rejected" | "Resubmit Required";
  document_url: string | null;
  notes: string | null;
  is_open: boolean;
  resolved_at: string | null;
}

export interface FieldShopDrawing {
  id: string;
  project_id: string;
  drawing_name: string;
  trade: string | null;
  revision_number: string | null;
  submitted_date: string | null;
  due_date: string | null;
  status: "Pending" | "Approved" | "Approved as Noted" | "Rejected" | "Resubmit Required";
  document_url: string | null;
  notes: string | null;
  is_open: boolean;
  resolved_at: string | null;
}

export interface FieldRfi {
  id: string;
  project_id: string;
  rfi_number: string | null;
  subject: string;
  submitted_by: string | null;
  submitted_to: string | null;
  submitted_date: string | null;
  response_date: string | null;
  status: "Open" | "Answered" | "Closed";
  response_summary: string | null;
  document_url: string | null;
  notes: string | null;
  is_open: boolean;
  resolved_at: string | null;
}

export const REVIEW_STATUSES = ["Pending", "Approved", "Approved as Noted", "Rejected", "Resubmit Required"] as const;
export const PERMIT_STATUSES = ["Not Submitted", "Submitted", "Under Review", "Approved", "Rejected"] as const;
export const INSPECTION_STATUSES = ["Not Scheduled", "Scheduled", "Passed", "Failed"] as const;
export const RFI_STATUSES = ["Open", "Answered", "Closed"] as const;

export function statusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("approved") && !s.includes("noted")) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (s === "closed" || s === "answered" || s === "passed") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (s.includes("rejected") || s === "failed") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (s.includes("resubmit") || s === "under review" || s === "open") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  if (s === "submitted" || s === "scheduled") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  return "bg-muted text-muted-foreground";
}
