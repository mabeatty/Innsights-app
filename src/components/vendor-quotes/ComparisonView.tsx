import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type BidItem, type VendorQuote, type Adjustment, fmt, ADJUSTMENT_CATEGORIES, categoryNet } from "./types";
import BidLevelingReportDialog from "./BidLevelingReportDialog";

interface Props {
  bidItems: BidItem[];
  quotesForItem: (id: string) => VendorQuote[];
  adjustmentsForQuote: (quoteId: string) => Adjustment[];
  leveledForQuote: (quote: VendorQuote) => number;
}

export default function ComparisonView({ bidItems, quotesForItem, adjustmentsForQuote, leveledForQuote }: Props) {
  const [selectedId, setSelectedId] = useState<string>(bidItems[0]?.id ?? "");
  const [reportOpen, setReportOpen] = useState(false);
  const [savedReports, setSavedReports] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const ids = bidItems.map((bi) => bi.id);
    if (ids.length === 0) return;
    supabase
      .from("bid_leveling_reports")
      .select("bid_item_id, generated_at")
      .in("bid_item_id", ids)
      .then(({ data }) => {
        setSavedReports(new Map((data ?? []).map((r: any) => [r.bid_item_id, r.generated_at])));
      });
  }, [bidItems]);

  const vqs = quotesForItem(selectedId);
  const selectedBidItem = bidItems.find((bi) => bi.id === selectedId) ?? null;
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
      <div className="flex items-center justify-between gap-3">
        <div className="max-w-xs flex-1">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Select a bid item" /></SelectTrigger>
            <SelectContent>
              {bidItems.map((bi) => <SelectItem key={bi.id} value={bi.id}>{bi.segment} — {bi.item_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {vqs.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            {savedReports.has(selectedId) && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Saved {new Date(savedReports.get(selectedId)!).toLocaleDateString()}
              </span>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReportOpen(true)}>
              {savedReports.has(selectedId) ? <FileText className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {savedReports.has(selectedId) ? "View Report" : "Generate Report"}
            </Button>
          </div>
        )}
      </div>

      {vqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vendor quotes for this bid item.</p>
      ) : (
        <>
          {/* Quick view: Normalized Price per vendor */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(vqs.length, 4)}, minmax(160px, 1fr))` }}>
            {vqs.map((vq) => {
              const lvl = leveledForQuote(vq);
              const adj = adjustmentsForQuote(vq.id);
              const isLowest = lowest != null && lvl === lowest;
              const isHighest = highest != null && lvl === highest && lowest !== highest;
              return (
                <div key={vq.id} className={`rounded-lg border p-3 space-y-2 ${isLowest ? "border-green-500/50 bg-green-500/5" : isHighest ? "border-red-500/50 bg-red-500/5" : ""}`}>
                  <p className="text-xs font-medium text-muted-foreground truncate">{vq.vendor_name}</p>
                  <p className={`text-xl font-bold ${isLowest ? "text-green-600" : isHighest ? "text-red-600" : ""}`}>{fmt(lvl)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Normalized Price</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ADJUSTMENT_CATEGORIES.map((cat) => {
                      const net = categoryNet(adj, cat);
                      if (net === 0) return null;
                      return (
                        <span
                          key={cat}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${net > 0 ? "border-amber-500/50 text-amber-700 bg-amber-500/10" : "border-blue-500/50 text-blue-700 bg-blue-500/10"}`}
                          title={adj.filter((a) => a.category === cat).map((a) => `${a.description || cat}: ${fmt(a.amount)}`).join("\n")}
                        >
                          {cat} {net > 0 ? "+" : ""}{fmt(net)}
                        </span>
                      );
                    })}
                    {adj.length === 0 && <span className="text-[10px] text-muted-foreground italic">Quoted at face value</span>}
                  </div>
                </div>
              );
            })}
          </div>

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
        </>
      )}

      {selectedBidItem && (
        <BidLevelingReportDialog
          open={reportOpen}
          onOpenChange={(v) => {
            setReportOpen(v);
            if (!v) {
              supabase
                .from("bid_leveling_reports")
                .select("bid_item_id, generated_at")
                .in("bid_item_id", bidItems.map((bi) => bi.id))
                .then(({ data }) => {
                  setSavedReports(new Map((data ?? []).map((r: any) => [r.bid_item_id, r.generated_at])));
                });
            }
          }}
          bidItem={selectedBidItem}
          quotes={vqs}
          adjustmentsForQuote={adjustmentsForQuote}
          leveledForQuote={leveledForQuote}
        />
      )}
    </div>
  );
}
