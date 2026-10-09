// Pure logic behind the dashboard's Master Calendar (portfolio Gantt). Kept free
// of React so the date math and layout rules can be unit-tested directly.

import { addMonths, differenceInDays, endOfMonth, startOfMonth } from "date-fns";

export const PHASE_NAMES: Record<number, string> = {
  1: "Land Acquisition",
  2: "Pre-Development",
  3: "Pre-Construction",
  4: "Construction",
};

export interface PhaseRow {
  project_id: string;
  phase_number: number;
  phase_name?: string | null;
  start_date: string | null; // yyyy-MM-dd
  end_date: string | null;
}

export interface PhaseSegment {
  phase: number;
  name: string;
  start: Date;
  end: Date;
  // false when only one end of the range was ever entered; the bar is drawn as a
  // short marker at the known date and the tooltip says what's missing.
  hasStart: boolean;
  hasEnd: boolean;
}

// Local-midnight date from a yyyy-MM-dd string (avoids the UTC-shift you get
// from new Date("2026-03-01") in US timezones).
export const parseDay = (s: string): Date => new Date(`${s}T00:00:00`);

// One segment per project per phase: the envelope (earliest start → latest end)
// across that phase's sub-phases. Sub-phases with no dates at all are ignored.
export function buildPhaseSegments(rows: PhaseRow[]): Map<string, PhaseSegment[]> {
  const acc = new Map<string, Map<number, { name: string; starts: Date[]; ends: Date[] }>>();
  for (const r of rows) {
    if (!r.start_date && !r.end_date) continue;
    let byPhase = acc.get(r.project_id);
    if (!byPhase) { byPhase = new Map(); acc.set(r.project_id, byPhase); }
    let g = byPhase.get(r.phase_number);
    if (!g) {
      g = { name: PHASE_NAMES[r.phase_number] ?? r.phase_name ?? `Phase ${r.phase_number}`, starts: [], ends: [] };
      byPhase.set(r.phase_number, g);
    }
    if (r.start_date) g.starts.push(parseDay(r.start_date));
    if (r.end_date) g.ends.push(parseDay(r.end_date));
  }

  const out = new Map<string, PhaseSegment[]>();
  for (const [projectId, byPhase] of acc) {
    const segs: PhaseSegment[] = [];
    for (const [phase, g] of byPhase) {
      const hasStart = g.starts.length > 0;
      const hasEnd = g.ends.length > 0;
      let start = hasStart ? new Date(Math.min(...g.starts.map((d) => d.getTime()))) : new Date(Math.max(...g.ends.map((d) => d.getTime())));
      let end = hasEnd ? new Date(Math.max(...g.ends.map((d) => d.getTime()))) : start;
      if (end < start) [start, end] = [end, start]; // tolerate a start/end entered backwards
      segs.push({ phase, name: g.name, start, end, hasStart, hasEnd });
    }
    segs.sort((a, b) => a.phase - b.phase);
    out.set(projectId, segs);
  }
  return out;
}

// The calendar shows the Construction phase only — pre-development and
// pre-construction effort is deliberately left off the timeline.
export const CONSTRUCTION_PHASE = 4;
export const constructionSegments = (segments: PhaseSegment[]): PhaseSegment[] =>
  segments.filter((g) => g.phase === CONSTRUCTION_PHASE);

// One bar per project: the Construction phase's earliest start → latest end.
// `partial` is true when that phase has no complete start+end, so the bar is only
// a rough marker and is drawn faded. Null when the project has no construction
// dates (a project with only earlier phases dated gets no bar).
export function projectSpan(segments: PhaseSegment[]): { start: Date; end: Date; partial: boolean } | null {
  const c = constructionSegments(segments);
  if (c.length === 0) return null;
  return {
    start: new Date(Math.min(...c.map((g) => g.start.getTime()))),
    end: new Date(Math.max(...c.map((g) => g.end.getTime()))),
    partial: !c.some((g) => g.hasStart && g.hasEnd),
  };
}

export type FinishSort = "earliest" | "latest";

// When a project finishes: the end of its bar, or its target opening if it has no
// phase dates. Null when it has neither.
export function projectFinish(segments: PhaseSegment[], opening: Date | null): Date | null {
  return projectSpan(segments)?.end ?? opening;
}

