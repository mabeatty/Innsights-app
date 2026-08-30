import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { TASK_STATUS_COLORS, buildWorkflowColorMap, workflowTaskColor, type CriticalPathTask } from "./criticalPathTypes";

interface Props {
  tasks: CriticalPathTask[];
  onTaskClick?: (task: CriticalPathTask) => void;
}

const LABEL_WIDTH = 260;
const ROW_H = 40;
const MIN_ZOOM = 40;
const MAX_ZOOM = 200;
const DEFAULT_ZOOM = 90;
const ZOOM_STEP = 20;

export default function CriticalPathGantt({ tasks, onTaskClick }: Props) {
  const [monthColWidth, setMonthColWidth] = useState(DEFAULT_ZOOM);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Only tasks with usable dates can be plotted; others still get a label row
  // with a "no dates" placeholder so nothing silently disappears from view.
  const datedTasks = useMemo(() => tasks.filter((t) => t.start_date && t.end_date), [tasks]);

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    datedTasks.forEach((t) => {
      if (t.start_date) allDates.push(new Date(`${t.start_date}T00:00:00`));
      if (t.end_date) allDates.push(new Date(`${t.end_date}T00:00:00`));
    });
    const now = new Date();
    allDates.push(now);

    if (allDates.length <= 1) {
      return {
        timelineStart: startOfMonth(addDays(now, -30)),
        timelineEnd: endOfMonth(addDays(now, 180)),
        totalDays: 210,
      };
    }
    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
    const start = startOfMonth(addDays(min, -14));
    const end = endOfMonth(addDays(max, 14));
    return { timelineStart: start, timelineEnd: end, totalDays: differenceInDays(end, start) || 1 };
  }, [datedTasks]);

  const months = useMemo(
    () => eachMonthOfInterval({ start: timelineStart, end: timelineEnd }),
    [timelineStart, timelineEnd],
  );
  const TIMELINE_WIDTH = months.length * monthColWidth;

  const getXpx = useCallback(
    (dateStr: string) => {
      const d = new Date(`${dateStr}T00:00:00`);
      return (differenceInDays(d, timelineStart) / totalDays) * TIMELINE_WIDTH;
    },
    [timelineStart, totalDays, TIMELINE_WIDTH],
  );

  const todayPx = (differenceInDays(new Date(), timelineStart) / totalDays) * TIMELINE_WIDTH;

  const yearGroups = useMemo(() => {
    const groups: { year: number; span: number }[] = [];
    months.forEach((m) => {
      const y = m.getFullYear();
      if (groups.length > 0 && groups[groups.length - 1].year === y) groups[groups.length - 1].span++;
      else groups.push({ year: y, span: 1 });
    });
    return groups;
  }, [months]);

  // Row index lookup so we can draw a dependency connector from a
  // predecessor's row to its successor's row.
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [tasks]);

  // One consistent hue per workflow_group for this project (see
  // buildWorkflowColorMap — derived from the contractor's own schedule
  // grouping, not a fixed taxonomy), plus each task's position within its
  // group so sub-tasks get varied-but-related shades of the parent hue.
  const groupColorMap = useMemo(() => buildWorkflowColorMap(tasks), [tasks]);
  const groupRunningIndex = useMemo(() => {
    const counters = new Map<string, number>();
    const indices = new Map<string, number>();
    tasks.forEach((t) => {
      const key = t.workflow_group ?? "__none__";
      const idx = counters.get(key) ?? 0;
      indices.set(t.id, idx);
      counters.set(key, idx + 1);
    });
    return indices;
  }, [tasks]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setMonthColWidth((prev) => {
          const delta = e.deltaY > 0 ? -ZOOM_STEP / 2 : ZOOM_STEP / 2;
          return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
        });
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
        No critical path tasks yet. Upload the contractor's Gantt chart to get started.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-end gap-1 mb-2">
        <span className="text-xs text-muted-foreground mr-1">Zoom</span>
        <Button variant="outline" size="icon" className="h-7 w-7" title="Zoom out"
          onClick={() => setMonthColWidth((p) => Math.max(MIN_ZOOM, p - ZOOM_STEP))} disabled={monthColWidth <= MIN_ZOOM}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-8 text-center">{Math.round((monthColWidth / DEFAULT_ZOOM) * 100)}%</span>
        <Button variant="outline" size="icon" className="h-7 w-7" title="Zoom in"
          onClick={() => setMonthColWidth((p) => Math.min(MAX_ZOOM, p + ZOOM_STEP))} disabled={monthColWidth >= MAX_ZOOM}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto" ref={scrollContainerRef}>
          <div style={{ width: LABEL_WIDTH + TIMELINE_WIDTH }}>
            {/* Two-row header: year, then month */}
            <div className="border-b bg-muted/50">
              <div style={{ display: "grid", gridTemplateColumns: `${LABEL_WIDTH}px ${TIMELINE_WIDTH}px` }}>
                <div className="border-r border-border/50 bg-muted/50" style={{ position: "sticky", left: 0, zIndex: 30 }} />
                <div className="flex">
                  {yearGroups.map((yg, i) => (
                    <div key={i} className="text-xs font-semibold text-muted-foreground text-center py-1 border-r border-border/50" style={{ width: yg.span * monthColWidth }}>
                      {yg.year}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `${LABEL_WIDTH}px ${TIMELINE_WIDTH}px` }}>
                <div className="border-r border-border/50 bg-muted/50 text-xs font-medium px-3 py-1 flex items-center" style={{ position: "sticky", left: 0, zIndex: 30 }}>
                  Task
                </div>
                <div className="flex">
                  {months.map((m, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground text-center py-1 border-r border-border/50" style={{ width: monthColWidth }}>
                      {format(m, "MMM")}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rows */}
            <div className="relative">
              {/* Dependency connectors, drawn once behind all rows */}
              <svg
                className="absolute pointer-events-none"
                style={{ left: LABEL_WIDTH, top: 0, width: TIMELINE_WIDTH, height: tasks.length * ROW_H, zIndex: 5 }}
              >
                {tasks.map((t, idx) => {
                  if (!t.predecessor_task_id || !t.start_date) return null;
                  const predIdx = rowIndexById.get(t.predecessor_task_id);
                  const pred = tasks.find((p) => p.id === t.predecessor_task_id);
                  if (predIdx == null || !pred?.end_date) return null;
                  const x1 = getXpx(pred.end_date);
                  const y1 = predIdx * ROW_H + ROW_H / 2;
                  const x2 = getXpx(t.start_date);
                  const y2 = idx * ROW_H + ROW_H / 2;
                  const midX = (x1 + x2) / 2;
                  return (
                    <path
                      key={t.id}
                      d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                      fill="none"
                      stroke="hsl(var(--muted-foreground) / 0.35)"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                  );
                })}
              </svg>

              {tasks.map((t, idx) => {
                const hasDates = t.start_date && t.end_date;
                const barColor = workflowTaskColor(t, groupRunningIndex.get(t.id) ?? 0, groupColorMap);
                const barStartPx = hasDates ? getXpx(t.start_date!) : 0;
                const barEndPx = hasDates ? getXpx(t.end_date!) : 0;
                const barWidthPx = Math.max(barEndPx - barStartPx, 4);
                const isWideEnough = barWidthPx > 60;
                return (
                  <div key={t.id} className="flex border-b border-border/30 last:border-b-0" style={{ height: ROW_H }}>
                    <div
                      className="border-r border-border/50 px-3 flex items-center gap-1.5 text-xs truncate bg-card"
                      style={{ width: LABEL_WIDTH, position: "sticky", left: 0, zIndex: 10 }}
                      title={t.task_name}
                    >
                      <span className="truncate">{t.task_name}</span>
                    </div>
                    <div className="relative" style={{ width: TIMELINE_WIDTH }}>
                      {/* Month gridlines */}
                      <div className="absolute inset-0 flex">
                        {months.map((_, i) => (
                          <div key={i} className="border-r border-border/30" style={{ width: monthColWidth }} />
                        ))}
                      </div>

                      {hasDates ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="absolute top-1/2 -translate-y-1/2 rounded flex items-center px-1.5 cursor-pointer hover:brightness-95"
                              style={{ left: barStartPx, width: barWidthPx, height: 22, backgroundColor: barColor, opacity: 0.9, zIndex: 15 }}
                              onClick={() => onTaskClick?.(t)}
                            >
                              {isWideEnough && (
                                <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">{t.task_name}</span>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs space-y-0.5">
                            <p className="font-semibold">{t.task_name}</p>
                            <p>{format(new Date(`${t.start_date}T00:00:00`), "MMM d, yyyy")} – {format(new Date(`${t.end_date}T00:00:00`), "MMM d, yyyy")}</p>
                            <p>Status: {t.status}</p>
                            {t.workflow_group && <p>Workflow: {t.workflow_group}</p>}
                            {t.trade && <p>Trade: {t.trade}</p>}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <button
                          type="button"
                          className="absolute top-1/2 -translate-y-1/2 rounded border-2 border-dashed border-muted-foreground/25 text-[10px] text-muted-foreground px-2 flex items-center"
                          style={{ left: 8, height: 22 }}
                          onClick={() => onTaskClick?.(t)}
                        >
                          No dates set
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Today line, drawn over rows */}
              {todayPx >= 0 && todayPx <= TIMELINE_WIDTH && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none"
                  style={{ left: LABEL_WIDTH + todayPx, height: tasks.length * ROW_H, zIndex: 20 }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground flex-wrap">
        {Array.from(groupColorMap.entries()).map(([group, color]) => (
          <span key={group} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> {group}</span>
        ))}
        {groupColorMap.size === 0 && (
          <>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS["In Progress"] }} /> In progress</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: TASK_STATUS_COLORS["Complete"] }} /> Complete</span>
          </>
        )}
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-destructive" /> Today</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t border-dashed border-muted-foreground" /> Dependency</span>
      </div>
    </TooltipProvider>
  );
}
