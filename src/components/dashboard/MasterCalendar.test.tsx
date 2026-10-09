import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MasterCalendar, { type CalendarTypeGroup } from "./MasterCalendar";
import { buildPhaseSegments, computeRange, makeScale, parseDay, ZOOM_PX_PER_MONTH } from "@/lib/masterCalendar";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const TODAY = parseDay("2026-10-05");

// Keystone's real schedule: phases overlap, so two lanes are needed.
const keystonePhases = buildPhaseSegments([
  { project_id: "keystone", phase_number: 1, start_date: "2025-10-01", end_date: "2026-02-07" },
  { project_id: "keystone", phase_number: 2, start_date: "2026-02-01", end_date: "2026-12-31" },
  { project_id: "keystone", phase_number: 3, start_date: "2026-10-01", end_date: "2027-04-15" },
  { project_id: "keystone", phase_number: 4, start_date: "2027-02-15", end_date: "2028-01-31" },
]).get("keystone")!;

const groups: CalendarTypeGroup[] = [
  {
    label: "Development",
    total: 3,
    statusGroups: [
      { status: "Under Construction", items: [{ id: "ashland", name: "Ashland", _phases: buildPhaseSegments([
        { project_id: "ashland", phase_number: 4, start_date: "2025-10-20", end_date: "2027-02-05" },
      ]).get("ashland")!, _completionDate: "2027-04-30" }] },
      { status: "Design", items: [
        { id: "keystone", name: "Keystone", _phases: keystonePhases, _completionDate: null },
        { id: "carmel", name: "Carmel", _phases: [], _completionDate: null },
      ] },
    ],
  },
];

function renderCal(extra: Partial<React.ComponentProps<typeof MasterCalendar>> = {}) {
  const props = {
    typeGroups: groups, collapsedTypes: new Set<string>(), collapsedStatuses: new Set<string>(),
    onToggleType: vi.fn(), onToggleStatus: vi.fn(), today: TODAY, ...extra,
  };
  render(<MemoryRouter><MasterCalendar {...props} /></MemoryRouter>);
  return props;
}

// Same scale the component derives, so expected positions aren't hard-coded.
const allDates = [
  ...keystonePhases.flatMap((s) => [s.start, s.end]),
  parseDay("2025-10-20"), parseDay("2027-02-05"), parseDay("2027-04-30"),
];
const scaleFor = (zoom: keyof typeof ZOOM_PX_PER_MONTH = "fit") =>
  makeScale(computeRange(allDates, TODAY), ZOOM_PX_PER_MONTH[zoom]);
const px = (el: HTMLElement, prop: "left" | "width" | "top") => parseFloat(el.style[prop]);

