const MS_DAY = 86400000;

export function freshness(dateStr: string | null): { label: string; cls: string } {
  if (!dateStr) return { label: "Date unknown", cls: "bg-muted text-muted-foreground" };
  const ageDays = (Date.now() - new Date(dateStr).getTime()) / MS_DAY;
  if (ageDays <= 182) return { label: "Fresh", cls: "bg-green-100 text-green-800" };
  if (ageDays <= 548) return { label: "Aging", cls: "bg-amber-100 text-amber-800" };
  return { label: "Stale", cls: "bg-red-100 text-red-800" };
}

export const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
