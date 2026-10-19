import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TransactionsTab from "./TransactionsTab";
import { toast } from "sonner";
import { featureFlags } from "@/lib/featureFlags";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as any).scrollIntoView ??= () => {};
  (window.HTMLElement.prototype as any).hasPointerCapture ??= () => false;
});

const tx = (over: Record<string, any>) => ({
  project_id: "p1", transaction_type: "Contractor Pay Application", date: "2026-09-01", status: "Approved", notes: null, document_url: null,
  division_number: "01", division_name: "General Requirements", description: "work", retainage_amount: 0, draw_id: null, exclude_from_draw: false,
  contract_id: null, invoice_id: null, invoices: null, ...over,
});
// Alpha: one row of 2 lines (included) | Beta: held | Gamma: pending | Delta: Paid, included | Old Co: already on a draw
const ROWS = [
  tx({ id: "A1", transaction_group_id: "gA", transaction_number: 1, payee: "Alpha Concrete", amount: 1000, retainage_amount: 100, net_amount: 900 }),
  tx({ id: "A2", transaction_group_id: "gA", transaction_number: 1, payee: "Alpha Concrete", amount: 500, retainage_amount: 50, net_amount: 450 }),
  tx({ id: "B1", transaction_group_id: "gB", transaction_number: 2, payee: "Beta Electric", amount: 400, net_amount: 400, exclude_from_draw: true }),
  tx({ id: "C1", transaction_group_id: "gC", transaction_number: 3, payee: "Gamma HVAC", amount: 300, net_amount: 300, status: "Pending" }),
  tx({ id: "D1", transaction_group_id: "gD", transaction_number: 4, payee: "Delta Plumbing", amount: 200, net_amount: 200, status: "Paid" }),
  tx({ id: "E1", transaction_group_id: "gE", transaction_number: 5, payee: "Old Co", amount: 9000, net_amount: 9000, draw_id: "d1" }),
];

const VENDORS = [{ id: "vv1", project_id: "p1", name: "Rapid Draw", contact_name: null, email: null, phone: null, notes: null, created_at: "2026-01-01" }];
const calls = { selects: 0, updates: [] as { table: string; payload: any; ids?: string[] }[], inserts: [] as { table: string; payload: any }[] };
let updateError: string | null = null;
function builder(table: string): any {
  const b: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve({ data: table === "budget_transactions" ? ROWS : table === "vendors" ? VENDORS : [], error: null }).then(res, rej);
      if (prop === "select") return () => { if (table === "budget_transactions") calls.selects++; return b; };
      if (prop === "insert") return (payload: any) => { calls.inserts.push({ table, payload }); return b; };
      if (prop === "update") {
        return (payload: any) => {
          const rec: { table: string; payload: any; ids?: string[] } = { table, payload };
          calls.updates.push(rec);
          const chain: any = new Proxy({}, {
            get(_t2, p2) {
              if (p2 === "in") return (_col: string, ids: string[]) => { rec.ids = ids; return chain; };
              if (p2 === "then") return (res: any, rej: any) => Promise.resolve({ error: updateError ? { message: updateError } : null }).then(res, rej);
              return () => chain;
            },
          });
          return chain;
        };
      }
      return () => b;
    },
  });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
