import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BidItem, VendorQuote } from "./types";

export function useVendorQuotesData(projectId: string) {
  const [bidItems, setBidItems] = useState<BidItem[]>([]);
  const [quotes, setQuotes] = useState<VendorQuote[]>([]);
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
    setQuotes(((q as VendorQuote[]) ?? []).filter((vq) => itemIds.has(vq.bid_item_id)));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const quotesForItem = useCallback(
    (bidItemId: string) => quotes.filter((q) => q.bid_item_id === bidItemId),
    [quotes]
  );

  return { bidItems, quotes, loading, refetch: fetchAll, quotesForItem };
}
