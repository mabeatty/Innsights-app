import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { toast } from "sonner";
import Dashboard from "./Dashboard";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

// Chainable query-builder fake: awaiting any chain yields the table's rows.
const tables: Record<string, any[]> = {
  projects: [
    { id: "ash", name: "Ashland", updated_at: "2026-09-01T00:00:00Z", project_type: "Development", brands: { name: "Home2 Suites" } },
    { id: "key", name: "Keystone", updated_at: "2026-09-02T00:00:00Z", project_type: "Development", brands: { name: "Hilton Garden Inn" }, secondary_brand: { name: "Tapestry" } },
    // a renovation (PIP) project
    { id: "pip", name: "Dayton", updated_at: "2026-09-04T00:00:00Z", project_type: "Asset Management", brands: { name: "SpringHill Suites" } },
    // completed: off the Dashboard and calendar, listed on the Completed tab
    { id: "done", name: "Old Hotel", updated_at: "2026-09-05T00:00:00Z", project_type: "Development", brands: { name: "Hampton Inn" }, secondary_brand: { name: "Tapestry" } },
    { id: "donep", name: "Renovated Inn", updated_at: "2026-09-06T00:00:00Z", project_type: "Asset Management", brands: { name: "Hilton Garden Inn" } },
    // switched off for the calendar: must still show on the summary
    { id: "hid", name: "Hidden Hotel", updated_at: "2026-09-03T00:00:00Z", project_type: "Development", brands: null, show_on_calendar: false },
  ],
  project_info: [
    { project_id: "ash", project_status: "Under Construction", project_type: "New Construction", target_opening_date: "2027-04-30" },
    { project_id: "key", project_status: "Design", project_type: "New Construction", target_opening_date: null },
    { project_id: "hid", project_status: "Design", project_type: "New Construction", target_opening_date: null },
    { project_id: "pip", project_status: "Under Construction", project_type: "Renovation", target_opening_date: null },
    { project_id: "done", project_status: "Completed", project_type: "New Construction", target_opening_date: "2025-06-15" },
    { project_id: "donep", project_status: "Completed", project_type: "Renovation", target_opening_date: null },
  ],
  schedule_phases: [
    { project_id: "ash", phase_number: 3, phase_name: "Pre-Construction", sub_phase_number: "3.1", start_date: "2025-07-01", end_date: "2026-03-31" },
    { project_id: "ash", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.1", start_date: "2025-10-20", end_date: "2027-02-05" },
    { project_id: "ash", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.2", start_date: null, end_date: null },
    { project_id: "done", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.1", start_date: "2024-03-01", end_date: "2025-06-15" },
    { project_id: "key", phase_number: 2, phase_name: "Pre-Development", sub_phase_number: "2.1", start_date: "2026-02-01", end_date: "2026-12-31" },
    // a non-4.1 row with a start date must NOT become the "Construction Start" column
    { project_id: "key", phase_number: 4, phase_name: "Construction", sub_phase_number: "4.3", start_date: "2027-02-15", end_date: "2028-01-31" },
  ],
  project_budget: [
    { project_id: "done", scheduled_value: 600000 }, { project_id: "done", scheduled_value: 400000 },
  ],
  budget_transactions: [
    { project_id: "done", amount: 250000.5, status: "Paid" },
    { project_id: "done", amount: 999, status: "Pending" }, // not counted: only approved / paid / deferred
  ],
};
const updates: { table: string; payload: any; col?: string; val?: any }[] = [];
let updateError: string | null = null;
function builder(table: string): any {
  const b: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej);
      if (prop === "update") {
        return (payload: any) => {
          const rec: { table: string; payload: any; col?: string; val?: any } = { table, payload };
          updates.push(rec);
          const chain: any = new Proxy({}, {
            get(_t2, p2) {
              if (p2 === "eq") return (col: string, val: any) => { rec.col = col; rec.val = val; return chain; };
              if (p2 === "then") return (res: any, rej: any) => Promise.resolve({ data: [], error: updateError ? { message: updateError } : null }).then(res, rej);
              return () => chain;
            },
          });
          return chain;
        };
      }
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
    expect(await screen.findByRole("link", { name: "Ashland — Home2 Suites" })).toHaveAttribute("href", "/project/ash");
    expect(screen.queryByTestId("calendar-scroller")).not.toBeInTheDocument();
  });

  it("keeps the Construction Start column fed by phase 4.1 only (the schedule query was widened to all phases)", async () => {
    renderDash();
    const ashRow = (await screen.findByRole("link", { name: "Ashland — Home2 Suites" })).closest("tr")!;
    expect(within(ashRow).getByText("Oct 2025")).toBeInTheDocument(); // 4.1 start
    const keyRow = screen.getByRole("link", { name: "Keystone — Hilton Garden Inn / Tapestry" }).closest("tr")!;
    expect(within(keyRow).queryByText("Feb 2027")).not.toBeInTheDocument(); // 4.3 must not leak in
  });

  it("switches to the Master Calendar and records it in the URL", async () => {
    renderDash();
    await screen.findByRole("link", { name: "Ashland — Home2 Suites" });
    clickTab(/Master Calendar/);
    expect(await screen.findByTestId("calendar-scroller")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?tab=calendar");
    // one bar per project that has dated phases
    expect(screen.getByTestId("bar-ash")).toBeInTheDocument();
    expect(screen.getByTestId("bar-key")).toBeInTheDocument();
    // Ashland has a target opening in the data, but the calendar no longer draws or lists it
    expect(screen.queryByTestId("opening-ash")).not.toBeInTheDocument();
    expect(screen.queryByText("Target opening")).not.toBeInTheDocument();
  });

  it("opens straight onto the calendar from a link, and back to the summary clears the param", async () => {
    renderDash("/dashboard?tab=calendar");
    expect(await screen.findByTestId("calendar-scroller")).toBeInTheDocument();
    clickTab(/Project Summary/);
    expect(await screen.findByRole("link", { name: "Ashland — Home2 Suites" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("");
    expect(screen.getByTestId("where").textContent).toBe("");
  });

  it("lists every project on the calendar in one flat list, regardless of the summary's collapsed sections", async () => {
    renderDash();
    await screen.findByRole("link", { name: "Keystone — Hilton Garden Inn / Tapestry" });
    fireEvent.click(screen.getByText("Design (2)")); // collapse a section on the summary tab
    expect(screen.queryByRole("link", { name: "Keystone — Hilton Garden Inn / Tapestry" })).not.toBeInTheDocument();
    clickTab(/Master Calendar/);
    await screen.findByTestId("calendar-scroller");
    expect(screen.getByTestId("row-key")).toBeInTheDocument(); // calendar has no sections to collapse
    expect(screen.getByTestId("row-ash")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-ash")).getByText("Home2 Suites · Under Construction")).toBeInTheDocument(); // brand + status shown inline
  });

  it("leaves projects switched off (show_on_calendar = false) off the calendar, but keeps them on the summary", async () => {
    renderDash();
    expect(await screen.findByRole("link", { name: "Hidden Hotel" })).toBeInTheDocument(); // summary
    clickTab(/Master Calendar/);
    await screen.findByTestId("calendar-scroller");
    expect(screen.queryByTestId("row-hid")).not.toBeInTheDocument();
    expect(screen.getByTestId("row-ash")).toBeInTheDocument();
    expect(screen.getByTestId("row-key")).toBeInTheDocument(); // flag absent (undefined) = shown
    expect(screen.getByTestId("coverage")).toHaveTextContent("2 of 3 projects have construction dates");
    clickTab(/Project Summary/);
    expect(await screen.findByRole("link", { name: "Hidden Hotel" })).toBeInTheDocument(); // still there
  });

  describe("show / hide projects menu", () => {
    const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /Show \/ hide projects/ }));
    beforeEach(() => { updates.length = 0; updateError = null; vi.clearAllMocks(); });

    it("hides a project from the calendar and saves it", async () => {
      renderDash("/dashboard?tab=calendar");
      await screen.findByTestId("row-key");
      openMenu();
      // the menu lists the already-hidden project too, so it can be brought back
      expect(screen.getByRole("checkbox", { name: "Hidden Hotel" })).not.toBeChecked();
      fireEvent.click(screen.getByRole("checkbox", { name: "Keystone" }));
      await waitFor(() => expect(screen.queryByTestId("row-key")).not.toBeInTheDocument());
      expect(updates).toContainEqual({ table: "projects", payload: { show_on_calendar: false }, col: "id", val: "key" });
    });

    it("brings a hidden project back onto the calendar", async () => {
      renderDash("/dashboard?tab=calendar");
      await screen.findByTestId("row-ash");
      expect(screen.queryByTestId("row-hid")).not.toBeInTheDocument();
      openMenu();
      fireEvent.click(screen.getByRole("checkbox", { name: "Hidden Hotel" }));
      expect(await screen.findByTestId("row-hid")).toBeInTheDocument();
      expect(updates).toContainEqual({ table: "projects", payload: { show_on_calendar: true }, col: "id", val: "hid" });
    });

    it("undoes the change and says so if saving fails", async () => {
      updateError = "permission denied";
      renderDash("/dashboard?tab=calendar");
      await screen.findByTestId("row-key");
      openMenu();
      fireEvent.click(screen.getByRole("checkbox", { name: "Keystone" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("permission denied")));
      expect(await screen.findByTestId("row-key")).toBeInTheDocument(); // reverted
    });

    it("isn't offered to view-only users", async () => {
      (AUTH as any).accessLevel = "view";
      try {
        renderDash("/dashboard?tab=calendar");
        await screen.findByTestId("row-ash");
        expect(screen.queryByRole("button", { name: /Show \/ hide projects/ })).not.toBeInTheDocument();
      } finally {
        (AUTH as any).accessLevel = "edit";
      }
    });
  });

  it("labels each calendar row with its brand and a Dev / PIP tag", async () => {
    renderDash("/dashboard?tab=calendar");
    const ash = await screen.findByTestId("row-ash");
    expect(within(ash).getByText("Dev")).toBeInTheDocument();
    expect(within(ash).getByText("Home2 Suites · Under Construction")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-key")).getByText("Hilton Garden Inn / Tapestry · Design")).toBeInTheDocument(); // dual brand
    const pip = screen.getByTestId("row-pip");
    expect(within(pip).getByText("PIP")).toBeInTheDocument(); // Asset Management = PIP
    expect(within(pip).getByText("SpringHill Suites · Under Construction")).toBeInTheDocument();
  });

  describe("Project column", () => {
    it("shows the city and the brand: dual brands both, no brand just the city", async () => {
      renderDash();
      await screen.findByRole("link", { name: "Ashland — Home2 Suites" });
      expect(screen.getByRole("link", { name: "Keystone — Hilton Garden Inn / Tapestry" })).toHaveAttribute("href", "/project/key");
      expect(screen.getByRole("link", { name: "Dayton — SpringHill Suites" })).toHaveAttribute("href", "/project/pip"); // Asset Management section too
      expect(screen.getByRole("link", { name: "Hidden Hotel" })).toBeInTheDocument();                                   // no brand on file
      expect(screen.queryByRole("link", { name: "Ashland" })).not.toBeInTheDocument();                                  // not the city alone any more
    });

    it("leaves the brand out when the project's name already says it", async () => {
      const saved = tables.projects;
      tables.projects = saved.map((p) => (p.id === "ash" ? { ...p, name: "Springfield Home2 Suites" } : p));
      try {
        renderDash();
        expect(await screen.findByRole("link", { name: "Springfield Home2 Suites" })).toBeInTheDocument(); // not "… — Home2 Suites"
      } finally { tables.projects = saved; }
    });
  });

  describe("Completed projects", () => {
    it("are off the summary and the calendar, and don't inflate the section counts", async () => {
      renderDash();
      await screen.findByRole("link", { name: "Ashland — Home2 Suites" });
      expect(screen.queryByRole("link", { name: "Old Hotel — Hampton Inn / Tapestry" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Renovated Inn — Hilton Garden Inn" })).not.toBeInTheDocument();
      expect(screen.getByText("Development (3)")).toBeInTheDocument();       // Ashland, Keystone, Hidden Hotel — not Old Hotel
      expect(screen.getByText("Asset Management (1)")).toBeInTheDocument(); // Dayton — not Renovated Inn
      clickTab(/Master Calendar/);
      await screen.findByTestId("calendar-scroller");
      expect(screen.queryByTestId("row-done")).not.toBeInTheDocument();
      expect(screen.queryByTestId("row-donep")).not.toBeInTheDocument();
      expect(screen.getByTestId("coverage")).toHaveTextContent("of 3 projects");
    });

    it("are listed on the Completed tab in the same table as the Dashboard: same columns, same cells", async () => {
      renderDash();
      await screen.findByRole("link", { name: "Ashland — Home2 Suites" });
      const summaryHeaders = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(summaryHeaders).toEqual(["Project", "Project Cost", "Completed to Date", "Construction Start", "Completion Date", "Last Updated"]);
      clickTab(/Completed/);
      const rows = await screen.findAllByTestId("completed-row");
      expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(summaryHeaders);
      expect(screen.getByText("Development (1)")).toBeInTheDocument();
      expect(screen.getByText("Asset Management (1)")).toBeInTheDocument();
      const cells = (r: HTMLElement) => within(r).getAllByRole("cell").map((c) => c.textContent);
      const [name, cost, done, start, completion, updated] = cells(rows[0]);
      expect([name, cost, done, start, completion]).toEqual(["Old Hotel — Hampton Inn / Tapestry", "$1,000,000", "$250,000.50", "Mar 2024", "Jun 2025"]);
      expect(updated).toMatch(/^Sep [56], 2026$/);
      expect(cells(rows[1]).slice(0, 5)).toEqual(["Renovated Inn — Hilton Garden Inn", "—", "—", "—", "—"]);
      expect(within(rows[0]).getByRole("link", { name: "Old Hotel — Hampton Inn / Tapestry" })).toHaveAttribute("href", "/project/done");
      expect(screen.getByTestId("where")).toHaveTextContent("?tab=completed");
    });

    it("a section on the Completed tab collapses like the Dashboard's", async () => {
      renderDash("/dashboard?tab=completed");
      expect(await screen.findAllByTestId("completed-row")).toHaveLength(2);
      fireEvent.click(screen.getByText("Development (1)"));
      expect(screen.queryByRole("link", { name: "Old Hotel — Hampton Inn / Tapestry" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Renovated Inn — Hilton Garden Inn" })).toBeInTheDocument();
      fireEvent.click(screen.getByText("Development (1)"));
      expect(screen.getByRole("link", { name: "Old Hotel — Hampton Inn / Tapestry" })).toBeInTheDocument();
    });

    it("the tab itself carries no count", async () => {
      renderDash();
      expect(await screen.findByRole("tab", { name: "Completed" })).toBeInTheDocument(); // not "Completed (2)"
    });

    it("open straight onto the Completed tab from a link", async () => {
      renderDash("/dashboard?tab=completed");
      expect(await screen.findAllByTestId("completed-row")).toHaveLength(2);
      expect(screen.getByRole("tab", { name: /Completed/ })).toHaveAttribute("data-state", "active");
    });

    it("the tab says so, and has no count, when nothing is completed", async () => {
      const saved = tables.project_info;
      tables.project_info = saved.filter((i) => i.project_status !== "Completed");
      try {
        renderDash("/dashboard?tab=completed");
        expect(await screen.findByTestId("completed-empty")).toHaveTextContent("No completed projects yet.");
        expect(screen.getByRole("tab", { name: "Completed" })).toBeInTheDocument();
      } finally { tables.project_info = saved; }
    });

    it("a section whose projects are all completed leaves no empty header behind", async () => {
      const saved = tables.project_info;
      tables.project_info = saved.map((i) => (i.project_id === "pip" ? { ...i, project_status: "Completed" } : i)); // Dayton completes too
      try {
        renderDash();
        await screen.findByRole("link", { name: "Ashland — Home2 Suites" });
        expect(screen.queryByText(/Asset Management/)).not.toBeInTheDocument();
      } finally { tables.project_info = saved; }
    });
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
