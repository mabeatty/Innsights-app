import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import DatePickerInput from "@/components/ui/date-picker-input";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Contract, ContractType, ContractStatus, BillingMode,
  CONTRACT_TYPES, CONTRACT_STATUSES, fmt,
} from "@/components/budget/types";

interface Props {
  projectId: string;
  projectName: string;
}

interface VendorOption {
  id: string;
  name: string;
}

const statusPillClasses = (status: string) =>
  cn(
    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
    status === "Active" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "Draft" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    status === "Closed" && "bg-muted text-muted-foreground",
  );

export default function ContractsModule({ projectId, projectName }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<BillingMode>("project_rollup");
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Form state
  const [formNumber, setFormNumber] = useState("");
  const [formType, setFormType] = useState<ContractType>("Prime");
  const [formVendor, setFormVendor] = useState<string>("");
  const [formParent, setFormParent] = useState<string>("");
  const [formScope, setFormScope] = useState("");
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formRetainage, setFormRetainage] = useState<number>(0);
  const [formExecuted, setFormExecuted] = useState<Date | null>(null);
  const [formStatus, setFormStatus] = useState<ContractStatus>("Active");
  const [formNotes, setFormNotes] = useState("");

  const load = useCallback(async () => {
    const [projectRes, contractsRes, vendorsRes] = await Promise.all([
      supabase.from("projects").select("organization_id, billing_mode").eq("id", projectId).single(),
      supabase.from("contracts").select("*").eq("project_id", projectId).order("contract_number", { ascending: true }),
      supabase.from("vendors").select("id, name").eq("project_id", projectId).order("name", { ascending: true }),
    ]);
    if (projectRes.error) toast.error("Failed to load project.");
    else {
      setOrgId(projectRes.data.organization_id);
      setBillingMode((projectRes.data.billing_mode as BillingMode) ?? "project_rollup");
    }
    if (contractsRes.error) toast.error("Failed to load contracts.");
    else setContracts((contractsRes.data ?? []) as Contract[]);
    if (!vendorsRes.error) setVendors((vendorsRes.data ?? []) as VendorOption[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const parentOptions = useMemo(
    () => contracts.filter(c => c.id !== editingId && c.contract_type !== "Subcontract"),
    [contracts, editingId]
  );

  const totalContractValue = useMemo(
    () => contracts.reduce((s, c) => s + Number(c.original_amount), 0),
    [contracts]
  );

  const changeBillingMode = async (mode: BillingMode) => {
    if (mode === billingMode) return;
    setSavingMode(true);
    const prev = billingMode;
    setBillingMode(mode);
    const { error } = await supabase.from("projects").update({ billing_mode: mode }).eq("id", projectId);
    if (error) {
      setBillingMode(prev);
      toast.error("Failed to update billing mode.");
    } else {
      toast.success(mode === "contract_native" ? "Billing mode: Contract-Native" : "Billing mode: Project Rollup");
    }
    setSavingMode(false);
  };

  const resetForm = () => {
    setFormNumber("");
    setFormType("Prime");
    setFormVendor("");
    setFormParent("");
    setFormScope("");
    setFormAmount(0);
    setFormRetainage(0);
    setFormExecuted(null);
    setFormStatus("Active");
    setFormNotes("");
  };

  const openEdit = (c: Contract) => {
    setEditingId(c.id);
    setFormNumber(c.contract_number);
    setFormType(c.contract_type);
    setFormVendor(c.vendor_id ?? "");
    setFormParent(c.parent_contract_id ?? "");
    setFormScope(c.scope_summary);
    setFormAmount(Number(c.original_amount));
    setFormRetainage(Number(c.default_retainage_percent));
    setFormExecuted(c.executed_date ? new Date(c.executed_date) : null);
    setFormStatus(c.status);
    setFormNotes(c.notes ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formScope.trim()) { toast.error("Please enter a scope summary."); return; }
    if (formType !== "Prime" && !formParent) {
      // Parent is optional, but warn nothing — allow standalone subs/owner-direct
    }
    setSaving(true);
    try {
      const payload = {
        contract_number: formNumber,
        contract_type: formType,
        vendor_id: formVendor || null,
        parent_contract_id: formParent || null,
        scope_summary: formScope,
        original_amount: formAmount,
        default_retainage_percent: formRetainage,
        executed_date: formExecuted ? format(formExecuted, "yyyy-MM-dd") : null,
        status: formStatus,
        notes: formNotes || null,
      };

      if (editingId) {
        const { error } = await supabase.from("contracts").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Contract updated.");
      } else {
        if (!orgId) { toast.error("Missing organization context."); setSaving(false); return; }
        const { error } = await supabase.from("contracts").insert({ ...payload, project_id: projectId, org_id: orgId });
        if (error) throw error;
        toast.success("Contract added.");
      }
      setDialogOpen(false);
      setEditingId(null);
      resetForm();
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save contract.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("contracts").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Contract deleted.");
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete contract.");
    }
  };

  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.name ?? "—";

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading contracts…</p>;

  return (
    <div className="space-y-4 pt-2">
      {/* Billing mode + toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Billing mode</span>
          <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
            <button
              disabled={savingMode}
              onClick={() => changeBillingMode("project_rollup")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-all",
                billingMode === "project_rollup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              Project Rollup
            </button>
            <button
              disabled={savingMode}
              onClick={() => changeBillingMode("contract_native")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-all",
                billingMode === "contract_native" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              Contract-Native
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {billingMode === "contract_native"
              ? "Each contract bills its own G702/G703, rolled up to the owner draw."
              : "One aggregated G702/G703 per draw."}
          </span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> New Contract
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-left">
              <th className="px-3 py-2 w-28">Contract #</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2 w-32">Type</th>
              <th className="px-3 py-2 w-40">Vendor</th>
              <th className="px-3 py-2 text-right w-32">Original Amount</th>
              <th className="px-3 py-2 text-right w-24">Retainage</th>
              <th className="px-3 py-2 w-24">Status</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No contracts yet.</td></tr>
            ) : contracts.map(c => (
              <tr key={c.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono text-muted-foreground">{c.contract_number || "—"}</td>
                <td className={cn("px-3 py-2", c.contract_type === "Subcontract" && "pl-6 text-muted-foreground")}>
                  {c.contract_type === "Subcontract" && "↳ "}{c.scope_summary}
                </td>
                <td className="px-3 py-2 text-xs">{c.contract_type}</td>
                <td className="px-3 py-2 text-xs">{vendorName(c.vendor_id)}</td>
                <td className="px-3 py-2 text-right">{fmt(Number(c.original_amount))}</td>
                <td className="px-3 py-2 text-right">{Number(c.default_retainage_percent)}%</td>
                <td className="px-3 py-2"><span className={statusPillClasses(c.status)}>{c.status}</span></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setDeleteTarget(c); setDeleteConfirmText(""); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {contracts.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/50 font-semibold">
                <td className="px-3 py-2" colSpan={4}>Total contract value</td>
                <td className="px-3 py-2 text-right">{fmt(totalContractValue)}</td>
                <td className="px-3 py-2" colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Contract" : "New Contract"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Contract #</Label>
                <Input className="h-8" value={formNumber} onChange={e => setFormNumber(e.target.value)} placeholder="e.g. GC-001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as ContractType)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Scope Summary *</Label>
              <Input className="h-8" value={formScope} onChange={e => setFormScope(e.target.value)} placeholder="e.g. Turner Construction — Prime" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Vendor</Label>
                <Select value={formVendor || "__none__"} onValueChange={(v) => setFormVendor(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Parent Contract</Label>
                <Select value={formParent || "__none__"} onValueChange={(v) => setFormParent(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {parentOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.contract_number || c.scope_summary}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Original Amount</Label>
                <Input type="number" className="h-8" value={formAmount || ""} onChange={e => setFormAmount(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Retainage %</Label>
                <Input type="number" step="0.01" min="0" className="h-8" value={formRetainage || ""} onChange={e => setFormRetainage(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ContractStatus)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Executed Date</Label>
              <DatePickerInput value={formExecuted ?? undefined} onChange={(d) => setFormExecuted(d ?? null)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="min-h-[60px]" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Contract"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contract</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are about to delete <strong>{deleteTarget?.contract_number || deleteTarget?.scope_summary}</strong>. Any transactions or change orders linked to it will be detached (not deleted). This cannot be undone.
          </p>
          <div className="space-y-1 py-2">
            <Label className="text-xs">Type "delete" to confirm</Label>
            <Input className="h-8" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="delete" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmText.toLowerCase() !== "delete"} onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
