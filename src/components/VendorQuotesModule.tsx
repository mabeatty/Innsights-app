import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useVendorQuotesData } from "./vendor-quotes/useVendorQuotesData";
import ListView from "./vendor-quotes/ListView";
import ComparisonView from "./vendor-quotes/ComparisonView";
import AwardSummaryView from "./vendor-quotes/AwardSummaryView";

type View = "list" | "comparison" | "award";

interface Props {
  projectId: string;
}

export default function VendorQuotesModule({ projectId }: Props) {
  const [view, setView] = useState<View>("list");
  const { bidItems, loading, refetch, quotesForItem } = useVendorQuotesData(projectId);

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading vendor quotes…</p>;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        {(["list", "comparison", "award"] as const).map((v) => (
          <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>
            {v === "list" ? "List View" : v === "comparison" ? "Comparison View" : "Award Summary"}
          </Button>
        ))}
      </div>

      {view === "list" && <ListView projectId={projectId} bidItems={bidItems} quotesForItem={quotesForItem} refetch={refetch} />}
      {view === "comparison" && <ComparisonView bidItems={bidItems} quotesForItem={quotesForItem} />}
      {view === "award" && <AwardSummaryView bidItems={bidItems} quotesForItem={quotesForItem} />}
    </div>
  );
}
