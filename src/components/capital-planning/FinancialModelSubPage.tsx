import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Link2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmt } from "./types";
import * as XLSX from "xlsx";

interface Props {
  projectId: string;
}

interface ModelData {
  // Hold-period dependent (from Cash Flow Analysis & Returns)
  unleveredIrrYear: number | null;   // row 18, col D-J
  leveredIrrYear: number | null;     // row 51, col D-J
  cocYear: number | null;            // row 51 (same as levered IRR)
  noiYear: number | null;            // row 9, col D-J
  dscrYear: number | null;           // row 37, col D-J
  // Fixed cells from Cash Flow Analysis & Returns
  unleveredIrrFull: number | null;   // C22
  leveredIrrFull: number | null;     // C55
  npvUnlevered: number | null;       // C21
  npvLevered: number | null;         // C54
  equityMultUnlevered: number | null;// C25
  equityMultLevered: number | null;  // C58
  // From Dashboard sheet
  exitCapRate: number | null;        // C42
  loanAmount: number | null;         // C28
  ltv: number | null;               // C29
  interestRate: number | null;       // C30
  minDscr: number | null;           // H33
  allInBasis: number | null;        // C25
  defaultHoldPeriod: number | null;  // C13
}

const CF_SHEET = "Cash Flow Analysis & Returns";
const DASH_SHEET = "Dashboard";

function colForYear(year: number): number {
  // year 1 = col D (index 3), year 7 = col J (index 9)
  return 3 + (year - 1);
}

function cellVal(sheet: XLSX.WorkSheet, col: number, row: number): number | null {
  const cell = sheet[XLSX.utils.encode_cell({ c: col, r: row - 1 })];
  if (!cell) return null;
  const v = typeof cell.v === "number" ? cell.v : parseFloat(cell.v);
  return isNaN(v) ? null : v;
}

function parseModel(wb: XLSX.WorkBook, holdYear: number): ModelData {
  const cf = wb.Sheets[CF_SHEET];
  const dash = wb.Sheets[DASH_SHEET];

  const yearCol = holdYear >= 1 && holdYear <= 7 ? colForYear(holdYear) : -1;

  return {
    unleveredIrrYear: yearCol >= 0 && cf ? cellVal(cf, yearCol, 18) : null,
    leveredIrrYear: yearCol >= 0 && cf ? cellVal(cf, yearCol, 51) : null,
    cocYear: yearCol >= 0 && cf ? cellVal(cf, yearCol, 51) : null,
    noiYear: yearCol >= 0 && cf ? cellVal(cf, yearCol, 9) : null,
    dscrYear: yearCol >= 0 && cf ? cellVal(cf, yearCol, 37) : null,
    unleveredIrrFull: cf ? cellVal(cf, 2, 22) : null,
    leveredIrrFull: cf ? cellVal(cf, 2, 55) : null,
    npvUnlevered: cf ? cellVal(cf, 2, 21) : null,
    npvLevered: cf ? cellVal(cf, 2, 54) : null,
    equityMultUnlevered: cf ? cellVal(cf, 2, 25) : null,
    equityMultLevered: cf ? cellVal(cf, 2, 58) : null,
    exitCapRate: dash ? cellVal(dash, 2, 42) : null,
    loanAmount: dash ? cellVal(dash, 2, 28) : null,
    ltv: dash ? cellVal(dash, 2, 29) : null,
    interestRate: dash ? cellVal(dash, 2, 30) : null,
    minDscr: dash ? cellVal(dash, 7, 33) : null,
    allInBasis: dash ? cellVal(dash, 2, 25) : null,
    defaultHoldPeriod: dash ? cellVal(dash, 2, 13) : null,
  };
}

const fmtPct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
const fmtCurrency = (v: number | null) =>
  v != null
    ? v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "—";
