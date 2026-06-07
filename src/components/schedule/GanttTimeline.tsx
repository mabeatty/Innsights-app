import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { Plus, Pencil, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import DatePickerInput from "@/components/ui/date-picker-input";
import type { SchedulePhase, ScheduleMilestone } from "./types";
import { STATUS_COLORS } from "./types";

const PHASE_HEX_COLORS: Record<number, string> = {
  1: "#0D9488", // teal
  2: "#2563EB", // blue
  3: "#D97706", // amber
  4: "#16A34A", // green
};

interface Props {
  phases: SchedulePhase[];
  milestones: ScheduleMilestone[];
  onMilestoneClick: (m: ScheduleMilestone) => void;
  onAddMilestone: (subPhaseId: string, name: string) => Promise<void>;
  onUpdatePhase: (id: string, updates: { start_date?: string | null; end_date?: string | null }) => Promise<void>;
  onAddSubPhase: (phaseNumber: number, phaseName: string, name: string, startDate?: string | null, endDate?: string | null) => Promise<void>;
  onDeleteSubPhase: (id: string) => Promise<void>;
}


function SubPhaseDateEditor({
  phase,
  onSave,
}: {
  phase: SchedulePhase;
  onSave: (id: string, updates: { start_date?: string | null; end_date?: string | null }) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    phase.start_date ? new Date(phase.start_date + "T00:00:00") : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    phase.end_date ? new Date(phase.end_date + "T00:00:00") : undefined
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(phase.id, {
      start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
      end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-3 p-1">
      <p className="text-xs font-semibold">{phase.sub_phase_number} {phase.sub_phase_name}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <DatePickerInput value={startDate} onChange={setStartDate} fixedWeeks />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <DatePickerInput value={endDate} onChange={setEndDate} fixedWeeks />
        </div>
      </div>
      <Button size="sm" className="h-7 text-xs w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save Dates"}
      </Button>
    </div>
  );
}

export default function GanttTimeline({ phases, milestones, onMilestoneClick, onAddMilestone, onUpdatePhase, onAddSubPhase, onDeleteSubPhase }: Props) {
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [addingSubPhaseTo, setAddingSubPhaseTo] = useState<number | null>(null);
  const [newSubPhaseName, setNewSubPhaseName] = useState("");
  const [newSubPhaseStart, setNewSubPhaseStart] = useState<Date | undefined>();
  const [newSubPhaseEnd, setNewSubPhaseEnd] = useState<Date | undefined>();

  const LABEL_WIDTH = 280;
  const ROW_H = 44;
  const MIN_ZOOM = 40;
  const MAX_ZOOM = 200;
  const DEFAULT_ZOOM = 80;
  const ZOOM_STEP = 20;
  const [monthColWidth, setMonthColWidth] = useState(DEFAULT_ZOOM);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Compute timeline range from sub-phase dates + milestone dates
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    milestones.forEach((m) => {
      if (m.planned_date) allDates.push(new Date(m.planned_date + "T00:00:00"));
      if (m.actual_date) allDates.push(new Date(m.actual_date + "T00:00:00"));
    });
    phases.forEach((p) => {
      if (p.start_date) allDates.push(new Date(p.start_date + "T00:00:00"));
      if (p.end_date) allDates.push(new Date(p.end_date + "T00:00:00"));
    });
    const now = new Date();
    allDates.push(now);

    if (allDates.length === 1) {
      return {
        timelineStart: startOfMonth(addDays(now, -30)),
        timelineEnd: endOfMonth(addDays(now, 365)),
        totalDays: 395,
      };
    }

    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
    const start = startOfMonth(addDays(min, -30));
    const end = endOfMonth(addDays(max, 30));
    return { timelineStart: start, timelineEnd: end, totalDays: differenceInDays(end, start) || 1 };
  }, [milestones, phases]);

  const months = useMemo(
    () => eachMonthOfInterval({ start: timelineStart, end: timelineEnd }),
    [timelineStart, timelineEnd]
  );

  const TIMELINE_WIDTH = months.length * monthColWidth;

  // Map a date string to a pixel position in the timeline
  const getXpx = useCallback((dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return (differenceInDays(d, timelineStart) / totalDays) * TIMELINE_WIDTH;
  }, [timelineStart, totalDays, TIMELINE_WIDTH]);

  const todayPx = (differenceInDays(new Date(), timelineStart) / totalDays) * TIMELINE_WIDTH;

  // Group years for the top header row
  const yearGroups = useMemo(() => {
    const groups: { year: number; span: number }[] = [];
    months.forEach((m) => {
      const y = m.getFullYear();
      if (groups.length > 0 && groups[groups.length - 1].year === y) {
        groups[groups.length - 1].span++;
      } else {
        groups.push({ year: y, span: 1 });
      }
    });
    return groups;
  }, [months]);

  // Group phases by phase_number
  const phaseGroups = useMemo(() => {
    const map = new Map<number, { phase_name: string; sub_phases: SchedulePhase[] }>();
    phases.forEach((p) => {
      if (!map.has(p.phase_number)) {
        map.set(p.phase_number, { phase_name: p.phase_name, sub_phases: [] });
      }
      map.get(p.phase_number)!.sub_phases.push(p);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [phases]);

  const handleAddSubmit = async (subPhaseId: string) => {
    if (!newName.trim()) return;
    await onAddMilestone(subPhaseId, newName.trim());
    setNewName("");
    setAddingTo(null);
  };

  const handleAddSubPhaseSubmit = async (phaseNumber: number, phaseName: string) => {
    if (!newSubPhaseName.trim()) return;
    await onAddSubPhase(
      phaseNumber,
      phaseName,
      newSubPhaseName.trim(),
      newSubPhaseStart ? format(newSubPhaseStart, "yyyy-MM-dd") : null,
      newSubPhaseEnd ? format(newSubPhaseEnd, "yyyy-MM-dd") : null,
    );
    setNewSubPhaseName("");
    setNewSubPhaseStart(undefined);
    setNewSubPhaseEnd(undefined);
    setAddingSubPhaseTo(null);
  };

  // Month column pixel positions
  const monthColPositions = useMemo(() => {
    return months.map((_, i) => i * monthColWidth);
  }, [months, monthColWidth]);

  // Pinch-to-zoom on the scroll container
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

  return (
    <TooltipProvider delayDuration={200}>
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-1 mb-2">
        <span className="text-xs text-muted-foreground mr-1">Zoom</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setMonthColWidth((p) => Math.max(MIN_ZOOM, p - ZOOM_STEP))}
          disabled={monthColWidth <= MIN_ZOOM}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-8 text-center">{Math.round((monthColWidth / DEFAULT_ZOOM) * 100)}%</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setMonthColWidth((p) => Math.min(MAX_ZOOM, p + ZOOM_STEP))}
          disabled={monthColWidth >= MAX_ZOOM}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        {/* Scrollable container */}
        <div className="overflow-x-auto" ref={scrollContainerRef}>
          <div style={{ width: LABEL_WIDTH + TIMELINE_WIDTH }}>
            {/* Two-row header */}
            <div className="border-b bg-muted/50">
              {/* Year row */}
              <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_WIDTH}px ${TIMELINE_WIDTH}px` }}>
                <div className="border-r border-border/50 bg-muted/50" style={{ position: 'sticky', left: 0, zIndex: 30 }} />
                <div className="flex">
                  {yearGroups.map((yg, i) => (
                    <div
                      key={i}
                      className="text-xs font-semibold text-muted-foreground text-center py-1 border-r border-border/50"
                      style={{ width: yg.span * monthColWidth }}
                    >
                      {yg.year}
                    </div>
                  ))}
                </div>
              </div>
              {/* Month row */}
              <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_WIDTH}px ${TIMELINE_WIDTH}px` }}>
                <div className="border-r border-border/50 bg-muted/50" style={{ position: 'sticky', left: 0, zIndex: 30 }} />
                <div className="flex">
                  {months.map((m, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-muted-foreground text-center py-1 border-r border-border/50"
                      style={{ width: monthColWidth }}
                    >
                      {format(m, "MMM")}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rows */}
            {phaseGroups.map(([phaseNum, { phase_name, sub_phases }]) => {
              const phaseColor = PHASE_HEX_COLORS[phaseNum] || PHASE_HEX_COLORS[1];
              return (
                <div key={phaseNum}>
                  {/* Phase header — pure label row, no timeline cells, no bars */}
                  <div
                    className="flex items-center text-xs font-semibold border-b px-3"
                    style={{ height: ROW_H, backgroundColor: `${phaseColor}18`, color: phaseColor }}
                  >
                    Phase {phaseNum} — {phase_name}
                  </div>

                  {/* Sub-phases */}
                  {sub_phases.map((sp) => {
                    const spMilestones = milestones.filter((m) => m.sub_phase_id === sp.id);
                    const hasBar = !!(sp.start_date && sp.end_date);

                    return (
                      <div key={sp.id}>
                        {/* Grid row: label cell | timeline cell */}
                        <div
                          className="border-b border-border/30"
                          style={{ display: 'grid', gridTemplateColumns: `${LABEL_WIDTH}px ${TIMELINE_WIDTH}px`, height: ROW_H }}
                        >
                          {/* Label cell — sticky, opaque */}
                          <div
                            className="px-3 flex items-center gap-1.5 bg-card border-r border-border/50"
                            style={{ position: 'sticky', left: 0, zIndex: 30 }}
                          >
                            <span className="text-xs text-muted-foreground">{sp.sub_phase_number}</span>
                            <span className="text-xs truncate">{sp.sub_phase_name}</span>
                            <Popover modal>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 z-50" align="start">
                                <SubPhaseDateEditor phase={sp} onSave={onUpdatePhase} />
                              </PopoverContent>
                            </Popover>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-destructive/70 hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {sp.sub_phase_name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will also delete all milestones within it. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => onDeleteSubPhase(sp.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 ml-auto shrink-0"
                              onClick={() => { setAddingTo(addingTo === sp.id ? null : sp.id); setNewName(""); }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Timeline cell — bars render here only */}
                          <div className="relative overflow-hidden" style={{ height: ROW_H }}>
                            {/* Month gridlines */}
                            {monthColPositions.map((xPx, i) => (
                              <div
                                key={i}
                                className="absolute top-0 bottom-0 w-px bg-border/40 pointer-events-none"
                                style={{ left: xPx }}
                              />
                            ))}

                            {/* Sub-phase bar */}
                            {hasBar ? (() => {
                              const barStartPx = getXpx(sp.start_date!);
                              const barEndPx = getXpx(sp.end_date!);
                              const barWidthPx = barEndPx - barStartPx;
                              const barHex = PHASE_HEX_COLORS[sp.phase_number] || PHASE_HEX_COLORS[1];
                              const isWideEnough = barWidthPx > 60;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 rounded cursor-default flex items-center justify-center overflow-hidden"
                                      style={{
                                        left: barStartPx,
                                        width: Math.max(barWidthPx, 4),
                                        height: 24,
                                        backgroundColor: barHex,
                                        opacity: 0.85,
                                      }}
                                    >
                                      {isWideEnough && (
                                        <span className="text-[10px] font-medium text-white truncate drop-shadow-sm w-full text-center leading-[24px]">
                                          {sp.sub_phase_name}
                                        </span>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <p className="font-semibold">{sp.sub_phase_number} {sp.sub_phase_name}</p>
                                    <p>{format(new Date(sp.start_date! + "T00:00:00"), "MMM d, yyyy")} – {format(new Date(sp.end_date! + "T00:00:00"), "MMM d, yyyy")}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })() : (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 rounded border-2 border-dashed border-muted-foreground/25 pointer-events-none"
                                style={{ left: 8, width: TIMELINE_WIDTH - 16, height: 24 }}
                              />
                            )}

                            {/* Milestone diamonds */}
                            {spMilestones.map((m) => {
                              if (!m.planned_date) return null;
                              const xPx = getXpx(m.planned_date);
                              const statusColor = STATUS_COLORS[m.status] || STATUS_COLORS.Upcoming;
                              return (
                                <Tooltip key={m.id}>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 hover:scale-125 transition-transform"
                                      style={{ left: xPx }}
                                      onClick={() => onMilestoneClick(m)}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 16 16">
                                        <rect x="2" y="2" width="12" height="12" rx="1.5" transform="rotate(45 8 8)" fill={statusColor} stroke="hsl(var(--background))" strokeWidth="2" />
                                      </svg>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                                    <p className="font-semibold">{m.name}</p>
                                    <p>Planned: {m.planned_date ? format(new Date(m.planned_date + "T00:00:00"), "MMM d, yyyy") : "—"}</p>
                                    <p>Actual: {m.actual_date ? format(new Date(m.actual_date + "T00:00:00"), "MMM d, yyyy") : "—"}</p>
                                    <p>Status: {m.status}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}

                            {/* Actual date markers */}
                            {spMilestones.map((m) => {
                              if (!m.actual_date || !m.planned_date || m.actual_date === m.planned_date) return null;
                              const xPx = getXpx(m.actual_date);
                              return (
                                <Tooltip key={`${m.id}-actual`}>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 hover:scale-125 transition-transform"
                                      style={{ left: xPx }}
                                      onClick={() => onMilestoneClick(m)}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 16 16">
                                        <rect x="2" y="2" width="12" height="12" rx="1.5" transform="rotate(45 8 8)" fill="transparent" stroke={STATUS_COLORS[m.status] || STATUS_COLORS.Upcoming} strokeWidth="2.5" />
                                      </svg>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <p className="font-semibold">{m.name} (Actual)</p>
                                    <p>{format(new Date(m.actual_date + "T00:00:00"), "MMM d, yyyy")}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}

                            {/* Today line */}
                            {todayPx >= 0 && todayPx <= TIMELINE_WIDTH && (
                              <div className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none z-20" style={{ left: todayPx }} />
                            )}
                          </div>
                        </div>

                        {/* Add milestone inline */}
                        {addingTo === sp.id && (
                          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/30">
                            <Input
                              autoFocus
                              placeholder="New milestone name…"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              className="h-7 text-xs flex-1"
                              onKeyDown={(e) => e.key === "Enter" && handleAddSubmit(sp.id)}
                            />
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleAddSubmit(sp.id)}>
                              Add
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingTo(null)}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Sub-phase button */}
                  {addingSubPhaseTo === phaseNum ? (
                    <div className="px-3 py-2 border-b border-border/30 bg-muted/20 space-y-2">
                      <p className="text-xs font-semibold">Add Sub-phase to Phase {phaseNum}</p>
                      <Input
                        autoFocus
                        placeholder="Sub-phase name…"
                        value={newSubPhaseName}
                        onChange={(e) => setNewSubPhaseName(e.target.value)}
                        className="h-7 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Start Date</Label>
                          <DatePickerInput value={newSubPhaseStart} onChange={setNewSubPhaseStart} fixedWeeks />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">End Date</Label>
                          <DatePickerInput value={newSubPhaseEnd} onChange={setNewSubPhaseEnd} fixedWeeks />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleAddSubPhaseSubmit(phaseNum, phase_name)}>
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAddingSubPhaseTo(null); setNewSubPhaseName(""); setNewSubPhaseStart(undefined); setNewSubPhaseEnd(undefined); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-1 border-b border-border/30">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => setAddingSubPhaseTo(phaseNum)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Sub-phase
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
