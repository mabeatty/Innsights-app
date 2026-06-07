import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";

const CATEGORIES = [
  "General Contractor",
  "Subcontractor",
  "FF&E Supplier",
  "OS&E Supplier",
  "Architect",
  "Civil Engineer",
  "Consultant",
  "Other",
];

const TEMPLATE_HEADERS = [
  "Vendor Name",
  "Category",
  "Contact Name",
  "Phone",
  "Email",
  "Markets",
  "Notes",
  "Performance Rating",
];

interface ImportResult {
  added: number;
  skipped: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string | null;
  existingVendorNames: string[];
  onImported: () => void;
}

export default function VendorImportDialog({ open, onOpenChange, organizationId, existingVendorNames, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setShowSkipped(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendor_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const normalizeKey = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

  const headerMap: Record<string, string> = {
    vendorname: "vendor_name",
    category: "category",
    contactname: "contact_name",
    phone: "phone",
    email: "email",
    markets: "markets",
    notes: "notes",
    performancerating: "performance_rating",
  };

  const parseFile = async (f: File): Promise<Record<string, any>[]> => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  };

  const handleImport = async () => {
    if (!file || !organizationId) return;
    setImporting(true);
    setResult(null);
    try {
      const rows = await parseFile(file);
      if (rows.length === 0) {
        toast.error("File is empty");
        setImporting(false);
        return;
      }

      const existingLower = new Set(existingVendorNames.map((n) => n.trim().toLowerCase()));
      const seenInBatch = new Set<string>();
      const skipped: string[] = [];
      const toInsert: any[] = [];

      for (const raw of rows) {
        // Normalize keys
        const row: Record<string, any> = {};
        for (const k of Object.keys(raw)) {
          const mapped = headerMap[normalizeKey(k)];
          if (mapped) row[mapped] = raw[k];
        }

        const vendor_name = String(row.vendor_name ?? "").trim();
        if (!vendor_name) continue;

        const lower = vendor_name.toLowerCase();
        if (existingLower.has(lower) || seenInBatch.has(lower)) {
          skipped.push(vendor_name);
          continue;
        }
        seenInBatch.add(lower);

        const rawCategory = String(row.category ?? "").trim();
        const category = CATEGORIES.find((c) => c.toLowerCase() === rawCategory.toLowerCase()) ?? "Other";

        const ratingNum = Number(row.performance_rating);
        const performance_rating =
          Number.isFinite(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? Math.round(ratingNum) : 0;

        toInsert.push({
          org_id: organizationId,
          vendor_name,
          category,
          contact_name: String(row.contact_name ?? "").trim() || null,
          phone: String(row.phone ?? "").trim() || null,
          email: String(row.email ?? "").trim() || null,
          markets: String(row.markets ?? "").trim() || null,
          notes: String(row.notes ?? "").trim() || null,
          performance_rating,
        });
      }

      let added = 0;
      if (toInsert.length > 0) {
        const { error, data } = await supabase.from("global_vendors").insert(toInsert).select("id");
        if (error) {
          toast.error(`Import failed: ${error.message}`);
          setImporting(false);
          return;
        }
        added = data?.length ?? toInsert.length;
      }

      setResult({ added, skipped });
      if (added > 0) onImported();
      toast.success(`${added} vendor${added === 1 ? "" : "s"} imported`);
    } catch (e: any) {
      toast.error(`Failed to parse file: ${e.message ?? "unknown error"}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Vendors</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" onClick={downloadTemplate} className="w-full justify-start gap-2">
            <Download className="h-4 w-4" /> Download Import Template (.csv)
          </Button>

          <label
            htmlFor="vendor-import-file"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-center">
              {file ? (
                <span className="font-medium">{file.name}</span>
              ) : (
                <>
                  <span className="font-medium">Click to upload</span>
                  <span className="text-muted-foreground"> or drag a file here</span>
                  <div className="text-xs text-muted-foreground mt-1">.csv or .xlsx</div>
                </>
              )}
            </div>
            <input
              id="vendor-import-file"
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>

          {result && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {result.added} added, {result.skipped.length} skipped (duplicates)
              </div>
              {result.skipped.length > 0 && (
                <Collapsible open={showSkipped} onOpenChange={setShowSkipped}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    {showSkipped ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    View skipped vendors
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 max-h-40 overflow-y-auto">
                    <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                      {result.skipped.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={!file || importing} className="gap-2">
              <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
