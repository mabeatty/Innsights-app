import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Sparkles, Upload, Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { APPROVER_ROLES } from "./types";
import { ALL_DIVISIONS, TRANSACTION_TYPES, fmtDecimal } from "../budget/types";
import { createNotifications } from "@/lib/notify";
import type { AIADetailRow } from "./aiaExcel";
import { buildBudgetMatcher, extractInvoiceFile, fileKind, type ExtractionResult } from "./invoiceExtraction";
import DriveFolderPicker from "./DriveFolderPicker";
import { format } from "date-fns";
import { formatProjectLabel } from "@/lib/projectLabel";

interface Project { id: string; name: string; hotel_name: string | null }

interface LineItem {
  id: string;
  division: string;
  amount: number;
  retainageAmount: number;
  description: string;
  fromAI?: boolean;        // populated by AI extraction (eligible for re-matching)
  aiCategory?: string | null; // Claude's suggested category string, for re-matching
}

let lineCounter = 0;
const newLine = (): LineItem => ({ id: `l-${++lineCounter}`, division: "", amount: 0, retainageAmount: 0, description: "" });

// Tokens to ignore when matching an AIA file/project field to a project name.
const PROJECT_STOPWORDS = new Set([
  "aia", "g702", "g703", "702", "703", "draw", "application", "app", "pay", "payment",
  "certificate", "continuation", "sheet", "copy", "final", "invoice", "xlsx", "xls", "pdf",
  "the", "and", "of", "for", "llc", "lp", "inc",
]);
const projTokens = (s: string): string[] =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((w) => w.length > 1 && !PROJECT_STOPWORDS.has(w) && !/^\d+$/.test(w));

