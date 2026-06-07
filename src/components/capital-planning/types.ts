export interface EquitySource {
  id: string;
  project_id: string;
  source_name: string;
  equity_type: string;
  total_commitment: number;
  equity_called: number;
  preferred_return: number | null;
  promote_structure: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtTranche {
  id: string;
  project_id: string;
  lender_name: string;
  loan_type: string;
  loan_amount: number;
  interest_rate: number;
  rate_type: string;
  index_name: string | null;
  spread: number | null;
  loan_term: number;
  maturity_date: string | null;
  amortization_schedule: string;
  origination_fee: number;
  extension_options: string | null;
  required_reserves: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Investor {
  id: string;
  project_id: string;
  investor_name: string;
  equity_source_id: string | null;
  total_commitment: number;
  total_called: number;
  total_received: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashFlowRow {
  id: string;
  project_id: string;
  month_year: string;
  projected_spend: number;
  draw_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const EQUITY_TYPES = [
  "GP Equity",
  "LP Equity",
  "Preferred Equity",
  "EB-5",
  "Tax Credit Equity",
  "Other",
] as const;

export const LOAN_TYPES = [
  "Construction Loan",
  "Mini-Perm",
  "Bridge",
  "Mezz",
  "EB-5 Loan",
  "CMBS",
  "Other",
] as const;

export const RATE_TYPES = ["Fixed", "Floating"] as const;

export const AMORTIZATION_SCHEDULES = [
  "Interest Only",
  "30-Year",
  "25-Year",
  "20-Year",
  "15-Year",
  "Custom",
] as const;

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
