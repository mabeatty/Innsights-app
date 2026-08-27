import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSignature } from "lucide-react";
import { SEGMENTS, type BidItem, type VendorQuote, type Adjustment, fmt } from "./types";
import ContractDraftDialog from "@/components/contracts-award/ContractDraftDialog";

interface Props {
  projectId: string;
  bidItems: BidItem[];
  quotesForItem: (id: string) => VendorQuote[];
  adjustmentsForQuote: (quoteId: string) => Adjustment[];
  leveledForQuote: (quote: VendorQuote) => number;
}

export default function AwardSummaryView({ projectId, bidItems, quotesForItem, adjustmentsForQuote, leveledForQuote }: Props) {
  let grandTotal = 0;
  const [draftDialog, setDraftDialog] = useState<{ bidItem: BidItem; quote: VendorQuote } | null>(null);

  const segmentData = SEGMENTS.map((seg) => {
    const items = bidItems.filter((bi) => bi.segment === seg);
    let subtotal = 0;
    const rows = items
      .map((bi) => {
        const awarded = quotesForItem(bi.id).find((v) => v.vendor_status === "Awarded");
        if (!awarded) return null;
        const amt = leveledForQuote(awarded);
        subtotal += amt;
        return { bi, awarded, amt };
      })
      .filter(Boolean) as { bi: BidItem; awarded: VendorQuote; amt: number }[];
    grandTotal += subtotal;
    return { seg, rows, subtotal };
  }).filter((s) => s.rows.length > 0);

  if (segmentData.length === 0) return <p className="text-sm text-muted-foreground py-4">No awards yet.</p>;

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "15%" }} />
          <col style={{ width: "19%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Segment</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Item / Trade</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Awarded Vendor</th>
            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount (Leveled)</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Award Date</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Notes</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {segmentData.map(({ seg, rows, subtotal }) => (
            <>
              {rows.map((r, i) => (
                <tr key={r.bi.id} className="border-t">
                  <td className="px-4 py-2">{i === 0 ? seg : ""}</td>
                  <td className="px-4 py-2 font-medium">{r.bi.item_name}</td>
                  <td className="px-4 py-2">{r.awarded.vendor_name}</td>
                  <td className="px-4 py-2 text-right">{fmt(r.amt)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.awarded.award_date ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground truncate">{r.awarded.notes || "—"}</td>
                  <td className="px-4 py-2">
                    <Button
                      variant="outline" size="sm" className="h-7 gap-1 text-xs"
                      onClick={() => setDraftDialog({ bidItem: r.bi, quote: r.awarded })}
                    >
                      <FileSignature className="h-3 w-3" /> Draft Contract
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-1.5" colSpan={3}>{seg} Subtotal</td>
                <td className="px-4 py-1.5 text-right">{fmt(subtotal)}</td>
                <td colSpan={3}></td>
              </tr>
            </>
          ))}
          <tr className="border-t bg-muted/40 font-bold">
            <td className="px-4 py-2" colSpan={3}>Grand Total</td>
            <td className="px-4 py-2 text-right">{fmt(grandTotal)}</td>
            <td colSpan={3}></td>
          </tr>
        </tbody>
      </table>

      {draftDialog && (
        <ContractDraftDialog
          open={!!draftDialog}
          onOpenChange={(o) => !o && setDraftDialog(null)}
          projectId={projectId}
          bidItem={draftDialog.bidItem}
          awardedQuote={draftDialog.quote}
          adjustments={adjustmentsForQuote(draftDialog.quote.id)}
          leveledAmount={leveledForQuote(draftDialog.quote)}
        />
      )}
    </div>
  );
}
