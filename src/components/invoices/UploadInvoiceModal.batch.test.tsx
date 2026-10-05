import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadInvoiceModal, { type BatchModeProps } from "./UploadInvoiceModal";
import type { ExtractionResult } from "./invoiceExtraction";
import { createNotifications } from "@/lib/notify";
import { toast } from "sonner";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as any).scrollIntoView ??= () => {};
  (window.HTMLElement.prototype as any).hasPointerCapture ??= () => false;
});

// Chainable query-builder fake: every method returns the builder, awaiting it
// yields the table's rows, and .single() yields a fresh id.
const tables: Record<string, any[]> = {};
function builder(table: string): any {
  const b: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (res: any, rej: any) =>
          Promise.resolve({ data: tables[table] ?? [], error: null, count: (tables[table] ?? []).length }).then(res, rej);
      }
      if (prop === "single" || prop === "maybeSingle") {
        return () => Promise.resolve({ data: { id: "new-invoice-id", ...(tables[table]?.[0] ?? {}) }, error: null });
      }
      return () => b;
    },
  });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: "https://x/y.pdf" } }) }) },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u0", email: "me@x.com" }, organizationId: "org1" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/notify", () => ({ createNotifications: vi.fn(async () => {}) }));
vi.mock("./invoiceExtraction", async (orig) => {
  const actual = await orig<typeof import("./invoiceExtraction")>();
  return { ...actual, buildBudgetMatcher: vi.fn(async () => ({ categories: [], resolve: () => "" })), extractInvoiceFile: vi.fn() };
});

const pdfResult = (vendor: string, inv: string, total: number): ExtractionResult => ({
  kind: "pdf",
  fields: { vendor_name: vendor, invoice_number: inv, total_amount: total, document_type: "invoice" },
});
const aiaResult: ExtractionResult = {
  kind: "excel",
  res: {
    isAIA: true, source: "detail", vendor_name: "Integrate Build", project_name: "Intech", invoice_number: "9",
    invoice_date: "2026-09-01", application_number: "9", detail_rows: [],
    line_items: [
      { aia_item: "01", description: "General Requirements", amount: 1000, retainage: 100 },
      { aia_item: "03", description: "Concrete", amount: 2000, retainage: 200 },
    ],
    totals: { amount: 3000, retainage: 300, net: 2700 },
  },
};

const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
function batchProps(over: Partial<BatchModeProps> = {}): BatchModeProps {
  return {
    resetKey: "k1", file: file("a.pdf"), prefetched: pdfResult("Acme Plumbing", "INV-42", 1234.5),
    position: { index: 1, total: 3, hasNext: true }, onSkip: vi.fn(), onSaved: vi.fn(), ...over,
  };
}
const renderForm = (batch: BatchModeProps, extra: Record<string, any> = {}) => {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  const utils = render(<UploadInvoiceModal open onOpenChange={onOpenChange} defaultProjectId="p1" onCreated={onCreated} batch={batch} {...extra} />);
  return { ...utils, onOpenChange, onCreated };
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  tables.projects = [{ id: "p1", name: "Intech", hotel_name: null }];
});

describe("UploadInvoiceModal in batch mode", () => {
  it("shows position and applies the prefetched extraction without calling the extractor again", async () => {
    renderForm(batchProps());
    expect(await screen.findByText("Invoice 1 of 3")).toBeInTheDocument();
    expect(screen.getAllByText("a.pdf").length).toBeGreaterThan(0); // title + upload zone
    expect(await screen.findByDisplayValue("Acme Plumbing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("INV-42")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1234.5")).toBeInTheDocument();
    expect(screen.getByText("Submit & Next")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("resets the whole form (including tax-exempt) when the batch moves to the next file", async () => {
    const { rerender, onOpenChange } = renderForm(batchProps());
    await screen.findByDisplayValue("Acme Plumbing");

    // flag the first invoice tax-exempt
    const taxBox = screen.getByRole("checkbox");
    fireEvent.click(taxBox);
    expect(taxBox).toBeChecked();

    rerender(
      <UploadInvoiceModal
        open onOpenChange={onOpenChange} defaultProjectId="p1"
        batch={batchProps({ resetKey: "k2", file: file("b.pdf"), prefetched: pdfResult("Beta Electric", "B-9", 500), position: { index: 2, total: 3, hasNext: false } })}
      />,
    );
    expect(await screen.findByDisplayValue("Beta Electric")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Acme Plumbing")).not.toBeInTheDocument();
    expect(screen.getByText("Invoice 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked(); // would carry over without the reset fix
    expect(screen.getByText("Submit & Finish")).toBeInTheDocument();
  });

  it("applies an AIA Excel result with divisions pre-selected", async () => {
    renderForm(batchProps({ prefetched: aiaResult, file: new File(["x"], "app9.xlsx") }));
    expect(await screen.findByDisplayValue("Integrate Build")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2000")).toBeInTheDocument();
    expect(screen.getByText("AIA Pay Application")).toBeInTheDocument();
  });

  it("opens empty for manual entry when extraction failed (prefetched = null)", async () => {
    renderForm(batchProps({ prefetched: null }));
    await screen.findByText("Invoice 1 of 3");
    expect(screen.queryByDisplayValue("Acme Plumbing")).not.toBeInTheDocument();
  });

  it("submitting hands off to the batch (no per-invoice notification, no close) and carries the saved totals", async () => {
    const onSaved = vi.fn();
    const { onOpenChange, onCreated } = renderForm(batchProps({ prefetched: aiaResult, file: new File(["x"], "app9.xlsx"), onSaved }));
    await screen.findByDisplayValue("Integrate Build");
    fireEvent.click(screen.getByText("Submit & Next"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith({ invoiceId: "new-invoice-id", vendor: "Integrate Build", amount: 3000, approverIds: [] });
    expect(createNotifications).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/Invoice submitted/));
  });

  it("Skip and Back to queue are wired to the batch", async () => {
    const onSkip = vi.fn();
    const { onOpenChange } = renderForm(batchProps({ onSkip }));
    await screen.findByDisplayValue("Acme Plumbing");
    fireEvent.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Back to queue"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("flags a likely duplicate (same vendor + invoice number already on the project)", async () => {
    tables.invoices = [{ vendor_name: "Acme Plumbing", invoice_number: "INV-42", amount: 1234.5, status: "Approved", invoice_date: "2026-09-01" }];
    renderForm(batchProps());
    expect(await screen.findByText(/Possible duplicate/, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/already on this project \(Approved, 2026-09-01\)/)).toBeInTheDocument();
  });

  it("shows no duplicate warning when nothing matches", async () => {
    tables.invoices = [];
    renderForm(batchProps());
    await screen.findByDisplayValue("Acme Plumbing");
    await new Promise((r) => setTimeout(r, 800)); // past the 500ms debounce
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
  });

  it("single-upload mode is unchanged: Cancel / Submit Invoice, no batch controls", async () => {
    render(<UploadInvoiceModal open onOpenChange={vi.fn()} defaultProjectId="p1" />);
    expect(await screen.findByText("Upload Invoice")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Submit Invoice")).toBeInTheDocument();
    expect(screen.queryByText("Skip")).not.toBeInTheDocument();
  });
});
