import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { type BidItem, type VendorQuote, fmt } from "./types";

interface Props {
  bidItems: BidItem[];
  quotesForItem: (id: string) => VendorQuote[];
}

export default function ComparisonView({ bidItems, quotesForItem }: Props) {
  const [selectedId, setSelectedId] = useState<string>(bidItems[0]?.id ?? "");

  const vqs = quotesForItem(selectedId);
  const amounts = vqs.map((v) => v.final_quote_amount).filter((a): a is number => a != null);
  const lowest = amounts.length ? Math.min(...amounts) : null;
  const highest = amounts.length ? Math.max(...amounts) : null;
  const average = amounts.length ? amounts.reduce((s, a) => s + a, 0) / amounts.length : null;

  const variance = (val: number | null, base: number | null) => {
    if (val == null || base == null || base === 0) return { dollar: "—", pct: "—" };
    const d = val - base;
    const p = (d / base) * 100;
    return { dollar: fmt(d), pct: `${p >= 0 ? "+" : ""}${p.toFixed(1)}%` };
  };

  if (bidItems.length === 0) return <p className="text-sm text-muted-foreground py-4">No bid items to compare.</p>;

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger><SelectValue placeholder="Select a bid item" /></SelectTrigger>
          <SelectContent>
            {bidItems.map((bi) => <SelectItem key={bi.id} value={bi.id}>{bi.segment} — {bi.item_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {vqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vendor quotes for this bid item.</p>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50">Metric</th>
                {vqs.map((vq) => {
                  const isLowest = lowest != null && vq.final_quote_amount === lowest;
                  const isHighest = highest != null && vq.final_quote_amount === highest && lowest !== highest;
                  return (
                    <th key={vq.id} className={`text-right px-4 py-2 font-medium min-w-[140px] ${isLowest ? "text-green-600" : isHighest ? "text-red-600" : "text-foreground"}`}>
                      {vq.vendor_name}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((r) => (
                <tr key={r} className="border-t">
                  <td className="px-4 py-2 font-medium text-muted-foreground sticky left-0 bg-card">Round {r}</td>
                  {vqs.map((vq) => {
                    const amt = (vq as any)[`round_${r}_amount`];
                    return <td key={vq.id} className="text-right px-4 py-2">{fmt(amt)}</td>;
                  })}
                </tr>
              ))}
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-2 sticky left-0 bg-muted/20">Final Quote</td>
                {vqs.map((vq) => {
                  const isLowest = lowest != null && vq.final_quote_amount === lowest;
                  const isHighest = highest != null && vq.final_quote_amount === highest && lowest !== highest;
                  return (
                    <td key={vq.id} className={`text-right px-4 py-2 ${isLowest ? "text-green-600" : isHighest ? "text-red-600" : ""}`}>
                      {fmt(vq.final_quote_amount)}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Var. from Lowest</td>
                {vqs.map((vq) => {
                  const v = variance(vq.final_quote_amount, lowest);
                  const isOutlier = lowest != null && vq.final_quote_amount != null && vq.final_quote_amount > lowest * 1.2;
                  return (
                    <td key={vq.id} className="text-right px-4 py-2">
                      <span className="flex items-center justify-end gap-1">
                        {v.dollar} ({v.pct})
                        {isOutlier && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      </span>
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Var. from Average</td>
                {vqs.map((vq) => {
                  const v = variance(vq.final_quote_amount, average);
                  return <td key={vq.id} className="text-right px-4 py-2">{v.dollar} ({v.pct})</td>;
                })}
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Status</td>
                {vqs.map((vq) => (
                  <td key={vq.id} className="text-right px-4 py-2">
                    <Badge variant={vq.vendor_status === "Awarded" ? "default" : vq.vendor_status === "Eliminated" ? "destructive" : "secondary"} className="text-xs">
                      {vq.vendor_status}
                    </Badge>
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Notes</td>
                {vqs.map((vq) => (
                  <td key={vq.id} className="px-4 py-2 text-right text-xs text-muted-foreground max-w-[200px] truncate">{vq.notes || "—"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
