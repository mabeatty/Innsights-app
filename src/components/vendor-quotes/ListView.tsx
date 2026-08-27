import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, MoreVertical, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEGMENTS, type BidItem, type VendorQuote, type Adjustment, fmt } from "./types";
import BidItemDialog from "./BidItemDialog";
import VendorQuoteDialog from "./VendorQuoteDialog";

interface Props {
  projectId: string;
  bidItems: BidItem[];
  quotesForItem: (id: string) => VendorQuote[];
  adjustmentsForQuote: (quoteId: string) => Adjustment[];
  leveledForQuote: (quote: VendorQuote) => number;
  refetch: () => void;
  showPipColumn?: boolean;
}

export default function ListView({ projectId, bidItems, quotesForItem, adjustmentsForQuote, leveledForQuote, refetch, showPipColumn }: Props) {
  const [openSegments, setOpenSegments] = useState<Set<string>>(new Set(SEGMENTS));
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [bidDialog, setBidDialog] = useState<{ open: boolean; edit?: BidItem | null; segment?: string }>({ open: false });
  const [quoteDialog, setQuoteDialog] = useState<{ open: boolean; bidItemId?: string; edit?: VendorQuote | null }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ type: "bid" | "quote"; id: string } | null>(null);

  const toggleSegment = (s: string) => {
    const next = new Set(openSegments);
    next.has(s) ? next.delete(s) : next.add(s);
    setOpenSegments(next);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.type === "bid" ? "vendor_bid_items" : "vendor_quotes";
    const { error } = await supabase.from(table).delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message); else { toast.success("Deleted."); refetch(); }
    setDeleteTarget(null);
  };

  // Cycles Not reviewed -> Yes -> No -> Not reviewed on click, so the common
  // case (marking an item) doesn't require opening the full edit dialog.
  const handleTogglePip = async (bi: BidItem) => {
    const next = bi.included_in_pip === null ? true : bi.included_in_pip === true ? false : null;
    const { error } = await supabase.from("vendor_bid_items").update({ included_in_pip: next }).eq("id", bi.id);
    if (error) toast.error(error.message); else refetch();
  };

  const statusColor = (s: string) => {
    if (s === "Awarded") return "default";
    if (s === "Cancelled" || s === "Eliminated") return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-2">
      {SEGMENTS.map((seg) => {
        const items = bidItems.filter((bi) => bi.segment === seg);
        const isOpen = openSegments.has(seg);
        return (
          <div key={seg} className="border rounded-md bg-card">
            <button onClick={() => toggleSegment(seg)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-sm">{seg}</span>
                <Badge variant="outline" className="text-xs">{items.length}</Badge>
              </div>
            </button>
            {isOpen && (
              <div className="border-t">
                {items.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No bid items yet.</p>
                ) : (
                  <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: showPipColumn ? "26%" : "30%" }}>Item / Trade</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: "10%" }}>Vendors</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: "13%" }}>Lowest (Leveled)</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: "13%" }}>Highest (Leveled)</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: "14%" }}>Awarded</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: "9%" }}>Status</th>
                        {showPipColumn && (
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground" style={{ width: "11%" }}>In PIP?</th>
                        )}
                        <th className="px-2 py-2" style={{ width: "4%" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((bi) => {
                        const vqs = quotesForItem(bi.id);
                        const leveledAmounts = vqs.map((v) => leveledForQuote(v));
                        const lowest = leveledAmounts.length ? Math.min(...leveledAmounts) : null;
                        const highest = leveledAmounts.length ? Math.max(...leveledAmounts) : null;
                        const awarded = vqs.find((v) => v.vendor_status === "Awarded");
                        const isExpanded = expandedItem === bi.id;
                        return (
                          <tr key={bi.id} className="border-t">
                            <td colSpan={showPipColumn ? 8 : 7} className="p-0">
                              <div>
                                <div className="flex items-center cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedItem(isExpanded ? null : bi.id)}>
                                  <td className="px-4 py-2.5" style={{ width: showPipColumn ? "26%" : "30%" }}><span className="font-medium">{bi.item_name}</span></td>
                                  <td className="px-4 py-2.5" style={{ width: "10%" }}>{vqs.length}</td>
                                  <td className="px-4 py-2.5" style={{ width: "13%" }}>{fmt(lowest)}</td>
                                  <td className="px-4 py-2.5" style={{ width: "13%" }}>{fmt(highest)}</td>
                                  <td className="px-4 py-2.5" style={{ width: "14%" }}>{awarded ? awarded.vendor_name : "—"}</td>
                                  <td className="px-4 py-2.5" style={{ width: "9%" }}><Badge variant={statusColor(bi.status)}>{bi.status}</Badge></td>
                                  {showPipColumn && (
                                    <td className="px-4 py-2.5" style={{ width: "11%" }} onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => handleTogglePip(bi)}
                                        title="Click to change"
                                        className={
                                          bi.included_in_pip === true
                                            ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:opacity-80"
                                            : bi.included_in_pip === false
                                              ? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:opacity-80"
                                              : "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:opacity-80"
                                        }
                                      >
                                        {bi.included_in_pip === true ? "Yes" : bi.included_in_pip === false ? "No" : "Not reviewed"}
                                      </button>
                                    </td>
                                  )}
                                  <td className="px-2 py-2.5" style={{ width: "4%" }}>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" title="More options"><MoreVertical className="h-3.5 w-3.5" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="bg-popover">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setBidDialog({ open: true, edit: bi }); }}>Edit</DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "bid", id: bi.id }); }} className="text-destructive">Delete</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </td>
                                </div>
                                {isExpanded && (
                                  <div className="border-t bg-muted/10 px-4 py-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vendor Quotes</span>
                                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setQuoteDialog({ open: true, bidItemId: bi.id })}>
                                        <Plus className="h-3 w-3" /> Add Quote
                                      </Button>
                                    </div>
                                    {vqs.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">No vendor quotes yet.</p>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="border-b">
                                              <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground">Vendor</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">R1</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">R2</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">R3</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">R4</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Final</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Adj.</th>
                                              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Leveled Total</th>
                                              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Status</th>
                                              <th className="py-1.5 px-1"></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {vqs.map((vq) => {
                                              const adj = adjustmentsForQuote(vq.id);
                                              const leveled = leveledForQuote(vq);
                                              return (
                                              <tr key={vq.id} className="border-b last:border-0">
                                                <td className="py-1.5 pr-3 font-medium">{vq.vendor_name}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(vq.round_1_amount)}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(vq.round_2_amount)}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(vq.round_3_amount)}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(vq.round_4_amount)}</td>
                                                <td className="py-1.5 px-2 text-right">{fmt(vq.final_quote_amount)}</td>
                                                <td className="py-1.5 px-2 text-right text-muted-foreground">{adj.length > 0 ? `${adj.length}` : "—"}</td>
                                                <td className="py-1.5 px-2 text-right font-semibold">{fmt(leveled)}</td>
                                                <td className="py-1.5 px-2"><Badge variant={statusColor(vq.vendor_status)} className="text-[10px]">{vq.vendor_status}</Badge></td>
                                                <td className="py-1.5 px-1">
                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <Button variant="ghost" size="icon" className="h-6 w-6" title="More options"><MoreVertical className="h-3 w-3" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-popover">
                                                      <DropdownMenuItem onClick={() => setQuoteDialog({ open: true, bidItemId: bi.id, edit: vq })}>Edit</DropdownMenuItem>
                                                      <DropdownMenuItem onClick={() => setDeleteTarget({ type: "quote", id: vq.id })} className="text-destructive">Delete</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                </td>
                                              </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="px-4 py-2 border-t">
                  <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setBidDialog({ open: true, segment: seg })}>
                    <Plus className="h-3 w-3" /> Add Bid Item
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <BidItemDialog
        open={bidDialog.open}
        onOpenChange={(v) => setBidDialog((p) => ({ ...p, open: v }))}
        projectId={projectId}
        editItem={bidDialog.edit}
        onSaved={refetch}
        showPipColumn={showPipColumn}
      />
      {quoteDialog.bidItemId && (
        <VendorQuoteDialog
          open={quoteDialog.open}
          onOpenChange={(v) => setQuoteDialog((p) => ({ ...p, open: v }))}
          bidItemId={quoteDialog.bidItemId}
          editQuote={quoteDialog.edit}
          existingAdjustments={quoteDialog.edit ? adjustmentsForQuote(quoteDialog.edit.id) : []}
          onSaved={refetch}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
