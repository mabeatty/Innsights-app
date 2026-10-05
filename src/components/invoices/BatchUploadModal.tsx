import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, Clock, SkipForward, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createNotifications } from "@/lib/notify";
import { fmtDecimal } from "../budget/types";
import { formatProjectLabel } from "@/lib/projectLabel";
import UploadInvoiceModal, { type BatchSaveInfo } from "./UploadInvoiceModal";
import {
  buildBudgetMatcher, extractInvoiceFile, fileKind, isExtractionFailure, summarizeExtraction,
  type ExtractionResult,
} from "./invoiceExtraction";

// Each file is one Claude call (or a local Excel parse), so cap how many run
// at once rather than firing the whole batch simultaneously.
const CONCURRENCY = 3;

type ItemStatus = "queued" | "extracting" | "ready" | "failed" | "saved" | "skipped";

interface QueueItem {
  id: string;
  file: File;
  status: ItemStatus;
  result: ExtractionResult | null;
}

const isReviewable = (s: ItemStatus) => s === "ready" || s === "failed" || s === "skipped";
const isUnsaved = (s: ItemStatus) => s !== "saved";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProjectId?: string | null;
  onCreated?: () => void;
}

export default function BatchUploadModal({ open, onOpenChange, defaultProjectId, onCreated }: Props) {
  const [projects, setProjects] = useState<{ id: string; name: string; hotel_name: string | null }[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // itemsRef is the source of truth so the extraction pool (which runs outside
  // React's render cycle) always sees current statuses synchronously.
  const itemsRef = useRef<QueueItem[]>([]);
  const activeRef = useRef(0);
  const genRef = useRef(0); // bumped on reset so late results from a discarded batch are ignored
  const projectIdRef = useRef("");
  const categoriesRef = useRef<{ pid: string; categories: string[] } | null>(null);
  const waitingRef = useRef(false); // reviewer ran out of ready items while others were still extracting
  const savedRef = useRef<BatchSaveInfo[]>([]); // saved this batch, notifications not yet sent

  const commit = (next: QueueItem[]) => { itemsRef.current = next; setItems(next); };
  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  // Reset everything each time the batch dialog opens.
  useEffect(() => {
    if (!open) return;
    genRef.current++;
    activeRef.current = 0;
    categoriesRef.current = null;
    waitingRef.current = false;
    savedRef.current = [];
    commit([]);
    setReviewId(null);
    setDiscardOpen(false);
    const pid = defaultProjectId || "";
    setProjectId(pid);
    projectIdRef.current = pid;
    supabase.from("projects").select("id, name, hotel_name").order("name").then(({ data }) => setProjects(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId]);

  const getCategories = async (pid: string): Promise<string[]> => {
    if (categoriesRef.current?.pid === pid) return categoriesRef.current.categories;
    const { categories } = await buildBudgetMatcher(pid);
    categoriesRef.current = { pid, categories };
    return categories;
  };

  // Start queued extractions until CONCURRENCY are in flight; each finishing
  // job pulls the next one.
  const pump = () => {
    while (activeRef.current < CONCURRENCY) {
      const next = itemsRef.current.find((i) => i.status === "queued");
      if (!next) break;
      activeRef.current++;
      const gen = genRef.current;
      updateItem(next.id, { status: "extracting" });
      void (async () => {
        let result: ExtractionResult | null = null;
        try {
          const categories = fileKind(next.file) === "pdf" ? await getCategories(projectIdRef.current) : [];
          result = await extractInvoiceFile(next.file, categories);
        } catch {
          result = null;
        }
        if (gen !== genRef.current) return; // batch was reset/discarded meanwhile
        activeRef.current--;
        updateItem(next.id, { status: !result || isExtractionFailure(result) ? "failed" : "ready", result });
        // If the reviewer had run out of ready items, pick up where they left off.
        if (waitingRef.current) {
          waitingRef.current = false;
          setReviewId(next.id);
        }
        pump();
      })();
    }
  };

  // Manual navigation always cancels a pending auto-advance, so a stale
  // "waiting for extraction" flag can't pull the reviewer into a different
  // invoice while they're mid-entry on this one.
  const openReview = (id: string) => { waitingRef.current = false; setReviewId(id); };

  const addFiles = (incoming: File[]) => {
    if (!projectId) { toast.error("Select a project first."); return; }
    const supported = incoming.filter((f) => fileKind(f) !== "unsupported");
    const unsupportedCount = incoming.length - supported.length;
    const seen = new Set(itemsRef.current.map((i) => `${i.file.name}|${i.file.size}`));
    const fresh: File[] = [];
    let dupes = 0;
    for (const f of supported) {
      const key = `${f.name}|${f.size}`;
      if (seen.has(key)) { dupes++; continue; }
      seen.add(key);
      fresh.push(f);
    }
    if (unsupportedCount) toast.message(`Skipped ${unsupportedCount} file${unsupportedCount === 1 ? "" : "s"} — only PDF and AIA Excel (.xlsx) are supported.`);
    if (dupes) toast.message(`Skipped ${dupes} file${dupes === 1 ? "" : "s"} already in this batch.`);
    if (!fresh.length) return;
    commit([
      ...itemsRef.current,
      ...fresh.map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as ItemStatus, result: null })),
    ]);
    pump();
  };

  const retry = (id: string) => {
    updateItem(id, { status: "queued", result: null });
    pump();
  };

  const removeItem = (id: string) => commit(itemsRef.current.filter((i) => i.id !== id));

  // ---- review flow ----
  // Unseen files first (ready / needs-manual-entry), previously skipped ones last.
  const firstReviewable = () =>
    items.find((i) => i.status === "ready" || i.status === "failed") ?? items.find((i) => i.status === "skipped");

  const advance = (fromId: string) => {
    const next = itemsRef.current.find((i) => i.id !== fromId && (i.status === "ready" || i.status === "failed"));
    if (next) { setReviewId(next.id); return; }
    setReviewId(null);
    const stillWorking = itemsRef.current.some((i) => i.status === "queued" || i.status === "extracting");
    waitingRef.current = stillWorking;
    // Review pass finished with nothing in flight: send approver notifications now
    // rather than waiting for the batch to be explicitly closed.
    if (!stillWorking) void flushRef.current();
  };

  const handleSaved = (id: string) => (info: BatchSaveInfo) => {
    savedRef.current.push(info);
    updateItem(id, { status: "saved" });
    toast.success(`Saved ${savedRef.current.length} of ${itemsRef.current.length}`);
    advance(id);
  };

  const handleSkip = (id: string) => () => {
    updateItem(id, { status: "skipped" });
    advance(id);
  };

  // One notification per approver for the whole batch, instead of one per invoice.
  const flushNotifications = async () => {
    const saved = savedRef.current;
    savedRef.current = [];
    if (!saved.length) return;
    const projName = projects.find((p) => p.id === projectId)?.name || "a project";
    const byApprover = new Map<string, BatchSaveInfo[]>();
    for (const s of saved) for (const uid of s.approverIds) byApprover.set(uid, [...(byApprover.get(uid) ?? []), s]);
    await createNotifications(
      Array.from(byApprover.entries()).map(([uid, list]) => {
        const total = list.reduce((sum, s) => sum + s.amount, 0);
        return list.length === 1
          ? {
              user_id: uid, invoice_id: list[0].invoiceId, title: "New invoice to approve",
              body: `${list[0].vendor} · ${fmtDecimal(list[0].amount)} on ${projName} needs your approval.`,
            }
          : {
              user_id: uid, title: `${list.length} new invoices to approve`,
              body: `${list.length} invoices (${fmtDecimal(total)}) on ${projName} need your approval.`,
            };
      }),
    );
  };

  // Always points at the latest flushNotifications so the unmount cleanup below
  // doesn't close over stale project/queue state.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  flushRef.current = flushNotifications;
  useEffect(() => () => { void flushRef.current(); }, []);

  const closeBatch = async () => {
    genRef.current++; // ignore any extraction still in flight
    activeRef.current = 0;
    await flushNotifications();
    const hadSaves = itemsRef.current.some((i) => i.status === "saved");
    commit([]);
    setReviewId(null);
    setDiscardOpen(false);
    onOpenChange(false);
    if (hadSaves) onCreated?.();
  };

  const requestClose = () => {
    const unsaved = itemsRef.current.filter((i) => isUnsaved(i.status)).length;
    if (unsaved > 0) setDiscardOpen(true);
    else void closeBatch();
  };

  const counts = {
    saved: items.filter((i) => i.status === "saved").length,
    ready: items.filter((i) => i.status === "ready").length,
    working: items.filter((i) => i.status === "queued" || i.status === "extracting").length,
    failed: items.filter((i) => i.status === "failed").length,
    skipped: items.filter((i) => i.status === "skipped").length,
  };
  const unsavedCount = items.length - counts.saved;
  const reviewItem = items.find((i) => i.id === reviewId) ?? null;
  const reviewIndex = reviewItem ? items.findIndex((i) => i.id === reviewItem.id) : -1;
  const hasNext = reviewItem
    ? items.some((i) => i.id !== reviewItem.id && (i.status === "ready" || i.status === "failed"))
    : false;
  const startable = firstReviewable();

  const statusBadge = (i: QueueItem) => {
    switch (i.status) {
      case "queued": return <Badge variant="outline" className="text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Waiting</Badge>;
      case "extracting": return <Badge variant="outline" className="text-[10px] gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />Extracting</Badge>;
      case "ready": return <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200"><FileText className="h-2.5 w-2.5" />Ready to review</Badge>;
      case "failed": return <Badge variant="outline" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="h-2.5 w-2.5" />Enter manually</Badge>;
      case "saved": return <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 className="h-2.5 w-2.5" />Saved</Badge>;
      case "skipped": return <Badge variant="outline" className="text-[10px] gap-1"><SkipForward className="h-2.5 w-2.5" />Skipped</Badge>;
    }
  };

  const rowSummary = (i: QueueItem) => {
    if (!i.result || i.status === "queued" || i.status === "extracting") return null;
    if (i.status === "failed") {
      return i.result.kind === "excel-unrecognized" ? "Not a recognized AIA workbook" : "Couldn't extract — fill in by hand";
    }
    const s = summarizeExtraction(i.result);
    return [s.label, s.vendor, s.invoiceNumber ? `#${s.invoiceNumber}` : null, s.amount != null ? fmtDecimal(s.amount) : null]
      .filter(Boolean).join(" · ");
  };

  return (
    <>
      <Dialog open={open && !reviewItem} onOpenChange={(v) => { if (!v) requestClose(); }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload multiple invoices</DialogTitle>
            <DialogDescription>
              All files go to one project. Extraction runs in the background; you review and submit each invoice one at a time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select
                value={projectId}
                onValueChange={(v) => { setProjectId(v); projectIdRef.current = v; }}
                disabled={!!defaultProjectId || items.length > 0}
              >
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{formatProjectLabel(p.name, p.hotel_name)}</SelectItem>)}
                </SelectContent>
              </Select>
              {!defaultProjectId && items.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Project is locked once files are added — close this batch to switch projects.</p>
              )}
            </div>

            <label
              onDragOver={(e) => { e.preventDefault(); if (projectId) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors
                ${projectId ? "cursor-pointer hover:bg-muted/40" : "opacity-50 cursor-not-allowed"}
                ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{projectId ? "Drop invoices here, or click to select" : "Select a project first"}</span>
              <span className="text-[11px] text-muted-foreground">PDF invoices and AIA pay apps (.xlsx)</span>
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,application/pdf"
                className="hidden"
                disabled={!projectId}
                onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
            </label>

            {items.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  {counts.saved} saved · {counts.ready} ready · {counts.working} extracting · {counts.failed} manual entry · {counts.skipped} skipped
                </p>
                <div className="rounded-md border divide-y max-h-[40vh] overflow-y-auto">
                  {items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{i.file.name}</p>
                        {rowSummary(i) && <p className="text-xs text-muted-foreground truncate">{rowSummary(i)}</p>}
                      </div>
                      {statusBadge(i)}
                      <div className="flex items-center gap-1 shrink-0">
                        {isReviewable(i.status) && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openReview(i.id)}>Review</Button>
                        )}
                        {i.status === "failed" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Retry extraction" onClick={() => retry(i.id)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {i.status !== "saved" && i.status !== "extracting" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Remove from batch" onClick={() => removeItem(i.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose}>
              {items.length > 0 && unsavedCount === 0 ? "Done" : "Close"}
            </Button>
            {startable && (
              <Button onClick={() => openReview(startable.id)}>
                {counts.saved > 0 ? "Continue review" : "Start review"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reviewItem && (
        <UploadInvoiceModal
          open
          onOpenChange={(v) => { if (!v) { waitingRef.current = false; setReviewId(null); } }}
          defaultProjectId={projectId}
          batch={{
            resetKey: reviewItem.id,
            file: reviewItem.file,
            prefetched: reviewItem.status === "failed" ? null : reviewItem.result,
            position: { index: reviewIndex + 1, total: items.length, hasNext },
            onSkip: handleSkip(reviewItem.id),
            onSaved: handleSaved(reviewItem.id),
          }}
        />
      )}

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard {unsavedCount} unsaved file{unsavedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {counts.saved > 0
                ? `${counts.saved} invoice${counts.saved === 1 ? " has" : "s have"} already been submitted and will stay. `
                : ""}
              The remaining files haven't been submitted and will be dropped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={() => void closeBatch()}>Discard and close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
