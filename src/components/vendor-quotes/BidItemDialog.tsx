import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEGMENTS, type BidItem, type BidItemStatus } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  editItem?: BidItem | null;
  onSaved: () => void;
}

export default function BidItemDialog({ open, onOpenChange, projectId, editItem, onSaved }: Props) {
  const [name, setName] = useState(editItem?.item_name ?? "");
  const [segment, setSegment] = useState(editItem?.segment ?? SEGMENTS[0]);
  const [status, setStatus] = useState<BidItemStatus>((editItem?.status as BidItemStatus) ?? "Open");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editItem;

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Item name is required."); return; }
    setSaving(true);
    if (isEdit) {
      const { error } = await supabase.from("vendor_bid_items").update({ item_name: name, segment, status }).eq("id", editItem.id);
      if (error) toast.error(error.message); else { toast.success("Bid item updated."); onOpenChange(false); onSaved(); }
    } else {
      const { error } = await supabase.from("vendor_bid_items").insert({ project_id: projectId, item_name: name, segment, status });
      if (error) toast.error(error.message); else { toast.success("Bid item created."); onOpenChange(false); onSaved(); }
    }
    setSaving(false);
  };

  // Reset when opening
  const handleOpenChange = (v: boolean) => {
    if (v) { setName(editItem?.item_name ?? ""); setSegment(editItem?.segment ?? SEGMENTS[0]); setStatus((editItem?.status as BidItemStatus) ?? "Open"); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Edit Bid Item" : "Add Bid Item"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Item / Trade Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Segment</Label>
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BidItemStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Awarded">Awarded</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Item"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
