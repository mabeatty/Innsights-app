import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";

// Mock ClickUp tasks — will be replaced with real API data when ClickUp is connected
const MOCK_TASKS = [
  { id: "1", name: "Review GC bid package", project: "Marriott Downtown", dueDate: "2026-03-28", completed: false },
  { id: "2", name: "Submit Draw #4 backup", project: "Hilton Airport", dueDate: "2026-03-30", completed: false },
  { id: "3", name: "Approve change order CO-007", project: "Marriott Downtown", dueDate: "2026-04-01", completed: false },
  { id: "4", name: "Upload permit documents", project: "Hampton Inn Midtown", dueDate: "2026-04-03", completed: false },
  { id: "5", name: "Schedule FF&E install walkthrough", project: "Hilton Airport", dueDate: "2026-04-05", completed: false },
  { id: "6", name: "Finalize equity waterfall model", project: "Marriott Downtown", dueDate: "2026-04-07", completed: false },
  { id: "7", name: "Review weekly report submission", project: "Hampton Inn Midtown", dueDate: "2026-04-10", completed: false },
];

interface Props {
  isConnected?: boolean;
}

export default function TodoPanel({ isConnected = false }: Props) {
  if (!isConnected) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            To-Do
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Connect ClickUp in Settings to see your to-do list</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            To-Do
          </CardTitle>
          <span className="text-xs text-muted-foreground">via ClickUp</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {MOCK_TASKS.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                  {task.name}
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                </p>
                <p className="text-xs text-muted-foreground">{task.project}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Clock className="h-3 w-3" />
                {format(new Date(task.dueDate + "T00:00:00"), "MMM d")}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
