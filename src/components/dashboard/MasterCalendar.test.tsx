import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MasterCalendar, { type CalendarProject } from "./MasterCalendar";
import { buildPhaseSegments, computeRange, makeScale, parseDay, ZOOM_PX_PER_MONTH } from "@/lib/masterCalendar";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const TODAY = parseDay("2026-10-05");

// Keystone's real schedule: four overlapping phases, still just one bar.
const keystonePhases = buildPhaseSegments([
  { project_id: "keystone", phase_number: 1, start_date: "2025-10-01", end_date: "2026-02-07" },
  { project_id: "keystone", phase_number: 2, start_date: "2026-02-01", end_date: "2026-12-31" },
  { project_id: "keystone", phase_number: 3, start_date: "2026-10-01", end_date: "2027-04-15" },
  { project_id: "keystone", phase_number: 4, start_date: "2027-02-15", end_date: "2028-01-31" },
]).get("keystone")!;
const ashlandPhases = buildPhaseSegments([
  { project_id: "ashland", phase_number: 4, start_date: "2025-10-20", end_date: "2027-02-05" },
]).get("ashland")!;

// Deliberately NOT in finish order.
const projects: CalendarProject[] = [
  { id: "keystone", name: "Keystone", _status: "Design", _phases: keystonePhases, _completionDate: null },        // finishes 2028-01-31
  { id: "carmel", name: "Carmel", _status: "Design", _phases: [], _completionDate: null },                         // no dates
  { id: "ashland", name: "Ashland", _status: "Under Construction", _phases: ashlandPhases, _completionDate: "2027-04-30" }, // finishes 2027-02-05
  { id: "opener", name: "Opener", _status: "Pre-Construction", _phases: [], _completionDate: "2027-06-30" },       // opening only
];

const renderCal = (p: CalendarProject[] = projects) => render(<MemoryRouter><MasterCalendar projects={p} today={TODAY} /></MemoryRouter>);
const order = () => screen.getAllByTestId(/^row-/).map((el) => el.getAttribute("data-testid")!.replace("row-", ""));

// Same scale the component derives, so expected positions aren't hard-coded.
const allDates = [...keystonePhases.flatMap((s) => [s.start, s.end]), parseDay("2025-10-20"), parseDay("2027-02-05"), parseDay("2027-04-30"), parseDay("2027-06-30")];
const scaleFor = (zoom: keyof typeof ZOOM_PX_PER_MONTH = "fit") => makeScale(computeRange(allDates, TODAY), ZOOM_PX_PER_MONTH[zoom]);
const px = (el: HTMLElement, prop: "left" | "width" | "top") => parseFloat(el.style[prop]);

