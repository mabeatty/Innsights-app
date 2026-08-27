export type ContractDraftStatus =
  | "Awaiting Draft"
  | "Draft Ready"
  | "Under PM Review"
  | "Ready to Generate"
  | "Sent for Execution"
  | "Executed"
  | "Cancelled";

export const CONTRACT_DRAFT_STATUSES: ContractDraftStatus[] = [
  "Awaiting Draft",
  "Draft Ready",
  "Under PM Review",
  "Ready to Generate",
  "Sent for Execution",
  "Executed",
  "Cancelled",
];

export type TemplateType = "PO" | "Subcontract";

export interface ContractTemplate {
  id: string;
  org_id: string;
  template_type: TemplateType;
  template_name: string;
  file_url: string;
  file_path: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface ContractDraft {
  id: string;
  project_id: string;
  vendor_bid_item_id: string | null;
  vendor_quote_id: string | null;
  template_id: string | null;
  status: ContractDraftStatus;
  vendor_name: string | null;
  contract_amount: number | null;
  scope_of_work: string | null;
  start_date: string | null;
  completion_date: string | null;
  payment_terms: string | null;
  special_terms: string | null;
  extracted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  final_document_url: string | null;
  sent_at: string | null;
  executed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function draftStatusPillClass(status: ContractDraftStatus): string {
  switch (status) {
    case "Executed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Sent for Execution":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Ready to Generate":
    case "Under PM Review":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "Cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}
