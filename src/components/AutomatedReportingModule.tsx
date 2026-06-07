import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, CalendarClock, Settings2, Save, Loader2, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import GenerateReportModal from "@/components/reports/GenerateReportModal";

interface AutomatedReportingModuleProps {
  projectId: string;
  projectName: string;
  entityName: string;
  brandName: string;
  projectType: string;
  onGenerated: () => void;
}

interface ContentConfig {
  include_project_overview: boolean;
  include_schedule_summary: boolean;
  include_budget_vs_actual: boolean;
  include_draw_status: boolean;
  include_cash_planning: boolean;
  include_weekly_summaries: boolean;
}

const DEFAULT_CONFIG: ContentConfig = {
  include_project_overview: true,
  include_schedule_summary: true,
  include_budget_vs_actual: true,
  include_draw_status: true,
  include_cash_planning: true,
  include_weekly_summaries: true,
};

const CHECKLIST_ITEMS: { key: keyof ContentConfig; label: string; description: string }[] = [
  { key: "include_project_overview", label: "Project Snapshot", description: "Construction start, projected completion, current status" },
  { key: "include_budget_vs_actual", label: "Financial Summary", description: "Budget vs actual by category with line item detail and % complete" },
  { key: "include_draw_status", label: "Draw Status", description: "Current draw #, amount requested, cumulative total" },
  { key: "include_cash_planning", label: "Capital Summary", description: "Equity and debt aggregate totals with source detail" },
  { key: "include_weekly_summaries", label: "Monthly Activity Summary", description: "AI-summarized bullet points from weekly reports" },
];

export default function AutomatedReportingModule({ projectId, projectName, entityName, brandName, projectType, onGenerated }: AutomatedReportingModuleProps) {
  const { accessLevel } = useAuth();
  const canEdit = accessLevel !== "view";

  const [config, setConfig] = useState<ContentConfig>(DEFAULT_CONFIG);
  const [configId, setConfigId] = useState<string | null>(null);

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [scheduleConfigId, setScheduleConfigId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const fetchConfig = useCallback(async () => {
    const [{ data: contentData }, { data: scheduleData }] = await Promise.all([
      supabase.from("report_content_config").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("scheduled_report_config").select("*").eq("project_id", projectId).maybeSingle(),
    ]);

    if (contentData) {
      setConfigId(contentData.id);
      setConfig({
        include_project_overview: contentData.include_project_overview,
        include_schedule_summary: contentData.include_schedule_summary,
        include_budget_vs_actual: contentData.include_budget_vs_actual,
        include_draw_status: contentData.include_draw_status,
        include_cash_planning: contentData.include_cash_planning,
        include_weekly_summaries: contentData.include_weekly_summaries,
      });
    }

    if (scheduleData) {
      setScheduleConfigId(scheduleData.id);
      setScheduleEnabled(scheduleData.enabled);
      setDayOfMonth(scheduleData.day_of_month);
      setRecipients((scheduleData.recipients as string[]) ?? []);
    }
  }, [projectId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const toggleCheckbox = (key: keyof ContentConfig) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!recipients.includes(email)) {
      setRecipients([...recipients, email]);
    }
    setNewEmail("");
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save content config
      if (configId) {
        await supabase.from("report_content_config").update({ ...config }).eq("id", configId);
      } else {
        const { data } = await supabase.from("report_content_config").insert({ project_id: projectId, ...config }).select().single();
        if (data) setConfigId(data.id);
      }

      // Save schedule config
      const schedulePayload = {
        project_id: projectId,
        enabled: scheduleEnabled,
        day_of_month: dayOfMonth,
        recipients,
      };
      if (scheduleConfigId) {
        await supabase.from("scheduled_report_config").update(schedulePayload).eq("id", scheduleConfigId);
      } else {
        const { data } = await supabase.from("scheduled_report_config").insert(schedulePayload).select().single();
        if (data) setScheduleConfigId(data.id);
      }

      toast.success("Settings saved.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-6 max-w-2xl">
      {/* Generate Report */}
      {canEdit && (
        <div className="border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileBarChart className="h-4 w-4 text-muted-foreground" /> Generate Report
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Manually generate a monthly report using the content settings below.
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setGenerateOpen(true)}>
              <FileBarChart className="h-3.5 w-3.5" /> Generate Report
            </Button>
          </div>
        </div>
      )}

      {/* Report Contents */}
      <div className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Report Contents</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Select which sections to include when generating the monthly report for this project.
        </p>

        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
              <Checkbox
                checked={config[item.key]}
                onCheckedChange={() => canEdit && toggleCheckbox(item.key)}
                disabled={!canEdit}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">{item.label}</span>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Scheduled Report Settings */}
      <div className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Scheduled Report Settings</h3>
          </div>
          <Switch checked={scheduleEnabled} onCheckedChange={canEdit ? setScheduleEnabled : undefined} disabled={!canEdit} />
        </div>

        {scheduleEnabled && (
          <div className="space-y-3 pl-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Generate on the</Label>
              <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(parseInt(v, 10))} disabled={!canEdit}>
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
              {canEdit && (
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
              )}
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1 text-xs">
                      {email}
                      {canEdit && (
                        <button onClick={() => removeRecipient(email)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
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

      {/* Save Button */}
      {canEdit && (
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save Settings</>}
        </Button>
      )}

      <GenerateReportModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        projectId={projectId}
        projectName={projectName}
        entityName={entityName}
        brandName={brandName}
        projectType={projectType}
        onGenerated={onGenerated}
      />
    </div>
  );
}
