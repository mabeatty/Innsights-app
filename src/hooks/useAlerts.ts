import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Alert {
  id: string;
  project_id: string;
  alert_type: string;
  message: string;
  severity: "warning" | "critical";
  created_at: string;
  resolved_at: string | null;
  dismissed_by: string | null;
  is_read: boolean;
  read_by: string[];
  projects?: { name: string } | null;
}

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("alerts")
      .select("*, projects(name)")
      .is("resolved_at", null)
      .is("dismissed_by", null)
      .order("created_at", { ascending: false })
      .limit(50);
    setAlerts((data as unknown as Alert[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAlerts();

    // Realtime subscription
    const channel = supabase
      .channel("alerts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAlerts]);

  const unreadCount = alerts.filter(a => !a.read_by?.includes(user?.id ?? "")).length;

  const markAsRead = async (alertId: string) => {
    if (!user) return;
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;
    const newReadBy = [...(alert.read_by || []), user.id];
    await supabase.from("alerts").update({ read_by: newReadBy }).eq("id", alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read_by: newReadBy } : a));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const unread = alerts.filter(a => !a.read_by?.includes(user.id));
    for (const alert of unread) {
      const newReadBy = [...(alert.read_by || []), user.id];
      await supabase.from("alerts").update({ read_by: newReadBy }).eq("id", alert.id);
    }
    setAlerts(prev => prev.map(a => ({ ...a, read_by: [...(a.read_by || []), user.id] })));
  };

  const dismissAlert = async (alertId: string) => {
    if (!user) return;
    await supabase.from("alerts").update({ dismissed_by: user.id }).eq("id", alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const getProjectAlerts = (projectId: string) =>
    alerts.filter(a => a.project_id === projectId);

  const getProjectsWithAlerts = () => {
    const set = new Set<string>();
    alerts.forEach(a => set.add(a.project_id));
    return set;
  };

  return { alerts, loading, unreadCount, markAsRead, markAllAsRead, dismissAlert, getProjectAlerts, getProjectsWithAlerts, refetch: fetchAlerts };
}
