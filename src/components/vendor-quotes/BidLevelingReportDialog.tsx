import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type BidItem, type VendorQuote, type Adjustment, fmt } from "./types";

interface Report {
  executive_summary: string;
  key_differences: string[];
  leveling_summary: string;
  considerations: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bidItem: BidItem;
  quotes: VendorQuote[];
  adjustmentsForQuote: (quoteId: string) => Adjustment[];
  leveledForQuote: (quote: VendorQuote) => number;
}

export default function BidLevelingReportDialog({ open, onOpenChange, bidItem, quotes, adjustmentsForQuote, leveledForQuote }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        segment: bidItem.segment,
        itemName: bidItem.item_name,
        quotes: quotes.map((q) => ({
          vendor_name: q.vendor_name,
          round_1_amount: q.round_1_amount,
          round_2_amount: q.round_2_amount,
          round_3_amount: q.round_3_amount,
          round_4_amount: q.round_4_amount,
          final_quote_amount: q.final_quote_amount,
          leveled_total: leveledForQuote(q),
          vendor_status: q.vendor_status,
          notes: q.notes,
          adjustments: adjustmentsForQuote(q.id).map((a) => ({ description: a.description, amount: a.amount, category: a.category })),
        })),
      };
      const { data, error: fnError } = await supabase.functions.invoke("generate-bid-leveling-report", { body: payload });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setReport(data.report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate report.";
      setError(msg);
      toast.error(msg);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) { setReport(null); setError(null); generate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const leveled = quotes.map((q) => leveledForQuote(q));
  const lowest = leveled.length ? Math.min(...leveled) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>Bid Leveling Report</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Generating report…</p>
          </div>
        )}

        {error && !loading && (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={generate} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Try Again
            </Button>
          </div>
        )}

        {report && !loading && (
          <div id="bid-leveling-report" className="space-y-4 text-sm">
            <div className="flex items-start justify-between print:mb-2">
              <div>
                <h2 className="text-lg font-semibold">{bidItem.segment} — {bidItem.item_name}</h2>
                <p className="text-xs text-muted-foreground">Bid Leveling Report · Generated {new Date().toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={generate} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                </Button>
                <Button size="sm" onClick={() => window.print()} className="gap-1.5">
                  <Printer className="h-3.5 w-3.5" /> Print / Save PDF
                </Button>
              </div>
            </div>

            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">Executive Summary</h3>
              <p>{report.executive_summary}</p>
            </section>

            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">Key Differences Between Bids</h3>
              <ul className="list-disc pl-5 space-y-1">
                {report.key_differences.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">Leveling Summary</h3>
              <p>{report.leveling_summary}</p>
            </section>

            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">Considerations for the Team</h3>
              <p>{report.considerations}</p>
            </section>

            <section>
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">Leveled Totals</h3>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Vendor</th>
                    <th className="py-1 px-2 font-medium text-right">Leveled Total</th>
                    <th className="py-1 pl-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const lvl = leveledForQuote(q);
                    return (
                      <tr key={q.id} className="border-b last:border-0">
                        <td className="py-1 pr-2">{q.vendor_name}</td>
                        <td className={`py-1 px-2 text-right ${lowest != null && lvl === lowest ? "font-semibold text-green-600" : ""}`}>{fmt(lvl)}</td>
                        <td className="py-1 pl-2 text-muted-foreground">{q.vendor_status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
