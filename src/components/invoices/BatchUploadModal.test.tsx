import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import BatchUploadModal from "./BatchUploadModal";
import { extractInvoiceFile } from "./invoiceExtraction";
import { createNotifications } from "@/lib/notify";
import { toast } from "sonner";

// Radix Dialog / Select rely on these in jsdom.
beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as any).scrollIntoView ??= () => {};
  (window.HTMLElement.prototype as any).hasPointerCapture ??= () => false;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [{ id: "p1", name: "Intech", hotel_name: null }] }) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/lib/notify", () => ({ createNotifications: vi.fn(async () => {}) }));
vi.mock("./invoiceExtraction", async (orig) => {
  const actual = await orig<typeof import("./invoiceExtraction")>();
  return {
    ...actual,
    extractInvoiceFile: vi.fn(),
    buildBudgetMatcher: vi.fn(async () => ({ categories: ["01 — General"], resolve: () => "" })),
  };
});

// The real review form is exercised by the type-check/build; here it's a stub
// that exposes exactly the batch contract the controller drives.
vi.mock("./UploadInvoiceModal", () => ({
  default: (props: any) => (
    <div data-testid="review">
      <span data-testid="review-info">
        {props.batch.position.index}/{props.batch.position.total} {props.batch.file.name} prefetched:
        {props.batch.prefetched?.kind ?? "none"} hasNext:{String(props.batch.position.hasNext)}
      </span>
      <button onClick={() => props.batch.onSaved({
        invoiceId: `inv-${props.batch.file.name}`, vendor: "Acme", amount: 100, approverIds: ["u1", "u2"],
      })}>stub-save</button>
      <button onClick={props.batch.onSkip}>stub-skip</button>
      <button onClick={() => props.onOpenChange(false)}>stub-back</button>
    </div>
  ),
}));

