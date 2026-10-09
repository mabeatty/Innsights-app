import { describe, it, expect } from "vitest";
import {
  buildPhaseSegments, buildTicks, buildYears, computeRange, makeScale, parseDay, projectFinish, projectSpan, resolvePxPerMonth, sortByFinish,
  type PhaseRow,
} from "./masterCalendar";

const d = parseDay;
const row = (project_id: string, phase_number: number, start: string | null, end: string | null, name = "x"): PhaseRow =>
  ({ project_id, phase_number, phase_name: name, start_date: start, end_date: end });

describe("buildPhaseSegments", () => {
  it("takes the envelope (earliest start → latest end) across a phase's sub-phases", () => {
    const segs = buildPhaseSegments([
      row("p", 4, "2025-12-15", "2026-06-01"),
      row("p", 4, "2026-02-01", "2028-03-15"),
      row("p", 4, null, null), // undated sub-phase is ignored
    ]).get("p")!;
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toEqual(d("2025-12-15"));
    expect(segs[0].end).toEqual(d("2028-03-15"));
    expect(segs[0].hasStart && segs[0].hasEnd).toBe(true);
  });

  it("uses canonical phase names and sorts by phase number", () => {
    const segs = buildPhaseSegments([row("p", 4, "2027-02-15", "2028-01-31", "whatever"), row("p", 2, "2026-02-01", "2026-12-31")]).get("p")!;
    expect(segs.map((s) => s.phase)).toEqual([2, 4]);
    expect(segs.map((s) => s.name)).toEqual(["Pre-Development", "Construction"]);
  });

  it("keeps projects separate and omits projects with no dates at all", () => {
    const out = buildPhaseSegments([row("a", 3, "2025-07-01", "2026-03-31"), row("b", 3, null, null)]);
    expect([...out.keys()]).toEqual(["a"]);
  });

  it("flags a phase with only one end of its range", () => {
    const [startOnly] = buildPhaseSegments([row("p", 3, "2026-01-01", null)]).get("p")!;
    expect(startOnly).toMatchObject({ hasStart: true, hasEnd: false });
    expect(startOnly.end).toEqual(startOnly.start);
    const [endOnly] = buildPhaseSegments([row("p", 3, null, "2026-05-01")]).get("p")!;
    expect(endOnly).toMatchObject({ hasStart: false, hasEnd: true });
    expect(endOnly.start).toEqual(endOnly.end);
  });

  it("tolerates a start/end entered backwards instead of drawing a negative bar", () => {
    const [seg] = buildPhaseSegments([row("p", 4, "2027-01-01", "2026-01-01")]).get("p")!;
    expect(seg.start).toEqual(d("2026-01-01"));
    expect(seg.end).toEqual(d("2027-01-01"));
  });
});

describe("projectSpan", () => {
  const segs = buildPhaseSegments([
    row("p", 1, "2025-10-01", "2026-02-07"), row("p", 2, "2026-02-01", "2026-12-31"),
    row("p", 3, "2026-10-01", "2027-04-15"), row("p", 4, "2027-02-15", "2028-01-31"),
  ]).get("p")!;
  it("spans the Construction phase only — earlier phases are ignored (Keystone's real schedule)", () => {
    const span = projectSpan(segs)!;
    expect(span.start).toEqual(d("2027-02-15")); // not the 2025 pre-development start
    expect(span.end).toEqual(d("2028-01-31"));
    expect(span.partial).toBe(false);
  });
  it("is null with no dated phases, or with only pre-development / pre-construction dated", () => {
    expect(projectSpan([])).toBeNull();
    const earlierOnly = buildPhaseSegments([row("p", 2, "2026-01-01", "2026-06-30"), row("p", 3, "2026-07-01", "2026-12-31")]).get("p")!;
    expect(projectSpan(earlierOnly)).toBeNull();
  });
  it("is flagged partial only when no phase has both a start and an end", () => {
    const onlyStarts = buildPhaseSegments([row("p", 3, "2026-01-01", null), row("p", 4, "2026-06-01", null)]).get("p")!;
    expect(projectSpan(onlyStarts)!.partial).toBe(true);
    const mixed = buildPhaseSegments([row("p", 3, "2026-01-01", null), row("p", 4, "2026-06-01", "2027-01-01")]).get("p")!;
    expect(projectSpan(mixed)!.partial).toBe(false);
  });
});

