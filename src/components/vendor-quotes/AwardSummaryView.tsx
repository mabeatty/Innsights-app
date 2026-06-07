import { SEGMENTS, type BidItem, type VendorQuote, fmt } from "./types";

interface Props {
  bidItems: BidItem[];
  quotesForItem: (id: string) => VendorQuote[];
}

export default function AwardSummaryView({ bidItems, quotesForItem }: Props) {
  let grandTotal = 0;

  const segmentData = SEGMENTS.map((seg) => {
    const items = bidItems.filter((bi) => bi.segment === seg);
    let subtotal = 0;
    const rows = items
      .map((bi) => {
        const awarded = quotesForItem(bi.id).find((v) => v.vendor_status === "Awarded");
        if (!awarded) return null;
        const amt = awarded.final_quote_amount ?? 0;
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
          <col style={{ width: "18%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Segment</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Item / Trade</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Awarded Vendor</th>
            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Award Date</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Notes</th>
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
                </tr>
              ))}
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-1.5" colSpan={3}>{seg} Subtotal</td>
                <td className="px-4 py-1.5 text-right">{fmt(subtotal)}</td>
                <td colSpan={2}></td>
              </tr>
            </>
          ))}
          <tr className="border-t bg-muted/40 font-bold">
            <td className="px-4 py-2" colSpan={3}>Grand Total</td>
            <td className="px-4 py-2 text-right">{fmt(grandTotal)}</td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
