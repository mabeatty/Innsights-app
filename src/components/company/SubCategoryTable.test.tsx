import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SubCategoryTable, { displayAccountName } from "./SubCategoryTable";
import type { ExpenseDetailRow } from "@/hooks/useCompanyExpenseDetail";

const row = (account_name: string, month: string, amount: number): ExpenseDetailRow => ({ category_id: "c", account_name, month: `${month}-01`, amount });
const months = ["2026-01", "2026-02", "2026-03"];
const actuals = (a: number, b: number, c: number) => new Map([["2026-01", a], ["2026-02", b], ["2026-03", c]]);
const names = () => screen.getAllByTestId("subcategory-row").map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("SubCategoryTable", () => {
  it("lists the accounts biggest first, with QuickBooks account numbers stripped", () => {
    render(<SubCategoryTable months={months} categoryActuals={actuals(1000, 1000, 1000)} rows={[
      row("6018 Guaranteed Payments - Sachin Patel", "2026-01", 300), row("6018 Guaranteed Payments - Sachin Patel", "2026-02", 300), row("6018 Guaranteed Payments - Sachin Patel", "2026-03", 300),
      row("Regular Payroll", "2026-01", 700), row("Regular Payroll", "2026-02", 700), row("Regular Payroll", "2026-03", 700),
    ]} />);
    expect(names()).toEqual(["Regular Payroll", "Guaranteed Payments - Sachin Patel"]);
    const first = within(screen.getAllByTestId("subcategory-row")[0]).getAllByRole("cell").map((c) => c.textContent);
    expect(first).toEqual(["Regular Payroll", "$700", "$700", "$700", "$2,100"]);
  });

  it("shows only the closed months it's given, and — where an account has nothing", () => {
    render(<SubCategoryTable months={["2026-01", "2026-02"]} categoryActuals={actuals(100, 50, 0)} rows={[
      row("6501 Rent", "2026-01", 100), row("6503 Software", "2026-02", 50), row("6501 Rent", "2026-03", 999), // March isn't a closed month here
    ]} />);
    expect(screen.getByRole("columnheader", { name: "Feb 26" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Mar 26" })).not.toBeInTheDocument();
    const rent = screen.getAllByTestId("subcategory-row").find((r) => r.textContent?.includes("Rent"))!;
    expect(within(rent).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Rent", "$100", "—", "$100"]);
  });

  it("adds no difference row when the accounts add up to the category total", () => {
    render(<SubCategoryTable months={months} categoryActuals={actuals(100, 100, 100)} rows={months.map((m) => row("6501 Rent", m, 100))} />);
    expect(screen.queryByTestId("subcategory-difference")).not.toBeInTheDocument();
    expect(screen.queryByText(/don't add up to the category total/)).not.toBeInTheDocument();
  });

  it("shows the gap — and says why — when the accounts don't add up to the category total", () => {
    // category says 100/100/100; accounts add up to 100/100/150 in March (QuickBooks changed since the total was synced)
    render(<SubCategoryTable months={months} categoryActuals={actuals(100, 100, 100)} rows={[
      row("6501 Rent", "2026-01", 100), row("6501 Rent", "2026-02", 100), row("6501 Rent", "2026-03", 100), row("6503 Software", "2026-03", 50),
    ]} />);
    const diff = screen.getByTestId("subcategory-difference");
    expect(within(diff).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Difference vs. category total", "—", "—", "-$50", "-$50"]);
    expect(screen.getByText(/don't add up to the category total/)).toBeInTheDocument();
    expect(screen.getByText(/Difference = category total minus the accounts/)).toBeInTheDocument();
  });

  it("sub-dollar noise doesn't create a difference row", () => {
    render(<SubCategoryTable months={["2026-01"]} categoryActuals={new Map([["2026-01", 100]])} rows={[row("6501 Rent", "2026-01", 100.4)]} />);
    expect(screen.queryByTestId("subcategory-difference")).not.toBeInTheDocument();
  });

  it("handles empty and loading states", () => {
    const { rerender } = render(<SubCategoryTable months={months} categoryActuals={actuals(0, 0, 0)} rows={[]} />);
    expect(screen.getByText("No sub-category detail for this category.")).toBeInTheDocument();
    rerender(<SubCategoryTable months={months} categoryActuals={actuals(0, 0, 0)} rows={[]} loading />);
    expect(screen.getByText("Loading sub-categories…")).toBeInTheDocument();
  });

  it("displayAccountName only strips a leading account number", () => {
    expect(displayAccountName("6501 Rent")).toBe("Rent");
    expect(displayAccountName("401(K) Expense")).toBe("401(K) Expense"); // not a leading number + space
    expect(displayAccountName("Regular Payroll")).toBe("Regular Payroll");
  });
});
