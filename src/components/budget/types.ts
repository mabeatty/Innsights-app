export interface BudgetRow {
  id: string;
  division_number: string;
  division_name: string;
  cost_type: string;
  scheduled_value: number;
  notes: string | null;
}

export type BillingMode = "project_rollup" | "contract_native";

export type RetainageMode = "default" | "custom" | "exempt";

export type ContractType = "Prime" | "Subcontract" | "Owner-Direct" | "Supply";

export type ContractStatus = "Draft" | "Active" | "Closed";

export interface Contract {
  id: string;
  org_id: string;
  project_id: string;
  vendor_id: string | null;
  parent_contract_id: string | null;
  contract_type: ContractType;
  contract_number: string;
  scope_summary: string;
  original_amount: number;
  default_retainage_percent: number;
  executed_date: string | null;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const CONTRACT_TYPES: ContractType[] = ["Prime", "Subcontract", "Owner-Direct", "Supply"];

export const CONTRACT_STATUSES: ContractStatus[] = ["Draft", "Active", "Closed"];

export const RETAINAGE_MODES: RetainageMode[] = ["default", "custom", "exempt"];

export interface BudgetTransaction {
  id: string;
  project_id: string;
  contract_id: string | null;
  transaction_type: string;
  transaction_number: number;
  date: string;
  payee: string;
  division_number: string;
  division_name: string;
  description: string;
  amount: number;
  retainage_percent: number;
  retainage_amount: number;
  retainage_mode: RetainageMode;
  net_amount: number;
  status: string;
  notes: string | null;
  document_url: string | null;
  draw_id: string | null;
  created_at: string;
  updated_at: string;
}

export const TRANSACTION_TYPES = [
  "Contractor Pay Application",
  "Vendor Invoice",
  "Change Order",
  "Owner Draw",
] as const;

export const TRANSACTION_STATUSES = ["Pending", "Approved", "Paid", "Deferred"] as const;

export const HARD_DIVISIONS = [
  { number: "01", name: "General Requirements" },
  { number: "02", name: "Existing Conditions" },
  { number: "03", name: "Concrete" },
  { number: "04", name: "Masonry" },
  { number: "05", name: "Metals" },
  { number: "06", name: "Wood, Plastics & Composites" },
  { number: "07", name: "Thermal & Moisture Protection" },
  { number: "08", name: "Openings" },
  { number: "09", name: "Finishes" },
  { number: "10", name: "Specialties" },
  { number: "11", name: "Equipment" },
  { number: "12", name: "Furnishings" },
  { number: "13", name: "Special Construction" },
  { number: "14", name: "Conveying Equipment" },
  { number: "21", name: "Fire Suppression" },
  { number: "22", name: "Plumbing" },
  { number: "23", name: "HVAC" },
  { number: "26", name: "Electrical" },
  { number: "27", name: "Communications" },
  { number: "28", name: "Electronic Safety & Security" },
  { number: "31", name: "Earthwork" },
  { number: "32", name: "Exterior Improvements" },
  { number: "33", name: "Utilities" },
  { number: "HC", name: "Hard Cost Contingency" },
];

export const SOFT_DIVISIONS = [
  { number: "60", name: "Land Costs" },
  { number: "61", name: "Development Services & Fees" },
  { number: "62", name: "Architectural & Design Fees" },
  { number: "63", name: "Civil Engineering" },
  { number: "64", name: "Preconstruction Services" },
  { number: "65", name: "Permit Fees & Licenses" },
  { number: "66", name: "Finance & Closing Fees" },
  { number: "67", name: "Franchise Fees" },
  { number: "68", name: "Real Estate Taxes" },
  { number: "69", name: "Interest Expense" },
  { number: "70", name: "Contingency" },
  { number: "71", name: "Construction Management Fees" },
  { number: "72", name: "FF&E & Supplies" },
  { number: "73", name: "Builder's Risk & Liability Insurance" },
  { number: "74", name: "Legal Fees" },
  { number: "75", name: "Pre-Opening" },
  { number: "76", name: "Consultants" },
  { number: "77", name: "IT" },
  { number: "78", name: "OS&E" },
  { number: "79", name: "Working Capital" },
  { number: "80", name: "Miscellaneous" },
];

export const ALL_DIVISIONS = [
  ...HARD_DIVISIONS.map((d) => ({ ...d, cost_type: "hard" as const })),
  ...SOFT_DIVISIONS.map((d) => ({ ...d, cost_type: "soft" as const })),
];

export const fmt = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export const fmtDecimal = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