describe("MasterCalendar", () => {
  it("is one flat list: no type or status sections", () => {
    renderCal();
    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument(); // the old "Design (2)" style headers
    expect(order()).toHaveLength(4);
  });

  it("sorts earliest finish first by default, with undated projects last", () => {
    renderCal();
    expect(screen.getByRole("radio", { name: "Earliest finish" })).toHaveAttribute("aria-checked", "true");
    // Ashland 2027-02 (bar end) → Opener 2027-06 (opening, no phases) → Keystone 2028-01 → Carmel (no dates)
    expect(order()).toEqual(["ashland", "opener", "keystone", "carmel"]);
  });

  it("flips to latest finish first, but undated projects still go last", () => {
    renderCal();
    fireEvent.click(screen.getByRole("radio", { name: "Latest finish" }));
    expect(order()).toEqual(["keystone", "opener", "ashland", "carmel"]);
  });

  it("links each project to its schedule and shows its status under the name", () => {
    renderCal();
    expect(screen.getByRole("link", { name: "Ashland" })).toHaveAttribute("href", "/project/ashland?tab=schedule");
    expect(within(screen.getByTestId("row-ashland")).getByText("Under Construction")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-opener")).getByText("Pre-Construction")).toBeInTheDocument();
  });

  it("draws ONE bar per project, from its earliest phase start to its latest phase end", () => {
    renderCal();
    const s = scaleFor();
    const ash = screen.getByTestId("bar-ashland");
    expect(px(ash, "left")).toBeCloseTo(s.x(parseDay("2025-10-20")), 0);
    expect(px(ash, "width")).toBeCloseTo(s.x(parseDay("2027-02-05")) - s.x(parseDay("2025-10-20")), 0);
    const key = screen.getAllByTestId(/^bar-keystone/);
    expect(key).toHaveLength(1);
    expect(px(key[0], "left")).toBeCloseTo(s.x(parseDay("2025-10-01")), 0);
    expect(px(key[0], "width")).toBeCloseTo(s.x(parseDay("2028-01-31")) - s.x(parseDay("2025-10-01")), 0);
  });

  it("keeps every project row the same height", () => {
    renderCal();
    const rowH = (id: string) => screen.getByTestId(`row-${id}`).style.height;
    expect(rowH("keystone")).toBe(rowH("ashland"));
    expect(rowH("keystone")).toBe(rowH("carmel"));
  });

  it("marks target opening with a diamond at its date", () => {
    renderCal();
    expect(px(screen.getByTestId("opening-ashland"), "left") + 6).toBeCloseTo(scaleFor().x(parseDay("2027-04-30")), 0);
    expect(screen.queryByTestId("opening-keystone")).not.toBeInTheDocument();
  });

  it("shows undated projects honestly instead of dropping them, and reports coverage", () => {
    renderCal();
    expect(within(screen.getByTestId("row-carmel")).getByText("No schedule dates yet")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-opener")).getByText("No phase dates yet")).toBeInTheDocument(); // opening only
    expect(screen.getByTestId("opening-opener")).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("2 of 4 projects have schedule dates");
  });

  it("says so when no project has dates at all", () => {
    renderCal([{ id: "a", name: "A", _phases: [] }]);
    expect(screen.getByText(/No project has schedule dates yet/)).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("0 of 1 projects");
  });

  it("draws a today line at today's position", () => {
    renderCal();
    expect(px(screen.getByTestId("today-line"), "left")).toBeCloseTo(220 + scaleFor().x(TODAY), 0);
  });

  it("zoom (Months / Quarters / Fit) changes the scale of the whole chart", () => {
    renderCal(); // defaults to Fit (unmeasured container in jsdom → the Fit floor)
    const width = () => px(screen.getByTestId("bar-ashland"), "width");
    const fit = width();
    fireEvent.click(screen.getByRole("radio", { name: "Quarters" }));
    const quarters = width();
    fireEvent.click(screen.getByRole("radio", { name: "Months" }));
    const months = width();
    expect(quarters).toBeGreaterThan(fit * 3);
    expect(months).toBeGreaterThan(quarters * 1.9);
    fireEvent.click(screen.getByRole("radio", { name: "Fit" }));
    expect(width()).toBe(fit);
  });

  it("stretches to fill a wide container instead of leaving dead space, but never shrinks below the zoom preset", () => {
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const contentWidth = () => parseFloat((screen.getByTestId("calendar-scroller").firstElementChild as HTMLElement).style.width);
    try {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 3000 });
      const { unmount } = renderCal();
      expect(Math.abs(contentWidth() - 3000)).toBeLessThanOrEqual(2);
      unmount();
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
      renderCal();
      fireEvent.click(screen.getByRole("radio", { name: "Quarters" }));
      expect(contentWidth()).toBeGreaterThan(400 + 220);
    } finally {
      if (real) Object.defineProperty(HTMLElement.prototype, "clientWidth", real); else delete (HTMLElement.prototype as any).clientWidth;
    }
  });

  it("renders an empty state with no projects", () => {
    renderCal([]);
    expect(screen.getByText(/No projects to show/)).toBeInTheDocument();
  });
});
