import { Bell, AlertTriangle, DollarSign, CalendarClock, FileWarning, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAlerts, Alert } from "@/hooks/useAlerts";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

const ALERT_TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  contract_over_budget: DollarSign,
  line_item_over_budget: DollarSign,
  spend_threshold: DollarSign,
  milestone_overdue: CalendarClock,
  no_weekly_report: FileWarning,
  completion_date_changed: CalendarClock,
  equity_over_commitment: DollarSign,
  debt_over_commitment: DollarSign,
  no_draw_activity: FileWarning,
};

export function NotificationBell() {
  const { user } = useAuth();
  const { alerts, unreadCount, markAsRead, markAllAsRead } = useAlerts();

  const isUnread = (alert: Alert) => !alert.read_by?.includes(user?.id ?? "");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1 gap-1 text-muted-foreground" onClick={markAllAsRead}>
              <CheckCheck className="h-3 w-3" /> Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => {
                const Icon = ALERT_TYPE_ICONS[alert.alert_type] || AlertTriangle;
                const unread = isUnread(alert);
                return (
                  <button
                    key={alert.id}
                    onClick={() => markAsRead(alert.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${unread ? "bg-accent/30" : "opacity-60"}`}
                  >
                    <div className={`mt-0.5 rounded-full p-1.5 ${alert.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {(alert as any).projects?.name ?? "Project"}
                      </p>
                      <p className={`text-sm leading-snug ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {alert.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {unread && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
