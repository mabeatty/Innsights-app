import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import CalendarVisibilityMenu, { type CalendarVisibility } from "./CalendarVisibilityMenu";
import {
  ZOOM_PX_PER_MONTH, buildTicks, buildYears,
  computeRange, constructionSegments, makeScale, projectFinish, projectSpan, resolvePxPerMonth, sortByFinish, type FinishSort, type PhaseSegment, type Zoom,
} from "@/lib/masterCalendar";

// Structural types so the dashboard's richer ProjectRow satisfies these as-is.
export interface CalendarProject {
  id: string;
  name: string;
  _status?: string | null;
  _kind?: "Dev" | "PIP" | null; // Development vs PIP (renovation) project
  _brand?: string | null; // hotel brand, e.g. "Home2 Suites" (dual brands joined with " / ")
  _phases?: PhaseSegment[];
}

interface Props {
  projects: CalendarProject[];
  today?: Date; // injectable for tests
  visibility?: CalendarVisibility; // omit to hide the show/hide control (e.g. view-only users)
}

// Wide enough for "Hilton Garden Inn · Under Construction" on the second line.
export const NAME_COLUMN_WIDTH = 260;
const NAME_W = NAME_COLUMN_WIDTH;
const ROW_H = 40;
const BAR_H = 20;
const HEADER_YEAR_H = 24;
const HEADER_TICK_H = 24;

const dayLabel = (d: Date) => format(d, "MMM d, yyyy");

function segmentTooltip(seg: PhaseSegment): string {
  if (!seg.hasEnd) return `Starts ${dayLabel(seg.start)} · end date not set`;
  if (!seg.hasStart) return `Ends ${dayLabel(seg.end)} · start date not set`;
  return `${dayLabel(seg.start)} → ${dayLabel(seg.end)}`;
}

