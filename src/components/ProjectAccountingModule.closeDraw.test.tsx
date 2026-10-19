import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectAccountingModule from "./ProjectAccountingModule";
import { toast } from "sonner";

// Child tabs are stubs: this file is about the module's own Close Draw logic.
vi.mock("@/components/budget/G702Tab", () => ({ default: (p: any) => <div data-testid="g702" data-count={p.transactions.length} /> }));
vi.mock("@/components/budget/G703Tab", () => ({ default: (p: any) => <div data-testid="g703" data-count={p.transactions.length} /> }));
vi.mock("@/components/budget/TransactionsTab", () => ({ default: () => <div data-testid="transactions-tab" /> }));
vi.mock("@/components/budget/DrawHistoryTab", () => ({ default: () => null }));
vi.mock("@/components/budget/ChangeOrdersTab", () => ({ default: () => null }));
vi.mock("@/components/budget/exportPDF", () => ({ exportBudgetPDF: vi.fn() }));
vi.mock("@/components/budget/useAIAExport", () => ({ useAIAExport: (_b: any, txns: any[]) => ({ exporting: false, handleExportAIA: vi.fn(), seen: txns }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

type Op = { table: string; op: string; payload?: any; filters: any[][] };
const ops: Op[] = [];
let failClaim = false;
function builder(table: string): any {
  const base: any = new Proxy(function () {}, {
    get(_t, prop) {
      const result = (r: Op) => (r.op === "update" && failClaim && table === "budget_transactions" && r.payload?.draw_id ? { error: { message: "boom" } } : { error: null });
      if (prop === "then") return (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
      if (prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      if (prop === "insert" || prop === "update" || prop === "delete") {
        return (payload?: any) => {
          const rec: Op = { table, op: prop as string, payload, filters: [] };
          ops.push(rec);
          const chain: any = new Proxy({}, {
            get(_t2, p2) {
              if (p2 === "single") return () => Promise.resolve({ data: { id: "new-draw", ...payload }, error: null });
              if (p2 === "then") return (res: any, rej: any) => Promise.resolve(result(rec)).then(res, rej);
              return (...args: any[]) => { rec.filters.push([p2 as string, ...args]); return chain; };
            },
          });
          return chain;
        };
      }
      return () => base;
    },
  });
  return base;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));

const budgetRows = [{ id: "b1", division_number: "01", division_name: "General Requirements", cost_type: "Hard", scheduled_value: 10000, notes: null }];
const tx = (over: Record<string, any>) => ({ project_id: "p1", status: "Approved", division_number: "01", amount: 0, retainage_amount: 0, net_amount: 0, draw_id: null, exclude_from_draw: false, ...over });
const transactions = [
  tx({ id: "t1", amount: 1000, retainage_amount: 100, net_amount: 900 }),                       // included
  tx({ id: "t2", amount: 400, retainage_amount: 40, net_amount: 360, exclude_from_draw: true }), // held back
  tx({ id: "t3", status: "Pending", amount: 300, net_amount: 300 }),                            // pending: can't be drawn
  tx({ id: "t4", draw_id: "d0", amount: 5000, net_amount: 5000 }),                              // already on an earlier draw
] as any[];

function renderModule() {
  const onTransactionsReload = vi.fn();
  render(
    <ProjectAccountingModule
      projectId="p1" projectName="Test Hotel" budgetRows={budgetRows as any} transactions={transactions} materialsStored={{}}
      periodStart={new Date("2026-10-01")} periodEnd={new Date("2026-10-31")} onPeriodChange={vi.fn()} onMaterialsChange={vi.fn()}
      onScheduledValueChange={vi.fn()} onScheduledValueBlur={vi.fn()} onTransactionsChange={vi.fn()} onTransactionsReload={onTransactionsReload} onBudgetReload={vi.fn()}
    />,
  );
  return { onTransactionsReload };
}
const openDialog = () => { fireEvent.click(screen.getByRole("button", { name: /Close Draw #1/ })); return within(screen.getByRole("dialog")); };
const drawInsert = () => ops.find((o) => o.table === "draw_history" && o.op === "insert")!;
const claim = () => ops.find((o) => o.table === "budget_transactions" && o.payload?.draw_id === "new-draw");
const release = () => ops.find((o) => o.table === "budget_transactions" && o.payload && "exclude_from_draw" in o.payload);

beforeEach(() => { vi.clearAllMocks(); ops.length = 0; failClaim = false; });

describe("Accounting module — held transactions and Close Draw", () => {
  it("builds the draw documents without held transactions (and keeps everything else)", () => {
    renderModule();
    expect(screen.getByTestId("g702")).toHaveAttribute("data-count", "3"); // 4 rows minus the held one
    fireEvent.mouseDown(screen.getByRole("tab", { name: "G703" }), { button: 0 });
    expect(screen.getByTestId("g703")).toHaveAttribute("data-count", "3");
  });

  it("the Close Draw dialog says what's included and what's being held for the next draw", () => {
    renderModule();
    const dialog = openDialog();
    const summary = dialog.getByTestId("close-draw-summary");
    expect(summary).toHaveTextContent(/Included in this draw:\s*1 line item/);
    expect(summary).toHaveTextContent(/900/);
    expect(summary).toHaveTextContent(/Held for Draw #2:\s*1 line item/);
    expect(summary).toHaveTextContent(/360/);
  });

  it("closes the draw on included transactions only: totals, snapshot, and which rows get claimed", async () => {
    const { onTransactionsReload } = renderModule();
    fireEvent.click(openDialog().getByRole("button", { name: /Close Draw #1/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    const d = drawInsert().payload;
    expect(d.total_amount).toBe(900);                                  // 1000 - 100 retainage; the held 400 is NOT in it
    expect(d.snapshot_json.g702["8. Current Payment Due"]).toBe(900);
    expect(d.snapshot_json.budgetRows[0]).toMatchObject({ thisPeriod: 1000, previous: 5000 });

    expect(claim()!.filters).toEqual(expect.arrayContaining([
      ["eq", "project_id", "p1"], ["is", "draw_id", null], ["neq", "status", "Pending"], ["eq", "exclude_from_draw", false],
    ]));
    expect(onTransactionsReload).toHaveBeenCalled();
  });

  it("then releases the holds, so held transactions roll into the next draw by default", async () => {
    renderModule();
    fireEvent.click(openDialog().getByRole("button", { name: /Close Draw #1/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const r = release()!;
    expect(r.payload).toEqual({ exclude_from_draw: false });
    expect(r.filters).toEqual(expect.arrayContaining([["eq", "project_id", "p1"], ["is", "draw_id", null], ["eq", "exclude_from_draw", true]]));
    expect(ops.indexOf(r)).toBeGreaterThan(ops.indexOf(claim()!)); // only AFTER the claim, or held rows would be swept in
  });

  it("if claiming fails, removes the draw it just created instead of leaving an empty one, and doesn't release holds", async () => {
    failClaim = true;
    const { onTransactionsReload } = renderModule();
    fireEvent.click(openDialog().getByRole("button", { name: /Close Draw #1/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("boom")));
    const del = ops.find((o) => o.table === "draw_history" && o.op === "delete");
    expect(del?.filters).toContainEqual(["eq", "id", "new-draw"]);
    expect(release()).toBeUndefined();
    expect(onTransactionsReload).not.toHaveBeenCalled();
  });
});
