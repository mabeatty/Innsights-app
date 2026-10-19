import { describe, it, expect } from "vitest";
import { forDrawDocuments, isDrawEligible, isHeldForNextDraw, summarizeCurrentDraw } from "./drawHold";

const t = (over: Record<string, any> = {}) => ({ draw_id: null as string | null, exclude_from_draw: false, status: "Approved", net_amount: 100, ...over });

describe("drawHold", () => {
  it("only an unassigned row with the flag set is held", () => {
    expect(isHeldForNextDraw(t({ exclude_from_draw: true }))).toBe(true);
    expect(isHeldForNextDraw(t())).toBe(false);
    expect(isHeldForNextDraw(t({ exclude_from_draw: undefined }))).toBe(false); // column missing/old data = not held
  });

  it("a row already on a draw is never held, whatever the flag says", () => {
    expect(isHeldForNextDraw(t({ draw_id: "d1", exclude_from_draw: true }))).toBe(false);
  });

  it("forDrawDocuments drops held rows only, leaving claimed and included rows alone", () => {
    const rows = [t({ id: "included" }), t({ id: "held", exclude_from_draw: true }), t({ id: "claimed", draw_id: "d1" }), t({ id: "claimed-flagged", draw_id: "d1", exclude_from_draw: true })];
    expect(forDrawDocuments(rows).map((r: any) => r.id)).toEqual(["included", "claimed", "claimed-flagged"]);
  });

  it("Pending is never eligible for a draw", () => {
    expect(isDrawEligible({ status: "Pending" })).toBe(false);
    for (const status of ["Approved", "Paid", "Deferred"]) expect(isDrawEligible({ status })).toBe(true);
  });

  it("summarizes what the next draw will claim, what's held, and what's pending", () => {
    const s = summarizeCurrentDraw([
      t({ net_amount: 100 }), t({ net_amount: "250.50" }),                 // included (net_amount can arrive as a string)
      t({ exclude_from_draw: true, net_amount: 40 }),                       // held
      t({ status: "Pending", net_amount: 999 }),                            // pending: not counted as included or held
      t({ draw_id: "d1", net_amount: 5000 }),                               // already on a draw: ignored
    ]);
    expect(s).toEqual({ includedCount: 2, includedNet: 350.5, heldCount: 1, heldNet: 40, pendingCount: 1 });
  });
});
