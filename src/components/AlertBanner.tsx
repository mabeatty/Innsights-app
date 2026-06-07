import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert as AlertType } from "@/hooks/useAlerts";

interface AlertBannerProps {
  alerts: AlertType[];
  onDismiss: (id: string) => void;
}

export function AlertBanner({ alerts, onDismiss }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            alert.severity === "critical"
              ? "border-destructive/50 bg-destructive/5 text-destructive"
              : "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="flex-1">{alert.message}</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
            onClick={() => onDismiss(alert.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
