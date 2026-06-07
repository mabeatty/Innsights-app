import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, CalendarClock } from "lucide-react";
import { toast } from "sonner";

interface ScheduleReportConfigProps {
  projectId: string;
  canEdit: boolean;
}

export default function ScheduleReportConfig({ projectId, canEdit }: ScheduleReportConfigProps) {
  const [enabled, setEnabled] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [configId, setConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_report_config")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (data) {
      setConfigId(data.id);
      setEnabled(data.enabled);
      setDayOfMonth(data.day_of_month);
      setRecipients((data.recipients as string[]) ?? []);
    }
  }, [projectId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const save = async (updates: { enabled?: boolean; day_of_month?: number; recipients?: string[] }) => {
    setSaving(true);
    const payload = {
      project_id: projectId,
      enabled: updates.enabled ?? enabled,
      day_of_month: updates.day_of_month ?? dayOfMonth,
      recipients: updates.recipients ?? recipients,
    };
    if (configId) {
      const { error } = await supabase.from("scheduled_report_config").update(payload).eq("id", configId);
      if (error) toast.error(error.message);
      else toast.success("Schedule updated.");
    } else {
      const { data, error } = await supabase.from("scheduled_report_config").insert(payload).select().single();
      if (error) toast.error(error.message);
      else { setConfigId(data.id); toast.success("Schedule saved."); }
    }
    setSaving(false);
  };

  const toggleEnabled = (val: boolean) => {
    setEnabled(val);
    save({ enabled: val });
  };

  const changeDayOfMonth = (val: string) => {
    const d = parseInt(val, 10);
    setDayOfMonth(d);
    save({ day_of_month: d });
  };

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    const updated = [...recipients, email];
    setRecipients(updated);
    setNewEmail("");
    save({ recipients: updated });
  };

  const removeRecipient = (email: string) => {
    const updated = recipients.filter((r) => r !== email);
    setRecipients(updated);
    save({ recipients: updated });
  };

  if (!canEdit) return null;

  return (
    <div className="mt-6 border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <Label className="font-medium">Schedule Monthly Report</Label>
        </div>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} />
      </div>

      {enabled && (
        <div className="space-y-3 pl-6">
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Generate on the</Label>
            <Select value={String(dayOfMonth)} onValueChange={changeDayOfMonth}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-sm whitespace-nowrap">of each month</Label>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Recipients</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add email address..."
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())}
                className="text-sm"
              />
              <Button variant="outline" size="sm" onClick={addRecipient}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1 text-xs">
                    {email}
                    <button onClick={() => removeRecipient(email)} className="ml-0.5 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {recipients.length === 0 && (
              <p className="text-xs text-muted-foreground">Add recipients who will receive the monthly report.</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Email delivery will be available once email infrastructure is configured. Reports will auto-generate for the previous calendar month.
          </p>
        </div>
      )}
    </div>
  );
}
