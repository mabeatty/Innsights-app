import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Upload, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DebtTranche } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtracted: (fields: Partial<DebtTranche>) => void;
}

export default function DebtTermsUploadDialog({ open, onOpenChange, onExtracted }: Props) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF of the commitment letter or term sheet.");
      return;
    }
    setError(null);
    setExtracting(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const { data } = await supabase.functions.invoke("extract-debt-terms-claude", {
        body: { pdfBase64: b64, mimeType: "application/pdf" },
      });
      if (data?.ok && data.fields) {
        const f = data.fields as Record<string, any>;
        onExtracted({
          lender_name: f.lender_name ?? undefined,
          loan_type: f.loan_type ?? undefined,
          loan_amount: typeof f.loan_amount === "number" ? f.loan_amount : undefined,
          interest_rate: typeof f.interest_rate === "number" ? f.interest_rate : undefined,
          rate_type: f.rate_type ?? undefined,
          index_name: f.index_name ?? undefined,
          spread: typeof f.spread === "number" ? f.spread : undefined,
          loan_term: typeof f.loan_term === "number" ? f.loan_term : undefined,
          maturity_date: f.maturity_date ?? undefined,
          amortization_schedule: f.amortization_schedule ?? undefined,
          origination_fee: typeof f.origination_fee === "number" ? f.origination_fee : undefined,
          extension_options: f.extension_options ?? undefined,
          required_reserves: f.required_reserves ?? undefined,
          notes: f.notes ?? undefined,
        });
        toast.success("Terms extracted — review and confirm before saving.");
        onOpenChange(false);
      } else {
        setError(data?.error || "Extraction failed. You can enter the terms manually instead.");
      }
    } catch (err: any) {
      setError(err?.message || "Extraction failed. You can enter the terms manually instead.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setError(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Commitment Letter or Term Sheet</DialogTitle>
          <DialogDescription>
            Claude will read the lender's terms and draft a debt tranche below for you to review before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          {extracting ? (
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" /> Reading document…
            </p>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <Label htmlFor="debt-terms-pdf" className="cursor-pointer text-sm text-primary hover:underline">
                Choose a PDF file
              </Label>
              <Input
                id="debt-terms-pdf"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