const AUTH = vi.hoisted(() => ({ isConsultant: false, accessLevel: "edit" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/invoices/InvoiceDetailDialog", () => ({ default: () => null }));

const DRAW = { id: "d1", draw_number: 1, draw_month: "2026-01-01", status: "Approved", total_amount: 9000, snapshot_json: {} } as any;
const renderTab = (extra: Record<string, any> = {}) => {
  const onTransactionsChange = vi.fn();
  const utils = render(<TransactionsTab projectId="p1" draws={[DRAW]} onTransactionsChange={onTransactionsChange} {...extra} />);
  return { ...utils, onTransactionsChange };
};
const box = (name: RegExp) => screen.findByRole("checkbox", { name });
const checked = (el: HTMLElement) => el.getAttribute("aria-checked");

beforeEach(() => {
  vi.clearAllMocks();
  calls.selects = 0; calls.updates.length = 0; calls.inserts.length = 0; updateError = null; AUTH.accessLevel = "edit"; AUTH.isConsultant = false;
});

describe("Transactions tab — include / hold transactions for the next draw", () => {
  it("shows each row's state: included, held (with a Held pill), pending (disabled)", async () => {
    renderTab();
    expect(checked(await box(/Include Alpha Concrete #1/))).toBe("true");
    const beta = await box(/Include Beta Electric #2/);
    expect(checked(beta)).toBe("false");
    expect(within(beta.closest("tr")!).getByText("Held")).toBeInTheDocument();
    const gamma = await box(/Include Gamma HVAC #3/);
    expect(gamma).toBeDisabled();
    expect(checked(await box(/Include Delta Plumbing #4/))).toBe("true");
  });

  it("rows already on a draw aren't in the current list", async () => {
    renderTab();
    await box(/Include Alpha Concrete/);
    expect(screen.queryByRole("checkbox", { name: /Old Co/ })).not.toBeInTheDocument();
  });

  it("summarizes what's included, held, and pending", async () => {
    renderTab();
    await box(/Include Alpha Concrete/);
    const summary = screen.getByTestId("draw-summary");
    expect(summary).toHaveTextContent(/Included in the next draw:\s*2/); // Alpha + Delta
    expect(summary).toHaveTextContent(/1,550/);                          // 1,350 + 200 net
    expect(summary).toHaveTextContent(/Held for the following draw:\s*1/);
    expect(summary).toHaveTextContent(/400/);
    expect(summary).toHaveTextContent(/1 pending approval/);
  });

  it("unchecking a row holds ALL its lines, updates the screen right away, and saves", async () => {
    const { onTransactionsChange } = renderTab();
    fireEvent.click(await box(/Include Alpha Concrete #1/));
    await waitFor(() => expect(checked(screen.getByRole("checkbox", { name: /Include Alpha Concrete #1/ }))).toBe("false"));
    expect(screen.getByTestId("draw-summary")).toHaveTextContent(/Held for the following draw:\s*2/);
    await waitFor(() => expect(calls.updates).toHaveLength(1));
    expect(calls.updates[0]).toMatchObject({ table: "budget_transactions", payload: { exclude_from_draw: true } });
    expect(calls.updates[0].ids!.sort()).toEqual(["A1", "A2"]);
    // G702/G703 upstream are told straight away
    expect(onTransactionsChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: "A1", exclude_from_draw: true })]));
  });

  it("checking a held row puts it back in", async () => {
    renderTab();
    fireEvent.click(await box(/Include Beta Electric #2/));
    await waitFor(() => expect(calls.updates).toHaveLength(1));
    expect(calls.updates[0]).toMatchObject({ payload: { exclude_from_draw: false }, ids: ["B1"] });
    expect(checked(screen.getByRole("checkbox", { name: /Include Beta Electric #2/ }))).toBe("true");
  });

  it("header checkbox is 'mixed' when some are held, and checking it includes every visible eligible row", async () => {
    renderTab();
    const header = await screen.findByRole("checkbox", { name: /Include all visible/ });
    expect(checked(header)).toBe("mixed");
    fireEvent.click(header);
    await waitFor(() => expect(calls.updates).toHaveLength(1));
    expect(calls.updates[0].payload).toEqual({ exclude_from_draw: false });
    expect(calls.updates[0].ids!.sort()).toEqual(["A1", "A2", "B1", "D1"]); // never the Pending row
    await waitFor(() => expect(checked(screen.getByRole("checkbox", { name: /Include all visible/ }))).toBe("true"));
  });

  it("when everything is included, the header checkbox holds everything", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Include all visible/ })); // mixed -> include all
    await waitFor(() => expect(checked(screen.getByRole("checkbox", { name: /Include all visible/ }))).toBe("true"));
    fireEvent.click(screen.getByRole("checkbox", { name: /Include all visible/ }));
    await waitFor(() => expect(calls.updates).toHaveLength(2));
    expect(calls.updates[1].payload).toEqual({ exclude_from_draw: true });
  });

  it("'Select all' includes every eligible row (never the Pending one), then has nothing left to do", async () => {
    renderTab();
    const selectAll = await screen.findByRole("button", { name: "Select all" });
    expect(selectAll).toBeEnabled(); // Beta is held
    fireEvent.click(selectAll);
    await waitFor(() => expect(calls.updates).toHaveLength(1));
    expect(calls.updates[0].payload).toEqual({ exclude_from_draw: false });
    expect(calls.updates[0].ids!.sort()).toEqual(["A1", "A2", "B1", "D1"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled());
    expect(checked(screen.getByRole("checkbox", { name: /Include Beta Electric #2/ }))).toBe("true");
  });

  it("'Deselect all' holds every eligible row and leaves Pending alone", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Deselect all" }));
    await waitFor(() => expect(calls.updates).toHaveLength(1));
    expect(calls.updates[0].payload).toEqual({ exclude_from_draw: true });
    expect(calls.updates[0].ids!.sort()).toEqual(["A1", "A2", "B1", "D1"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Deselect all" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
    expect(screen.getByTestId("draw-summary")).toHaveTextContent(/Held for the following draw:\s*3/); // Alpha, Beta, Delta
  });

  it("with a filter on, the buttons say 'shown' and only touch the rows you can see", async () => {
    renderTab();
    await screen.findByRole("button", { name: "Select all" });
    // filter the list to Paid (only Delta Plumbing)
    const statusTrigger = screen.getAllByText("Status")[0].parentElement!.querySelector('[role="combobox"]') as HTMLElement;
    fireEvent.keyDown(statusTrigger, { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Paid" }), { key: "Enter" });
    const deselectShown = await screen.findByRole("button", { name: "Deselect all shown" });
    expect(screen.getByRole("button", { name: "Select all shown" })).toBeDisabled(); // Delta is already included
    fireEvent.click(deselectShown);
    await waitFor(() => expect(calls.updates).toHaveLength(1));
    expect(calls.updates[0]).toMatchObject({ payload: { exclude_from_draw: true }, ids: ["D1"] });
  });

  it("the buttons are disabled for view-only users", async () => {
    AUTH.accessLevel = "view";
    renderTab();
    expect(await screen.findByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deselect all" })).toBeDisabled();
  });

  it("puts the row back and says so if the save fails", async () => {
    updateError = "permission denied";
    renderTab();
    fireEvent.click(await box(/Include Alpha Concrete #1/));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("permission denied")));
    await waitFor(() => expect(checked(screen.getByRole("checkbox", { name: /Include Alpha Concrete #1/ }))).toBe("true")); // reloaded from storage
  });

  it("view-only users see the state but can't change it", async () => {
    AUTH.accessLevel = "view";
    renderTab();
    expect(await box(/Include Alpha Concrete #1/)).toBeDisabled();
    expect(await box(/Include Beta Electric #2/)).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Include all visible/ })).toBeDisabled();
  });

  it("refetches when a draw is closed (the set of draws changes), but not on an unrelated rerender", async () => {
    const { rerender, onTransactionsChange } = renderTab();
    await box(/Include Alpha Concrete/);
    const afterMount = calls.selects;
    rerender(<TransactionsTab projectId="p1" draws={[DRAW]} onTransactionsChange={onTransactionsChange} />); // same draws: no refetch
    expect(calls.selects).toBe(afterMount);
    rerender(<TransactionsTab projectId="p1" draws={[DRAW, { ...DRAW, id: "d2", draw_number: 2 }]} onTransactionsChange={onTransactionsChange} />);
    await waitFor(() => expect(calls.selects).toBe(afterMount + 1));
  });
});

describe("Transactions tab — vendors", () => {
  it("has no Manage Vendors button", async () => {
    renderTab();
    await screen.findByRole("button", { name: "Select all" });
    expect(screen.queryByRole("button", { name: /Manage Vendors/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Manage Vendors")).not.toBeInTheDocument();
  });


  it("with project vendor management off (the default), the payee dropdown lists existing vendors but offers no 'Add New Vendor'", async () => {
    renderTab();
    const alphaRow = (await box(/Include Alpha Concrete #1/)).closest("tr")!;
    fireEvent.click(within(alphaRow).getByTitle("Edit"));
    const payee = (await screen.findByText("Payee / Vendor *")).parentElement!.querySelector('[role="combobox"]') as HTMLElement;
    fireEvent.keyDown(payee, { key: "Enter" });
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toContain("Rapid Draw");            // the existing list is still used
    expect(screen.queryByRole("option", { name: /Add New Vendor/ })).not.toBeInTheDocument();
  });

  it("with project vendor management turned on, adding a vendor from the payee dropdown works", async () => {
    featureFlags.projectVendorManagement = true;
    try { // the feature is off by default
    renderTab();
    const alphaRow = (await box(/Include Alpha Concrete #1/)).closest("tr")!;
    fireEvent.click(within(alphaRow).getByTitle("Edit"));                         // open the transaction form
    const payee = (await screen.findByText("Payee / Vendor *")).parentElement!.querySelector('[role="combobox"]') as HTMLElement;
    fireEvent.keyDown(payee, { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: /Add New Vendor/ }), { key: "Enter" });

    const nameInput = (await screen.findByText("Vendor Name *")).parentElement!.querySelector("input") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Vendor Co" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Vendor" }));
    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ table: "vendors", payload: { name: "New Vendor Co", project_id: "p1" } });
    await waitFor(() => expect(screen.queryByText("Vendor Name *")).not.toBeInTheDocument()); // the add-vendor form closed
  } finally { featureFlags.projectVendorManagement = false; }
  });
});