// Identify a project from AIA signals (file name + 702 project field) against the
// project list (name + entity). Confident = a unique top scorer; otherwise we
// surface it as a suggestion for one-click accept.
function identifyProject(
  candidates: string[],
  projects: { id: string; name: string; search: string }[],
): { match?: { id: string; name: string }; suggestion?: { id: string; name: string } } {
  const cand = new Set(candidates.flatMap(projTokens));
  if (cand.size === 0) return {};
  const scored = projects
    .map((p) => {
      const pt = new Set(projTokens(p.search));
      let score = 0;
      for (const t of cand) if (pt.has(t)) score++;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return {};
  const best = scored[0];
  const second = scored[1];
  const confident = !second || best.score > second.score;
  const hit = { id: best.p.id, name: best.p.name };
  return confident ? { match: hit } : { suggestion: hit };
}

export interface BatchSaveInfo {
  invoiceId: string;
  vendor: string;
  amount: number;
  approverIds: string[];
}

// Batch mode: the batch uploader drives this same form one file at a time, so
// there is exactly one save path (and one set of validation/approval/budget
// side effects) for single and batch uploads alike.
export interface BatchModeProps {
  resetKey: string;                       // changes per file → form resets and re-applies
  file: File;
  prefetched: ExtractionResult | null;    // background extraction result (null = enter manually)
  position: { index: number; total: number; hasNext: boolean };
  onSkip: () => void;
  onSaved: (info: BatchSaveInfo) => void; // replaces per-invoice notifications + modal close
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProjectId?: string | null;
  onCreated?: () => void;
  batch?: BatchModeProps;
}

export default function UploadInvoiceModal({ open, onOpenChange, defaultProjectId, onCreated, batch }: Props) {
  const { user, organizationId } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(undefined);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [dueDateSource, setDueDateSource] = useState<"none" | "checking" | "contract" | "not-found">("none");
  const [projectId, setProjectId] = useState<string>(defaultProjectId || "");
  const [transactionType, setTransactionType] = useState<string>("Vendor Invoice");
  const [supportingDocsLink, setSupportingDocsLink] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectEntities, setProjectEntities] = useState<Record<string, string>>({});
  const [suggestedProject, setSuggestedProject] = useState<{ id: string; name: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, boolean>>({});
  const [docType, setDocType] = useState<string | null>(null);
  const [aiaDetailRows, setAiaDetailRows] = useState<AIADetailRow[]>([]);
  const [excelFallback, setExcelFallback] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) {
    lineCounter = 0;
    setFile(null); setVendor(""); setInvoiceNumber(""); setInvoiceDate(undefined);
    setDueDate(undefined); setDueDateTouched(false);
    setTransactionType("Vendor Invoice"); setSupportingDocsLink(""); setNotes("");
    setLineItems([newLine()]); setExtracted({}); setDocType(null); setAiaDetailRows([]); setExcelFallback(false); setSuggestedProject(null); setProjectId(defaultProjectId || "");
    // Was never reset: a tax-exempt flag set on one upload silently carried
    // into the next one (this modal stays mounted between opens, and batch
    // mode reuses it for every file).
    setTaxExempt(false);
  } }, [open, defaultProjectId, batch?.resetKey]);

  useEffect(() => {
    if (!open) return;
    supabase.from("projects").select("id, name, hotel_name").order("name").then(({ data }) => setProjects(data ?? []));
    supabase.from("project_info").select("project_id, entity_name").then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r.entity_name) m[r.project_id] = r.entity_name; });
      setProjectEntities(m);
    });
  }, [open]);

  const updateLine = (id: string, field: keyof LineItem, value: any) =>
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  const removeLine = (id: string) =>
    setLineItems((prev) => (prev.length > 1 ? prev.filter((li) => li.id !== id) : prev));

  // Suggest a due date from the matching contract's payment terms (vendor name +
  // project match). Only fills the field if the user hasn't manually set/cleared
  // it themselves, so this never silently overrides an explicit entry.
  // dueDateSource tracks the outcome so the UI can show it plainly instead of
  // this either silently succeeding or silently doing nothing.
  useEffect(() => {
    if (!open || dueDateTouched || !invoiceDate || !vendor.trim() || !projectId) {
      setDueDateSource("none");
      return;
    }
    let cancelled = false;
    setDueDateSource("checking");
    (async () => {
      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("project_id", projectId)
        .ilike("name", `%${vendor.trim()}%`);
      const vendorIds = (vendors ?? []).map((v: any) => v.id);
      if (vendorIds.length === 0) { if (!cancelled) setDueDateSource("not-found"); return; }
      const { data: matchingContracts } = await supabase
        .from("contracts")
        .select("payment_terms_days")
        .eq("project_id", projectId)
        .in("vendor_id", vendorIds)
        .not("payment_terms_days", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const terms = matchingContracts?.[0]?.payment_terms_days;
      if (terms) {
        const d = new Date(invoiceDate);
        d.setDate(d.getDate() + Number(terms));
        setDueDate(d);
        setDueDateSource("contract");
      } else {
        setDueDateSource("not-found");
      }
    })();
    return () => { cancelled = true; };
  }, [open, vendor, projectId, invoiceDate, dueDateTouched]);

  // Re-run category matching whenever the project changes (e.g. a PDF was dropped
  // before a project was chosen, or the user switches projects after extraction).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { resolve } = await buildBudgetMatcher(projectId);
      if (cancelled) return;
      setLineItems((prev) =>
        prev.some((li) => li.fromAI)
          ? prev.map((li) => (li.fromAI ? { ...li, division: resolve(li.aiCategory, li.description) } : li))
          : prev,
      );
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);
  const totalRetainage = lineItems.reduce((s, li) => s + li.retainageAmount, 0);
  const totalNet = totalAmount - totalRetainage;

  // Apply an extraction result (from the shared extractor) to the form. Used
  // for a file picked in this form AND for results the batch uploader already
  // computed in the background. `pid` is passed explicitly because in batch
  // mode this runs in the same tick as the reset, before projectId state settles.
  const applyExtraction = async (f: File, result: ExtractionResult, pid: string) => {
    switch (result.kind) {
      case "excel-unrecognized":
        toast.message("Not a recognized AIA Excel (needs a Detail or 703 sheet) — fill in fields manually");
        return;
      case "excel-error":
        console.warn("[invoice] Excel parse error:", result.message);
        toast.message("Couldn't parse this Excel file — fill in fields manually");
        return;
      case "pdf-error":
        console.warn("[invoice] AI extraction unavailable:", result.message);
        toast.error(result.message ? `AI extraction failed: ${result.message}` : "AI extraction unavailable — please fill in fields manually");
        return;
      case "unsupported":
        return;
      case "excel": {
        const res = result.res;
        setExcelFallback(res.source === "703");
        const flagged: Record<string, boolean> = {};
        if (res.vendor_name) { setVendor(res.vendor_name); flagged.vendor = true; }
        if (res.invoice_number) { setInvoiceNumber(String(res.invoice_number)); flagged.invoice_number = true; }
        if (res.invoice_date) {
          const d = new Date(res.invoice_date);
          if (!isNaN(d.getTime())) { setInvoiceDate(d); flagged.invoice_date = true; }
        }
        setDocType("aia_pay_app");
        setTransactionType("Contractor Pay Application");
        setAiaDetailRows(res.detail_rows);

        // Auto-identify the project from the file name + 702 PROJECT field, unless
        // the modal is already scoped to a project (always the case in batch mode).
        if (!defaultProjectId) {
          const searchProjects = projects.map((p) => ({
            id: p.id, name: p.name, search: `${p.name} ${projectEntities[p.id] ?? ""}`,
          }));
          const { match, suggestion } = identifyProject([f.name, res.project_name ?? ""], searchProjects);
          if (match) { setProjectId(match.id); setSuggestedProject(null); }
          else if (suggestion) { setSuggestedProject(suggestion); }
          console.log("[aia] project match:", { file: f.name, projectField: res.project_name, match, suggestion });
        }

        if (res.line_items.length > 0) {
          // The dropdown value IS the division number, which matches the AIA item
          // number — so set it directly for a guaranteed auto-select. Not flagged
          // fromAI, so the project-change re-matcher leaves these exact matches alone.
          lineCounter = 0;
          const rows: LineItem[] = res.line_items.map((li) => ({
            ...newLine(),
            division: li.aia_item,
            amount: li.amount,
            retainageAmount: li.retainage || 0,
            description: li.description,
          }));
          setLineItems(rows);
          flagged.amount = true;
        }
        setExtracted(flagged);
        toast.success(`AIA Excel parsed — ${res.line_items.length} divisions for draw ${res.application_number ?? ""} (net ${fmtDecimal(res.totals.net)})`);
        return;
      }
      case "pdf": {
        const fields = result.fields;
        const { resolve: resolveDivision } = await buildBudgetMatcher(pid);
        const flagged: Record<string, boolean> = {};
        if (fields.vendor_name) { setVendor(fields.vendor_name); flagged.vendor = true; }
        if (fields.invoice_number) { setInvoiceNumber(String(fields.invoice_number)); flagged.invoice_number = true; }
        if (fields.invoice_date) { const d = new Date(fields.invoice_date); if (!isNaN(d.getTime())) { setInvoiceDate(d); flagged.invoice_date = true; } }

        setDocType(fields.document_type ?? null);

        if (fields.document_type === "aia_pay_app") {
          // AIA pay app: total is computed from G703 lines, so leave the Amount
          // field blank and auto-populate the line items with this-period amounts.
          // Filter out any $0 / null lines — never show empty rows.
          const items = (Array.isArray(fields.line_items) ? fields.line_items : [])
            .filter((li: any) => Number(li?.amount) > 0);
          if (items.length > 0) {
            lineCounter = 0;
            const rows: LineItem[] = items.map((li: any) => ({
              ...newLine(),
              division: resolveDivision(li?.category, typeof li?.description === "string" ? li.description : ""),
              amount: Number(li?.amount) || 0,
              description: typeof li?.description === "string" ? li.description : "",
              fromAI: true,
              aiCategory: typeof li?.category === "string" ? li.category : null,
            }));
            setLineItems(rows);
          }
          setTransactionType("Contractor Pay Application");
          toast.success("AIA pay application detected — verify line items and assign categories");
        } else {
          // Regular invoice: pre-fill the first row's amount with the total.
          const total = fields.total_amount ?? fields.amount;
          if (total != null) {
            setLineItems((prev) => prev.map((li, i) => (i === 0 ? { ...li, amount: Number(total) || 0 } : li)));
            flagged.amount = true;
          }
          toast.success("AI extracted header fields — please add line items and categories");
        }
        setExtracted(flagged);
        return;
      }
    }
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setAiaDetailRows([]); setExcelFallback(false); setSuggestedProject(null); // reset; set again only for AIA Excel
    if (fileKind(f) === "unsupported") return;
    setExtracting(true);
    try {
      // Send the selected project's budget categories so Claude can map each
      // line item to a real category. If no project is selected yet, categories
      // is empty and matching is deferred until the user picks one.
      const { categories } = await buildBudgetMatcher(projectId);
      const result = await extractInvoiceFile(f, categories);
      await applyExtraction(f, result, projectId);
    } catch (e: any) {
      console.warn("[invoice] extraction error:", e?.message);
      toast.error(e?.message ? `AI extraction failed: ${e.message}` : "AI extraction unavailable — please fill in fields manually");
    } finally {
      setExtracting(false);
    }
  };

  // Batch mode: when the batch uploader hands this form a file, load it and
  // apply the extraction it already ran in the background. Declared after the
  // reset effect so the reset happens first for each new file.
  const appliedBatchKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !batch) { appliedBatchKey.current = null; return; }
    if (appliedBatchKey.current === batch.resetKey) return;
    appliedBatchKey.current = batch.resetKey;
    setFile(batch.file);
    if (batch.prefetched) void applyExtraction(batch.file, batch.prefetched, defaultProjectId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batch?.resetKey]);

  // Flag a likely duplicate before submitting. Same vendor on this project with
  // the same invoice number — or, with no invoice number, the same date and
  // amount. Advisory only: recurring same-amount charges are legitimate.
  const [duplicate, setDuplicate] = useState<{ vendor_name: string | null; invoice_number: string | null; amount: number | null; status: string; invoice_date: string | null } | null>(null);
  useEffect(() => {
    const invNo = invoiceNumber.trim();
    const dateStr = invoiceDate ? format(invoiceDate, "yyyy-MM-dd") : null;
    if (!open || !projectId || !vendor.trim() || (!invNo && !(dateStr && totalAmount > 0))) {
      setDuplicate(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      let q = supabase
        .from("invoices")
        .select("vendor_name, invoice_number, amount, status, invoice_date")
        .eq("project_id", projectId)
        .ilike("vendor_name", vendor.trim().replace(/[%_]/g, "\\$&"));
      q = invNo ? q.eq("invoice_number", invNo) : q.eq("invoice_date", dateStr!).eq("amount", totalAmount);
      const { data } = await q.limit(1);
      if (!cancelled) setDuplicate(data && data.length ? (data[0] as any) : null);
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, projectId, vendor, invoiceNumber, invoiceDate, totalAmount]);

  const handleSave = async () => {
    if (!file) return toast.error("Please upload a PDF.");
    if (!vendor || !projectId) return toast.error("Vendor and Project are required.");
    const validLines = lineItems.filter((li) => li.division && li.amount > 0);
    if (validLines.length === 0) return toast.error("Add at least one division line with an amount.");
    if (!organizationId || !user) return toast.error("Not authenticated.");
    setSaving(true);
    try {
      const path = `${projectId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("invoices").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);
      const pdfUrl = signed?.signedUrl ?? null;

      // Resolve approvers: PM and Lead, both set per project.
      const { data: approverRows } = await supabase
        .from("project_approvers")
        .select("role, approver_id")
        .eq("project_id", projectId);
      const approverMap: Record<string, string | null> = {};
      (approverRows ?? []).forEach((r) => { approverMap[r.role] = r.approver_id; });
      const hasApprovers = APPROVER_ROLES.some((r) => approverMap[r.key]);
      const status = hasApprovers ? "In Approval" : "Pending Review";

      const firstDiv = ALL_DIVISIONS.find((d) => d.number === validLines[0].division);
      const budgetLineSummary = validLines.length === 1
        ? `${firstDiv?.number} — ${firstDiv?.name}`
        : `${validLines.length} divisions`;

      // 1. Invoice
      const { data: inv, error } = await supabase.from("invoices").insert({
        organization_id: organizationId,
        project_id: projectId,
        vendor_name: vendor,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate ? format(invoiceDate, "yyyy-MM-dd") : null,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        amount: totalAmount,
        retainage_amount: totalRetainage,
        net_amount: totalNet,
        lienable_amount: totalNet,
        aia_detail_rows: aiaDetailRows.length ? aiaDetailRows : null,
        cost_type: firstDiv?.cost_type === "hard" ? "Hard Cost" : firstDiv?.cost_type === "soft" ? "Soft Cost" : null,
        budget_line_item: budgetLineSummary,
        status,
        submitted_by: user.id,
        submitted_by_email: user.email,
        notes: notes || null,
        drive_url: supportingDocsLink || null,
        tax_exempt: taxExempt,
        tax_exempt_by: taxExempt ? user.id : null,
        tax_exempt_at: taxExempt ? new Date().toISOString() : null,
        pdf_url: pdfUrl,
        pdf_path: path,
        source: "manual",
        ai_extracted_fields: Object.keys(extracted).length ? extracted : null,
      }).select("id").single();
      if (error) throw error;

      // 2. Approval chain (one row per role)
      const { error: apprErr } = await supabase.from("invoice_approvals").insert(
        APPROVER_ROLES.map((r) => ({
          invoice_id: inv!.id, approver_role: r.key, approver_id: approverMap[r.key] ?? null, status: "Pending",
        })),
      );
      if (apprErr) throw apprErr;

      // 2b. Invoice line items (one row per division/category line).
      const { error: liErr } = await supabase.from("invoice_line_items").insert(
        validLines.map((li) => {
          const div = ALL_DIVISIONS.find((d) => d.number === li.division);
          return {
            invoice_id: inv!.id,
            category: div ? `${div.number} — ${div.name}` : li.division,
            amount: li.amount,
            retainage_amount: li.retainageAmount,
            net_amount: li.amount - li.retainageAmount,
          };
        }),
      );
      if (liErr) throw liErr;

      // 3. Linked budget_transactions (one per division line) — reflected in the
      //    project's transactions sub-tab. Not draw-eligible until the invoice is approved.
      const { count } = await supabase
        .from("budget_transactions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      const groupId = crypto.randomUUID();
      const txnDate = invoiceDate ? format(invoiceDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
      const txnRows = validLines.map((li) => {
        const div = ALL_DIVISIONS.find((d) => d.number === li.division);
        const retAmt = li.retainageAmount;
        return {
          project_id: projectId,
          invoice_id: inv!.id,
          transaction_group_id: groupId,
          transaction_type: transactionType,
          transaction_number: (count ?? 0) + 1,
          date: txnDate,
          payee: vendor,
          division_number: li.division,
          division_name: div?.name ?? "",
          description: li.description || "",
          amount: li.amount,
          retainage_percent: li.amount > 0 ? (retAmt / li.amount) * 100 : 0,
          retainage_amount: retAmt,
          net_amount: li.amount - retAmt,
          status: "Pending",
          notes: notes || null,
          document_url: pdfUrl,
        };
      });
      const { error: txnErr } = await supabase.from("budget_transactions").insert(txnRows);
      if (txnErr) throw txnErr;

      await supabase.from("invoice_audit_trail").insert({
        invoice_id: inv!.id, action: "Invoice submitted", performed_by: user.id,
        performed_by_name: user.email, notes: `Vendor: ${vendor}${invoiceNumber ? ` · ${invoiceNumber}` : ""}`,
      });

      if (batch) {
        // Batch: the uploader collapses notifications into one per approver
        // for the whole batch, and decides what to show next.
        batch.onSaved({
          invoiceId: inv!.id,
          vendor,
          amount: totalAmount,
          approverIds: hasApprovers
            ? Array.from(new Set(APPROVER_ROLES.map((r) => approverMap[r.key]).filter((v): v is string => !!v)))
            : [],
        });
      } else {
        if (hasApprovers) {
          const projName = projects.find((p) => p.id === projectId)?.name || "a project";
          await createNotifications(APPROVER_ROLES.map((r) => ({
            user_id: approverMap[r.key] ?? undefined, invoice_id: inv!.id,
            title: "New invoice to approve",
            body: `${vendor} · ${fmtDecimal(totalAmount)} on ${projName} needs your approval.`,
          })));
        }

        toast.success(hasApprovers
          ? "Invoice submitted — routed to approvers and added to the project's transactions."
          : "Invoice submitted. Assign approvers in Project Info to start the approval chain.");
        onOpenChange(false);
        onCreated?.();
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  };

  const AIBadge = () => <Badge variant="outline" className="ml-2 text-[10px] gap-1 bg-purple-50 text-purple-700 border-purple-200"><Sparkles className="h-2.5 w-2.5" />AI extracted</Badge>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[57.6rem] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {batch ? `Invoice ${batch.position.index} of ${batch.position.total}` : "Upload Invoice"}
            {batch && <span className="text-sm font-normal text-muted-foreground truncate max-w-[24rem]">{batch.file.name}</span>}
            {docType && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200">
                <Sparkles className="h-2.5 w-2.5" />
                {docType === "aia_pay_app" ? "AIA Pay Application" : "Standard Invoice"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {duplicate && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-300/10 px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <span className="font-semibold">Possible duplicate:</span>{" "}
                {duplicate.vendor_name}{duplicate.invoice_number ? ` #${duplicate.invoice_number}` : ""} · {fmtDecimal(Number(duplicate.amount ?? 0))} is
                already on this project ({duplicate.status}{duplicate.invoice_date ? `, ${duplicate.invoice_date}` : ""}). Check before submitting.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center">Vendor Name * {extracted.vendor && <AIBadge />}</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Invoice Number {extracted.invoice_number && <AIBadge />}</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Invoice Date {extracted.invoice_date && <AIBadge />}</Label>
              <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} heightClass="h-10" textClass="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center">Due Date</Label>
              <DatePickerInput
                value={dueDate}
                onChange={(d) => { setDueDate(d ?? undefined); setDueDateTouched(true); }}
                heightClass="h-10"
                textClass="text-sm"
              />
              {dueDateSource === "checking" && (
                <p className="text-[11px] text-muted-foreground">Checking for contract payment terms…</p>
              )}
              {dueDateSource === "contract" && (
                <p className="text-[11px] text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" /> Suggested from this vendor's contract terms — review and adjust if needed.</p>
              )}
              {dueDateSource === "not-found" && (
                <p className="text-[11px] text-muted-foreground">No contract with payment terms found for this vendor — set the due date manually.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!!defaultProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{formatProjectLabel(p.name, p.hotel_name)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Select a project to auto-match line item categories</p>
              {suggestedProject && !projectId && (
                <p className="text-[11px] text-primary">
                  Suggested:{" "}
                  <button
                    type="button"
                    className="underline font-medium"
                    onClick={() => { setProjectId(suggestedProject.id); setSuggestedProject(null); }}
                  >
                    {suggestedProject.name}
                  </button>?
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Upload invoice and related documents *</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-2 border border-dashed rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm">
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{file ? file.name : "Choose PDF or Excel file…"}</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                </label>
                {extracting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-[11px] text-muted-foreground">Excel AIA files (with 702/703 sheets) are parsed directly; PDFs use AI extraction.</p>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Supporting Documents (Google Drive)</Label>
              <DriveFolderPicker value={supportingDocsLink} onChange={setSupportingDocsLink} />
              <p className="text-[11px] text-muted-foreground">Optional — link a folder for lien waivers, backup invoices, or other documents that support a pay application.</p>
            </div>
            <div className="col-span-2 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-300/40 bg-amber-50 dark:bg-amber-300/10 px-3 py-2.5">
              <Checkbox id="tax-exempt" checked={taxExempt} onCheckedChange={(v) => setTaxExempt(v === true)} className="mt-0.5" />
              <div>
                <Label htmlFor="tax-exempt" className="cursor-pointer">This invoice contains tax-exempt materials</Label>
                <p className="text-[11px] text-muted-foreground">
                  Check this if you believe the invoice includes tax-exempt items. This is a whole-invoice flag for now — an
                  invoice with a mix of exempt and non-exempt items isn't broken out yet.
                </p>
              </div>
            </div>
          </div>

          {/* Division line items */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Division Line Items * {extracted.amount && <AIBadge />}</Label>
            {excelFallback && (
              <p className="text-[11px] text-amber-600 mb-2">
                Parsed from G703 summary — no Detail tab found, retainage may need manual entry.
              </p>
            )}
            <div className="rounded-lg border overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                    <th className="px-2 py-1.5 min-w-[180px]">Category</th>
                    <th className="px-2 py-1.5 w-28">Amount</th>
                    <th className="px-2 py-1.5 w-28">Retainage</th>
                    <th className="px-2 py-1.5 w-28 text-right">Net Amount</th>
                    <th className="px-2 py-1.5">Description</th>
                    <th className="px-2 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li) => (
                    <tr key={li.id} className="border-t">
                      <td className="px-2 py-1.5">
                        <Select value={li.division} onValueChange={(v) => updateLine(li.id, "division", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {ALL_DIVISIONS.map((d) => <SelectItem key={d.number} value={d.number}>{d.number} — {d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" step="0.01" className="h-8 text-xs" value={li.amount || ""} onChange={(e) => updateLine(li.id, "amount", Number(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" step="0.01" min="0" placeholder="0.00" className="h-8 text-xs" value={li.retainageAmount || ""} onChange={(e) => updateLine(li.id, "retainageAmount", Number(e.target.value) || 0)} />
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground text-right">{fmtDecimal(li.amount - li.retainageAmount)}</td>
                      <td className="px-2 py-1.5">
                        <Input className="h-8 text-xs" value={li.description} onChange={(e) => updateLine(li.id, "description", e.target.value)} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remove" onClick={() => removeLine(li.id)} disabled={lineItems.length <= 1}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold text-xs">
                    <td className="px-2 py-1.5">Totals</td>
                    <td className="px-2 py-1.5">{fmtDecimal(totalAmount)}</td>
                    <td className="px-2 py-1.5">{fmtDecimal(totalRetainage)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtDecimal(totalNet)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setLineItems((prev) => [...prev, newLine()])}>
              <Plus className="h-3 w-3" /> Add Line Item
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{batch ? "Back to queue" : "Cancel"}</Button>
          {batch && <Button variant="outline" onClick={batch.onSkip} disabled={saving}>Skip</Button>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : batch ? (batch.position.hasNext ? "Submit & Next" : "Submit & Finish") : "Submit Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
