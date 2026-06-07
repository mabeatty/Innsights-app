import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import DatePickerInput from "@/components/ui/date-picker-input";
import type { ScheduleMilestone } from "./types";

interface Props {
  milestone: ScheduleMilestone | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<ScheduleMilestone>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export default function MilestoneDialog({ milestone, open, onOpenChange, onSave, onDelete }: Props) {
  const [name, setName] = useState("");
  const [plannedDate, setPlannedDate] = useState<Date | undefined>();
  const [actualDate, setActualDate] = useState<Date | undefined>();
  const [status, setStatus] = useState("Upcoming");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (milestone) {
      setName(milestone.name);
      setPlannedDate(milestone.planned_date ? new Date(milestone.planned_date + "T00:00:00") : undefined);
      setActualDate(milestone.actual_date ? new Date(milestone.actual_date + "T00:00:00") : undefined);
      setStatus(milestone.status);
      setNotes(milestone.notes ?? "");
    }
  }, [milestone]);

  const handleSave = async () => {
    if (!milestone) return;
    setSaving(true);
    await onSave(milestone.id, {
      name,
      planned_date: plannedDate ? format(plannedDate, "yyyy-MM-dd") : null,
      actual_date: actualDate ? format(actualDate, "yyyy-MM-dd") : null,
      status: status as ScheduleMilestone["status"],
      notes: notes || null,
    });
    setSaving(false);
    onOpenChange(false);
  };

  if (!milestone) return null;

  const isClickUp = milestone.source === "clickup";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Milestone
            {isClickUp && (
              <span className="text-xs font-normal bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                ClickUp
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isClickUp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Planned Date {isClickUp && <span className="text-xs text-muted-foreground">(from ClickUp)</span>}</Label>
              <DatePickerInput value={plannedDate} onChange={setPlannedDate} fixedWeeks disabled={isClickUp} />
            </div>
            <div className="space-y-1.5">
              <Label>Actual Date {isClickUp && <span className="text-xs text-muted-foreground">(from ClickUp)</span>}</Label>
              <DatePickerInput value={actualDate} onChange={setActualDate} fixedWeeks disabled={isClickUp} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={isClickUp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Upcoming", "In Progress", "Complete", "At Risk", "Delayed"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {isClickUp && (
            <p className="text-xs text-muted-foreground italic">
              Dates and status are synced from ClickUp and cannot be edited here.
            </p>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {milestone.is_custom && !isClickUp && onDelete ? (
            <Button variant="destructive" size="sm" onClick={() => { onDelete(milestone.id); onOpenChange(false); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {!isClickUp && (
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
