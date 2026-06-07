import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { toast } from "sonner";

interface AlertSetting {
  id?: string;
  alert_type: string;
  enabled: boolean;
  threshold_value: number | null;
}

interface AlertHistoryRow {
  id: string;
  alert_type: string;
  message: string;
  severity: string;
  created_at: string;
  resolved_at: string | null;
  projects: { name: string } | null;
}

const ALERT_TYPE_CONFIG = [
  { type: "contract_over_budget", label: "Contract sum exceeds original budget", category: "Budget & Cost", hasThreshold: false },
  { type: "line_item_over_budget", label: "Line item over budget", category: "Budget & Cost", hasThreshold: false },
  { type: "spend_threshold", label: "Project spend threshold reached", category: "Budget & Cost", hasThreshold: true, thresholdLabel: "First threshold (%)", defaultThreshold: 80 },
  { type: "milestone_overdue", label: "Milestone overdue", category: "Schedule & Milestones", hasThreshold: false },
  { type: "no_weekly_report", label: "No weekly report submitted", category: "Schedule & Milestones", hasThreshold: true, thresholdLabel: "Days without report", defaultThreshold: 14 },
  { type: "completion_date_changed", label: "Projected completion date changed", category: "Schedule & Milestones", hasThreshold: false },
  { type: "equity_over_commitment", label: "Equity called exceeds commitment", category: "Capital & Cash", hasThreshold: false },
  { type: "debt_over_commitment", label: "Debt drawn exceeds commitment", category: "Capital & Cash", hasThreshold: false },
  { type: "no_draw_activity", label: "No draw activity", category: "Document & Compliance", hasThreshold: true, thresholdLabel: "Days without draw", defaultThreshold: 45 },
];

const CATEGORIES = ["Budget & Cost", "Schedule & Milestones", "Capital & Cash", "Document & Compliance"];

export default function AlertsTab() {
  const { organizationId } = useAuth();
  const [settings, setSettings] = useState<Map<string, AlertSetting>>(new Map());
  const [history, setHistory] = useState<AlertHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;
    const [{ data: settingsData }, { data: historyData }] = await Promise.all([
      supabase.from("alert_settings").select("*").eq("org_id", organizationId),
      supabase.from("alerts").select("id, alert_type, message, severity, created_at, resolved_at, projects(name)")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const map = new Map<string, AlertSetting>();
    for (const config of ALERT_TYPE_CONFIG) {
      const existing = (settingsData ?? []).find((s: any) => s.alert_type === config.type);
      map.set(config.type, {
        id: existing?.id,
        alert_type: config.type,
        enabled: existing ? existing.enabled : true,
        threshold_value: existing?.threshold_value ?? config.defaultThreshold ?? null,
      });
    }
    setSettings(map);
    setHistory((historyData as unknown as AlertHistoryRow[]) ?? []);
    setLoading(false);
  };

  const updateSetting = async (alertType: string, updates: Partial<AlertSetting>) => {
    if (!organizationId) return;
    const current = settings.get(alertType);
    if (!current) return;

    const updated = { ...current, ...updates };
    setSettings(prev => new Map(prev).set(alertType, updated));

    if (current.id) {
      await supabase.from("alert_settings").update({
        enabled: updated.enabled,
        threshold_value: updated.threshold_value,
      }).eq("id", current.id);
    } else {
      const { data } = await supabase.from("alert_settings").insert({
        org_id: organizationId,
        alert_type: alertType,
        enabled: updated.enabled,
        threshold_value: updated.threshold_value,
      }).select("id").single();
      if (data) {
        setSettings(prev => new Map(prev).set(alertType, { ...updated, id: data.id }));
      }
    }
    toast.success("Alert setting updated");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Alert Configuration</h2>
        <p className="text-sm text-muted-foreground">Enable or disable alert types and configure thresholds.</p>
      </div>

      {CATEGORIES.map(category => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ALERT_TYPE_CONFIG.filter(c => c.category === category).map(config => {
              const setting = settings.get(config.type);
              return (
                <div key={config.type} className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <Label className="text-sm">{config.label}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    {config.hasThreshold && setting?.enabled && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{config.thresholdLabel}:</span>
                        <Input
                          type="number"
                          className="w-20 h-7 text-xs"
                          value={setting?.threshold_value ?? ""}
                          onChange={(e) => updateSetting(config.type, { threshold_value: Number(e.target.value) || null })}
                        />
                      </div>
                    )}
                    <Switch
                      checked={setting?.enabled ?? true}
                      onCheckedChange={(v) => updateSetting(config.type, { enabled: v })}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Alert History (Last 30 Days)</CardTitle>
          <CardDescription className="text-xs">{history.length} alerts fired across all projects</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No alerts in the past 30 days</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <Badge variant={h.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] mt-0.5 shrink-0">
                      {h.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{(h.projects as any)?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{h.message}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">{format(new Date(h.created_at), "MMM d, h:mm a")}</p>
                      {h.resolved_at && <p className="text-[10px] text-green-600">Resolved</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
