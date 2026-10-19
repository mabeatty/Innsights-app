import type { BudgetTransaction } from "./types";

// A transaction can be "held": still unassigned (no draw_id) but left out of the
// draw being built. It stays a real cost everywhere, it just isn't billed in this
// draw. Closing a draw claims only the non-held transactions and then clears the
// hold on the rest, so they roll into the next draw by default.
type HoldFields = Pick<BudgetTransaction, "draw_id" | "exclude_from_draw">;

// draw_id is authoritative: a row already on a draw is never "held", whatever the flag says.
export const isHeldForNextDraw = (t: HoldFields): boolean => t.draw_id == null && !!t.exclude_from_draw;

// What the draw documents (G702, G703, exports, Close Draw) should be built from:
// everything except held rows. Budget and cost views keep using the full list.
export const forDrawDocuments = <T extends HoldFields>(txns: T[]): T[] => txns.filter((t) => !isHeldForNextDraw(t));

// Pending transactions can never go on a draw yet (same rule Close Draw applies).
export const isDrawEligible = (t: Pick<BudgetTransaction, "status">): boolean => t.status !== "Pending";

export interface CurrentDrawSummary {
  includedCount: number;
  includedNet: number;
  heldCount: number;
  heldNet: number;
  pendingCount: number;
}

// Line-item counts and net dollars for the unassigned transactions, split into
// what the next Close Draw will claim, what's being held back, and what's still pending.
export function summarizeCurrentDraw(txns: Pick<BudgetTransaction, "draw_id" | "exclude_from_draw" | "status" | "net_amount">[]): CurrentDrawSummary {
  const s: CurrentDrawSummary = { includedCount: 0, includedNet: 0, heldCount: 0, heldNet: 0, pendingCount: 0 };
  for (const t of txns) {
    if (t.draw_id != null) continue;
    if (!isDrawEligible(t)) { s.pendingCount++; continue; }
    if (isHeldForNextDraw(t)) { s.heldCount++; s.heldNet += Number(t.net_amount); }
    else { s.includedCount++; s.includedNet += Number(t.net_amount); }
  }
  return s;
}
