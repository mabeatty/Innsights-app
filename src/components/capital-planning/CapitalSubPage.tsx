import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Upload, Sparkles } from "lucide-react";
import { fmt, LOAN_TYPES, RATE_TYPES, AMORTIZATION_SCHEDULES } from "./types";
import type { DebtTranche } from "./types";
import DebtTermsUploadDialog from "./DebtTermsUploadDialog";

interface Props {
  budgetTotal: number;
  debtTranches: DebtTranche[];
  addDebt: (fields?: Partial<DebtTranche>) => Promise<void>;
  updateDebt: (id: string, fields: Partial<DebtTranche>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
}

/* ── Debt Tranche Modal ── */
function DebtModal({
  open, onOpenChange, tranche, prefill, onSave, onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tranche: Partial<DebtTranche> | null;
  prefill: Partial<DebtTranche> | null;
  onSave: (fields: Partial<DebtTranche>) => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<Partial<DebtTranche>>({});
  const isEdit = !!tranche?.id;
  const activeForm = { ...tranche, ...prefill, ...form };
  const isFloating = (activeForm.rate_type ?? "Fixed") === "Floating";
  const fromExtraction = !isEdit && prefill && Object.keys(prefill).length > 0;

  const handleSave = () => {
    onSave({ ...prefill, ...form });
    setForm({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setForm({}); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Debt Tranche" : "Add Debt Tranche"}</DialogTitle>
        </DialogHeader>
        {fromExtraction && (
          <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/5 rounded-md px-2.5 py-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Drafted from your uploaded document — review before saving.
          </div>
        )}
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Lender Name</Label>
            <Input value={activeForm.lender_name ?? ""} onChange={e => setForm(f => ({ ...f, lender_name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Loan Type</Label>
            <Select value={activeForm.loan_type ?? "Construction Loan"} onValueChange={v => setForm(f => ({ ...f, loan_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LOAN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Loan Amount ($)</Label>
            <Input type="number" value={activeForm.loan_amount ?? 0} onChange={e => setForm(f => ({ ...f, loan_amount: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Interest Rate (%)</Label>
              <Input type="number" step="0.01" value={activeForm.interest_rate ?? 0} onChange={e => setForm(f => ({ ...f, interest_rate: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Rate Type</Label>
              <Select value={activeForm.rate_type ?? "Fixed"} onValueChange={v => setForm(f => ({ ...f, rate_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RATE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {isFloating && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Index (e.g. SOFR)</Label>
                <Input value={activeForm.index_name ?? ""} onChange={e => setForm(f => ({ ...f, index_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Spread (%)</Label>
                <Input type="number" step="0.01" value={activeForm.spread ?? ""} onChange={e => setForm(f => ({ ...f, spread: parseFloat(e.target.value) || null }))} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Loan Term (months)</Label>
              <Input type="number" value={activeForm.loan_term ?? 0} onChange={e => setForm(f => ({ ...f, loan_term: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Maturity Date</Label>
              <Input type="date" value={activeForm.maturity_date ?? ""} onChange={e => setForm(f => ({ ...f, maturity_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Amortization Schedule</Label>
            <Select value={activeForm.amortization_schedule ?? "Interest Only"} onValueChange={v => setForm(f => ({ ...f, amortization_schedule: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AMORTIZATION_SCHEDULES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Origination Fee (%)</Label>
            <Input type="number" step="0.01" value={activeForm.origination_fee ?? 0} onChange={e => setForm(f => ({ ...f, origination_fee: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Extension Options</Label>
            <Input value={activeForm.extension_options ?? ""} onChange={e => setForm(f => ({ ...f, extension_options: e.target.value }))} placeholder="e.g. 2 x 12 months" />
          </div>
          <div className="space-y-1.5">
            <Label>Required Reserves</Label>
            <Input value={activeForm.required_reserves ?? ""} onChange={e => setForm(f => ({ ...f, required_reserves: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={activeForm.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {isEdit && onDelete && (
            <Button variant="destructive" size="sm" onClick={() => { onDelete(); onOpenChange(false); setForm({}); }}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => { setForm({}); onOpenChange(false); }}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Field display helper ── */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/* ── Main Capital Sub-Page: cap stack summary + debt terms (no investor detail) ── */
export default function CapitalSubPage({ budgetTotal, debtTranches, addDebt, updateDebt, deleteDebt }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<DebtTranche | null>(null);
  const [prefill, setPrefill] = useState<Partial<DebtTranche> | null>(null);

  const totalDebt = useMemo(() => debtTranches.reduce((s, d) => s + Number(d.loan_amount), 0), [debtTranches]);
  // Equity is backed into from project cost minus debt — never entered directly,
  // and no individual investor amounts are shown here (that detail lives in
  // the separate Investment section, not on this project-level tab).
  const equity = Math.max(budgetTotal - totalDebt, 0);
  const debtPct = budgetTotal > 0 ? (totalDebt / budgetTotal * 100) : 0;
  const equityPct = budgetTotal > 0 ? (equity / budgetTotal * 100) : 0;

  const handleSave = async (fields: Partial<DebtTranche>) => {
    if (editing) {
      await updateDebt(editing.id, fields);
    } else {
      await addDebt(fields);
    }
    setEditing(null);
    setPrefill(null);
  };

  const handleExtracted = (fields: Partial<DebtTranche>) => {
    setEditing(null);
    setPrefill(fields);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Cap Stack Summary */}
      <div className="rounded-lg border p-4 bg-card">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Cap Stack Summary</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Project Cost</p>
            <p className="text-lg font-semibold text-foreground">{fmt(budgetTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Debt ({debtPct.toFixed(1)}%)</p>
            <p className="text-lg font-semibold text-foreground">{fmt(totalDebt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Equity ({equityPct.toFixed(1)}%)</p>
            <p className="text-lg font-semibold text-foreground">{fmt(equity)}</p>
          </div>
        </div>
        {/* Simple stacked bar visualizing the split */}
        <div className="mt-3 h-2 rounded-full overflow-hidden bg-muted flex">
          <div className="h-full bg-blue-500" style={{ width: `${debtPct}%` }} />
          <div className="h-full bg-emerald-500" style={{ width: `${equityPct}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Equity is calculated as Project Cost − Total Debt. Individual investor commitments are tracked separately and aren't shown here.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> Upload Commitment Letter / Term Sheet
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(null); setPrefill(null); setModalOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Debt Tranche
        </Button>
      </div>

      {/* Debt Tranche Cards */}
      {debtTranches.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">No debt tranches yet.</p>
      )}
      {debtTranches.map(dt => {
        const rateDisplay = dt.rate_type === "Floating"
          ? `${dt.index_name ?? "Index"} + ${dt.spread ?? 0}% Floating`
          : `${dt.interest_rate}% Fixed`;
        return (
          <div key={dt.id} className="rounded-lg border p-5 bg-card relative">
            <div className="absolute top-3 right-3 flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => { setEditing(dt); setPrefill(null); setModalOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete" onClick={() => deleteDebt(dt.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <Field label="Lender Name" value={dt.lender_name} />
              <Field label="Amortization Schedule" value={dt.amortization_schedule} />
              <Field label="Loan Type" value={dt.loan_type} />
              <Field label="Origination Fee" value={`${dt.origination_fee}%`} />
              <Field label="Loan Amount" value={fmt(Number(dt.loan_amount))} />
              <Field label="Extension Options" value={dt.extension_options ?? ""} />
              <Field label="Interest Rate" value={rateDisplay} />
              <Field label="Required Reserves" value={dt.required_reserves ?? ""} />
              <Field label="Loan Term" value={`${dt.loan_term} months`} />
              <Field label="Notes" value={dt.notes ?? ""} />
              <Field label="Maturity Date" value={dt.maturity_date ?? ""} />
            </div>
          </div>
        );
      })}

      <DebtModal
        open={modalOpen}
        onOpenChange={(o) => { setModalOpen(o); if (!o) setPrefill(null); }}
        tranche={editing}
        prefill={prefill}
        onSave={handleSave}
        onDelete={editing ? () => deleteDebt(editing.id) : undefined}
      />

      <DebtTermsUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onExtracted={handleExtracted} />
    </div>
  );
}
