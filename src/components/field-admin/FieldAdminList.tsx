import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type FieldKind =
  | { type: "text"; key: string; label: string; span?: 1 | 2; placeholder?: string }
  | { type: "date"; key: string; label: string }
  | { type: "select"; key: string; label: string; options: readonly string[] }
  | { type: "textarea"; key: string; label: string; span?: 1 | 2 };

interface ColumnDef {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: any) => React.ReactNode;
}

interface Props {
  projectId: string;
  table: string;
  titleField: string;
  itemLabel: string;
  statusField: string;
  columns: ColumnDef[];
  formFields: FieldKind[];
  defaultStatus: string;
}

export default function FieldAdminList({
  projectId, table, titleField, itemLabel, statusField, columns, formFields, defaultStatus,
}: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(table as any)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(`Failed to load ${itemLabel.toLowerCase()}s.`);
    else setRows(data ?? []);
    setLoading(false);
  }, [projectId, table, itemLabel]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    const blank: Record<string, any> = { [statusField]: defaultStatus };
    formFields.forEach((f) => { if (!(f.key in blank)) blank[f.key] = ""; });
    setForm(blank);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (row: any) => {
    setEditingId(row.id);
    setForm({ ...row });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form[titleField]?.toString().trim()) {
      toast.error(`${itemLabel} name is required.`);
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = { ...form };
    delete payload.id;
    delete payload.project_id;
    delete payload.created_at;
    delete payload.updated_at;
    delete payload.is_open;
    delete payload.resolved_at;
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    const { error } = editingId
      ? await supabase.from(table as any).update(payload).eq("id", editingId)
      : await supabase.from(table as any).insert({ ...payload, project_id: projectId });

    if (error) toast.error(`Failed to save: ${error.message}`);
    else {
      toast.success(editingId ? `${itemLabel} updated.` : `${itemLabel} added.`);
      setDialogOpen(false);
      resetForm();
      await load();
    }
    setSaving(false);
  };

  const toggleResolved = async (row: any) => {
    const nowOpen = !row.is_open;
    const { error } = await supabase
      .from(table as any)
      .update({ is_open: nowOpen, resolved_at: nowOpen ? null : new Date().toISOString() })
      .eq("id", row.id);
    if (error) toast.error("Failed to update.");
    else {
      toast.success(nowOpen ? "Marked open." : "Marked resolved.");
      await load();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from(table as any).delete().eq("id", deleteTarget.id);
    if (error) toast.error(`Failed to delete: ${error.message}`);
    else {
      toast.success(`${itemLabel} removed.`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const filteredRows = rows.filter((r) => filter === "all" || (filter === "open" ? r.is_open : !r.is_open));
  const openCount = rows.filter((r) => r.is_open).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center rounded-md border p-0.5">
          <Button variant={filter === "open" ? "secondary" : "ghost"} size="sm" className="h-7 px-3" onClick={() => setFilter("open")}>
            Open {openCount > 0 && <span className="ml-1 text-[10px] opacity-70">({openCount})</span>}
          </Button>
          <Button variant={filter === "resolved" ? "secondary" : "ghost"} size="sm" className="h-7 px-3" onClick={() => setFilter("resolved")}>
            Resolved
          </Button>
          <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" className="h-7 px-3" onClick={() => setFilter("all")}>
            All
          </Button>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add {itemLabel}
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("px-3 py-2", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                {filter === "open" ? `No open ${itemLabel.toLowerCase()}s.` : filter === "resolved" ? `No resolved ${itemLabel.toLowerCase()}s yet.` : `No ${itemLabel.toLowerCase()}s tracked yet.`}
              </td></tr>
            )}
            {!loading && filteredRows.map((row) => (
              <tr key={row.id} className={cn("border-t", !row.is_open && "opacity-60")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                    {c.render ? c.render(row) : (row[c.key] ?? "—")}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title={row.is_open ? "Mark resolved" : "Reopen"}
                      onClick={() => toggleResolved(row)}
                    >
                      {row.is_open ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(row)}>
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
            <DialogTitle>{editingId ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {formFields.map((f) => (
              <div key={f.key} className={cn("space-y-1.5", (f.type === "textarea" || f.span === 2) && "col-span-2")}>
                <Label>{f.label}</Label>
                {f.type === "text" && (
                  <Input
                    placeholder={f.placeholder}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
                {f.type === "date" && (
                  <Input
                    type="date"
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
                {f.type === "select" && (
                  <Select value={form[f.key] ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {f.type === "textarea" && (
                  <Textarea
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    rows={3}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save Changes" : `Add ${itemLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove {itemLabel}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove "{deleteTarget?.[titleField]}"? This can't be undone.
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
