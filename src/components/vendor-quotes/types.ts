export const SEGMENTS = [
  "FF&E",
  "OS&E",
  "IT / Low Voltage",
  "Signage",
  "Construction (GC)",
  "Subcontractors",
  "Other",
] as const;

export type Segment = (typeof SEGMENTS)[number];

export type BidItemStatus = "Open" | "Awarded" | "Cancelled";
export type VendorStatus = "Pending" | "Active" | "Eliminated" | "Awarded";

export interface BidItem {
  id: string;
  project_id: string;
  segment: string;
  item_name: string;
  status: BidItemStatus;
  created_at: string;
}

export interface VendorQuote {
  id: string;
  bid_item_id: string;
  vendor_name: string;
  round_1_ref: string | null;
  round_1_url: string | null;
  round_1_amount: number | null;
  round_2_ref: string | null;
  round_2_url: string | null;
  round_2_amount: number | null;
  round_3_ref: string | null;
  round_3_url: string | null;
  round_3_amount: number | null;
  round_4_ref: string | null;
  round_4_url: string | null;
  round_4_amount: number | null;
  final_quote_amount: number | null;
  vendor_status: VendorStatus;
  award_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