export default function MasterCalendar({ projects: projectsProp, today: todayProp, visibility }: Props) {
  const todayRef = useRef(todayProp ?? new Date());
  const today = todayProp ?? todayRef.current;
  const [zoom, setZoom] = useState<Zoom>("fit"); // overview first: the whole portfolio timeline in one screen
  // Callback ref + state (not useRef) so measuring starts whenever the scroller
  // mounts, even if the chart first rendered empty.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  useLayoutEffect(() => {
    if (!scroller) return;
    const measure = () => setContainerW(scroller.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);

  const [sort, setSort] = useState<FinishSort>("earliest");
  // One flat list, ordered by when each project finishes.
  const projects = useMemo(
    () => sortByFinish(projectsProp, sort, (p) => projectFinish(p._phases ?? [])),
    [projectsProp, sort],
  );
  const datedCount = projects.filter((p) => projectSpan(p._phases ?? []) !== null).length;

  const range = useMemo(() => {
    const dates: Date[] = [];
    for (const p of projects) {
      for (const s of constructionSegments(p._phases ?? [])) dates.push(s.start, s.end);
    }
    return computeRange(dates, today);
  }, [projects, today]);

  const scale = useMemo(
    () => makeScale(range, resolvePxPerMonth(ZOOM_PX_PER_MONTH[zoom], range, containerW, NAME_W)),
    [range, zoom, containerW],
  );
  const ticks = useMemo(() => buildTicks(range, scale.pxPerMonth), [range, scale.pxPerMonth]);
  const years = useMemo(() => buildYears(range), [range]);
  const contentW = NAME_W + scale.width;
  const todayX = scale.x(today);
  const todayInRange = todayX >= 0 && todayX <= scale.width;

  // `force` = the Today button: always bring today into view. Otherwise (first
  // render, zoom change) only scroll if today would be off-screen — if it's
  // already visible, keep the start of the timeline in view instead of cutting
  // off the earliest bars for no reason.
  const scrollToToday = useCallback((force: boolean) => {
    const el = scroller;
    if (!el) return;
    const todayPos = NAME_W + scale.x(today);
    if (!force && todayPos < el.clientWidth - 80) { el.scrollLeft = 0; return; }
    el.scrollLeft = Math.max(0, todayPos - el.clientWidth * 0.35);
  }, [scale, today, scroller]);

  // Re-position when the chart first renders or the zoom/range changes — not on
  // every collapse/expand, which would yank the view away from where you are.
  useEffect(() => { scrollToToday(false); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom, scroller, range.start.getTime(), range.end.getTime()]);

  if (projects.length === 0) {
    // Keep the show/hide control reachable when everything is hidden, or there'd be no way back.
    const allHidden = !!visibility && visibility.options.length > 0;
    return (
      <div className="space-y-3">
        {visibility && <div className="flex justify-end"><CalendarVisibilityMenu {...visibility} /></div>}
        <p className="text-sm text-muted-foreground">
          {allHidden ? "All projects are hidden from the calendar." : "No projects to show on the calendar."}
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-blue-600" />Project timeline</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-0.5 bg-destructive" />Today</span>
          <div className="ml-auto flex items-center gap-3">
            <span data-testid="coverage">{datedCount} of {projects.length} projects have construction dates</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => scrollToToday(true)}>Today</Button>
            {visibility && <CalendarVisibilityMenu {...visibility} />}
            <ToggleGroup type="single" size="sm" variant="outline" value={sort} onValueChange={(v) => { if (v) setSort(v as FinishSort); }}>
              <ToggleGroupItem value="earliest" className="h-7 px-2.5 text-xs">Earliest finish</ToggleGroupItem>
              <ToggleGroupItem value="latest" className="h-7 px-2.5 text-xs">Latest finish</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup type="single" size="sm" variant="outline" value={zoom} onValueChange={(v) => { if (v) setZoom(v as Zoom); }}>
              <ToggleGroupItem value="months" className="h-7 px-2.5 text-xs">Months</ToggleGroupItem>
              <ToggleGroupItem value="quarters" className="h-7 px-2.5 text-xs">Quarters</ToggleGroupItem>
              <ToggleGroupItem value="fit" className="h-7 px-2.5 text-xs">Fit</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {datedCount === 0 && (
          <p className="text-xs text-muted-foreground">
            No project has construction dates yet. Add start and end dates for the Construction phase on a project's Schedule tab and it will appear here.
          </p>
        )}

        <div ref={setScroller} className="overflow-auto rounded-md border bg-card max-h-[75vh]" data-testid="calendar-scroller">
          <div style={{ width: contentW }}>
            {/* header */}
            <div className="sticky top-0 z-30 flex border-b bg-card" style={{ width: contentW }}>
              <div
                className="sticky left-0 z-40 shrink-0 border-r bg-card flex items-end px-3 pb-1.5 text-xs font-semibold text-muted-foreground"
                style={{ width: NAME_W, height: HEADER_YEAR_H + HEADER_TICK_H }}
              >
                Project
              </div>
              <div className="relative shrink-0" style={{ width: scale.width, height: HEADER_YEAR_H + HEADER_TICK_H }}>
                {years.map((y) => (
                  <div
                    key={y.year}
                    className="absolute top-0 flex items-center border-l px-2 text-[11px] font-semibold text-foreground"
                    style={{ left: scale.x(y.start), width: scale.x(y.end) - scale.x(y.start), height: HEADER_YEAR_H }}
                  >
                    {y.year}
                  </div>
                ))}
                {ticks.map((t) => (
                  <div
                    key={t.date.getTime()}
                    className="absolute flex items-center border-l pl-1 text-[10px] text-muted-foreground"
                    style={{ left: scale.x(t.date), top: HEADER_YEAR_H, height: HEADER_TICK_H }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>

            {/* body */}
            <div className="relative" style={{ width: contentW }}>
              <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: NAME_W, width: scale.width }} aria-hidden>
                {ticks.map((t) => (
                  <div
                    key={t.date.getTime()}
                    className={cn("absolute top-0 bottom-0 border-l", t.major ? "border-border" : "border-border/40")}
                    style={{ left: scale.x(t.date) }}
                  />
                ))}
              </div>

              {projects.map((p) => {
                const rowH = ROW_H;
                const span = projectSpan(p._phases ?? []);
                const hasPhases = span !== null;
                return (
                  <div key={p.id} className="group relative flex border-b" style={{ height: rowH, width: contentW }} data-testid={`row-${p.id}`}>
                    <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r bg-card px-3 group-hover:bg-muted" style={{ width: NAME_W }}>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link to={`/project/${p.id}?tab=schedule`} className="truncate text-sm font-medium text-primary hover:underline">
                        {p.name}
                      </Link>
                      {p._kind && (
                          <span
                            className={cn(
                              "shrink-0 rounded px-1 py-px text-[9px] font-semibold leading-none",
                              p._kind === "Dev"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                            )}
                          >
                            {p._kind}
                          </span>
                        )}
                      </div>
                      {[p._brand, p._status].some(Boolean) && (
                        <span className="truncate text-[10px] leading-tight text-muted-foreground">
                          {[p._brand, p._status].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                    <div className="relative shrink-0 group-hover:bg-muted/40" style={{ width: scale.width }}>
                      {!hasPhases && (
                        <div className="sticky z-[1] flex h-full w-max items-center text-xs italic text-muted-foreground" style={{ left: NAME_W + 12 }}>
                          No construction dates yet
                        </div>
                      )}
                      {span && (() => {
                        const left = scale.x(span.start);
                        const width = Math.max(scale.x(span.end) - left, 8);
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                data-testid={`bar-${p.id}`}
                                className="absolute flex items-center rounded-sm bg-blue-600"
                                style={{ left, width, height: BAR_H, top: (rowH - BAR_H) / 2, opacity: span.partial ? 0.55 : 1 }}
                              >
                                {width >= 150 && (
                                  // Sticks to the visible left edge while the bar scrolls under the
                                  // project column, so the label stays readable; it can't leave the bar.
                                  <span className="sticky truncate px-2 text-[10px] font-medium text-white" style={{ left: NAME_W + 2, maxWidth: "100%" }}>
                                    {format(span.start, "MMM yyyy")} – {format(span.end, "MMM yyyy")}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs font-medium">{p.name}: {dayLabel(span.start)} → {dayLabel(span.end)}</p>
                              {constructionSegments(p._phases ?? []).map((seg) => (
                                <p key={seg.phase} className="text-xs">{seg.name}: {segmentTooltip(seg)}</p>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}

              {todayInRange && (
                <div
                  data-testid="today-line"
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-destructive"
                  style={{ left: NAME_W + todayX }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
