import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Dashboard from "./Dashboard";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

// Chainable query-builder fake: awaiting any chain yields the table's rows.
const tables: Record<string, any[]> = {
  projects: [
    { id: "ash", name: "Ashland", updated_at: "2026-09-01T00:00:00Z", project_type: "Development", brands: null },
    { id: "key", name: "Keystone", updated_at: "2026-09-02T00:00:00Z", project_type: "Development", brands: null },
  ],
  project_info: [
    { project_id: "ash", project_status: "Under Construction", project_type: "New Construction", target_opening_date: "2027-04-30" },
    { project_id: "key", project_status: "Design", project_type: "New Construction", target_opening_date: null },
  ],
  schedule_phases: [
    { project_id: "ash", phase_number: 3, phase_name: "Pre-Construction", sub_phase_number: "3.1", start_date: "2025-07-01", end_date: "2026-03-31" },
    { project_id: "ash", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.1", start_date: "2025-10-20", end_date: "2027-02-05" },
    { project_id: "ash", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.2", start_date: null, end_date: null },
    { project_id: "key", phase_number: 2, phase_name: "Pre-Development", sub_phase_number: "2.1", start_date: "2026-02-01", end_date: "2026-12-31" },
    // a non-4.1 row with a start date must NOT become the "Construction Start" column
    { project_id: "key", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.3", start_date: "2027-02-15", end_date: "2028-01-31" },
  ],
  project_budget: [],
  budget_transactions: [],
};
function builder(table: string): any {
  const b: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej);
      return () => b;
    },
  });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
// Stable reference, like the real context: the Dashboard's load effect depends on
// consultantProjectIds, so a fresh [] per call would re-fetch on every render.
const AUTH = vi.hoisted(() => ({ isConsultant: false, consultantProjectIds: [] as string[], accessLevel: "edit" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("@/hooks/useAlerts", () => ({ useAlerts: () => ({ getProjectsWithAlerts: () => new Set<string>() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const Where = () => <span data-testid="where">{useLocation().search}</span>;
const renderDash = (initial = "/dashboard") =>
  render(<MemoryRouter initialEntries={[initial]}><Dashboard /><Where /></MemoryRouter>);

// Radix tabs activate on mouse-down.
const clickTab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("Dashboard tabs", () => {
  it("offers Project Summary and Master Calendar, opening on the summary", async () => {
    renderDash();
    expect(screen.getByRole("tab", { name: /Project Summary/ })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: /Master Calendar/ })).toHaveAttribute("data-state", "inactive");
    expect(await screen.findByRole("link", { name: "Ashland" })).toHaveAttribute("href", "/project/ash");
    expect(screen.queryByTestId("calendar-scroller")).not.toBeInTheDocument();
  });

  it("keeps the Construction Start column fed by phase 4.1 only (the schedule query was widened to all phases)", async () => {
    renderDash();
    const ashRow = (await screen.findByRole("link", { name: "Ashland" })).closest("tr")!;
    expect(within(ashRow).getByText("Oct 2025")).toBeInTheDocument(); // 4.1 start
    const keyRow = screen.getByRole("link", { name: "Keystone" }).closest("tr")!;
    expect(within(keyRow).queryByText("Feb 2027")).not.toBeInTheDocument(); // 4.3 must not leak in
  });

  it("switches to the Master Calendar and records it in the URL", async () => {
    renderDash();
    await screen.findByRole("link", { name: "Ashland" });
    clickTab(/Master Calendar/);
    expect(await screen.findByTestId("calendar-scroller")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?tab=calendar");
    // one bar per project that has dated phases
    expect(screen.getByTestId("bar-ash")).toBeInTheDocument();
    expect(screen.getByTestId("bar-key")).toBeInTheDocument();
    expect(screen.getByTestId("opening-ash")).toBeInTheDocument();
  });

  it("opens straight onto the calendar from a link, and back to the summary clears the param", async () => {
    renderDash("/dashboard?tab=calendar");
    expect(await screen.findByTestId("calendar-scroller")).toBeInTheDocument();
    clickTab(/Project Summary/);
    expect(await screen.findByRole("link", { name: "Ashland" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("");
    expect(screen.getByTestId("where").textContent).toBe("");
  });

  it("lists every project on the calendar in one flat list, regardless of the summary's collapsed sections", async () => {
    renderDash();
    await screen.findByRole("link", { name: "Keystone" });
    fireEvent.click(screen.getByText("Design (1)")); // collapse a section on the summary tab
    expect(screen.queryByRole("link", { name: "Keystone" })).not.toBeInTheDocument();
    clickTab(/Master Calendar/);
    await screen.findByTestId("calendar-scroller");
    expect(screen.getByTestId("row-key")).toBeInTheDocument(); // calendar has no sections to collapse
    expect(screen.getByTestId("row-ash")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-ash")).getByText("Under Construction")).toBeInTheDocument(); // status shown inline
  });

  it("shows the same empty state on both tabs when there are no projects", async () => {
    const saved = tables.projects;
    tables.projects = [];
    try {
      renderDash("/dashboard?tab=calendar");
      await waitFor(() => expect(screen.getByText("No projects yet.")).toBeInTheDocument());
    } finally {
      tables.projects = saved;
    }
  });
});
