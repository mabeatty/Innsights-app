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

export const ADJUSTMENT_CATEGORIES = ["Freight", "Tax/Tariff", "Installation", "Other Scope"] as const;
export type AdjustmentCategory = typeof ADJUSTMENT_CATEGORIES[number];

export interface Adjustment {
  id: string;
  quote_id: string;
  description: string;
  amount: number;
  category: AdjustmentCategory | string;
  created_at: string;
}

// The leveled total is the true apples-to-apples comparison basis: the
// vendor's raw final quote plus/minus scope adjustments that normalize for
// what they included or excluded relative to the requested scope.
export function leveledTotal(quote: VendorQuote, adjustments: Adjustment[]): number {
  const base = quote.final_quote_amount ?? 0;
  const adjSum = adjustments.reduce((s, a) => s + a.amount, 0);
  return base + adjSum;
}

// Net adjustment amount for one category, e.g. "how much did we add/deduct
// for Freight" — used for the per-vendor Normalized Price quick view.
export function categoryNet(adjustments: Adjustment[], category: string): number {
  return adjustments.filter((a) => a.category === category).reduce((s, a) => s + a.amount, 0);
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
