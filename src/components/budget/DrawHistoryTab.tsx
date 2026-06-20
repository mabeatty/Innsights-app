import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "./types";

export interface DrawRecord {
  id: string;
  project_id: string;
  draw_number: number;
  draw_month: string; // stored as "YYYY-MM-DD" (first of month)
  submission_date: string;
  total_amount: number;
  status: string;
  backup_url: string | null;
  notes: string | null;
  snapshot_json: any;
  created_at: string;
}

function formatDrawMonth(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function toMonthInput(dateStr: string): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 7); // "YYYY-MM"
}

interface Props {
  projectId: string;
  draws: DrawRecord[];
  onRefresh: () => void;
}

export default function DrawHistoryTab({ projectId, draws, onRefresh }: Props) {
  const [viewDraw, setViewDraw] = useState<DrawRecord | null>(null);

  // Edit state
  const [editDraw, setEditDraw] = useState<DrawRecord | null>(null);
  const [editDrawMonth, setEditDrawMonth] = useState("");
  const [editBackupUrl, setEditBackupUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("Submitted");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteDraw, setDeleteDraw] = useState<DrawRecord | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const openEdit = (d: DrawRecord) => {
    setEditDraw(d);
    setEditDrawMonth(toMonthInput(d.draw_month));
    setEditBackupUrl(d.backup_url || "");
    setEditNotes(d.notes || "");
    setEditStatus(d.status);
  };

  const handleSaveEdit = async () => {
    if (!editDraw) return;
    setSaving(true);

    const oldMonthYear = editDraw.draw_month.substring(0, 7); // "YYYY-MM"
    const newDrawMonth = editDrawMonth + "-01";
    const newMonthYear = editDrawMonth; // "YYYY-MM"
    const monthChanged = oldMonthYear !== newMonthYear;

    const { error } = await (supabase as any)
      .from("draw_history")
      .update({
        draw_month: newDrawMonth,
        backup_url: editBackupUrl || null,
        notes: editNotes || null,
        status: editStatus,
      })
      .eq("id", editDraw.id);
    if (error) {
      toast.error(error.message || "Failed to update draw.");
      setSaving(false);
      return;
    }

    // If month changed, update Cash Flow Plan
    if (monthChanged) {
      // Clear old month's draw_amount
      await (supabase as any)
        .from("capital_cash_flow")
        .update({ draw_amount: 0 })
        .eq("project_id", projectId)
        .eq("month_year", oldMonthYear);

      // Upsert new month
      const { data: existing } = await (supabase as any)
        .from("capital_cash_flow")
        .select("id")
        .eq("project_id", projectId)
        .eq("month_year", newMonthYear)
        .maybeSingle();

      if (existing) {
        await (supabase as any)
          .from("capital_cash_flow")
          .update({ draw_amount: Number(editDraw.total_amount) })
          .eq("id", existing.id);
      } else {
        await (supabase as any)
          .from("capital_cash_flow")
          .insert({
            project_id: projectId,
            month_year: newMonthYear,
            projected_spend: 0,
            draw_amount: Number(editDraw.total_amount),
          });
      }
    }

    toast.success(`Draw #${editDraw.draw_number} updated.`);
    setEditDraw(null);
    onRefresh();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteDraw) return;
    setDeleting(true);

    // Clear cash flow draw_amount for this draw's month
    const monthYear = deleteDraw.draw_month.substring(0, 7);
    await (supabase as any)
      .from("capital_cash_flow")
      .update({ draw_amount: 0 })
      .eq("project_id", projectId)
      .eq("month_year", monthYear);

    const { error } = await (supabase as any)
      .from("draw_history")
      .delete()
      .eq("id", deleteDraw.id);
    if (error) {
      toast.error("Failed to delete draw.");
    } else {
      toast.success(`Draw #${deleteDraw.draw_number} deleted.`);
      setDeleteDraw(null);
      setDeleteConfirmText("");
      onRefresh();
    }
    setDeleting(false);
  };

  const snapshot = viewDraw?.snapshot_json;
  // Sort line items ascending by the numeric prefix of the category (division
  // number, e.g. 01, 02, 62, 73). Categories without a numeric prefix fall
  // after the numbered ones, ordered alphabetically.
  const categoryPrefix = (r: any) => {
    const raw = String(r?.division_number ?? r?.division_name ?? "").trim();
    const match = raw.match(/^\s*(\d+)/);
    return { num: match ? parseInt(match[1], 10) : null, label: raw.toLowerCase() };
  };
  const snapshotRows = [...(snapshot?.budgetRows ?? [])].sort((a, b) => {
    const pa = categoryPrefix(a);
    const pb = categoryPrefix(b);
    if (pa.num !== null && pb.num !== null) return pa.num - pb.num;
    if (pa.num !== null) return -1;
    if (pb.num !== null) return 1;
    return pa.label.localeCompare(pb.label);
  });
  const snapshotG702 = snapshot?.g702 ?? {};

  const deleteEnabled = deleteConfirmText.toLowerCase() === "delete";

  return (
    <div className="space-y-4 pt-2">
      {draws.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No draws have been closed yet. Use the "Close Draw" button above to create your first draw.
        </p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                <th className="px-3 py-2 w-24">Draw #</th>
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right w-32">Total Amount</th>
                <th className="px-3 py-2 w-32">Status</th>
                <th className="px-3 py-2 w-20">Backup</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2 w-32" />
              </tr>
            </thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-medium">Draw #{d.draw_number}</td>
                  <td className="px-3 py-2 text-sm">{formatDrawMonth(d.draw_month)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(Number(d.total_amount))}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">{d.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {d.backup_url ? (
                      <a href={d.backup_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{d.notes || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setViewDraw(d)}>
                        View
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setDeleteDraw(d); setDeleteConfirmText(""); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Draw Snapshot Modal */}
      <Dialog open={!!viewDraw} onOpenChange={(open) => !open && setViewDraw(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Draw #{viewDraw?.draw_number} Snapshot — {viewDraw ? formatDrawMonth(viewDraw.draw_month) : ""}</DialogTitle>
          </DialogHeader>
          {snapshot && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">G702 Summary</h4>
                <div className="space-y-0 border rounded-lg p-4">
                  {Object.entries(snapshotG702).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className="text-sm font-medium">{typeof value === "number" ? fmt(value) : String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">G703 Schedule of Values</h4>
                <div className="rounded-lg border overflow-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-left text-xs">
                        <th className="px-3 py-2 w-14">Div</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Scheduled Value</th>
                        <th className="px-3 py-2 text-right">Previous Apps</th>
                        <th className="px-3 py-2 text-right">This Period</th>
                        <th className="px-3 py-2 text-right">Materials</th>
                        <th className="px-3 py-2 text-right">Total Completed</th>
                        <th className="px-3 py-2 text-right">% Complete</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 text-right">Retainage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshotRows.map((r: any, i: number) => (
                        <tr key={i} className="border-t text-xs">
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.division_number}</td>
                          <td className="px-3 py-1.5">{r.division_name}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.scheduled)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.previous)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.thisPeriod)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.materials)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.totalCompleted)}</td>
                          <td className="px-3 py-1.5 text-right">{r.pctComplete?.toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.balance)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(r.retainage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                Snapshot taken on {viewDraw?.created_at ? new Date(viewDraw.created_at).toLocaleDateString() : "—"}
              </Badge>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Draw Modal */}
      <Dialog open={!!editDraw} onOpenChange={(open) => !open && setEditDraw(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Draw #{editDraw?.draw_number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Edit metadata only — the G702/G703 financial snapshot is permanently locked.
          </p>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Draw Month</Label>
              <Input
                type="month"
                className="h-8 text-sm w-48"
                value={editDrawMonth}
                onChange={(e) => setEditDrawMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Backup Documents URL</Label>
              <Input className="h-8" placeholder="Google Drive link" value={editBackupUrl} onChange={(e) => setEditBackupUrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="min-h-[60px]" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDraw(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editDrawMonth}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDraw} onOpenChange={(open) => { if (!open) { setDeleteDraw(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Draw #{deleteDraw?.draw_number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are about to permanently delete Draw #{deleteDraw?.draw_number}. This action cannot be undone.
          </p>
          <div className="space-y-1 py-2">
            <Label className="text-xs">Type "delete" to confirm</Label>
            <Input
              className="h-8"
              placeholder="delete"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDraw(null); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!deleteEnabled || deleting}>
              {deleting ? "Deleting…" : "Delete Draw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