describe("computeRange", () => {
  it("pads a month before and two after, snapped to month boundaries", () => {
    const { start, end } = computeRange([d("2025-06-10"), d("2028-03-15")], d("2026-10-05"));
    expect(start).toEqual(d("2025-05-01"));
    expect(end.getFullYear()).toBe(2028);
    expect(end.getMonth()).toBe(4); // May 2028 (Mar + 2 months, end of month)
  });

  it("includes today even when every project date is in the past", () => {
    const { start, end } = computeRange([d("2024-01-10")], d("2026-10-05"));
    expect(start <= d("2024-01-10")).toBe(true);
    expect(end >= d("2026-10-05")).toBe(true);
  });

  it("is never narrower than a year (e.g. no dates at all)", () => {
    const { start, end } = computeRange([], d("2026-10-05"));
    expect((end.getTime() - start.getTime()) / 86400000).toBeGreaterThanOrEqual(365);
  });
});

describe("makeScale", () => {
  const range = { start: d("2025-01-01"), end: d("2026-12-31") };
  it("maps dates left-to-right monotonically, with ~pxPerMonth per month", () => {
    const s = makeScale(range, 32);
    expect(s.x(range.start)).toBe(0);
    expect(s.x(d("2025-06-01"))).toBeGreaterThan(s.x(d("2025-05-01")));
    const month = s.x(d("2025-04-01")) - s.x(d("2025-03-01"));
    expect(month).toBeGreaterThan(30);
    expect(month).toBeLessThan(34);
  });
  it("is wider when zoomed in", () => {
    expect(makeScale(range, 64).width).toBeGreaterThan(makeScale(range, 14).width * 4);
  });
});

describe("buildTicks / buildYears", () => {
  const range = { start: d("2025-11-01"), end: d("2026-12-31") };
  it("labels every month when there's room, marking January as a year boundary", () => {
    const ticks = buildTicks(range, 64);
    expect(ticks[0].label).toBe("Nov");
    expect(ticks.filter((t) => t.major).map((t) => t.date.getFullYear())).toEqual([2026]); // the one January in range
    expect(ticks).toHaveLength(14);
  });
  it("falls back to quarters when zoomed out", () => {
    const labels = buildTicks(range, 14).map((t) => t.label);
    expect(labels).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(labels).not.toContain("Jan");
    expect(labels.every((l) => /^Q[1-4]$/.test(l))).toBe(true);
  });
  it("clips year bands to the visible range", () => {
    const years = buildYears(range);
    expect(years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(years[0].start).toEqual(range.start);
    expect(years[1].end).toEqual(range.end);
  });
});

describe("resolvePxPerMonth", () => {
  const range = { start: d("2025-01-01"), end: d("2025-12-31") }; // ~12 months
  it("uses the preset when the container is unmeasured (0)", () => {
    expect(resolvePxPerMonth(32, range, 0, 220)).toBe(32);
  });
  it("grows past the preset so the timeline fills a wide container", () => {
    const px = resolvePxPerMonth(32, range, 1220, 220); // 1000px for ~12 months
    expect(px).toBeGreaterThan(80);
    expect(makeScale(range, px).width).toBeGreaterThanOrEqual(999);
  });
  it("never shrinks below the preset in a narrow container (it scrolls instead)", () => {
    expect(resolvePxPerMonth(64, range, 500, 220)).toBe(64);
  });
});

describe("projectFinish / sortByFinish", () => {
  const segs = (end: string) => buildPhaseSegments([row("p", 4, "2026-01-01", end)]).get("p")!;
  const proj = (name: string, finish: string | null) => ({ name, finish: finish ? d(finish) : null });
  const names = (xs: { name: string }[]) => xs.map((x) => x.name);
  const items = [proj("Late", "2028-03-15"), proj("None B", null), proj("Early", "2027-02-05"), proj("Mid", "2027-07-31"), proj("None A", null)];

  it("finishes at the end of the bar, falling back to target opening, else null", () => {
    expect(projectFinish(segs("2027-07-31"), d("2027-04-30"))).toEqual(d("2027-07-31")); // bar wins over opening
    expect(projectFinish([], d("2027-04-30"))).toEqual(d("2027-04-30"));
    expect(projectFinish([], null)).toBeNull();
  });
  it("earliest first, with undated projects last", () => {
    expect(names(sortByFinish(items, "earliest", (i) => i.finish))).toEqual(["Early", "Mid", "Late", "None A", "None B"]);
  });
  it("latest first, but undated projects STILL last", () => {
    expect(names(sortByFinish(items, "latest", (i) => i.finish))).toEqual(["Late", "Mid", "Early", "None A", "None B"]);
  });
  it("breaks ties on name and doesn't mutate its input", () => {
    const tied = [proj("B", "2027-01-01"), proj("A", "2027-01-01")];
    const copy = [...tied];
    expect(names(sortByFinish(tied, "earliest", (i) => i.finish))).toEqual(["A", "B"]);
    expect(names(sortByFinish(tied, "latest", (i) => i.finish))).toEqual(["A", "B"]);
    expect(tied).toEqual(copy);
  });
});
