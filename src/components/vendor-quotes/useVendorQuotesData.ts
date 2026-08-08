import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BidItem, VendorQuote, Adjustment } from "./types";
import { leveledTotal } from "./types";

export function useVendorQuotesData(projectId: string) {
  const [bidItems, setBidItems] = useState<BidItem[]>([]);
  const [quotes, setQuotes] = useState<VendorQuote[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: items }, { data: q }] = await Promise.all([
      supabase.from("vendor_bid_items").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("vendor_quotes").select("*").order("created_at"),
    ]);
    setBidItems((items as BidItem[]) ?? []);
    // filter quotes to only those belonging to this project's bid items
    const itemIds = new Set((items ?? []).map((i: any) => i.id));
    const projectQuotes = ((q as VendorQuote[]) ?? []).filter((vq) => itemIds.has(vq.bid_item_id));
    setQuotes(projectQuotes);

    const quoteIds = projectQuotes.map((vq) => vq.id);
    if (quoteIds.length > 0) {
      const { data: adj } = await supabase.from("vendor_quote_adjustments").select("*").in("quote_id", quoteIds).order("created_at");
      setAdjustments((adj as Adjustment[]) ?? []);
    } else {
      setAdjustments([]);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const quotesForItem = useCallback(
    (bidItemId: string) => quotes.filter((q) => q.bid_item_id === bidItemId),
    [quotes]
  );

  const adjustmentsForQuote = useCallback(
    (quoteId: string) => adjustments.filter((a) => a.quote_id === quoteId),
    [adjustments]
  );

  const leveledForQuote = useCallback(
    (quote: VendorQuote) => leveledTotal(quote, adjustments.filter((a) => a.quote_id === quote.id)),
    [adjustments]
  );

  return { bidItems, quotes, adjustments, loading, refetch: fetchAll, quotesForItem, adjustmentsForQuote, leveledForQuote };
}
