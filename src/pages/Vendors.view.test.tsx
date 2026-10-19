import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { featureFlags } from "@/lib/featureFlags";
import Vendors from "./Vendors";

beforeAll(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

function builder(): any {
  const b: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
      return () => b;
    },
  });
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => builder() } }));
const AUTH = vi.hoisted(() => ({ accessLevel: "edit", organizationId: "o1", isConsultant: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/vendors/ProjectVendorsPanel", () => ({ default: () => <div data-testid="project-vendors-panel" /> }));
vi.mock("@/components/vendors/VendorProposalImportDialog", () => ({ default: () => null }));
vi.mock("@/components/vendors/ManageCategoriesDialog", () => ({ default: () => null }));
vi.mock("@/components/vendors/VendorW9Panel", async (orig) => ({ ...(await orig<typeof import("@/components/vendors/VendorW9Panel")>()), default: () => null }));

const Where = () => <span data-testid="where">{useLocation().search}</span>;
const renderAt = (url: string) =>
  render(
    <TooltipProvider>{/* the real app provides this at its root */}
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/vendors" element={<><Vendors /><Where /></>} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
const clickTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("Vendors page — All Vendors / Project Vendors (feature turned on)", () => {
  beforeEach(() => { featureFlags.projectVendorManagement = true; });
  afterEach(() => { featureFlags.projectVendorManagement = false; });

  it("opens on the organization directory, with its own header buttons", async () => {
    renderAt("/vendors");
    expect(screen.getByRole("tab", { name: "All Vendors" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Organization-wide vendor directory.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pricing Library/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search vendors...")).toBeInTheDocument();
    expect(screen.queryByTestId("project-vendors-panel")).not.toBeInTheDocument();
  });

  it("switches to Project Vendors, recording it in the URL, and hides the directory's controls", async () => {
    renderAt("/vendors");
    clickTab("Project Vendors");
    expect(await screen.findByTestId("project-vendors-panel")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?view=project");
    expect(screen.queryByRole("button", { name: /Pricing Library/ })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search vendors...")).not.toBeInTheDocument();
    expect(screen.getByText("The vendor list each project picks payees from.")).toBeInTheDocument();
  });

  it("opens straight onto Project Vendors from a link, and All Vendors clears the param", async () => {
    renderAt("/vendors?view=project");
    expect(screen.getByRole("tab", { name: "Project Vendors" })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("project-vendors-panel")).toBeInTheDocument();
    clickTab("All Vendors");
    expect(await screen.findByPlaceholderText("Search vendors...")).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("");
  });

  it("still sends consultants and view-only users away from the page", () => {
    AUTH.isConsultant = true;
    try {
      renderAt("/vendors");
      expect(screen.getByText("dashboard")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Project Vendors" })).not.toBeInTheDocument();
    } finally { AUTH.isConsultant = false; }
    AUTH.accessLevel = "view";
    try {
      renderAt("/vendors");
      expect(screen.getAllByText("dashboard").length).toBeGreaterThan(0);
    } finally { AUTH.accessLevel = "edit"; }
  });
});

describe("Vendors page — Project Vendors turned off (the default)", () => {
  it("is just the organization directory: no tabs, no Project Vendors", () => {
    renderAt("/vendors");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Vendors")).not.toBeInTheDocument();
    expect(screen.getByText("Organization-wide vendor directory.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pricing Library/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search vendors...")).toBeInTheDocument();
  });

  it("an old ?view=project link just opens the directory", () => {
    renderAt("/vendors?view=project");
    expect(screen.queryByTestId("project-vendors-panel")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search vendors...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pricing Library/ })).toBeInTheDocument();
  });
});
