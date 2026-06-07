import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import JSZip from "jszip";

const ALLOWED_EMAIL = "marc.alex.beatty@gmail.com";

type ExportDef = {
  label: string;
  file: string;
  // Returns rows for CSV
  fetch: () => Promise<any[]>;
};

function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headerSet = new Set<string>();
  for (const r of rows) Object.keys(r ?? {}).forEach((k) => headerSet.add(k));
  const headers: string[] = Array.from(headerSet);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape((r as any)[h])).join(","));
  return lines.join("\n");
}

function download(filename: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchAll(table: string): Promise<any[]> {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  // paginate to bypass 1000-row default
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const EXPORTS: ExportDef[] = [
  { label: "Projects", file: "projects.csv", fetch: () => fetchAll("projects") },
  { label: "Brands", file: "brands.csv", fetch: () => fetchAll("brands") },
  { label: "Budget Items", file: "budget_transactions.csv", fetch: () => fetchAll("budget_transactions") },
  { label: "Milestones", file: "schedule_milestones.csv", fetch: () => fetchAll("schedule_milestones") },
  { label: "Schedule Milestones", file: "schedule_milestones.csv", fetch: () => fetchAll("schedule_milestones") },
  { label: "Vendors", file: "global_vendors.csv", fetch: () => fetchAll("global_vendors") },
  { label: "Internal Documents", file: "internal_documents.csv", fetch: () => fetchAll("internal_documents") },
  { label: "Team Members", file: "organization_members.csv", fetch: () => fetchAll("organization_members") },
  {
    label: "Equity / Investor Data",
    file: "equity_investors.csv",
    fetch: async () => {
      const [eq, inv, pos] = await Promise.all([
        fetchAll("capital_equity_sources"),
        fetchAll("capital_investors"),
        fetchAll("investor_positions"),
      ]);
      return [
        ...eq.map((r) => ({ __source: "capital_equity_sources", ...r })),
        ...inv.map((r) => ({ __source: "capital_investors", ...r })),
        ...pos.map((r) => ({ __source: "investor_positions", ...r })),
      ];
    },
  },
  { label: "Pre-Dev Budget", file: "pre_development_budget.csv", fetch: () => fetchAll("pre_development_budget") },
];

export default function AdminExport() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login", { replace: true });
    else if ((user.email ?? "").toLowerCase() !== ALLOWED_EMAIL) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  if (loading || !user || (user.email ?? "").toLowerCase() !== ALLOWED_EMAIL) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  const exportOne = async (def: ExportDef) => {
    setBusy(def.label);
    try {
      const rows = await def.fetch();
      download(def.file, toCSV(rows));
      toast.success(`${def.label}: exported ${rows.length} rows`);
    } catch (e: any) {
      console.error(e);
      toast.error(`${def.label} failed: ${e.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    setBusy("ALL");
    try {
      const zip = new JSZip();
      // Dedupe by file name (Milestones + Schedule Milestones share a file)
      const seen = new Set<string>();
      for (const def of EXPORTS) {
        if (seen.has(def.file)) continue;
        seen.add(def.file);
        try {
          const rows = await def.fetch();
          zip.file(def.file, toCSV(rows));
        } catch (e: any) {
          zip.file(def.file.replace(/\.csv$/, ".error.txt"), String(e?.message || e));
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      download(`admin-export-${new Date().toISOString().slice(0, 10)}.zip`, blob);
      toast.success("All tables exported");
    } catch (e: any) {
      toast.error(`Export All failed: ${e.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Data Export</h1>
          <p className="text-sm text-muted-foreground">
            Temporary tool. Signed in as {user.email}.
          </p>
        </div>

        <div className="space-y-2">
          <Button onClick={exportAll} disabled={!!busy} className="w-full">
            {busy === "ALL" ? "Exporting all…" : "Export All (ZIP)"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EXPORTS.map((def) => (
            <Button
              key={def.label}
              variant="outline"
              onClick={() => exportOne(def)}
              disabled={!!busy}
            >
              {busy === def.label ? "…" : def.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
