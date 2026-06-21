import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Sparkles, Upload, Loader2, Plus, Trash2, Link as LinkIcon, FileText, Image as ImageIcon, File as FileIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { APPROVER_ROLES } from "./types";
import { ALL_DIVISIONS, TRANSACTION_TYPES, fmtDecimal } from "../budget/types";
import { createNotifications } from "@/lib/notify";
import { parseAIAExcel, type AIADetailRow } from "./aiaExcel";
import { uploadInvoiceDocument, formatFileSize } from "./invoiceDocuments";
import { format } from "date-fns";

interface Project { id: string; name: string }

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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProjectId?: string | null;
  onCreated?: () => void;
}

export default function UploadInvoiceModal({ open, onOpenChange, defaultProjectId, onCreated }: Props) {
  const { user, organizationId } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | undefined>(undefined);
  const [projectId, setProjectId] = useState<string>(defaultProjectId || "");
  const [transactionType, setTransactionType] = useState<string>("Vendor Invoice");
  const [documentLink, setDocumentLink] = useState("");
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
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileIconFor = (type: string | null, name: string) => {
    const t = (type || "").toLowerCase();
    const n = name.toLowerCase();
    if (t.includes("pdf") || n.endsWith(".pdf")) return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
    if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />;
    return <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
  };
  const addSupporting = (files: FileList | File[] | null) => {
    if (!files) return;
    setSupportingFiles((prev) => [...prev, ...Array.from(files)]);
  };

  useEffect(() => { if (open) {
    lineCounter = 0;
    setFile(null); setVendor(""); setInvoiceNumber(""); setInvoiceDate(undefined);
    setTransactionType("Vendor Invoice"); setDocumentLink(""); setNotes("");
    setLineItems([newLine()]); setExtracted({}); setDocType(null); setAiaDetailRows([]); setExcelFallback(false); setSupportingFiles([]); setDragActive(false); setSuggestedProject(null); setProjectId(defaultProjectId || "");
  } }, [open, defaultProjectId]);

  useEffect(() => {
    if (!open) return;
    supabase.from("projects").select("id, name").order("name").then(({ data }) => setProjects(data ?? []));
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

  // Fetch a project's budget categories and return both the category labels (to
  // send to the edge function) and a resolver that maps an AI category/description
  // to a budget division number. Used at extraction time AND when the project
  // changes afterwards, so matching works regardless of upload order.
  const buildBudgetMatcher = useCallback(async (pid: string) => {
    const catToDivision = new Map<string, string>();
    const budgetCats: { number: string; name: string }[] = [];
    const categories: string[] = [];
    if (pid) {
      const { data: budget } = await supabase
        .from("project_budget")
        .select("division_number, division_name")
        .eq("project_id", pid)
        .order("division_number");
      for (const r of (budget ?? []) as { division_number: string; division_name: string }[]) {
        const label = `${r.division_number} — ${r.division_name}`;
        categories.push(label);
        catToDivision.set(label.toLowerCase().trim(), r.division_number);
        budgetCats.push({ number: r.division_number, name: r.division_name });
      }
    }
    const tokenize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
    const fuzzy = (textRaw: string): string => {
      const text = (textRaw || "").toLowerCase().trim();
      if (!text) return "";
      if (catToDivision.has(text)) return catToDivision.get(text)!;
      const numHit = text.match(/^(\d{1,2})\b/);
      if (numHit) {
        const padded = numHit[1].padStart(2, "0");
        const c = budgetCats.find((b) => b.number === padded);
        if (c) return c.number;
      }
      const words = tokenize(text);
      let best = ""; let bestScore = 0;
      for (const c of budgetCats) {
        const name = c.name.toLowerCase();
        const score = words.filter((w) => name.includes(w)).length;
        if (score > bestScore) { bestScore = score; best = c.number; }
      }
      return bestScore > 0 ? best : "";
    };
    const resolve = (category: string | null | undefined, description: string): string => {
      const cat = typeof category === "string" ? category : "";
      const fromCat = cat ? (catToDivision.get(cat.toLowerCase().trim()) || fuzzy(cat)) : "";
      return fromCat || fuzzy(description || "");
    };
    return { categories, resolve };
  }, []);

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
  }, [projectId, buildBudgetMatcher]);

  const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);
  const totalRetainage = lineItems.reduce((s, li) => s + li.retainageAmount, 0);
  const totalNet = totalAmount - totalRetainage;

  // Deterministically parse an AIA workbook (.xlsx with a Detail tab + 702/703).
  const handleExcel = async (f: File) => {
    setExtracting(true);
    try {
      const buf = await f.arrayBuffer();
      const res = parseAIAExcel(buf);
      if (!res.isAIA) {
        toast.message("Not a recognized AIA Excel (needs a Detail or 703 sheet) — fill in fields manually");
        return;
      }
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
      // the modal is already scoped to a project. A confident, unique match is
      // selected (which also triggers the category re-matcher); otherwise we
      // surface a one-click suggestion.
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
        // number — so set it directly for a guaranteed auto-select (no fuzzy
        // matching, and no need for a project to be selected first). Not flagged
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
    } catch (e: any) {
      console.warn("[invoice] Excel parse error:", e?.message);
      toast.message("Couldn't parse this Excel file — fill in fields manually");
    } finally {
      setExtracting(false);
    }
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setAiaDetailRows([]); setExcelFallback(false); setSuggestedProject(null); // reset; set again only for AIA Excel
    const name = f.name.toLowerCase();
    if (name.endsWith(".xlsx") || f.type.includes("spreadsheetml")) {
      // Prefer deterministic Excel parsing when the GC provides the AIA as .xlsx.
      await handleExcel(f);
      return;
    }
    if (f.type !== "application/pdf") return;
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      // Send the selected project's budget categories so Claude can map each
      // line item to a real category. If no project is selected yet, categories
      // is empty and matching is deferred until the user picks one.
      const { categories, resolve: resolveDivision } = await buildBudgetMatcher(projectId);

      const { data } = await supabase.functions.invoke("extract-invoice-claude", {
        body: { pdfBase64: b64, mimeType: "application/pdf", categories },
      });
      if (data?.ok && data.fields) {
        const fields = data.fields;
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
      } else {
        // Extraction failed for some reason — don't block the upload.
        console.warn("[invoice] AI extraction unavailable:", data?.error);
        toast.message("AI extraction unavailable — please fill in fields manually");
      }
    } catch (e: any) {
      // Network/unexpected failure: still let the user continue manually.
      console.warn("[invoice] AI extraction error:", e?.message);
      toast.message("AI extraction unavailable — please fill in fields manually");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!file) return toast.error("Please upload a PDF.");
    if (!vendor || !projectId) return toast.error("Vendor and Project are required.");
    const validLines = lineItems.filter((li) => li.division && li.amount > 0);
    if (validLines.length === 0) return toast.error("Add at least one division line with an amount.");
    if (!organizationId || !user) return toast.error("Not authenticated.");
    setSaving(true);
    try {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("invoices").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24 * 30);
      const pdfUrl = signed?.signedUrl ?? null;

      // Resolve approvers: PM/Lead per project, Treasury from the global profile flag.
      const [{ data: approverRows }, { data: treasuryRows }] = await Promise.all([
        supabase.from("project_approvers").select("role, approver_id").eq("project_id", projectId),
        supabase.from("profiles").select("user_id").eq("is_treasury", true).limit(1),
      ]);
      const approverMap: Record<string, string | null> = {};
      (approverRows ?? []).forEach((r) => { approverMap[r.role] = r.approver_id; });
      approverMap.treasury = treasuryRows?.[0]?.user_id ?? null;
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
        amount: totalAmount,
        retainage_amount: totalRetainage,
        net_amount: totalNet,
        aia_detail_rows: aiaDetailRows.length ? aiaDetailRows : null,
        cost_type: firstDiv?.cost_type === "hard" ? "Hard Cost" : firstDiv?.cost_type === "soft" ? "Soft Cost" : null,
        budget_line_item: budgetLineSummary,
        status,
        submitted_by: user.id,
        submitted_by_email: user.email,
        notes: notes || null,
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
          document_url: documentLink || pdfUrl,
        };
      });
      const { error: txnErr } = await supabase.from("budget_transactions").insert(txnRows);
      if (txnErr) throw txnErr;

      // Supporting documents (optional) — upload to {project}/{invoice}/supporting/.
      if (supportingFiles.length > 0) {
        let failed = 0;
        for (const sf of supportingFiles) {
          try {
            await uploadInvoiceDocument(projectId, inv!.id, sf, user.id);
          } catch (docErr: any) {
            failed++;
            console.warn("[invoice] supporting doc upload failed:", sf.name, docErr?.message);
          }
        }
        if (failed > 0) toast.message(`${failed} supporting document(s) failed to upload — you can re-add them from the invoice.`);
      }

      await supabase.from("invoice_audit_trail").insert({
        invoice_id: inv!.id, action: "Invoice submitted", performed_by: user.id,
        performed_by_name: user.email, notes: `Vendor: ${vendor}${invoiceNumber ? ` · ${invoiceNumber}` : ""}`,
      });

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
            Upload Invoice
            {docType && (
              <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border-blue-200">
                <Sparkles className="h-2.5 w-2.5" />
                {docType === "aia_pay_app" ? "AIA Pay Application" : "Standard Invoice"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>PDF or Excel *</Label>
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
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!!defaultProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
            <div className="space-y-1.5">
              <Label>Document Link</Label>
              <div className="relative">
                <LinkIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7" placeholder="Optional Drive link" value={documentLink} onChange={(e) => setDocumentLink(e.target.value)} />
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
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLine(li.id)} disabled={lineItems.length <= 1}>
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

          {/* Supporting Documents (optional) */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Supporting Documents <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <label
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); addSupporting(e.dataTransfer.files); }}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 cursor-pointer text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/10"
                  : "border-primary/40 bg-primary/5 hover:border-primary/70 hover:bg-primary/10"
              }`}
            >
              <div className={`rounded-full p-2.5 ${dragActive ? "bg-primary/20" : "bg-primary/10"}`}>
                <Upload className={`h-6 w-6 ${dragActive ? "text-primary" : "text-primary/70"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Drag and drop files here, or click to browse</span>
              <span className="text-xs text-muted-foreground">Signed pay app, lien waivers, invoices, photos — any file type</span>
              <input type="file" multiple className="hidden" onChange={(e) => { addSupporting(e.target.files); e.currentTarget.value = ""; }} />
            </label>
            {supportingFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {supportingFiles.map((sf, i) => (
                  <div key={`${sf.name}-${i}`} className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-xs">
                    {fileIconFor(sf.type, sf.name)}
                    <span className="truncate flex-1">{sf.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatFileSize(sf.size)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                      onClick={() => setSupportingFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Submit Invoice"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
