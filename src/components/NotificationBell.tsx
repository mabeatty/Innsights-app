import { Bell, AlertTriangle, DollarSign, CalendarClock, FileWarning, CheckCheck, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useAlerts } from "@/hooks/useAlerts";
import { useNotifications } from "@/hooks/useNotifications";
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

// Where clicking an alert should land, matching ProjectView's ?tab=/&subtab=
// URL scheme. Falls back to the project's Summary tab for any alert_type
// not explicitly mapped, rather than not navigating at all.
const ALERT_TYPE_ROUTES: Record<string, { tab: string; subtab?: string }> = {
  contract_over_budget: { tab: "accounting", subtab: "contracts" },
  line_item_over_budget: { tab: "accounting", subtab: "project-accounting" },
  spend_threshold: { tab: "accounting", subtab: "project-accounting" },
  no_draw_activity: { tab: "accounting", subtab: "project-accounting" },
  milestone_overdue: { tab: "schedule" },
  completion_date_changed: { tab: "schedule" },
  no_weekly_report: { tab: "notes" },
  equity_over_commitment: { tab: "accounting", subtab: "capital" },
  debt_over_commitment: { tab: "accounting", subtab: "capital" },
};
function alertLink(projectId: string | undefined, alertType: string): string | null {
  if (!projectId) return null;
  const route = ALERT_TYPE_ROUTES[alertType] ?? { tab: "executive-summary" };
  const params = new URLSearchParams({ tab: route.tab });
  if (route.subtab) params.set("subtab", route.subtab);
  return `/project/${projectId}?${params.toString()}`;
}

interface BellItem {
  id: string;
  Icon: typeof AlertTriangle;
  heading: string;
  message: string;
  created_at: string;
  unread: boolean;
  onClick: () => void;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { alerts, markAsRead: markAlert, markAllAsRead: markAllAlerts } = useAlerts();
  const { notifications, markAsRead: markNotif, markAllAsRead: markAllNotifs } = useNotifications();

  const alertItems: BellItem[] = alerts.map((alert) => ({
    id: `alert-${alert.id}`,
    Icon: ALERT_TYPE_ICONS[alert.alert_type] || AlertTriangle,
    heading: (alert as any).projects?.name ?? "Project",
    message: alert.message,
    created_at: alert.created_at,
    unread: !alert.read_by?.includes(user?.id ?? ""),
    onClick: () => {
      markAlert(alert.id);
      const link = alertLink(alert.project_id, alert.alert_type);
      if (link) navigate(link);
    },
  }));

  const notifItems: BellItem[] = notifications.map((n) => ({
    id: `notif-${n.id}`,
    Icon: FileCheck,
    heading: n.title,
    message: n.body ?? "",
    created_at: n.created_at,
    unread: !n.is_read,
    onClick: () => {
      markNotif(n.id);
      // Every notification's stored `link` is the same generic "/invoices"
      // list — navigating there when already on that page (or after it's
      // already loaded) produces no visible change, which read as "nothing
      // happened, it just disappeared." Build a link to the specific
      // invoice instead, using invoice_id, when one is attached.
      const link = n.invoice_id ? `/invoices?open=${n.invoice_id}` : n.link;
      if (link) navigate(link);
    },
  }));

  const allItems = [...alertItems, ...notifItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  // Read items are removed from view entirely, not just dimmed — clicking
  // an item marks it read (and navigates, for alerts), and it should
  // disappear rather than linger as a dimmed entry the person has to keep
  // scrolling past.
  const items = allItems.filter((i) => i.unread);
  const unreadCount = items.length;

  const markAll = () => { markAllAlerts(); markAllNotifs(); };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" title="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 p-0 flex flex-col overscroll-contain"
        style={{ maxHeight: "min(70vh, 28rem)" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1 gap-1 text-muted-foreground" onClick={markAll}>
              <CheckCheck className="h-3 w-3" /> Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1 min-h-0">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            <div className="divide-y">
              {items.map((item) => {
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${item.unread ? "bg-accent/30" : "opacity-60"}`}
                  >
                    <div className={`mt-0.5 rounded-full p-1.5 ${item.unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs ${item.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{item.heading}</p>
                      <p className={`text-sm leading-snug ${item.unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>{item.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
                    </div>
                    {item.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
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
