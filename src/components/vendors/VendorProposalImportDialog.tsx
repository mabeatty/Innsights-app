import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Sparkles, Trash2, AlertTriangle, Loader2 } from "lucide-react";

const CATEGORIES = [
  "Bath Accessories", "Bedding", "Corner Guards", "Countertops", "Doors, Frames & Hardware",
  "Electrical", "EV Charging", "Exterior Signage", "FF&E", "Fitness Equipment", "Flooring",
  "Furnishings", "Furniture", "IT Hardware", "Kitchen Appliances", "Lighting", "Millwork",
  "Plumbing Fixtures", "Signage", "Soft Goods", "Tile", "Tubs & Showers", "TVs & Accessories",
  "Wall Coverings", "Water Dispensers", "Window Treatments", "Windows",
];

const VENDOR_CATEGORIES = [
  "General Contractor", "Subcontractor", "FF&E Supplier", "OS&E Supplier", "Architect",
  "Civil Engineer", "Consultant", "Other",
];

interface LineItemDraft {
  item_name: string;
  raw_description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  ext_price: number | null;
  room_type: string | null;
  category: string | null;
}

interface ExtractedFields {
  is_gc_lump_sum?: boolean;
  vendor_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  brand: string | null;
  project_hint: string | null;
  inferred: string[];
  line_items: LineItemDraft[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string | null;
  existingVendorNames: string[];
  onImported: () => void;
}

type Stage = "upload" | "reviewing" | "done";

const money = (n: number | null) =>
  n == null ? "" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function VendorProposalImportDialog({ open, onOpenChange, organizationId, existingVendorNames, onImported }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Review-stage editable state
  const [fields, setFields] = useState<ExtractedFields | null>(null);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  const reset = () => {
    setStage("upload");
    setFile(null);
    setFields(null);
    setLineItems([]);
    setSavedCount(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const isInferred = (key: string) => fields?.inferred?.includes(key) ?? false;

  const handleExtract = async (f: File) => {
    setFile(f);
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      const { data, error } = await supabase.functions.invoke("extract-vendor-proposal", {
        body: { pdfBase64: b64, mimeType: "application/pdf" },
      });

      if (error || !data?.ok) {
        toast.error(data?.error || error?.message || "Couldn't read this proposal — try again or enter it manually.");
        setExtracting(false);
        return;
      }

      const f2: ExtractedFields = {
        is_gc_lump_sum: !!data.fields.is_gc_lump_sum,
        vendor_name: data.fields.vendor_name ?? null,
        contact_name: data.fields.contact_name ?? null,
        phone: data.fields.phone ?? null,
        email: data.fields.email ?? null,
        category: data.fields.category ?? null,
        brand: data.fields.brand ?? null,
        project_hint: data.fields.project_hint ?? null,
        inferred: Array.isArray(data.fields.inferred) ? data.fields.inferred : [],
        line_items: [],
      };

      if (f2.is_gc_lump_sum) {
        toast.error("This looks like a GC lump-sum pricing outline (organized by CSI divisions), not an itemized vendor quote. Load it into the project's schedule of values in Accounting instead.");
        setExtracting(false);
        return;
      }

      const items: LineItemDraft[] = Array.isArray(data.fields.line_items) ? data.fields.line_items : [];
      setFields(f2);
      setLineItems(items);
      setStage("reviewing");
    } catch (e: any) {
      toast.error(`Failed to read PDF: ${e.message ?? "unknown error"}`);
    } finally {
      setExtracting(false);
    }
  };

  const updateLineItem = (idx: number, patch: Partial<LineItemDraft>) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };

  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!fields || !organizationId) return;
    const vendorName = fields.vendor_name?.trim();
    if (!vendorName) {
      toast.error("Vendor name is required.");
      return;
    }
    setSaving(true);
    try {
      // 1. Find or create the global vendor record.
      const existingLower = new Set(existingVendorNames.map((n) => n.trim().toLowerCase()));
      let globalVendorId: string | null = null;

      if (existingLower.has(vendorName.toLowerCase())) {
        const { data: existing } = await supabase
          .from("global_vendors")
          .select("id")
          .eq("org_id", organizationId)
          .ilike("vendor_name", vendorName)
          .maybeSingle();
        globalVendorId = existing?.id ?? null;
      }

      if (!globalVendorId) {
        const { data: inserted, error: insertErr } = await supabase
          .from("global_vendors")
          .insert({
            org_id: organizationId,
            vendor_name: vendorName,
            category: VENDOR_CATEGORIES.includes(fields.category ?? "") ? fields.category : "FF&E Supplier",
            contact_name: fields.contact_name || null,
            phone: fields.phone || null,
            email: fields.email || null,
            notes: fields.project_hint ? `Sourced from proposal: ${file?.name ?? "uploaded PDF"} (${fields.project_hint})` : `Sourced from proposal: ${file?.name ?? "uploaded PDF"}`,
            performance_rating: 0,
          })
          .select("id")
          .single();
        if (insertErr) {
          toast.error(`Failed to save vendor: ${insertErr.message}`);
          setSaving(false);
          return;
        }
        globalVendorId = inserted.id;
      }

      // 2. Insert each reviewed line item into vendor_pricing (gross grain — this
      //    dialog treats each line as a discrete priced item; bid_line_items is
      //    reserved for structured bid-leveling flows elsewhere in the app).
      const rows = lineItems
        .filter((li) => li.item_name?.trim())
        .map((li) => ({
          org_id: organizationId,
          global_vendor_id: globalVendorId,
          vendor_name: vendorName,
          catalog_item_id: null,
          project_id: null,
          project_label: fields.project_hint || null,
          brand: fields.brand || null,
          scope: li.item_name.trim(),
          raw_description: li.raw_description || null,
          quantity: li.quantity,
          unit: li.unit || null,
          unit_price: li.unit_price,
          gross_price: li.ext_price,
          price_text: null,
          source_doc: file?.name ?? null,
          source_url: null,
          price_date: new Date().toISOString().slice(0, 10),
          status: "Needs review",
          notes: li.room_type ? `Room/location: ${li.room_type}` : null,
        }));

      if (rows.length > 0) {
        const { error: priceErr } = await supabase.from("vendor_pricing").insert(rows);
        if (priceErr) {
          toast.error(`Vendor saved, but pricing import failed: ${priceErr.message}`);
          setSaving(false);
          return;
        }
      }

      setSavedCount(rows.length);
      setStage("done");
      onImported();
      toast.success(`${vendorName} saved with ${rows.length} price line${rows.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      toast.error(`Import failed: ${e.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={stage === "reviewing" ? "max-w-4xl max-h-[85vh] overflow-y-auto" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>Upload Vendor Proposal</DialogTitle>
          {stage === "upload" && (
            <DialogDescription>
              Drop in a vendor or FF&amp;E proposal PDF. Claude reads it, identifies the vendor, brand, and hotel context, and extracts every priced line — you'll confirm before anything is saved.
            </DialogDescription>
          )}
        </DialogHeader>

        {stage === "upload" && (
          <div className="space-y-4">
            <label
              htmlFor="proposal-import-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              {extracting ? (
                <>
                  <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                  <div className="text-sm text-muted-foreground">Reading proposal…</div>
                </>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-center">
                    <span className="font-medium">Click to upload</span>
                    <span className="text-muted-foreground"> or drag a PDF here</span>
                    <div className="text-xs text-muted-foreground mt-1">.pdf only — for itemized vendor/FF&amp;E quotes, not GC lump-sum outlines</div>
                  </div>
                </>
              )}
              <input
                id="proposal-import-file"
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={extracting}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleExtract(f);
                }}
              />
            </label>
          </div>
        )}