const fmtDscr = (v: number | null) => (v != null ? v.toFixed(2) : "—");
const fmtMultiple = (v: number | null) => (v != null ? `${v.toFixed(2)}x` : "—");
const fmtPctRate = (v: number | null) => (v != null ? `${(v * 100).toFixed(2)}%` : "—");

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function FinancialModelSubPage({ projectId }: Props) {
  const [linkedFile, setLinkedFile] = useState<{ name: string; url: string } | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [holdPeriod, setHoldPeriod] = useState("5");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [modelData, setModelData] = useState<ModelData | null>(null);

  const parseAndSetData = useCallback(
    (wb: XLSX.WorkBook, year: number) => {
      const data = parseModel(wb, year);
      setModelData(data);
      // If the model specifies a default hold period and we haven't overridden yet
      if (data.defaultHoldPeriod && data.defaultHoldPeriod >= 1 && data.defaultHoldPeriod <= 10) {
        setHoldPeriod(String(Math.round(data.defaultHoldPeriod)));
      }
    },
    []
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        setWorkbook(wb);
        const hp = parseInt(holdPeriod, 10);
        const data = parseModel(wb, hp);
        setModelData(data);
        if (data.defaultHoldPeriod && data.defaultHoldPeriod >= 1 && data.defaultHoldPeriod <= 10) {
          const defHp = Math.round(data.defaultHoldPeriod);
          setHoldPeriod(String(defHp));
          setModelData(parseModel(wb, defHp));
        }
        setLastRefreshed(new Date());
        toast.success("Financial model loaded successfully.");
      } catch {
        toast.error("Failed to parse the Excel file.");
      }
    },
    [holdPeriod]
  );

  const handleLink = () => {
    if (!linkUrl.trim()) {
      toast.error("Please enter a file URL or select a file.");
      return;
    }
    const name = linkName.trim() || "Financial Model.xlsx";
    setLinkedFile({ name, url: linkUrl.trim() });
    setShowLinkForm(false);
    setLinkUrl("");
    setLinkName("");
    toast.success("Financial model linked. Upload the file to load data.");
  };

  const handleHoldPeriodChange = (val: string) => {
    setHoldPeriod(val);
    if (workbook) {
      setModelData(parseModel(workbook, parseInt(val, 10)));
    }
  };

  const handleRefresh = async () => {
    if (!workbook) {
      toast.error("No model loaded. Upload or re-upload the Excel file.");
      return;
    }
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setModelData(parseModel(workbook, parseInt(holdPeriod, 10)));
    setLastRefreshed(new Date());
    setRefreshing(false);
    toast.success("Data refreshed.");
  };

  // ── Empty state ──
  if (!linkedFile && !showLinkForm) {
    return (
      <div className="text-center py-16 space-y-4">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Link a financial model to view returns analysis</p>
        <Button onClick={() => setShowLinkForm(true)} className="gap-2">
          <Link2 className="h-4 w-4" />
          Link Financial Model
        </Button>
      </div>
    );
  }

  // ── Link form ──
  if (showLinkForm && !linkedFile) {
    return (
      <div className="max-w-md mx-auto py-8 space-y-4">
        <h3 className="text-sm font-semibold">Link Financial Model</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">File Name</Label>
            <Input placeholder="e.g. Project Pro Forma v3.xlsx" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Google Drive URL</Label>
            <Input placeholder="https://docs.google.com/spreadsheets/d/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Or upload Excel file directly</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setLinkedFile({ name: f.name, url: "(local upload)" });
                  setShowLinkForm(false);
                  handleFileUpload(f);
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleLink}>Link</Button>
            <Button variant="outline" onClick={() => setShowLinkForm(false)}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  const hp = parseInt(holdPeriod, 10);
  const outOfRange = hp > 7;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">{linkedFile?.name}</p>
            {lastRefreshed && (
              <p className="text-xs text-muted-foreground">Last refreshed {lastRefreshed.toLocaleString()}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={holdPeriod} onValueChange={handleHoldPeriodChange}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Hold Period" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1} Year{i > 0 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh Data"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setLinkedFile(null);
              setWorkbook(null);
              setModelData(null);
              setShowLinkForm(true);
            }}
          >
            Re-link
          </Button>
          {/* Allow re-uploading */}
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setLinkedFile({ name: f.name, url: "(local upload)" });
                  handleFileUpload(f);
                }
              }}
            />
            <span className="inline-flex items-center gap-1.5 text-xs h-9 rounded-md px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
              Upload Excel
            </span>
          </label>
        </div>
      </div>

      {!modelData ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">Upload or fetch the Excel file to view metrics.</p>
        </div>
      ) : (
        <>
          {/* Returns — two-column grid */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Returns Analysis — {outOfRange ? "N/A" : `Year ${hp}`}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left column */}
              <div className="space-y-4">
                <StatCard label="Levered IRR (Full Hold)" value={fmtPct(modelData.leveredIrrFull)} />
                <StatCard label="Unlevered IRR (Full Hold)" value={fmtPct(modelData.unleveredIrrFull)} />
                <StatCard label="Equity Multiple (Levered)" value={fmtMultiple(modelData.equityMultLevered)} />
                <StatCard label="Equity Multiple (Unlevered)" value={fmtMultiple(modelData.equityMultUnlevered)} />
              </div>
              {/* Right column */}
              <div className="space-y-4">
                <StatCard label="NPV (Levered)" value={fmtCurrency(modelData.npvLevered)} />
                <StatCard label="NPV (Unlevered)" value={fmtCurrency(modelData.npvUnlevered)} />
                <StatCard label={`NOI — Year ${hp}`} value={outOfRange ? "—" : fmtCurrency(modelData.noiYear)} />
                <StatCard label={`DSCR — Year ${hp}`} value={outOfRange ? "—" : fmtDscr(modelData.dscrYear)} />
              </div>
            </div>
          </div>

          {/* Year-specific metrics */}
          {!outOfRange && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Year {hp} Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard label={`Levered IRR — Yr ${hp}`} value={fmtPct(modelData.leveredIrrYear)} />
                <StatCard label={`Unlevered IRR — Yr ${hp}`} value={fmtPct(modelData.unleveredIrrYear)} />
                <StatCard label={`Cash-on-Cash — Yr ${hp}`} value={fmtPct(modelData.cocYear)} />
              </div>
            </div>
          )}

          {/* Debt & Acquisition */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Debt & Acquisition</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Loan Amount" value={fmtCurrency(modelData.loanAmount)} />
              <StatCard label="LTV" value={fmtPct(modelData.ltv)} />
              <StatCard label="Interest Rate" value={fmtPctRate(modelData.interestRate)} />
              <StatCard label="Exit Cap Rate" value={fmtPctRate(modelData.exitCapRate)} />
              <StatCard label="All-in Basis" value={fmtCurrency(modelData.allInBasis)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
              <StatCard label="Min DSCR" value={fmtDscr(modelData.minDscr)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