// Sort by finish date. Projects with no finish date always go last (in either
// direction), alphabetically; ties break on name so the order is stable.
export function sortByFinish<T extends { name: string }>(items: T[], dir: FinishSort, finishOf: (item: T) => Date | null): T[] {
  const keyed = items.map((item) => ({ item, finish: finishOf(item) }));
  keyed.sort((a, b) => {
    if (a.finish && b.finish) {
      const diff = a.finish.getTime() - b.finish.getTime();
      if (diff !== 0) return dir === "earliest" ? diff : -diff;
    } else if (a.finish || b.finish) {
      return a.finish ? -1 : 1;
    }
    return a.item.name.localeCompare(b.item.name);
  });
  return keyed.map((k) => k.item);
}

// Visible range: every date on the chart plus today, padded so bars aren't flush
// against the edges, and never narrower than a year.
export function computeRange(dates: Date[], today: Date): { start: Date; end: Date } {
  const all = [...dates, today];
  const min = new Date(Math.min(...all.map((d) => d.getTime())));
  const max = new Date(Math.max(...all.map((d) => d.getTime())));
  let start = addMonths(startOfMonth(min), -1);
  let end = addMonths(endOfMonth(max), 2);
  if (differenceInDays(end, start) < 365) end = addMonths(start, 12);
  return { start, end };
}

export const DAYS_PER_MONTH = 30.4375;

// Preset minimums. The chart is never narrower than its container (see
// resolvePxPerMonth), so "fit" is just a small floor that lets the whole
// timeline compress into view.
export const ZOOM_PX_PER_MONTH = { months: 64, quarters: 32, fit: 8 } as const;
export type Zoom = keyof typeof ZOOM_PX_PER_MONTH;

// Pixels per month for a zoom preset: the preset, or more if needed so the
// timeline fills the container (no dead space to the right of the last month).
// With an unmeasured container (0) it's just the preset.
export function resolvePxPerMonth(preset: number, range: { start: Date; end: Date }, containerWidth: number, labelWidth: number): number {
  const months = differenceInDays(range.end, range.start) / DAYS_PER_MONTH;
  const fill = months > 0 ? (containerWidth - labelWidth) / months : 0;
  return Math.max(preset, fill);
}

export interface Scale {
  x: (d: Date) => number;
  width: number;
  pxPerMonth: number;
}

export function makeScale(range: { start: Date; end: Date }, pxPerMonth: number): Scale {
  const pxPerDay = pxPerMonth / DAYS_PER_MONTH;
  return {
    x: (d) => differenceInDays(d, range.start) * pxPerDay,
    width: Math.ceil(differenceInDays(range.end, range.start) * pxPerDay),
    pxPerMonth,
  };
}

export interface Tick { date: Date; label: string; major: boolean }

// Header ticks: months when there's room for a label, otherwise quarters.
// `major` marks January (a year boundary) so it gets a stronger gridline.
export function buildTicks(range: { start: Date; end: Date }, pxPerMonth: number): Tick[] {
  const step = pxPerMonth >= 28 ? 1 : 3;
  const ticks: Tick[] = [];
  let cursor = startOfMonth(range.start);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  while (cursor <= range.end) {
    const m = cursor.getMonth();
    if (step === 1 || m % 3 === 0) {
      ticks.push({ date: cursor, label: step === 1 ? MONTHS[m] : `Q${m / 3 + 1}`, major: m === 0 });
    }
    cursor = addMonths(cursor, 1);
  }
  return ticks;
}

// Year bands for the top header row, clipped to the visible range.
export function buildYears(range: { start: Date; end: Date }): { year: number; start: Date; end: Date }[] {
  const out: { year: number; start: Date; end: Date }[] = [];
  for (let y = range.start.getFullYear(); y <= range.end.getFullYear(); y++) {
    const start = new Date(Math.max(range.start.getTime(), new Date(y, 0, 1).getTime()));
    const end = new Date(Math.min(range.end.getTime(), new Date(y + 1, 0, 1).getTime()));
    if (end > start) out.push({ year: y, start, end });
  }
  return out;
}