        {stage === "reviewing" && fields && (
          <div className="space-y-5">
            {fields.inferred.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">Some fields were inferred, not explicitly stated:</span>{" "}
                  {fields.inferred.join(", ")}. Double-check these before saving.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Vendor Name {isInferred("vendor_name") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Input value={fields.vendor_name ?? ""} onChange={(e) => setFields({ ...fields, vendor_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Category {isInferred("category") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Select value={fields.category ?? ""} onValueChange={(v) => setFields({ ...fields, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Contact Name {isInferred("contact_name") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Input value={fields.contact_name ?? ""} onChange={(e) => setFields({ ...fields, contact_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Phone {isInferred("phone") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Input value={fields.phone ?? ""} onChange={(e) => setFields({ ...fields, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Email {isInferred("email") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Input value={fields.email ?? ""} onChange={(e) => setFields({ ...fields, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Brand / Prototype {isInferred("brand") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Input value={fields.brand ?? ""} onChange={(e) => setFields({ ...fields, brand: e.target.value })} placeholder="e.g. Home2 Suites" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  Project / Location {isInferred("project_hint") && <Sparkles className="h-3 w-3 text-amber-500" />}
                </Label>
                <Input value={fields.project_hint ?? ""} onChange={(e) => setFields({ ...fields, project_hint: e.target.value })} placeholder="e.g. Home2 Suites Ontario, OH" />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-semibold">Line Items ({lineItems.length})</Label>
              </div>
              <div className="rounded-lg border overflow-auto max-h-80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Item</TableHead>
                      <TableHead className="min-w-[100px]">Category</TableHead>
                      <TableHead className="w-16 text-right">Qty</TableHead>
                      <TableHead className="w-16">Unit</TableHead>
                      <TableHead className="w-28 text-right">Unit Price</TableHead>
                      <TableHead className="w-28 text-right">Ext. Price</TableHead>
                      <TableHead className="min-w-[120px]">Room / Location</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No line items extracted — you can still save vendor info alone.</TableCell></TableRow>
                    ) : lineItems.map((li, idx) => (
                      <TableRow key={idx}>
                        <TableCell><Input className="h-8 text-xs" value={li.item_name} onChange={(e) => updateLineItem(idx, { item_name: e.target.value })} /></TableCell>
                        <TableCell>
                          <Select value={li.category ?? ""} onValueChange={(v) => updateLineItem(idx, { category: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input className="h-8 text-xs text-right" type="number" value={li.quantity ?? ""} onChange={(e) => updateLineItem(idx, { quantity: e.target.value === "" ? null : Number(e.target.value) })} /></TableCell>
                        <TableCell><Input className="h-8 text-xs" value={li.unit ?? ""} onChange={(e) => updateLineItem(idx, { unit: e.target.value })} /></TableCell>
                        <TableCell><Input className="h-8 text-xs text-right" type="number" value={li.unit_price ?? ""} onChange={(e) => updateLineItem(idx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })} /></TableCell>
                        <TableCell><Input className="h-8 text-xs text-right" type="number" value={li.ext_price ?? ""} onChange={(e) => updateLineItem(idx, { ext_price: e.target.value === "" ? null : Number(e.target.value) })} /></TableCell>
                        <TableCell><Input className="h-8 text-xs" value={li.room_type ?? ""} onChange={(e) => updateLineItem(idx, { room_type: e.target.value })} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove" onClick={() => removeLineItem(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div className="py-6 text-center space-y-2">
            <Badge variant="outline" className="text-sm">{fields?.vendor_name}</Badge>
            <p className="text-sm text-muted-foreground">
              Saved to the vendor directory and pricing library with {savedCount} price line{savedCount === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        <DialogFooter>
          {stage === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
          {stage === "reviewing" && (
            <>
              <Button variant="outline" onClick={reset}>Start Over</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Confirm & Save"}
              </Button>
            </>
          )}
          {stage === "done" && (
            <Button onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
