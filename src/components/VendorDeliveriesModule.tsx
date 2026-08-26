import { useEffect, useState, useCallback } from "react";
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
import { Plus, Pencil, Trash2, ExternalLink, Truck } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

interface VendorOption {
  id: string;
  vendor_name: string;
}

const DELIVERY_TYPES = ["Delivery", "Rental"] as const;
type DeliveryType = (typeof DELIVERY_TYPES)[number];

const STATUSES = ["Requested", "Scheduled", "Delivered", "Picked Up", "Cancelled"] as const;
type DeliveryStatus = (typeof STATUSES)[number];

interface VendorDelivery {
  id: string;
  project_id: string;
  vendor_id: string | null;
  vendor_name: string;
  delivery_type: DeliveryType;
  item_description: string;
  unit_number: string | null;
  contract_number: string | null;
  requested_date: string | null;
  delivery_date: string | null;
  pickup_date: string | null;
  cost: number | null;
  status: DeliveryStatus;
  agreement_url: string | null;
  notes: string | null;
}

const statusPillClasses = (status: string) =>
  cn(
    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
    status === "Requested" && "bg-muted text-muted-foreground",
    status === "Scheduled" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    status === "Delivered" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "Picked Up" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    status === "Cancelled" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  );

const fmtDate = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), "MM/dd/yy") : "—");
const fmtCost = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function VendorDeliveriesModule({ projectId }: Props) {
  const [rows, setRows] = useState<VendorDelivery[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VendorDelivery | null>(null);

  // Form state
  const [formVendorId, setFormVendorId] = useState<string>("");
  const [formVendorName, setFormVendorName] = useState("");
  const [formType, setFormType] = useState<DeliveryType>("Delivery");
  const [formItem, setFormItem] = useState("");
  const [formUnitNumber, setFormUnitNumber] = useState("");
  const [formContractNumber, setFormContractNumber] = useState("");
  const [formRequestedDate, setFormRequestedDate] = useState<Date | undefined>(undefined);
  const [formDeliveryDate, setFormDeliveryDate] = useState<Date | undefined>(undefined);
  const [formPickupDate, setFormPickupDate] = useState<Date | undefined>(undefined);
  const [formCost, setFormCost] = useState<number | "">("");
  const [formStatus, setFormStatus] = useState<DeliveryStatus>("Requested");
  const [formAgreementUrl, setFormAgreementUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [rowsRes, vendorsRes] = await Promise.all([
      supabase
        .from("vendor_deliveries")
        .select("*")
        .eq("project_id", projectId)
        .order("delivery_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("global_vendors").select("id, vendor_name").order("vendor_name", { ascending: true }),
    ]);
    if (rowsRes.error) toast.error("Failed to load deliveries.");
    else setRows((rowsRes.data ?? []) as VendorDelivery[]);
    if (!vendorsRes.error) setVendors((vendorsRes.data ?? []) as VendorOption[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setFormVendorId("");
    setFormVendorName("");
    setFormType("Delivery");
    setFormItem("");
    setFormUnitNumber("");
    setFormContractNumber("");
    setFormRequestedDate(undefined);
    setFormDeliveryDate(undefined);
    setFormPickupDate(undefined);
    setFormCost("");
    setFormStatus("Requested");
    setFormAgreementUrl("");
    setFormNotes("");
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (row: VendorDelivery) => {
    setEditingId(row.id);
    setFormVendorId(row.vendor_id ?? "");
    setFormVendorName(row.vendor_name);
    setFormType(row.delivery_type);
    setFormItem(row.item_description);
    setFormUnitNumber(row.unit_number ?? "");
    setFormContractNumber(row.contract_number ?? "");
    setFormRequestedDate(row.requested_date ? new Date(`${row.requested_date}T00:00:00`) : undefined);
    setFormDeliveryDate(row.delivery_date ? new Date(`${row.delivery_date}T00:00:00`) : undefined);
    setFormPickupDate(row.pickup_date ? new Date(`${row.pickup_date}T00:00:00`) : undefined);
    setFormCost(row.cost ?? "");
    setFormStatus(row.status);
    setFormAgreementUrl(row.agreement_url ?? "");
    setFormNotes(row.notes ?? "");
    setDialogOpen(true);
  };

  const handleVendorSelect = (id: string) => {
    setFormVendorId(id);
    const v = vendors.find((v) => v.id === id);
    if (v) setFormVendorName(v.vendor_name);
  };

  const handleSave = async () => {
    if (!formVendorName.trim() || !formItem.trim()) {
      toast.error("Vendor and item description are required.");
      return;
    }
    setSaving(true);
    const payload = {
      project_id: projectId,
      vendor_id: formVendorId || null,
      vendor_name: formVendorName.trim(),
      delivery_type: formType,
      item_description: formItem.trim(),
      unit_number: formUnitNumber.trim() || null,
      contract_number: formContractNumber.trim() || null,
      requested_date: formRequestedDate ? format(formRequestedDate, "yyyy-MM-dd") : null,
      delivery_date: formDeliveryDate ? format(formDeliveryDate, "yyyy-MM-dd") : null,
      pickup_date: formPickupDate ? format(formPickupDate, "yyyy-MM-dd") : null,
      cost: formCost === "" ? null : Number(formCost),
      status: formStatus,
      agreement_url: formAgreementUrl.trim() || null,
      notes: formNotes.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from("vendor_deliveries").update(payload).eq("id", editingId)
      : await supabase.from("vendor_deliveries").insert(payload);

    if (error) {
      toast.error(`Failed to save: ${error.message}`);
    } else {
      toast.success(editingId ? "Delivery updated." : "Delivery added.");
      setDialogOpen(false);
      resetForm();
      await load();
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("vendor_deliveries").delete().eq("id", deleteTarget.id);
    if (error) toast.error(`Failed to delete: ${error.message}`);
    else {
      toast.success("Delivery removed.");
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Truck className="h-4 w-4" /> Vendor Deliveries & Rentals
        </h3>
        <Button size="sm" onClick={openAddDialog} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Delivery
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Vendor</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Item / Description</th>
              <th className="px-3 py-2 text-left font-medium">Unit #</th>
              <th className="px-3 py-2 text-left font-medium">Requested</th>
              <th className="px-3 py-2 text-left font-medium">Delivery</th>
              <th className="px-3 py-2 text-left font-medium">Pickup</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Agreement</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">No deliveries or rentals tracked yet.</td></tr>
            )}
            {!loading && rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.vendor_name}</td>
                <td className="px-3 py-2">{row.delivery_type}</td>
                <td className="px-3 py-2 max-w-[240px] truncate" title={row.item_description}>{row.item_description}</td>
                <td className="px-3 py-2">{row.unit_number || "—"}</td>
                <td className="px-3 py-2">{fmtDate(row.requested_date)}</td>
                <td className="px-3 py-2">{fmtDate(row.delivery_date)}</td>
                <td className="px-3 py-2">{fmtDate(row.pickup_date)}</td>
                <td className="px-3 py-2 text-right">{fmtCost(row.cost)}</td>
                <td className="px-3 py-2"><span className={statusPillClasses(row.status)}>{row.status}</span></td>
                <td className="px-3 py-2">
                  {row.agreement_url ? (
                    <a href={row.agreement_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> View
                    </a>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditDialog(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeleteTarget(row)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Delivery" : "Add Delivery"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 col-span-2">
              <Label>Vendor</Label>
              <Select value={formVendorId} onValueChange={handleVendorSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vendor (or type below)" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Vendor name (e.g. Mobile Mini, Sunbelt Rentals)"
                value={formVendorName}
                onChange={(e) => { setFormVendorName(e.target.value); setFormVendorId(""); }}
                className="mt-1.5"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as DeliveryType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={(v) => setFormStatus(v as DeliveryStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Item / Description</Label>
              <Input
                placeholder="e.g. 20-yard dumpster, FF&E case goods shipment"
                value={formItem}
                onChange={(e) => setFormItem(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Unit / Container #</Label>
              <Input value={formUnitNumber} onChange={(e) => setFormUnitNumber(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Contract / Agreement #</Label>
              <Input value={formContractNumber} onChange={(e) => setFormContractNumber(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Requested Date</Label>
              <DatePickerInput value={formRequestedDate} onChange={setFormRequestedDate} />
            </div>

            <div className="space-y-1.5">
              <Label>Cost</Label>
              <Input
                type="number"
                step="0.01"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Date</Label>
              <DatePickerInput value={formDeliveryDate} onChange={setFormDeliveryDate} />
            </div>

            <div className="space-y-1.5">
              <Label>Pickup Date</Label>
              <DatePickerInput value={formPickupDate} onChange={setFormPickupDate} />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Agreement URL</Label>
              <Input
                placeholder="https://drive.google.com/..."
                value={formAgreementUrl}
                onChange={(e) => setFormAgreementUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formVendorName.trim() || !formItem.trim()}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Delivery</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove {deleteTarget?.item_description} from {deleteTarget?.vendor_name}? This can't be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
