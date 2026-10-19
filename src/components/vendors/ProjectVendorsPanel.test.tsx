import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectVendorsPanel from "./ProjectVendorsPanel";
import { toast } from "sonner";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as any).scrollIntoView ??= () => {};
  (window.HTMLElement.prototype as any).hasPointerCapture ??= () => false;
});

const P = (id: string, name: string, brand: string) => ({ id, name, hotel_name: null, brands: { name: brand }, secondary_brand: null });
const V = (id: string, project_id: string, name: string, over: Record<string, any> = {}) => ({ id, project_id, name, contact_name: null, email: null, phone: null, notes: null, ...over });
const tables: Record<string, any[]> = {};
type Op = { table: string; op: string; payload?: any; filters: any[][] };
const ops: Op[] = [];
let writeError: string | null = null;

function builder(table: string): any {
  const b: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej);
      if (prop === "insert" || prop === "update" || prop === "delete") {
        return (payload?: any) => {
          const rec: Op = { table, op: prop as string, payload, filters: [] };
          ops.push(rec);
          const chain: any = new Proxy({}, {
            get(_t2, p2) {
              if (p2 === "then") return (res: any, rej: any) => Promise.resolve({ error: writeError ? { message: writeError } : null }).then(res, rej);
              return (...args: any[]) => { rec.filters.push([p2 as string, ...args]); return chain; };
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const rowsText = () => screen.getAllByTestId("project-vendor-row").map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
const names = () => rowsText().map((r) => r[0]);
const openSelect = (trigger: HTMLElement) => fireEvent.keyDown(trigger, { key: "Enter" });
const pick = async (name: string) => fireEvent.keyDown(await screen.findByRole("option", { name }), { key: "Enter" });
const filterTrigger = () => screen.getByRole("combobox", { name: "Filter by project" });
const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => {
  vi.clearAllMocks(); ops.length = 0; writeError = null;
  tables.projects = [P("p-ash", "Ashland", "Home2 Suites"), P("p-int", "Intech", "TownePlace Suites"), P("p-o1", "Ontario", "Home2 Suites"), P("p-o2", "Ontario", "Hampton Inn")];
  tables.vendors = [
    V("v1", "p-int", "Rapid Draw", { contact_name: "Sam", phone: "555-0101", email: "sam@rapid.example" }),
    V("v2", "p-int", "KV National Land Svcs"),
    V("v3", "p-ash", "Acme Plumbing"),
  ];
  tables.contracts = [{ vendor_id: "v1" }, { vendor_id: "v1" }, { vendor_id: "v3" }];
});

describe("ProjectVendorsPanel", () => {
  it("lists every project's vendors with the project as 'city — brand' and how many contracts each has", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    expect(rowsText().map((r) => [r[0], r[1], r[5]])).toEqual([
      ["Acme Plumbing", "Ashland — Home2 Suites", "1"],
      ["KV National Land Svcs", "Intech — TownePlace Suites", "0"],
      ["Rapid Draw", "Intech — TownePlace Suites", "2"],
    ]);
  });

  it("filters by project and by search text", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    openSelect(filterTrigger());
    await pick("Intech — TownePlace Suites");
    await waitFor(() => expect(names()).toEqual(["KV National Land Svcs", "Rapid Draw"]));
    fireEvent.change(screen.getByPlaceholderText("Search project vendors..."), { target: { value: "sam" } }); // matches a contact name
    await waitFor(() => expect(names()).toEqual(["Rapid Draw"]));
    fireEvent.change(screen.getByPlaceholderText("Search project vendors..."), { target: { value: "zzz" } });
    expect(await screen.findByText("No vendors match.")).toBeInTheDocument();
  });

  it("says so when there are no project vendors at all", async () => {
    tables.vendors = [];
    render(<ProjectVendorsPanel />);
    expect(await screen.findByText("No project vendors yet.")).toBeInTheDocument();
  });

  it("adds a vendor to the chosen project (one of two projects in the same city)", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Add Vendor" }));
    fireEvent.change(dialog().getByLabelText("Vendor Name *"), { target: { value: "  New Co  " } });
    fireEvent.change(dialog().getByLabelText("Contact"), { target: { value: "Pat" } });
    openSelect(dialog().getByRole("combobox", { name: "Project" }));
    await pick("Ontario — Hampton Inn");
    fireEvent.click(dialog().getByRole("button", { name: "Add Vendor" }));
    await waitFor(() => expect(ops.filter((o) => o.op === "insert")).toHaveLength(1));
    expect(ops.find((o) => o.op === "insert")).toMatchObject({
      table: "vendors", payload: { name: "New Co", project_id: "p-o2", contact_name: "Pat", email: null, phone: null, notes: null },
    });
    expect(toast.success).toHaveBeenCalledWith("Vendor added.");
  });

  it("won't add a vendor without a project", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Add Vendor" }));
    fireEvent.change(dialog().getByLabelText("Vendor Name *"), { target: { value: "No Project Co" } });
    fireEvent.click(dialog().getByRole("button", { name: "Add Vendor" }));
    expect(toast.error).toHaveBeenCalledWith("Choose a project for this vendor.");
    expect(ops).toHaveLength(0);
  });

  it("blocks a duplicate name on the same project (any case), since the payee dropdown keys on the name", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    openSelect(filterTrigger());
    await pick("Intech — TownePlace Suites"); // the add form now defaults to Intech
    fireEvent.click(screen.getByRole("button", { name: "Add Vendor" }));
    fireEvent.change(dialog().getByLabelText("Vendor Name *"), { target: { value: "rapid DRAW" } });
    fireEvent.click(dialog().getByRole("button", { name: "Add Vendor" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("already"));
    expect(ops).toHaveLength(0);
  });

  it("edits a vendor in place: the project can't be changed, and the same name on another project is fine", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Edit Rapid Draw" }));
    expect(dialog().getByTestId("project-readonly")).toHaveTextContent("Intech — TownePlace Suites");
    expect(dialog().getByText(/Renaming doesn't change the payee name on transactions already recorded/)).toBeInTheDocument();
    fireEvent.change(dialog().getByLabelText("Vendor Name *"), { target: { value: "Rapid Draw LLC" } });
    fireEvent.click(dialog().getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(ops.filter((o) => o.op === "update")).toHaveLength(1));
    const upd = ops.find((o) => o.op === "update")!;
    expect(upd.payload).toEqual({ name: "Rapid Draw LLC", contact_name: "Sam", email: "sam@rapid.example", phone: "555-0101", notes: null });
    expect(upd.payload).not.toHaveProperty("project_id");
    expect(upd.filters).toContainEqual(["eq", "id", "v1"]);
  });

  it("won't rename a vendor to another vendor's name on the same project", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Edit Rapid Draw" }));
    fireEvent.change(dialog().getByLabelText("Vendor Name *"), { target: { value: "kv national land svcs" } });
    fireEvent.click(dialog().getByRole("button", { name: "Save Changes" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("already"));
    expect(ops).toHaveLength(0);
  });

  it("keeps the form open and shows the error if saving fails", async () => {
    writeError = "permission denied";
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Edit Acme Plumbing" }));
    fireEvent.change(dialog().getByLabelText("Vendor Name *"), { target: { value: "Acme Plumbing Inc" } });
    fireEvent.click(dialog().getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("permission denied"));
    expect(dialog().getByLabelText("Vendor Name *")).toHaveValue("Acme Plumbing Inc");
  });

  it("deleting warns how many contracts will be unlinked, then deletes", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Delete Rapid Draw" }));
    expect(dialog().getByText("Delete Rapid Draw?")).toBeInTheDocument();
    expect(dialog().getByTestId("delete-linked-warning")).toHaveTextContent("2 contracts are linked to this vendor");
    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(ops.filter((o) => o.op === "delete")).toHaveLength(1));
    expect(ops.find((o) => o.op === "delete")).toMatchObject({ table: "vendors", filters: [["eq", "id", "v1"]] });
    expect(toast.success).toHaveBeenCalledWith("Rapid Draw deleted.");
  });

  it("a vendor with no contracts deletes without a warning; Cancel deletes nothing", async () => {
    render(<ProjectVendorsPanel />);
    await screen.findAllByTestId("project-vendor-row");
    fireEvent.click(screen.getByRole("button", { name: "Delete KV National Land Svcs" }));
    expect(screen.queryByTestId("delete-linked-warning")).not.toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));
    expect(ops).toHaveLength(0);
  });
});
