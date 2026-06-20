export type InvoiceStatus =
  | "Pending"
  | "Pending — Needs Review"
  | "Approved"
  | "Rejected"
  | "More Info Requested"
  | "Partially Approved"
  | "Routed for Payment";

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "Pending",
  "Pending — Needs Review",
  "Approved",
  "Partially Approved",
  "Rejected",
  "More Info Requested",
  "Routed for Payment",
];

export const INVOICE_TYPES = [
  "Hard Cost — GC Draw",
  "Hard Cost — Procurement",
  "Soft Cost",
  "FF&E",
  "OS&E",
  "Other",
] as const;

export const APPROVER_EMAIL = "marc.alex.beatty@gmail.com";

// Cost Type options for the Upload Invoice modal (spec).
export const COST_TYPES = ["Hard Cost", "Soft Cost", "FF&E", "OS&E", "Other"] as const;

// The three approval-chain roles, in display order.
export type ApproverRole = "project_manager" | "treasury" | "project_lead";
export const APPROVER_ROLES: { key: ApproverRole; label: string }[] = [
  { key: "project_manager", label: "Project Manager" },
  { key: "treasury", label: "Treasury" },
  { key: "project_lead", label: "Project Lead" },
];

export type ApprovalDecision = "Pending" | "Approved" | "Rejected";

export interface InvoiceApproval {
  id: string;
  invoice_id: string;
  approver_id: string | null;
  approver_role: ApproverRole;
  status: ApprovalDecision;
  notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ProjectApprover {
  id: string;
  project_id: string;
  role: ApproverRole;
  approver_id: string | null;
}

export interface Invoice {
  id: string;
  organization_id: string;
  project_id: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  amount: number | null;
  retainage_amount: number | null;
  net_amount: number | null;
  partial_approved_amount: number | null;
  type: string | null;
  budget_line_item: string | null;
  status: InvoiceStatus;
  submitted_by: string | null;
  submitted_by_email: string | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  more_info_request: string | null;
  notes: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  source: string;
  needs_review: boolean;
  routed_to: string | null;
  routed_to_email: string | null;
  routed_at: string | null;
  ai_extracted_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  projects?: { id: string; name: string } | null;
}

export function statusBadgeClasses(status: string): string {
  switch (status) {
    case "Approved":
      return "bg-green-100 text-green-800 border-green-200";
    case "Rejected":
      return "bg-red-100 text-red-800 border-red-200";
    case "In Approval":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "More Info Requested":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Pending Review":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "Partially Approved":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "Routed for Payment":
      return "bg-slate-200 text-slate-800 border-slate-300";
    case "Pending — Needs Review":
      return "bg-amber-100 text-amber-900 border-amber-200";
    default:
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
  }
}

export const formatCurrency = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