const mockExtract = vi.mocked(extractInvoiceFile);
const pdf = (name: string, size = 10) => new File(["x".repeat(size)], name, { type: "application/pdf" });
const okResult = (file: File) => ({
  kind: "pdf" as const,
  fields: { vendor_name: `Vendor ${file.name}`, invoice_number: "7", total_amount: 100, document_type: "invoice" },
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function renderBatch(extra: Record<string, any> = {}) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(<BatchUploadModal open onOpenChange={onOpenChange} defaultProjectId="p1" onCreated={onCreated} {...extra} />);
  return { onOpenChange, onCreated };
}
const footerClose = () => screen.getAllByText("Close").find((el) => el.tagName === "BUTTON")!;
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const addFiles = (files: File[]) => fireEvent.change(fileInput(), { target: { files } });

beforeEach(() => {
  vi.clearAllMocks();
  mockExtract.mockImplementation(async (f: File) => okResult(f));
});

describe("BatchUploadModal", () => {
  it("runs at most 3 extractions at once and finishes all of them", async () => {
    let inFlight = 0, maxInFlight = 0;
    mockExtract.mockImplementation(async (f: File) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(25);
      inFlight--;
      return okResult(f);
    });
    renderBatch();
    addFiles(["a", "b", "c", "d", "e"].map((n) => pdf(`${n}.pdf`)));
    await screen.findByText(/5 ready/, undefined, { timeout: 3000 });
    expect(maxInFlight).toBe(3);
    expect(mockExtract).toHaveBeenCalledTimes(5);
  });

  it("skips duplicate and unsupported files with a message", async () => {
    renderBatch();
    addFiles([pdf("a.pdf"), pdf("a.pdf"), new File(["x"], "notes.txt", { type: "text/plain" })]);
    await screen.findByText(/1 ready/);
    expect(screen.getAllByText("a.pdf")).toHaveLength(1);
    expect(toast.message).toHaveBeenCalledWith(expect.stringMatching(/already in this batch/));
    expect(toast.message).toHaveBeenCalledWith(expect.stringMatching(/only PDF and AIA Excel/));
  });

  it("refuses files until a project is chosen", () => {
    renderBatch({ defaultProjectId: null });
    const dropzone = fileInput().closest("label")!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [pdf("a.pdf")] } });
    expect(toast.error).toHaveBeenCalledWith("Select a project first.");
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("steps through reviews, then sends ONE notification per approver for the whole batch", async () => {
    const { onOpenChange, onCreated } = renderBatch();
    addFiles([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
    await screen.findByText(/3 ready/);

    fireEvent.click(screen.getByText("Start review"));
    expect(screen.getByTestId("review-info")).toHaveTextContent("1/3 a.pdf prefetched:pdf hasNext:true");
    fireEvent.click(screen.getByText("stub-save"));
    expect(screen.getByTestId("review-info")).toHaveTextContent("2/3 b.pdf");
    fireEvent.click(screen.getByText("stub-save"));
    expect(screen.getByTestId("review-info")).toHaveTextContent("3/3 c.pdf prefetched:pdf hasNext:false");
    expect(createNotifications).not.toHaveBeenCalled(); // nothing sent mid-batch
    fireEvent.click(screen.getByText("stub-save"));

    // pass complete → back to the queue, notifications flushed once
    await screen.findByText("Done");
    expect(createNotifications).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(createNotifications).mock.calls[0][0];
    expect(sent).toHaveLength(2);
    expect(sent.map((n: any) => n.user_id).sort()).toEqual(["u1", "u2"]);
    expect(sent[0].title).toBe("3 new invoices to approve");

    fireEvent.click(screen.getByText("Done"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(createNotifications).toHaveBeenCalledTimes(1); // no double send on close
  });

  it("sends a single-invoice notification with a deep link when only one was saved", async () => {
    renderBatch();
    addFiles([pdf("solo.pdf")]);
    await screen.findByText(/1 ready/);
    fireEvent.click(screen.getByText("Start review"));
    fireEvent.click(screen.getByText("stub-save"));
    await screen.findByText("Done");
    const sent = vi.mocked(createNotifications).mock.calls[0][0];
    expect(sent[0].title).toBe("New invoice to approve");
    expect(sent[0].invoice_id).toBe("inv-solo.pdf");
  });

  it("Skip leaves the file for later and 'Continue review' returns to it", async () => {
    renderBatch();
    addFiles([pdf("a.pdf"), pdf("b.pdf")]);
    await screen.findByText(/2 ready/);
    fireEvent.click(screen.getByText("Start review"));
    fireEvent.click(screen.getByText("stub-skip"));
    expect(screen.getByTestId("review-info")).toHaveTextContent("2/2 b.pdf");
    fireEvent.click(screen.getByText("stub-save"));

    await screen.findByText("Continue review");
    expect(screen.getByText(/1 saved/)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue review"));
    expect(screen.getByTestId("review-info")).toHaveTextContent("1/2 a.pdf");
    fireEvent.click(screen.getByText("stub-save"));
    await screen.findByText("Done");
    expect(createNotifications).toHaveBeenCalledTimes(2); // one per review pass, each collapsed
  });

  it("marks failed extractions 'Enter manually' and opens them with no prefill", async () => {
    mockExtract.mockImplementation(async (f: File) => (f.name === "bad.pdf" ? { kind: "pdf-error" as const } : okResult(f)));
    renderBatch();
    addFiles([pdf("bad.pdf")]);
    await screen.findByText("Enter manually");
    fireEvent.click(screen.getByText("Review"));
    expect(screen.getByTestId("review-info")).toHaveTextContent("prefetched:none");
  });

  it("retry re-runs extraction for a failed file", async () => {
    let calls = 0;
    mockExtract.mockImplementation(async (f: File) => (++calls === 1 ? { kind: "pdf-error" as const } : okResult(f)));
    renderBatch();
    addFiles([pdf("flaky.pdf")]);
    await screen.findByText("Enter manually");
    fireEvent.click(screen.getByTitle("Retry extraction"));
    await screen.findByText("Ready to review");
    expect(calls).toBe(2);
  });

  it("auto-opens the next file if the reviewer ran ahead of extraction", async () => {
    mockExtract.mockImplementation(async (f: File) => {
      await delay(f.name === "slow.pdf" ? 250 : 5);
      return okResult(f);
    });
    renderBatch();
    addFiles([pdf("fast.pdf"), pdf("slow.pdf")]);
    await waitFor(() => expect(screen.getByText(/1 ready/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Start review"));
    fireEvent.click(screen.getByText("stub-save")); // nothing ready yet; slow.pdf still extracting
    await waitFor(() => expect(screen.getByTestId("review-info")).toHaveTextContent("2/2 slow.pdf"), { timeout: 3000 });
    expect(createNotifications).not.toHaveBeenCalled(); // pass wasn't finished, so nothing flushed early
  });

  it("asks before discarding unsaved files, and keeps saved ones", async () => {
    const { onOpenChange } = renderBatch();
    addFiles([pdf("a.pdf"), pdf("b.pdf")]);
    await screen.findByText(/2 ready/);
    fireEvent.click(screen.getByText("Start review"));
    fireEvent.click(screen.getByText("stub-save"));
    fireEvent.click(screen.getByText("stub-back")); // back to queue with b.pdf unsaved
    fireEvent.click(footerClose());

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Discard 1 unsaved file\?/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 invoice has already been submitted/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText("Keep reviewing"));
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(footerClose());
    fireEvent.click(await within(await screen.findByRole("alertdialog")).findByText("Discard and close"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createNotifications).toHaveBeenCalledTimes(1); // the one saved invoice still notifies
  });
});