describe("MasterCalendar", () => {
  it("lists every project, grouped like the dashboard, with links to each project's schedule", () => {
    renderCal();
    expect(screen.getByText("Development (3)")).toBeInTheDocument();
    expect(screen.getByText("Under Construction (1)")).toBeInTheDocument();
    expect(screen.getByText("Design (2)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ashland" })).toHaveAttribute("href", "/project/ashland?tab=schedule");
    expect(screen.getByRole("link", { name: "Carmel" })).toHaveAttribute("href", "/project/carmel?tab=schedule");
  });

  it("draws each phase at its date position, with the phase's color", () => {
    renderCal();
    const s = scaleFor();
    const bar = screen.getByTestId("bar-ashland-4");
    expect(px(bar, "left")).toBeCloseTo(s.x(parseDay("2025-10-20")), 0);
    expect(px(bar, "width")).toBeCloseTo(s.x(parseDay("2027-02-05")) - s.x(parseDay("2025-10-20")), 0);
    expect(bar).toHaveStyle({ backgroundColor: "#16A34A" }); // Construction = green, same as the per-project Gantt
  });

  it("stacks overlapping phases into separate lanes and grows the row to fit", () => {
    renderCal();
    const lane = (phase: number) => px(screen.getByTestId(`bar-keystone-${phase}`), "top");
    expect(lane(1)).toBe(lane(3));           // phases 1 and 3 share a lane
    expect(lane(2)).toBe(lane(4));           // phases 2 and 4 share the other
    expect(lane(2)).toBeGreaterThan(lane(1));
    const rowH = (id: string) => parseFloat(screen.getByTestId(`row-${id}`).style.height);
    expect(rowH("keystone")).toBeGreaterThan(rowH("ashland"));
  });

  it("marks target opening with a diamond at its date", () => {
    renderCal();
    const diamond = screen.getByTestId("opening-ashland");
    expect(px(diamond, "left") + 6).toBeCloseTo(scaleFor().x(parseDay("2027-04-30")), 0);
    expect(screen.queryByTestId("opening-keystone")).not.toBeInTheDocument();
  });

  it("shows projects with no dates honestly instead of dropping them, and reports coverage", () => {
    renderCal();
    const carmelRow = screen.getByTestId("row-carmel");
    expect(within(carmelRow).getByText("No schedule dates yet")).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("2 of 3 projects have schedule dates");
  });

  it("says so when no project has dates at all", () => {
    renderCal({ typeGroups: [{ label: "Development", total: 1, statusGroups: [{ status: "Design", items: [{ id: "a", name: "A", _phases: [] }] }] }] });
    expect(screen.getByText(/No project has schedule dates yet/)).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("0 of 1 projects");
  });

  it("labels an opening-only project 'No phase dates yet'", () => {
    renderCal({ typeGroups: [{ label: "Development", total: 1, statusGroups: [{ status: "Design", items: [{ id: "a", name: "A", _phases: [], _completionDate: "2027-06-30" }] }] }] });
    expect(screen.getByText("No phase dates yet")).toBeInTheDocument();
    expect(screen.getByTestId("opening-a")).toBeInTheDocument();
  });

  it("draws a today line at today's position", () => {
    renderCal();
    expect(px(screen.getByTestId("today-line"), "left")).toBeCloseTo(220 + scaleFor().x(TODAY), 0);
  });

  it("zoom (Months / Quarters / Fit) changes the scale of the whole chart", () => {
    renderCal(); // defaults to Fit (unmeasured container in jsdom → the Fit floor)
    const width = () => px(screen.getByTestId("bar-ashland-4"), "width");
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
      const { unmount } = render(<MemoryRouter><MasterCalendar typeGroups={groups} collapsedTypes={new Set()} collapsedStatuses={new Set()} onToggleType={vi.fn()} onToggleStatus={vi.fn()} today={TODAY} /></MemoryRouter>);
      expect(Math.abs(contentWidth() - 3000)).toBeLessThanOrEqual(2); // fills the container exactly
      unmount();
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
      render(<MemoryRouter><MasterCalendar typeGroups={groups} collapsedTypes={new Set()} collapsedStatuses={new Set()} onToggleType={vi.fn()} onToggleStatus={vi.fn()} today={TODAY} /></MemoryRouter>);
      fireEvent.click(screen.getByRole("radio", { name: "Quarters" }));
      expect(contentWidth()).toBeGreaterThan(400 + 220); // the zoom preset wins when the container is narrower (it scrolls)
    } finally {
      if (real) Object.defineProperty(HTMLElement.prototype, "clientWidth", real); else delete (HTMLElement.prototype as any).clientWidth;
    }
  });

  it("collapse toggles are driven by the dashboard's shared state", () => {
    const props = renderCal();
    fireEvent.click(screen.getByText("Design (2)"));
    expect(props.onToggleStatus).toHaveBeenCalledWith("Development-Design");
    fireEvent.click(screen.getByText("Development (3)"));
    expect(props.onToggleType).toHaveBeenCalledWith("Development");
  });

  it("hides rows for collapsed groups", () => {
    renderCal({ collapsedStatuses: new Set(["Development-Design"]) });
    expect(screen.queryByTestId("row-keystone")).not.toBeInTheDocument();
    expect(screen.getByTestId("row-ashland")).toBeInTheDocument();
  });

  it("renders an empty state with no projects", () => {
    renderCal({ typeGroups: [] });
    expect(screen.getByText(/No projects to show/)).toBeInTheDocument();
  });
});
