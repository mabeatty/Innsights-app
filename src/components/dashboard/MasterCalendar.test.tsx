import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MasterCalendar, { NAME_COLUMN_WIDTH, type CalendarProject } from "./MasterCalendar";
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
// construction dates + openings only: the calendar ignores earlier phases
const allDates = [parseDay("2027-02-15"), parseDay("2028-01-31"), parseDay("2025-10-20"), parseDay("2027-02-05"), parseDay("2027-04-30"), parseDay("2027-06-30")];
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

  it("draws ONE bar per project, covering its Construction phase only (Keystone's 2025 pre-development is ignored)", () => {
    renderCal();
    const s = scaleFor();
    const ash = screen.getByTestId("bar-ashland");
    expect(px(ash, "left")).toBeCloseTo(s.x(parseDay("2025-10-20")), 0);
    expect(px(ash, "width")).toBeCloseTo(s.x(parseDay("2027-02-05")) - s.x(parseDay("2025-10-20")), 0);
    const key = screen.getAllByTestId(/^bar-keystone/);
    expect(key).toHaveLength(1);
    expect(px(key[0], "left")).toBeCloseTo(s.x(parseDay("2027-02-15")), 0);
    expect(px(key[0], "width")).toBeCloseTo(s.x(parseDay("2028-01-31")) - s.x(parseDay("2027-02-15")), 0);
  });

  it("shows brand and status under the name, with a Dev / PIP tag", () => {
    renderCal([
      { id: "dev", name: "D", _kind: "Dev", _brand: "Home2 Suites", _status: "Design", _phases: [] },
      { id: "pip", name: "P", _kind: "PIP", _brand: "Hampton Inn / Tapestry", _status: "On Hold", _phases: [] },
      { id: "plain", name: "Q", _kind: null, _brand: null, _status: "Design", _phases: [] },
      { id: "nostatus", name: "R", _kind: "Dev", _brand: "AC Hotel", _status: null, _phases: [] },
    ]);
    const row = (id: string) => within(screen.getByTestId(`row-${id}`));
    expect(row("dev").getByText("Dev")).toBeInTheDocument();
    expect(row("dev").getByText("Home2 Suites · Design")).toBeInTheDocument();
    expect(row("pip").getByText("PIP")).toBeInTheDocument();
    expect(row("pip").getByText("Hampton Inn / Tapestry · On Hold")).toBeInTheDocument(); // dual brand
    expect(row("plain").queryByText(/^(Dev|PIP)$/)).not.toBeInTheDocument();             // uncategorized: no tag
    expect(row("plain").getByText("Design")).toBeInTheDocument();                         // no brand: status alone
    expect(row("nostatus").getByText("AC Hotel")).toBeInTheDocument();                    // no status: brand alone
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
    expect(within(screen.getByTestId("row-carmel")).getByText("No construction dates yet")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-opener")).getByText("No construction dates yet")).toBeInTheDocument(); // opening only
    expect(screen.getByTestId("opening-opener")).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("2 of 4 projects have construction dates");
  });

  it("says so when no project has dates at all", () => {
    renderCal([{ id: "a", name: "A", _phases: [] }]);
    expect(screen.getByText(/No project has construction dates yet/)).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("0 of 1 projects");
  });

  it("gives a project with only pre-development / pre-construction dated no bar at all", () => {
    const pre = buildPhaseSegments([
      { project_id: "pre", phase_number: 2, start_date: "2026-01-01", end_date: "2026-06-30" },
      { project_id: "pre", phase_number: 3, start_date: "2026-07-01", end_date: "2026-12-31" },
    ]).get("pre")!;
    renderCal([{ id: "pre", name: "Pre", _phases: pre }]);
    expect(screen.queryByTestId("bar-pre")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("row-pre")).getByText("No construction dates yet")).toBeInTheDocument();
    expect(screen.getByTestId("coverage")).toHaveTextContent("0 of 1 projects");
  });

  it("draws a today line at today's position", () => {
    renderCal();
    expect(px(screen.getByTestId("today-line"), "left")).toBeCloseTo(NAME_COLUMN_WIDTH + scaleFor().x(TODAY), 0);
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
      expect(contentWidth()).toBeGreaterThan(400 + NAME_COLUMN_WIDTH);
    } finally {
      if (real) Object.defineProperty(HTMLElement.prototype, "clientWidth", real); else delete (HTMLElement.prototype as any).clientWidth;
    }
  });

  it("renders an empty state with no projects", () => {
    renderCal([]);
    expect(screen.getByText(/No projects to show/)).toBeInTheDocument();
  });
});

describe("show / hide menu", () => {
  const options = [
    { id: "a", name: "Alpha", status: "Design", visible: true },
    { id: "b", name: "Beta", status: "On Hold", visible: false },
  ];
  const open = () => fireEvent.click(screen.getByRole("button", { name: /Show \/ hide projects/ }));

  it("is absent when no visibility prop is given (e.g. view-only users)", () => {
    renderCal();
    expect(screen.queryByRole("button", { name: /Show \/ hide projects/ })).not.toBeInTheDocument();
  });

  it("lists every project, shown AND hidden, and reports a change when one is toggled", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><MasterCalendar projects={projects} today={TODAY} visibility={{ options, onChange }} /></MemoryRouter>);
    open();
    expect(screen.getByText("1 of 2 shown. Hidden projects stay on the Project Summary tab.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beta" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(onChange).toHaveBeenCalledWith("a", false);
  });

  it("'Show all' re-shows every hidden project", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><MasterCalendar projects={projects} today={TODAY} visibility={{ options, onChange }} /></MemoryRouter>);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b", true);
  });

  it("stays reachable when every project is hidden, so they can be brought back", () => {
    const onChange = vi.fn();
    render(<MemoryRouter><MasterCalendar projects={[]} today={TODAY} visibility={{ options: options.map((o) => ({ ...o, visible: false })), onChange }} /></MemoryRouter>);
    expect(screen.getByText("All projects are hidden from the calendar.")).toBeInTheDocument();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(onChange).toHaveBeenCalledWith("a", true);
  });
});
