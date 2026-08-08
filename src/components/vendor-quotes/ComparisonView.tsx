import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { type BidItem, type VendorQuote, type Adjustment, fmt } from "./types";

interface Props {
  bidItems: BidItem[];
  quotesForItem: (id: string) => VendorQuote[];
  adjustmentsForQuote: (quoteId: string) => Adjustment[];
  leveledForQuote: (quote: VendorQuote) => number;
}

export default function ComparisonView({ bidItems, quotesForItem, adjustmentsForQuote, leveledForQuote }: Props) {
  const [selectedId, setSelectedId] = useState<string>(bidItems[0]?.id ?? "");

  const vqs = quotesForItem(selectedId);
  const leveled = vqs.map((v) => leveledForQuote(v));
  const lowest = leveled.length ? Math.min(...leveled) : null;
  const highest = leveled.length ? Math.max(...leveled) : null;
  const average = leveled.length ? leveled.reduce((s, a) => s + a, 0) / leveled.length : null;

  const variance = (val: number | null, base: number | null) => {
    if (val == null || base == null || base === 0) return { dollar: "—", pct: "—" };
    const d = val - base;
    const p = (d / base) * 100;
    return { dollar: fmt(d), pct: `${p >= 0 ? "+" : ""}${p.toFixed(1)}%` };
  };

  const adjTitle = (adj: Adjustment[]) =>
    adj.length === 0 ? "No adjustments" : adj.map((a) => `${a.description || "Adjustment"}: ${fmt(a.amount)}`).join("\n");

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
                  const lvl = leveledForQuote(vq);
                  const isLowest = lowest != null && lvl === lowest;
                  const isHighest = highest != null && lvl === highest && lowest !== highest;
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
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Raw Final Quote</td>
                {vqs.map((vq) => (
                  <td key={vq.id} className="text-right px-4 py-2">{fmt(vq.final_quote_amount)}</td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Scope Adjustments</td>
                {vqs.map((vq) => {
                  const adj = adjustmentsForQuote(vq.id);
                  const sum = adj.reduce((s, a) => s + a.amount, 0);
                  return (
                    <td key={vq.id} className="text-right px-4 py-2" title={adjTitle(adj)}>
                      {adj.length === 0 ? "—" : `${sum >= 0 ? "+" : ""}${fmt(sum)}`}
                      {adj.length > 0 && <span className="text-xs text-muted-foreground"> ({adj.length})</span>}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-2 sticky left-0 bg-muted/20">Leveled Total</td>
                {vqs.map((vq) => {
                  const lvl = leveledForQuote(vq);
                  const isLowest = lowest != null && lvl === lowest;
                  const isHighest = highest != null && lvl === highest && lowest !== highest;
                  return (
                    <td key={vq.id} className={`text-right px-4 py-2 ${isLowest ? "text-green-600" : isHighest ? "text-red-600" : ""}`}>
                      {fmt(lvl)}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Var. from Lowest (Leveled)</td>
                {vqs.map((vq) => {
                  const lvl = leveledForQuote(vq);
                  const v = variance(lvl, lowest);
                  const isOutlier = lowest != null && lvl > lowest * 1.2;
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
                <td className="px-4 py-2 text-muted-foreground sticky left-0 bg-card">Var. from Average (Leveled)</td>
                {vqs.map((vq) => {
                  const v = variance(leveledForQuote(vq), average);
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
