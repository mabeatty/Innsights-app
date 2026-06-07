import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { VendorQuote, VendorStatus } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bidItemId: string;
  editQuote?: VendorQuote | null;
  onSaved: () => void;
}

function numOrNull(v: string): number | null { const n = parseFloat(v); return isNaN(n) ? null : n; }

export default function VendorQuoteDialog({ open, onOpenChange, bidItemId, editQuote, onSaved }: Props) {
  const q = editQuote;
  const [vendorName, setVendorName] = useState(q?.vendor_name ?? "");
  const [r1Ref, setR1Ref] = useState(q?.round_1_ref ?? "");
  const [r1Url, setR1Url] = useState(q?.round_1_url ?? "");
  const [r1Amt, setR1Amt] = useState(q?.round_1_amount?.toString() ?? "");
  const [r2Ref, setR2Ref] = useState(q?.round_2_ref ?? "");
  const [r2Url, setR2Url] = useState(q?.round_2_url ?? "");
  const [r2Amt, setR2Amt] = useState(q?.round_2_amount?.toString() ?? "");
  const [r3Ref, setR3Ref] = useState(q?.round_3_ref ?? "");
  const [r3Url, setR3Url] = useState(q?.round_3_url ?? "");
  const [r3Amt, setR3Amt] = useState(q?.round_3_amount?.toString() ?? "");
  const [r4Ref, setR4Ref] = useState(q?.round_4_ref ?? "");
  const [r4Url, setR4Url] = useState(q?.round_4_url ?? "");
  const [r4Amt, setR4Amt] = useState(q?.round_4_amount?.toString() ?? "");
  const [finalAmt, setFinalAmt] = useState(q?.final_quote_amount?.toString() ?? "");
  const [status, setStatus] = useState<VendorStatus>((q?.vendor_status as VendorStatus) ?? "Pending");
  const [awardDate, setAwardDate] = useState(q?.award_date ?? "");
  const [notes, setNotes] = useState(q?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editQuote;

  const computeFinal = (): number | null => {
    if (finalAmt) return numOrNull(finalAmt);
    // default to latest round entered
    for (const v of [r4Amt, r3Amt, r2Amt, r1Amt]) { const n = numOrNull(v); if (n != null) return n; }
    return null;
  };

  const handleSave = async () => {
    if (!vendorName.trim()) { toast.error("Vendor name is required."); return; }
    setSaving(true);
    const payload = {
      bid_item_id: bidItemId,
      vendor_name: vendorName,
      round_1_ref: r1Ref || null, round_1_url: r1Url || null, round_1_amount: numOrNull(r1Amt),
      round_2_ref: r2Ref || null, round_2_url: r2Url || null, round_2_amount: numOrNull(r2Amt),
      round_3_ref: r3Ref || null, round_3_url: r3Url || null, round_3_amount: numOrNull(r3Amt),
      round_4_ref: r4Ref || null, round_4_url: r4Url || null, round_4_amount: numOrNull(r4Amt),
      final_quote_amount: computeFinal(),
      vendor_status: status,
      award_date: status === "Awarded" && awardDate ? awardDate : null,
      notes: notes || null,
    };
    if (isEdit) {
      const { error } = await supabase.from("vendor_quotes").update(payload).eq("id", editQuote.id);
      if (error) toast.error(error.message); else { toast.success("Quote updated."); onOpenChange(false); onSaved(); }
    } else {
      const { error } = await supabase.from("vendor_quotes").insert(payload);
      if (error) toast.error(error.message); else { toast.success("Quote added."); onOpenChange(false); onSaved(); }
    }
    setSaving(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (v && q) {
      setVendorName(q.vendor_name); setR1Ref(q.round_1_ref ?? ""); setR1Url(q.round_1_url ?? "");
      setR1Amt(q.round_1_amount?.toString() ?? ""); setR2Ref(q.round_2_ref ?? ""); setR2Url(q.round_2_url ?? "");
      setR2Amt(q.round_2_amount?.toString() ?? ""); setR3Ref(q.round_3_ref ?? ""); setR3Url(q.round_3_url ?? "");
      setR3Amt(q.round_3_amount?.toString() ?? ""); setR4Ref(q.round_4_ref ?? ""); setR4Url(q.round_4_url ?? "");
      setR4Amt(q.round_4_amount?.toString() ?? ""); setFinalAmt(q.final_quote_amount?.toString() ?? "");
      setStatus((q.vendor_status as VendorStatus) ?? "Pending"); setAwardDate(q.award_date ?? ""); setNotes(q.notes ?? "");
    } else if (v) {
      setVendorName(""); setR1Ref(""); setR1Url(""); setR1Amt(""); setR2Ref(""); setR2Url(""); setR2Amt("");
      setR3Ref(""); setR3Url(""); setR3Amt(""); setR4Ref(""); setR4Url(""); setR4Amt("");
      setFinalAmt(""); setStatus("Pending"); setAwardDate(""); setNotes("");
    }
    onOpenChange(v);
  };

  const renderRoundFields = (round: number, ref_: string, url: string, amt: string,
    setRef: (v: string) => void, setUrl: (v: string) => void, setAmt: (v: string) => void) => (
    <div className="grid grid-cols-3 gap-2" key={round}>
      <div className="space-y-1"><Label className="text-xs">Round {round} Ref</Label><Input value={ref_} onChange={(e) => setRef(e.target.value)} placeholder="Reference" /></div>
      <div className="space-y-1"><Label className="text-xs">Drive URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></div>
      <div className="space-y-1"><Label className="text-xs">Amount</Label><Input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" /></div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Vendor Quote" : "Add Vendor Quote"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Vendor Name</Label><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></div>
          {renderRoundFields(1, r1Ref, r1Url, r1Amt, setR1Ref, setR1Url, setR1Amt)}
          {renderRoundFields(2, r2Ref, r2Url, r2Amt, setR2Ref, setR2Url, setR2Amt)}
          {renderRoundFields(3, r3Ref, r3Url, r3Amt, setR3Ref, setR3Url, setR3Amt)}
          {renderRoundFields(4, r4Ref, r4Url, r4Amt, setR4Ref, setR4Url, setR4Amt)}
          <div className="space-y-1.5"><Label>Final Quote Amount (leave blank to auto-fill from latest round)</Label><Input type="number" value={finalAmt} onChange={(e) => setFinalAmt(e.target.value)} placeholder="Auto" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vendor Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as VendorStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Eliminated">Eliminated</SelectItem>
                  <SelectItem value="Awarded">Awarded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "Awarded" && (
              <div className="space-y-1.5"><Label>Award Date</Label><Input type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} /></div>
            )}
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Scope inclusions/exclusions, conditions…" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Quote"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
